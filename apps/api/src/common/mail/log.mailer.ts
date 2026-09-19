import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { EmailMessage, MailerService } from './mailer.types';

/**
 * Development and CI driver: writes the message - including the action link -
 * to the structured logger.
 *
 * This is what makes the invitation and password-reset flows testable end to
 * end without a mail provider: the link a real user would click is in the log.
 */
@Injectable()
export class LogMailer implements MailerService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LogMailer.name);
  }

  async send(message: EmailMessage): Promise<void> {
    this.logger.info(
      {
        to: message.to,
        subject: message.subject,
        actionUrl: message.actionUrl,
        body: message.text,
      },
      'Outbound email (log driver - nothing was actually sent)',
    );
  }
}
