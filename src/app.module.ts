import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { SeedModule } from './seed/seed.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { SecurityModule } from './security/security.module';
import { SupportModule } from './support/support.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Baseline per-IP DoS backstop (300 req/min); auth endpoints tighten this
    // dramatically via @Throttle() to stop credential/OTP/2FA brute force.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('database.url'),
        autoLoadEntities: true,
        synchronize: config.getOrThrow<boolean>('database.synchronize'),
        logging: config.getOrThrow<boolean>('database.logging'),
        // Managed Postgres providers terminate TLS with their own CA.
        ssl: config.getOrThrow<boolean>('database.ssl') ? { rejectUnauthorized: false } : false,
        // Pool + safety timeouts. Default pool is 10; without a statement timeout
        // a single stuck query/lock can tie up connections until the pool is
        // exhausted and the API stalls. Limits are generous enough never to trip a
        // legitimate query at this scale, but bound a hung one.
        extra: {
          max: 20,
          statement_timeout: 30_000,
          idle_in_transaction_session_timeout: 60_000,
        },
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
    SecurityModule,
    SupportModule,
    SeedModule,
  ],
  providers: [
    // Runs first: rate-limit before auth so unauthenticated brute force is
    // capped before it ever reaches password/OTP verification.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
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
