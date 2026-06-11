import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { RecruitmentService } from '../recruitment/recruitment.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import {
  ALL_DECLARATION_IDS,
  ApplicationStatus,
  DeclarationAnswer,
  DOC_TYPE_LABELS,
  REQUIRED_DOC_TYPES,
} from '../common/enums';
import { degreeLevel, isRelevantField, MIN_DEGREE_LEVEL } from '../common/degree';
import { MIN_EXPERIENCE_YEARS, totalExperienceYears } from '../common/experience';
import { Application } from './entities/application.entity';
import { EducationEntry } from './entities/education-entry.entity';
import { ProfessionalQual } from './entities/professional-qual.entity';
import { EmploymentEntry } from './entities/employment-entry.entity';
import { BoardEntry } from './entities/board-entry.entity';
import { ExpertiseSelection } from './entities/expertise.entity';
import { ReferenceContact } from './entities/reference-contact.entity';
import { Declaration } from './entities/declaration.entity';
import { UpdateApplicationDto, UpdateProgressDto } from './dto/update-application.dto';
import {
  CertifyDto,
  PutBoardsDto,
  PutDeclarationsDto,
  PutEducationDto,
  PutEmploymentDto,
  PutExpertiseDto,
  PutProfessionalDto,
  PutReferencesDto,
} from './dto/collections.dto';

