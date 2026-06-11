import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RecruitmentModule } from '../recruitment/recruitment.module';
import { SeedService } from './seed.service';
import { DemoSeedService } from './demo-seed.service';
import { HealthController } from './health.controller';

@Module({
  imports: [UsersModule, RecruitmentModule],
  controllers: [HealthController],
  providers: [SeedService, DemoSeedService],
})
export class SeedModule {}
