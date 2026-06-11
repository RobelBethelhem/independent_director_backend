/** Upload limits (BACKEND.md): PDF + common image types, ≤10 MB each. */
export const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
];
