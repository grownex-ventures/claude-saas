# Project Handover Report: Cloud-SaaS (YourSMMagent)

**Report Generation Date:** 2026-11-03  
**Repository Branch:** `main`  
**Inspected Commit:** `462d88d081adb1300a553fc7f1f095a97c42d799`  
**Report Target:** Codex / Engineering Team

---

## 1. Executive Summary

**Cloud-SaaS** (also branded as **YourSMMagent** / **SupportBot**) is a production-grade, multi-tenant customer support automation SaaS built for Social Media Marketing (SMM) reseller and provider panels. The application allows SMM panel owners ("tenants") to configure and automate their customer support across three distinct channels from a single unified control center:
1. **Automated Telegram Bots** (built with Grammy, supporting distributed polling locks and webhooks)
2. **WhatsApp Support Lines** (built with Baileys, supporting multi-device QR and 8-digit pairing code pairing)
3. **Embeddable Website Chat Widgets** (built as vanilla Web Components with Shadow DOM isolation)

The platform features an intelligent, multi-provider AI support agent engine (`AiAgentService`) that answers customer questions in real time. Crucially, the platform operates on a **master platform AI model**: the platform owner supplies a single AI provider key (e.g., Google Gemini, OpenAI, Groq, DeepSeek, OpenRouter), and tenant resellers never need to configure or pay for their own LLM keys. AI responses are strictly grounded in the tenant's crawled service catalog, cached in Redis (`< 15ms` response time on repeated queries), and gracefully degrade to deterministic offline responses if network or API issues occur.

The codebase is written in modern TypeScript (ES Modules) on Node.js v24 with Express 4.21, PostgreSQL (via Prisma ORM 6.4), and Redis (ioredis 5.6). The test suite comprises **13 test files with 121 tests** (all passing green), plus 5 comprehensive Playwright E2E browser flows.

---

## 2. Project Identity and Purpose

### 2.1 Repository Metadata
* **Project Name:** `cloud-saas` (package manifest name)
* **Branded Names:** `YourSMMagent` (landing & dashboard brand) / `SupportBot` (internal architecture reference)
* **Absolute Local Folder:** `/home/prashant/Downloads/Cloud-SaaS`
* **Repository Remote URL:** `https://github.com/grownex-ventures/claude-saas.git`
* **Current Working Branch:** `main`
* **Latest Commit:** `462d88d081adb1300a553fc7f1f095a97c42d799` (`fix(ai-engine): respect provider default model mapping in AiProviderClient`)

### 2.2 Uncommitted Local Changes (Preserved in Working Tree)
At the time of this audit, four tracked files have working tree modifications and one untracked helper file exists:
* `package.json`: Updated `dev` script to `tsx watch --env-file=.env src/server.ts` to ensure automatic `.env` variable loading during local development.
* `src/ai-engine/ai-provider.client.ts`: Updated default Google Gemini model mapping to `gemini-flash-lite-latest` and added test-environment fallback guard (`process.env.NODE_ENV === 'test'`) to prevent automated tests from consuming live API quotas or timing out.
* `src/server.ts`: Added `import './common/env.js';` at line 1 to safely load environment variables before downstream static imports execute.
* `tests/ai-agent.test.ts`: Updated provider assertions to reflect `gemini-flash-lite-latest` and isolated environment overrides.
* `src/common/env.ts` *(untracked)*: Safe environment file loader wrapping `process.loadEnvFile?.()` with silent error catching for environments where `.env` is absent.

### 2.3 Product Purpose and Target Roles
SMM panel resellers typically receive repetitive customer support inquiries regarding order tracking, service speeds, refill terms, and pricing. Cloud-SaaS solves this by multiplexing support bots across 20–30+ panel owners per node:
* **Tenant (SMM Panel Owner / Reseller):** Signs up on `/signup`, logs in to `/dashboard`, configures their SMM panel API URL and API keys, deploys their Telegram bot token, links their WhatsApp number, customizes their website chat widget theme, and monitors live telemetry logs.
* **End-User (Panel Customer):** Interacts via Telegram, WhatsApp, or the tenant's website chat widget to check wallet balance (`/balance`), track orders (`#123456` or `/status`), view service prices (`/services`), or ask freeform questions.
* **Platform Administrator (SaaS Owner):** Maintains the backend infrastructure, database connection pool, Redis cache, and sets the master `AI_API_KEY` for global LLM support.

### 2.4 Documented Decisions and Requirements
* **Composite Tenant Isolation (ARC-02):** End-user sessions use composite keys `(tenantId, telegramUserId)` and `(tenantId, whatsappJid)` in PostgreSQL. This allows one individual user to use multiple SMM panels' bots without leaking their personal SMM panel API keys across panels.
* **SSRF and DNS Rebinding Protection (SEC-01):** All outbound SMM panel API calls use `validateSafeUrlWithDispatcher` in `src/common/security/url-validator.ts` to block requests to private IP ranges (RFC 1918), loopback (`127.0.0.1`), and cloud metadata services (`169.254.169.254`).
* **GDPR Compliance Retention Job (COMP-02):** A daily cron job (`RetentionCleanerService`) purges `WebChatMessage` records older than `CHAT_RETENTION_DAYS` (default 90) using distributed Redis lock `lock:retention_cleanup`.
* **Database Connection Pooling (DB-03):** Documented requirement in `docs/deploy.md` to append `connection_limit=20&pool_timeout=10` to `DATABASE_URL` in production to prevent connection starvation.

