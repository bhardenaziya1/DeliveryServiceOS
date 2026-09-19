import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { MAILER, type MailerService } from './mailer.types';

/**
 * Composes the four transactional emails the identity flows send.
 *
 * The copy and - more importantly - the link structure live here rather than
 * inside the auth services, so the token-handling code stays about tokens and
 * there is exactly one place that decides what a reset URL looks like.
 */
@Injectable()
export class AuthMailService {
  constructor(
    @Inject(MAILER) private readonly mailer: MailerService,
    private readonly config: AppConfigService,
  ) {}

  private link(path: string, token: string): string {
    const base = this.config.get('APP_WEB_URL').replace(/\/+$/, '');
    return `${base}${path}?token=${encodeURIComponent(token)}`;
  }

  async sendEmailVerification(params: {
    to: string;
    fullName: string;
    token: string;
    expiresInHours: number;
  }): Promise<void> {
    const actionUrl = this.link('/verify-email', params.token);
    await this.mailer.send({
      to: params.to,
      subject: 'Confirm your VendorOS email address',
      actionUrl,
      text:
        `Hi ${params.fullName},\n\n` +
        `Confirm this address to finish setting up your VendorOS account:\n\n${actionUrl}\n\n` +
        `The link expires in ${params.expiresInHours} hours.\n`,
    });
  }

  async sendPasswordReset(params: {
    to: string;
    fullName: string;
    token: string;
    expiresInMinutes: number;
  }): Promise<void> {
    const actionUrl = this.link('/reset-password', params.token);
    await this.mailer.send({
      to: params.to,
      subject: 'Reset your VendorOS password',
      actionUrl,
      text:
        `Hi ${params.fullName},\n\n` +
        `Someone asked to reset the password for this account. If it was you, ` +
        `choose a new password here:\n\n${actionUrl}\n\n` +
        `The link expires in ${params.expiresInMinutes} minutes and can only be used once. ` +
        `If it was not you, ignore this email - your password has not changed.\n`,
    });
  }

  async sendInvitation(params: {
    to: string;
    fullName: string;
    tenantName: string;
    invitedByName: string;
    token: string;
    expiresInDays: number;
  }): Promise<void> {
    const actionUrl = this.link('/accept-invitation', params.token);
    await this.mailer.send({
      to: params.to,
      subject: `${params.invitedByName} invited you to ${params.tenantName} on VendorOS`,
      actionUrl,
      text:
        `Hi ${params.fullName},\n\n` +
        `${params.invitedByName} has invited you to join ${params.tenantName} on VendorOS. ` +
        `Set a password to accept:\n\n${actionUrl}\n\n` +
        `The invitation expires in ${params.expiresInDays} days.\n`,
    });
  }

  /**
   * Sent after a password changes - to the address that owns the account, not
   * to whoever changed it. A reset the real owner did not initiate has to be
   * visible to them.
   */
  async sendPasswordChangedNotice(params: { to: string; fullName: string }): Promise<void> {
    await this.mailer.send({
      to: params.to,
      subject: 'Your VendorOS password was changed',
      text:
        `Hi ${params.fullName},\n\n` +
        `The password on your VendorOS account was just changed and every other ` +
        `signed-in session was ended.\n\n` +
        `If this was not you, contact your administrator immediately.\n`,
    });
  }
}
