import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportThread } from './entities/support-thread.entity';
import { SupportMessage } from './entities/support-message.entity';
import { SupportService } from './support.service';
import { SupportController } from './support.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([SupportThread, SupportMessage]), StorageModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
