import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authService } from './auth.service.js';
import { tenantAccessMiddleware, AuthenticatedRequest } from '../common/middleware/tenant-access.middleware.js';
import { prisma } from '../common/database/prisma.js';
import { AuditLogService } from '../common/audit/audit-log.service.js';
import { settingsService } from '../common/settings/settings.service.js';

export function setAuthCookies(res: Response, token?: string): string {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const isProd = process.env.NODE_ENV === 'production';

  if (typeof res.cookie === 'function') {
    if (token) {
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }

    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, // Accessible by JavaScript client to submit in X-CSRF-Token header
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
  }

  return csrfToken;
}

export function clearAuthCookies(res: Response): void {
  if (typeof res.clearCookie === 'function') {
    res.clearCookie('auth_token', { path: '/' });
    res.clearCookie('csrf_token', { path: '/' });
  }
}

export class AuthController {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    this.router.post('/signup', this.signup.bind(this));
    this.router.post('/login', this.login.bind(this));
    this.router.post('/logout', this.logout.bind(this));
    this.router.post('/forgot-password', this.forgotPassword.bind(this));
    this.router.post('/reset-password', this.resetPassword.bind(this));
    this.router.get('/csrf', this.getCsrf.bind(this));
    this.router.get('/me', tenantAccessMiddleware, this.getMe.bind(this));

    // Google Sign-In (GIS)
    this.router.post('/google', this.googleLogin.bind(this));

    // Multi-Factor Authentication (MFA / 2FA)
    this.router.post('/mfa/setup', tenantAccessMiddleware, this.mfaSetup.bind(this));
    this.router.post('/mfa/enable', tenantAccessMiddleware, this.mfaEnable.bind(this));
    this.router.post('/mfa/disable', tenantAccessMiddleware, this.mfaDisable.bind(this));
    this.router.post('/mfa/verify-login', this.mfaVerifyLogin.bind(this));

    // Email Verification
    this.router.post('/verify-email', this.verifyEmail.bind(this));
    this.router.get('/verify-email', this.verifyEmailGet.bind(this));
    this.router.post('/resend-verification', this.resendVerification.bind(this));

