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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignRolesSchema,
  inviteUserSchema,
  paginationQuerySchema,
  updateProfileSchema,
  updateUserSchema,
  PERMISSIONS,
  type AssignRolesInput,
  type InvitationDto,
  type InviteUserInput,
  type PaginatedResult,
  type PaginationQuery,
  type UpdateProfileInput,
  type UpdateUserInput,
  type UserDto,
} from '@vendoros/shared';
import { UserService } from './user.service';
import { InvitationService } from './invitation.service';
import { RequirePermissions } from '../../common/rbac/rbac.decorators';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { TenantId } from '../../common/tenancy/tenant.decorator';
import { RequestUser } from '../../common/types/request-user';
import type { AuditRequestContext } from '../../common/audit/audit.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiStandardErrorResponses } from '../../common/swagger/api-standard-errors.decorator';

@ApiTags('users')
@ApiStandardErrorResponses()
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly invitationService: InvitationService,
  ) {}

  /**
   * The caller's own profile.
   *
   * Deliberately ahead of `:id` in the route table, and deliberately without a
   * permission - a Viewer must still be able to edit their own name.
   */
  @Patch('me')
  updateOwnProfile(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<UserDto> {
    return this.userService.updateOwnProfile(user, body, context);
  }

  @RequirePermissions(PERMISSIONS.USERS_READ)
  @Get()
  list(
    @TenantId() tenantId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<PaginatedResult<UserDto>> {
    return this.userService.list(tenantId, query);
  }

  @RequirePermissions(PERMISSIONS.USERS_INVITE)
  @Get('invitations')
  listInvitations(@TenantId() tenantId: string): Promise<InvitationDto[]> {
    return this.invitationService.list(tenantId);
  }

  @RequirePermissions(PERMISSIONS.USERS_INVITE)
  @Post('invitations')
  @ApiOperation({ summary: 'Invite a user into your own tenant' })
  invite(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(inviteUserSchema)) body: InviteUserInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<InvitationDto> {
    return this.invitationService.invite(user, body, context);
  }

  @RequirePermissions(PERMISSIONS.USERS_INVITE)
  @Delete('invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvitation(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @RequestContext() context: AuditRequestContext,
  ): Promise<void> {
    return this.invitationService.revoke(user, id, context);
  }

  @RequirePermissions(PERMISSIONS.USERS_READ)
  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string): Promise<UserDto> {
    return this.userService.findOne(tenantId, id);
  }

  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<UserDto> {
    return this.userService.update(user, id, body, context);
  }

  @RequirePermissions(PERMISSIONS.ROLES_ASSIGN)
  @Put(':id/roles')
  @ApiOperation({
    summary: "Replace a user's roles",
    description:
      'You cannot change your own roles, grant a role above your own, or demote the last ' +
      "Super Admin. All of the target user's sessions are revoked so the change takes effect " +
      'immediately.',
  })
  assignRoles(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignRolesSchema)) body: AssignRolesInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<UserDto> {
    return this.userService.assignRoles(user, id, body, context);
  }

  @RequirePermissions(PERMISSIONS.SESSIONS_REVOKE)
  @Delete(':id/sessions')
  @HttpCode(HttpStatus.OK)
  revokeSessions(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @RequestContext() context: AuditRequestContext,
  ): Promise<{ revokedSessions: number }> {
    return this.userService.revokeSessions(user, id, context);
  }
}
