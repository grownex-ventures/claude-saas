import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
