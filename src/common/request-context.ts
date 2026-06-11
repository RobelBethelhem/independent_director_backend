import { AsyncLocalStorage } from 'async_hooks';
import type { Request, Response, NextFunction } from 'express';

/** Per-request audit detail a handler can attach for the interceptor to record. */
export interface AuditOverlay {
  meta: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
}

/** What we carry through the async call-chain for audit enrichment. */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  /** The live request — `req.user` is filled by the auth guard after middleware runs. */
  req: Request;
  /** Mutable bag handlers enrich with semantic detail (status from→to, etc.). */
  audit: AuditOverlay;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Attach semantic metadata to the current request's audit record. */
export function setAuditMeta(meta: Record<string, unknown>): void {
  const store = requestContext.getStore();
  if (store) Object.assign(store.audit.meta, meta);
}

/** Refine the audited entity (type/id) for the current request. */
export function setAuditInfo(info: { entityType?: string; entityId?: string }): void {
  const store = requestContext.getStore();
  if (!store) return;
  if (info.entityType !== undefined) store.audit.entityType = info.entityType;
  if (info.entityId !== undefined) store.audit.entityId = info.entityId;
}

/** Best-effort client IP: honour X-Forwarded-For (proxies), else the socket. */
export function clientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff.length) return xff[0];
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

export function clientUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 500) : null;
}

/** Express middleware that opens an async-local store for the whole request. */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  requestContext.run(
    { ip: clientIp(req), userAgent: clientUserAgent(req), req, audit: { meta: {} } },
    () => next(),
  );
}

export interface ContextUser {
  id: string;
  email: string;
  role: string;
}

/** The authenticated user on the current request, if any. */
export function currentUser(): ContextUser | undefined {
  const store = requestContext.getStore();
  return (store?.req as Request & { user?: ContextUser })?.user;
}
