import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';
import { UserContextService } from './user-context.service';
import type { AccessTokenPayload } from './token.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Validated at boot by the env schema, so there is no fallback secret.
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  /**
   * Turns a verified token into the request's identity.
   *
   * Nothing authorising is taken from the token itself. The user is re-read on
   * every request, so a deactivated user, a changed role or a revoked session
   * is rejected immediately rather than at the token's natural expiry - which
   * is what keeps a 15-minute access token safe to hand out.
   */
  async validate(payload: AccessTokenPayload): Promise<RequestUser> {
    if (!payload?.sub || !payload.tenantId || !payload.sid) {
      throw AppException.unauthorized('Invalid or expired session');
    }

    const user = await this.userContext.findById(payload.sub, payload.tenantId);

    if (!user || user.status !== UserStatus.ACTIVE || !user.tenant.isActive) {
      throw AppException.unauthorized('Invalid or expired session');
    }

    const session = await this.prisma.session.findFirst({
      where: { id: payload.sid, tenantId: payload.tenantId, userId: payload.sub },
      select: { id: true, revokedAt: true, expiresAt: true },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw AppException.unauthorized('Invalid or expired session');
    }

    return UserContextService.toRequestUser(user, session.id);
  }
}
