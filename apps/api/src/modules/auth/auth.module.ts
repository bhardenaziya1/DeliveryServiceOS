import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfigService } from '../../config/app-config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { TokenService } from './token.service';
import { SessionService } from './session.service';
import { UserContextService } from './user-context.service';
import { PasswordService } from '../../common/crypto/password.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES_IN') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    TokenService,
    SessionService,
    UserContextService,
    PasswordService,
  ],
  // TokenService and UserContextService are exported because the users module
  // revokes sessions on demotion and resolves role sets for invitations.
  exports: [AuthService, TokenService, UserContextService, PasswordService],
})
export class AuthModule {}
