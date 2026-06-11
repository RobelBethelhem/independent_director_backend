import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { Application } from '../applications/entities/application.entity';
import { ApplicationDocument } from '../applications/entities/document.entity';
import { Message } from '../applications/entities/message.entity';
import { Review } from '../applications/entities/review.entity';
import { ReviewScore } from '../applications/entities/review-score.entity';
import { AuditLog } from '../audit/audit-log.entity';
import { setAuditInfo, setAuditMeta } from '../common/request-context';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { RecruitmentService } from '../recruitment/recruitment.service';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { MIN_EXPERIENCE_YEARS, totalExperienceYears } from '../common/experience';
import { degreeLevel, MIN_DEGREE_LEVEL } from '../common/degree';
import {
  ApplicationStatus,
  CRITERION_WEIGHTS,
  CriterionId,
  SCORE_MAX,
  UserRole,
} from '../common/enums';
import {
  AdminListQueryDto,
  AdminSearchDto,
  CreateUserDto,
  SendMessageDto,
  UpdateStatusDto,
} from './admin.dto';

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  info_requested: 'Information Requested',
  shortlisted: 'Shortlisted',
  not_selected: 'Not Selected',
  selected: 'Selected',
};

/** Status that count as "in the pool" (everything an admin sees — not drafts). */
const POOL_STATUSES = Object.values(ApplicationStatus).filter((s) => s !== ApplicationStatus.Draft);

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Application) private readonly apps: Repository<Application>,
    @InjectRepository(ApplicationDocument) private readonly docs: Repository<ApplicationDocument>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(ReviewScore) private readonly reviewScores: Repository<ReviewScore>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly recruitment: RecruitmentService,
    private readonly recommendations: RecommendationsService,
  ) {}

  private async pool(): Promise<Application[]> {
    return this.apps.find({
      where: { status: Not(ApplicationStatus.Draft) },
      relations: ['expertise', 'employment', 'boards'],
    });
  }

  /** Average of submitted reviewers' weighted scores for an application, rounded. */
  private async scoresByApp(appIds: string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    if (appIds.length === 0) return out;
    const reviews = await this.reviews.find({
      where: { applicationId: In(appIds), submitted: true },
    });
    const byApp = new Map<string, number[]>();
    for (const r of reviews) {
      if (r.weightedScore == null) continue;
      const arr = byApp.get(r.applicationId) ?? [];
      arr.push(Number(r.weightedScore));
      byApp.set(r.applicationId, arr);
    }
    for (const id of appIds) {
      const arr = byApp.get(id);
      out.set(id, arr && arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
    }
    return out;
  }

  private deriveRole(app: Application): string {
    const current = (app.employment ?? []).find((e) => e.isCurrent) ?? (app.employment ?? [])[0];
    return current?.role || 'Independent Director candidate';
  }

  private deriveYears(app: Application): number | null {
    const employment = app.employment ?? [];
    return employment.length ? totalExperienceYears(employment) : null;
  }

  private toListItem(app: Application, score: number | null) {
    return {
      id: app.id,
      reference: app.reference,
      status: app.status,
      flags: app.flagsCount,
      title: app.title,
      firstName: app.firstName,
      middleName: app.middleName,
      lastName: app.lastName,
      country: app.country,
      city: app.city,
      role: this.deriveRole(app),
      expertise: (app.expertise ?? []).map((e) => e.value),
      boards: (app.boards ?? []).filter((b) => b.org).length,
      years: this.deriveYears(app),
      submittedAt: app.submittedAt,
      score,
    };
  }

  async list(q: AdminListQueryDto) {
    const pool = await this.pool();
    const scores = await this.scoresByApp(pool.map((a) => a.id));
    let items = pool.map((a) => this.toListItem(a, scores.get(a.id) ?? null));

    if (q.query) {
      const needle = q.query.toLowerCase();
      items = items.filter((a) =>
        [a.firstName, a.lastName, a.reference, a.country, a.role]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
    }
    if (q.status) {
      items = items.filter((a) => a.status === q.status);
    }
    const sort = q.sort ?? 'submitted';
    items.sort((a, b) => {
      if (sort === 'score') return (b.score ?? -1) - (a.score ?? -1);
      if (sort === 'name') return (a.lastName ?? '').localeCompare(b.lastName ?? '');
      return new Date(b.submittedAt ?? 0).getTime() - new Date(a.submittedAt ?? 0).getTime();
    });

    const page = q.page ?? 1;
    const total = items.length;
    const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return { items: paged, total, page, pageSize: PAGE_SIZE, poolTotal: pool.length };
  }

  /** All pool applications (no pagination) for the Kanban board. */
  async board() {
    const pool = await this.pool();
    const scores = await this.scoresByApp(pool.map((a) => a.id));
    return pool.map((a) => this.toListItem(a, scores.get(a.id) ?? null));
  }

  async stats() {
    const pool = await this.pool();
    return {
      total: pool.length,
      submitted: pool.filter((a) => a.submittedAt).length,
      review: pool.filter((a) => a.status === ApplicationStatus.UnderReview).length,
      short: pool.filter((a) => a.status === ApplicationStatus.Shortlisted).length,
      flags: pool.reduce((s, a) => s + (a.flagsCount || 0), 0),
    };
  }

  // ---- Reports / analytics ----

  private maxDegreeLevel(app: Application): number {
    return (app.education ?? []).reduce((m, e) => Math.max(m, degreeLevel(e.degree)), 0);
  }

  /** A comprehensive analytics snapshot of the recruitment pool. */
  async reports() {
    const apps = await this.apps.find({
      where: { status: Not(ApplicationStatus.Draft) },
      relations: ['expertise', 'employment', 'boards', 'education', 'declarations'],
    });
    const ids = apps.map((a) => a.id);
    const [scoreMap, submittedReviews, scoreRows, reviewers] = await Promise.all([
      this.scoresByApp(ids),
      this.reviews.find({ where: { submitted: true } }),
      this.reviewScores.find(),
      this.users.findByRole(UserRole.Reviewer),
    ]);
    const reviewerCount = reviewers.length;
    const total = apps.length;

    const statusCount = (s: ApplicationStatus) => apps.filter((a) => a.status === s).length;

    const scoredVals = ids
      .map((id) => scoreMap.get(id))
      .filter((v): v is number => typeof v === 'number');
    const avgScore = scoredVals.length
      ? Math.round(scoredVals.reduce((a, b) => a + b, 0) / scoredVals.length)
      : null;

    // Review coverage
    const subByApp = new Map<string, Review[]>();
    for (const r of submittedReviews) {
      const arr = subByApp.get(r.applicationId) ?? [];
      arr.push(r);
      subByApp.set(r.applicationId, arr);
    }
    let fully = 0;
    let partial = 0;
    let unreviewed = 0;
    for (const a of apps) {
      const n = subByApp.get(a.id)?.length ?? 0;
      if (reviewerCount > 0 && n >= reviewerCount) fully += 1;
      else if (n > 0) partial += 1;
      else unreviewed += 1;
    }

    // Submissions over time
    const dayMap = new Map<string, number>();
    for (const a of apps) {
      if (!a.submittedAt) continue;
      const d = new Date(a.submittedAt).toISOString().slice(0, 10);
      dayMap.set(d, (dayMap.get(d) ?? 0) + 1);
    }
    const submissionsByDay = Array.from(dayMap.entries())
      .sort((x, y) => x[0].localeCompare(y[0]))
      .map(([date, count]) => ({ date, count }));

    const tally = (key: (a: Application) => string) => {
      const m = new Map<string, number>();
      for (const a of apps) {
        const k = key(a);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return m;
    };
    const toSorted = (m: Map<string, number>, limit?: number) => {
      const arr = Array.from(m.entries())
        .sort((x, y) => y[1] - x[1])
        .map(([key, count]) => ({ key, count }));
      return limit ? arr.slice(0, limit) : arr;
    };

    const gender = toSorted(tally((a) => a.gender || 'Unspecified'));
    const countries = toSorted(tally((a) => a.country || 'Unknown'), 8);

    // Degree distribution
    const degLabels = ['None', 'Diploma', "Bachelor's", "Master's", 'Doctorate'];
    const degCounts = [0, 0, 0, 0, 0];
    for (const a of apps) degCounts[this.maxDegreeLevel(a)] += 1;
    const degrees = degLabels
      .map((label, i) => ({ key: label, count: degCounts[i] }))
      .filter((d) => d.count > 0)
      .reverse();

    // Experience buckets
    const expDefs = [
      { label: '< 10 yrs', min: 0, max: 9 },
      { label: '10–14 yrs', min: 10, max: 14 },
      { label: '15–19 yrs', min: 15, max: 19 },
      { label: '20+ yrs', min: 20, max: Infinity },
    ];
    const experienceBuckets = expDefs.map((b) => ({
      label: b.label,
      count: apps.filter((a) => {
        const y = this.deriveYears(a) ?? 0;
        return y >= b.min && y <= b.max;
      }).length,
    }));

    // Expertise coverage
    const expMap = new Map<string, number>();
    for (const a of apps) for (const e of a.expertise ?? []) expMap.set(e.value, (expMap.get(e.value) ?? 0) + 1);
    const expertise = toSorted(expMap);

    // Score distribution
    const scoreDefs = [
      { label: '80–100', min: 80, max: 100 },
      { label: '65–79', min: 65, max: 79 },
      { label: '50–64', min: 50, max: 64 },
      { label: '< 50', min: 0, max: 49 },
    ];
    const scoreDistribution = scoreDefs.map((b) => ({
      label: b.label,
      count: scoredVals.filter((v) => v >= b.min && v <= b.max).length,
    }));
    scoreDistribution.push({ label: 'Not scored', count: total - scoredVals.length });

    // Per-criterion averages (submitted reviews only)
    const submittedKeys = new Set(submittedReviews.map((r) => `${r.reviewerUserId}|${r.applicationId}`));
    const critSums = new Map<string, { sum: number; n: number }>();
    for (const s of scoreRows) {
      if (!submittedKeys.has(`${s.reviewerUserId}|${s.applicationId}`)) continue;
      const cur = critSums.get(s.criterionId) ?? { sum: 0, n: 0 };
      cur.sum += s.value;
      cur.n += 1;
      critSums.set(s.criterionId, cur);
    }
    const criteriaAverages = (Object.keys(CRITERION_WEIGHTS) as CriterionId[]).map((id) => {
      const c = critSums.get(id);
      return {
        criterionId: id,
        weight: CRITERION_WEIGHTS[id],
        max: SCORE_MAX,
        average: c && c.n ? Math.round((c.sum / c.n) * 10) / 10 : null,
      };
    });

    // Reviewer progress
    const reviewsByReviewer = new Map<string, Review[]>();
    for (const r of submittedReviews) {
      const arr = reviewsByReviewer.get(r.reviewerUserId) ?? [];
      arr.push(r);
      reviewsByReviewer.set(r.reviewerUserId, arr);
    }
    const reviewerProgress = reviewers.map((rv) => {
      const rs = reviewsByReviewer.get(rv.id) ?? [];
      const vals = rs.map((r) => Number(r.weightedScore)).filter((v) => !Number.isNaN(v));
      return {
        id: rv.id,
        name: rv.name ?? rv.email,
        submitted: rs.length,
        assigned: total,
        avgScore: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
        lastLoginAt: rv.lastLoginAt,
      };
    });

    // Flags breakdown
    const flagMap = new Map<string, number>();
    for (const a of apps)
      for (const d of a.declarations ?? []) if (d.answer === 'yes') flagMap.set(d.itemId, (flagMap.get(d.itemId) ?? 0) + 1);
    const flagsBreakdown = Array.from(flagMap.entries())
      .sort((x, y) => y[1] - x[1])
      .map(([itemId, count]) => ({ itemId, count }));

    // Eligibility (§4.1.1 + §4.1.2)
    const meetsMsc = apps.filter((a) => this.maxDegreeLevel(a) >= MIN_DEGREE_LEVEL).length;
    const meets10 = apps.filter((a) => (this.deriveYears(a) ?? 0) >= MIN_EXPERIENCE_YEARS).length;
    const meetsBoth = apps.filter(
      (a) => this.maxDegreeLevel(a) >= MIN_DEGREE_LEVEL && (this.deriveYears(a) ?? 0) >= MIN_EXPERIENCE_YEARS,
    ).length;

    return {
      kpis: {
        total,
        submitted: statusCount(ApplicationStatus.Submitted),
        underReview: statusCount(ApplicationStatus.UnderReview),
        infoRequested: statusCount(ApplicationStatus.InfoRequested),
        shortlisted: statusCount(ApplicationStatus.Shortlisted),
        selected: statusCount(ApplicationStatus.Selected),
        notSelected: statusCount(ApplicationStatus.NotSelected),
        withFlags: apps.filter((a) => (a.flagsCount || 0) > 0).length,
        avgScore,
        reviewedPct: total ? Math.round((fully / total) * 100) : 0,
        reviewersActive: reviewerProgress.filter((r) => r.submitted > 0).length,
        reviewerCount,
      },
      funnel: [
        { key: 'Submitted', count: total },
        { key: 'Reviewed', count: apps.filter((a) => a.status !== ApplicationStatus.Submitted).length },
        {
          key: 'Shortlisted',
          count: apps.filter(
            (a) => a.status === ApplicationStatus.Shortlisted || a.status === ApplicationStatus.Selected,
          ).length,
        },
        { key: 'Selected', count: statusCount(ApplicationStatus.Selected) },
      ],
      statusBreakdown: POOL_STATUSES.map((s) => ({
        key: STATUS_LABELS[s] ?? s,
        status: s,
        count: statusCount(s),
      })).filter((x) => x.count > 0),
      submissionsByDay,
      gender,
      countries,
      degrees,
      experienceBuckets,
      expertise,
      scoreDistribution,
      criteriaAverages,
      reviewerProgress,
      reviewCoverage: { fully, partial, unreviewed, reviewerCount },
      flagsBreakdown,
      eligibility: { total, meetsMsc, meets10yr: meets10, meetsBoth },
    };
  }

  // ---- Advanced search + export ----

  private async searchRows(q: AdminSearchDto) {
    const apps = await this.apps.find({
      where: { status: Not(ApplicationStatus.Draft) },
      relations: ['expertise', 'employment', 'boards', 'education'],
    });
    const scores = await this.scoresByApp(apps.map((a) => a.id));
    const submittedReviews = await this.reviews.find({ where: { submitted: true } });
    const reviewerCount = (await this.users.findByRole(UserRole.Reviewer)).length;
    const subByApp = new Map<string, Review[]>();
    for (const r of submittedReviews) {
      const arr = subByApp.get(r.applicationId) ?? [];
      arr.push(r);
      subByApp.set(r.applicationId, arr);
    }

    const statusSet = q.status ? new Set(q.status.split(',').filter(Boolean)) : null;
    const expertiseSet = q.expertise ? new Set(q.expertise.split(',').filter(Boolean)) : null;

    let rows = apps.map((a) => {
      const score = scores.get(a.id) ?? null;
      const years = this.deriveYears(a);
      const subs = subByApp.get(a.id) ?? [];
      const reviewState = reviewerCount > 0 && subs.length >= reviewerCount ? 'fully' : subs.length > 0 ? 'partial' : 'unreviewed';
      return {
        item: this.toListItem(a, score),
        score,
        years,
        maxDeg: this.maxDegreeLevel(a),
        reviewState,
        shortlist: subs.some((r) => r.shortlistRecommended),
        gender: a.gender,
      };
    });

    rows = rows.filter((r) => {
      const i = r.item;
      if (statusSet && !statusSet.has(i.status)) return false;
      if (q.query) {
        const n = q.query.toLowerCase();
        const hay = [i.firstName, i.lastName, i.reference, i.country, i.role].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(n)) return false;
      }
      if (q.scoreMin != null && (r.score == null || r.score < q.scoreMin)) return false;
      if (q.scoreMax != null && (r.score == null || r.score > q.scoreMax)) return false;
      if (q.yearsMin != null && (r.years == null || r.years < q.yearsMin)) return false;
      if (q.yearsMax != null && (r.years == null || r.years > q.yearsMax)) return false;
      if (q.degreeMin != null && r.maxDeg < q.degreeMin) return false;
      if (expertiseSet && !i.expertise.some((e) => expertiseSet.has(e))) return false;
      if (q.country && (i.country ?? '').toLowerCase() !== q.country.toLowerCase()) return false;
      if (q.gender && (r.gender ?? '') !== q.gender) return false;
      if (q.flagged === 'yes' && i.flags <= 0) return false;
      if (q.flagged === 'no' && i.flags > 0) return false;
      if (q.reviewState && r.reviewState !== q.reviewState) return false;
      if (q.shortlist === 'yes' && !r.shortlist) return false;
      if (q.submittedFrom && (!i.submittedAt || new Date(i.submittedAt) < new Date(q.submittedFrom))) return false;
      if (q.submittedTo && (!i.submittedAt || new Date(i.submittedAt) > new Date(`${q.submittedTo}T23:59:59`))) return false;
      return true;
    });

    const sort = q.sort ?? 'submitted';
    rows.sort((a, b) => {
      if (sort === 'score') return (b.score ?? -1) - (a.score ?? -1);
      if (sort === 'name') return (a.item.lastName ?? '').localeCompare(b.item.lastName ?? '');
      if (sort === 'years') return (b.years ?? -1) - (a.years ?? -1);
      if (sort === 'flags') return b.item.flags - a.item.flags;
      return new Date(b.item.submittedAt ?? 0).getTime() - new Date(a.item.submittedAt ?? 0).getTime();
    });
    return rows;
  }

  async search(q: AdminSearchDto) {
    const rows = await this.searchRows(q);
    const page = q.page ?? 1;
    const total = rows.length;
    const paged = rows
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      .map((r) => ({ ...r.item, reviewState: r.reviewState, shortlist: r.shortlist, gender: r.gender }));
    return { items: paged, total, page, pageSize: PAGE_SIZE };
  }

  async exportCsv(q: AdminSearchDto): Promise<string> {
    const rows = await this.searchRows(q);
    const header = [
      'Reference', 'First name', 'Middle name', 'Last name', 'Status', 'Country', 'City',
      'Current role', 'Years experience', 'Boards', 'Expertise', 'Flags', 'Score',
      'Review state', 'Shortlist recommended', 'Submitted at',
    ];
    const cell = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(',')];
    for (const r of rows) {
      const i = r.item;
      lines.push(
        [
          i.reference, i.firstName, i.middleName, i.lastName, i.status, i.country, i.city, i.role,
          i.years, i.boards, (i.expertise ?? []).join('; '), i.flags, i.score,
          r.reviewState, r.shortlist ? 'yes' : 'no',
          i.submittedAt ? new Date(i.submittedAt).toISOString() : '',
        ]
          .map(cell)
          .join(','),
      );
    }
    return lines.join('\n');
  }

  async detail(id: string) {
    const app = await this.apps.findOne({
      where: { id },
      relations: [
        'education',
        'professionalQuals',
        'employment',
        'boards',
        'expertise',
        'references',
        'declarations',
        'documents',
      ],
    });
    if (!app || app.status === ApplicationStatus.Draft) {
      throw new NotFoundException('Application not found');
    }
    const [scoreMap, messages, auditRows, evaluation, recommendation] = await Promise.all([
      this.scoresByApp([id]),
      this.messages.find({ where: { applicationId: id }, order: { sentAt: 'DESC' } }),
      this.audit.find({ where: { entityType: 'application', entityId: id }, order: { createdAt: 'DESC' } }),
      this.getEvaluation(id),
      this.recommendations.forApplicant(app.applicantUserId),
    ]);

    const activity = [
      ...auditRows.map((a) => ({
        action: a.action,
        at: a.createdAt,
        metadata: a.metadata,
      })),
      ...messages.map((m) => ({
        action: 'admin.message',
        at: m.sentAt,
        metadata: { template: m.template, subject: m.subject },
      })),
    ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());

    return {
      ...this.toListItem(app, scoreMap.get(id) ?? null),
      dob: app.dob,
      gender: app.gender,
      nationality: app.nationality,
      email: app.email,
      phone: app.phone,
      address: app.address,
      conflictsText: app.conflictsText,
      education: app.education,
      professionalQuals: app.professionalQuals,
      employment: app.employment,
      references: app.references,
      declarations: app.declarations,
      documents: (app.documents ?? []).map((d) => ({
        id: d.id,
        docType: d.docType,
        originalFilename: d.originalFilename,
        sizeBytes: d.sizeBytes,
        scannedClean: d.scannedClean,
      })),
      activity,
      evaluation,
      recommendation,
    };
  }

  async updateStatus(actorUserId: string, id: string, dto: UpdateStatusDto) {
    const app = await this.apps.findOne({ where: { id } });
    if (!app || app.status === ApplicationStatus.Draft) {
      throw new NotFoundException('Application not found');
    }
    const from = app.status;
    app.status = dto.status;
    await this.apps.save(app);
    setAuditInfo({ entityType: 'application', entityId: id });
    setAuditMeta({ from, to: dto.status });
    // Fire-and-forget so the UI (e.g. Kanban drag) responds instantly; email
    // delivery shouldn't block the status change.
    if (app.email) {
      void this.notifications
        .sendStatusUpdate(app.email, STATUS_LABELS[dto.status] ?? dto.status)
        .catch(() => undefined);
    }
    return { id, status: app.status };
  }

  async sendMessage(actorUserId: string, id: string, dto: SendMessageDto) {
    const app = await this.apps.findOne({ where: { id } });
    if (!app || app.status === ApplicationStatus.Draft) {
      throw new NotFoundException('Application not found');
    }
    const message = this.messages.create({
      applicationId: id,
      fromUserId: actorUserId,
      channel: dto.channel,
      template: dto.template,
      subject: dto.subject ?? null,
      body: dto.body,
      sentAt: new Date(),
    });
    await this.messages.save(message);
    setAuditInfo({ entityType: 'application', entityId: id });
    setAuditMeta({ template: dto.template, channel: dto.channel });
    if (app.email) {
      void this.notifications
        .sendMessageEmail(app.email, dto.subject ?? 'A message regarding your application', dto.body)
        .catch(() => undefined);
    }
    return { ok: true, id: message.id };
  }

  async downloadUrl(id: string, docId: string) {
    const doc = await this.docs.findOne({ where: { id: docId, applicationId: id } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return { url: await this.storage.presignDownload(doc.storageKey, doc.originalFilename) };
  }

  /** Inline URL for in-app preview (image/PDF viewer) in the admin drawer. */
  async previewUrl(id: string, docId: string) {
    const doc = await this.docs.findOne({ where: { id: docId, applicationId: id } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    const url = await this.storage.presignDownload(doc.storageKey, doc.originalFilename, 300, true);
    return { url, mimeType: doc.mimeType, filename: doc.originalFilename };
  }

  // ---- Reviewer / staff management ----

  async createUser(actorUserId: string, dto: CreateUserDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }
    const tempPassword = randomBytes(6).toString('base64url'); // ~8 chars
    const passwordHash = await argon2.hash(tempPassword);
    const user = await this.users.create({
      email: dto.email,
      name: dto.name,
      phone: dto.phone ?? null,
      passwordHash,
      role: dto.role,
      emailVerified: true, // admin-vouched account; no OTP needed
      mustChangePassword: true, // force a password change on first login
    });
    void this.notifications.sendCredentials(user.email, dto.role, tempPassword).catch(() => undefined);
    setAuditInfo({ entityType: 'user', entityId: user.id });
    setAuditMeta({ role: dto.role, createdEmail: user.email });
    // Return the temp password so the admin can hand it over securely (it is also
    // emailed). The new user must change it on first login.
    return { id: user.id, name: user.name, email: user.email, role: user.role, tempPassword };
  }

  async listAuditors() {
    return this.listStaff(UserRole.Auditor);
  }

  async listRecommenders() {
    return this.listStaff(UserRole.Recommender);
  }

  private async listStaff(role: UserRole) {
    const staff = await this.users.findByRole(role);
    return staff.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      status: a.status,
      lastLoginAt: a.lastLoginAt,
    }));
  }

  async listReviewers() {
    const reviewers = await this.users.findByRole(UserRole.Reviewer);
    const reviews = reviewers.length
      ? await this.reviews.find({ where: { reviewerUserId: In(reviewers.map((r) => r.id)) } })
      : [];
    const submitted = new Map<string, number>();
    for (const rv of reviews) {
      if (rv.submitted) submitted.set(rv.reviewerUserId, (submitted.get(rv.reviewerUserId) ?? 0) + 1);
    }
    return reviewers.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      status: r.status,
      lastLoginAt: r.lastLoginAt,
      reviewsSubmitted: submitted.get(r.id) ?? 0,
    }));
  }

  /** Aggregate of all reviewers' assessments for an application (admin view). */
  private async getEvaluation(appId: string) {
    const [reviews, scoreRows] = await Promise.all([
      this.reviews.find({ where: { applicationId: appId } }),
      this.reviewScores.find({ where: { applicationId: appId } }),
    ]);
    const reviewerUsers = await this.users.findByIds(
      Array.from(new Set([...reviews.map((r) => r.reviewerUserId), ...scoreRows.map((s) => s.reviewerUserId)])),
    );
    const nameById = new Map(reviewerUsers.map((u) => [u.id, u.name ?? u.email]));

    const scoresByReviewer = new Map<string, Record<string, number>>();
    for (const s of scoreRows) {
      const m = scoresByReviewer.get(s.reviewerUserId) ?? {};
      m[s.criterionId] = s.value;
      scoresByReviewer.set(s.reviewerUserId, m);
    }

    const reviewers = reviews.map((r) => ({
      name: nameById.get(r.reviewerUserId) ?? 'Reviewer',
      submitted: r.submitted,
      shortlistRecommended: r.shortlistRecommended,
      weightedScore: r.weightedScore != null ? Number(r.weightedScore) : null,
      scores: scoresByReviewer.get(r.reviewerUserId) ?? {},
    }));

    const submittedReviews = reviewers.filter((r) => r.submitted);
    const aggregateScore = submittedReviews.length
      ? Math.round(submittedReviews.reduce((a, r) => a + (r.weightedScore ?? 0), 0) / submittedReviews.length)
      : null;

    const criteria = (Object.keys(CRITERION_WEIGHTS) as CriterionId[]).map((id) => {
      const vals = submittedReviews.map((r) => r.scores[id]).filter((v): v is number => typeof v === 'number');
      const average = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
      return { criterionId: id, weight: CRITERION_WEIGHTS[id], max: SCORE_MAX, average };
    });

    return {
      reviewerCount: reviewers.length,
      submittedCount: submittedReviews.length,
      aggregateScore,
      criteria,
      reviewers,
    };
  }

  async openReview(actorUserId: string, cycleId: string) {
    const cycle = await this.recruitment.getById(cycleId);
    if (cycle.reviewUnlocked) {
      throw new ForbiddenException('Review window already open');
    }
    await this.apps.manager.update('recruitment_cycles', { id: cycleId }, { reviewUnlocked: true });
    setAuditInfo({ entityType: 'recruitment_cycle', entityId: cycleId });
    return { id: cycleId, reviewUnlocked: true };
  }
}
