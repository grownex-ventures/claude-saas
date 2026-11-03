import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { prisma } from '../src/common/database/prisma.js';

describe('AuthService & Argon2 Password Hashing', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.restoreAllMocks();
    authService = new AuthService();
  });

  it('hashes passwords using Argon2id', async () => {
    const rawPassword = 'SecurePassword123!';
    const hash = await authService.hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(hash).toContain('$argon2id$');

    const isValid = await argon2.verify(hash, rawPassword);
    expect(isValid).toBe(true);

    const isInvalid = await argon2.verify(hash, 'WrongPassword');
    expect(isInvalid).toBe(false);
  });

  it('verifies passwords correctly with timing-safe verifyPassword helper', async () => {
    const raw = 'my-secret-pass';
    const hash = await authService.hashPassword(raw);

    expect(await authService.verifyPassword(hash, raw)).toBe(true);
    expect(await authService.verifyPassword(hash, 'wrong')).toBe(false);
  });

  it('rejects signup with invalid email format', async () => {
    await expect(authService.signup({ email: 'invalid-email', password: 'ValidPassword123' }))
      .rejects.toThrow('Please provide a valid email address');
  });

  it('rejects signup with short password under 8 characters', async () => {
    await expect(authService.signup({ email: 'user@example.com', password: '123' }))
      .rejects.toThrow('Password must be at least 8 characters long');
  });

  it('throws 409 Conflict if tenant email already exists', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: 'existing-id',
      email: 'existing@example.com'
    } as any);

    await expect(authService.signup({ email: 'existing@example.com', password: 'ValidPassword123' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('successfully creates new tenant with hashed password and returns safe profile', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(null);

    const createdTenant = {
      id: 'new-tenant-1',
      email: 'newuser@example.com',
      passwordHash: 'argon2-hash-value',
      subscriptionStatus: 'INACTIVE',
      botToken: null,
      panelApiUrl: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(prisma.tenant, 'create').mockResolvedValueOnce(createdTenant as any);

    const result = await authService.signup({
      email: 'newuser@example.com',
      password: 'StrongPassword123!'
    });

    expect(result.token).toBeDefined();
    expect(result.tenant.id).toBe('new-tenant-1');
    expect(result.tenant.email).toBe('newuser@example.com');
    // Ensure passwordHash is NEVER exposed in result
    expect((result.tenant as any).passwordHash).toBeUndefined();

    const decoded: any = jwt.verify(result.token, process.env.JWT_SECRET || 'super-secret-jwt-key-for-tenant-admin');
    expect(decoded.tenantId).toBe('new-tenant-1');
    expect(decoded.email).toBe('newuser@example.com');
  });

  it('authenticates tenant and returns token on valid login', async () => {
    const rawPass = 'ValidPassword123';
    const hash = await argon2.hash(rawPass);

    const existingTenant = {
      id: 'login-tenant-id',
      email: 'login@example.com',
      passwordHash: hash,
      subscriptionStatus: 'ACTIVE',
      botToken: 'bot-123',
      panelApiUrl: 'https://panel.example.com',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(existingTenant as any);

    const result = await authService.login({
      email: 'login@example.com',
      password: rawPass
    });

    expect(result.token).toBeDefined();
    expect(result.tenant.id).toBe('login-tenant-id');
    expect((result.tenant as any).passwordHash).toBeUndefined();
  });

  it('throws 401 when password does not match on login', async () => {
    const rawPass = 'CorrectPass123';
    const hash = await argon2.hash(rawPass);

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: 'login-tenant-id',
      email: 'login@example.com',
      passwordHash: hash
    } as any);

    await expect(authService.login({
      email: 'login@example.com',
      password: 'WrongPassword!'
    })).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 401 when tenant email is not found', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(null);

    await expect(authService.login({
      email: 'notfound@example.com',
      password: 'AnyPassword123'
    })).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(() => {
    vi.restoreAllMocks();
    controller = new AuthController();
  });

  it('returns 201 with auth payload on successful signup', async () => {
    const req = {
      body: { email: 'test@example.com', password: 'StrongPassword123' }
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(null);
    vi.spyOn(prisma.tenant, 'create').mockResolvedValueOnce({
      id: 't-123',
      email: 'test@example.com',
      passwordHash: 'hash',
      subscriptionStatus: 'INACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    } as any);

    await controller.signup(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Account created successfully',
      token: expect.any(String),
      tenant: expect.objectContaining({ id: 't-123' })
    }));
  });

  it('returns 401 on failed login', async () => {
    const req = {
      body: { email: 'unknown@example.com', password: 'SecretPassword123' }
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(null);

    await controller.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Invalid email or password'
    }));
  });

  it('sets httpOnly auth_token and client-accessible csrf_token cookies on successful login', async () => {
    const rawPass = 'SecretPassword123';
    const hash = await argon2.hash(rawPass);

    const req = {
      body: { email: 'cookie-user@example.com', password: rawPass }
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      cookie: vi.fn().mockReturnThis(),
    } as any;

    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: 'cookie-tenant-1',
      email: 'cookie-user@example.com',
      passwordHash: hash,
      subscriptionStatus: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    } as any);

    await controller.login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.cookie).toHaveBeenCalledWith('auth_token', expect.any(String), expect.objectContaining({
      httpOnly: true,
      sameSite: 'strict',
      path: '/'
    }));
    expect(res.cookie).toHaveBeenCalledWith('csrf_token', expect.any(String), expect.objectContaining({
      httpOnly: false,
      sameSite: 'strict',
      path: '/'
    }));
  });

  it('clears auth_token and csrf_token cookies on logout', async () => {
    const req = {} as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      clearCookie: vi.fn().mockReturnThis()
    } as any;

    await controller.logout(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.clearCookie).toHaveBeenCalledWith('auth_token', { path: '/' });
    expect(res.clearCookie).toHaveBeenCalledWith('csrf_token', { path: '/' });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Logged out successfully'
    }));
  });
});

