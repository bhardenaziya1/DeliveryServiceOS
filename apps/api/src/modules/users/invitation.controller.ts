import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  acceptInvitationSchema,
  type AcceptInvitationInput,
  type AuthSession,
} from '@vendoros/shared';
import { InvitationService, type InvitationPreview } from './invitation.service';
import { Public } from '../../common/rbac/rbac.decorators';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import type { AuditRequestContext } from '../../common/audit/audit.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiStandardErrorResponses } from '../../common/swagger/api-standard-errors.decorator';

/**
 * The anonymous half of the invitation flow.
 *
 * Separate from both `AuthController` (which would make the auth module depend
 * on the users module) and the authenticated `UserController` (whose every
 * other route requires a permission). The invitation token is the only
 * credential a caller has here.
 */
@ApiTags('invitations')
@ApiStandardErrorResponses()
@Controller('invitations')
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Public()
  @Get(':token')
  @ApiOperation({
    summary: 'Preview an invitation before accepting it',
    description:
      'Returns only what the acceptance screen needs to render: the tenant name, the invited ' +
      'address and the roles being granted.',
  })
  preview(@Param('token') token: string): Promise<InvitationPreview> {
    return this.invitationService.preview(token);
  }

  @Public()
  @Post('accept')
  @ApiOperation({
    summary: 'Accept an invitation, creating the user and signing them in',
    description: 'The roles granted come from the invitation record, never from the request body.',
  })
  accept(
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitationInput,
    @RequestContext() context: AuditRequestContext,
  ): Promise<AuthSession> {
    return this.invitationService.accept(body, context);
  }
}
