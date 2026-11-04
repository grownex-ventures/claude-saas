import { prisma } from '../database/prisma.js';
import { encrypt, decrypt } from '../crypto/encryption.js';

export interface SystemSettingItem {
  key: string;
  value: string;
  isEncrypted: boolean;
  category: 'AI' | 'AUTH' | 'EMAIL' | 'SYSTEM';
  description?: string | null;
}

export type SettingChangeListener = (key: string, newValue: string) => void;

/**
 * Enterprise Dynamic Settings Service
 * Provides zero-restart runtime configuration override backed by PostgreSQL SystemSetting table.
 * Falls back to process.env if setting has not been overridden.
 */
export class SettingsService {
  private static instance: SettingsService;
  private cache: Map<string, { value: string; isEncrypted: boolean; category: string; description?: string | null; loadedAt: number }> = new Map();
  private listeners: SettingChangeListener[] = [];
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute TTL with proactive cache eviction

  private constructor() {}

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  /**
   * Registers a listener triggered whenever a setting changes at runtime
   */
  onSettingChange(listener: SettingChangeListener): void {
    this.listeners.push(listener);
  }

  /**
   * Invalidate in-memory cache for a single key or all keys
   */
  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Retrieves a setting value.
   * Hierarchy: DB SystemSetting (decrypted if needed) -> process.env[key] -> fallback
   */
  async get(key: string, defaultValue: string = ''): Promise<string> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.loadedAt < this.CACHE_TTL_MS) {
      return cached.value;
    }

    try {
      const setting = await prisma.systemSetting.findUnique({ where: { key } });
      if (setting && setting.value !== undefined && setting.value !== null) {
        let resolvedValue = setting.value;
        if (setting.isEncrypted && resolvedValue) {
          try {
            resolvedValue = decrypt(resolvedValue);
          } catch (decErr: any) {
            console.error(`[SettingsService] Decryption failed for key ${key}:`, decErr.message);
          }
        }

        this.cache.set(key, {
          value: resolvedValue,
          isEncrypted: setting.isEncrypted,
          category: setting.category,
          description: setting.description,
          loadedAt: Date.now()
        });

        return resolvedValue;
      }
    } catch (err: any) {
      // In test mode or db disconnect, fall back gracefully
      console.warn(`[SettingsService] Could not query setting ${key} from DB, falling back to env:`, err.message);
    }

    // Fallback to process.env
    const envVal = process.env[key];
    if (envVal !== undefined && envVal !== '') {
      return envVal;
    }

    return defaultValue;
  }

  /**
   * Sets or updates a runtime configuration.
   */
  async set(
    key: string,
    value: string,
    category: 'AI' | 'AUTH' | 'EMAIL' | 'SYSTEM',
    isEncrypted: boolean = false,
    description?: string
  ): Promise<void> {
    let storedValue = value;
    if (isEncrypted && value) {
      storedValue = encrypt(value);
    }

    await prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: storedValue,
        isEncrypted,
        category,
        description: description || undefined
      },
      create: {
        key,
        value: storedValue,
        isEncrypted,
        category,
        description: description || undefined
      }
    });

    // Update cache with decrypted value
    this.cache.set(key, {
      value,
      isEncrypted,
      category,
      description,
      loadedAt: Date.now()
    });

    // Notify registered listeners
    for (const listener of this.listeners) {
      try {
        listener(key, value);
      } catch (lErr: any) {
        console.error(`[SettingsService] Error in change listener for ${key}:`, lErr);
      }
    }
  }

  /**
   * Returns all platform settings formatted for Super Admin display.
   * Sensitive values (passwords, API keys) are masked so they are never exposed in plaintext.
   */
  async getAllMasked(): Promise<Record<string, { value: string; isSet: boolean; isEncrypted: boolean; category: string; description?: string | null }>> {
    const dbSettings = await prisma.systemSetting.findMany();
    const result: Record<string, { value: string; isSet: boolean; isEncrypted: boolean; category: string; description?: string | null }> = {};

    // Standard platform setting keys we manage
    const knownKeys: { key: string; category: 'AI' | 'AUTH' | 'EMAIL' | 'SYSTEM'; isEncrypted: boolean; description: string }[] = [
      { key: 'AI_PROVIDER', category: 'AI', isEncrypted: false, description: 'Active AI Provider (openai, anthropic, openrouter, groq, etc.)' },
      { key: 'AI_MODEL', category: 'AI', isEncrypted: false, description: 'Default model name (e.g. gpt-4o-mini, claude-3-5-sonnet)' },
      { key: 'AI_API_KEY', category: 'AI', isEncrypted: true, description: 'Platform AI API Key' },
      { key: 'AI_BASE_URL', category: 'AI', isEncrypted: false, description: 'Custom API Base URL (optional)' },
      { key: 'AI_TEMPERATURE', category: 'AI', isEncrypted: false, description: 'Model temperature (0.0 - 1.0)' },
      { key: 'AI_MAX_TOKENS', category: 'AI', isEncrypted: false, description: 'Maximum completion tokens' },
      { key: 'AI_SYSTEM_PROMPT', category: 'AI', isEncrypted: false, description: 'Global SMM Customer Assistant system prompt' },

      { key: 'GOOGLE_CLIENT_ID', category: 'AUTH', isEncrypted: false, description: 'Google OAuth Client ID for Single Sign-On' },
      { key: 'GOOGLE_AUTH_ENABLED', category: 'AUTH', isEncrypted: false, description: 'Enable/disable Google Sign-In button on login/signup' },
      { key: 'ALLOW_PUBLIC_SIGNUP', category: 'AUTH', isEncrypted: false, description: 'Allow new user registrations' },
      { key: 'REQUIRE_EMAIL_VERIFICATION', category: 'AUTH', isEncrypted: false, description: 'Require verified email to access tenant dashboard' },

      { key: 'SMTP_HOST', category: 'EMAIL', isEncrypted: false, description: 'SMTP Mail Server Host' },
      { key: 'SMTP_PORT', category: 'EMAIL', isEncrypted: false, description: 'SMTP Server Port (587 or 465)' },
      { key: 'SMTP_SECURE', category: 'EMAIL', isEncrypted: false, description: 'Use TLS/SSL' },
      { key: 'SMTP_USER', category: 'EMAIL', isEncrypted: false, description: 'SMTP Username / Login' },
      { key: 'SMTP_PASS', category: 'EMAIL', isEncrypted: true, description: 'SMTP Password' },
      { key: 'SMTP_FROM', category: 'EMAIL', isEncrypted: false, description: 'From address (e.g. YourSMMagent <no-reply@yoursmmagent.com>)' },

      { key: 'PLATFORM_NAME', category: 'SYSTEM', isEncrypted: false, description: 'Platform Brand Name' },
      { key: 'MAINTENANCE_MODE', category: 'SYSTEM', isEncrypted: false, description: 'Global maintenance mode flag (true/false)' }
    ];

    const dbMap = new Map(dbSettings.map((s) => [s.key, s]));

    for (const item of knownKeys) {
      const fromDb = dbMap.get(item.key);
      let rawVal = '';
      let isSet = false;

      if (fromDb && fromDb.value) {
        isSet = true;
        if (fromDb.isEncrypted) {
          try {
            rawVal = decrypt(fromDb.value);
          } catch {
            rawVal = '';
          }
        } else {
          rawVal = fromDb.value;
        }
      } else if (process.env[item.key]) {
        rawVal = process.env[item.key] || '';
        isSet = true;
      }

      const maskedVal = item.isEncrypted
        ? this.maskSecret(rawVal)
        : rawVal;

      result[item.key] = {
        value: maskedVal,
        isSet,
        isEncrypted: item.isEncrypted,
        category: item.category,
        description: fromDb?.description || item.description
      };
    }

    return result;
  }

  /**
   * Mask secrets like API keys or passwords for safe frontend display
   */
  maskSecret(val: string): string {
    if (!val) return '';
    if (val.length <= 8) return '••••••••';
    const prefix = val.slice(0, 4);
    const suffix = val.slice(-4);
    return `${prefix}••••••••${suffix}`;
  }
}

export const settingsService = SettingsService.getInstance();

