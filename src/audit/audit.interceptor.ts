import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, tap, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { AuditService } from './audit.service';
import { SKIP_AUDIT_KEY } from './skip-audit.decorator';
import { requestContext } from '../common/request-context';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** camelCase / PascalCase → snake_case. */
function snake(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

/**
 * Records every state-changing request (and sensitive document reads) as an audit
 * entry — actor, IP and user-agent are enriched by AuditService from the request
 * context. Handlers marked @SkipAudit (or that self-audit) are left to do their own.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    if (!this.shouldAudit(context, req)) return next.handle();

    const cls = context.getClass().name.replace(/Controller$/, '');
    const action = `${snake(cls)}.${snake(context.getHandler().name)}`;
    const entityType = snake(cls);
    const params = (req.params ?? {}) as Record<string, string>;
    const entityId = params.id ?? params.docId ?? params.cycleId ?? null;

    // Read the (possibly handler-enriched) overlay lazily so semantic detail
    // attached during the handler — status from→to, created role — is included.
    const overlay = () => requestContext.getStore()?.audit;

    const base = () => {
      const o = overlay();
      const meta = o && Object.keys(o.meta).length ? o.meta : undefined;
      return {
        action,
        entityType: o?.entityType ?? entityType,
        entityId: o?.entityId ?? entityId ?? undefined,
        method: req.method,
        path: req.originalUrl,
        metadata: meta,
      };
    };

    return next.handle().pipe(
      tap(() => {
        void this.audit
          .record({ ...base(), outcome: 'success', statusCode: res.statusCode })
          .catch(() => undefined);
      }),
      catchError((err: { status?: number; message?: string }) => {
        const b = base();
        void this.audit
          .record({
            ...b,
            outcome: 'failure',
            statusCode: typeof err?.status === 'number' ? err.status : 500,
            metadata: { ...(b.metadata ?? {}), ...(err?.message ? { error: err.message } : {}) },
          })
          .catch(() => undefined);
        return throwError(() => err);
      }),
    );
  }

  private shouldAudit(context: ExecutionContext, req: Request): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return false;

    const path = req.originalUrl || '';
    // Auth events are logged explicitly with richer detail; audit reads are noise.
    if (path.includes('/auth/') || path.includes('/audit')) return false;

    if (MUTATING.has(req.method)) return true;
    // Sensitive reads worth trailing: document preview / download.
    if (req.method === 'GET' && (path.includes('/download') || path.includes('/preview'))) return true;
    return false;
  }
}
