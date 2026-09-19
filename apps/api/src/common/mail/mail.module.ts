import { Global, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppConfigService } from '../../config/app-config.service';
import { LogMailer } from './log.mailer';
import { NoopMailer } from './noop.mailer';
import { MAILER, type MailerService } from './mailer.types';
import { AuthMailService } from './auth-mail.service';

/**
 * Binds the `MAILER` port to the driver named by `MAIL_DRIVER`.
 *
 * Global because the auth, user and tenant modules all send mail and none of
 * them should know which driver is configured.
 */
@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [AppConfigService, PinoLogger],
      useFactory: (config: AppConfigService, logger: PinoLogger): MailerService =>
        config.get('MAIL_DRIVER') === 'noop' ? new NoopMailer() : new LogMailer(logger),
    },
    AuthMailService,
  ],
  exports: [MAILER, AuthMailService],
})
export class MailModule {}
