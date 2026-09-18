import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientModule } from './modules/clients/client.module';
import { ProjectModule } from './modules/projects/project.module';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    ClientModule,
    ProjectModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
