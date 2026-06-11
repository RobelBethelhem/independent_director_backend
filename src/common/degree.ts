/**
 * Degree-level helpers shared by the smart evaluator and submit eligibility.
 * Per the Nomination Procedure §4.1.1, an Independent Director must hold at
 * least a Master's degree (or equivalent). The dropdown stores one of
 * DEGREE_OPTIONS, but degreeLevel() also understands legacy free-text degrees.
 */

export const DEGREE_OPTIONS = [
  'Doctorate (PhD)',
  "Master's Degree",
  "Bachelor's Degree",
  'Diploma',
  'Other',
];

/** Level ranking: 4 doctorate, 3 master's, 2 bachelor's, 1 diploma, 0 none/other. */
export const DEGREE_LEVEL = {
  doctorate: 4,
  masters: 3,
  bachelors: 2,
  diploma: 1,
  none: 0,
} as const;

/** Minimum eligible level to serve as an Independent Director (Master's). */
export const MIN_DEGREE_LEVEL = DEGREE_LEVEL.masters;

export function degreeLevel(text: string | null | undefined): number {
  const t = (text ?? '').toLowerCase();
  if (!t.trim()) return DEGREE_LEVEL.none;
  if (/phd|ph\.?d|doctor|dba|d\.?phil|dphil/.test(t)) return DEGREE_LEVEL.doctorate;
  if (/master|msc|m\.?sc|mba|m\.?b\.?a|\bma\b|llm|m\.?phil|mphil|postgrad/.test(t)) return DEGREE_LEVEL.masters;
  if (/bachelor|bsc|b\.?sc|\bba\b|llb|b\.?a\b|undergrad/.test(t)) return DEGREE_LEVEL.bachelors;
  if (/diploma|certificate|\bcert\b/.test(t)) return DEGREE_LEVEL.diploma;
  return DEGREE_LEVEL.none;
}

/**
 * Field-of-study relevance (§4.1.1): the qualifying degree must be in a field
 * related to banking, accounting, auditing, finance, business management,
 * economics, law, technology — "and related fields". Broad on purpose so the
 * open-ended "related fields" clause does not wrongly reject candidates.
 */
const RELEVANT_FIELD_RE =
  /bank|financ|fintech|account|audit|business|administ|\bmba\b|manage|econom|\blaw\b|legal|jurisprud|technolog|\bit\b|informat|comput|software|\bdata\b|engineer|commerc|actuar|insur|\brisk\b|investment|statistic|mathemat|quantitat|govern|relat/i;

export function isRelevantField(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  return t.length > 0 && RELEVANT_FIELD_RE.test(t);
}
