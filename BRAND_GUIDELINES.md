# YourSMMagent — Brand Identity & Style Guidelines

> **Version:** 1.0.0  
> **Effective Date:** November 2026  
> **Brand Guardian Authority:** Global SaaS Brand Guidelines  
> **Canonical Domain:** [yoursmmagent.com](https://yoursmmagent.com)

---

## 1. Executive Summary & Brand Overview

**YourSMMagent** is an enterprise-grade, multi-tenant AI customer support platform built specifically for Social Media Marketing (SMM) reseller panels and provider platforms. 

Previously known during early internal prototyping under fragmented working titles (*SupportBot*, *Cloud-SaaS*), the official unified brand identity is **YourSMMagent**. This guide defines the visual identity, verbal voice, typography, color tokens, and governance rules across all digital touchpoints (web application, embeddable widget, Telegram bots, WhatsApp bots, and developer APIs).

```
           ┌──────────────────────────────────────────────┐
           │                 YourSMMagent                 │
           │   AI Customer Support for SMM Panel Networks │
           └──────────────────────┬───────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
  Web Application           Embeddable Widget       Omnichannel Bots
  - Landing & Docs         - Live Panel Chat        - Telegram Bot
  - Tenant Dashboard       - Auto-Sync Context      - WhatsApp Support
```

---

## 2. Brand Foundation Framework

### 2.1 Brand Purpose
To eliminate customer support friction for SMM panel owners by delivering instantaneous, accurate, 24/7 automated order resolution and balance inquiries through intelligent AI and automated panel API integration.

### 2.2 Brand Vision
To become the global gold standard in automated customer support for the global reseller economy, empowering digital service providers to scale effortlessly without ballooning support ticket costs.

### 2.3 Brand Mission
Empower SMM panel operators with an omnichannel, zero-leakage, multi-tenant AI support suite that integrates directly with their existing order catalogs, payment flows, and user databases within minutes.

### 2.4 Core Values

| Core Value | Meaning | Behavioral Manifestation |
| :--- | :--- | :--- |
| **Precision & Speed** | Queries answered in sub-seconds with accurate live data. | Real-time Redis caching and millisecond SMM API polling; never make a user wait. |
| **Strict Isolation** | Complete tenant boundary privacy and zero data leakage. | Composite keys `{tenantId}:{channelUserId}`, encrypted secrets, isolated memory contexts. |
| **Human-Agent Harmony** | AI does the heavy lifting, but human escalation is seamless. | Automated handling of common orders, transparent handover to panel staff when necessary. |
| **Effortless Elegance** | Clean, uncluttered, accessible UI for both operators and end-users. | Mobile-first vanilla CSS, zero bloated frontend dependencies, high-contrast crisp readability. |

### 2.5 Brand Personality
- **Crisp & Authoritative:** Speaks with expertise in the SMM industry (orders, refills, services, drops, APIs).
- **Proactive & Dependable:** Always available, 99.9% uptime, vigilant in alerting owners of critical issues.
- **Approachable & Modern:** Clean typography, friendly bot demeanor, clear conversational flow.
- **Honest & Direct:** Never hallucinates order statuses. When data is unavailable, it communicates clearly.

---

## 3. Brand Architecture & Nomenclature

### 3.1 Official Naming Conventions

| Usage Context | Permitted Form | Forbidden Forms (DO NOT USE) |
| :--- | :--- | :--- |
| **Primary Brand Name** | `YourSMMagent` | `yoursmmagent`, `Your SMM Agent`, `YourSMMAgent`, `YOURSMMAGENT` |
| **Visual Stylized Mark** | `Your`<span style="color: #4f46e5;">`SMM`</span>`agent` | Any variant with lower-case "smm" or hyphenation |
| **Legacy Working Titles** | *(Deprecated)* | `SupportBot`, `SupportBot Labs`, `Cloud-SaaS` |
| **Domain & URLs** | `https://yoursmmagent.com` | `supportbot.com`, `cloud-saas.com` |
| **Twitter / Socials** | `@YourSMMagent` | `@SupportBot`, `@CloudSaaS` |

### 3.2 Product Suite Nomenclature
- **YourSMMagent Dashboard:** The admin console for SMM panel owners to configure keys, APIs, and models.
- **YourSMMagent Web Widget:** The embeddable floating chat widget placed directly on panel storefronts.
- **YourSMMagent Telegram Bot:** The dedicated Telegram bot linked to the tenant's panel.
- **YourSMMagent WhatsApp Engine:** The WhatsApp Cloud/Baileys messaging connection.
- **YourSMMagent AI Engine:** The multi-model hybrid inference layer (Gemini, Claude, GPT).

---

## 4. Visual Identity System & Design Tokens

### 4.1 Primary Brand Palette

```css
:root {
  /* Primary Accent & Gradients */
  --brand-accent:            #4f46e5; /* Primary Indigo */
  --brand-accent-hover:      #4338ca; /* Darker Indigo Hover */
  --brand-accent-light:      #6366f1; /* Bright Indigo Highlight */
  --brand-accent-muted:      #eef2ff; /* Soft Violet Accent Tint */
  --brand-accent-glow:       rgba(79, 70, 229, 0.22);
  --brand-accent-gradient:   linear-gradient(135deg, #4f46e5 0%, #2563eb 100%);
  
  /* Brand Neutrals (Crisp Light Theme) */
  --brand-bg:                #f8fafc;
  --brand-surface:           #ffffff;
  --brand-surface-elevated:  #f8fafc;
  --brand-border:            #e2e8f0;
  --brand-border-glow:       rgba(79, 70, 229, 0.30);
  
  /* Typography Colors */
  --brand-text-main:         #0f172a; /* Slate 900 */
  --brand-text-muted:        #475569; /* Slate 600 */
  --brand-text-subtle:       #64748b; /* Slate 500 */
  --brand-text-inverse:      #ffffff;
  
  /* Semantic Status Indicators */
  --brand-success:           #15803d; /* Emerald 700 */
  --brand-success-bg:        #f0fdf4; /* Emerald 50 */
  --brand-warning:           #b45309; /* Amber 700 */
  --brand-warning-bg:        #fffbeb; /* Amber 50 */
  --brand-danger:            #b91c1c; /* Rose 700 */
  --brand-danger-bg:         #fef2f2; /* Rose 50 */
  --brand-info:              #0284c7; /* Cyan 700 */
  --brand-info-bg:           #f0f9ff; /* Cyan 50 */
}
```

### 4.2 Dark Mode System (`[data-theme="dark"]`)

```css
[data-theme="dark"] {
  --brand-bg:                #090d16;
  --brand-surface:           #131b2e;
  --brand-surface-elevated:  #18223a;
  --brand-border:            #1e293b;
  --brand-text-main:         #f1f5f9;
  --brand-text-muted:        #94a3b8;
  --brand-text-subtle:       #64748b;
  --brand-accent-glow:       rgba(99, 102, 241, 0.28);
}
```

### 4.3 Typography Scale & Stacks

- **Primary Body Font:** `Inter`, `-apple-system`, `BlinkMacSystemFont`, `'Segoe UI'`, `Roboto`, sans-serif.
- **Monospace Code/ID Font:** `JetBrains Mono`, `'Fira Code'`, `Menlo`, monospace.

| Element | Size | Weight | Line Height | Tracking |
| :--- | :--- | :--- | :--- | :--- |
| **Display / Hero H1** | `2.5rem` (40px) | 800 (ExtraBold) | 1.15 | `-0.03em` |
| **Section H2** | `1.875rem` (30px) | 700 (Bold) | 1.25 | `-0.02em` |
| **Card Header H3** | `1.25rem` (20px) | 600 (SemiBold) | 1.35 | `-0.01em` |
| **Body Regular** | `0.9375rem` (15px) | 400 (Regular) | 1.50 | `normal` |
| **Small / Meta / Badges**| `0.8125rem` (13px) | 500 (Medium) | 1.40 | `+0.01em` |

### 4.4 Logo Geometry & Iconography

The official brand icon consists of the streamlined Robot Agent glyph encased in a high-contrast gradient squircle (`#4F46E5` to `#2563EB`).

```svg
<svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true" style="border-radius: 8px;">
  <defs>
    <linearGradient id="ysmm-logo-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#4F46E5" />
      <stop offset="100%" stop-color="#2563EB" />
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#ysmm-logo-g)" />
  <circle cx="24" cy="28" r="4" fill="#FFFFFF" />
  <circle cx="40" cy="28" r="4" fill="#FFFFFF" />
  <path d="M22 40 C 26 44, 38 44, 42 40" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" fill="none" />
  <rect x="29" y="12" width="6" height="8" rx="3" fill="#A5B4FC" />
  <circle cx="32" cy="10" r="3" fill="#A5B4FC" />
</svg>
```

- **Clear Space:** Minimum clear space around the logo mark is equal to half the height of the mark ($0.5 \times H$).
- **Minimum Digital Size:** 24px height on screen; 16px as favicon.

---

## 5. Voice, Tone & Messaging Architecture

### 5.1 Voice Pillars

1. **Empowering & Efficient:** We respect the operator's time. We write in short, energetic, actionable sentences.
2. **Technically Rigorous:** We use correct terminology (`order_id`, `refill`, `service catalog`, `webhook`, `rate limit`).
3. **Reassuringly Secure:** We reinforce data isolation and encryption without sounding alarmist.

### 5.2 Tone Adaptation by Touchpoint

| Touchpoint | Tone | Example |
| :--- | :--- | :--- |
| **Landing Page** | High-energy, ROI-focused, confident. | *"Automate repetitive customer queries, speed up response times, and reduce ticket overhead."* |
| **Tenant Dashboard** | Calm, productive, clear, low distraction. | *"Telegram bot verified. SMM panel sync operational (124 services cached)."* |
| **Chat Widget (User)** | Polite, prompt, helpful, transparent. | *"Checking your order #98214 on the panel right now... It is currently In Progress (85% delivered)."* |
| **Error / Edge Cases** | Constructive, specific, actionable. | *"Unable to reach your panel API. Please check your Panel URL and API key in Settings."* |

### 5.3 Word Choice & Terminology Guide

| Recommended Term | Discouraged Term | Why |
| :--- | :--- | :--- |
| **YourSMMagent** | SupportBot, Cloud-SaaS | Brand integrity and trademark differentiation. |
| **AI Support Agent** | Bot, Chatbot, Script | Communicates intelligence, adaptability, and contextual understanding. |
| **Tenant** | Client, User, Account | Reflects accurate multi-tenant SaaS architecture. |
| **Panel API Connection** | Scraper, Sync Link | Conveys secure, sanctioned API communication. |
| **Composite Session Isolation** | Multi-login | Highlights security and tenant boundary enforcement. |

---

## 6. Brand Governance & Protection Rules

### 6.1 The "Never" List (Strict Prohibitions)
- ❌ **Never** use "SupportBot" or "SupportBot Labs" anywhere in public documentation, marketing, UI, alt tags, or metadata.
- ❌ **Never** alter the letter capitalization of `YourSMMagent` (do not write `yoursmmagent` in prose).
- ❌ **Never** skew, rotate, or stretch the Robot mascot or logo mark.
- ❌ **Never** change the brand accent color from `#4f46e5` to random blues, purples, or greens.
- ❌ **Never** commit sensitive credentials, keys, or real tenant customer data into sample brand artifacts.

### 6.2 Pre-Release Brand Audit Checklist

Before merging new features or releasing code to production, verify:
- [ ] Page `<title>` follows the pattern: `[Page Name] | YourSMMagent` or `YourSMMagent — [Tagline]`.
- [ ] OpenGraph and Twitter cards reference `https://yoursmmagent.com` and brand assets.
- [ ] All footer copyrights display: `© YourSMMagent · Multi-tenant AI Customer Support Platform`.
- [ ] Button labels and calls-to-action use approved terminology (`Get YourSMMagent`, `Request Setup`).
- [ ] CSS token references use standard `--color-accent` (`#4f46e5`) and compliant semantic tokens.

