import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppConfigModule } from './config/config.module';
import { LoggingModule } from './common/logging/logging.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './common/audit/audit.module';
import { MailModule } from './common/mail/mail.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { TenantContextGuard } from './common/tenancy/tenant-context.guard';
import { PermissionsGuard } from './common/rbac/permissions.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/users/user.module';
import { RoleModule } from './modules/roles/role.module';
import { TenantModule } from './modules/tenants/tenant.module';
import { AuditLogModule } from './modules/audit/audit-log.module';
import { ClientModule } from './modules/clients/client.module';
import { ProjectModule } from './modules/projects/project.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // Platform layer: config -> logging -> data stores -> mail.
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    RedisModule,
    AuditModule,
    MailModule,
    HealthModule,

    // Identity and tenancy.
    AuthModule,
    UserModule,
    RoleModule,
    TenantModule,
    AuditLogModule,

    // Business modules.
    ClientModule,
    ProjectModule,
  ],
  providers: [
    // Registered here (rather than in `main.ts`) so they are injectable and
    // active in tests that import AppModule.
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    // The guard chain, in order. Nest runs APP_GUARDs in declaration order,
    // and each step depends on the previous one having run:
    //
    //   1. JwtAuthGuard        - authenticates, populates `request.user`;
    //                            everything is protected unless `@Public()`.
    //   2. TenantContextGuard  - derives the tenant from that user and refuses
    //                            any tenant id the client tried to supply.
    //   3. PermissionsGuard    - checks `@RequirePermissions` against the
    //                            user's resolved permissions.
    //
    // Being global is the point: a new controller is authenticated,
    // tenant-scoped and deny-by-default without remembering to add anything.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