const FULL_RELATIONS = [
  'education',
  'professionalQuals',
  'employment',
  'boards',
  'expertise',
  'references',
  'declarations',
  'documents',
];

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly apps: Repository<Application>,
    private readonly recruitment: RecruitmentService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private get manager(): EntityManager {
    return this.apps.manager;
  }

  /** The applicant's current application (latest for the active cycle), fully loaded, or null. */
  async getMine(userId: string): Promise<Application | null> {
    return this.apps.findOne({
      where: { applicantUserId: userId },
      relations: FULL_RELATIONS,
      order: { createdAt: 'DESC' },
    });
  }

  /** Create a draft for the current cycle, or return the existing one (one draft per applicant per cycle). */
  async createDraft(userId: string): Promise<Application> {
    const cycle = await this.recruitment.getOrCreateActiveCycle();
    const existing = await this.apps.findOne({
      where: { applicantUserId: userId, cycleId: cycle.id },
      relations: FULL_RELATIONS,
    });
    if (existing) {
      return existing;
    }
    const draft = this.apps.create({
      cycleId: cycle.id,
      applicantUserId: userId,
      status: ApplicationStatus.Draft,
    });
    const saved = await this.apps.save(draft);
    return (await this.getById(saved.id))!;
  }

  async getById(id: string): Promise<Application | null> {
    return this.apps.findOne({ where: { id }, relations: FULL_RELATIONS });
  }

  // ---- Step 1 + conflicts autosave ----
  async patch(userId: string, id: string, dto: UpdateApplicationDto): Promise<Application> {
    const app = await this.assertEditableOwned(userId, id);
    Object.assign(app, dto);
    await this.apps.save(app);
    return (await this.getById(id))!;
  }

  // ---- Repeatable collections (PUT replace) ----

  async replaceEducation(userId: string, id: string, dto: PutEducationDto): Promise<Application> {
    await this.assertEditableOwned(userId, id);
    await this.replaceCollection(EducationEntry, id, dto.items);
    return (await this.getById(id))!;
  }

  async replaceProfessional(userId: string, id: string, dto: PutProfessionalDto): Promise<Application> {
    await this.assertEditableOwned(userId, id);
    await this.replaceCollection(ProfessionalQual, id, dto.items);
    return (await this.getById(id))!;
  }

  async replaceEmployment(userId: string, id: string, dto: PutEmploymentDto): Promise<Application> {
    await this.assertEditableOwned(userId, id);
    await this.replaceCollection(EmploymentEntry, id, dto.items);
    return (await this.getById(id))!;
  }

  async replaceBoards(userId: string, id: string, dto: PutBoardsDto): Promise<Application> {
    await this.assertEditableOwned(userId, id);
    await this.replaceCollection(BoardEntry, id, dto.items);
    return (await this.getById(id))!;
  }

  async replaceReferences(userId: string, id: string, dto: PutReferencesDto): Promise<Application> {
    await this.assertEditableOwned(userId, id);
    await this.replaceCollection(ReferenceContact, id, dto.items);
    return (await this.getById(id))!;
  }

  async replaceExpertise(userId: string, id: string, dto: PutExpertiseDto): Promise<Application> {
    await this.assertEditableOwned(userId, id);
    const unique = Array.from(new Set(dto.values));
    await this.manager.transaction(async (tx) => {
      await tx.delete(ExpertiseSelection, { applicationId: id });
      if (unique.length > 0) {
        await tx.insert(
          ExpertiseSelection,
          unique.map((value) => ({ applicationId: id, value })),
        );
      }
    });
    return (await this.getById(id))!;
  }

  async replaceDeclarations(userId: string, id: string, dto: PutDeclarationsDto): Promise<Application> {
    const app = await this.assertEditableOwned(userId, id);
    await this.manager.transaction(async (tx) => {
      await tx.delete(Declaration, { applicationId: id });
      if (dto.items.length > 0) {
        await tx.insert(
          Declaration,
          dto.items.map((it) => ({
            applicationId: id,
            itemId: it.itemId,
            answer: it.answer,
            // Every current item flags on "yes" and requires an explanation;
            // drafts may save it incomplete, submit-time validation enforces it.
            explanation: it.answer === DeclarationAnswer.Yes ? (it.explanation ?? null) : null,
          })),
        );
      }
      const flags = dto.items.filter((it) => it.answer === DeclarationAnswer.Yes).length;
      await tx.update(Application, { id }, { flagsCount: flags });
      app.flagsCount = flags;
    });
    return (await this.getById(id))!;
  }

  /** Persist the wizard step so the application resumes on any browser/device. */
  async saveProgress(userId: string, id: string, dto: UpdateProgressDto): Promise<{ ok: true }> {
    const app = await this.assertEditableOwned(userId, id);
    app.currentStep = dto.currentStep;
    app.maxStepSeen = Math.max(dto.maxStepSeen, dto.currentStep, app.maxStepSeen);
    await this.apps.save(app);
    return { ok: true };
  }

  async certify(userId: string, id: string, dto: CertifyDto): Promise<Application> {
    const app = await this.assertEditableOwned(userId, id);
    app.certified = dto.certified;
    app.certifiedAt = dto.certified ? new Date() : null;
    await this.apps.save(app);
    return (await this.getById(id))!;
  }

  // ---- Submit ----

  /**
   * Validate completeness server-side (mirroring the UI gates), assign a unique
   * reference, lock the application, and send an acknowledgement.
   */
  async submit(userId: string, id: string): Promise<Application> {
    const app = await this.assertEditableOwned(userId, id);
    const full = (await this.getById(id))!;
    const errors = this.validateForSubmit(full);
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({ message: 'Application is incomplete', errors });
    }

    const reference = await this.recruitment.allocateReference(app.cycleId);
    app.reference = reference;
    app.status = ApplicationStatus.Submitted;
    app.submittedAt = new Date();
    await this.apps.save(app);

    // Fire-and-forget — don't block the submit response on email delivery.
    if (full.email) {
      void this.notifications.sendApplicationAcknowledgement(full.email, reference).catch(() => undefined);
    }
    await this.audit.record({
      actorUserId: userId,
      action: 'application.submit',
      entityType: 'application',
      entityId: id,
      metadata: { reference },
    });
    return (await this.getById(id))!;
  }

  /** Field-level errors mirroring the UI; empty object means submittable. */
  private validateForSubmit(app: Application): Record<string, string> {
    const e: Record<string, string> = {};
    if (!app.firstName) e.firstName = 'Required';
    if (!app.middleName) e.middleName = 'Required';
    if (!app.lastName) e.lastName = 'Required';
    if (!app.email) e.email = 'Required';
    if (!app.phone) e.phone = 'Required';
    if (!app.nationality) e.nationality = 'Required';
    if (!app.country) e.country = 'Required';

    // Eligibility (Nomination Procedure §4.1.1): a Master's-or-higher qualification
    // in a relevant field of study.
    const education = app.education ?? [];
    const hasMasters = education.some((ed) => degreeLevel(ed.degree) >= MIN_DEGREE_LEVEL);
    const hasRelevantMasters = education.some(
      (ed) => degreeLevel(ed.degree) >= MIN_DEGREE_LEVEL && isRelevantField(ed.field),
    );
    if (!hasMasters) {
      e.education =
        'You do not meet the minimum eligibility: a Master’s degree (MSc) or higher is required (Nomination Procedure §4.1.1).';
    } else if (!hasRelevantMasters) {
      e.education =
        'Your qualifying degree must be in a relevant field — banking, finance, accounting, auditing, business management, economics, law, or technology (Nomination Procedure §4.1.1).';
    }

    // Eligibility (Nomination Procedure §4.1.2): a minimum of ten (10) years of
    // professional experience, evidenced by the employment history.
    const employment = app.employment ?? [];
    const realJobs = employment.filter((j) => j.org || j.role || j.fromMonth);
    if (realJobs.length === 0) {
      e.employment = 'Add at least one position to your employment history (Nomination Procedure §4.1.2).';
    } else {
      const years = totalExperienceYears(employment);
      if (years < MIN_EXPERIENCE_YEARS) {
        e.experience = `You do not meet the minimum eligibility: at least ten (10) years of professional experience is required (Nomination Procedure §4.1.2). The positions entered total about ${years} year(s).`;
      }
    }

    const validRefs = (app.references ?? []).filter((r) => r.name && r.email && r.relationship);
    if (validRefs.length < 2) {
      e.references = 'Provide at least two references, each with a name, email, and stated relationship to you.';
    }

    // Required documents (§: each must have at least one uploaded, virus-scanned file).
    const uploadedTypes = new Set((app.documents ?? []).map((d) => d.docType));
    const cleanTypes = new Set(
      (app.documents ?? []).filter((d) => d.scannedClean).map((d) => d.docType),
    );
    const missingDocs = REQUIRED_DOC_TYPES.filter((t) => !uploadedTypes.has(t));
    const unscannedDocs = REQUIRED_DOC_TYPES.filter((t) => uploadedTypes.has(t) && !cleanTypes.has(t));
    if (missingDocs.length > 0) {
      e.documents = `Upload the required document(s): ${missingDocs.map((t) => DOC_TYPE_LABELS[t]).join(', ')}.`;
    } else if (unscannedDocs.length > 0) {
      e.documents = `These document(s) are still being scanned — please wait a moment and resubmit: ${unscannedDocs
        .map((t) => DOC_TYPE_LABELS[t])
        .join(', ')}.`;
    }

    const answers = new Map((app.declarations ?? []).map((d) => [d.itemId, d]));
    const unanswered = ALL_DECLARATION_IDS.filter((id) => !answers.has(id));
    if (unanswered.length > 0) {
      e.declarations = 'All declarations must be answered';
    } else {
      const missingExplanation = ALL_DECLARATION_IDS.some((id) => {
        const d = answers.get(id)!;
        return d.answer === DeclarationAnswer.Yes && !(d.explanation && d.explanation.trim());
      });
      if (missingExplanation) e.declarations = 'Each "Yes" declaration needs a written explanation';
    }

    if (!app.certified) e.certified = 'You must certify the declaration before submitting';
    return e;
  }

  /** Status + tracker timeline for the applicant's tracking screen. */
  async getStatus(userId: string, id: string) {
    const app = await this.assertOwnedDocReadable(userId, id);
    const order = [
      ApplicationStatus.Submitted,
      ApplicationStatus.UnderReview,
      ApplicationStatus.Shortlisted,
      ApplicationStatus.Selected,
    ];
    // Map the full status set onto the 4-node tracker.
    const collapsed: Record<ApplicationStatus, number> = {
      [ApplicationStatus.Draft]: -1,
      [ApplicationStatus.Submitted]: 0,
      [ApplicationStatus.InfoRequested]: 1,
      [ApplicationStatus.UnderReview]: 1,
      [ApplicationStatus.Shortlisted]: 2,
      [ApplicationStatus.NotSelected]: 3,
      [ApplicationStatus.Selected]: 3,
    };
    const currentIndex = collapsed[app.status];
    return {
      status: app.status,
      reference: app.reference,
      submittedAt: app.submittedAt,
      infoRequested: app.status === ApplicationStatus.InfoRequested,
      timeline: ['Submitted', 'Under Review', 'Shortlisted', 'Decision'].map((label, i) => ({
        label,
        state: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'upcoming',
        node: order[i],
      })),
    };
  }

  // ---- Helpers ----

  /** Public ownership+editability check, reused by the documents module. */
  assertOwnedEditable(userId: string, id: string): Promise<Application> {
    return this.assertEditableOwned(userId, id);
  }

  /** Owner check without the draft requirement — for reads that stay available
   *  after submission (viewing/downloading one's own documents). */
  async assertOwnedDocReadable(userId: string, id: string): Promise<Application> {
    const app = await this.apps.findOne({ where: { id } });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    if (app.applicantUserId !== userId) {
      throw new ForbiddenException('You can only access your own application');
    }
    return app;
  }

  /** Loads an application, asserting the caller owns it and it is still a draft. */
  private async assertEditableOwned(userId: string, id: string): Promise<Application> {
    const app = await this.apps.findOne({ where: { id } });
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    if (app.applicantUserId !== userId) {
      throw new ForbiddenException('You can only edit your own application');
    }
    if (app.status !== ApplicationStatus.Draft) {
      // Submitted applications are locked to the applicant (changes go via the Secretary).
      throw new ForbiddenException('This application has been submitted and is locked');
    }
    return app;
  }

  /** Replace all rows of a simple child collection, stamping a stable sort order. */
  private async replaceCollection<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    applicationId: string,
    items: object[],
  ): Promise<void> {
    await this.manager.transaction(async (tx) => {
      await tx.delete(entity, { applicationId });
      if (items.length > 0) {
        const rows = items.map((item, sort) => ({
          ...(item as Record<string, unknown>),
          applicationId,
          sort,
        }));
        await tx.insert(entity, rows as unknown as QueryDeepPartialEntity<T>[]);
      }
    });
  }
}
