import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { app } from '../src/server.js';

function getMountedPrefix(layer: any): string {
  if (!layer.regexp || layer.regexp.fast_slash) return '';
  const str = layer.regexp.toString();
  const clean = str
    .replace(/^\/\^/, '')
    .replace(/\/?\(\?=\\\/\|\$\)\/i$/, '')
    .replace(/\\\//g, '/')
    .replace(/\/\?$/, '');
  return clean.startsWith('/') ? clean : '/' + clean;
}

function extractAllRoutes(router: any, currentPrefix = ''): Array<{ path: string; methods: string[] }> {
  const routes: Array<{ path: string; methods: string[] }> = [];
  if (!router || !router.stack) return routes;

  for (const layer of router.stack) {
    if (layer.route) {
      const p = currentPrefix + (layer.route.path === '/' ? '' : layer.route.path);
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: p, methods });
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      const subPrefix = currentPrefix + getMountedPrefix(layer);
      routes.push(...extractAllRoutes(layer.handle, subPrefix));
    }
  }
  return routes;
}

describe('OpenAPI 3.1 Contract and Route Coverage (API-01, API-02, Phase 9)', () => {
  const openapiPath = path.join(process.cwd(), 'openapi.yaml');
  const specContent = fs.readFileSync(openapiPath, 'utf8');
  const spec = yaml.parse(specContent);

  it('conforms to OpenAPI 3.1.0 specification structure', () => {
    expect(spec).toBeDefined();
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBe('YourSMMagent Multi-Tenant API');
    expect(spec.info.version).toBe('1.0.0');
  });

  it('declares /api/v1 as canonical server and /api as deprecated backward-compatible alias', () => {
    expect(Array.isArray(spec.servers)).toBe(true);
    const urls = spec.servers.map((s: { url: string; description?: string }) => s.url);
    expect(urls).toContain('/api/v1');
    expect(urls).toContain('/api');

    const canonicalServer = spec.servers.find((s: { url: string }) => s.url === '/api/v1');
    expect(canonicalServer?.description?.toLowerCase()).toContain('canonical');

    const deprecatedServer = spec.servers.find((s: { url: string }) => s.url === '/api');
    expect(deprecatedServer?.description?.toLowerCase()).toContain('deprecated');
  });

  it('documents every registered Express /api/v1 endpoint and HTTP method in openapi.yaml', () => {
    const allRoutes = extractAllRoutes(app._router);
    const v1Routes = allRoutes.filter((r) => r.path.startsWith('/api/v1'));
    expect(v1Routes.length).toBeGreaterThan(50);

    const missing: Array<{ route: string; relativePath: string; method?: string; reason: string }> = [];

    for (const route of v1Routes) {
      const relativePath = route.path.replace(/^\/api\/v1/, '').replace(/:([a-zA-Z0-9_]+)/g, '{$1}') || '/';
      const pathItem = spec.paths[relativePath];

      if (!pathItem) {
        missing.push({ route: route.path, relativePath, reason: 'path not found in openapi.yaml' });
        continue;
      }

      for (const m of route.methods) {
        const methodLower = m.toLowerCase();
        if (!pathItem[methodLower]) {
          missing.push({ route: route.path, relativePath, method: m, reason: 'method not documented' });
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('documents fixed two-decimal string format for invoice amounts', () => {
    const paymentInvoiceSchema = spec.components?.schemas?.PaymentInvoice;
    expect(paymentInvoiceSchema).toBeDefined();
    expect(paymentInvoiceSchema.properties?.amount?.type).toBe('string');
    expect(paymentInvoiceSchema.properties?.amount?.pattern).toBe('^\\d+\\.\\d{2}$');

    const pricingCalculationSchema = spec.components?.schemas?.PricingCalculation;
    expect(pricingCalculationSchema).toBeDefined();
    expect(pricingCalculationSchema.properties?.totalAmount?.type).toBe('string');
    expect(pricingCalculationSchema.properties?.totalAmount?.pattern).toBe('^\\d+\\.\\d{2}$');
  });

  it('documents sandbox simulation restrictions on /billing/mock-pay/{orderId}', () => {
    const mockPayItem = spec.paths['/billing/mock-pay/{orderId}'];
    expect(mockPayItem).toBeDefined();
    expect(mockPayItem.post).toBeDefined();

    const desc = mockPayItem.post.description || '';
    expect(desc).toContain('tenant authentication');
    expect(desc).toContain('PENDING');
    expect(desc).toContain('NODE_ENV');
    expect(desc).toContain('Cryptomus');
    expect(desc).toContain('Expired');

    expect(mockPayItem.post.responses['400']).toBeDefined();
    expect(mockPayItem.post.responses['404']).toBeDefined();
    expect(mockPayItem.post.responses['409']).toBeDefined();
  });

  it('documents health check and multi-tenant chat widget history path', () => {
    expect(spec.paths['/health']).toBeDefined();
    expect(spec.paths['/health'].get).toBeDefined();

    // Verify corrected tenantId/sessionId path
    expect(spec.paths['/widget/history/{tenantId}/{sessionId}']).toBeDefined();
    expect(spec.paths['/widget/history/{tenantId}/{sessionId}'].get).toBeDefined();
  });
});
