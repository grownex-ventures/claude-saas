import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { tenantAccessMiddleware, AuthenticatedRequest } from '../src/common/middleware/tenant-access.middleware.js';
import { adminAuthGuard, getAdminJwtSecret } from '../src/admin/admin.guard.js';
import { AdminController, setAdminAuthCookies, clearAdminAuthCookies } from '../src/admin/admin.controller.js';
import { adminService } from '../src/admin/admin.service.js';
import { prisma } from '../src/common/database/prisma.js';
import { Response } from 'express';

describe('Phase 6: Authentication & Admin Hardening Suite', () => {
  const jwtSecret = process.env.JWT_SECRET || 'super-secret-jwt-key-for-tenant-admin';
  const adminSecret = getAdminJwtSecret();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Query-Token Rejection', () => {
    it('rejects requests relying solely on URL query parameter token with 401 Unauthorized', () => {
      const token = jwt.sign({ tenantId: 'tenant-123' }, jwtSecret);
      const req = {
        headers: {},
        query: { token }
      } as unknown as AuthenticatedRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;
      const next = vi.fn();

      tenantAccessMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Unauthorized') })
      );
      expect(next).not.toHaveBeenCalled();
      expect(req.tenantId).toBeUndefined();
    });
  });

  describe('2. Dashboard Cookie Authentication', () => {
    it('authenticates tenant via HTTP-only auth_token cookie without Authorization header', () => {
      const token = jwt.sign({ tenantId: 'tenant-cookie-user' }, jwtSecret);
      const req = {
        headers: {},
        cookies: { auth_token: token }
      } as unknown as AuthenticatedRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;
      const next = vi.fn();

      tenantAccessMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.tenantId).toBe('tenant-cookie-user');
    });

    it('prefers Authorization Bearer header when both header and cookie are present', () => {
      const bearerToken = jwt.sign({ tenantId: 'tenant-bearer' }, jwtSecret);
      const cookieToken = jwt.sign({ tenantId: 'tenant-cookie' }, jwtSecret);

      const req = {
        headers: { authorization: `Bearer ${bearerToken}` },
        cookies: { auth_token: cookieToken }
      } as unknown as AuthenticatedRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;
      const next = vi.fn();

      tenantAccessMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.tenantId).toBe('tenant-bearer');
    });
  });

  describe('3. Admin Impersonation Session', () => {
    it('issues auth_token and csrf_token cookies and redirects to /dashboard without legacy token cookie', async () => {
      const mockImpersonateResult = {
        token: jwt.sign({ tenantId: 'tenant-impersonated-1' }, jwtSecret),
        tenant: { id: 'tenant-impersonated-1', email: 'owner@tenant.com' }
      };

      vi.spyOn(adminService, 'impersonateTenant').mockResolvedValueOnce(mockImpersonateResult);

      const cookiesSet: Record<string, any> = {};
      const res = {
        cookie: vi.fn().mockImplementation((name, val, opts) => {
          cookiesSet[name] = { val, opts };
        }),
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      } as unknown as Response;

      const controller = new AdminController();
      // Find the impersonate route handler
      const impersonateLayer = (controller.router as any).stack.find(
        (l: any) => l.route?.path === '/tenants/:id/impersonate' && l.route?.methods?.post
      );

      expect(impersonateLayer).toBeDefined();

      const req = {
        params: { id: 'tenant-impersonated-1' },
        admin: { id: 'admin-1', role: 'superadmin' }
      } as any;

      await impersonateLayer.route.stack[0].handle(req, res);

      // Must set auth_token and csrf_token via standard helper
      expect(cookiesSet['auth_token']).toBeDefined();
      expect(cookiesSet['auth_token'].val).toBe(mockImpersonateResult.token);
      expect(cookiesSet['auth_token'].opts.httpOnly).toBe(true);

      expect(cookiesSet['csrf_token']).toBeDefined();
      expect(cookiesSet['csrf_token'].opts.httpOnly).toBe(false);

      // Must NOT set legacy rogue 'token' cookie
      expect(cookiesSet['token']).toBeUndefined();

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          redirectUrl: '/dashboard',
          csrfToken: expect.any(String)
        })
      );
    });
  });

  describe('4. WhatsApp SSE Authentication', () => {
    it('authenticates SSE route via auth_token cookie', () => {
      const token = jwt.sign({ tenantId: 'tenant-sse-ok' }, jwtSecret);
      const req = {
        headers: {},
        cookies: { auth_token: token }
      } as unknown as AuthenticatedRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;
      const next = vi.fn();

      tenantAccessMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.tenantId).toBe('tenant-sse-ok');
    });

    it('rejects SSE route when only ?token=... query string is provided without cookie', () => {
      const token = jwt.sign({ tenantId: 'tenant-sse-query' }, jwtSecret);
      const req = {
        headers: {},
        query: { token }
      } as unknown as AuthenticatedRequest;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;
      const next = vi.fn();

      tenantAccessMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('5. Admin CSRF Protection', () => {
    it('sets admin_token and admin_csrf_token cookies upon setAdminAuthCookies', () => {
      const cookiesSet: Record<string, any> = {};
      const res = {
        cookie: vi.fn().mockImplementation((name, val, opts) => {
          cookiesSet[name] = { val, opts };
        })
      } as unknown as Response;

      const csrfToken = setAdminAuthCookies(res, 'sample-admin-jwt');

      expect(cookiesSet['admin_token']).toBeDefined();
      expect(cookiesSet['admin_token'].val).toBe('sample-admin-jwt');
      expect(cookiesSet['admin_token'].opts.httpOnly).toBe(true);

      expect(cookiesSet['admin_csrf_token']).toBeDefined();
      expect(cookiesSet['admin_csrf_token'].val).toBe(csrfToken);
      expect(cookiesSet['admin_csrf_token'].opts.httpOnly).toBe(false);
    });

    it('clears both admin_token and admin_csrf_token cookies on logout', () => {
      const cleared: string[] = [];
      const res = {
        clearCookie: vi.fn().mockImplementation((name) => {
          cleared.push(name);
        })
      } as unknown as Response;

      clearAdminAuthCookies(res);

      expect(cleared).toContain('admin_token');
      expect(cleared).toContain('admin_csrf_token');
    });

    it('rejects cookie-authenticated mutating request (POST) when X-CSRF-Token header is missing', async () => {
      const adminToken = jwt.sign({ id: 'admin-1', role: 'superadmin' }, adminSecret);
      vi.spyOn(prisma.adminUser, 'findUnique').mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@yoursmmagent.com',
        name: 'Super Admin'
      } as any);

      const req = {
        method: 'POST',
        headers: {},
        cookies: {
          admin_token: adminToken,
          admin_csrf_token: 'valid-admin-csrf-secret'
        }
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const next = vi.fn();

      await adminAuthGuard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'EBADCSRFTOKEN' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects cookie-authenticated mutating request (DELETE) when X-CSRF-Token mismatches', async () => {
      const adminToken = jwt.sign({ id: 'admin-1', role: 'superadmin' }, adminSecret);
      vi.spyOn(prisma.adminUser, 'findUnique').mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@yoursmmagent.com',
        name: 'Super Admin'
      } as any);

      const req = {
        method: 'DELETE',
        headers: { 'x-csrf-token': 'attacker-fake-csrf-token' },
        cookies: {
          admin_token: adminToken,
          admin_csrf_token: 'legit-admin-csrf-secret'
        }
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const next = vi.fn();

      await adminAuthGuard(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'EBADCSRFTOKEN' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('allows cookie-authenticated mutating request (PATCH) when X-CSRF-Token matches admin_csrf_token', async () => {
      const adminToken = jwt.sign({ id: 'admin-1', role: 'superadmin' }, adminSecret);
      vi.spyOn(prisma.adminUser, 'findUnique').mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@yoursmmagent.com',
        name: 'Super Admin'
      } as any);

      const csrf = 'matched-admin-csrf-token-123456';
      const req = {
        method: 'PATCH',
        headers: { 'x-csrf-token': csrf },
        cookies: {
          admin_token: adminToken,
          admin_csrf_token: csrf
        }
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const next = vi.fn();

      await adminAuthGuard(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.admin).toBeDefined();
      expect(req.admin.id).toBe('admin-1');
    });

    it('allows mutating requests authenticated via Authorization Bearer header without requiring CSRF header', async () => {
      const adminToken = jwt.sign({ id: 'admin-1', role: 'superadmin' }, adminSecret);
      vi.spyOn(prisma.adminUser, 'findUnique').mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@yoursmmagent.com',
        name: 'Super Admin'
      } as any);

      const req = {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken}` },
        cookies: {}
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const next = vi.fn();

      await adminAuthGuard(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.admin).toBeDefined();
    });

    it('allows safe GET requests with admin cookie without requiring CSRF token', async () => {
      const adminToken = jwt.sign({ id: 'admin-1', role: 'superadmin' }, adminSecret);
      vi.spyOn(prisma.adminUser, 'findUnique').mockResolvedValueOnce({
        id: 'admin-1',
        email: 'admin@yoursmmagent.com',
        name: 'Super Admin'
      } as any);

      const req = {
        method: 'GET',
        headers: {},
        cookies: { admin_token: adminToken }
      } as any;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const next = vi.fn();

      await adminAuthGuard(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.admin).toBeDefined();
    });
  });
});
