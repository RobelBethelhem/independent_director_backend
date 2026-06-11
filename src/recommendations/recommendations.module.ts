import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recommendation } from './recommendation.entity';
import { Application } from '../applications/entities/application.entity';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { UsersModule } from '../users/users.module';
import { RecruitmentModule } from '../recruitment/recruitment.module';

@Module({
  imports: [TypeOrmModule.forFeature([Recommendation, Application]), UsersModule, RecruitmentModule],
  providers: [RecommendationsService],
  controllers: [RecommendationsController],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
