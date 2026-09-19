import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { InvitationController } from './invitation.controller';
import { UserService } from './user.service';
import { InvitationService } from './invitation.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  // For TokenService (session revocation on demotion/disable) and
  // UserContextService.
  imports: [AuthModule],
  controllers: [UserController, InvitationController],
  providers: [UserService, InvitationService],
  exports: [UserService, InvitationService],
})
export class UserModule {}
