import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Env } from '../../config/env.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char] ?? char;
  });
}

/** The deployment has no SMTP provider configured; nothing was attempted. */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super('SMTP_URL is not configured');
    this.name = 'EmailNotConfiguredError';
  }
}

@Injectable()
export class EmailService {
  private readonly transportUrl: string | undefined;
  private readonly from: string;
  private readonly appBaseUrl: string;
  private readonly isTest: boolean;

  constructor(config: ConfigService<Env, true>) {
    this.transportUrl = config.get('SMTP_URL', { infer: true });
    this.from = config.get('MAIL_FROM', { infer: true });
    this.appBaseUrl = config.get('APP_BASE_URL', { infer: true });
    this.isTest = config.get('NODE_ENV', { infer: true }) === 'test';
  }

  /** Throws `EmailNotConfiguredError` when no SMTP transport exists, so callers can record why. */
  async sendLeadReminder(input: {
    email: string;
    recipientName: string;
    leadId: string;
    leadName: string;
    companyName: string | null;
    nextAction: string;
    dueAtNairobi: string;
  }): Promise<void> {
    if (this.isTest) return;
    if (!this.transportUrl) throw new EmailNotConfiguredError();

    const leadUrl = new URL(
      `/leads/${encodeURIComponent(input.leadId)}`,
      this.appBaseUrl,
    ).toString();
    const subject = `Follow-up due: ${input.leadName}`;
    const subjectLine = subject.replace(/[\r\n]+/g, ' ');
    const who = input.companyName ? `${input.leadName} (${input.companyName})` : input.leadName;
    const transporter = nodemailer.createTransport(this.transportUrl);
    try {
      await transporter.sendMail({
        from: this.from,
        to: input.email,
        subject: subjectLine,
        text: [
          `Hello ${input.recipientName},`,
          '',
          `Your follow-up for ${who} was due ${input.dueAtNairobi} (Nairobi time).`,
          `Next action: ${input.nextAction}`,
          '',
          `Open the lead: ${leadUrl}`,
        ].join('\n'),
        html: `<p>Hello ${escapeHtml(input.recipientName)},</p><p>Your follow-up for <strong>${escapeHtml(who)}</strong> was due ${escapeHtml(input.dueAtNairobi)} (Nairobi time).</p><p>Next action: ${escapeHtml(input.nextAction)}</p><p><a href="${escapeHtml(leadUrl)}">Open the lead</a></p>`,
      });
    } finally {
      transporter.close();
    }
  }

  async sendInvitation(input: { email: string; fullName: string; token: string }): Promise<void> {
    if (this.isTest) return;
    if (!this.transportUrl) throw new Error('SMTP_URL is not configured');

    const invitationUrl = new URL('/accept-invitation', this.appBaseUrl);
    invitationUrl.hash = new URLSearchParams({ token: input.token }).toString();
    const name = escapeHtml(input.fullName);
    const link = escapeHtml(invitationUrl.toString());
    const transporter = nodemailer.createTransport(this.transportUrl);
    try {
      await transporter.sendMail({
        from: this.from,
        to: input.email,
        subject: 'Finish setting up your Autonova CRM account',
        text: [
          `Hello ${input.fullName},`,
          '',
          'You have been invited to Autonova CRM. Set a password to activate your account:',
          invitationUrl.toString(),
          '',
          'This link expires in 48 hours and can only be used once. If you were not expecting this invitation, ignore this email.',
        ].join('\n'),
        html: `<p>Hello ${name},</p><p>You have been invited to Autonova CRM. Set a password to activate your account:</p><p><a href="${link}">Set up your account</a></p><p>This link expires in 48 hours and can only be used once. If you were not expecting this invitation, ignore this email.</p>`,
      });
    } finally {
      transporter.close();
    }
  }
}
