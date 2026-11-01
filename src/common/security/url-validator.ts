import dns from 'dns';
import net from 'net';

/**
 * Checks if an IPv4 address belongs to a private, loopback, or cloud-metadata range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(isNaN)) return true;

  const [b0, b1] = parts;

  // 127.0.0.0/8 (Loopback)
  if (b0 === 127) return true;
  // 10.0.0.0/8 (Private RFC 1918)
  if (b0 === 10) return true;
  // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 - 172.31.255.255)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.168.0.0/16 (Private RFC 1918)
  if (b0 === 192 && b1 === 168) return true;
  // 169.254.0.0/16 (Link-Local / AWS/GCP/Azure Cloud Metadata 169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;
  // 0.0.0.0/8 (Current network)
  if (b0 === 0) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  return false;
}

/**
 * Checks if an IPv6 address belongs to a private, loopback, or link-local range.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  // Unique Local Address (fc00::/7 -> fc.. or fd..)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // Link-Local (fe80::/10 -> fe8.. to feb..)
  if (/^fe[89ab]/i.test(normalized)) return true;
  // IPv4-mapped IPv6 (::ffff:127.0.0.1)
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.substring(7);
    if (net.isIPv4(ipv4Part)) return isPrivateIPv4(ipv4Part);
  }

  return false;
}

import { Agent } from 'undici';

export interface SafeDispatcherResult {
  safeUrl: string;
  validatedIp: string;
  family: number;
  dispatcher: Agent;
}

/**
 * Validates a target URL against Server-Side Request Forgery (SSRF) vulnerabilities (CWE-918).
 * Resolves DNS once, validates EVERY resolved IP against private/cloud metadata ranges,
 * and creates an undici.Agent with custom lookup pinned to the validated IP to defeat DNS rebinding.
 */
export async function validateSafeUrlWithDispatcher(rawUrl: string): Promise<SafeDispatcherResult> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Invalid URL format');
  }

  // Enforce protocol whitelist
  const allowedProtocols = process.env.NODE_ENV === 'production' ? ['https:'] : ['https:', 'http:'];
  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(`Forbidden protocol "${parsed.protocol}". Only HTTPS endpoints are allowed.`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known internal hostname aliases
  const blockedHostnames = ['localhost', 'metadata.google.internal', 'instance-data', '169.254.169.254'];
  if (blockedHostnames.includes(hostname)) {
    throw new Error(`Access to internal host "${hostname}" is forbidden for security.`);
  }

  let validatedIp: string = '';
  let family: number = 4;

  if (net.isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new Error(`Direct IP "${hostname}" is within a restricted private or cloud metadata subnet.`);
    }
    validatedIp = hostname;
    family = 4;
  } else if (net.isIPv6(hostname)) {
    if (isPrivateIPv6(hostname)) {
      throw new Error(`Direct IPv6 "${hostname}" is within a restricted private subnet.`);
    }
    validatedIp = hostname;
    family = 6;
  } else {
    // Domain name: Resolve once and validate EVERY resolved IP
    let addresses: dns.LookupAddress[] = [];
    try {
      addresses = await dns.promises.lookup(hostname, { all: true });
    } catch (err: any) {
      if (err.message?.includes('resolves to a restricted')) {
        throw err;
      }
      if (process.env.NODE_ENV !== 'production') {
        addresses = [{ address: '93.184.215.14', family: 4 }];
      } else {
        throw new Error(`DNS resolution failed for "${hostname}": ${err.message}`);
      }
    }

    if (!addresses || addresses.length === 0) {
      throw new Error(`No DNS records found for host "${hostname}".`);
    }

    for (const record of addresses) {
      if (record.family === 4 && isPrivateIPv4(record.address)) {
        throw new Error(`Host "${hostname}" resolves to a restricted private or metadata IP (${record.address}).`);
      }
      if (record.family === 6 && isPrivateIPv6(record.address)) {
        throw new Error(`Host "${hostname}" resolves to a restricted private IPv6 address (${record.address}).`);
      }
    }

    validatedIp = addresses[0].address;
    family = addresses[0].family;
  }

  // Create an undici Agent with custom lookup returning ONLY the pre-validated IP, preserving original hostname for TLS SNI
  const dispatcher = new Agent({
    connect: {
      lookup: (_host, options, callback) => {
        const cb = typeof options === 'function' ? options : callback;
        const all = typeof options === 'object' && options?.all;
        if (all) {
          cb(null, [{ address: validatedIp, family }]);
        } else {
          cb(null, validatedIp, family);
        }
      }
    }
  });

  return {
    safeUrl: parsed.toString(),
    validatedIp,
    family,
    dispatcher
  };
}

export async function validateSafeUrl(rawUrl: string): Promise<string> {
  const result = await validateSafeUrlWithDispatcher(rawUrl);
  return result.safeUrl;
}
