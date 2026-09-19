import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type AuthSession,
  type ChangePasswordInput,
  type CurrentUserResponse,
  type ForgotPasswordInput,
  type LoginInput,
  type LogoutInput,
  type RefreshTokenInput,
  type RegisterInput,
  type ResetPasswordInput,
  type SessionDto,
  type VerifyEmailInput,
} from '@vendoros/shared';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { Public } from '../../common/rbac/rbac.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { RequestUser } from '../../common/types/request-user';
import type { AuditRequestContext } from '../../common/audit/audit.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiStandardErrorResponses } from '../../common/swagger/api-standard-errors.decorator';

@ApiTags('auth')
@ApiStandardErrorResponses()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a tenant and its first Super Admin' })
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<AuthSession> {
    return this.authService.register(body, context);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<AuthSession> {
    return this.authService.login(body, context);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new pair',
    description:
      'The presented token is rotated (revoked and replaced). Replaying an already-rotated ' +
      'token revokes the entire session.',
  })
  refresh(
    @Body(new ZodValidationPipe(refreshTokenSchema)) body: RefreshTokenInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<AuthSession> {
    return this.authService.refresh(body.refreshToken, context);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a password reset link',
    description:
      'Always succeeds, whether or not the address is registered, so the endpoint cannot be ' +
      'used to discover which accounts exist.',
  })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<{ status: 'accepted' }> {
    await this.authService.forgotPassword(body.email, context);
    return { status: 'accepted' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<{ status: 'ok' }> {
    await this.authService.resetPassword(body.token, body.password, context);
    return { status: 'ok' };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<{ status: 'ok' }> {
    await this.authService.verifyEmail(body.token, context);
    return { status: 'ok' };
  }

  // -------------------------------------------------------------------------
  // Authenticated
  // -------------------------------------------------------------------------

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'The signed-in user, their tenant, roles and permissions' })
  me(@CurrentUser() user: RequestUser): Promise<CurrentUserResponse> {
    return this.authService.currentUser(user);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(logoutSchema)) body: LogoutInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<{ revokedSessions: number }> {
    return this.authService.logout(user, body, context);
  }

  @ApiBearerAuth()
  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change your own password',
    description: 'Revokes every other session; the calling session stays signed in.',
  })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<{ status: 'ok' }> {
    await this.authService.changePassword(user, body.currentPassword, body.newPassword, context);
    return { status: 'ok' };
  }

  @ApiBearerAuth()
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  async resendVerification(
    @CurrentUser() user: RequestUser,
    @RequestContext() context: AuditRequestContext,
  ): Promise<{ status: 'accepted' }> {
    await this.authService.resendEmailVerification(user, context);
    return { status: 'accepted' };
  }

  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({ summary: 'Your own active sessions' })
  sessions(@CurrentUser() user: RequestUser): Promise<SessionDto[]> {
    return this.sessionService.listForUser(user);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeSession(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @RequestContext() context: AuditRequestContext,
  ): Promise<void> {
    return this.sessionService.revokeOwn(user, id, context);
  }
}