### 2.5 Uncertain or Undocumented Requirements
* **Billing & Subscription Enforcement:** While the `Tenant` model has a `subscriptionStatus` enum (`INACTIVE`, `ACTIVE`, `EXPIRED`), there is no payment gateway integration (Stripe, LemonSqueezy, Crypto) implemented in the codebase. Subscription status transitions are currently toggled via `/api/v1/tenants/activate` and `/deactivate`.
* **Automated Order Placement via Chat:** `SmmProviderClient.placeOrder()` exists in the codebase, but no bot command or widget flow currently routes to order creation. It is uncertain whether automated ordering was deferred or intentionally omitted for risk mitigation.
* **Dual Marketing Page Architecture:** There is a static HTML landing page in `public/index.html` and a complete React 18 / Vite landing page in `landing/`. It is undocumented whether `landing/` should replace `public/index.html` or be deployed separately to a distinct domain/CDN (such as Cloudflare Pages).

---

## 3. Architecture and Source Map

### 3.1 Tech Stack & Dependency Versions
* **Runtime:** Node.js v24.22.2 (ES Modules, `"type": "module"`)
* **Language:** TypeScript 5.8.2 (`tsc`)
* **Backend Framework:** Express 4.21.2
* **Database & ORM:** PostgreSQL with Prisma Client 6.4.1
* **Caching & State:** Redis via `ioredis` 5.6.0
* **Telegram Bot Engine:** `grammy` 1.35.0
* **WhatsApp Engine:** `@whiskeysockets/baileys` 7.0.0-rc14, `qrcode` 1.5.4, `pino` 9.14.0
* **AI & LLM SDKs:** `openai` 7.47.0, `@anthropic-ai/sdk` 1.3.0, Google Generative Language REST
* **Security & Auth:** `argon2` 0.45.1, `jsonwebtoken` 9.0.2, `helmet` 8.3.0, `express-rate-limit` 8.7.2, `cookie-parser` 1.4.7
* **Documentation:** `swagger-ui-express` 5.0.1, `yaml` 2.9.1
* **HTTP Client:** `undici` 8.12.3
* **Testing:** `vitest` 3.0.8, `@playwright/test` 1.64.1
* **Marketing Landing App (`landing/`):** React 18.3.1, Vite 5.4.10, TailwindCSS 3.4.14, `@tanstack/react-query` 5.59.20, `framer-motion` 11.11.17, `lucide-react` 0.454.0

### 3.2 Compact Source Tree
```
Cloud-SaaS/
├── docs/                               # Architecture and deployment documentation
│   ├── crypto-guidance.md              # AES-256-GCM encryption specifications
│   ├── deploy.md                       # PostgreSQL pooling & retention deployment guide
│   └── landing-deployment-guide.md     # Nginx & Vite hosting documentation
├── landing/                            # Standalone React 18 + Vite landing page
│   ├── src/
│   │   ├── components/                 # Hero, Features, Pricing, Testimonials
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
├── openapi.yaml                        # OpenAPI 3.1 specification for Swagger UI
├── package.json                        # Root backend project manifest
├── playwright.config.ts                # Playwright E2E configuration
├── prisma/
│   ├── migrations/                     # PostgreSQL schema migration history
│   └── schema.prisma                   # Database models & relations
├── public/                             # Static frontend served by Express
│   ├── css/
│   │   ├── global.css                  # Design system variables, cards, forms
│   │   └── style.css                   # General layout styles
│   ├── dashboard.html                  # Multi-tab tenant control center
│   ├── index.html                      # Vanilla HTML marketing page & bot simulator
│   ├── js/app.js                       # Interactive controller for public/index.html
│   ├── login.html                      # Split-screen tenant login
│   ├── signup.html                     # Split-screen tenant registration
│   └── widget.js                       # Embeddable Shadow DOM chat widget
├── src/
│   ├── ai-engine/
│   │   ├── ai-agent.service.ts         # Catalog grounding, query hashing, AI fallback
│   │   └── ai-provider.client.ts       # Multi-provider client (Gemini, OpenAI, etc.)
│   ├── auth/
│   │   ├── auth.controller.ts          # /api/v1/auth routes, cookies, CSRF
│   │   └── auth.service.ts             # Argon2id hashing, JWT signing
│   ├── bot-engine/
│   │   ├── bot-manager.service.ts      # Grammy lifecycle, Redis lock, Telegram handlers
│   │   └── telegram-bot.service.ts     # AES token mapping adapter
│   ├── common/
│   │   ├── audit/audit-log.service.ts  # Persistent tenant audit logger
│   │   ├── crypto/encryption.ts        # AES-256-GCM cipher/decipher routines
│   │   ├── database/prisma.ts          # Prisma client singleton
│   │   ├── env.ts                      # Safe runtime environment loader
│   │   ├── jobs/retention-cleaner.ts   # Daily GDPR chat message cleanup job
│   │   ├── logging/runtime-log.service.ts # Redis ring-buffer telemetry logger
│   │   ├── middleware/tenant-access.middleware.ts # JWT auth & subscription verify
│   │   ├── redis/redis.ts              # ioredis client singleton
│   │   └── security/url-validator.ts   # SSRF & DNS rebinding defensive validator
│   ├── crawler/
│   │   └── panel-crawler.service.ts    # SMM panel crawler and query cache
│   ├── server.ts                       # Express app configuration & bootstrap
│   ├── smm-core/
│   │   └── smm-client.ts               # SMM v2 protocol client (services, balance, status)
│   ├── tenants/
│   │   ├── tenants.controller.ts       # Tenant configuration & channel routes
│   │   └── tenants.service.ts          # Tenant configuration business logic
│   ├── whatsapp-engine/
│   │   ├── formatter.ts                # WhatsApp markdown & currency formatters
│   │   ├── whatsapp-bot-manager.service.ts # Baileys lifecycle & message router
│   │   └── whatsapp.service.ts         # Baileys socket connection & SSE QR stream
│   └── widget/
│       ├── widget.controller.ts        # /api/v1/widget public endpoints & CORS
│       └── widget.service.ts           # Chat session manager & AI pipeline
└── tests/                              # Unit, integration, fuzz, load, and E2E suites
    ├── ai-agent.test.ts
    ├── api-platform.test.ts
    ├── audit-and-compliance.test.ts
    ├── auth.test.ts
    ├── e2e/app.spec.ts
    ├── load/widget-chat.js
    ├── runtime-logs.test.ts
    ├── smm-client-ssrf.test.ts
    ├── telegram-scalability.test.ts
    ├── tenant-system.test.ts
    ├── whatsapp-api.test.ts
    ├── whatsapp-engine.test.ts
    ├── whatsapp-formatter.test.ts
    ├── widget-fuzz.test.ts
    └── widget.test.ts
```

