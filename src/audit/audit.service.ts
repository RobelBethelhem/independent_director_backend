import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, MoreThan, Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { UsersService } from '../users/users.service';
import { currentUser, requestContext } from '../common/request-context';

export interface AuditEntry {
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  outcome?: 'success' | 'failure';
  entityType?: string;
  entityId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export interface AuditQuery {
  page?: number;
  query?: string;
  action?: string;
  outcome?: string;
  actorRole?: string;
  from?: string;
  to?: string;
}

const PAGE_SIZE = 30;

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly logs: Repository<AuditLog>,
    private readonly users: UsersService,
  ) {}

  /**
   * Append an audit record. IP / user-agent / actor are auto-filled from the
   * async request-context when not supplied, so every call site is enriched.
   */
  async record(entry: AuditEntry): Promise<void> {
    const store = requestContext.getStore();
    const user = currentUser();
    const log = this.logs.create({
      actorUserId: entry.actorUserId ?? user?.id ?? null,
      actorEmail: entry.actorEmail ?? user?.email ?? null,
      actorRole: entry.actorRole ?? user?.role ?? null,
      action: entry.action,
      outcome: entry.outcome ?? 'success',
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      method: entry.method ?? store?.req?.method ?? null,
      path: entry.path ?? store?.req?.originalUrl ?? null,
      statusCode: entry.statusCode ?? null,
      metadata: entry.metadata ?? null,
      ip: entry.ip ?? store?.ip ?? null,
      userAgent: entry.userAgent ?? store?.userAgent ?? null,
    });
    await this.logs.save(log);
  }

  /** Paginated, filtered audit trail for the auditor/admin console. */
  async query(q: AuditQuery) {
    const page = Math.max(1, Number(q.page) || 1);
    const qb = this.logs.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');

    if (q.actorRole) qb.andWhere('a.actorRole = :role', { role: q.actorRole });
    if (q.outcome) qb.andWhere('a.outcome = :outcome', { outcome: q.outcome });
    if (q.action) qb.andWhere('a.action ILIKE :action', { action: `%${q.action}%` });
    if (q.from) qb.andWhere('a.createdAt >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('a.createdAt <= :to', { to: new Date(q.to) });
    if (q.query) {
      const like = `%${q.query}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('a.actorEmail ILIKE :like', { like })
            .orWhere('a.action ILIKE :like', { like })
            .orWhere('a.path ILIKE :like', { like })
            .orWhere('a.entityId ILIKE :like', { like })
            .orWhere('a.ip ILIKE :like', { like }),
        ),
      );
    }

    const [rows, total] = await qb
      .skip((page - 1) * PAGE_SIZE)
      .take(PAGE_SIZE)
      .getManyAndCount();

    const ids = Array.from(new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x)));
    const users = await this.users.findByIds(ids);
    const nameById = new Map(users.map((u) => [u.id, u.name ?? u.email]));

    return {
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        actorName: r.actorUserId ? nameById.get(r.actorUserId) ?? r.actorEmail : r.actorEmail,
        actorEmail: r.actorEmail,
        actorRole: r.actorRole,
        action: r.action,
        outcome: r.outcome,
        entityType: r.entityType,
        entityId: r.entityId,
        method: r.method,
        path: r.path,
        statusCode: r.statusCode,
        ip: r.ip,
        userAgent: r.userAgent,
        metadata: r.metadata,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /** Headline counts for the audit console. */
  async stats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total, failedLogins, last24h, distinct] = await Promise.all([
      this.logs.count(),
      this.logs.count({ where: { action: 'auth.login', outcome: 'failure' } }),
      this.logs.count({ where: { createdAt: MoreThan(since) } }),
      this.logs
        .createQueryBuilder('a')
        .select('COUNT(DISTINCT a.actorUserId)', 'c')
        .where('a.actorUserId IS NOT NULL')
        .getRawOne<{ c: string }>(),
    ]);
    return {
      total,
      failedLogins,
      last24h,
      distinctActors: Number(distinct?.c ?? 0),
    };
  }
}
