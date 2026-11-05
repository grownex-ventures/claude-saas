/**
 * Canonical Redis Key Helpers
 */

/**
 * Canonical key for tenant subscription status caching.
 * Key structure: tenant:<tenantId>:status
 * TTL standard: 3600 seconds
 */
export function tenantStatusKey(tenantId: string): string {
  return `tenant:${tenantId}:status`;
}

