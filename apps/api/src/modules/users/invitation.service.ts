import { Injectable } from '@nestjs/common';
import { AuditAction, UserStatus } from '@prisma/client';
import {
  canManageRole,
  isRoleKey,
  type AcceptInvitationInput,
  type AuthSession,
  type InvitationDto,
  type InviteUserInput,
  type RoleKey,
} from '@vendoros/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../../common/errors/app.exception';
import { AuditService, type AuditRequestContext } from '../../common/audit/audit.service';
import { PasswordService } from '../../common/crypto/password.service';
import { AuthMailService } from '../../common/mail/auth-mail.service';
import { generateSecureToken, hashToken } from '../../common/crypto/secure-token';
import type { RequestUser } from '../../common/types/request-user';
import { TokenService } from '../auth/token.service';
import { UserContextService } from '../auth/user-context.service';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/** What an invitee is allowed to see before they have any credentials. */
export interface InvitationPreview {
  email: string;
  fullName: string;
  tenantName: string;
  roles: RoleKey[];
  expiresAt: string;
}

/**
 * Invitation lifecycle: issue, preview, accept, revoke.
 *
 * Accepting is what creates the `User` row, so an unaccepted invitation never
 * occupies the email address, and a revoked one leaves nothing behind.
 */
@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly auditService: AuditService,
    private readonly authMail: AuthMailService,
    private readonly config: AppConfigService,
  ) {}

  async list(tenantId: string): Promise<InvitationDto[]> {
    const invitations = await this.prisma.invitation.findMany({
      where: { tenantId, acceptedAt: null, revokedAt: null },
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map(toInvitationDto);
  }

  /**
   * Invites someone into the caller's tenant.
   *
   * The tenant is the caller's, never a parameter - so there is no request
   * shape that invites a user into somebody else's tenant.
   */
  async invite(
    actor: RequestUser,
    input: InviteUserInput,
    context?: AuditRequestContext,
  ): Promise<InvitationDto> {
    this.assertCanGrant(actor, input.roleKeys);

    // Unscoped: email is globally unique, so an address already taken in
    // *another* tenant must block this invitation too - a tenant-scoped check
    // would pass here and then fail at acceptance time with a confusing error.
    const existingUser = await this.prisma.unscoped(() =>
      this.prisma.user.findUnique({ where: { email: input.email } }),
    );

    if (existingUser) {
      throw AppException.conflict('An account already exists for this email address');
    }

    const roles = await this.prisma.role.findMany({ where: { key: { in: input.roleKeys } } });
    if (roles.length !== input.roleKeys.length) {
      throw AppException.validation('One or more roles are unknown');
    }

    const { token, tokenHash } = generateSecureToken();
    const ttlDays = this.config.get('INVITATION_TTL_DAYS');

    const invitation = await this.prisma.$transaction(async (tx) => {
      // Re-inviting supersedes any outstanding invitation for the address.
      await tx.invitation.updateMany({
        where: { tenantId: actor.tenantId, email: input.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      return tx.invitation.create({
        data: {
          tenantId: actor.tenantId,
          email: input.email,
          fullName: input.fullName,
          tokenHash,
          invitedByUserId: actor.id,
          expiresAt: new Date(Date.now() + ttlDays * MILLISECONDS_PER_DAY),
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        include: { roles: { include: { role: true } } },
      });
    });

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: actor.tenantId } });

    await this.authMail.sendInvitation({
      to: input.email,
      fullName: input.fullName,
      tenantName: tenant.name,
      invitedByName: actor.fullName,
      token,
      expiresInDays: ttlDays,
    });

    await this.auditService.recordForUser(actor, {
      entityType: 'Invitation',
      entityId: invitation.id,
      action: AuditAction.USER_INVITED,
      after: { email: input.email, fullName: input.fullName, roles: input.roleKeys },
      ...context,
    });

    return toInvitationDto(invitation);
  }

  /** What the acceptance screen shows before the invitee sets a password. */
  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.findRedeemable(token);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: invitation.tenantId },
    });

    return {
      email: invitation.email,
      fullName: invitation.fullName,
      tenantName: tenant.name,
      roles: invitation.roles.map((link) => link.role.key).filter(isRoleKey),
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * Accepts an invitation: creates the user, grants the invited roles and
   * signs them in.
   *
   * The roles come from the invitation row, not from the request - the invitee
   * cannot upgrade themselves on the way in.
   */
  async accept(input: AcceptInvitationInput, context?: AuditRequestContext): Promise<AuthSession> {
    const invitation = await this.findRedeemable(input.token);
    const passwordHash = await this.passwordService.hash(input.password);

    const user = await this.prisma.unscoped(() =>
      this.prisma.$transaction(async (tx) => {
        const taken = await tx.user.findUnique({ where: { email: invitation.email } });
        if (taken) {
          throw AppException.conflict('An account already exists for this email address');
        }

        const created = await tx.user.create({
          data: {
            tenantId: invitation.tenantId,
            email: invitation.email,
            passwordHash,
            fullName: input.fullName,
            status: UserStatus.ACTIVE,
            passwordChangedAt: new Date(),
            // Following the emailed link is itself proof of mailbox control.
            emailVerifiedAt: new Date(),
            roles: {
              create: invitation.roles.map((link) => ({
                tenantId: invitation.tenantId,
                roleId: link.roleId,
                assignedById: invitation.invitedByUserId,
              })),
            },
          },
          include: { tenant: true, roles: { include: { role: true } } },
        });

        await tx.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });

        return created;
      }),
    );

    await this.auditService.record({
      ...context,
      tenantId: user.tenantId,
      actorUserId: user.id,
      actorEmail: user.email,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.USER_REGISTERED,
      after: {
        email: user.email,
        via: 'invitation',
        roles: UserContextService.roleKeys(user),
      },
    });

    const tokens = await this.tokenService.issueSession({
      userId: user.id,
      tenantId: user.tenantId,
      rememberMe: false,
      context,
    });

    await this.auditService.record({
      ...context,
      tenantId: user.tenantId,
      actorUserId: user.id,
      actorEmail: user.email,
      entityType: 'User',
      entityId: user.id,
      action: AuditAction.LOGIN,
    });

    return {
      ...tokens,
      user: UserContextService.toAuthUser(user),
      tenant: UserContextService.toAuthTenant(user),
    };
  }

  async revoke(
    actor: RequestUser,
    invitationId: string,
    context?: AuditRequestContext,
  ): Promise<void> {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, tenantId: actor.tenantId, acceptedAt: null, revokedAt: null },
    });

    if (!invitation) {
      throw AppException.notFound('Invitation');
    }

    await this.prisma.invitation.update({
      where: { id: invitation.id, tenantId: actor.tenantId },
      data: { revokedAt: new Date() },
    });

    await this.auditService.recordForUser(actor, {
      entityType: 'Invitation',
      entityId: invitation.id,
      action: AuditAction.DELETE,
      before: { email: invitation.email },
      ...context,
    });
  }

  /**
   * An invitation that is still redeemable, or a uniform validation error.
   *
   * Unscoped because the caller is anonymous: the token is what establishes
   * which tenant they are joining.
   */
  private async findRedeemable(token: string) {
    const invitation = await this.prisma.unscoped(() =>
      this.prisma.invitation.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { roles: { include: { role: true } } },
      }),
    );

    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw AppException.validation('This invitation is invalid or has expired');
    }

    return invitation;
  }

  /** Nobody may invite someone into a role more privileged than their own. */
  private assertCanGrant(actor: RequestUser, roleKeys: readonly string[]): void {
    const forbidden = roleKeys.filter((role) => !canManageRole(actor.roles, role));

    if (forbidden.length > 0) {
      throw AppException.forbidden(
        `You cannot grant a role more privileged than your own: ${forbidden.join(', ')}`,
      );
    }
  }
}

type InvitationRecord = {
  id: string;
  tenantId: string;
  email: string;
  fullName: string;
  invitedByUserId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  roles: { role: { key: string } }[];
};

function toInvitationDto(invitation: InvitationRecord): InvitationDto {
  return {
    id: invitation.id,
    tenantId: invitation.tenantId,
    email: invitation.email,
    fullName: invitation.fullName,
    roles: invitation.roles.map((link) => link.role.key).filter(isRoleKey),
    invitedByUserId: invitation.invitedByUserId,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
  };
}
