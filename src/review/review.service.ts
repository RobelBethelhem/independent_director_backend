import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Application } from '../applications/entities/application.entity';
import { ApplicationDocument } from '../applications/entities/document.entity';
import { isDocumentDone, Review } from '../applications/entities/review.entity';
import { ReviewScore } from '../applications/entities/review-score.entity';
import { setAuditInfo, setAuditMeta } from '../common/request-context';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { StorageService } from '../storage/storage.service';
import { RecruitmentService } from '../recruitment/recruitment.service';
import {
  ApplicationStatus,
  CRITERION_GROUP,
  CRITERION_WEIGHTS,
  CriterionId,
  DOCUMENT_CRITERIA,
  DocType,
  INTERVIEW_CRITERIA,
  SCORE_MAX,
} from '../common/enums';
import type { RecruitmentCycle } from '../recruitment/recruitment-cycle.entity';
import { PutReviewDto, PutScoresDto } from './review.dto';
import { suggestDocumentScores } from './scoring.engine';
import { totalExperienceYears } from '../common/experience';

const CRITERIA_COUNT = Object.keys(CRITERION_WEIGHTS).length;
const DOC_COUNT = DOCUMENT_CRITERIA.length;

type Stage = 'document' | 'interview';

interface Phases {
  cycle: RecruitmentCycle;
  /** Stage 1 window: applications closed → review-close date. */
  docOpen: boolean;
  /** Stage 2: interview period has ended → interview scoring + final submit. */
  interviewOpen: boolean;
  unlocked: boolean;
  /** Document review closed and interview scoring not (yet) open. */
  ended: boolean;
}

