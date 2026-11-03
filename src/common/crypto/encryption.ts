import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes recommended for GCM

/**
 * Returns a 32-byte Buffer key for AES-256.
 * Uses ENCRYPTION_KEY if set (64 hex chars), or derives 32 bytes from JWT_SECRET.
 */
function getMasterKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey && envKey.length === 64 && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) {
    return crypto.createHash('sha256').update(secret).digest();
  }
  if (process.env.NODE_ENV === 'test') {
    return crypto.createHash('sha256').update('test_deterministic_secret_key_for_unit_tests').digest();
  }
  throw new Error('ENCRYPTION_KEY (64-character hex string / 32 bytes) or JWT_SECRET (minimum 32 characters) must be configured in environment.');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Output format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encrypt(plaintext: string, customKey?: Buffer): string {
  if (!plaintext) return '';
  const key = customKey || getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * Expects format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function decrypt(encryptedText: string, customKey?: Buffer): string {
  if (!encryptedText) return '';
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const key = customKey || getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates a deterministic SHA-256 hash.
 */
export function hashSha256(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex');
}

/**
 * Generates a cryptographically secure 64-character hex session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
