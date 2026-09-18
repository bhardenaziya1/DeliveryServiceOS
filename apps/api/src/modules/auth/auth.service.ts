import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuditAction } from '@prisma/client';
import { AuthSession, LoginInput } from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
  ) {}

  async login(input: LoginInput): Promise<AuthSession> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email },
    });

    const passwordValid = user ? await argon2.verify(user.passwordHash, input.password) : false;

    if (!user || !user.isActive || !passwordValid) {
      if (user) {
        await this.auditService.record({
          tenantId: user.tenantId,
          actorUserId: user.id,
          entityType: 'User',
          entityId: user.id,
          action: AuditAction.LOGIN_FAILED,
        });
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditService.record({
      tenantId: user.tenantId,
      actorUserId: user.id,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.LOGIN,
    });

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}
