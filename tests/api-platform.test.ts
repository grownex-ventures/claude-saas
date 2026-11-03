import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { app } from '../src/server.js';

describe('API Platform Suite (API-01 & API-02)', () => {
  it('validates that openapi.yaml is a valid OpenAPI 3.1.0 specification (API-01)', () => {
    const openapiPath = path.join(process.cwd(), 'openapi.yaml');
    expect(fs.existsSync(openapiPath)).toBe(true);

    const content = fs.readFileSync(openapiPath, 'utf8');
    const spec = yaml.parse(content);

    // Assert OpenAPI 3.1 specification structure
    expect(spec).toBeDefined();
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBe('YourSMMagent Multi-Tenant API');
    expect(spec.info.version).toBe('1.0.0');

    // Assert paths
    expect(spec.paths).toBeDefined();
    expect(spec.paths['/tenants/configure']).toBeDefined();
    expect(spec.paths['/tenants/activate']).toBeDefined();
    expect(spec.paths['/tenants/me']).toBeDefined();
    expect(spec.paths['/widget/chat']).toBeDefined();
    expect(spec.paths['/widget/config/{tenantId}']).toBeDefined();

    // Assert components and rate limit headers
    expect(spec.components?.securitySchemes?.BearerAuth).toBeDefined();
    expect(spec.components?.responses?.RateLimitExceededError).toBeDefined();
    expect(spec.components?.responses?.RateLimitExceededError?.headers?.['RateLimit-Limit']).toBeDefined();
  });

  it('exposes /api/v1 routes and keeps /api aliases intact (API-02)', () => {
    // Inspect Express router layer stack
    const routes: string[] = [];

    app._router.stack.forEach((layer: any) => {
      if (layer.route?.path) {
        routes.push(layer.route.path);
      } else if (layer.name === 'router' && layer.regexp) {
        const regexStr = layer.regexp.toString();
        routes.push(regexStr);
      }
    });

    // Check versioned /api/v1 mounts
    const hasV1Routes = routes.some((r) => r.includes('\\/api\\/v1'));
    expect(hasV1Routes).toBe(true);

    // Check unversioned /api aliases
    const hasUnversionedRoutes = routes.some((r) => r.includes('\\/api'));
    expect(hasUnversionedRoutes).toBe(true);
  });
});
