import { SetMetadata } from '@nestjs/common';

export const SKIP_AUDIT_KEY = 'skipAudit';

/**
 * Marks a controller or handler whose audit trail is written explicitly (rich
 * domain metadata) or is high-frequency draft-autosave noise — so the global
 * AuditInterceptor does not also log it.
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
