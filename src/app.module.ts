import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AuditInterceptor } from './audit/audit.interceptor';
import { requestContextMiddleware } from './common/request-context';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RecruitmentModule } from './recruitment/recruitment.module';
import { ApplicationsModule } from './applications/applications.module';
import { AdminModule } from './admin/admin.module';
import { ReviewModule } from './review/review.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('database.url'),
        autoLoadEntities: true,
        synchronize: config.getOrThrow<boolean>('database.synchronize'),
        logging: config.getOrThrow<boolean>('database.logging'),
      }),
    }),
    AuthModule,
    UsersModule,
    RecruitmentModule,
    ApplicationsModule,
    AdminModule,
    ReviewModule,
    RecommendationsModule,
    AuditModule,
    NotificationsModule,
    StorageModule,
  ],
  providers: [
    // Secure-by-default: every route requires a valid JWT unless marked @Public(),
    // then role checks run via @Roles().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Records every state-changing action to the audit trail.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule implements NestModule {
  // Opens an async-local request context (IP / user-agent / actor) for every request.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestContextMiddleware).forRoutes('*');
  }
}
