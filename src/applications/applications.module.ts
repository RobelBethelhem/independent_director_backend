import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { DocumentScanService } from './documents/document-scan.service';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { Application } from './entities/application.entity';
import { EducationEntry } from './entities/education-entry.entity';
import { ProfessionalQual } from './entities/professional-qual.entity';
import { EmploymentEntry } from './entities/employment-entry.entity';
import { BoardEntry } from './entities/board-entry.entity';
import { ExpertiseSelection } from './entities/expertise.entity';
import { ReferenceContact } from './entities/reference-contact.entity';
import { Declaration } from './entities/declaration.entity';
import { ApplicationDocument } from './entities/document.entity';
import { ReviewScore } from './entities/review-score.entity';
import { Review } from './entities/review.entity';
import { Message } from './entities/message.entity';

@Module({
  imports: [
    RecruitmentModule,
    TypeOrmModule.forFeature([
      Application,
      EducationEntry,
      ProfessionalQual,
      EmploymentEntry,
      BoardEntry,
      ExpertiseSelection,
      ReferenceContact,
      Declaration,
      ApplicationDocument,
      // Registered here so the schema is created now; controllers for these
      // (documents, reviewer scoring, admin messaging) come in later phases.
      ReviewScore,
      Review,
      Message,
    ]),
  ],
  controllers: [ApplicationsController, DocumentsController],
  providers: [ApplicationsService, DocumentsService, DocumentScanService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
