import { Injectable } from '@nestjs/common';
import type { EmailMessage, MailerService } from './mailer.types';

/**
 * Drops every message.
 *
 * For environments that must never emit mail and must never log a live reset
 * link either - a shared demo instance, or a load test.
 */
@Injectable()
export class NoopMailer implements MailerService {
  async send(_message: EmailMessage): Promise<void> {
    // Intentionally empty.
  }
}
