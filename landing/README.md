# YourSMMagent - Landing Page Clone

High-performance, 1:1 pixel-perfect recreation of the [YourSMMagent](https://smm-panel-chat--3uch2ct4.preview.emergentagent.com/) landing page.

Built with **React**, **Vite**, **Tailwind CSS**, **Framer Motion**, **Lenis Smooth Scroll**, and **Lucide React**.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Start the local development server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Build for production
```bash
npm run build
```

### 4. Preview production build locally
```bash
npm run preview
```

---

## 📁 Project Structure

```
Clone-UI/
├── audit-screenshots/       # Visual comparison screenshots (Desktop & Mobile)
├── public/
│   └── favicon.svg          # Original vector logo favicon
├── src/
│   ├── components/
│   │   └── landing/         # All landing page sections & interactive components
│   │       ├── Benefits.jsx
│   │       ├── Buttons.jsx
│   │       ├── Capabilities.jsx
│   │       ├── ChannelPreviews.jsx
│   │       ├── Channels.jsx
│   │       ├── ConversationsDemo.jsx
│   │       ├── FAQ.jsx
│   │       ├── FinalCTA.jsx
│   │       ├── Footer.jsx
│   │       ├── Header.jsx
│   │       ├── Hero.jsx
│   │       ├── HeroConsole.jsx
│   │       ├── HowItWorks.jsx
│   │       ├── Integration.jsx
│   │       ├── Introducing.jsx
│   │       ├── Logo.jsx
│   │       ├── Marquee.jsx
│   │       ├── PainPoints.jsx
│   │       ├── Reveal.jsx
│   │       ├── TrustSecurity.jsx
│   │       ├── WhoItsFor.jsx
│   │       └── WorkflowJourney.jsx
│   ├── lib/
│   │   └── site.js          # Navigation links and site constants
│   ├── App.jsx              # Main app entry & Lenis scroll provider
│   ├── index.css            # Tailwind directives & custom keyframe animations
│   └── index.jsx            # React root mount & QueryClientProvider
├── index.html               # Clean HTML5 document with OpenGraph & Schema.org JSON-LD
├── tailwind.config.js       # Tailwind configuration with Inter font & color tokens
├── vite.config.js           # Vite config with '@/' path alias resolution
└── package.json
```

---

## ✨ Features & Recreated Details

- **Animations & Interactivity**:
  - Smooth inertia scrolling powered by **Lenis**.
  - Scroll-triggered reveals and viewport animations via **Framer Motion**.
  - Interactive **Hero Console** with dynamic 3D cursor tilt and live typing effect.
  - Interactive **Live Conversations Demo** with tab switching (Website, Telegram, WhatsApp).
  - Infinite auto-scrolling **Ticker / Marquee** with pause-on-hover.
  - Interactive **Workflow Journey** data-flow node visualization with animated traveling dots.
  - Collapsible **FAQ Accordion** with animated height transitions.
- **Visuals & Assets**:
  - Exact SVG icons, logos, and custom gradients.
  - Custom grid background (`.bg-grid`) and authentic WhatsApp wallpaper texture.
- **Mobile Responsive**:
  - Fully responsive from mobile screens (390px) up to ultra-wide displays (1440px+).

