import { Injectable, NotFoundException } from '@nestjs/common';
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
    const cycle = this.cycles.create({
      title: `Independent Director Recruitment ${now.getFullYear()}`,
      position: 'Independent Director',
      opensAt: now,
      submissionCloseAt: closeAt,
      reviewUnlocked: false,
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
