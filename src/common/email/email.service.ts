/**
 * Enterprise Email Dispatch Service
 * Handles transactional emails (Password Reset, Email Verification, Security Alerts) via SMTP (Nodemailer).
 * In development or when SMTP is unconfigured, logs rendered email links cleanly to server logs.
 * Source: https://nodemailer.com/
 */
import nodemailer, { Transporter } from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private fromAddress: string;
  private readonly appUrl: string;

  constructor() {
    this.fromAddress = process.env.SMTP_FROM || 'YourSMMagent <no-reply@yoursmmagent.com>';
    this.appUrl = process.env.APP_URL || 'https://app.yoursmmagent.com';

    this.initTransporter();
  }

  /**
   * Reloads SMTP transporter dynamically at runtime.
   */
  reloadConfig(custom?: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string }): void {
    const host = custom?.host ?? process.env.SMTP_HOST?.trim();
    const port = custom?.port ?? parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = custom?.secure ?? (process.env.SMTP_SECURE === 'true' || port === 465);
    const user = custom?.user ?? process.env.SMTP_USER?.trim();
    const pass = custom?.pass ?? process.env.SMTP_PASS?.trim();
    if (custom?.from) {
      this.fromAddress = custom.from;
    }

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
      });
      console.log(`[EmailService] SMTP transport reloaded for ${host}:${port} (from: ${this.fromAddress})`);
    } else {
      this.transporter = null;
      console.log('[EmailService] SMTP config incomplete, reverting to console fallback.');
    }
  }

  private initTransporter(): void {
    const host = process.env.SMTP_HOST?.trim();
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: {
          rejectUnauthorized: process.env.NODE_ENV === 'production'
        }
      });
      console.log(`[EmailService] Initialized SMTP transport for ${host}:${port} (from: ${this.fromAddress})`);
    } else {
      console.log('[EmailService] SMTP credentials not fully configured. Using stdout logger fallback for transactional emails.');
    }
  }

  /**
   * Dispatches an email via SMTP or logs to console
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    const { to, subject, text, html } = options;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.fromAddress,
          to,
          subject,
          text,
          html
        });
        console.log(`[EmailService] Email successfully delivered to ${to} (${subject})`);
        return true;
      } catch (err: any) {
        console.error(`[EmailService] Failed to deliver email to ${to}:`, err.message);
        // Fall back to console log so links are never lost
        this.logEmailToConsole(to, subject, text);
        return false;
      }
    } else {
      this.logEmailToConsole(to, subject, text);
      return true;
    }
  }

  private logEmailToConsole(to: string, subject: string, text: string): void {
    console.log('\n========================= [OUTBOUND EMAIL DISPATCH] =========================');
    console.log(`TO:      ${to}`);
    console.log(`FROM:    ${this.fromAddress}`);
    console.log(`SUBJECT: ${subject}`);
    console.log('CONTENT:');
    console.log(text.trim());
    console.log('=============================================================================\n');
  }

  /**
   * Dispatches Password Reset Email with 1-hour expiration
   */
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
    const subject = 'Reset Your Password - YourSMMagent';
    const text = `Hello,\n\nYou requested a password reset for your YourSMMagent account.\n\nPlease visit the following link within 1 hour to set a new password:\n${resetUrl}\n\nIf you did not request this, please disregard this email or contact support.\n\n— The YourSMMagent Team`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #f8fafc; margin: 0; padding: 40px 20px; }
    .card { background-color: #131b2e; border: 1px solid #223049; border-radius: 16px; max-width: 520px; margin: 0 auto; padding: 36px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .brand { font-size: 20px; font-weight: 800; color: #ffffff; margin-bottom: 24px; display: inline-block; text-decoration: none; }
    .brand span { color: #818cf8; }
    h1 { font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px; }
    .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; padding: 13px 28px; font-size: 15px; font-weight: 700; border-radius: 8px; text-decoration: none; margin: 16px 0; }
    .subtle { font-size: 13px; color: #94a3b8; line-height: 1.5; margin-top: 24px; border-top: 1px solid #223049; padding-top: 20px; }
    .token-url { word-break: break-all; color: #818cf8; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <a href="${this.appUrl}" class="brand">Your<span>SMM</span>agent</a>
    <h1>Password Recovery Request</h1>
    <p>We received a request to reset your password for <strong>${to}</strong>.</p>
    <p>Click the button below to choose a new password. This secure link expires in <strong>1 hour</strong>.</p>
    <div>
      <a href="${resetUrl}" class="btn" target="_blank">Reset My Password</a>
    </div>
    <p class="subtle">If the button above does not work, copy and paste this link into your browser:<br><span class="token-url">${resetUrl}</span></p>
    <p class="subtle">If you did not request a password reset, no further action is required. Your account remains completely secure.</p>
  </div>
</body>
</html>
    `;

    return this.sendEmail({ to, subject, text, html });
  }

  /**
   * Dispatches Email Verification Email with 24-hour expiration
   */
  async sendEmailVerificationEmail(to: string, verifyUrl: string): Promise<boolean> {
    const subject = 'Verify Your Email Address - YourSMMagent';
    const text = `Hello,\n\nWelcome to YourSMMagent! Please verify your email address to secure your account.\n\nClick the link below:\n${verifyUrl}\n\nThis verification link is valid for 24 hours.\n\n— The YourSMMagent Team`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Verify Your Email</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #f8fafc; margin: 0; padding: 40px 20px; }
    .card { background-color: #131b2e; border: 1px solid #223049; border-radius: 16px; max-width: 520px; margin: 0 auto; padding: 36px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .brand { font-size: 20px; font-weight: 800; color: #ffffff; margin-bottom: 24px; display: inline-block; text-decoration: none; }
    .brand span { color: #818cf8; }
    h1 { font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.6; color: #cbd5e1; margin-bottom: 20px; }
    .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; padding: 13px 28px; font-size: 15px; font-weight: 700; border-radius: 8px; text-decoration: none; margin: 16px 0; }
    .subtle { font-size: 13px; color: #94a3b8; line-height: 1.5; margin-top: 24px; border-top: 1px solid #223049; padding-top: 20px; }
    .token-url { word-break: break-all; color: #818cf8; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <a href="${this.appUrl}" class="brand">Your<span>SMM</span>agent</a>
    <h1>Confirm Your Email Address</h1>
    <p>Thank you for creating your YourSMMagent control center account for <strong>${to}</strong>.</p>
    <p>Please click the button below to confirm your email address and activate your account features:</p>
    <div>
      <a href="${verifyUrl}" class="btn" target="_blank">Verify Email Address</a>
    </div>
    <p class="subtle">If the button does not open, copy and paste this link into your browser:<br><span class="token-url">${verifyUrl}</span></p>
    <p class="subtle">This verification link will expire in 24 hours.</p>
  </div>
</body>
</html>
    `;

    return this.sendEmail({ to, subject, text, html });
  }
}

export const emailService = new EmailService();
