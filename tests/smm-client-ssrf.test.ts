import { describe, it, expect, vi, beforeEach } from 'vitest';
import dns from 'dns';
import { SmmProviderClient } from '../src/smm-core/smm-client.js';
import { validateSafeUrlWithDispatcher } from '../src/common/security/url-validator.js';

describe('SmmProviderClient SSRF & API Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks private loopback and cloud metadata URLs (SSRF defense)', async () => {
    const maliciousClient = new SmmProviderClient('http://169.254.169.254', 'test-key');
    await expect(maliciousClient.getBalance()).rejects.toThrow(/internal host|restricted/);
  });

  it('blocks localhost endpoints in production', async () => {
    const localhostClient = new SmmProviderClient('http://localhost:8080', 'test-key');
    await expect(localhostClient.getBalance()).rejects.toThrow(/internal host/);
  });

  it('successfully fetches balance when upstream responds correctly', async () => {
    const client = new SmmProviderClient('https://mypanel.com', 'test-key');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ balance: '124.50', currency: 'USD' }))
    } as any);

    const balance = await client.getBalance();
    expect(balance.balance).toBe('124.50');
    expect(balance.currency).toBe('USD');
  });

  it('handles upstream API errors cleanly', async () => {
    const client = new SmmProviderClient('https://mypanel.com', 'bad-key');
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'Incorrect request or API key' }))
    } as any);

    await expect(client.getBalance()).rejects.toThrow('Incorrect request or API key');
  });

  it('prevents DNS rebinding TOCTOU when hostname rebinds to 127.0.0.1 (SEC-01)', async () => {
    let callCount = 0;
    vi.spyOn(dns.promises, 'lookup').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // First lookup: Public IP
        return [{ address: '93.184.215.14', family: 4 }] as any;
      }
      // Second lookup: Rebound to private 127.0.0.1
      return [{ address: '127.0.0.1', family: 4 }] as any;
    });

    // 1. Initial resolution must pin 93.184.215.14 in the undici dispatcher
    const result = await validateSafeUrlWithDispatcher('https://attacker-rebind.com/api/v2');
    expect(result.validatedIp).toBe('93.184.215.14');

    // 2. Verify that dispatcher lookup returns the pinned pre-validated IP (93.184.215.14)
    // and ignores any subsequent DNS rebind to 127.0.0.1
    const lookupFn = (result.dispatcher as any)[Object.getOwnPropertySymbols(result.dispatcher).find((s) => s.description === 'connect') || '']?.lookup
      || (result.dispatcher as any).connect?.lookup;

    if (lookupFn) {
      await new Promise<void>((resolve) => {
        lookupFn('attacker-rebind.com', {}, (err: any, address: string, family: number) => {
          expect(err).toBeNull();
          expect(address).toBe('93.184.215.14');
          resolve();
        });
      });
    }

    // 3. Second validation attempt where DNS now returns 127.0.0.1 must throw restricted error
    await expect(validateSafeUrlWithDispatcher('https://attacker-rebind.com/api/v2')).rejects.toThrow(
      /restricted private or metadata IP/
    );
  });
});