/** Points (to one decimal) earned on a set of criteria — Σ value/10 × weight. */
function points(values: Map<string, number>, criteria: CriterionId[]): number {
  let total = 0;
  for (const id of criteria) total += ((values.get(id) ?? 0) / SCORE_MAX) * CRITERION_WEIGHTS[id];
  return Math.round(total * 10) / 10;
}

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Application) private readonly apps: Repository<Application>,
    @InjectRepository(ApplicationDocument) private readonly docs: Repository<ApplicationDocument>,
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(ReviewScore) private readonly scores: Repository<ReviewScore>,
    private readonly recruitment: RecruitmentService,
    private readonly storage: StorageService,
    private readonly recommendations: RecommendationsService,
  ) {}

  /** Which review stages are open right now (purely date-driven). */
  private async phases(): Promise<Phases> {
    const cycle = await this.recruitment.getOrCreateActiveCycle();
    const docOpen = this.recruitment.isReviewActive(cycle);
    const interviewOpen = this.recruitment.isInterviewScoringOpen(cycle);
    const docEnded = !!cycle.reviewCloseAt && Date.now() > new Date(cycle.reviewCloseAt).getTime();
    return { cycle, docOpen, interviewOpen, unlocked: docOpen || interviewOpen, ended: docEnded && !interviewOpen };
  }

  private async ensureUnlocked(): Promise<Phases> {
    const p = await this.phases();
    if (!p.unlocked) {
      const ivPending = !!p.cycle.interviewEndAt && Date.now() < new Date(p.cycle.interviewEndAt).getTime();
      throw new ForbiddenException(
        p.ended
          ? ivPending
            ? 'Document review has closed — interview scoring opens once the interview period ends'
            : 'The review period has ended'
          : 'Review opens after the application window closes',
      );
    }
    return p;
  }

  /** What this reviewer may edit on this application right now. Stage 1 is
   *  the Document Evaluation; stage 2 (interview-listed candidates only, once
   *  the interview period has ended) adds the Interview scores + final submit.
   *  A reviewer who missed stage 1 can still score both parts at stage 2. */
  private access(p: Phases, app: Application, review: Review | null | undefined) {
    const docDone = isDocumentDone(review);
    const final = !!review?.submitted;
    const selected = !!app.interviewSelected;
    const canEditInterview = !final && p.interviewOpen && selected;
    const canEditDocument = !docDone && !final && (p.docOpen || canEditInterview);
    const stage: Stage = p.interviewOpen && selected ? 'interview' : 'document';
    const interviewBlockedReason = final
      ? 'Your assessment is final and can no longer be changed'
      : !selected
        ? 'This candidate is not on the interview list'
        : 'Interview scoring opens once the interview period ends';
    return { docDone, final, selected, canEditDocument, canEditInterview, stage, interviewBlockedReason };
  }

  /** Recompute the stage points + running total from the reviewer's scores. */
  private applyScores(review: Review, values: Map<string, number>): void {
    const doc = points(values, DOCUMENT_CRITERIA);
    const hasInterview = INTERVIEW_CRITERIA.some((c) => values.has(c));
    const iv = hasInterview ? points(values, INTERVIEW_CRITERIA) : 0;
    review.documentScore = String(doc);
    review.interviewScore = hasInterview ? String(iv) : null;
    // Final totals are whole numbers (as before); in-progress totals keep a decimal.
    review.weightedScore = String(review.submitted ? Math.round(doc + iv) : Math.round((doc + iv) * 10) / 10);
  }

  private pool(): Promise<Application[]> {
    return this.apps.find({
      where: { status: Not(ApplicationStatus.Draft) },
      relations: ['expertise', 'employment', 'boards'],
    });
  }

  /** Smart auto-suggested scores for the document-evaluation criteria. */
  async suggestedScores(id: string) {
    await this.ensureUnlocked();
    const app = await this.apps.findOne({
      where: { id, status: Not(ApplicationStatus.Draft) },
      relations: ['education', 'professionalQuals', 'employment', 'boards', 'expertise', 'references'],
    });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    return suggestDocumentScores(app);
  }

  private deriveRole(app: Application): string {
    const current = (app.employment ?? []).find((e) => e.isCurrent) ?? (app.employment ?? [])[0];
    return current?.role || 'Independent Director candidate';
  }

  async overview(reviewerId: string) {
    const p = await this.phases();
    const pool = await this.pool();
    const base = {
      unlocked: p.unlocked,
      docOpen: p.docOpen,
      interviewOpen: p.interviewOpen,
      closeAt: p.cycle.submissionCloseAt,
      reviewCloseAt: p.cycle.reviewCloseAt,
      interviewStartAt: p.cycle.interviewStartAt,
      interviewEndAt: p.cycle.interviewEndAt,
      ended: p.ended,
      received: pool.length,
      toAssess: pool.length,
      interviewCandidates: pool.filter((a) => a.interviewSelected).length,
      criteriaCount: CRITERIA_COUNT,
    };
    if (!p.unlocked) {
      return { ...base, reviewedByMe: 0, documentDoneByMe: 0, shortlisted: 0 };
    }
    const myReviews = await this.reviews.find({ where: { reviewerUserId: reviewerId } });
    return {
      ...base,
      reviewedByMe: myReviews.filter((r) => r.submitted).length,
      documentDoneByMe: myReviews.filter((r) => isDocumentDone(r)).length,
      shortlisted: myReviews.filter((r) => r.shortlistRecommended).length,
    };
  }

  async list(reviewerId: string) {
    const p = await this.ensureUnlocked();
    const pool = await this.pool();
    const poolIds = pool.map((a) => a.id);
    const [myReviews, myScores] = await Promise.all([
      this.reviews.find({ where: { reviewerUserId: reviewerId, applicationId: In(poolIds) } }),
      this.scores.find({ where: { reviewerUserId: reviewerId, applicationId: In(poolIds) } }),
    ]);
    const byApp = new Map(myReviews.map((r) => [r.applicationId, r]));
    const valuesByApp = new Map<string, Map<string, number>>();
    for (const sc of myScores) {
      const m = valuesByApp.get(sc.applicationId) ?? new Map<string, number>();
      m.set(sc.criterionId, sc.value);
      valuesByApp.set(sc.applicationId, m);
    }
    return pool.map((a) => {
      const r = byApp.get(a.id);
      const vals = valuesByApp.get(a.id) ?? new Map<string, number>();
      const acc = this.access(p, a, r);
      const docScored = DOCUMENT_CRITERIA.filter((c) => vals.has(c)).length;
      const ivScored = INTERVIEW_CRITERIA.filter((c) => vals.has(c)).length;
      // Status is relative to the stage this candidate is in for the reviewer:
      // none = not started · draft = scored/saved, not submitted · submitted = stage done.
      const myStatus: 'none' | 'draft' | 'submitted' =
        acc.stage === 'interview'
          ? acc.final
            ? 'submitted'
            : ivScored > 0
              ? 'draft'
              : 'none'
          : acc.docDone
            ? 'submitted'
            : docScored > 0 || r
              ? 'draft'
              : 'none';
      return {
        id: a.id,
        reference: a.reference,
        title: a.title,
        firstName: a.firstName,
        middleName: a.middleName,
        lastName: a.lastName,
        role: this.deriveRole(a),
        expertise: (a.expertise ?? []).map((e) => e.value),
        flags: a.flagsCount,
        stage: acc.stage,
        interviewSelected: acc.selected,
        myDocSubmitted: acc.docDone,
        myFinalSubmitted: acc.final,
        myDocScore: acc.docDone ? Number(r?.documentScore ?? points(vals, DOCUMENT_CRITERIA)) : null,
        myScore: acc.final && r?.weightedScore != null ? Number(r.weightedScore) : null,
        mySubmitted: myStatus === 'submitted',
        myStatus,
        myScoredCount: acc.stage === 'interview' ? vals.size : docScored,
        stageTotal: acc.stage === 'interview' ? CRITERIA_COUNT : DOC_COUNT,
        myShortlist: !!r?.shortlistRecommended,
      };
    });
  }

  /** Bulk-submit every fully-scored draft for the stage each candidate is in:
   *  Document Evaluation (all 5 document criteria) or — for interview-listed
   *  candidates once interview scoring is open — the final submission (all 8).
   *  Incomplete drafts are skipped and returned so the reviewer can finish them. */
  async submitAll(reviewerId: string) {
    const p = await this.ensureUnlocked();
    const pool = await this.pool();
    const poolIds = pool.map((a) => a.id);
    const [reviews, scoreRows] = await Promise.all([
      this.reviews.find({ where: { reviewerUserId: reviewerId, applicationId: In(poolIds) } }),
      this.scores.find({ where: { reviewerUserId: reviewerId, applicationId: In(poolIds) } }),
    ]);
    const reviewByApp = new Map(reviews.map((r) => [r.applicationId, r]));
    const valuesByApp = new Map<string, Map<string, number>>();
    for (const sc of scoreRows) {
      const m = valuesByApp.get(sc.applicationId) ?? new Map<string, number>();
      m.set(sc.criterionId, sc.value);
      valuesByApp.set(sc.applicationId, m);
    }
    const nameOf = (a: Application) =>
      [a.title, a.firstName, a.lastName].filter(Boolean).join(' ') || a.reference || a.id;

    const submittedIds: string[] = [];
    let documentSubmitted = 0;
    let finalSubmitted = 0;
    const skipped: { id: string; name: string; scored: number; total: number }[] = [];

    for (const a of pool) {
      const r = reviewByApp.get(a.id);
      const vals = valuesByApp.get(a.id) ?? new Map<string, number>();
      const acc = this.access(p, a, r);
      if (acc.stage === 'interview') {
        if (!acc.canEditInterview) continue;
        const ivScored = INTERVIEW_CRITERIA.filter((c) => vals.has(c)).length;
        if (ivScored === 0) continue; // not started on the interview part
        if (vals.size < CRITERIA_COUNT) {
          skipped.push({ id: a.id, name: nameOf(a), scored: vals.size, total: CRITERIA_COUNT });
          continue;
        }
        const review = await this.upsertReview(reviewerId, a.id);
        review.documentSubmitted = true;
        review.submitted = true;
        this.applyScores(review, vals);
        await this.reviews.save(review);
        submittedIds.push(a.id);
        finalSubmitted += 1;
      } else {
        if (!acc.canEditDocument) continue;
        const docScored = DOCUMENT_CRITERIA.filter((c) => vals.has(c)).length;
        if (docScored === 0) continue; // not started
        if (docScored < DOC_COUNT) {
          skipped.push({ id: a.id, name: nameOf(a), scored: docScored, total: DOC_COUNT });
          continue;
        }
        const review = await this.upsertReview(reviewerId, a.id);
        review.documentSubmitted = true;
        this.applyScores(review, vals);
        await this.reviews.save(review);
        submittedIds.push(a.id);
        documentSubmitted += 1;
      }
    }

    setAuditInfo({ entityType: 'review' });
    setAuditMeta({
      submittedCount: submittedIds.length,
      documentSubmitted,
      finalSubmitted,
      skippedCount: skipped.length,
      applicationIds: submittedIds,
    });
    return { submitted: submittedIds.length, documentSubmitted, finalSubmitted, skipped };
  }

  async dossier(reviewerId: string, id: string) {
    const p = await this.ensureUnlocked();
    const app = await this.apps.findOne({
      where: { id, status: Not(ApplicationStatus.Draft) },
      relations: ['education', 'professionalQuals', 'employment', 'boards', 'expertise', 'references', 'declarations', 'documents'],
    });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    const [review, scoreRows, recommendation] = await Promise.all([
      this.reviews.findOne({ where: { applicationId: id, reviewerUserId: reviewerId } }),
      this.scores.find({ where: { applicationId: id, reviewerUserId: reviewerId } }),
      this.recommendations.forApplicant(app.applicantUserId),
    ]);
    const myScores: Record<string, number> = {};
    for (const s of scoreRows) myScores[s.criterionId] = s.value;
    const acc = this.access(p, app, review);

    const sortByOrder = <T extends { sort?: number }>(rows: T[]) =>
      [...rows].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

    const allDocs = app.documents ?? [];
    const docOut = (d: ApplicationDocument) => ({ id: d.id, originalFilename: d.originalFilename });
    const eduDocFor = (entryId: string) => {
      const d = allDocs.find((x) => x.docType === DocType.Edu && x.educationEntryId === entryId);
      return d ? docOut(d) : null;
    };
    const workDocFor = (entryId: string) => {
      const d = allDocs.find((x) => x.docType === DocType.Work && x.employmentEntryId === entryId);
      return d ? docOut(d) : null;
    };
    const photoDoc = allDocs.find((d) => d.docType === DocType.Photo);
    // The generic Documents tab excludes the photo + entry-linked files (shown inline).
    const genericDocs = allDocs.filter(
      (d) => d.docType !== DocType.Photo && !d.educationEntryId && !d.employmentEntryId,
    );

    return {
      id: app.id,
      reference: app.reference,
      title: app.title,
      firstName: app.firstName,
      middleName: app.middleName,
      lastName: app.lastName,
      role: this.deriveRole(app),
      // Personal (no direct contact details — reviewers assess on merit).
      dob: app.dob,
      gender: app.gender,
      nationality: app.nationality,
      city: app.city,
      country: app.country,
      years: this.deriveYearsPublic(app),
      boards: (app.boards ?? []).filter((b) => b.org).length,
      flags: app.flagsCount,
      expertise: (app.expertise ?? []).map((e) => e.value),
      photo: photoDoc ? docOut(photoDoc) : null,
      education: sortByOrder(app.education ?? []).map((ed) => ({
        id: ed.id,
        degree: ed.degree,
        field: ed.field,
        institution: ed.institution,
        year: ed.year,
        document: eduDocFor(ed.id),
      })),
      professionalQuals: sortByOrder(app.professionalQuals ?? []),
      employment: sortByOrder(app.employment ?? []).map((em) => ({
        id: em.id,
        org: em.org,
        role: em.role,
        fromMonth: em.fromMonth,
        toMonth: em.toMonth,
        isCurrent: em.isCurrent,
        summary: em.summary,
        document: workDocFor(em.id),
      })),
      boardEntries: sortByOrder(app.boards ?? []),
      references: sortByOrder(app.references ?? []).map((r) => ({
        name: r.name,
        positionOrg: r.positionOrg,
        relationship: r.relationship,
      })),
      conflictsText: app.conflictsText,
      declarations: app.declarations,
      documents: genericDocs.map((d) => ({ id: d.id, docType: d.docType, originalFilename: d.originalFilename })),
      recommendation,
      myScores,
      myReview: review
        ? {
            comment: review.comment,
            shortlistRecommended: review.shortlistRecommended,
            submitted: review.submitted,
            documentSubmitted: acc.docDone,
            weightedScore: review.weightedScore,
            documentScore: review.documentScore,
            interviewScore: review.interviewScore,
          }
        : {
            comment: '',
            shortlistRecommended: false,
            submitted: false,
            documentSubmitted: false,
            weightedScore: null,
            documentScore: null,
            interviewScore: null,
          },
      // Two-stage review state for this reviewer + candidate.
      stage: acc.stage,
      interviewSelected: acc.selected,
      canEditDocument: acc.canEditDocument,
      canEditInterview: acc.canEditInterview,
      interviewBlockedReason: acc.canEditInterview ? null : acc.interviewBlockedReason,
      docOpen: p.docOpen,
      interviewOpen: p.interviewOpen,
      interviewStartAt: p.cycle.interviewStartAt,
      interviewEndAt: p.cycle.interviewEndAt,
    };
  }

  private deriveYearsPublic(app: Application): number | null {
    const employment = app.employment ?? [];
    return employment.length ? totalExperienceYears(employment) : null;
  }

  async putScores(reviewerId: string, id: string, dto: PutScoresDto) {
    const p = await this.ensureUnlocked();
    const app = await this.reviewableApp(id);
    const review = await this.reviews.findOne({ where: { applicationId: id, reviewerUserId: reviewerId } });
    const acc = this.access(p, app, review);
    for (const sc of dto.scores) {
      if (CRITERION_GROUP[sc.criterionId] === 'document' && !acc.canEditDocument) {
        throw new ForbiddenException(
          acc.docDone
            ? 'Your Document Evaluation has been submitted and can no longer be changed'
            : 'Document scoring is closed',
        );
      }
      if (CRITERION_GROUP[sc.criterionId] === 'interview' && !acc.canEditInterview) {
        throw new ForbiddenException(acc.interviewBlockedReason);
      }
    }
    if (dto.scores.length) {
      await this.scores.upsert(
        dto.scores.map((s) => ({
          applicationId: id,
          reviewerUserId: reviewerId,
          criterionId: s.criterionId,
          value: s.value,
        })),
        ['applicationId', 'reviewerUserId', 'criterionId'],
      );
    }
    await this.recomputeReview(reviewerId, id);
    return this.dossier(reviewerId, id);
  }

  async putReview(reviewerId: string, id: string, dto: PutReviewDto) {
    const p = await this.ensureUnlocked();
    const app = await this.reviewableApp(id);
    const existing = await this.reviews.findOne({ where: { applicationId: id, reviewerUserId: reviewerId } });
    const acc = this.access(p, app, existing);
    if (!acc.canEditDocument && !acc.canEditInterview) {
      throw new ForbiddenException(
        acc.final
          ? 'Your assessment has been submitted and can no longer be changed'
          : acc.docDone
            ? `Your Document Evaluation is submitted. ${acc.interviewBlockedReason}.`
            : 'Scoring is closed for this candidate',
      );
    }
    const scoreRows = await this.scores.find({ where: { applicationId: id, reviewerUserId: reviewerId } });
    const values = new Map<string, number>(scoreRows.map((s) => [s.criterionId, s.value]));

    if (dto.submitDocument) {
      if (!acc.canEditDocument) {
        throw new ForbiddenException('Your Document Evaluation has already been submitted');
      }
      if (DOCUMENT_CRITERIA.some((c) => !values.has(c))) {
        throw new BadRequestException('Score all 5 Document Evaluation criteria before submitting');
      }
    }
    if (dto.submitted) {
      if (!acc.canEditInterview) {
        throw new ForbiddenException(acc.interviewBlockedReason);
      }
      if (values.size < CRITERIA_COUNT) {
        throw new BadRequestException('Score every criterion (Document and Interview) before the final submission');
      }
    }

    const review = await this.upsertReview(reviewerId, id);
    if (dto.comment !== undefined) review.comment = dto.comment;
    if (dto.shortlistRecommended !== undefined) review.shortlistRecommended = dto.shortlistRecommended;
    if (dto.submitDocument || dto.submitted) review.documentSubmitted = true;
    if (dto.submitted) review.submitted = true;
    this.applyScores(review, values);
    await this.reviews.save(review);
    setAuditInfo({ entityType: 'application', entityId: id });
    setAuditMeta({
      stage: dto.submitted ? 'final' : dto.submitDocument ? 'document' : 'draft',
      submitted: !!dto.submitted,
      documentSubmitted: !!(dto.submitDocument || dto.submitted),
      documentScore: review.documentScore,
      weightedScore: review.weightedScore,
      shortlist: review.shortlistRecommended,
    });
    return this.dossier(reviewerId, id);
  }

  async shortlist(reviewerId: string) {
    await this.ensureUnlocked();
    const reviews = await this.reviews.find({ where: { reviewerUserId: reviewerId, shortlistRecommended: true } });
    const apps = await this.apps.find({ where: { id: In(reviews.map((r) => r.applicationId).concat('00000000-0000-0000-0000-000000000000')) }, relations: ['expertise'] });
    const byId = new Map(apps.map((a) => [a.id, a]));
    return reviews
      .map((r) => {
        const a = byId.get(r.applicationId);
        if (!a) return null;
        return {
          id: a.id,
          reference: a.reference,
          name: [a.title, a.firstName, a.lastName].filter(Boolean).join(' '),
          weightedScore: r.weightedScore ? Number(r.weightedScore) : null,
          expertise: (a.expertise ?? []).map((e) => e.value),
        };
      })
      .filter(Boolean);
  }

  /** Read a submitted application's document (reviewers may view all dossiers). */
  private async docInPool(appId: string, docId: string): Promise<ApplicationDocument> {
    await this.assertReviewable(appId);
    const doc = await this.docs.findOne({ where: { id: docId, applicationId: appId } });
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    // Never hand a not-yet-scanned file to the review committee.
    if (!doc.scannedClean) {
      throw new ConflictException('This document is still being processed.');
    }
    return doc;
  }

  async previewDocument(appId: string, docId: string) {
    await this.ensureUnlocked();
    const doc = await this.docInPool(appId, docId);
    const url = await this.storage.presignDownload(doc.storageKey, doc.originalFilename, 300, true);
    return { url, mimeType: doc.mimeType, filename: doc.originalFilename };
  }

  async downloadDocument(appId: string, docId: string) {
    await this.ensureUnlocked();
    const doc = await this.docInPool(appId, docId);
    return { url: await this.storage.presignDownload(doc.storageKey, doc.originalFilename) };
  }

  // ---- helpers ----
  private async assertReviewable(id: string): Promise<void> {
    await this.reviewableApp(id);
  }

  private async reviewableApp(id: string): Promise<Application> {
    const app = await this.apps.findOne({ where: { id } });
    if (!app || app.status === ApplicationStatus.Draft) {
      throw new NotFoundException('Application not found');
    }
    return app;
  }

  private async upsertReview(reviewerId: string, id: string): Promise<Review> {
    let review = await this.reviews.findOne({ where: { applicationId: id, reviewerUserId: reviewerId } });
    if (!review) {
      review = this.reviews.create({
        applicationId: id,
        reviewerUserId: reviewerId,
        submitted: false,
        documentSubmitted: false,
        shortlistRecommended: false,
      });
    }
    return review;
  }

  private async recomputeReview(reviewerId: string, id: string): Promise<void> {
    const scoreRows = await this.scores.find({ where: { applicationId: id, reviewerUserId: reviewerId } });
    const review = await this.upsertReview(reviewerId, id);
    this.applyScores(review, new Map(scoreRows.map((s) => [s.criterionId, s.value])));
    await this.reviews.save(review);
  }
}
