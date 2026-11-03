import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../common/database/prisma.js';

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
  panelApiUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResult {
  token: string;
  tenant: SafeTenant;
}

// Dummy hash used for constant-time comparison when email is not found (prevents timing attacks)
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$anVsNDg5YWY3ODkyOTFhMA$3iF3Zk9w/b6rX0q8y3Z6Qj';

export class AuthService {
  private readonly jwtSecret: string;

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
   * Registers a new tenant with Argon2 password hashing.
   */
  async signup(dto: SignupDto): Promise<AuthResult> {
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
        subscriptionStatus: 'INACTIVE'
      }
    });

    const token = this.generateToken(tenant.id, tenant.email);

    return {
      token,
      tenant: this.sanitizeTenant(tenant)
    };
  }

  /**
   * Authenticates tenant with Argon2 verification and timing attack mitigation.
   */
  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password;

    if (!email || !password) {
      const error: any = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { email }
    });

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

    const token = this.generateToken(tenant.id, tenant.email);

    return {
      token,
      tenant: this.sanitizeTenant(tenant)
    };
  }

  /**
   * Initiates password recovery. Generates a 1-hour secure token and returns constant-time confirmation.
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
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

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

    const resetUrl = `${baseUrl || ''}/reset-password?token=${rawToken}`;
    console.log(`[AuthService] Password reset token generated for ${cleanEmail}: ${resetUrl}`);

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

    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

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
      panelApiUrl: tenant.panelApiUrl ?? null,
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
