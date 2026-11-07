import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { Prisma } from '@prisma/client';
import { prisma } from '../common/database/prisma.js';
import { redis } from '../common/redis/redis.js';
import { TotpService, TotpSetupResult } from '../common/auth/totp.service.js';
import { emailService } from '../common/email/email.service.js';
import { hashSha256 } from '../common/crypto/encryption.js';
import { settingsService } from '../common/settings/settings.service.js';

export interface SignupDto {
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface SafeTenant {
  id: string;
  email: string;
  subscriptionStatus: string;
  botToken: string | null;
  botUsername: string | null;
  panelApiUrl: string | null;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  googleId: string | null;
  mfaEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResult {
  token?: string;
  tenant?: SafeTenant;
  mfaRequired?: boolean;
  mfaSessionToken?: string;
  message?: string;
}

// Dummy hash used for constant-time comparison when email is not found (prevents timing attacks)
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$anVsNDg5YWY3ODkyOTFhMA$3iF3Zk9w/b6rX0q8y3Z6Qj';

export class AuthService {
  private readonly jwtSecret: string;
  private readonly mfaPendingMap: Map<string, { encryptedSecret: string; hashedBackupCodes: string[]; expiresAt: number }> = new Map();

  constructor() {
    const secret = process.env.JWT_SECRET;
    if (process.env.NODE_ENV === 'production' && (!secret || secret === 'super-secret-jwt-key-for-tenant-admin' || secret.length < 32)) {
      throw new Error('[FATAL] JWT_SECRET must be configured with at least 32 cryptographically secure characters in production.');
    }
    this.jwtSecret = secret || 'super-secret-jwt-key-for-tenant-admin';
  }

  /**
   * Hashes a password using Argon2id with memory-hard parameters.
   */
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,       // 3 iterations
      parallelism: 4
    });
  }

  /**
   * Timing-safe verification of plaintext password against an Argon2 hash.
   */
  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Registers a new tenant with Argon2 password hashing and triggers email verification.
   */
  async signup(dto: SignupDto, baseUrl?: string): Promise<AuthResult> {
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password;

    if (!email || !this.isValidEmail(email)) {
      throw new Error('Please provide a valid email address');
    }

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const existing = await prisma.tenant.findUnique({
      where: { email }
    });

    if (existing) {
      const error: any = new Error('An account with this email already exists');
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await this.hashPassword(password);

    const tenant = await prisma.tenant.create({
      data: {
        email,
        passwordHash,
        subscriptionStatus: 'INACTIVE',
        emailVerified: false
      }
    });

    // Send email verification asynchronously (do not fail registration if SMTP is down)
    this.createAndSendVerificationEmail(tenant.id, tenant.email, baseUrl).catch((err) => {
      console.warn('[AuthService] Could not dispatch verification email on signup:', err?.message || err);
    });

    const token = this.generateToken(tenant.id, tenant.email);

    return {
      token,
      tenant: this.sanitizeTenant(tenant)
    };
  }

  /**
   * Authenticates tenant with Argon2 verification and timing attack mitigation.
   * If MFA is enabled, issues a temporary mfaSessionToken challenge.
   */
  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password;

    if (!email || !password) {
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    let tenant = await prisma.tenant.findUnique({
      where: { email }
    });

    if (!tenant && !email.includes('@')) {
      // Allow login by username / email prefix (e.g., 'grownexventures')
      tenant = await prisma.tenant.findFirst({
        where: {
          email: {
            startsWith: `${email}@`,
            mode: 'insensitive'
          }
        }
      });
    }

    if (!tenant) {
      // Execute dummy verify to equalize response latency against timing attacks
      await this.verifyPassword(DUMMY_HASH, password);
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const valid = await this.verifyPassword(tenant.passwordHash, password);
    if (!valid) {
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    // If tenant has MFA enabled, return challenge instead of full token
    if (tenant.mfaEnabled) {
      const mfaSessionToken = this.generateMfaSessionToken(tenant.id, tenant.email);
      return {
        mfaRequired: true,
        mfaSessionToken,
        message: 'Two-factor authentication code required'
      };
    }

    const token = this.generateToken(tenant.id, tenant.email);

    return {
      token,
      tenant: this.sanitizeTenant(tenant)
    };
  }

  /**
   * Generates a 5-minute temporary JWT for the MFA challenge
   */
  generateMfaSessionToken(tenantId: string, email: string): string {
    return jwt.sign(
      {
        sub: tenantId,
        tenantId,
        email,
        scope: 'mfa_pending'
      },
      this.jwtSecret,
      { expiresIn: '5m', audience: 'mfa_challenge' }
    );
  }

  /**
   * Verifies an MFA challenge token and TOTP or backup code to complete login.
   */
  async verifyMfaLogin(mfaSessionToken: string, code: string): Promise<AuthResult> {
    if (!mfaSessionToken || !code) {
      const error: any = new Error('MFA session token and verification code are required.');
      error.statusCode = 400;
      throw error;
    }

    let payload: any;
    try {
      payload = jwt.verify(mfaSessionToken, this.jwtSecret, { audience: 'mfa_challenge' });
    } catch {
      const error: any = new Error('Two-factor session has expired or is invalid. Please log in again.');
      error.statusCode = 401;
      throw error;
    }

    if (payload.scope !== 'mfa_pending') {
      const error: any = new Error('Invalid token scope');
      error.statusCode = 403;
      throw error;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: payload.tenantId }
    });

    if (!tenant || !tenant.mfaEnabled || !tenant.mfaSecret) {
      const error: any = new Error('MFA is not enabled on this account.');
      error.statusCode = 400;
      throw error;
    }

    const cleanCode = code.trim();
    let isTotpValid = false;

    // Check 6-digit TOTP
    if (/^\d{6}$/.test(cleanCode)) {
      isTotpValid = TotpService.verifyEncryptedSecret(tenant.mfaSecret, cleanCode);
    }

    if (!isTotpValid) {
      // Check if it matches an unused backup code
      const backupCodes = (tenant.mfaBackupCodes as string[]) || [];
      const backupResult = TotpService.verifyAndConsumeBackupCode(cleanCode, backupCodes);

      if (backupResult.valid) {
        // Persist updated backup codes list
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: { mfaBackupCodes: backupResult.remainingHashedCodes }
        });
      } else {
        const error: any = new Error('Invalid verification code or backup code.');
        error.statusCode = 401;
        throw error;
      }
    }

    const token = this.generateToken(tenant.id, tenant.email);

    return {
      token,
      tenant: this.sanitizeTenant(tenant)
    };
  }

  /**
   * Initializes MFA setup for an authenticated tenant.
   */
  async setupMfa(tenantId: string): Promise<Omit<TotpSetupResult, 'encryptedSecret' | 'hashedBackupCodes'>> {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      const error: any = new Error('Tenant not found');
      error.statusCode = 404;
      throw error;
    }

    const setup = await TotpService.setupMfa(tenant.email);

    // Save pending secret with 10-minute expiry in Redis (with in-memory fallback)
    try {
      await redis.set(`mfa:pending:${tenantId}`, JSON.stringify({
        encryptedSecret: setup.encryptedSecret,
        hashedBackupCodes: setup.hashedBackupCodes
      }), 'EX', 600);
    } catch {
      this.mfaPendingMap.set(tenantId, {
        encryptedSecret: setup.encryptedSecret,
        hashedBackupCodes: setup.hashedBackupCodes,
        expiresAt: Date.now() + 600 * 1000
      });
    }

    return {
      secret: setup.secret,
      otpauthUrl: setup.otpauthUrl,
      qrCodeDataUrl: setup.qrCodeDataUrl,
      backupCodes: setup.backupCodes
    };
  }

  /**
   * Confirms and activates MFA with submitted 6-digit code.
   */
  async enableMfa(tenantId: string, code: string): Promise<{ success: boolean; message: string }> {
    if (!code || !/^\d{6}$/.test(code.trim())) {
      const error: any = new Error('Please enter a valid 6-digit verification code.');
      error.statusCode = 400;
      throw error;
    }

    let pendingData: { encryptedSecret: string; hashedBackupCodes: string[] } | null = null;

    try {
      const cached = await redis.get(`mfa:pending:${tenantId}`);
      if (cached) {
        pendingData = JSON.parse(cached);
      }
    } catch {}

    if (!pendingData) {
      const mem = this.mfaPendingMap.get(tenantId);
      if (mem && mem.expiresAt > Date.now()) {
        pendingData = mem;
      }
    }

    if (!pendingData) {
      const error: any = new Error('MFA setup session has expired. Please restart the 2FA setup process.');
      error.statusCode = 400;
      throw error;
    }

    const valid = TotpService.verifyEncryptedSecret(pendingData.encryptedSecret, code.trim());
    if (!valid) {
      const error: any = new Error('Invalid verification code. Please check your authenticator app time and code.');
      error.statusCode = 400;
      throw error;
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        mfaEnabled: true,
        mfaSecret: pendingData.encryptedSecret,
        mfaBackupCodes: pendingData.hashedBackupCodes
      }
    });

    try {
      await redis.del(`mfa:pending:${tenantId}`);
    } catch {}
    this.mfaPendingMap.delete(tenantId);

    return {
      success: true,
      message: 'Two-factor authentication has been enabled successfully.'
    };
  }

  /**
   * Disables MFA for an authenticated tenant. Requires password or valid TOTP code.
   */
  async disableMfa(tenantId: string, passwordOrCode: string): Promise<{ success: boolean; message: string }> {
    if (!passwordOrCode) {
      const error: any = new Error('Your password or current 2FA code is required to disable two-factor authentication.');
      error.statusCode = 400;
      throw error;
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      const error: any = new Error('Tenant not found');
      error.statusCode = 404;
      throw error;
    }

    let authorized = false;

    // First attempt password check
    if (tenant.passwordHash) {
      authorized = await this.verifyPassword(tenant.passwordHash, passwordOrCode);
    }

    // If password didn't match, attempt 6-digit TOTP code check
    if (!authorized && tenant.mfaSecret && /^\d{6}$/.test(passwordOrCode.trim())) {
      authorized = TotpService.verifyEncryptedSecret(tenant.mfaSecret, passwordOrCode.trim());
    }

    if (!authorized) {
      const error: any = new Error('Invalid credentials provided. 2FA could not be disabled.');
      error.statusCode = 401;
      throw error;
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: Prisma.DbNull
      }
    });

    return {
      success: true,
      message: 'Two-factor authentication has been disabled.'
    };
  }

  /**
   * Authenticates tenant with Google OAuth ID Token (Google Identity Services)
   * Source: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
   */
  async loginWithGoogle(credential: string): Promise<AuthResult> {
    if (!credential || typeof credential !== 'string') {
      const error: any = new Error('Google credential token is required.');
      error.statusCode = 400;
      throw error;
    }

    let email: string;
    let googleId: string;
    let emailVerified: boolean;

    // Support simulated/mock tokens in unit test environments
    if (process.env.NODE_ENV === 'test' && credential.startsWith('mock-google:')) {
      const parts = credential.split(':');
      email = parts[1] || 'test@example.com';
      googleId = parts[2] || 'google-test-id-123';
      emailVerified = true;
    } else {
      const clientId = await settingsService.get('GOOGLE_CLIENT_ID');
      if (!clientId) {
        const error: any = new Error('Google Sign-In is not configured on this server (GOOGLE_CLIENT_ID missing).');
        error.statusCode = 503;
        throw error;
      }

      try {
        const client = new OAuth2Client(clientId);
        const ticket = await client.verifyIdToken({
          idToken: credential,
          audience: clientId
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email || !payload.sub) {
          throw new Error('Incomplete Google identity profile returned');
        }
        email = payload.email.trim().toLowerCase();
        googleId = payload.sub;
        emailVerified = Boolean(payload.email_verified);
      } catch (err: any) {
        const error: any = new Error(`Google authentication failed: ${err.message}`);
        error.statusCode = 401;
        throw error;
      }
    }

    if (!emailVerified) {
      const error: any = new Error('Your Google account email is not verified by Google. Please verify it with Google first.');
      error.statusCode = 403;
      throw error;
    }

    // Check if account already exists by googleId or email
    let tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { googleId },
          { email }
        ]
      }
    });

    if (tenant) {
      // Link googleId if missing, ensure emailVerified is true
      if (!tenant.googleId || !tenant.emailVerified) {
        tenant = await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            googleId: tenant.googleId || googleId,
            emailVerified: true,
            emailVerifiedAt: tenant.emailVerifiedAt || new Date()
          }
        });
      }
    } else {
      // Auto-provision tenant
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await this.hashPassword(randomPassword);

      tenant = await prisma.tenant.create({
        data: {
          email,
          googleId,
          passwordHash,
          subscriptionStatus: 'INACTIVE',
          emailVerified: true,
          emailVerifiedAt: new Date()
        }
      });
    }

    // Check if MFA is enabled
    if (tenant.mfaEnabled) {
      const mfaSessionToken = this.generateMfaSessionToken(tenant.id, tenant.email);
      return {
        mfaRequired: true,
        mfaSessionToken,
        message: 'Two-factor authentication code required'
      };
    }

    const token = this.generateToken(tenant.id, tenant.email);

    return {
      token,
      tenant: this.sanitizeTenant(tenant)
    };
  }

  /**
   * Generates a 32-byte secure email verification token and dispatches verification email
   */
  async createAndSendVerificationEmail(tenantId: string, email: string, baseUrl?: string): Promise<{ success: boolean; message: string; rawToken?: string }> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSha256(rawToken);

    // Invalidate prior unused verification tokens
    await prisma.emailVerificationToken.updateMany({
      where: { tenantId, used: false },
      data: { used: true }
    });

    // 24-hour expiration
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.emailVerificationToken.create({
      data: {
        tenantId,
        tokenHash,
        expiresAt,
        used: false
      }
    });

    const verifyUrl = `${baseUrl || process.env.APP_URL || 'https://app.yoursmmagent.com'}/verify-email?token=${rawToken}`;
    await emailService.sendEmailVerificationEmail(email, verifyUrl);

    return {
      success: true,
      message: 'Verification email sent successfully.',
      ...(process.env.NODE_ENV !== 'production' ? { rawToken } : {})
    };
  }

  /**
   * Verifies an email verification token
   */
  async verifyEmail(token: string): Promise<{ success: boolean; message: string; tenant?: SafeTenant }> {
    if (!token || typeof token !== 'string') {
      const error: any = new Error('Email verification token is required.');
      error.statusCode = 400;
      throw error;
    }

    const tokenHash = hashSha256(token.trim());

    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash }
    });

    if (!record || record.used || record.expiresAt < new Date()) {
      const error: any = new Error('Verification link is invalid, expired, or has already been used.');
      error.statusCode = 400;
      throw error;
    }

    const [updatedTenant] = await prisma.$transaction([
      prisma.tenant.update({
        where: { id: record.tenantId },
        data: {
          emailVerified: true,
          emailVerifiedAt: new Date()
        }
      }),
      prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { used: true }
      })
    ]);

    return {
      success: true,
      message: 'Your email address has been verified successfully.',
      tenant: this.sanitizeTenant(updatedTenant)
    };
  }

  /**
   * Resends verification email for a tenant or email address
   */
  async resendVerification(emailOrTenantId: string, baseUrl?: string): Promise<{ success: boolean; message: string }> {
    const genericResponse = {
      success: true,
      message: 'If the account exists and is unverified, a new verification email has been sent.'
    };

    if (!emailOrTenantId) return genericResponse;

    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { id: emailOrTenantId },
          { email: emailOrTenantId.trim().toLowerCase() }
        ]
      }
    });

    if (!tenant || tenant.emailVerified) {
      return genericResponse;
    }

    await this.createAndSendVerificationEmail(tenant.id, tenant.email, baseUrl);
    return genericResponse;
  }

  /**
   * Initiates password recovery. Generates a 1-hour secure token, dispatches email, and returns constant-time confirmation.
   */
  async forgotPassword(email: string, baseUrl?: string): Promise<{ success: boolean; message: string; resetToken?: string }> {
    const cleanEmail = email?.trim().toLowerCase();
    const genericResponse = {
      success: true,
      message: 'If an account matches this email, reset instructions have been dispatched.'
    };

    if (!cleanEmail || !this.isValidEmail(cleanEmail)) {
      return genericResponse;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { email: cleanEmail }
    });

    if (!tenant) {
      // Dummy verify to equalize response time
      await this.verifyPassword(DUMMY_HASH, 'dummy_password');
      return genericResponse;
    }

    // Generate 32-byte secure random token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSha256(rawToken);

    // Invalidate existing unused tokens for this tenant
    await prisma.passwordResetToken.updateMany({
      where: { tenantId: tenant.id, used: false },
      data: { used: true }
    });

    // Create 1-hour valid token
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.passwordResetToken.create({
      data: {
        tenantId: tenant.id,
        tokenHash,
        expiresAt,
        used: false
      }
    });

    const resetUrl = `${baseUrl || process.env.APP_URL || 'https://app.yoursmmagent.com'}/reset-password?token=${rawToken}`;
    
    // Dispatch real email via Nodemailer
    await emailService.sendPasswordResetEmail(cleanEmail, resetUrl);

    return {
      ...genericResponse,
      ...(process.env.NODE_ENV !== 'production' ? { resetToken: rawToken } : {})
    };
  }

  /**
   * Resets tenant password using a valid, unexpired reset token.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!token || typeof token !== 'string') {
      const error: any = new Error('Password reset token is required.');
      error.statusCode = 400;
      throw error;
    }

    if (!newPassword || newPassword.length < 8) {
      const error: any = new Error('New password must be at least 8 characters long.');
      error.statusCode = 400;
      throw error;
    }

    const tokenHash = hashSha256(token.trim());

    const resetRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash }
    });

    if (!resetRecord || resetRecord.used || resetRecord.expiresAt < new Date()) {
      const error: any = new Error('Password reset token is invalid, used, or has expired.');
      error.statusCode = 400;
      throw error;
    }

    const passwordHash = await this.hashPassword(newPassword);

    // Atomically update password and mark token as used
    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: resetRecord.tenantId },
        data: { passwordHash }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { used: true }
      })
    ]);

    return {
      success: true,
      message: 'Password has been reset successfully. You may now log in.'
    };
  }

  /**
   * Authenticated password change verifying current password before hashing new password
   */
  async changePassword(tenantId: string, currentPass: string, newPass: string): Promise<{ success: boolean; message: string }> {
    if (!currentPass) {
      const error: any = new Error('Current password is required.');
      error.statusCode = 400;
      throw error;
    }

    if (!newPass || newPass.length < 8) {
      const error: any = new Error('New password must be at least 8 characters long.');
      error.statusCode = 400;
      throw error;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      const error: any = new Error('Tenant not found.');
      error.statusCode = 404;
      throw error;
    }

    const valid = await this.verifyPassword(tenant.passwordHash, currentPass);
    if (!valid) {
      const error: any = new Error('Current password is incorrect.');
      error.statusCode = 400;
      throw error;
    }

    const passwordHash = await this.hashPassword(newPass);
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { passwordHash }
    });

    return {
      success: true,
      message: 'Password changed successfully.'
    };
  }

  /**
   * Generates a signed JWT for the authenticated tenant.
   */
  generateToken(tenantId: string, email: string): string {
    return jwt.sign(
      {
        tenantId,
        sub: tenantId,
        email
      },
      this.jwtSecret,
      { expiresIn: '7d' }
    );
  }

  private sanitizeTenant(tenant: any): SafeTenant {
    return {
      id: tenant.id,
      email: tenant.email,
      subscriptionStatus: tenant.subscriptionStatus,
      botToken: tenant.botToken ?? null,
      botUsername: tenant.botUsername ?? null,
      panelApiUrl: tenant.panelApiUrl ?? null,
      emailVerified: Boolean(tenant.emailVerified),
      emailVerifiedAt: tenant.emailVerifiedAt ?? null,
      googleId: tenant.googleId ?? null,
      mfaEnabled: Boolean(tenant.mfaEnabled),
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export const authService = new AuthService();
