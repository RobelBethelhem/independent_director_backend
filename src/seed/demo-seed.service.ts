import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { RecruitmentService } from '../recruitment/recruitment.service';
import { Application } from '../applications/entities/application.entity';
import { EducationEntry } from '../applications/entities/education-entry.entity';
import { EmploymentEntry } from '../applications/entities/employment-entry.entity';
import { BoardEntry } from '../applications/entities/board-entry.entity';
import { ExpertiseSelection } from '../applications/entities/expertise.entity';
import { ReferenceContact } from '../applications/entities/reference-contact.entity';
import { Declaration } from '../applications/entities/declaration.entity';
import { ApplicationDocument } from '../applications/entities/document.entity';
import { Review } from '../applications/entities/review.entity';
import { ReviewScore } from '../applications/entities/review-score.entity';
import { User } from '../users/user.entity';
import {
  ALL_DECLARATION_IDS,
  ApplicationStatus,
  CRITERION_WEIGHTS,
  CriterionId,
  DeclarationAnswer,
  DocType,
  SCORE_MAX,
  UserRole,
} from '../common/enums';

const PW = 'password123';

interface Applicant {
  title: string;
  first: string;
  middle: string;
  last: string;
  gender: string;
  nationality: string;
  country: string;
  city: string;
  dobYear: number;
  degree: string;
  field: string;
  institution: string;
  gradYear: string;
  role: string;
  org: string;
  startYear: number;
  expertise: string[];
  boards: { org: string; position: string; type: string; period: string }[];
  status: ApplicationStatus;
  flagItem?: string; // a declaration id answered "yes"
}