describe('SEC-03: Cookie Auth & CSRF Protection Middleware', () => {
  const jwtSecret = 'super-secret-jwt-key-for-tenant-admin';
  const validToken = jwt.sign({ tenantId: 'tenant-csrf-1' }, jwtSecret);

  it('authenticates GET requests via httpOnly auth_token cookie', async () => {
    const { tenantAccessMiddleware } = await import('../src/common/middleware/tenant-access.middleware.js');

    const req = {
      method: 'GET',
      headers: {},
      cookies: { auth_token: validToken }
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const next = vi.fn();

    tenantAccessMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.tenantId).toBe('tenant-csrf-1');
  });

  it('rejects POST request authenticated via cookie if X-CSRF-Token is missing', async () => {
    const { tenantAccessMiddleware } = await import('../src/common/middleware/tenant-access.middleware.js');

    const req = {
      method: 'POST',
      headers: {},
      cookies: { auth_token: validToken, csrf_token: 'valid-csrf-token' }
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const next = vi.fn();

    tenantAccessMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'EBADCSRFTOKEN'
    }));
  });

  it('rejects POST request if X-CSRF-Token header does not match csrf_token cookie', async () => {
    const { tenantAccessMiddleware } = await import('../src/common/middleware/tenant-access.middleware.js');

    const req = {
      method: 'POST',
      headers: { 'x-csrf-token': 'wrong-token' },
      cookies: { auth_token: validToken, csrf_token: 'legit-csrf-token' }
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const next = vi.fn();

    tenantAccessMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'EBADCSRFTOKEN'
    }));
  });

  it('allows POST request when X-CSRF-Token matches csrf_token cookie', async () => {
    const { tenantAccessMiddleware } = await import('../src/common/middleware/tenant-access.middleware.js');

    const req = {
      method: 'POST',
      headers: { 'x-csrf-token': 'legit-csrf-token' },
      cookies: { auth_token: validToken, csrf_token: 'legit-csrf-token' }
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const next = vi.fn();

    tenantAccessMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.tenantId).toBe('tenant-csrf-1');
  });

  it('allows POST request with Authorization Bearer header without requiring CSRF header for API clients', async () => {
    const { tenantAccessMiddleware } = await import('../src/common/middleware/tenant-access.middleware.js');

    const req = {
      method: 'POST',
      headers: { authorization: `Bearer ${validToken}` },
      cookies: {}
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as any;
    const next = vi.fn();

    tenantAccessMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.tenantId).toBe('tenant-csrf-1');
  });
});