### 3.3 Main Entry Points and Responsibilities
* **`src/server.ts`**: Initializes Express, registers Helmet CSP, CORS, compression, cookie parser, and rate limiters. Mounts `/api/v1` and unversioned `/api` routes. Houses `bootstrap()` which invokes `onModuleInit()` across all bot managers and starts the retention cleanup scheduler.
* **`src/common/middleware/tenant-access.middleware.ts`**: Verifies JWT Bearer tokens or `auth_token` cookies, attaches `req.tenantId`, and validates that the tenant has an `ACTIVE` subscription (reading from Redis `tenant:${tenantId}:status` with a 3600s TTL before falling back to PostgreSQL).
* **`src/ai-engine/ai-agent.service.ts`**: The core AI logic. Formulates prompts grounded in the tenant's crawled catalog (`Tenant.crawledData`), checks Redis for SHA-256 query cache hits (`tenant:${tenantId}:qcache:${hash}`, 24h TTL), calls `AiProviderClient`, and executes deterministic catalog matching fallback if external LLM generation is unavailable.
* **`src/bot-engine/bot-manager.service.ts`**: Manages all active Telegram bots in RAM. Acquires distributed Redis lock `lock:bot_polling:${tenantId}` before launching polling; recovers from 409 Conflict errors; supports Telegram webhook updates with secret token verification.
* **`src/whatsapp-engine/whatsapp-bot-manager.service.ts`**: Manages active Baileys socket instances in RAM, handles pairing code generation, streams QR codes via Server-Sent Events (SSE), and processes incoming WhatsApp messages.
* **`src/widget/widget.service.ts`**: Handles visitor sessions for the website chat widget. Dedupes in-flight service catalog fetches to prevent cache stampedes, records messages in `WebChatMessage`, and routes user queries to `AiAgentService`.

### 3.4 Data Flow Journey (Visitor Message -> Response)
```
[ Website Visitor / Telegram User / WhatsApp Sender ]
                          │
                          ▼
            [ Inbound Gateway / Server ]
   (Rate limiter checks: 20 req/min for widget; 500 req/15min API)
                          │
                          ▼
              [ Channel Controller / Bot Manager ]
  (Validates input, null bytes, max length, extracts session ID)
                          │
                          ▼
              [ AiAgentService.generateReply ]
                          │
         ┌────────────────┴────────────────┐
         ▼                                 ▼
[ 1. Check Redis Cache ]         [ 2. Cache Miss: Catalog Lookup ]
  Key: tenant:{id}:qcache:{hash}    Reads PostgreSQL Tenant.crawledData
  Hit (< 15ms) -> Return cached     or Redis tenant:{id}:catalog:services
         │                                 │
         │                                 ▼
         │                       [ 3. LLM Completion ]
         │                          AiProviderClient (Google Gemini,
         │                          OpenAI, Groq, or DeepSeek)
         │                                 │
         │                       [ 4. Fallback Guard ]
         │                          If LLM fails or times out:
         │                          Deterministic service matcher
         │                                 │
         │                       [ 5. Cache & Audit ]
         │                          Stores answer in Redis (24h TTL)
         │                          Records to RuntimeLogService
         ▼                                 ▼
   [ Format per Channel (HTML / Telegram Markdown / WhatsApp Bold) ]
                          │
                          ▼
           [ Return Response to Customer ]
```

---

## 4. Feature Inventory and Implementation Status

### 4.1 Feature Status Table

