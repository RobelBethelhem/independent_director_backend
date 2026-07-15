import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RecruitmentCycle } from './recruitment-cycle.entity';

@Injectable()
export class RecruitmentService {
  constructor(
    @InjectRepository(RecruitmentCycle)
    private readonly cycles: Repository<RecruitmentCycle>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Returns the cycle currently accepting applications, creating a default one
   * in development if none exists. In production cycles are created by an admin.
   */
  async getOrCreateActiveCycle(): Promise<RecruitmentCycle> {
    const [existing] = await this.cycles.find({ order: { createdAt: 'DESC' }, take: 1 });
    if (existing) {
      return existing;
    }
    const now = new Date();
    const closeAt = new Date(now);
    closeAt.setMonth(closeAt.getMonth() + 2);
    // Review-close defaults to a month after applications close — not left
    // null, so a fresh install is never stuck permanently status-locked with
    // no path forward. Admin should still confirm/adjust it in Review Settings.
    const reviewCloseAt = new Date(closeAt);
    reviewCloseAt.setMonth(reviewCloseAt.getMonth() + 1);
    const cycle = this.cycles.create({
      title: `Independent Director Recruitment ${now.getFullYear()}`,
      position: 'Independent Director',
      opensAt: now,
      submissionCloseAt: closeAt,
      reviewCloseAt,
    });
    return this.cycles.save(cycle);
  }

  async getById(id: string): Promise<RecruitmentCycle> {
    const cycle = await this.cycles.findOne({ where: { id } });
    if (!cycle) {
      throw new NotFoundException('Recruitment cycle not found');
    }
    return cycle;
  }

  /** True while applications are still being accepted. */
  isAcceptingApplications(cycle: RecruitmentCycle): boolean {
    return Date.now() <= new Date(cycle.submissionCloseAt).getTime();
  }

  /** True while the review window is open for scoring — purely time-based,
   *  no manual override: opens automatically once applications close, and
   *  (if a review-close date is set) closes automatically at that date. A
   *  cycle with no reviewCloseAt yet is still open for scoring once
   *  applications close (just with no end date) — that's a DIFFERENT default
   *  from isStatusLocked below, deliberately: reviewers getting access is
   *  safe by default, admin being able to act on the outcome is not. */
  isReviewActive(cycle: RecruitmentCycle): boolean {
    const opened = !this.isAcceptingApplications(cycle);
    const ended = !!cycle.reviewCloseAt && Date.now() > new Date(cycle.reviewCloseAt).getTime();
    return opened && !ended;
  }

  /** True whenever admin status changes must stay locked: applications still
   *  open, OR review hasn't reached its close date yet, OR review-close was
   *  never configured at all (conservative until an admin sets it). Only
   *  false once a configured reviewCloseAt has actually passed. */
  isStatusLocked(cycle: RecruitmentCycle): boolean {
    if (!cycle.reviewCloseAt) return true;
    return Date.now() < new Date(cycle.reviewCloseAt).getTime();
  }

  /** Admin-editable cycle dates. Only touches the fields actually passed —
   *  either can be updated independently (e.g. extending reviewCloseAt alone).
   *  reviewCloseAt must always be after submissionCloseAt (checked against
   *  whichever value is in effect once this update applies). */
  async updateSettings(
    id: string,
    dto: { submissionCloseAt?: string; reviewCloseAt?: string },
  ): Promise<RecruitmentCycle> {
    const cycle = await this.getById(id);
    const nextSubmission = dto.submissionCloseAt ? new Date(dto.submissionCloseAt) : cycle.submissionCloseAt;
    const nextReview = dto.reviewCloseAt ? new Date(dto.reviewCloseAt) : cycle.reviewCloseAt;
    if (nextReview && nextReview.getTime() <= nextSubmission.getTime()) {
      throw new BadRequestException('The review-close date must be after the application-close date.');
    }
    if (dto.submissionCloseAt !== undefined) cycle.submissionCloseAt = nextSubmission;
    if (dto.reviewCloseAt !== undefined) cycle.reviewCloseAt = nextReview;
    return this.cycles.save(cycle);
  }

  /**
   * Atomically allocate the next zero-padded reference number for a cycle,
   * e.g. ZB-IDR-2026-0001. Uses a row-locking transaction to avoid collisions.
   */
  async allocateReference(cycleId: string): Promise<string> {
    return this.dataSource.transaction(async (tx) => {
      const repo = tx.getRepository(RecruitmentCycle);
      const cycle = await repo
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id: cycleId })
        .getOne();
      if (!cycle) {
        throw new NotFoundException('Recruitment cycle not found');
      }
      const next = cycle.referenceSeq + 1;
      cycle.referenceSeq = next;
      await repo.save(cycle);
      const year = cycle.opensAt.getFullYear();
      return `ZB-IDR-${year}-${String(next).padStart(4, '0')}`;
    });
  }
}
