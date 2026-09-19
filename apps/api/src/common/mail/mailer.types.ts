/**
 * The transactional-mail port.
 *
 * Auth flows depend on this interface, never on a provider SDK, so swapping
 * the log driver for SES/Postmark/SendGrid is one new class and one env value -
 * and the tests can assert "an invitation was sent to this address" without a
 * network, a sandbox account or a fixture inbox.
 */
export const MAILER = Symbol('MAILER');

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Rendering HTML is the driver's concern, not the caller's. */
  text: string;
  /**
   * The single action the email exists to prompt, when there is one.
   * Kept separate from `text` so drivers and tests can address it directly.
   */
  actionUrl?: string;
}

export interface MailerService {
  send(message: EmailMessage): Promise<void>;
}
