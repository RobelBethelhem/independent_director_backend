import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Recommendation } from './recommendation.entity';
import { Application } from '../applications/entities/application.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RecruitmentService } from '../recruitment/recruitment.service';
import { ApplicationStatus } from '../common/enums';
import { CreateRecommendationDto } from './recommendations.dto';

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(Recommendation) private readonly recs: Repository<Recommendation>,
    @InjectRepository(Application) private readonly apps: Repository<Application>,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly recruitment: RecruitmentService,
    private readonly config: ConfigService,
  ) {}

  /** A recommender invites a candidate — creates the tracked link and emails them. */
  async create(recommenderUserId: string, dto: CreateRecommendationDto) {
    const recommender = await this.users.getByIdOrThrow(recommenderUserId);
    const cycle = await this.recruitment.getOrCreateActiveCycle();
    const token = randomBytes(24).toString('base64url');
    const rec = this.recs.create({
      recommenderUserId: recommender.id,
      recommenderName: recommender.name ?? recommender.email,
      recommenderEmail: recommender.email,
      candidateName: dto.candidateName.trim(),
      candidateEmail: dto.candidateEmail.trim().toLowerCase(),
      message: dto.message?.trim() || null,
      token,
      cycleId: cycle.id,
    });
    await this.recs.save(rec);

    const link = `${this.config.getOrThrow<string>('frontendOrigin')}/recommended/${token}`;
    void this.notifications
      .sendRecommendationInvite(rec.candidateEmail, rec.candidateName, rec.recommenderName, rec.message, link)
      .catch(() => undefined);

    return this.toMine(rec, null);
  }

  /** A recommender's own invitations, with live progress derived from any linked application. */
  async mine(recommenderUserId: string) {
    const rows = await this.recs.find({ where: { recommenderUserId }, order: { createdAt: 'DESC' } });
    const applicantIds = rows.map((r) => r.applicantUserId).filter((x): x is string => !!x);
    const apps = applicantIds.length ? await this.apps.find({ where: { applicantUserId: In(applicantIds) } }) : [];
    const statusByUser = new Map<string, ApplicationStatus>();
    for (const a of apps) {
      const cur = statusByUser.get(a.applicantUserId);
      // Prefer the most progressed (non-draft) application.
      if (!cur || cur === ApplicationStatus.Draft) statusByUser.set(a.applicantUserId, a.status);
    }
    return rows.map((r) => this.toMine(r, r.applicantUserId ? statusByUser.get(r.applicantUserId) ?? null : null));
  }

  private toMine(r: Recommendation, appStatus: ApplicationStatus | null) {
    let status: string;
    if (appStatus && appStatus !== ApplicationStatus.Draft) status = 'Submitted';
    else if (appStatus === ApplicationStatus.Draft) status = 'Applying';
    else if (r.applicantUserId) status = 'Registered';
    else if (r.clickedAt) status = 'Opened';
    else status = 'Invited';
    return {
      id: r.id,
      candidateName: r.candidateName,
      candidateEmail: r.candidateEmail,
      message: r.message,
      status,
      clickedAt: r.clickedAt,
      createdAt: r.createdAt,
      link: `/recommended/${r.token}`,
    };
  }

  /** Public — the landing page resolves the invite (and marks it opened). */
  async byToken(token: string) {
    const rec = await this.recs.findOne({ where: { token } });
    if (!rec) {
      throw new NotFoundException('This recommendation link is not valid or has expired.');
    }
    if (!rec.clickedAt) {
      rec.clickedAt = new Date();
      await this.recs.save(rec);
    }
    return {
      recommenderName: rec.recommenderName,
      candidateName: rec.candidateName,
      candidateEmail: rec.candidateEmail,
      message: rec.message,
    };
  }

  /** Link a newly-registered applicant back to the recommendation (called at register). */
  async linkToUser(token: string, applicantUserId: string): Promise<void> {
    const rec = await this.recs.findOne({ where: { token } });
    if (!rec || rec.applicantUserId) return;
    rec.applicantUserId = applicantUserId;
    if (!rec.clickedAt) rec.clickedAt = new Date();
    await this.recs.save(rec);
  }

  /** Who recommended this applicant (for reviewer dossier + admin detail), or null. */
  async forApplicant(applicantUserId: string | null | undefined) {
    if (!applicantUserId) return null;
    const rec = await this.recs.findOne({ where: { applicantUserId }, order: { createdAt: 'ASC' } });
    if (!rec) return null;
    return {
      recommendedBy: rec.recommenderName,
      recommenderEmail: rec.recommenderEmail,
      message: rec.message,
      recommendedAt: rec.createdAt,
    };
  }
}
