import http from 'k6/http';
import { check, sleep } from 'k6';

// -----------------------------------------------------------------------------
// k6 Load Test: 50 Concurrent Visitors against Cached SMM Service Catalog
// Target: POST /api/widget/chat (or /api/v1/widget/chat)
// -----------------------------------------------------------------------------

export const options = {
  scenarios: {
    cached_catalog_stress: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
    },
  },
  thresholds: {
    // 95% of requests must complete in under 200ms (verifying cache speed)
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    // Less than 1% failed requests allowed
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';
const TENANT_ID = __ENV.TENANT_ID || 'demo-tenant-id';

const CATALOG_QUERIES = [
  'What are your Instagram follower prices?',
  'Show me YouTube views rates',
  'Tell me about Telegram members',
  'What services do you provide for TikTok?',
  'Can I see your Twitter pricing catalog?',
  'How much for Spotify plays?',
  'List all available follower packages'
];

export default function () {
  const query = CATALOG_QUERIES[Math.floor(Math.random() * CATALOG_QUERIES.length)];
  const sessionId = `k6-session-${__VU}-${__ITER}`;

  const payload = JSON.stringify({
    tenantId: TENANT_ID,
    sessionId: sessionId,
    message: query,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'k6-load-tester/1.0',
    },
    tags: { name: 'WidgetChatCachedCatalog' },
  };

  const res = http.post(`${BASE_URL}/api/widget/chat`, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has reply body': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && typeof body.reply === 'string' && body.reply.length > 0;
      } catch {
        return false;
      }
    },
    'response under 200ms': (r) => r.timings.duration < 200,
  });

  // User think time between queries
  sleep(1);
}
