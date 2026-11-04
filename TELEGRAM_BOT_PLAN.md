# Telegram Bot Comprehensive Improvement & Fix Plan

> **Target Goal:** Transform the multi-tenant Telegram Bot into a production-grade, highly reliable, full-featured support engine for SMM panel owners and their customers.  
> **Status:** Pending User Input & Requirements  

---

## 1. Identified Architecture & Reliability Gaps

| # | Component | Current State | Proposed Fix |
|---|---|---|---|
| **1** | **Singleton Lifecycle** | `server.ts` creates `new BotManagerService()`, `tenants.service.ts` creates another separate instance, and webhook routes call `getInstance()`. | Unify strictly to `BotManagerService.getInstance()` across all modules so dashboard actions and server daemons manage the identical in-memory bot instances. |
| **2** | **Webhook vs. Polling** | Polling by default can encounter `409 Conflict: terminated by other getUpdates` if another process runs. | Implement automatic smart switching: In production domain (`app.yoursmmagent.com`), auto-register Telegram Webhooks with secret token validation; in dev/localhost, use distributed Redis-locked polling. |
| **3** | **Command Suite** | Only `/start`, `/setkey`, and `/balance` are wired. | Add full native command suite: `/help`, `/status <order_id>`, `/services [keyword]`, and `/cancel` alongside natural language AI chatting. |
| **4** | **Tenant Dashboard UI** | Token input field with save button, but no live connection test or status indicator. | Add **"Test Bot Connection"** button (queries Telegram `getMe`), shows verified `@bot_username`, and displays live status badge (Online, Standby, or Token Invalid). |
| **5** | **AI Grounding & Settings** | Calls AI, but fallback behavior during LLM rate-limit or downtime needs structured panel catalog matching. | Ensure AI engine dynamically picks up the provider, model, and system prompt set in Super Admin with resilient fallback. |

---

## 2. Detailed Technical Breakdown

### A. Core Engine & Singleton Unification
- **File:** `src/bot-engine/bot-manager.service.ts`
  - Ensure private constructor with enforced `getInstance()` singleton.
  - Fix duplicate instances in `src/tenants/tenants.service.ts` and `src/server.ts`.
  - Add robust lifecycle hooks (`startTenantBot`, `stopTenantBot`, `restartTenantBot`).

### B. Telegram Native Commands & Interactive Menu
- **`/start`:** Interactive welcome message with inline keyboard buttons:
  - 🔑 Link Account (`/setkey`)
  - 💰 Check Balance (`/balance`)
  - 📦 Order Status (`/status`)
  - 📋 Services List (`/services`)
  - 💬 Ask Support (Chat naturally with AI)
- **`/setkey <api_key>`:** Securely encrypts user's SMM panel key in PostgreSQL via AES-256; automatically deletes the user's message containing the raw API key for privacy (CWE-532).
- **`/balance`:** Queries tenant's panel `/api/v2?action=balance` via safe SSRF-validated client and returns formatted balance with currency.
- **`/status <order_id>`:** Queries `/api/v2?action=status&order=<id>` and returns Status, Charge, Start Count, and Remains.
- **`/services [keyword]`:** Searches tenant's services catalog for matching items (e.g. `/services instagram`) and displays service ID, name, rate per 1,000, and min/max limits.
- **Natural Language Messages:** Routed to `AiAgentService` grounded in the tenant's catalog, answering questions about payment methods, refills, delivery times, and panel instructions.

### C. Live Bot Testing & Management API
- **Endpoint:** `GET /api/tenants/telegram/test`
  - Validates the tenant's stored bot token against `https://api.telegram.org/bot<TOKEN>/getMe`.
  - Returns:
    ```json
    {
      "valid": true,
      "botUsername": "YourPanelSupportBot",
      "botFirstName": "Your Panel Support",
      "mode": "webhook",
      "status": "online"
    }
    ```
- **Endpoint:** `POST /api/tenants/telegram/toggle`
  - 1-click toggle to Pause / Resume the bot.

### D. Tenant Dashboard Improvements
- **File:** `public/dashboard.html`
  - Under **Telegram Bot Setup**:
    - Add **"Test Bot Connection"** button next to Save.
    - Show live bot badge: `🟢 Online (@YourPanelBot)` or `🔴 Inactive / Invalid Token`.
    - Provide a copyable Webhook URL if tenant prefers manual webhook setup.

---

## 3. USER DESIRES & CUSTOM REQUIREMENTS (Confirmed & Incorporated)