const APPLICANTS: Applicant[] = [
  { title: 'Dr.', first: 'Selam', middle: 'Tadesse', last: 'Bekele', gender: 'Female', nationality: 'Ethiopia', country: 'Ethiopia', city: 'Addis Ababa', dobYear: 1972, degree: 'Doctorate (PhD)', field: 'Economics', institution: 'Addis Ababa University', gradYear: '2004', role: 'Chief Economist', org: 'Development Bank of Ethiopia', startYear: 2001, expertise: ['Economics', 'Banking & Finance', 'Strategy'], boards: [{ org: 'Ethiopian Economics Association', position: 'Board Member', type: 'Non-profit / NGO', period: '2015 – present' }], status: ApplicationStatus.Selected },
  { title: 'Mr.', first: 'Daniel', middle: 'Haile', last: 'Mekonnen', gender: 'Male', nationality: 'Ethiopia', country: 'United Kingdom', city: 'London', dobYear: 1968, degree: "Master's Degree", field: 'Finance', institution: 'London Business School', gradYear: '1998', role: 'Partner', org: 'Governance Advisory LLP', startYear: 1996, expertise: ['Corporate Governance', 'Banking & Finance', 'Legal & Compliance'], boards: [{ org: 'Awash Bank', position: 'Non-Executive Director', type: 'Financial institution', period: '2018 – present' }], status: ApplicationStatus.Shortlisted, flagItem: 'b1' },
  { title: 'Ms.', first: 'Tigist', middle: 'Alemu', last: 'Worku', gender: 'Female', nationality: 'Ethiopia', country: 'Ethiopia', city: 'Addis Ababa', dobYear: 1975, degree: "Master's Degree", field: 'Accounting', institution: 'Mekelle University', gradYear: '2002', role: 'Chief Audit Executive', org: 'Commercial Bank of Ethiopia', startYear: 2000, expertise: ['Audit & Assurance', 'Risk Management', 'Banking & Finance'], boards: [{ org: 'Institute of Internal Auditors – Ethiopia', position: 'Vice Chair', type: 'Non-profit / NGO', period: '2019 – present' }], status: ApplicationStatus.Shortlisted },
  { title: 'Dr.', first: 'Yonas', middle: 'Girma', last: 'Tesfaye', gender: 'Male', nationality: 'Ethiopia', country: 'United States', city: 'Washington DC', dobYear: 1970, degree: 'Doctorate (PhD)', field: 'Business Administration', institution: 'Georgetown University', gradYear: '2003', role: 'Managing Director', org: 'Horizon Capital Partners', startYear: 1999, expertise: ['Strategy', 'Banking & Finance', 'Digital Transformation'], boards: [{ org: 'Zemen Insurance', position: 'Director', type: 'Financial institution', period: '2020 – present' }], status: ApplicationStatus.UnderReview },
  { title: 'Mrs.', first: 'Hiwot', middle: 'Solomon', last: 'Assefa', gender: 'Female', nationality: 'Ethiopia', country: 'Ethiopia', city: 'Bahir Dar', dobYear: 1978, degree: "Master's Degree", field: 'Law', institution: 'Bahir Dar University', gradYear: '2005', role: 'General Counsel', org: 'Ethio Telecom', startYear: 2004, expertise: ['Legal & Compliance', 'Corporate Governance', 'ESG & Sustainability'], boards: [], status: ApplicationStatus.UnderReview },
  { title: 'Mr.', first: 'Abel', middle: 'Negash', last: 'Lemma', gender: 'Male', nationality: 'Ethiopia', country: 'United Arab Emirates', city: 'Dubai', dobYear: 1974, degree: "Master's Degree", field: 'Banking', institution: 'Cass Business School', gradYear: '2001', role: 'Regional Head', org: 'Standard Chartered', startYear: 2000, expertise: ['Banking & Finance', 'Risk Management', 'Information Technology'], boards: [{ org: 'Africa Fintech Forum', position: 'Advisor', type: 'Non-profit / NGO', period: '2021 – present' }], status: ApplicationStatus.InfoRequested },
  { title: 'Dr.', first: 'Meron', middle: 'Tesfaye', last: 'Gebre', gender: 'Female', nationality: 'Ethiopia', country: 'Ethiopia', city: 'Addis Ababa', dobYear: 1976, degree: 'Doctorate (PhD)', field: 'Finance', institution: 'University of Cape Town', gradYear: '2006', role: 'Professor of Finance', org: 'Addis Ababa University', startYear: 2002, expertise: ['Banking & Finance', 'Economics', 'Human Capital'], boards: [{ org: 'Capital Markets Authority', position: 'Board Member', type: 'Public enterprise', period: '2022 – present' }], status: ApplicationStatus.Submitted },
  { title: 'Mr.', first: 'Samuel', middle: 'Desta', last: 'Fikru', gender: 'Male', nationality: 'Ethiopia', country: 'Ethiopia', city: 'Adama', dobYear: 1969, degree: "Master's Degree", field: 'Business Administration', institution: 'Open University', gradYear: '1999', role: 'CEO', org: 'Adama Industrial Park', startYear: 1997, expertise: ['Strategy', 'Human Capital', 'Marketing'], boards: [{ org: 'Oromia Chamber of Commerce', position: 'Director', type: 'Non-profit / NGO', period: '2017 – present' }], status: ApplicationStatus.Submitted, flagItem: 'd1' },
  { title: 'Ms.', first: 'Bethlehem', middle: 'Kebede', last: 'Mulu', gender: 'Female', nationality: 'Ethiopia', country: 'Ethiopia', city: 'Hawassa', dobYear: 1980, degree: "Master's Degree", field: 'Information Technology', institution: 'Hawassa University', gradYear: '2007', role: 'Chief Information Officer', org: 'Dashen Bank', startYear: 2006, expertise: ['Information Technology', 'Digital Transformation', 'Risk Management'], boards: [], status: ApplicationStatus.NotSelected },
  { title: 'Mr.', first: 'Robel', middle: 'Asfaw', last: 'Tadesse', gender: 'Male', nationality: 'Ethiopia', country: 'Ethiopia', city: 'Addis Ababa', dobYear: 1982, degree: "Master's Degree", field: 'Economics', institution: 'Addis Ababa University', gradYear: '2009', role: 'Senior Advisor', org: 'Ministry of Finance', startYear: 2008, expertise: ['Economics', 'Strategy', 'ESG & Sustainability'], boards: [], status: ApplicationStatus.NotSelected, flagItem: 'a2' },
];

