import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../../common/errors/app.exception';
import { PUBLIC_KEY } from '../../common/rbac/rbac.decorators';

/**
 * Authentication, applied globally.
 *
 * Registered as an `APP_GUARD`, so every route requires a valid access token
 * unless it is explicitly marked `@Public()`. A new endpoint is therefore
 * protected by default - the failure mode of forgetting a decorator is a 401
 * on a route that should have been public, not an unauthenticated data leak.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Normalises every passport failure - missing header, malformed token,
   * expired token - into the same error envelope, so a client cannot learn
   * anything from which one it got.
   */
  override handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) {
      if (err instanceof AppException) throw err;
      throw AppException.unauthorized('Authentication required');
    }
    return user;
  }
}
