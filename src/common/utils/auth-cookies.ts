import { Response } from 'express';
import crypto from 'crypto';

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

export function setAdminAuthCookies(res: Response, token?: string): string {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const isProd = process.env.NODE_ENV === 'production';

  if (typeof res.cookie === 'function') {
    if (token) {
      res.cookie('admin_token', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'strict',
        path: '/',
        maxAge: 12 * 60 * 60 * 1000 // 12 hours
      });
    }

    res.cookie('admin_csrf_token', csrfToken, {
      httpOnly: false, // Accessible by Admin web UI client
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: 12 * 60 * 60 * 1000
    });
  }

  return csrfToken;
}

export function clearAdminAuthCookies(res: Response): void {
  if (typeof res.clearCookie === 'function') {
    res.clearCookie('admin_token', { path: '/' });
    res.clearCookie('admin_csrf_token', { path: '/' });
  }
}
