# Landing Page Deployment Guide: `yoursmmagent.com`

This guide explains how to build, run, and host the **Your SMM Agent** landing page for `yoursmmagent.com` and `www.yoursmmagent.com`.

---

## Architecture Summary

```
                       [ Incoming Web Traffic ]
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
yoursmmagent.com / www.yoursmmagent.com             app.yoursmmagent.com / api...
         │                                                   │
         ▼                                                   ▼
[ landing/dist Static Files ]                       [ Express App (Port 3000) ]
(Vite + React 18 + Tailwind)                        (API, Dashboard, Bots, Widget)
```

---

## Local Development & Build Commands

All commands can be executed either directly from the root repository or inside `landing/`:

### From Root Repository:
- **Run dev server:**
  ```bash
  npm run landing:dev
  ```
  Runs Vite dev server at `http://localhost:5173`.

- **Build production assets:**
  ```bash
  npm run landing:build
  ```
  Compiles optimized production static files into `landing/dist/`.

- **Preview production build:**
  ```bash
  npm run landing:preview
  ```

### Inside `landing/` directory:
- **Run dev server:** `npm run dev`
- **Build assets:** `npm run build`
- **Preview build:** `npm run preview`

---

## Hosting Options for `yoursmmagent.com`

### Option 1: VPS with Nginx (Recommended for Single Server)

If you are hosting both the backend and landing page on a single VPS (Ubuntu / Debian):

1. **Build the landing page:**
   ```bash
   npm run landing:build
   ```

2. **Nginx Server Block Configuration (`/etc/nginx/sites-available/yoursmmagent`):**

```nginx
# 1. Landing Page (Root & WWW) -> Static landing/dist
server {
    listen 80;
    server_name yoursmmagent.com www.yoursmmagent.com;

    root /home/ubuntu/Cloud-SaaS/landing/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# 2. SaaS Application & Dashboard -> Node.js Backend (Port 3000)
server {
    listen 80;
    server_name app.yoursmmagent.com api.yoursmmagent.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. **Install SSL with Certbot (Free HTTPS):**
   ```bash
   sudo certbot --nginx -d yoursmmagent.com -d www.yoursmmagent.com -d app.yoursmmagent.com -d api.yoursmmagent.com
   ```

---

### Option 2: Cloudflare Pages / Vercel (Ultra-Fast Global Edge)

You can also host the landing page on free global edge CDNs while keeping your backend on your VPS:

1. Connect `landing-yoursmmagent` GitHub repository to **Cloudflare Pages** or **Vercel**.
2. **Build Settings:**
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. In Custom Domains, attach `yoursmmagent.com` and `www.yoursmmagent.com`.
4. Point DNS for `app.yoursmmagent.com` and `api.yoursmmagent.com` to your VPS IP address.