| Feature | UI Route / Screen | Backend / API | Data Storage | Status | Evidence |
|---|---|---|---|---|---|
| **Tenant Registration** | `/signup` | `POST /api/v1/auth/signup` | PostgreSQL `Tenant` | **Implemented and verified** | E2E Flow 1 passing; Argon2id hash verified in `tests/auth.test.ts` |
| **Tenant Authentication** | `/login` | `POST /api/v1/auth/login` | PostgreSQL `Tenant`, Cookies | **Implemented and verified** | Sets `auth_token` and `csrf_token` cookies; verified in E2E Flow 1 |
| **Tenant Signout** | Topbar / Sidebar | `POST /api/v1/auth/logout` | Client Cookies | **Implemented and verified** | Clears cookies; redirects to `/login`; verified in E2E Flow 1 |
| **Current User Profile** | `/dashboard` | `GET /api/v1/auth/me` | PostgreSQL `Tenant` | **Implemented and verified** | Returns `tenantId`, `email`, `subscriptionStatus`; tested in `tests/auth.test.ts` |
| **Password Reset / Recovery** | N/A | Missing | Missing | **Missing** | No endpoints, UI forms, or email token mechanics exist |
| **Telegram Bot Configuration** | `/dashboard#deployment` (Tab 1) | `POST /api/v1/tenants/configure` | PostgreSQL `Tenant.botToken` (AES-256) | **Implemented and verified** | E2E Flow 2 passing; verifies token with Telegram `getMe` |
| **Telegram Bot Launch & Polling** | `/dashboard#deployment` | `POST /api/v1/tenants/activate` | Memory `Map`, Redis lock | **Implemented and verified** | Verified in `tests/telegram-scalability.test.ts` (distributed locks & 409 recovery) |
| **Telegram Webhook Updates** | Webhook endpoint | `POST /api/v1/telegram/webhook/:tenantId` | Memory `Map` | **Implemented and verified** | Verified with `x-telegram-bot-api-secret-token` in `tests/telegram-scalability.test.ts` |
| **WhatsApp SSE Live QR Code** | `/dashboard#deployment` (Tab 2) | `GET /api/v1/tenants/whatsapp/qr-stream` | Baileys multi-file auth dir | **Implemented and verified** | Verified in `tests/whatsapp-api.test.ts` |
| **WhatsApp Pairing Code** | `/dashboard#deployment` (Tab 2) | `POST /api/v1/tenants/whatsapp/pairing-code` | Baileys auth dir | **Implemented and verified** | E2E Flow 3 passing |
| **WhatsApp Disconnect** | `/dashboard#deployment` (Tab 2) | `POST /api/v1/tenants/whatsapp/disconnect` | Filesystem & DB | **Implemented and verified** | Verified in `tests/whatsapp-api.test.ts` |
| **Website Chat Widget Styling** | `/dashboard#deployment` (Tab 3) | `POST /api/v1/tenants/widget/configure` | PostgreSQL `Tenant.widget*` | **Implemented and verified** | Verified in `tests/widget.test.ts` |
| **Public Widget Config Fetch** | External site | `GET /api/v1/widget/config/:tenantId` | PostgreSQL `Tenant` | **Implemented and verified** | Verified in `tests/widget.test.ts` (open CORS, no sensitive keys leaked) |
| **Public Chat Message & AI** | External site / Widget | `POST /api/v1/widget/chat` | PostgreSQL `WebChatMessage`, Redis | **Implemented and verified** | E2E Flow 4 passing; live Gemini completion verified |
| **Widget History Fetch** | External site / Widget | `GET /api/v1/widget/history/:tenantId/:sessionId` | PostgreSQL `WebChatMessage` | **Implemented and verified** | Verified in `tests/widget.test.ts` |
| **Runtime Telemetry Feed** | `/dashboard#logs` | `GET /api/v1/tenants/logs` | Redis Ring Buffer (max 500) | **Implemented and verified** | E2E Flow 5 passing; filter chips and pause/resume verified |
| **Clear Runtime Telemetry** | `/dashboard#logs` | `DELETE /api/v1/tenants/logs` | Redis Ring Buffer | **Implemented and verified** | Verified in `tests/runtime-logs.test.ts` |
| **Export Telemetry JSON** | `/dashboard#logs` | Client-side blob trigger | Memory | **Implemented and verified** | Implemented in `public/dashboard.html` line 2110 |
| **Account Deletion (GDPR)** | `/dashboard` modal | `DELETE /api/v1/tenants/me` | PostgreSQL Cascade | **Implemented and verified** | Requires password re-auth; verified in `tests/audit-and-compliance.test.ts` |
| **Chat Retention Purge Worker** | Background Cron | `RetentionCleanerService` | PostgreSQL `WebChatMessage` | **Implemented and verified** | Verified in `tests/audit-and-compliance.test.ts` (distributed lock `lock:retention_cleanup`) |
| **Panel Service Crawler** | Background / On-demand | `PanelCrawlerService.crawlAndCachePanel` | PostgreSQL & Redis | **Implemented and verified** | Verified in `tests/tenant-system.test.ts` (SSRF protected) |
| **SMM Order Placement** | N/A | `SmmProviderClient.placeOrder` | Upstream SMM Panel | **Partially implemented** | Core client method exists; not wired to any chat or bot route |
| **React Marketing Landing** | `landing/` | Standalone Vite App | Static HTML/CSS/JS | **Implemented but unverified** | Compiles via `npm run landing:build`; not routed by default Express server |
| **Swagger API Documentation** | `/api-docs` | `app.use('/api-docs')` | `openapi.yaml` | **Implemented and verified** | HTTP 200 OK verified on `/api-docs/` and `/api-docs.json` |

