/**
 * TOTP Multi-Factor Authentication Service (RFC 6238 / RFC 4226)
 * Pure standard cryptographic implementation with zero supply-chain risk.
 * Compatible with Google Authenticator, Microsoft Authenticator, Authy, Apple Keychain, and 1Password.
 * Source: https://datatracker.ietf.org/doc/html/rfc6238
 */
import crypto from 'crypto';
import QRCode from 'qrcode';
import { encrypt, decrypt, hashSha256 } from '../crypto/encryption.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface TotpSetupResult {
  secret: string;         // Plaintext Base32 secret for manual entry
  encryptedSecret: string; // AES-256-GCM encrypted secret for database persistence
  otpauthUrl: string;     // otpauth:// standard URI
  qrCodeDataUrl: string;  // Data URL image ready for <img> src
  backupCodes: string[];  // 8 plaintext single-use backup codes (show once)
  hashedBackupCodes: string[]; // 8 SHA-256 hashed codes for database persistence
}

export class TotpService {
  private static readonly TIME_STEP_SECONDS = 30;
  private static readonly DIGITS = 6;
  private static readonly ISSUER = 'YourSMMagent';

  /**
   * Encodes a Buffer into RFC 4648 Base32 string (without padding)
   */
  static base32Encode(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;

      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
  }

  /**
   * Decodes an RFC 4648 Base32 string into a Buffer
   */
  static base32Decode(base32: string): Buffer {
    const clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (let i = 0; i < clean.length; i++) {
      const idx = BASE32_ALPHABET.indexOf(clean[i]);
      if (idx === -1) {
        throw new Error(`Invalid Base32 character: ${clean[i]}`);
      }

      value = (value << 5) | idx;
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    return Buffer.from(bytes);
  }

  /**
   * Generates a 20-byte cryptographically secure random Base32 secret (160-bit key)
   */
  static generateSecret(): string {
    const randomBytes = crypto.randomBytes(20);
    return this.base32Encode(randomBytes);
  }

  /**
   * Computes the 6-digit TOTP token for a given Base32 secret and timestamp
   */
  static generateToken(secret: string, timestampMs: number = Date.now()): string {
    const key = this.base32Decode(secret);
    const counter = Math.floor(timestampMs / 1000 / this.TIME_STEP_SECONDS);

    // Convert counter to 8-byte big-endian buffer
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

    // Compute HMAC-SHA1 (RFC 6238 standard default)
    const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();

    // Dynamic Truncation (RFC 4226 Section 5.4)
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % Math.pow(10, this.DIGITS);
    return otp.toString().padStart(this.DIGITS, '0');
  }

  /**
   * Verifies a 6-digit TOTP token allowing +/- 1 window (30s) drift tolerance
   */
  static verifyToken(secret: string, token: string, windowTolerance: number = 1, timestampMs: number = Date.now()): boolean {
    if (!token || typeof token !== 'string') return false;
    const cleanToken = token.trim();
    if (!/^\d{6}$/.test(cleanToken)) return false;

    const currentCounter = Math.floor(timestampMs / 1000 / this.TIME_STEP_SECONDS);

    for (let step = -windowTolerance; step <= windowTolerance; step++) {
      const stepTimestamp = (currentCounter + step) * this.TIME_STEP_SECONDS * 1000;
      const expectedToken = this.generateToken(secret, stepTimestamp);

      // Constant-time string comparison to prevent timing attacks
      if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expectedToken))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generates 8 single-use 10-character alphanumeric backup codes
   */
  static generateBackupCodes(count: number = 8): { plaintextCodes: string[]; hashedCodes: string[] } {
    const plaintextCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      const raw = crypto.randomBytes(5).toString('hex').toLowerCase(); // 10 chars
      plaintextCodes.push(raw);
      hashedCodes.push(hashSha256(raw));
    }

    return { plaintextCodes, hashedCodes };
  }

  /**
   * Initializes full MFA setup package with encrypted secret and QR code data URL
   */
  static async setupMfa(userEmail: string): Promise<TotpSetupResult> {
    const secret = this.generateSecret();
    const encryptedSecret = encrypt(secret);

    const cleanEmail = encodeURIComponent(userEmail.trim().toLowerCase());
    const cleanIssuer = encodeURIComponent(this.ISSUER);
    const otpauthUrl = `otpauth://totp/${cleanIssuer}:${cleanEmail}?secret=${secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    const { plaintextCodes, hashedCodes } = this.generateBackupCodes();

    return {
      secret,
      encryptedSecret,
      otpauthUrl,
      qrCodeDataUrl,
      backupCodes: plaintextCodes,
      hashedBackupCodes: hashedCodes
    };
  }

  /**
   * Decrypts an encrypted secret and validates the submitted 6-digit token
   */
  static verifyEncryptedSecret(encryptedSecret: string, token: string): boolean {
    try {
      const secret = decrypt(encryptedSecret);
      return this.verifyToken(secret, token);
    } catch {
      return false;
    }
  }

  /**
   * Checks if the submitted code matches any valid hashed backup code and returns the updated remaining hashed codes
   */
  static verifyAndConsumeBackupCode(submittedCode: string, hashedBackupCodes: string[]): { valid: boolean; remainingHashedCodes: string[] } {
    if (!submittedCode || !Array.isArray(hashedBackupCodes)) {
      return { valid: false, remainingHashedCodes: hashedBackupCodes || [] };
    }

    const cleanInput = submittedCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const inputHash = hashSha256(cleanInput);

    const index = hashedBackupCodes.findIndex(h => h === inputHash);
    if (index === -1) {
      return { valid: false, remainingHashedCodes: hashedBackupCodes };
    }

    // Code found: remove it so it cannot be reused
    const remaining = [...hashedBackupCodes];
    remaining.splice(index, 1);
    return { valid: true, remainingHashedCodes: remaining };
  }
}

