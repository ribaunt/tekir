# Self-hosting Tekir

> Hosted Tekir at `tekir.co` is being sunset on **October 1, 2026**.
> This guide shows you how to run your own private copy of Tekir.
> No data migration from `tekir.co` is provided — your self-hosted instance starts fresh.

Tekir is a privacy-first metasearch + AI assistant ("Karakulak") built with:

- **Frontend:** Next.js 16 App Router + React 18 (`app/`, `components/`, Tailwind + Radix)
- **Backend:** Convex real-time database (`convex/` — users, sessions, chats, settings, usage, feedback)
- **Search providers:** Brave (primary), Google Programmable Search, You.com
- **AI:** OpenRouter (Karakulak chat, Dive answers, `/api/recommend`, Wikipedia suggestions)
- **Anti-abuse:** Ribaunt CAPTCHA + Redis replay store, optional Prelude email verification
- **Optional:** PostHog analytics, Polar / Cheyn payments for "Plus"

You can run a minimal personal instance with **1 search provider + Convex + 2 secrets**,
or a full-parity instance with every integration below.

---

## Table of contents

1. [Architecture](#1-architecture)
2. [Prerequisites](#2-prerequisites)
3. [Get API keys](#3-get-api-keys)
4. [Path A: Convex Cloud (recommended)](#4-path-a-convex-cloud-recommended)
5. [Path B: Fully self-hosted Convex](#5-path-b-fully-self-hosted-convex-advanced)
6. [Environment variable reference](#6-environment-variable-reference)
7. [Run locally with npm](#7-run-locally-with-npm)
8. [Run with Docker](#8-run-with-docker)
9. [Deploy to Vercel](#9-deploy-to-vercel)
10. [Deploy to a VPS with TLS](#10-deploy-to-a-vps-with-tls)
11. [Post-deploy checklist](#11-post-deploy-checklist)
12. [Cron jobs](#12-cron-jobs)
13. [Operations: update, backup, logs](#13-operations-update-backup-logs)
14. [Disabling features you don't need](#14-disabling-features-you-dont-need)
15. [Troubleshooting](#15-troubleshooting)
16. [Security hardening](#16-security-hardening)
17. [FAQ](#17-faq)

---

## 1. Architecture

```text
Browser
  │
  ▼
Next.js (port 3000, `npm start` / Docker)
  ├── /api/search, /api/images, /api/news, /api/videos, /api/autocomplete
  │     ├── Brave API ──► primary, needs BRAVE_SEARCH_KEY
  │     ├── Google PSE ─► fallback, needs GOOGLE_API_KEY + GOOGLE_CX
  │     └── You.com ────► fallback, needs YOU_SEARCH_KEY
  ├── /api/karakulak, /api/dive, /api/recommend ──► OpenRouter (OPENROUTER_API_KEY)
  ├── /api/auth/* ──► Convex + JWT (JWT_SECRET) + optional Prelude (PRELUDE_API_KEY)
  ├── CAPTCHA middleware (`proxy.ts`) ──► Ribaunt (RIBAUNT_SECRET + RIBAUNT_REDIS_URL)
  └── Convex client ──► Convex Cloud URL or self-hosted backend
                              (NEXT_PUBLIC_CONVEX_URL / NEXT_PUBLIC_CONVEX_SITE_URL)
```

Key facts:

- Every provider route **degrades gracefully**: if e.g. `GOOGLE_API_KEY` / `GOOGLE_CX` are unset, that provider returns empty results instead of crashing (see `app/api/pars/[provider]/route.ts`, `app/api/images/[provider]/route.ts`). You need **at least one** search key for search to be useful. Brave is the primary — start there.
- AI routes require `OPENROUTER_API_KEY`. Without it, Karakulak / Dive / recommendations return errors. Search still works.
- Payments (Polar, Cheyn) and analytics (PostHog) are fully optional — empty keys disable them silently.
- The repo ships a production `Dockerfile` (Node 20-slim, multi-stage, non-root `tekir` user, `EXPOSE 3000`).
- `vercel.json` defines one cron: `GET /api/recommend` daily at midnight. On non-Vercel hosts you must replicate it (see [Cron jobs](#12-cron-jobs)).

---

## 2. Prerequisites

| Requirement | Version / notes |
|---|---|
| Git | any recent |
| Node.js | **20.x** (matches `Dockerfile` `FROM node:20-slim`). Node 22/24 may work for dev but Docker builds pin 20. |
| npm | ships with Node 20 (lockfile: `package-lock.json`, install with `npm ci`) |
| Docker | 24+ if using container path |
| Convex account | free tier is enough for personal use (Path A). Or Docker for Path B. |
| Redis | only required if `ENABLE_CAPTCHA=true` or `ENABLE_ANTI_ABUSE_CAPTCHA=true` — any Redis 7+ or Upstash Redis URL works as `RIBAUNT_REDIS_URL` |
| Domain (optional) | needed for public VPS/Vercel deployments so `NEXT_PUBLIC_APP_URL` is `https://…` |

Check your toolchain:

```bash
git --version
node --version   # want v20.x
npm --version
docker --version
npx convex --version
```

Clone:

```bash
git clone https://github.com/computebaker/tekir.git
cd tekir
```

> Do **not** copy `.env.local` from anywhere. `.env*` files are gitignored
> (see `.gitignore`). Create your own from the template in
> [section 6](#6-environment-variable-reference). Never commit secrets.

---

## 3. Get API keys

Create accounts and collect keys **before** configuring. You can start with just Brave + Convex + generated secrets and add the rest later.

### 3.1 Required for anything useful

1. **Convex** — https://dashboard.convex.dev → create project → copy deployment URL.
   Path A (recommended): hosted Convex Cloud. Path B: see [section 5](#5-path-b-fully-self-hosted-convex-advanced).
2. **Brave Search API** — https://brave.com/search/api/ → `BRAVE_SEARCH_KEY` (web/images/news/videos) and optionally `BRAVE_AUTOCOMPLETE_KEY`.

### 3.2 Search fallbacks (recommended, at least one)

- **Google Programmable Search** — https://programmablesearchengine.com/ → create engine → `GOOGLE_API_KEY` (Cloud Console, Custom Search API enabled) + `GOOGLE_CX` (engine ID).
- **You.com Search** — https://api.you.com/ → `YOU_SEARCH_KEY`.

### 3.3 AI (required for Karakulak / Dive / recommendations)

- **OpenRouter** — https://openrouter.ai/ → `OPENROUTER_API_KEY`. Any credit balance works; default models use small `max_tokens` (see `app/api/karakulak/[model]/route.ts`).

### 3.4 Anti-abuse / CAPTCHA (recommended for public instances, optional for localhost)

- **Ribaunt** — deploy the Ribaunt challenge service or use a hosted instance → `RIBAUNT_SECRET`.
- **Redis for Ribaunt replay protection** — Upstash (https://upstash.com/) or self-hosted Redis → `RIBAUNT_REDIS_URL` (e.g. `redis://default:XXXX@host:6379`). Code reads exactly this var (`lib/ribaunt-replay-store.ts`) — `REDIS_HOST/PORT/PASSWORD` legacy vars alone are **not** enough.
- **Prelude (email verification)** — https://prelude.so/ → `PRELUDE_API_KEY`. Without it, email verification routes fail; local password/session auth still works.
- Thresholds: `CAPTCHA_HARD_THRESHOLD` (default `55`), `CAPTCHA_SOFT_THRESHOLD` (default `40`). Flags: `ENABLE_CAPTCHA`, `ENABLE_ANTI_ABUSE_CAPTCHA` (`true`/`false`).

### 3.5 Optional: analytics

- **PostHog** — https://posthog.com/ → `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` (e.g. `https://eu.i.posthog.com`). If unset, client + server analytics no-op (see `instrumentation-client.ts`, `lib/analytics-server.ts`). No other config needed; the app proxies PostHog through `/metadata/*` and `/ph/*` rewrites (see `next.config.js`).

### 3.6 Optional: payments ("Plus")

Pick none, one, or both. If keys are empty, Plus checkout buttons error cleanly and the rest of the app is unaffected.

- **Polar** — https://polar.sh/ → `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `NEXT_PUBLIC_POLAR_ORGANIZATION`, plus a product ID (`NEXT_PUBLIC_POLAR_PRODUCT_ID`).
- **Cheyn (XMR)** — self-hosted or hosted Cheyn instance → `CHEYN_API_KEY`, `CHEYN_STORE_ID`, `CHEYN_WEBHOOK_SECRET`, `CHEYN_CALLBACK_BASE_URL` (defaults to `NEXT_PUBLIC_APP_URL`), optionally `CHEYN_API_BASE_URL`, `CHEYN_CHECKOUT_PATH`, `CHEYN_PLUS_DISPLAY_AMOUNT`, `CHEYN_PLUS_DISPLAY_CURRENCY`.

---

## 4. Path A: Convex Cloud (recommended)

This is the fastest path and what `tekir.co` itself used.

### 4.1 Install and log in

```bash
npm ci
npm install -g convex   # or use npx convex
npx convex dev --once   # logs you in, creates dev deployment, generates convex/_generated/
```

Accept the prompts to create/select a project. Note the URLs it prints:

```text
CONVEX_DEPLOYMENT=dev:adjective-animal-123
NEXT_PUBLIC_CONVEX_URL=https://adjective-animal-123.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://adjective-animal-123.convex.site
```

### 4.2 Generate secrets

```bash
openssl rand -hex 32   # → JWT_SECRET (min 32 chars, enforced by lib/env.ts + lib/jwt-auth.ts)
openssl rand -hex 16   # → CONVEX_CRON_SECRET (min 16 chars)
```

### 4.3 Create your env file

Create `.env.local` for development (or `.env.production` for servers — same keys):

```bash
cp /dev/null .env.local
```

Fill it using the template in [section 6](#6-environment-variable-reference). Minimal working set for local use:

```env
# --- core ---
JWT_SECRET=<output of openssl rand -hex 32>
CONVEX_CRON_SECRET=<output of openssl rand -hex 16>
CONVEX_DEPLOYMENT=dev:adjective-animal-123
NEXT_PUBLIC_CONVEX_URL=https://adjective-animal-123.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://adjective-animal-123.convex.site
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000

# --- search (at least one) ---
BRAVE_SEARCH_KEY=BSAXXXXXXXXX
BRAVE_AUTOCOMPLETE_KEY=BSAXXXXXXXXX

# --- ai ---
OPENROUTER_API_KEY=sk-or-v1-XXXXXXXX

# --- captcha (off for localhost) ---
ENABLE_CAPTCHA=false
ENABLE_ANTI_ABUSE_CAPTCHA=false
```

> `lib/env.ts` also lists `NEXT_PUBLIC_CONVEX_DEPLOYMENT` as required, but current code
> actually reads `NEXT_PUBLIC_CONVEX_URL`. Set **both** to be safe:
> `NEXT_PUBLIC_CONVEX_DEPLOYMENT` = same value as `NEXT_PUBLIC_CONVEX_URL`.

### 4.4 Push Convex schema and run

```bash
npx convex deploy --dry-run   # optional sanity check
npx convex deploy             # pushes convex/schema.ts + functions (dev deployment)
npm run dev                   # Next.js on http://localhost:3000
```

Open http://localhost:3000/search?q=tekir — you should see Brave results.
Then continue to [Post-deploy checklist](#11-post-deploy-checklist).

For production Convex, run once:

```bash
npx convex deploy --prod
```

and replace the three Convex URLs/secrets with the **prod** values in your server env.

---

## 5. Path B: Fully self-hosted Convex (advanced)

Use this only if you refuse any third-party backend. You run the open-source Convex backend yourself and point Tekir at it.

1. Start a self-hosted Convex backend (example with Docker — check upstream docs for the current image/tag, as self-hosted Convex evolves fast):

   ```bash
   docker run -d --name convex-backend \
     -p 3210:3210 -p 3211:3211 \
     -v convex-data:/data \
     ghcr.io/get-convex/convex-backend:latest
   ```

2. In a second terminal, point the Tekir Convex CLI at it (exact flags depend on your backend version — see its README):

   ```bash
   export CONVEX_SELF_HOSTED_URL=http://localhost:3210
   npx convex dev --once
   npx convex deploy
   ```

3. Set in Tekir env:

   ```env
   CONVEX_DEPLOYMENT=self-hosted
   NEXT_PUBLIC_CONVEX_URL=http://localhost:3210
   NEXT_PUBLIC_CONVEX_SITE_URL=http://localhost:3211
   NEXT_PUBLIC_CONVEX_DEPLOYMENT=http://localhost:3210
   ```

4. Continue with [section 7](#7-run-locally-with-npm) or [section 8](#8-run-with-docker). The Next.js container must reach the Convex URL — use `http://host.docker.internal:3210` from inside Docker on Mac/Windows, or a shared Docker network hostname on Linux.

Tradeoffs: you own backups, upgrades, and WebSocket stability. Unless you have a reason, **Path A is strongly recommended**. The rest of this guide is identical for both paths.

---

## 6. Environment variable reference

Copy this skeleton into `.env.local` (dev) or `.env.production` (servers). Replace every `…` / `CHANGE_ME`.

```env
# ================= CORE (required) =================
JWT_SECRET=CHANGE_ME_64_HEX_CHARS_MIN_32
CONVEX_CRON_SECRET=CHANGE_ME_32_HEX_CHARS_MIN_16
CONVEX_DEPLOYMENT=dev:adjective-animal-123
NEXT_PUBLIC_CONVEX_URL=https://adjective-animal-123.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://adjective-animal-123.convex.site
# Kept for lib/env.ts compat; set equal to NEXT_PUBLIC_CONVEX_URL:
NEXT_PUBLIC_CONVEX_DEPLOYMENT=https://adjective-animal-123.convex.cloud
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
# Optional Convex proxy (defaults to /api/convex direct):
# NEXT_PUBLIC_USE_CONVEX_PROXY=true
# NEXT_PUBLIC_CONVEX_PROXY_URL=/api/convex

# ================= SEARCH =================
BRAVE_SEARCH_KEY=BSAXXXXXXXXX
BRAVE_AUTOCOMPLETE_KEY=BSAXXXXXXXXX
GOOGLE_API_KEY=AIZAXXXXXXXXX
GOOGLE_CX=XXXXXXXXXXXX
YOU_SEARCH_KEY=ydc-sk-XXXXXXXX

# ================= AI =================
OPENROUTER_API_KEY=sk-or-v1-XXXXXXXX
# Optional Wikipedia-suggest model override:
# WIKIPEDIA_SUGGEST_MODEL=openai/gpt-4o-mini

# ================= CAPTCHA / ANTI-ABUSE =================
ENABLE_CAPTCHA=false
ENABLE_ANTI_ABUSE_CAPTCHA=false
RIBAUNT_SECRET=CHANGE_ME_LONG_RANDOM
RIBAUNT_REDIS_URL=redis://default:XXXX@host:6379
CAPTCHA_HARD_THRESHOLD=60
CAPTCHA_SOFT_THRESHOLD=40
PRELUDE_API_KEY=sk_XXXXXXXX
# Optional admin/debug:
# CAPTCHA_ADMIN_TOKEN=CHANGE_ME
# CAPTCHA_DEBUG_FLAG=false

# ================= ANALYTICS (optional) =================
NEXT_PUBLIC_POSTHOG_KEY=phc_XXXXXXXX
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com

# ================= PAYMENTS (optional) =================
# Polar:
POLAR_ACCESS_TOKEN=polar_oat_XXXXXXXX
POLAR_WEBHOOK_SECRET=polar_whs_XXXXXXXX
NEXT_PUBLIC_POLAR_ORGANIZATION=your-org
NEXT_PUBLIC_POLAR_PRODUCT_ID=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
# Cheyn (XMR):
CHEYN_API_KEY=xmr_live_XXXXXXXX
CHEYN_STORE_ID=XXXXXXXX
CHEYN_WEBHOOK_SECRET=whsec_XXXXXXXX
CHEYN_CALLBACK_BASE_URL=https://search.example.com
# CHEYN_API_BASE_URL=https://cheyn.ribaunt.com
# CHEYN_CHECKOUT_PATH=/api/v1/checkouts
# CHEYN_PLUS_DISPLAY_AMOUNT=5.00
# CHEYN_PLUS_DISPLAY_CURRENCY=USD

# ================= MISC =================
# Extra <img> hosts allowed by next.config.js (comma-separated):
# NEXT_PUBLIC_IMAGE_HOSTS=cdn.example.com,img.example.com
PORT=3000
```

Field notes:

| Var | Required? | What breaks if missing |
|---|---|---|
| `JWT_SECRET` | yes (≥32 chars) | auth throws `FATAL: JWT_SECRET … not configured` (`lib/jwt-auth.ts`, `convex/auth.ts`) |
| `CONVEX_CRON_SECRET` | yes for crons | `/api/recommend` and Convex cron auth fail |
| `CONVEX_DEPLOYMENT` | yes | `convex deploy` / codegen fail |
| `NEXT_PUBLIC_CONVEX_URL` (+ `…_SITE_URL`) | yes | app throws `NEXT_PUBLIC_CONVEX_URL … is not set` (`lib/convex-client.ts`) |
| `NEXT_PUBLIC_APP_URL` / `NEXTAUTH_URL` | required in prod | cookies, OAuth callbacks, Cheyn callbacks use wrong host |
| `BRAVE_*` / `GOOGLE_*` / `YOU_*` | at least one set | that provider returns `[]`; all empty = empty search |
| `OPENROUTER_API_KEY` | for AI | Karakulak/Dive/recommend 500 |
| `RIBAUNT_SECRET` + `RIBAUNT_REDIS_URL` | if captcha enabled | middleware throws `RIBAUNT_SECRET_missing` / `Missing … RIBAUNT_REDIS_URL` |
| `PRELUDE_API_KEY` | for email verification | `/api/auth/send-verification` fails; other auth unaffected |
| PostHog / Polar / Cheyn | no | features silently disabled or checkout-only errors |

---

## 7. Run locally with npm

```bash
npm ci
npx convex codegen        # regenerates convex/_generated/ (also runs on postinstall)
npx convex dev --once     # ensure backend is up to date
npm run dev               # http://localhost:3000 (turbopack, NODE_OPTIONS max header set in package.json)
```

Production-mode local test:

```bash
npm run build
npm start -- --hostname 0.0.0.0 --port 3000
```

Lint/typecheck (optional but recommended before deploying):

```bash
npm run lint
npx tsc --noEmit
```

---

## 8. Run with Docker

The `Dockerfile` is production-ready (multi-stage, `npm ci` → `next build` → pruned `runner`, non-root user).

```bash
# Build
docker build -t tekir:latest .

# Run (env file holds section-6 vars)
docker run --rm -p 3000:3000 --env-file .env.production --name tekir tekir:latest

# Or explicit env:
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  -e NEXT_PUBLIC_CONVEX_URL=https://adjective-animal-123.convex.cloud \
  tekir:latest
```

Verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s "http://localhost:3000/api/autocomplete/brave?q=tek" | head -c 300; echo
```

> If Next.js is behind a reverse proxy, keep `PORT` consistent between the
> container (`-e PORT=…`) and the `CMD` (`npm run start -- --hostname 0.0.0.0 --port ${PORT:-3000}`).

`docker-compose.yml` sketch (create this file yourself if you want Compose):

```yaml
services:
  tekir:
    build: .
    ports: ["3000:3000"]
    env_file: .env.production
    restart: unless-stopped
  redis:
    image: redis:7-alpine
    volumes: ["tekir-redis:/data"]
    restart: unless-stopped
volumes:
  tekir-redis:
```

Then set `RIBAUNT_REDIS_URL=redis://redis:6379` (service name as host).

---

## 9. Deploy to Vercel

Vercel is the closest to the original `tekir.co` setup.

```bash
npm i -g vercel
vercel                # link project, preview deploy
npx convex deploy --prod
vercel --prod         # production deploy
```

Then in **Vercel Dashboard → Project → Settings → Environment Variables**, add **all** of [section 6](#6-environment-variable-reference) with **Production** values:

- `NEXT_PUBLIC_APP_URL=https://search.example.com`
- `NEXTAUTH_URL=https://search.example.com`
- Prod Convex URLs from `convex deploy --prod`
- Fresh `JWT_SECRET` / `CONVEX_CRON_SECRET` (do not reuse dev secrets publicly)

Redeploy after saving env vars. The `vercel.json` cron (`/api/recommend` daily) activates automatically on paid plans; on Hobby, trigger it externally (see [section 12](#12-cron-jobs)).

Repo scripts reference both flows:

```bash
npm run deploy:convex   # convex deploy --prod
npm run deploy:vercel   # vercel --prod
npm run deploy          # both
```

---

## 10. Deploy to a VPS with TLS

Any 1 vCPU / 2 GB RAM VPS works for personal use (plus headroom for Chromium-less Next.js + Redis if local).

1. Point DNS `search.example.com → <server IP>`.
2. Install Docker, clone, create `.env.production` (section 6 with `NEXT_PUBLIC_APP_URL=https://search.example.com`).
3. Run the container (see [section 8](#8-run-with-docker)), listening on `127.0.0.1:3000`:

   ```bash
   docker run -d --restart unless-stopped --name tekir \
     -p 127.0.0.1:3000:3000 --env-file .env.production tekir:latest
   ```

4. Reverse-proxy with Caddy (automatic HTTPS):

   ```caddy
   search.example.com {
     reverse_proxy 127.0.0.1:3000
   }
   ```

   Or Nginx + certbot:

   ```nginx
   server {
     listen 443 ssl;
     server_name search.example.com;
     # ssl_certificate /etc/letsencrypt/live/search.example.com/fullchain.pem;
     # ssl_certificate_key /etc/letsencrypt/live/search.example.com/privkey.pem;
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```

5. Security headers (CSP, HSTS, etc.) are already set in `next.config.js` `headers()`. If you serve images from custom hosts, add them via `NEXT_PUBLIC_IMAGE_HOSTS` and redeploy — otherwise `next/image` 400s.

6. Set up the daily cron (section 12) and log rotation.

---

## 11. Post-deploy checklist

- [ ] `GET /` returns 200, no `NEXT_PUBLIC_CONVEX_URL is not set` in logs.
- [ ] `GET /search?q=tekir` shows web results (Brave key works).
- [ ] Images / News / Videos tabs return results (or intentional empty if you only configured Brave web).
- [ ] Karakulak chat streams an answer (OpenRouter key + credits OK).
- [ ] Signup/login creates a Convex `users` row (check Convex dashboard → Data).
- [ ] Admin settings page loads; usage charts populate after searches.
- [ ] With captcha enabled: private window triggers challenge and passes with valid `RIBAUNT_SECRET` + Redis.
- [ ] `/api/recommend` with cron secret returns 200 (section 12).
- [ ] Plus page: with no payment keys, checkout shows a clear config error (expected); with keys, test checkout in sandbox first.

---

## 12. Cron jobs

Two schedulers exist — don't confuse them:

1. **Convex internal crons** (`convex/crons.ts`) — run inside Convex automatically after `convex deploy`:
   - `daily-reset-request-counts` (`5 0 * * *`)
   - `hourly-clean-expired-sessions`
   - No action needed beyond deploying Convex.

2. **Vercel cron** (`vercel.json` → `GET /api/recommend` `0 0 * * *`) — only runs on Vercel. **On Docker/VPS you must replicate it:**

   ```bash
   # /etc/cron.d/tekir — daily recommendations refresh
   CONVEX_CRON_SECRET=REPLACE_ME
   0 0 * * * root curl -fsS -H "Authorization: Bearer $CONVEX_CRON_SECRET" https://search.example.com/api/recommend >/dev/null 2>&1
   ```

   Or a systemd timer with the same `curl`. Check `app/api/recommend/route.ts` for the exact expected auth header/secret name in your revision — if the route returns 401, align the header with the code before opening an issue.

---

## 13. Operations: update, backup, logs

**Update:**

```bash
cd tekir
git pull
npm ci
npx convex deploy --prod   # if convex/ changed
docker build -t tekir:latest .
docker stop tekir && docker rm tekir
docker run -d --restart unless-stopped --name tekir -p 127.0.0.1:3000:3000 --env-file .env.production tekir:latest
```

On Vercel: `git push` (auto-deploy) + `npx convex deploy --prod` when `convex/` changed.

**Backup:**

- Convex Cloud: Dashboard → project → Backups / export collections (`users`, `sessions`, `chats`, `settings`, `feedbacks`, `searchUsageDaily`, … — see `convex/schema.ts` for full table list).
- Self-hosted Convex: snapshot the backend volume (`convex-data`) + store `.env.production` in a password manager (never in git).
- Tekir itself is stateless — no local disk state to back up besides env + (optional) local Redis RDB.

**Logs:**

```bash
docker logs -f tekir
# Convex function logs:
npx convex dashboard   # or tail in dashboard.convex.dev → Logs
```

---

## 14. Disabling features you don't need

| Want | Do |
|---|---|
| Personal instance, no captcha | `ENABLE_CAPTCHA=false`, `ENABLE_ANTI_ABUSE_CAPTCHA=false`; leave `RIBAUNT_*` empty, skip Redis |
| No email verification | leave `PRELUDE_API_KEY` empty |
| No analytics | leave `NEXT_PUBLIC_POSTHOG_*` empty |
| No payments | leave `POLAR_*` / `CHEYN_*` empty; Plus page will error only when used |
| Search with one provider | set only `BRAVE_SEARCH_KEY` (+ autocomplete); Google/You routes return `[]` cleanly |
| No AI | leave `OPENROUTER_API_KEY` empty; search still works, Karakulak/Dive show errors |

Minimal `.env` for a private localhost (search-only, no AI/captcha/payments/analytics):

```env
JWT_SECRET=<64 hex>
CONVEX_CRON_SECRET=<32 hex>
CONVEX_DEPLOYMENT=dev:XXXX
NEXT_PUBLIC_CONVEX_URL=https://XXXX.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://XXXX.convex.site
NEXT_PUBLIC_CONVEX_DEPLOYMENT=https://XXXX.convex.cloud
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
BRAVE_SEARCH_KEY=BSAXXXX
ENABLE_CAPTCHA=false
ENABLE_ANTI_ABUSE_CAPTCHA=false
```

---

## 15. Troubleshooting

| Symptom | Likely cause → fix |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL … is not set` on boot | client env missing → set it in `.env*` **and** rebuild (`NEXT_PUBLIC_*` are baked at build time; `docker build` after changing them) |
| `FATAL: JWT_SECRET … not configured` | `JWT_SECRET` empty/too short → `openssl rand -hex 32` |
| Search returns empty everywhere | no provider keys → set at least `BRAVE_SEARCH_KEY`; check server logs for `… credentials are missing` |
| Google provider empty, Brave fine | `GOOGLE_API_KEY`/`GOOGLE_CX` missing or PSE misconfigured → verify engine ID + API enabled |
| Karakulak/Dive 500 | `OPENROUTER_API_KEY` invalid/no credits/wrong model → test key with `curl https://openrouter.ai/api/v1/models` |
| `RIBAUNT_SECRET_missing` / `Missing … RIBAUNT_REDIS_URL` | captcha enabled without secrets → set both or `ENABLE_CAPTCHA=false` |
| Session cookie not persisting / callbacks loop | `NEXT_PUBLIC_APP_URL` / `NEXTAUTH_URL` still `localhost` in prod → set to `https://…`, redeploy |
| `next/image` 400 for custom thumbnails | host not allowlisted → `NEXT_PUBLIC_IMAGE_HOSTS=cdn.example.com` + rebuild (see `next.config.js`) |
| `/api/recommend` 401 from cron | wrong secret/header → compare cron header with `CONVEX_CRON_SECRET` handling in route |
| Convex WebSocket fails behind proxy | proxy strips Upgrade headers → enable WS passthrough; prefer Convex Cloud if stuck |
| Build OOM on tiny VPS | build locally / in CI and `docker push` image, or add swap; runtime needs far less than build |

Still stuck? Open an issue at https://github.com/computebaker/tekir/issues/new with: deployment method (npm/Docker/Vercel/VPS), redacted env key **names** (never values), and relevant server logs.

---

## 16. Security hardening

- Generate fresh secrets per environment (`openssl rand -hex 32`). **Never reuse the values that were once in `.env.local`** — treat any previously committed secret as burned.
- Never commit `.env*`. They are gitignored — keep it that way. Store prod env in Vercel env vars / VPS password manager / SOPS.
- Serve only over HTTPS in production (`Strict-Transport-Security` is already sent; cookies are `secure` when `NODE_ENV=production`).
- Keep `Dockerfile`'s non-root `tekir` user; don't run as root.
- Rotate `JWT_SECRET` carefully: rotation logs out all sessions (expected).
- Restrict `CAPTCHA_ADMIN_TOKEN` and Convex deploy keys to operators.
- Review `SECURITY.md` for vulnerability disclosure before exposing an instance publicly.

---

## 17. FAQ

**How much does it cost?**
Personal use fits in free tiers: Convex free, Brave free tier, OpenRouter pay-per-use (cents per hundred chats), Upstash Redis free, Vercel Hobby or a $4–6 VPS. Google PSE has a free quota then per-1k pricing; You.com is usage-based.

**Can I run without Convex Cloud?**
Yes — see [Path B](#5-path-b-fully-self-hosted-convex-advanced). It's more ops work (backups, upgrades, WebSockets). Most users should stay on Path A.

**Can I use only one search provider?**
Yes. Brave alone is a complete experience. Google/You add coverage and fallbacks.

**Do I need PostHog / Polar / Cheyn / Prelude?**
No. All are optional and fail closed (disabled or checkout-only errors). Start without them.

**Which Node version?**
20.x — matches `Dockerfile`. Newer Node often works for `npm run dev`, but keep Docker on 20 for reproducible builds.

**Where is my data?**
In your Convex deployment (yours, not ours). Export/delete via Convex dashboard. Tekir aggregates usage privacy-preservingly and admin pages offer purge where applicable — see in-app settings.

**Can I migrate my tekir.co history?**
No managed export is provided for the sunset. Copy anything important manually before Oct 1, 2026.

---

## License / Security

- License: see [LICENSE](LICENSE).
- Security policy / disclosure: see [SECURITY.md](SECURITY.md).
- Contributions are currently paused — see [README.md](README.md). Bug reports via GitHub issues are still welcome.
