import { describe, it, expect } from 'vitest';
import { TotpService } from '../src/common/auth/totp.service.js';

describe('RFC 6238 TOTP Multi-Factor Authentication Suite', () => {
  it('encodes and decodes Base32 strings correctly', () => {
    const input = Buffer.from('Hello, YourSMMagent 2FA Security!');
    const encoded = TotpService.base32Encode(input);
    const decoded = TotpService.base32Decode(encoded);

    expect(decoded.toString('utf8')).toBe('Hello, YourSMMagent 2FA Security!');
  });

  it('generates a 32-character Base32 secret', () => {
    const secret = TotpService.generateSecret();
    expect(secret).toHaveLength(32);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('generates 6-digit zero-padded TOTP tokens', () => {
    const secret = TotpService.generateSecret();
    const token = TotpService.generateToken(secret);
    expect(token).toHaveLength(6);
    expect(/^\d{6}$/.test(token)).toBe(true);
  });

  it('verifies a valid token at current timestamp and within +/- 30s drift', () => {
    const secret = TotpService.generateSecret();
    const now = Date.now();
    const currentToken = TotpService.generateToken(secret, now);

    // Exact match
    expect(TotpService.verifyToken(secret, currentToken, 1, now)).toBe(true);

    // Match 25 seconds ago (within 30s window)
    expect(TotpService.verifyToken(secret, currentToken, 1, now + 25000)).toBe(true);

    // Match 25 seconds in future (within 30s window)
    expect(TotpService.verifyToken(secret, currentToken, 1, now - 25000)).toBe(true);

    // Reject after 90 seconds (outside +/- 1 step window)
    expect(TotpService.verifyToken(secret, currentToken, 1, now + 95000)).toBe(false);
  });

  it('rejects malformed, non-numeric or wrong tokens', () => {
    const secret = TotpService.generateSecret();
    expect(TotpService.verifyToken(secret, '12345')).toBe(false); // only 5 digits
    expect(TotpService.verifyToken(secret, 'abcdef')).toBe(false); // letters
    expect(TotpService.verifyToken(secret, '999999')).toBe(false); // wrong code
    expect(TotpService.verifyToken(secret, '')).toBe(false);
  });

  it('generates 8 single-use 10-character backup codes and validates them', () => {
    const { plaintextCodes, hashedCodes } = TotpService.generateBackupCodes(8);
    expect(plaintextCodes).toHaveLength(8);
    expect(hashedCodes).toHaveLength(8);

    plaintextCodes.forEach(code => {
      expect(code).toHaveLength(10);
      expect(/^[a-z0-9]{10}$/.test(code)).toBe(true);
    });

    // Test consuming the first code
    const firstCode = plaintextCodes[0];
    const consume1 = TotpService.verifyAndConsumeBackupCode(firstCode, hashedCodes);
    expect(consume1.valid).toBe(true);
    expect(consume1.remainingHashedCodes).toHaveLength(7);

    // Test consuming the same code again (must fail - single use only!)
    const consumeAgain = TotpService.verifyAndConsumeBackupCode(firstCode, consume1.remainingHashedCodes);
    expect(consumeAgain.valid).toBe(false);
    expect(consumeAgain.remainingHashedCodes).toHaveLength(7);

    // Test with invalid code
    const consumeInvalid = TotpService.verifyAndConsumeBackupCode('invalidcode', consume1.remainingHashedCodes);
    expect(consumeInvalid.valid).toBe(false);
  });

  it('creates complete setup package with QR Code and encrypted secret', async () => {
    const email = 'panel-owner@test.com';
    const setup = await TotpService.setupMfa(email);

    expect(setup.secret).toHaveLength(32);
    expect(setup.encryptedSecret).toContain(':'); // AES-256-GCM iv:tag:cipher format
    expect(setup.otpauthUrl).toContain(`otpauth://totp/YourSMMagent:${encodeURIComponent(email)}`);
    expect(setup.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(setup.backupCodes).toHaveLength(8);
    expect(setup.hashedBackupCodes).toHaveLength(8);

    // Verify encrypted secret can be validated with a current token
    const token = TotpService.generateToken(setup.secret);
    expect(TotpService.verifyEncryptedSecret(setup.encryptedSecret, token)).toBe(true);
  });
});

