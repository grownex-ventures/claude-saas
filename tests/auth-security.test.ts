import { describe, it, expect, vi, beforeEach } from 'vitest';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { authService } from '../src/auth/auth.service.js';
import { authController } from '../src/auth/auth.controller.js';
import { TotpService } from '../src/common/auth/totp.service.js';
import { emailService } from '../src/common/email/email.service.js';
import { prisma } from '../src/common/database/prisma.js';

describe('Enterprise Authentication & Account Security Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Multi-Factor Authentication (MFA / 2FA)', () => {
    it('returns an MFA challenge session when user has mfaEnabled = true', async () => {
      const password = 'SecurePassword123!';
      const hash = await argon2.hash(password);

      const mfaSecret = TotpService.generateSecret();
      const encryptedSecret = TotpService.setupMfa ? (await TotpService.setupMfa('mfa-user@test.com')).encryptedSecret : 'iv:tag:cipher';

      const mockTenant = {
        id: 'tenant-mfa-1',
        email: 'mfa-user@test.com',
        passwordHash: hash,
        subscriptionStatus: 'ACTIVE',
        mfaEnabled: true,
        mfaSecret: encryptedSecret,
        mfaBackupCodes: [],
        botToken: null,
        panelApiUrl: null,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(mockTenant as any);

      const result = await authService.login({
        email: 'mfa-user@test.com',
        password
      });

      expect(result.mfaRequired).toBe(true);
      expect(result.token).toBeUndefined(); // Must NOT issue full auth token yet
      expect(result.mfaSessionToken).toBeDefined();

      // Verify the mfaSessionToken has 5m expiration and mfa_pending scope
      const decoded: any = jwt.verify(
        result.mfaSessionToken!,
        process.env.JWT_SECRET || 'super-secret-jwt-key-for-tenant-admin',
        { audience: 'mfa_challenge' }
      );
      expect(decoded.scope).toBe('mfa_pending');
      expect(decoded.tenantId).toBe('tenant-mfa-1');
    });

    it('completes login when valid 6-digit TOTP code is provided', async () => {
      const setup = await TotpService.setupMfa('mfa-user@test.com');
      const validCode = TotpService.generateToken(setup.secret);

      const mockTenant = {
        id: 'tenant-mfa-1',
        email: 'mfa-user@test.com',
        mfaEnabled: true,
        mfaSecret: setup.encryptedSecret,
        mfaBackupCodes: setup.hashedBackupCodes,
        subscriptionStatus: 'ACTIVE',
        emailVerified: true,
        botToken: null,
        panelApiUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(mockTenant as any);

      const mfaSessionToken = authService.generateMfaSessionToken('tenant-mfa-1', 'mfa-user@test.com');
      const result = await authService.verifyMfaLogin(mfaSessionToken, validCode);

      expect(result.token).toBeDefined();
      expect(result.tenant).toBeDefined();
      expect(result.tenant!.id).toBe('tenant-mfa-1');
      expect(result.tenant!.mfaEnabled).toBe(true);
    });

    it('completes login with a valid emergency backup code and removes it from tenant record', async () => {
      const setup = await TotpService.setupMfa('mfa-user@test.com');
      const backupCode = setup.backupCodes[0];

      const mockTenant = {
        id: 'tenant-mfa-1',
        email: 'mfa-user@test.com',
        mfaEnabled: true,
        mfaSecret: setup.encryptedSecret,
        mfaBackupCodes: setup.hashedBackupCodes,
        subscriptionStatus: 'ACTIVE',
        emailVerified: true,
        botToken: null,
        panelApiUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(mockTenant as any);
      const updateSpy = vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce(mockTenant as any);

      const mfaSessionToken = authService.generateMfaSessionToken('tenant-mfa-1', 'mfa-user@test.com');
      const result = await authService.verifyMfaLogin(mfaSessionToken, backupCode);

      expect(result.token).toBeDefined();
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'tenant-mfa-1' },
        data: { mfaBackupCodes: expect.any(Array) }
      });
      // One backup code was consumed (8 down to 7)
      const passedCodes = updateSpy.mock.calls[0][0].data.mfaBackupCodes as any[];
      expect(passedCodes).toHaveLength(7);
    });

    it('rejects invalid TOTP codes with 401', async () => {
      const setup = await TotpService.setupMfa('mfa-user@test.com');
      const mockTenant = {
        id: 'tenant-mfa-1',
        email: 'mfa-user@test.com',
        mfaEnabled: true,
        mfaSecret: setup.encryptedSecret,
        mfaBackupCodes: setup.hashedBackupCodes
      };

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(mockTenant as any);

      const mfaSessionToken = authService.generateMfaSessionToken('tenant-mfa-1', 'mfa-user@test.com');
      await expect(authService.verifyMfaLogin(mfaSessionToken, '000000')).rejects.toThrow('Invalid verification code');
    });

    it('allows disabling MFA when valid password or code is provided', async () => {
      const password = 'CorrectPassword123';
      const hash = await argon2.hash(password);

      const mockTenant = {
        id: 'tenant-mfa-1',
        email: 'mfa-user@test.com',
        passwordHash: hash,
        mfaEnabled: true,
        mfaSecret: 'encrypted-secret'
      };

      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(mockTenant as any);
      const updateSpy = vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({ ...mockTenant, mfaEnabled: false } as any);

      const result = await authService.disableMfa('tenant-mfa-1', password);
      expect(result.success).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'tenant-mfa-1' },
        data: {
          mfaEnabled: false,
          mfaSecret: null,
          mfaBackupCodes: expect.anything()
        }
      });
    });
  });

  describe('2. Google Sign-In & Single Sign-On', () => {
    it('creates and verifies tenant automatically on valid Google credential', async () => {
      vi.spyOn(prisma.tenant, 'findFirst').mockResolvedValueOnce(null);
      const createSpy = vi.spyOn(prisma.tenant, 'create').mockResolvedValueOnce({
        id: 'google-new-tenant',
        email: 'googleuser@gmail.com',
        googleId: 'google-sub-12345',
        subscriptionStatus: 'INACTIVE',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        mfaEnabled: false,
        botToken: null,
        panelApiUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      const result = await authService.loginWithGoogle('mock-google:googleuser@gmail.com:google-sub-12345');

      expect(result.token).toBeDefined();
      expect(result.tenant).toBeDefined();
      expect(result.tenant!.email).toBe('googleuser@gmail.com');
      expect(result.tenant!.emailVerified).toBe(true);
      expect(createSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'googleuser@gmail.com',
          googleId: 'google-sub-12345',
          emailVerified: true
        })
      });
    });

    it('links existing account when email matches Google profile', async () => {
      const existingTenant = {
        id: 'existing-tenant-id',
        email: 'existing@example.com',
        googleId: null,
        emailVerified: false,
        mfaEnabled: false,
        subscriptionStatus: 'ACTIVE',
        botToken: null,
        panelApiUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      vi.spyOn(prisma.tenant, 'findFirst').mockResolvedValueOnce(existingTenant as any);
      const updateSpy = vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        ...existingTenant,
        googleId: 'google-sub-999',
        emailVerified: true
      } as any);

      const result = await authService.loginWithGoogle('mock-google:existing@example.com:google-sub-999');

      expect(result.token).toBeDefined();
      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: 'existing-tenant-id' },
        data: expect.objectContaining({
          googleId: 'google-sub-999',
          emailVerified: true
        })
      });
    });

    it('enforces MFA challenge even when signing in via Google if tenant has 2FA enabled', async () => {
      const mfaTenant = {
        id: 'existing-mfa-tenant',
        email: 'mfa@example.com',
        googleId: 'google-mfa-sub',
        emailVerified: true,
        mfaEnabled: true,
        mfaSecret: 'enc-secret'
      };

      vi.spyOn(prisma.tenant, 'findFirst').mockResolvedValueOnce(mfaTenant as any);

      const result = await authService.loginWithGoogle('mock-google:mfa@example.com:google-mfa-sub');
      expect(result.mfaRequired).toBe(true);
      expect(result.mfaSessionToken).toBeDefined();
      expect(result.token).toBeUndefined();
    });
  });

  describe('3. Email Verification Flow', () => {
    it('creates a 24-hour verification token and sends verification email', async () => {
      const emailSpy = vi.spyOn(emailService, 'sendEmailVerificationEmail').mockResolvedValueOnce(true);
      vi.spyOn(prisma.emailVerificationToken, 'updateMany').mockResolvedValueOnce({ count: 0 });
      const createTokenSpy = vi.spyOn(prisma.emailVerificationToken, 'create').mockResolvedValueOnce({} as any);

      const result = await authService.createAndSendVerificationEmail('tenant-1', 'reseller@panel.com', 'https://app.yoursmmagent.com');

      expect(result.success).toBe(true);
      expect(emailSpy).toHaveBeenCalledWith(
        'reseller@panel.com',
        expect.stringContaining('https://app.yoursmmagent.com/verify-email?token=')
      );
      expect(createTokenSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          tokenHash: expect.any(String),
          used: false
        })
      });
    });

    it('verifies token and marks tenant.emailVerified = true atomically', async () => {
      const rawToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const record = {
        id: 'token-rec-1',
        tenantId: 'tenant-to-verify',
        tokenHash: 'hash',
        used: false,
        expiresAt: new Date(Date.now() + 100000)
      };

      vi.spyOn(prisma.emailVerificationToken, 'findUnique').mockResolvedValueOnce(record as any);
      vi.spyOn(prisma.tenant, 'update').mockResolvedValueOnce({
        id: 'tenant-to-verify',
        email: 'verified@example.com',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        mfaEnabled: false,
        subscriptionStatus: 'ACTIVE',
        botToken: null,
        panelApiUrl: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);
      vi.spyOn(prisma.emailVerificationToken, 'update').mockResolvedValueOnce({ id: 'token-rec-1', used: true } as any);
      vi.spyOn(prisma, '$transaction').mockResolvedValueOnce([
        {
          id: 'tenant-to-verify',
          email: 'verified@example.com',
          emailVerified: true,
          emailVerifiedAt: new Date(),
          mfaEnabled: false,
          subscriptionStatus: 'ACTIVE',
          botToken: null,
          panelApiUrl: null,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        { id: 'token-rec-1', used: true }
      ] as any);

      const result = await authService.verifyEmail(rawToken);
      expect(result.success).toBe(true);
      expect(result.tenant!.emailVerified).toBe(true);
    });

    it('rejects expired or used email verification tokens', async () => {
      vi.spyOn(prisma.emailVerificationToken, 'findUnique').mockResolvedValueOnce({
        id: 'token-expired',
        used: true,
        expiresAt: new Date(Date.now() - 1000)
      } as any);

      await expect(authService.verifyEmail('expired-token')).rejects.toThrow('invalid, expired, or has already been used');
    });
  });

  describe('4. Password Reset with Real Email Integration', () => {
    it('dispatches password reset email via EmailService when tenant exists', async () => {
      const emailSpy = vi.spyOn(emailService, 'sendPasswordResetEmail').mockResolvedValueOnce(true);
      vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
        id: 'tenant-pw-reset',
        email: 'owner@smm.com'
      } as any);
      vi.spyOn(prisma.passwordResetToken, 'updateMany').mockResolvedValueOnce({ count: 0 });
      vi.spyOn(prisma.passwordResetToken, 'create').mockResolvedValueOnce({} as any);

      const result = await authService.forgotPassword('owner@smm.com', 'https://app.yoursmmagent.com');

      expect(result.success).toBe(true);
      expect(emailSpy).toHaveBeenCalledWith(
        'owner@smm.com',
        expect.stringContaining('https://app.yoursmmagent.com/reset-password?token=')
      );
    });
  });
});