describe('Auth Rate Limiter Startup Guard & Bypass Rules (Item 3)', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalE2eFlag = process.env.E2E_DISABLE_AUTH_LIMIT;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.E2E_DISABLE_AUTH_LIMIT = originalE2eFlag;
  });

  it('throws an error if E2E_DISABLE_AUTH_LIMIT is set in production mode', async () => {
    const { shouldSkipAuthLimiter } = await import('../src/server.js');
    process.env.NODE_ENV = 'production';
    process.env.E2E_DISABLE_AUTH_LIMIT = '1';

    expect(() => shouldSkipAuthLimiter()).toThrow(/strictly prohibited in production mode/i);
  });

  it('enforces auth limiter in production mode when flag is not set', async () => {
    const { shouldSkipAuthLimiter } = await import('../src/server.js');
    process.env.NODE_ENV = 'production';
    delete process.env.E2E_DISABLE_AUTH_LIMIT;

    expect(shouldSkipAuthLimiter()).toBe(false);
  });

  it('skips auth limiter when NODE_ENV === test', async () => {
    const { shouldSkipAuthLimiter } = await import('../src/server.js');
    process.env.NODE_ENV = 'test';
    delete process.env.E2E_DISABLE_AUTH_LIMIT;

    expect(shouldSkipAuthLimiter()).toBe(true);
  });

  it('skips auth limiter in non-production when E2E_DISABLE_AUTH_LIMIT === 1', async () => {
    const { shouldSkipAuthLimiter } = await import('../src/server.js');
    process.env.NODE_ENV = 'development';
    process.env.E2E_DISABLE_AUTH_LIMIT = '1';

    expect(shouldSkipAuthLimiter()).toBe(true);
  });

  it('does not skip auth limiter in development when flag is not set', async () => {
    const { shouldSkipAuthLimiter } = await import('../src/server.js');
    process.env.NODE_ENV = 'development';
    delete process.env.E2E_DISABLE_AUTH_LIMIT;

    expect(shouldSkipAuthLimiter()).toBe(false);
  });
});

describe('Password Reset Flow (Component 2)', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.restoreAllMocks();
    authService = new AuthService();
  });

  it('forgotPassword returns generic message and does not create token if email not found', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce(null);
    const createSpy = vi.spyOn(prisma.passwordResetToken, 'create');

    const result = await authService.forgotPassword('nonexistent@example.com');

    expect(result.message).toMatch(/If an account matches this email/i);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('forgotPassword creates hashed reset token when tenant exists', async () => {
    vi.spyOn(prisma.tenant, 'findUnique').mockResolvedValueOnce({
      id: 'tenant-reset-1',
      email: 'owner@example.com'
    } as any);

    const createSpy = vi.spyOn(prisma.passwordResetToken, 'create').mockResolvedValueOnce({
      id: 'token-rec-1',
      tokenHash: 'hashed-token-value',
      tenantId: 'tenant-reset-1',
      expiresAt: new Date(Date.now() + 3600000),
      used: false,
      createdAt: new Date()
    } as any);

    const result = await authService.forgotPassword('owner@example.com');

    expect(result.message).toMatch(/If an account matches this email/i);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-reset-1',
          used: false
        })
      })
    );
  });

  it('resetPassword rejects short password under 8 characters', async () => {
    await expect(authService.resetPassword('some-token', 'short')).rejects.toThrow(
      /at least 8 characters/i
    );
  });

  it('resetPassword throws error if token is not found or already used', async () => {
    vi.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValueOnce(null);

    await expect(authService.resetPassword('invalid-or-used-token', 'NewValidPass123!')).rejects.toThrow(
      'Password reset token is invalid, used, or has expired.'
    );
  });

  it('resetPassword throws error if token is expired', async () => {
    vi.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValueOnce({
      id: 'expired-token-id',
      tenantId: 'tenant-123',
      expiresAt: new Date(Date.now() - 60000), // expired 1 minute ago
      used: false
    } as any);

    await expect(authService.resetPassword('expired-token', 'NewValidPass123!')).rejects.toThrow(
      'Password reset token is invalid, used, or has expired.'
    );
  });

  it('resetPassword successfully updates tenant password with Argon2id and marks token used', async () => {
    vi.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValueOnce({
      id: 'valid-token-id',
      tenantId: 'tenant-123',
      expiresAt: new Date(Date.now() + 1800000), // valid for 30 more minutes
      used: false
    } as any);

    vi.spyOn(prisma, '$transaction').mockResolvedValueOnce([{}, {}] as any);
    const tenantUpdateSpy = vi.spyOn(prisma.tenant, 'update');
    const tokenUpdateSpy = vi.spyOn(prisma.passwordResetToken, 'update');

    const result = await authService.resetPassword('valid-raw-token', 'BrandNewPassword123!');

    expect(result.message).toContain('Password has been reset successfully');
    expect(tenantUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-123' },
        data: expect.objectContaining({
          passwordHash: expect.stringMatching(/^\$argon2id\$/)
        })
      })
    );
    expect(tokenUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'valid-token-id' },
        data: { used: true }
      })
    );
  });
});

