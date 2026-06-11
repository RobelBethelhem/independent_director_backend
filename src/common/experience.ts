/**
 * Professional-experience helpers (Nomination Procedure §4.1.2 requires a
 * minimum of ten (10) years). Total experience is the sum of each position's
 * duration; a "currently held" position (or one missing an end date) runs to now.
 */

export interface ExperienceEntry {
  fromMonth?: string | null; // YYYY-MM
  toMonth?: string | null;
  isCurrent?: boolean;
}

export const MIN_EXPERIENCE_YEARS = 10;

function parseMonth(s?: string | null): Date | null {
  if (!s) return null;
  const parts = s.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1] ?? '1');
  if (!y) return null;
  return new Date(y, (m || 1) - 1, 1);
}

/** Total professional experience in whole years across all positions. */
export function totalExperienceYears(entries: ExperienceEntry[]): number {
  const now = new Date();
  let months = 0;
  for (const e of entries ?? []) {
    const start = parseMonth(e.fromMonth);
    if (!start) continue;
    const end = e.isCurrent ? now : parseMonth(e.toMonth) ?? now;
    const m = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (m > 0) months += m;
  }
  return Math.floor(months / 12);
}
