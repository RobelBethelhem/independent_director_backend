import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { SeedService } from './seed.service';
import { HealthController } from './health.controller';

@Module({
  imports: [UsersModule],
  controllers: [HealthController],
  providers: [SeedService],
})
export class SeedModule {}