    // Public Auth Configuration (Google Client ID, Registration policy)
    this.router.get('/config', this.getConfig.bind(this));
  }

  /**
   * GET /api/auth/config
   * Returns public client configurations like Google Client ID dynamically
   */
  async getConfig(_req: Request, res: Response): Promise<void> {
    try {
      const googleClientId = await settingsService.get('GOOGLE_CLIENT_ID');
      const googleEnabled = (await settingsService.get('GOOGLE_AUTH_ENABLED', 'true')) !== 'false';
      const allowSignup = (await settingsService.get('ALLOW_PUBLIC_SIGNUP', 'true')) !== 'false';
      const platformName = await settingsService.get('PLATFORM_NAME', 'YourSMMagent');

      res.json({
        googleClientId: googleClientId || null,
        googleAuthEnabled: Boolean(googleClientId && googleEnabled),
        allowPublicSignup: allowSignup,
        platformName
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/auth/signup
   * Registers a tenant with Argon2 password hashing and triggers email verification
   */
  async signup(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const baseUrl = typeof req.get === 'function' ? `${req.protocol || 'http'}://${req.get('host')}` : undefined;
      const result = await authService.signup({ email, password }, baseUrl);
      const csrfToken = setAuthCookies(res, result.token);

      if (result.tenant?.id) {
        await AuditLogService.record({
          tenantId: result.tenant.id,
          action: 'AUTH_SIGNUP',
          actorIp: req.ip || 'unknown',
          userAgent: req.headers?.['user-agent'] as string,
          metadata: { email: result.tenant.email }
        });
      }

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        csrfToken,
        ...result
      });
    } catch (err: any) {
      const statusCode = err.statusCode || (err.message?.includes('valid') || err.message?.includes('characters') ? 400 : 500);
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Signup failed'
      });
    }
  }

  /**
   * POST /api/auth/login
   * Authenticates tenant. If MFA is active, returns challenge without full auth token.
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await authService.login({ email, password });

      // If MFA is required, return challenge token and prompt
      if (result.mfaRequired) {
        res.status(200).json({
          success: true,
          mfaRequired: true,
          mfaSessionToken: result.mfaSessionToken,
          message: 'Two-factor authentication code required'
        });
        return;
      }

      const csrfToken = setAuthCookies(res, result.token);

      if (result.tenant?.id) {
        await AuditLogService.record({
          tenantId: result.tenant.id,
          action: 'AUTH_LOGIN_SUCCESS',
          actorIp: req.ip || 'unknown',
          userAgent: req.headers?.['user-agent'] as string,
          metadata: { email: result.tenant.email }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Login successful',
        csrfToken,
        ...result
      });
    } catch (err: any) {
      const email = req.body?.email;
      if (email && typeof email === 'string' && typeof prisma.tenant?.findUnique === 'function') {
        try {
          const promise = prisma.tenant.findUnique({
            where: { email: email.trim().toLowerCase() },
            select: { id: true }
          });
          if (promise && typeof promise.then === 'function') {
            promise.then((tenant) => {
              if (tenant) {
                AuditLogService.record({
                  tenantId: tenant.id,
                  action: 'AUTH_LOGIN_FAILURE',
                  actorIp: req.ip || 'unknown',
                  userAgent: req.headers?.['user-agent'] as string,
                  metadata: { reason: err.message || 'Authentication failed' }
                });
              }
            }).catch(() => {});
          }
        } catch {}
      }

      const statusCode = err.statusCode || 401;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Authentication failed'
      });
    }
  }

  /**
   * POST /api/auth/mfa/verify-login
   * Completes login with 6-digit TOTP code or backup code
   */
  async mfaVerifyLogin(req: Request, res: Response): Promise<void> {
    try {
      const { mfaSessionToken, code } = req.body || {};
      const result = await authService.verifyMfaLogin(mfaSessionToken, code);
      const csrfToken = setAuthCookies(res, result.token);

      if (result.tenant?.id) {
        await AuditLogService.record({
          tenantId: result.tenant.id,
          action: 'AUTH_MFA_LOGIN_SUCCESS',
          actorIp: req.ip || 'unknown',
          userAgent: req.headers?.['user-agent'] as string,
          metadata: { email: result.tenant.email }
        });
      }

      res.status(200).json({
        success: true,
        message: 'MFA verification successful',
        csrfToken,
        ...result
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 401;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Invalid two-factor code'
      });
    }
  }

  /**
   * POST /api/auth/mfa/setup
   * Generates QR code and Base32 secret for authenticator apps
   */
  async mfaSetup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const result = await authService.setupMfa(tenantId);

      await AuditLogService.record({
        tenantId,
        action: 'AUTH_MFA_SETUP_INITIATED',
        actorIp: req.ip || 'unknown',
        userAgent: req.headers?.['user-agent'] as string
      });

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({ success: false, error: err.message || 'Failed to initialize MFA' });
    }
  }

  /**
   * POST /api/auth/mfa/enable
   * Confirms TOTP token and permanently enables 2FA
   */
  async mfaEnable(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { code } = req.body || {};
      const result = await authService.enableMfa(tenantId, code);

      await AuditLogService.record({
        tenantId,
        action: 'AUTH_MFA_ENABLED',
        actorIp: req.ip || 'unknown',
        userAgent: req.headers?.['user-agent'] as string
      });

      res.status(200).json(result);
    } catch (err: any) {
      const statusCode = err.statusCode || 400;
      res.status(statusCode).json({ success: false, error: err.message || 'Failed to enable MFA' });
    }
  }

  /**
   * POST /api/auth/mfa/disable
   * Disables 2FA with password or valid TOTP confirmation
   */
  async mfaDisable(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const { passwordOrCode } = req.body || {};
      const result = await authService.disableMfa(tenantId, passwordOrCode);

      await AuditLogService.record({
        tenantId,
        action: 'AUTH_MFA_DISABLED',
        actorIp: req.ip || 'unknown',
        userAgent: req.headers?.['user-agent'] as string
      });

      res.status(200).json(result);
    } catch (err: any) {
      const statusCode = err.statusCode || 400;
      res.status(statusCode).json({ success: false, error: err.message || 'Failed to disable MFA' });
    }
  }

  /**
   * POST /api/auth/google
   * Authenticates tenant with Google OAuth ID token
   */
  async googleLogin(req: Request, res: Response): Promise<void> {
    try {
      const { credential } = req.body || {};
      const result = await authService.loginWithGoogle(credential);

      // If account has MFA enabled, require TOTP challenge
      if (result.mfaRequired) {
        res.status(200).json({
          success: true,
          mfaRequired: true,
          mfaSessionToken: result.mfaSessionToken,
          message: 'Two-factor authentication code required'
        });
        return;
      }

      const csrfToken = setAuthCookies(res, result.token);

      if (result.tenant?.id) {
        await AuditLogService.record({
          tenantId: result.tenant.id,
          action: 'AUTH_GOOGLE_LOGIN_SUCCESS',
          actorIp: req.ip || 'unknown',
          userAgent: req.headers?.['user-agent'] as string,
          metadata: { email: result.tenant.email }
        });
      }

      res.status(200).json({
        success: true,
        message: 'Google login successful',
        csrfToken,
        ...result
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 401;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Google authentication failed'
      });
    }
  }

  /**
   * POST /api/auth/verify-email
   * Confirms email verification token
   */
  async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.body || {};
      const result = await authService.verifyEmail(token);

      if (result.tenant?.id) {
        await AuditLogService.record({
          tenantId: result.tenant.id,
          action: 'AUTH_EMAIL_VERIFIED',
          actorIp: req.ip || 'unknown',
          userAgent: req.headers?.['user-agent'] as string
        });
      }

      res.status(200).json(result);
    } catch (err: any) {
      const statusCode = err.statusCode || 400;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Email verification failed'
      });
    }
  }

  /**
   * GET /api/auth/verify-email
   * Handles direct link clicks from email and redirects to UI verification page
   */
  async verifyEmailGet(req: Request, res: Response): Promise<void> {
    const token = req.query.token as string;
    if (!token) {
      res.redirect('/verify-email?status=error&message=Missing+verification+token');
      return;
    }

    try {
      await authService.verifyEmail(token);
      res.redirect('/verify-email?status=success');
    } catch (err: any) {
      const msg = encodeURIComponent(err.message || 'Invalid or expired token');
      res.redirect(`/verify-email?status=error&message=${msg}`);
    }
  }

  /**
   * POST /api/auth/resend-verification
   * Dispatches a fresh email verification link
   */
  async resendVerification(req: Request, res: Response): Promise<void> {
    try {
      const email = req.body?.email;
      const tenantId = (req as AuthenticatedRequest).tenantId;
      const target = email || tenantId;
      const baseUrl = typeof req.get === 'function' ? `${req.protocol || 'http'}://${req.get('host')}` : undefined;
      const result = await authService.resendVerification(target, baseUrl);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to resend verification email' });
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Dispatches password recovery instructions and returns generic confirmation
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body || {};
      const baseUrl = typeof req.get === 'function' ? `${req.protocol || 'http'}://${req.get('host')}` : undefined;
      const result = await authService.forgotPassword(email, baseUrl);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to process password recovery request' });
    }
  }

  /**
   * POST /api/auth/reset-password
   * Resets tenant password using a valid, unexpired reset token
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, newPassword } = req.body || {};
      const result = await authService.resetPassword(token, newPassword);
      res.status(200).json(result);
    } catch (err: any) {
      const statusCode = err.statusCode || 400;
      res.status(statusCode).json({ success: false, error: err.message || 'Failed to reset password' });
    }
  }

  /**
   * GET /api/auth/me
   * Fetches session profile for currently authenticated tenant
   */
  async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId!;
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId }
      });

      if (!tenant) {
        res.status(404).json({ success: false, error: 'Tenant profile not found' });
        return;
      }

      res.status(200).json({
        success: true,
        tenant: {
          id: tenant.id,
          email: tenant.email,
          subscriptionStatus: tenant.subscriptionStatus,
          subscriptionExpiresAt: tenant.subscriptionExpiresAt,
          botToken: tenant.botToken,
          panelApiUrl: tenant.panelApiUrl,
          telegramPanelUrl: tenant.telegramPanelUrl || tenant.panelApiUrl,
          whatsappPanelUrl: tenant.whatsappPanelUrl || tenant.panelApiUrl,
          widgetPanelUrl: tenant.widgetPanelUrl || tenant.panelApiUrl,
          hasTelegram: Boolean(tenant.hasTelegram),
          hasWhatsapp: Boolean(tenant.hasWhatsapp),
          hasWidget: Boolean(tenant.hasWidget),
          emailVerified: Boolean(tenant.emailVerified),
          emailVerifiedAt: tenant.emailVerifiedAt,
          googleId: tenant.googleId,
          mfaEnabled: Boolean(tenant.mfaEnabled),
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt
        }
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to fetch session profile'
      });
    }
  }

  /**
   * POST /api/auth/logout
   * Clears httpOnly auth_token and csrf_token cookies
   */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      clearAuthCookies(res);
      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Logout failed'
      });
    }
  }

  /**
   * GET /api/auth/csrf
   * Retrieves or sets double-submit CSRF cookie
   */
  getCsrf(req: Request, res: Response): void {
    let csrfToken = req.cookies?.csrf_token;
    if (!csrfToken) {
      csrfToken = crypto.randomBytes(32).toString('hex');
      const isProd = process.env.NODE_ENV === 'production';
      if (typeof res.cookie === 'function') {
        res.cookie('csrf_token', csrfToken, {
          httpOnly: false,
          secure: isProd,
          sameSite: 'strict',
          path: '/',
          maxAge: 7 * 24 * 60 * 60 * 1000
        });
      }
    }
    res.status(200).json({ csrfToken });
  }
}

export const authController = new AuthController();
