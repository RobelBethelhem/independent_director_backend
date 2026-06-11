import { Application } from '../applications/entities/application.entity';
import { CriterionId, SCORE_MAX } from '../common/enums';
import { degreeLevel, DEGREE_LEVEL } from '../common/degree';
import { totalExperienceYears } from '../common/experience';

export interface ScoreSuggestion {
  criterionId: CriterionId;
  value: number; // 1..10
  rationale: string;
}

const clamp = (n: number) => Math.max(1, Math.min(SCORE_MAX, Math.round(n)));

const RELEVANT_FIELDS = /bank|financ|account|audit|econ|law|legal|manage|govern|business|technolog|risk|invest/i;
const SENIOR_TOP = /chief|ceo|c\.e\.o|governor|deputy governor|president|managing director|\bmd\b|founder/i;
const SENIOR_EXEC = /executive director|partner|\bhead\b|chair|vice president|\bvp\b|director/i;
const SENIOR_MID = /manager|senior|lead/i;

/**
 * Deterministic "senior evaluator" — proposes scores (1–10) for the document-evaluation
 * criteria from the candidate's structured application, following the procedure's Detailed
 * Scoring Guide. Interview criteria are left to the reviewer (post-interview). Reviewers can
 * adjust any suggestion before submitting.
 */
export function suggestDocumentScores(app: Application): ScoreSuggestion[] {
  const out: ScoreSuggestion[] = [];

  // ---- Education (10%) ----
  const degrees = (app.education ?? []).map((e) => `${e.degree ?? ''} ${e.field ?? ''}`).filter((s) => s.trim());
  const levels = degrees.map(degreeLevel);
  const maxLevel = levels.length ? Math.max(...levels) : 0;
  const mastersCount = levels.filter((l) => l === DEGREE_LEVEL.masters).length;
  let eduVal = 5;
  let eduWhy = 'No postgraduate qualification detected.';
  if (maxLevel >= DEGREE_LEVEL.doctorate) {
    eduVal = 10;
    eduWhy = 'Doctorate (PhD) — exceeds the minimum requirement (10).';
  } else if (mastersCount >= 2) {
    eduVal = 9;
    eduWhy = 'Two or more Master’s degrees (9).';
  } else if (maxLevel === DEGREE_LEVEL.masters) {
    eduVal = 8;
    eduWhy = 'Master’s degree — meets the minimum requirement (8).';
  } else if (maxLevel === DEGREE_LEVEL.bachelors) {
    eduVal = 6;
    eduWhy = 'Bachelor-level only — below the Master’s minimum.';
  }
  out.push({ criterionId: CriterionId.Education, value: clamp(eduVal), rationale: eduWhy });

  // ---- Work Experience (15%): years + seniority + relevance ----
  const years = deriveYears(app);
  const role = currentRole(app);
  let yearsPart = years == null ? 3 : years >= 20 ? 7 : years >= 15 ? 5 : years >= 10 ? 3 : 2;
  let seniorityPart = SENIOR_TOP.test(role) ? 5 : SENIOR_EXEC.test(role) ? 4 : SENIOR_MID.test(role) ? 3 : 2;
  const expertise = (app.expertise ?? []).map((e) => e.value).join(' ');
  const relevant = RELEVANT_FIELDS.test(`${role} ${expertise}`);
  const relevancePart = relevant ? 3 : 2;
  const workTotal15 = yearsPart + seniorityPart + relevancePart; // out of 15
  out.push({
    criterionId: CriterionId.WorkExperience,
    value: clamp((workTotal15 / 15) * SCORE_MAX),
    rationale: `${years != null ? `${years} yrs experience` : 'experience'}, ${seniorityLabel(role)} seniority, ${relevant ? 'sector-relevant' : 'limited sector relevance'}.`,
  });

  // ---- Board Experience (10%) ----
  const boards = (app.boards ?? []).filter((b) => b.org);
  const hasChair = boards.some((b) => /chair/i.test(`${b.position ?? ''}`));
  let boardVal = boards.length >= 3 ? 9 : boards.length === 2 ? 8 : boards.length === 1 ? 7 : 3;
  if (hasChair) boardVal = Math.min(10, boardVal + 1);
  out.push({
    criterionId: CriterionId.BoardExperience,
    value: clamp(boardVal),
    rationale: `${boards.length} board appointment(s)${hasChair ? ', incl. chairmanship' : ''}.`,
  });

  // ---- Testimonials (5%) ----
  const refs = (app.references ?? []).filter((r) => r.name);
  const testVal = refs.length >= 2 ? 8 : refs.length === 1 ? 7 : 5;
  out.push({
    criterionId: CriterionId.Testimonials,
    value: clamp(testVal),
    rationale: `${refs.length} professional reference(s) provided (pending due-diligence verification).`,
  });

  // ---- Certifications (10%) ----
  const certs = (app.professionalQuals ?? []).filter((q) => q.name);
  const certVal = certs.length >= 3 ? 10 : certs.length === 2 ? 9 : certs.length === 1 ? 8 : 5;
  out.push({
    criterionId: CriterionId.Certifications,
    value: clamp(certVal),
    rationale: certs.length
      ? `${certs.length} professional qualification(s): ${certs.map((c) => c.name).slice(0, 3).join(', ')}.`
      : 'No professional certifications listed.',
  });

  return out;
}

function deriveYears(app: Application): number | null {
  const employment = app.employment ?? [];
  return employment.length ? totalExperienceYears(employment) : null;
}

function currentRole(app: Application): string {
  const cur = (app.employment ?? []).find((e) => e.isCurrent) ?? (app.employment ?? [])[0];
  return cur?.role || '';
}

function seniorityLabel(role: string): string {
  if (SENIOR_TOP.test(role)) return 'top-executive';
  if (SENIOR_EXEC.test(role)) return 'executive';
  if (SENIOR_MID.test(role)) return 'mid-level';
  return 'general';
}
