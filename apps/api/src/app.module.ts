import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppConfigModule } from './config/config.module';
import { LoggingModule } from './common/logging/logging.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './common/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientModule } from './modules/clients/client.module';
import { ProjectModule } from './modules/projects/project.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Platform layer: config -> logging -> data stores.
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    RedisModule,
    AuditModule,
    HealthModule,

    // Business modules.
    AuthModule,
    ClientModule,
    ProjectModule,
  ],
  providers: [
    // Registered here (rather than in `main.ts`) so they are injectable and
    // active in tests that import AppModule.
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