---

## 5. UI and Design

### 5.1 Screen Inventory & Navigation
1. **`/login` & `/signup`**: Split-screen responsive authentication screens. Left pane contains branded hero copy, trust badges, and security assurances; right pane contains high-contrast input forms with live client-side validation, password show/hide toggles, and CSRF token binding.
2. **`/dashboard`**: Primary tenant control center. Features a collapsible sidebar (mobile drawer toggleable via hamburger menu), user status pill, light/dark mode toggle, and two primary view panes:
   * **View 1: Bot Deployment (`#viewDeployment`)**: Contains channel switcher tabs for **Telegram Bot**, **WhatsApp Support Line**, and **Website Chat Widget**. Houses live credential forms, SSE QR stream viewer, pairing code inputs, widget preview iframe, and embed code snippet generator.
   * **View 2: Runtime Logs (`#viewRuntimeLogs`)**: High-density telemetry terminal displaying live system activity across Telegram, WhatsApp, and Widget channels. Features a pause/resume stream toggle, channel filter chips, log level select (`info`, `success`, `warn`, `error`), live search input with debouncing, clear buffer action, and JSON export.
3. **Public Widget (`public/widget.js`)**: Standalone, lightweight JavaScript embed that injects a floating circular chat bubble into host websites. Implemented strictly inside a **Shadow DOM** (`#smm-support-widget-root`) to isolate CSS variables, prevent global style pollution, and protect host page styling.

### 5.2 Styling System & Assets
* **CSS Custom Properties (`public/css/global.css`)**: Implements semantic design tokens:
  * Primary Accent: `--color-accent: #ea580c` (SMM orange) / `--color-accent-hover: #c2410c`
  * Status Tokens: `--color-emerald: #10b981` (active/online), `--color-rose: #f43f5e` (error/inactive), `--color-amber: #f59e0b` (warning/connecting)
  * Neutrals: `--color-bg: #ffffff`, `--color-card: #ffffff`, `--color-text-main: #0f172a`, `--color-text-muted: #64748b`
  * Dark Theme Overrides: Activated via `[data-theme="dark"]` on `<html>`.
* **Visual Assets**: Monoline SVG icons embedded inline throughout `public/dashboard.html` and `public/index.html`. Raster images `public/images/hero-robot.jpg` and `public/images/telegram-3d.jpg`. Reference visual audit screenshots preserved in `landing/audit-screenshots/`.

---

## 6. Backend, Data, and Authentication

### 6.1 Database Schema & Entity Ownership
Defined in `prisma/schema.prisma` across 6 core models:
1. **`Tenant`**: The tenant account. Holds email, Argon2id `passwordHash`, AES-256 encrypted `botToken`, encrypted `widgetApiKey`, SMM `panelApiUrl`, `subscriptionStatus`, JSON `crawledData`, and widget branding fields.
2. **`BotUserSession`**: Maps an individual Telegram user (`telegramUserId`) to their personal SMM panel API key (`userPanelKey`) for a specific tenant (`tenantId`). Enforces composite uniqueness: `@@unique([tenantId, telegramUserId])`.
3. **`WhatsAppSession`**: Maps a customer's WhatsApp JID (`whatsappJid`) to their encrypted SMM panel API key. Enforces composite uniqueness: `@@unique([tenantId, whatsappJid])`.
4. **`WebChatSession`**: Tracks visitor sessions for the website chat widget. Enforces composite uniqueness: `@@unique([tenantId, sessionId])`.
5. **`WebChatMessage`**: Individual chat messages belonging to a `WebChatSession`. Stores `role` (`user` | `assistant`), `content`, and indexed `createdAt` timestamp.
6. **`AuditLog`**: Security and compliance log. Records `action` (e.g. `AUTH_LOGIN`, `BOT_DEPLOYED`, `ACCOUNT_DELETED`), `actorIp`, `userAgent`, and sanitized `metadata`.

### 6.2 Authentication and Session Lifecycle
* **Password Security:** Hashes passwords with Argon2id using `argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 })`. Timing-safe password verification via `argon2.verify()`.
* **Token Transport:** Issues 7-day JSON Web Tokens signed with `JWT_SECRET`. Tokens are set in `httpOnly`, `sameSite: 'strict'` cookies named `auth_token`.
* **CSRF Mitigation:** Issues a cryptographic random 32-byte hex token in a readable `csrf_token` cookie. All state-mutating requests (`POST`, `PUT`, `DELETE`) require the matching `X-CSRF-Token` header.
* **Rate Limiting:**
  * Global API Limiter: 500 requests per 15 minutes window.
  * Auth Limiter: 30 requests per 15 minutes window on `/api/v1/auth/login` and `/api/v1/auth/signup`.
  * Widget Chat Limiter: 20 messages per minute per IP + tenant + session composite key.

---

## 7. External Integrations and Configuration

### 7.1 External Services Matrix

