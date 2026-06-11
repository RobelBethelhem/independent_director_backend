/**
 * Domain enums mirrored exactly from the prototype's `design/data.js` and BACKEND.md.
 * These are the source of truth shared across entities, DTOs, and validation.
 */

export enum UserRole {
  Applicant = 'applicant',
  Admin = 'admin',
  Reviewer = 'reviewer',
  Auditor = 'auditor',
  Recommender = 'recommender',
}

export enum UserStatus {
  Active = 'active',
  Disabled = 'disabled',
}

export enum OtpChannel {
  Email = 'email',
  Sms = 'sms',
}

export enum OtpPurpose {
  Verify = 'verify',
  Reset = 'reset',
}

/**
 * Application status pipeline:
 * draft → submitted → under_review → info_requested → shortlisted → (selected | not_selected)
 * The applicant tracker collapses this to: Submitted → Under Review → Shortlisted → Decision.
 */
export enum ApplicationStatus {
  Draft = 'draft',
  Submitted = 'submitted',
  UnderReview = 'under_review',
  InfoRequested = 'info_requested',
  Shortlisted = 'shortlisted',
  NotSelected = 'not_selected',
  Selected = 'selected',
}

export enum DeclarationItemId {
  A1 = 'a1',
  A2 = 'a2',
  A3 = 'a3',
  B1 = 'b1',
  B2 = 'b2',
  C1 = 'c1',
  D1 = 'd1',
}

/** All current declaration items raise an independence flag on "yes". */
export const ALL_DECLARATION_IDS: DeclarationItemId[] = Object.values(DeclarationItemId);

export enum DeclarationAnswer {
  Yes = 'yes',
  No = 'no',
}

export enum DocType {
  Cv = 'cv',
  Edu = 'edu',
  Prof = 'prof',
  Id = 'id',
  Tin = 'tin',
  Rec = 'rec',
  Other = 'other',
}

/** Required document types (at least one clean file each before submission). */
export const REQUIRED_DOC_TYPES: DocType[] = [DocType.Cv, DocType.Edu, DocType.Id, DocType.Tin];

/** Human-readable labels (mirror the frontend DOC_TYPES labels). */
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  [DocType.Cv]: 'Curriculum Vitae (CV)',
  [DocType.Edu]: 'Educational certificates',
  [DocType.Prof]: 'Professional certificates',
  [DocType.Id]: 'National ID / Passport',
  [DocType.Tin]: 'Tax Identification (TIN)',
  [DocType.Rec]: 'Recommendation letters',
  [DocType.Other]: 'Other supporting documents',
};

/**
 * NRC evaluation rubric from the Independent Directors' Nomination Procedure (2026):
 * Document Evaluation (50%) + Interview (50%). Each criterion is scored 1..10 points;
 * weighted_score = round(Σ value/10 × weight).
 */
export enum CriterionId {
  // Document evaluation (50%)
  Education = 'education',
  WorkExperience = 'work_experience',
  BoardExperience = 'board_experience',
  Testimonials = 'testimonials',
  Certifications = 'certifications',
  // Interview (50%)
  Leadership = 'leadership',
  BankingUnderstanding = 'banking_understanding',
  ImpactPlan = 'impact_plan',
}

export const SCORE_MAX = 10;

export const CRITERION_WEIGHTS: Record<CriterionId, number> = {
  [CriterionId.Education]: 10,
  [CriterionId.WorkExperience]: 15,
  [CriterionId.BoardExperience]: 10,
  [CriterionId.Testimonials]: 5,
  [CriterionId.Certifications]: 10,
  [CriterionId.Leadership]: 20,
  [CriterionId.BankingUnderstanding]: 15,
  [CriterionId.ImpactPlan]: 15,
};

export const CRITERION_GROUP: Record<CriterionId, 'document' | 'interview'> = {
  [CriterionId.Education]: 'document',
  [CriterionId.WorkExperience]: 'document',
  [CriterionId.BoardExperience]: 'document',
  [CriterionId.Testimonials]: 'document',
  [CriterionId.Certifications]: 'document',
  [CriterionId.Leadership]: 'interview',
  [CriterionId.BankingUnderstanding]: 'interview',
  [CriterionId.ImpactPlan]: 'interview',
};

/** Criteria the smart evaluator can auto-suggest from the application documents. */
export const DOCUMENT_CRITERIA: CriterionId[] = (Object.keys(CRITERION_GROUP) as CriterionId[]).filter(
  (c) => CRITERION_GROUP[c] === 'document',
);

export enum MessageChannel {
  Email = 'email',
  Sms = 'sms',
  Both = 'both',
}

export enum MessageTemplate {
  Ack = 'ack',
  InfoRequest = 'info_request',
  Interview = 'interview',
  Blank = 'blank',
}

/** Areas of expertise (ZB.EXPERTISE). Stored as free-ish enum-validated strings. */
export const EXPERTISE_OPTIONS = [
  'Corporate Governance',
  'Banking & Finance',
  'Risk Management',
  'Audit & Assurance',
  'Legal & Compliance',
  'Information Technology',
  'Digital Transformation',
  'Strategy',
  'Human Capital',
  'ESG & Sustainability',
  'Economics',
  'Marketing',
] as const;

export const COUNTRY_OPTIONS = [
  'Ethiopia',
  'United Kingdom',
  'United States',
  'United Arab Emirates',
  'Kenya',
  'Canada',
  'Germany',
  'South Africa',
  'India',
  'Other',
] as const;
