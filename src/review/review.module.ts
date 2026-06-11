import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { Application } from '../applications/entities/application.entity';
import { ApplicationDocument } from '../applications/entities/document.entity';
import { Review } from '../applications/entities/review.entity';
import { ReviewScore } from '../applications/entities/review-score.entity';

@Module({
  imports: [
    RecruitmentModule,
    RecommendationsModule,
    TypeOrmModule.forFeature([Application, ApplicationDocument, Review, ReviewScore]),
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