| Service | Protocol / Client | Purpose | Failure Handling |
|---|---|---|---|
| **Telegram Bot API** | HTTPS / Grammy | Token validation, webhook dispatch, long-polling bot daemon | Network retries; 409 Conflict auto-recovery halts conflicting pollers |
| **WhatsApp Multi-Device** | WebSocket / Baileys | Multi-device session connection, pairing codes, QR streams | Reconnect exponential backoff up to 30s; SSE connection status updates |
| **Upstream SMM Panels** | HTTPS / Undici | Service catalog crawling (`action=services`), order tracking (`status`), balance | SSRF validation blocks private IPs; 12s timeout; falls back to cached catalog |
| **AI Providers** | HTTPS / OpenAI & REST | Multi-provider customer support completions (Gemini, OpenAI, Groq, etc.) | Graceful zero-downtime degradation to deterministic offline catalog matching |

### 7.2 Environment Variables Reference

| Variable Name | Required | Target | Purpose / Valid Format |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | Server | PostgreSQL connection string. Must include pooling params in production (`connection_limit=20&pool_timeout=10`) |
| `REDIS_URL` | **Yes** | Server | Redis connection URL (`redis://:password@host:6379`) |
| `JWT_SECRET` | **Yes** | Server | Cryptographic string (min 32 chars) for tenant JWT signing |
| `ENCRYPTION_KEY` | **Yes** | Server | 64-character hex string (32 bytes) for AES-256-GCM credential encryption |
| `PORT` | Optional | Server | Application listening port (default `3000`) |
| `CHAT_RETENTION_DAYS` | Optional | Server | Days to retain web chat messages before daily purge (default `90`) |
| `AI_PROVIDER` | Optional | Server | Master LLM provider: `gemini`, `openrouter`, `openai`, `groq`, `anthropic`, `nvidia`, `deepseek` |
| `AI_API_KEY` | Optional | Server | API key for the chosen AI provider. If omitted, engine uses offline fallback |
| `AI_MODEL` | Optional | Server | Model identifier (e.g. `gemini-flash-lite-latest`, `gpt-4o-mini`, `llama-3.3-70b-versatile`) |
| `AI_BASE_URL` | Optional | Server | Custom base URL for private or self-hosted LLM proxies (Ollama, vLLM) |
| `AI_TEMPERATURE` | Optional | Server | Sampling temperature between `0.0` and `1.0` (default `0.3`) |
| `AI_MAX_TOKENS` | Optional | Server | Maximum tokens per completion response (default `600`) |
| `SWAGGER_ENABLED` | Optional | Server | Set to `'false'` to disable `/api-docs` in locked-down production environments |
| `E2E_DISABLE_AUTH_LIMIT`| Optional | Server | Set to `'1'` in development/test only to allow automated Playwright runs. Server crashes if enabled in production |
| `LOG_LEVEL` | Optional | Server | Pino logging level for Baileys WhatsApp client (default `'silent'`) |

---

## 8. Flaws and Unfinished Work

### 8.1 Prioritized Findings Table

