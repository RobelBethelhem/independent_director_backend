import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { UsersModule } from '../users/users.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { Application } from '../applications/entities/application.entity';
import { ApplicationDocument } from '../applications/entities/document.entity';
import { Message } from '../applications/entities/message.entity';
import { Review } from '../applications/entities/review.entity';
import { ReviewScore } from '../applications/entities/review-score.entity';
import { AuditLog } from '../audit/audit-log.entity';

@Module({
  imports: [
    RecruitmentModule,
    UsersModule,
    RecommendationsModule,
    TypeOrmModule.forFeature([Application, ApplicationDocument, Message, Review, ReviewScore, AuditLog]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
