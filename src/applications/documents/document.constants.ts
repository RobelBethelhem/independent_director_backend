import { DocType } from '../../common/enums';

/** Upload limits: official documents must be PDF, ≤10 MB each. */
export const MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024;

/** Hard cap on documents per application — bounds storage abuse from an
 *  authenticated applicant looping presign+record on a draft. Generous vs. the
 *  realistic need (photo + IDs + one cert/letter per education/employment entry). */
export const MAX_DOCS_PER_APPLICATION = 60;

/** Profile photos may be common web image formats. */
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** All other supporting documents must be PDF. */
export const PDF_MIME_TYPES = ['application/pdf'];

/** Backwards-compatible default (PDF) used where the doc type isn't specialised. */
export const ALLOWED_MIME_TYPES = PDF_MIME_TYPES;

/** The accepted MIME types for a given document type — images for the photo, PDF otherwise. */
export function allowedMimesFor(docType: DocType): string[] {
  return docType === DocType.Photo ? IMAGE_MIME_TYPES : PDF_MIME_TYPES;
}