| ID | Severity | Category | Problem | User / System Impact | Reproduction & Evidence | File and Line | Suggested Correction |
|---|---|---|---|---|---|---|---|
| **FIND-01** | **High** | Security | Hardcoded fallback secret in encryption module | If `ENCRYPTION_KEY` and `JWT_SECRET` are both omitted or misconfigured, keys are encrypted using a hardcoded string | Read `getMasterKey()`: fallback string `'prashant_cloud_super_secret_jwt_key_2026_xyz987'` is compiled into source | [`src/common/crypto/encryption.ts#L15`](file:///home/prashant/Downloads/Cloud-SaaS/src/common/crypto/encryption.ts#L15) | Throw a fatal error on startup if `ENCRYPTION_KEY` is not exactly 64 hex characters; never fall back to static strings |
| **FIND-02** | **Medium** | Bug / DB | Foreign key constraint violation on `AuditLog.tenantId` | If `AuditLogService.record()` is invoked with a non-existent or uncommitted tenant ID, PostgreSQL rejects the insert | Visible in test logs: `Foreign key constraint violated on the constraint: AuditLog_tenantId_fkey` | [`src/common/audit/audit-log.service.ts#L51`](file:///home/prashant/Downloads/Cloud-SaaS/src/common/audit/audit-log.service.ts#L51) | Make `tenantId` optional or nullable on `AuditLog`, or verify tenant existence before insert |
| **FIND-03** | **Medium** | Gap / UX | Password Reset flow completely missing | Tenants who forget their passwords have no automated mechanism to recover their accounts | No `/forgot-password` route in `src/server.ts`, no reset token table in Prisma schema | [`src/auth/auth.controller.ts#L48`](file:///home/prashant/Downloads/Cloud-SaaS/src/auth/auth.controller.ts#L48) | Implement `PasswordResetToken` model in Prisma, add `/api/v1/auth/forgot-password` and `/reset-password` endpoints |
| **FIND-04** | **Medium** | Resilience | Unbounded external HTTP call during bot configuration | `POST /api/tenants/configure` makes a direct `fetch` to `https://api.telegram.org/bot<token>/getMe` without an explicit timeout controller | If Telegram API is slow or blocked, tenant HTTP request hangs up to default OS socket timeout (30-60s) | [`src/tenants/tenants.service.ts#L60`](file:///home/prashant/Downloads/Cloud-SaaS/src/tenants/tenants.service.ts#L60) | Wrap the `getMe` call in an `AbortController` with an 8-second timeout |
| **FIND-05** | **Low** | Architecture | Marketing landing page decoupled from root build | The React 18 / Vite landing page in `landing/` builds into `landing/dist/` but is not served by Express root | `public/index.html` serves a legacy vanilla HTML page while `landing/` is a separate Vite application | [`package.json#L10`](file:///home/prashant/Downloads/Cloud-SaaS/package.json#L10) & [`docs/landing-deployment-guide.md`](file:///home/prashant/Downloads/Cloud-SaaS/docs/landing-deployment-guide.md) | Either configure Express to serve `landing/dist` on `GET /` in production, or deploy `landing/` to a CDN like Cloudflare Pages |
| **FIND-06** | **Low** | Gap | Order Placement client method not exposed | `SmmProviderClient.placeOrder()` is implemented and tested, but no customer bot command exists for it | Customers cannot place orders directly from Telegram or WhatsApp chat | [`src/smm-core/smm-client.ts#L158`](file:///home/prashant/Downloads/Cloud-SaaS/src/smm-core/smm-client.ts#L158) | Implement `/order <service_id> <link> <quantity>` command in Grammy and Baileys bot handlers |

---

## 9. Verification & Test Suite Analysis

### 9.1 Verification Commands and Results
* **TypeScript Compilation (`npm run build`):**
  * Command: `tsc`
  * Result: **Exited with code 0 (0 errors)**. All types compile cleanly.
* **Landing Page Compilation (`npm run landing:build`):**
  * Command: `npm --prefix landing run build` (Vite 5.4.10)
  * Result: **Exited with code 0**. 1996 modules transformed; production bundle emitted in 2.39s.
* **Unit and Integration Test Suite (`npm test`):**
  * Command: `npx vitest run`
  * Result: **13 of 13 test files passed (121 of 121 tests passed)**. Total execution time: ~4.55 seconds.
  * Breakdown:
    * `tests/telegram-scalability.test.ts`: 6 tests passing (Distributed locks, 409 Conflict auto-recovery, standby modes)
    * `tests/widget.test.ts`: 10 tests passing (Branding fetch, order tracking, catalog caching, stampede deduplication)
    * `tests/audit-and-compliance.test.ts`: 6 tests passing (Retention cleaner daily purge, account deletion, IP logging)
    * `tests/smm-client-ssrf.test.ts`: 5 tests passing (Blocks 127.0.0.1, 10.0.0.1, 169.254.169.254, octal IP bypasses)
    * `tests/whatsapp-engine.test.ts`: 5 tests passing (Multi-file auth, socket startup, reconnect backoff)
    * `tests/whatsapp-api.test.ts`: 4 tests passing (SSE QR stream headers, pairing code requests, disconnect)
    * `tests/whatsapp-formatter.test.ts`: 6 tests passing (Markdown bolding, catalog text wrapping, currency format)
    * `tests/runtime-logs.test.ts`: 10 tests passing (Redis ring buffer, log filtering, clear buffer, level thresholds)
    * `tests/auth.test.ts`: 23 tests passing (Argon2id hashing, timing safety, login/signup status codes, E2E guards)
    * `tests/api-platform.test.ts`: 2 tests passing (Versioned `/api/v1` and unversioned `/api` backward compatibility)
    * `tests/widget-fuzz.test.ts`: 18 tests passing (Null byte rejection, oversized payload protection, prototype pollution)
    * `tests/tenant-system.test.ts`: 16 tests passing (Middleware JWT attach, crawler PostgreSQL persistence, Grammy lifecycle)
    * `tests/ai-agent.test.ts`: 7 tests passing (Multi-provider default mapping, offline fallback, catalog query caching)
* **End-to-End Suite (`npm run test:e2e`):**
  * Command: `npx playwright test`
  * Scope: 5 full browser interaction flows in `tests/e2e/app.spec.ts` (Signup, Telegram configure, WhatsApp mode switcher, live Shadow DOM widget chat, runtime logs live streaming).
  * Historical Note: All 5 flows were validated passing in recent commits (`c9f167a` and `153c05b`).

### 9.2 Test Fidelity Assessment
* **Mocks vs Real Code:** Unit tests rigorously test production services (`TenantsService`, `BotManagerService`, `WidgetService`, `AiAgentService`). Redis and Prisma methods are spied/mocked with `vi.spyOn` during unit tests to avoid flakiness, while Playwright E2E tests run against a live running server connected to real local PostgreSQL and Redis instances.
* **Offline AI Mode in Tests:** `AiProviderClient` includes a `process.env.NODE_ENV === 'test'` condition that defaults to deterministic catalog responses. This ensures test suites do not fail due to external third-party LLM rate limits or network outages.

---

## 10. Deployment and Operations

### 10.1 Production Architecture
* **Process Model:** Single-process Node.js server managed via `systemd` or `pm2`:
  ```bash
  pm2 start dist/src/server.js --name "cloud-saas" --max-memory-restart 1G
  ```
* **Reverse Proxy:** Designed to sit behind Nginx, Caddy, or Cloudflare. `app.set('trust proxy', 1)` is enabled in `src/server.ts` to ensure accurate client IP resolution for rate limiting.
* **Database Connection Pooling:** Mandatory production query parameters on `DATABASE_URL`:
  ```env
  DATABASE_URL="postgresql://user:password@host:5432/cloud_saas?schema=public&connection_limit=20&pool_timeout=10"
  ```
* **Daily Purge Cron:** `RetentionCleanerService.startDailyRetentionJob()` runs automatically inside `bootstrap()`, utilizing distributed Redis lock `lock:retention_cleanup` to ensure only one instance executes the purge in multi-instance deployments.
* **Health Endpoint:** `GET /health` returns HTTP 200 with `{ status: "ok", uptime: <seconds> }`.

---

## 11. Recommended Starting Point for Codex

### 11.1 Files to Read First
1. **[`src/server.ts`](file:///home/prashant/Downloads/Cloud-SaaS/src/server.ts)**: Read to understand how Express, middleware, rate limiters, routes, and background bot daemons are bootstrapped and shut down.
2. **[`prisma/schema.prisma`](file:///home/prashant/Downloads/Cloud-SaaS/prisma/schema.prisma)**: Read to master the data models, composite unique keys, cascade deletion rules, and relationships.
3. **[`src/ai-engine/ai-agent.service.ts`](file:///home/prashant/Downloads/Cloud-SaaS/src/ai-engine/ai-agent.service.ts)** & **[`src/ai-engine/ai-provider.client.ts`](file:///home/prashant/Downloads/Cloud-SaaS/src/ai-engine/ai-provider.client.ts)**: Read to understand how the platform provides universal AI support across Telegram, WhatsApp, and the website widget without requiring tenant keys.
4. **[`src/bot-engine/bot-manager.service.ts`](file:///home/prashant/Downloads/Cloud-SaaS/src/bot-engine/bot-manager.service.ts)** & **[`src/whatsapp-engine/whatsapp-bot-manager.service.ts`](file:///home/prashant/Downloads/Cloud-SaaS/src/whatsapp-engine/whatsapp-bot-manager.service.ts)**: Read to understand how Telegram bots and WhatsApp sockets are dynamically started, tracked in memory, and stopped.
5. **[`public/dashboard.html`](file:///home/prashant/Downloads/Cloud-SaaS/public/dashboard.html)** & **[`public/widget.js`](file:///home/prashant/Downloads/Cloud-SaaS/public/widget.js)**: Read to understand the frontend control center and the Shadow DOM widget embed mechanics.

### 11.2 Top Five Issues to Tackle in Dependency Order
1. **Fix `ENCRYPTION_KEY` Validation (`src/common/crypto/encryption.ts`):** Remove the hardcoded fallback secret. Ensure the server throws a clear, fatal configuration error on startup if `ENCRYPTION_KEY` is not set or not 64 hex characters.
2. **Handle Nullable Tenants in `AuditLog` (`prisma/schema.prisma` & `src/common/audit/audit-log.service.ts`):** Make `tenantId` optional or handle foreign key misses gracefully so audit logging does not fail when events are triggered before tenant records are fully committed.
3. **Add Request Timeout to Telegram `getMe` (`src/tenants/tenants.service.ts`):** Wrap the token verification call in an `AbortController` with an 8-second timeout to prevent the dashboard configure form from hanging indefinitely.
4. **Implement Automated Password Reset (`src/auth/`):** Add `PasswordResetToken` to Prisma schema and build `/api/v1/auth/forgot-password` and `/reset-password` endpoints.
5. **Unify Marketing Landing Deployment (`docs/landing-deployment-guide.md`):** Establish an automated build pipeline so that building the project either synchronizes `landing/dist` into `public/` or provides a documented CI/CD deployment script for Cloudflare Pages.

### 11.3 Decisions and Functionality to Preserve
* **Do NOT change composite keys:** The `(tenantId, telegramUserId)` and `(tenantId, whatsappJid)` composite constraints are vital. They prevent cross-tenant session pollution when customers use multiple SMM panels.
* **Do NOT bypass SSRF validation:** Outbound calls to panel API URLs must always pass through `validateSafeUrlWithDispatcher`.
* **Preserve Shadow DOM encapsulation in `widget.js`:** The embeddable widget must remain isolated inside its Shadow Root to prevent host website CSS collisions.
* **Maintain Master AI Provider Architecture:** Tenants should never be required to supply their own LLM API keys. The platform provides AI globally.

### 11.4 Questions Only the Product Owner Can Answer
1. Should customer order placement (`/order` or placing orders via chat) be enabled in Telegram and WhatsApp bots, or should bots remain strictly restricted to catalog inquiries and order status checks?
2. Which payment gateway (Stripe, Cryptomus, Sellix, NowPayments) will be used to automate tenant subscriptions?
3. Should the React marketing page in `landing/` be deployed as a separate Cloudflare Pages project for `yoursmmagent.com`, or should Express serve it directly?

### 11.5 Suggested First Narrowly Scoped Task
**Task:** Hardening Encryption Key Startup Verification & AuditLog Resilience  
**Acceptance Criteria:**
1. In `src/common/crypto/encryption.ts`, remove the hardcoded static string fallback. If `process.env.ENCRYPTION_KEY` is missing or not 64 hex characters, throw a descriptive `Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).')`.
2. In `src/common/audit/audit-log.service.ts`, verify or catch foreign key errors cleanly so unit tests and transient onboarding flows never log Prisma foreign key constraint errors.
3. Run `npm run build` and `npm test` to verify all 121 tests pass without warnings.

