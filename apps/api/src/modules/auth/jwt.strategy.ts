import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../../common/errors/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/types/request-user';

export interface JwtPayload {
  sub: string;
  tenantId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Validated at boot by the env schema, so there is no fallback secret.
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  // Re-fetches the user on every request instead of trusting the token
  // payload for tenantId/role, so a revoked or demoted user is rejected
  // immediately rather than at the token's natural expiry.
  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.isActive || user.tenantId !== payload.tenantId) {
      throw AppException.unauthorized('Invalid or expired session');
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }
}
