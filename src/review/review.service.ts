import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Application } from '../applications/entities/application.entity';
import { ApplicationDocument } from '../applications/entities/document.entity';
import { Review } from '../applications/entities/review.entity';
import { ReviewScore } from '../applications/entities/review-score.entity';
import { setAuditInfo, setAuditMeta } from '../common/request-context';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { StorageService } from '../storage/storage.service';
import { RecruitmentService } from '../recruitment/recruitment.service';
import {
  ApplicationStatus,
  CRITERION_WEIGHTS,
  CriterionId,
  SCORE_MAX,
} from '../common/enums';
import { PutReviewDto, PutScoresDto } from './review.dto';
import { suggestDocumentScores } from './scoring.engine';
import { totalExperienceYears } from '../common/experience';

const CRITERIA_COUNT = Object.keys(CRITERION_WEIGHTS).length;

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

  /** True when reviewers may access applications (window closed or admin-unlocked). */
  private async isUnlocked(): Promise<{ unlocked: boolean; closeAt: Date }> {
    const cycle = await this.recruitment.getOrCreateActiveCycle();
    const unlocked = cycle.reviewUnlocked || Date.now() > new Date(cycle.submissionCloseAt).getTime();
    return { unlocked, closeAt: cycle.submissionCloseAt };
  }

  private async ensureUnlocked(): Promise<void> {
    const { unlocked } = await this.isUnlocked();
    if (!unlocked) {
      throw new ForbiddenException('Review opens after the application window closes');
    }
  }

  private pool(): Promise<Application[]> {
    return this.apps.find({
      where: { status: Not(ApplicationStatus.Draft) },
      relations: ['expertise', 'employment', 'boards'],
    });
  }

  private weighted(values: Map<CriterionId, number>): number {
    let total = 0;
    for (const [id, weight] of Object.entries(CRITERION_WEIGHTS) as [CriterionId, number][]) {
      const v = values.get(id) ?? 0;
      total += (v / SCORE_MAX) * weight;
    }
    return Math.round(total);
  }

  /** Reviewers may not change scores once they have submitted their assessment. */
  private async assertNotSubmitted(reviewerId: string, appId: string): Promise<void> {
    const review = await this.reviews.findOne({ where: { applicationId: appId, reviewerUserId: reviewerId } });
    if (review?.submitted) {
      throw new ForbiddenException('Your assessment has been submitted and can no longer be changed');
    }
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
    const { unlocked, closeAt } = await this.isUnlocked();
    const pool = await this.pool();
    if (!unlocked) {
      return { unlocked, closeAt, received: pool.length, toAssess: pool.length, reviewedByMe: 0, shortlisted: 0, criteriaCount: CRITERIA_COUNT };
    }
    const myReviews = await this.reviews.find({ where: { reviewerUserId: reviewerId } });
    const reviewedByMe = myReviews.filter((r) => r.submitted).length;
    const shortlisted = myReviews.filter((r) => r.shortlistRecommended).length;
    return {
      unlocked,
      closeAt,
      received: pool.length,
      toAssess: pool.length,
      reviewedByMe,
      shortlisted,
      criteriaCount: CRITERIA_COUNT,
    };
  }

  async list(reviewerId: string) {
    await this.ensureUnlocked();
    const pool = await this.pool();
    const myReviews = await this.reviews.find({
      where: { reviewerUserId: reviewerId, applicationId: In(pool.map((a) => a.id)) },
    });
    const byApp = new Map(myReviews.map((r) => [r.applicationId, r]));
    return pool.map((a) => {
      const r = byApp.get(a.id);
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
        myScore: r?.submitted ? Number(r.weightedScore) : null,
        mySubmitted: !!r?.submitted,
        myShortlist: !!r?.shortlistRecommended,
      };
    });
  }

  async dossier(reviewerId: string, id: string) {
    await this.ensureUnlocked();
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

    const sortByOrder = <T extends { sort?: number }>(rows: T[]) =>
      [...rows].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

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
      education: sortByOrder(app.education ?? []),
      professionalQuals: sortByOrder(app.professionalQuals ?? []),
      employment: sortByOrder(app.employment ?? []),
      boardEntries: sortByOrder(app.boards ?? []),
      references: sortByOrder(app.references ?? []).map((r) => ({
        name: r.name,
        positionOrg: r.positionOrg,
        relationship: r.relationship,
      })),
      conflictsText: app.conflictsText,
      declarations: app.declarations,
      documents: (app.documents ?? []).map((d) => ({ id: d.id, docType: d.docType, originalFilename: d.originalFilename })),
      recommendation,
      myScores,
      myReview: review
        ? { comment: review.comment, shortlistRecommended: review.shortlistRecommended, submitted: review.submitted, weightedScore: review.weightedScore }
        : { comment: '', shortlistRecommended: false, submitted: false, weightedScore: null },
    };
  }

  private deriveYearsPublic(app: Application): number | null {
    const employment = app.employment ?? [];
    return employment.length ? totalExperienceYears(employment) : null;
  }

  async putScores(reviewerId: string, id: string, dto: PutScoresDto) {
    await this.ensureUnlocked();
    await this.assertReviewable(id);
    await this.assertNotSubmitted(reviewerId, id);
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
    await this.ensureUnlocked();
    await this.assertReviewable(id);
    await this.assertNotSubmitted(reviewerId, id);
    const scoreRows = await this.scores.find({ where: { applicationId: id, reviewerUserId: reviewerId } });
    if (dto.submitted && scoreRows.length < CRITERIA_COUNT) {
      throw new BadRequestException('All criteria must be scored before submitting');
    }
    const review = await this.upsertReview(reviewerId, id);
    if (dto.comment !== undefined) review.comment = dto.comment;
    if (dto.shortlistRecommended !== undefined) review.shortlistRecommended = dto.shortlistRecommended;
    if (dto.submitted !== undefined) review.submitted = dto.submitted;
    review.weightedScore = String(this.weighted(new Map(scoreRows.map((s) => [s.criterionId, s.value]))));
    await this.reviews.save(review);
    setAuditInfo({ entityType: 'application', entityId: id });
    setAuditMeta({
      submitted: !!dto.submitted,
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
    const app = await this.apps.findOne({ where: { id } });
    if (!app || app.status === ApplicationStatus.Draft) {
      throw new NotFoundException('Application not found');
    }
  }

  private async upsertReview(reviewerId: string, id: string): Promise<Review> {
    let review = await this.reviews.findOne({ where: { applicationId: id, reviewerUserId: reviewerId } });
    if (!review) {
      review = this.reviews.create({ applicationId: id, reviewerUserId: reviewerId, submitted: false, shortlistRecommended: false });
    }
    return review;
  }

  private async recomputeReview(reviewerId: string, id: string): Promise<void> {
    const scoreRows = await this.scores.find({ where: { applicationId: id, reviewerUserId: reviewerId } });
    const review = await this.upsertReview(reviewerId, id);
    review.weightedScore = String(this.weighted(new Map(scoreRows.map((s) => [s.criterionId, s.value]))));
    await this.reviews.save(review);
  }
}
