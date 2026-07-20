import { ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockedIp } from './blocked-ip.entity';
import { AuditService } from '../audit/audit.service';
import { requestContext } from '../common/request-context';

/**
 * Server-side IP blocklist. Admins add/remove entries (see AdminController →
 * "Blocked IPs"); a blocked IP is denied at every auth entry point. Purely
 * server-enforced — there is deliberately no client-side "inspection detection"
 * feeding it, since a client-reported signal is both trivially bypassable and a
 * false-positive risk (security must never depend on the browser environment).
 */
@Injectable()
export class SecurityService implements OnModuleInit {
  private readonly logger = new Logger(SecurityService.name);
  /** In-memory mirror of the blocklist for O(1) checks on the hot path. */
  private readonly blocked = new Set<string>();
  private readonly allowlist: Set<string>;

  constructor(
    @InjectRepository(BlockedIp)
    private readonly repo: Repository<BlockedIp>,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.allowlist = new Set(
      (config.get<string[]>('security.ipAllowlist') ?? []).map((ip) => this.normalize(ip)),
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      const rows = await this.repo.find();
      for (const r of rows) this.blocked.add(this.normalize(r.ip));
      if (rows.length) this.logger.log(`Loaded ${rows.length} blocked IP(s)`);
    } catch (err) {
      // Table may not exist yet on very first boot before sync — don't crash.
      this.logger.warn(`Could not load blocklist: ${(err as Error).message}`);
    }
  }

  /** IPv4-mapped IPv6 (::ffff:1.2.3.4) → 1.2.3.4 so allowlist/blocklist compare cleanly. */
  private normalize(ip: string | null | undefined): string {
    if (!ip) return '';
    return ip.replace(/^::ffff:/i, '').trim();
  }

  /** The trusted client IP for the current request (Express computes this from
   *  X-Forwarded-For under `trust proxy = 1`, so it can't be spoofed by the
   *  client — unlike the leftmost XFF value used for audit display). */
  private currentIp(): string {
    const req = requestContext.getStore()?.req as { ip?: string } | undefined;
    return this.normalize(req?.ip ?? null);
  }

  private isAllowlisted(ip: string): boolean {
    return this.allowlist.has(ip);
  }

  isBlocked(ip: string): boolean {
    const n = this.normalize(ip);
    if (this.isAllowlisted(n)) return false;
    return this.blocked.has(n);
  }

  /** Called at auth entry points. Denies a blocked IP with a deliberately
   *  generic message — the client is never told it's an IP block or the value. */
  assertRequestAllowed(): void {
    const ip = this.currentIp();
    if (ip && this.isBlocked(ip)) {
      throw new ForbiddenException('Access denied');
    }
  }

  async list(): Promise<BlockedIp[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async block(ip: string, note: string | null, createdBy: string | null): Promise<BlockedIp> {
    const n = this.normalize(ip);
    let row = await this.repo.findOne({ where: { ip: n } });
    if (!row) {
      row = this.repo.create({ ip: n, reason: 'manual', note, createdBy });
      row = await this.repo.save(row);
    }
    this.blocked.add(n);
    await this.audit.record({
      action: 'security.ip_blocked',
      actorUserId: createdBy ?? undefined,
      entityType: 'blocked_ip',
      entityId: row.id,
      metadata: { ip: n, note },
      ip: n,
    });
    this.logger.warn(`Blocked IP ${n} (manual)`);
    return row;
  }

  async unblock(id: string, actorUserId: string): Promise<{ ok: true }> {
    const row = await this.repo.findOne({ where: { id } });
    if (row) {
      await this.repo.delete({ id });
      this.blocked.delete(this.normalize(row.ip));
      await this.audit.record({
        action: 'security.ip_unblocked',
        actorUserId,
        entityType: 'blocked_ip',
        entityId: id,
        metadata: { ip: row.ip },
      });
      this.logger.log(`Unblocked IP ${row.ip}`);
    }
    return { ok: true };
  }
}