### ✅ Point 1: Strict Competitor & Foreign SMM Panel Rejection Guardrail
- **Requirement:** The bot must reject all queries about any other SMM panel.
- **Implementation:**
  - **Prompt Hardening:** Strict instruction in the system prompt: The bot is dedicated *only* to the tenant's panel (`panelApiUrl`). It is forbidden from discussing, recommending, comparing, or troubleshooting any third-party or competitor SMM panel.
  - **Refusal Response:** If a user mentions competing panels (e.g., JustAnotherPanel, Peakerr, SMMKing, etc.), the bot responds:
    > *"I am the dedicated AI assistant for this panel only. I cannot discuss or assist with other SMM panels. How can I help you with our services?"*
  - **Regex / Keyword Interceptor:** Deterministic pre-filter to catch foreign panel domains and URLs before calling the LLM.

---

### ✅ Point 2: Live API Execution for All Queries (Services, Status, Place Order, Balance)
- **Requirement:** If a user asks for service details, order status, placing an order, or any query, the bot MUST use live API calls to retrieve real data—never guess or hallucinate.
- **Implementation:**
  - **Service Inquiry Tool (`search_services`):** Fetches real-time service ID, name, rate per 1,000, and min/max limits directly from the panel's synced catalog.
  - **Order Status Tool (`check_order_status`):** Calls `/api/v2?action=status&order=<id>` using the user's linked API key or the panel API to return live status (`Pending`, `In progress`, `Completed`, `Partial`, `Canceled`), start count, and remains.
  - **Account Balance Tool (`check_balance`):** Calls `/api/v2?action=balance` and returns the real live wallet balance.
  - **Place Order Tool (`place_order`):** Calls `/api/v2?action=add&service=<id>&link=<url>&quantity=<qty>` with user confirmation and linked credentials.
  - **Order Refill / Cancel Tool (`refill_order`, `cancel_order`):** Calls `/api/v2?action=refill` or `/api/v2?action=cancel`.

---

### ✅ Point 3: Complete Chat History Persistence & Strict Tenant Data Isolation
- **Requirement:** Save every single chat message to the database for future use, maintaining separate data for every admin (e.g., User-1/Tenant-1 has their own users' data, completely isolated from User-2/Tenant-2).
- **Implementation:**
  - **New Schema Entity (`TelegramChatMessage`):**
    ```prisma
    model TelegramChatMessage {
      id             String         @id @default(uuid())
      tenantId       String
      tenant         Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
      telegramUserId String
      session        BotUserSession @relation(fields: [tenantId, telegramUserId], references: [tenantId, telegramUserId], onDelete: Cascade)
      role           String         // 'user' | 'assistant'
      content        String
      createdAt      DateTime       @default(now())

      @@index([tenantId, telegramUserId, createdAt])
      @@index([tenantId, createdAt])
    }
    ```
  - **Multi-Tenant Isolation:**
    - Every message (incoming user query + outgoing bot answer) is written with `tenantId` and `telegramUserId`.
    - Tenant 1 can only view, query, and search Tenant 1's customer chat history.
    - Tenant 2 can only view, query, and search Tenant 2's customer chat history.
    - Conversation memory: When an end-user sends a message, the bot loads the last 6 turns from `TelegramChatMessage` for that specific `(tenantId, telegramUserId)` so the AI has continuous memory of their conversation.

---

## 4. Execution Plan (Files to Touch)

1. **Database Schema:** `prisma/schema.prisma`
   - Add `TelegramChatMessage` model linked to `Tenant` and `BotUserSession`.
   - Run `npx prisma db push` to sync PostgreSQL without breaking existing data.
2. **AI Provider & Tools:** `src/ai-engine/ai-agent.service.ts`
   - Add competitor rejection guardrail in prompt & pre-filter.
   - Add `place_order`, `refill_order`, and ensure `search_services`, `check_order_status`, `check_balance` always trigger live API calls.
3. **Telegram Engine:** `src/bot-engine/bot-manager.service.ts`
   - Unify singleton (`getInstance()`).
   - Wire all commands (`/start`, `/setkey`, `/balance`, `/status`, `/services`, `/help`).
   - Persist incoming user messages and outgoing bot replies to `TelegramChatMessage`.
   - Pass recent chat history to `AiAgentService`.
4. **Lifecycle & Routes:** `src/tenants/tenants.service.ts` & `src/server.ts`
   - Unify `BotManagerService.getInstance()` across server startup, tenant settings, and webhook routes.
5. **Testing & Verification:**
   - Add automated unit tests covering competitor rejection, live API tool calls, and multi-tenant chat persistence.
   - Run `npx vitest run tests/telegram-scalability.test.ts tests/ai-agent.test.ts`.