const REVIEWERS = [
  { email: 'reviewer@zemen.test', name: 'Abebe Kebede' },
  { email: 'reviewer2@zemen.test', name: 'Tigist Haile' },
  { email: 'reviewer3@zemen.test', name: 'Solomon Tesfaye' },
  { email: 'reviewer4@zemen.test', name: 'Marta Girma' },
];

@Injectable()
export class DemoSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly recruitment: RecruitmentService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.SEED_DEMO !== 'true') return;
    try {
      await this.run();
    } catch (err) {
      // Never let a seeding hiccup crash the API on boot.
      this.logger.error(`Demo seed failed (non-fatal): ${(err as Error).message}`);
    }
  }

  private async run(): Promise<void> {
    const apps = this.dataSource.getRepository(Application);
    if ((await apps.count()) > 0) {
      this.logger.log('Demo data already present — skipping demo seed.');
      return;
    }
    this.logger.warn('SEED_DEMO=true and pool is empty — seeding demo data…');

    const pwHash = await argon2.hash(PW);
    const mkUser = (email: string, name: string, role: UserRole): Promise<User> =>
      this.users.create({ email, name, phone: null, passwordHash: pwHash, role, emailVerified: true, mustChangePassword: false });

    // --- Staff (every role) ---
    const reviewers: User[] = [];
    for (const r of REVIEWERS) reviewers.push(await mkUser(r.email, r.name, UserRole.Reviewer));
    await mkUser('auditor@zemen.test', 'Dawit Mengistu', UserRole.Auditor);
    await mkUser('recommender@zemen.test', 'Hanna Wolde', UserRole.Recommender);

    // --- Applicants + applications ---
    const cycle = await this.recruitment.getOrCreateActiveCycle();
    // Open the review window so reviewers can assess immediately.
    await this.dataSource.manager
      .update('recruitment_cycles', { id: cycle.id }, { reviewUnlocked: true })
      .catch(() => undefined);

    const eduRepo = this.dataSource.getRepository(EducationEntry);
    const empRepo = this.dataSource.getRepository(EmploymentEntry);
    const boardRepo = this.dataSource.getRepository(BoardEntry);
    const expRepo = this.dataSource.getRepository(ExpertiseSelection);
    const refRepo = this.dataSource.getRepository(ReferenceContact);
    const declRepo = this.dataSource.getRepository(Declaration);
    const docRepo = this.dataSource.getRepository(ApplicationDocument);
    const reviewRepo = this.dataSource.getRepository(Review);
    const scoreRepo = this.dataSource.getRepository(ReviewScore);

    const now = Date.now();
    const docTypes = [DocType.Cv, DocType.Edu, DocType.Id, DocType.Tin];
    const docLabel: Record<string, string> = { cv: 'CV', edu: 'Education', id: 'NationalID', tin: 'TIN' };

    let idx = 0;
    for (const d of APPLICANTS) {
      idx += 1;
      const email = `applicant${idx}@zemen.test`;
      const user = await mkUser(email, `${d.first} ${d.last}`, UserRole.Applicant);

      const flags = d.flagItem ? 1 : 0;
      const app = apps.create({
        cycleId: cycle.id,
        applicantUserId: user.id,
        status: d.status,
        title: d.title,
        firstName: d.first,
        middleName: d.middle,
        lastName: d.last,
        dob: `${d.dobYear}-05-15`,
        gender: d.gender,
        nationality: d.nationality,
        email,
        phone: `+2519${(11000000 + idx).toString().slice(0, 8)}`,
        country: d.country,
        city: d.city,
        address: `${d.city}, ${d.country}`,
        conflictsText: d.flagItem ? 'See independence declarations.' : 'None.',
        certified: true,
        certifiedAt: new Date(),
        flagsCount: flags,
        currentStep: 7,
        maxStepSeen: 7,
        reference: await this.recruitment.allocateReference(cycle.id),
        submittedAt: new Date(now - idx * 36 * 3600 * 1000),
      });
      const saved = await apps.save(app);

      await eduRepo.save(
        eduRepo.create({ applicationId: saved.id, degree: d.degree, field: d.field, institution: d.institution, year: d.gradYear, sort: 0 }),
      );
      await empRepo.save([
        empRepo.create({ applicationId: saved.id, org: d.org, role: d.role, fromMonth: `${d.startYear}-01`, toMonth: null, isCurrent: true, summary: `Leadership role at ${d.org}.`, sort: 0 }),
      ]);
      if (d.boards.length) {
        await boardRepo.save(d.boards.map((b, i) => boardRepo.create({ applicationId: saved.id, org: b.org, position: b.position, type: b.type, period: b.period, sort: i })));
      }
      await expRepo.save(d.expertise.map((value) => expRepo.create({ applicationId: saved.id, value })));
      await refRepo.save([
        refRepo.create({ applicationId: saved.id, name: 'Ato Bekele Worku', positionOrg: 'Former Supervisor, NBE', email: 'bekele.ref@example.com', phone: '+251911234567', relationship: 'Former manager', sort: 0 }),
        refRepo.create({ applicationId: saved.id, name: 'W/ro Aster Demissie', positionOrg: 'Board Colleague', email: 'aster.ref@example.com', phone: '+251922345678', relationship: 'Board colleague', sort: 1 }),
      ]);
      await declRepo.save(
        ALL_DECLARATION_IDS.map((itemId) =>
          declRepo.create({
            applicationId: saved.id,
            itemId,
            answer: itemId === d.flagItem ? DeclarationAnswer.Yes : DeclarationAnswer.No,
            explanation: itemId === d.flagItem ? 'Disclosed for transparency; no ongoing conflict.' : null,
          }),
        ),
      );
      await docRepo.save(
        docTypes.map((docType) =>
          docRepo.create({
            applicationId: saved.id,
            docType,
            originalFilename: `${docLabel[docType]}_${d.first}_${d.last}.pdf`,
            storageKey: `demo/${saved.id}/${docType}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: '204800',
            scannedClean: true,
          }),
        ),
      );

      // Reviews + scores for anything past 'submitted' so reports/evaluation populate.
      const reviewed = d.status !== ApplicationStatus.Submitted;
      if (reviewed) {
        const base = d.status === ApplicationStatus.Selected ? 9 : d.status === ApplicationStatus.Shortlisted ? 8 : d.status === ApplicationStatus.NotSelected ? 5 : 7;
        const panel = reviewers.slice(0, d.status === ApplicationStatus.UnderReview ? 2 : 4);
        for (let r = 0; r < panel.length; r++) {
          const reviewer = panel[r];
          const scores: Record<string, number> = {};
          let weighted = 0;
          for (const c of Object.keys(CRITERION_WEIGHTS) as CriterionId[]) {
            const v = Math.max(1, Math.min(SCORE_MAX, base + ((r + c.length) % 3) - 1));
            scores[c] = v;
            weighted += (v / SCORE_MAX) * CRITERION_WEIGHTS[c];
          }
          await scoreRepo.save(
            (Object.keys(scores) as CriterionId[]).map((criterionId) =>
              scoreRepo.create({ applicationId: saved.id, reviewerUserId: reviewer.id, criterionId, value: scores[criterionId] }),
            ),
          );
          await reviewRepo.save(
            reviewRepo.create({
              applicationId: saved.id,
              reviewerUserId: reviewer.id,
              comment: 'Strong governance background; recommended for the next stage.',
              shortlistRecommended: d.status === ApplicationStatus.Shortlisted || d.status === ApplicationStatus.Selected,
              submitted: true,
              weightedScore: weighted.toFixed(2),
            }),
          );
        }
      }
    }

    this.logger.warn(`Demo seed complete: ${REVIEWERS.length} reviewers + auditor + recommender + ${APPLICANTS.length} applicants.`);
  }
}
