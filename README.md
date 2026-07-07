# Renewal Intelligence

CRM enrichment & account intelligence for renewal teams. Detects champion job
changes, title changes, and stale contact data before they put a renewal at
risk, and alerts the assigned CSM/CAE in Slack.

**Architecture: app-first, minimal n8n.** The Next.js app owns everything —
Salesforce sync, LeadIQ champion tracking, Clay enrichment dispatch/callback,
Tavily + Anthropic industry briefings, Slack alerts, and the dashboard —
deployed on **Railway** with Railway cron services triggering the sync
endpoints. No n8n required.

## Stack

- **Next.js 14** (App Router) on Railway — UI + all API routes
- **MongoDB** — read model & signal store (indexes auto-created on first connection)
- **Salesforce** — system of record (OAuth2 client-credentials, SOQL polling)
- **LeadIQ** — job/title change detection (champion tracking)
- **Clay** — waterfall enrichment (webhook-in / webhook-out)
- **Tavily + Anthropic** — weekly per-industry briefings
- **Slack** — incoming webhook to `#renewal-intel-alerts`

## Data flow

```
Railway cron ──► /api/cron/sf-sync         daily 5:00  SF accounts+contacts → MongoDB (junk gate flags)
             ──► /api/cron/leadiq-sync     daily 6:00  sync tracked contacts → poll changes → signals
             ──► /api/cron/industry-intel  weekly Sun  Tavily search → Anthropic briefing → cache

Manual       ──► POST /api/enrich/clay/dispatch   budgeted batch → Clay table webhook
Clay         ──► POST /api/webhooks/clay-callback fill-only-empty → MongoDB + Salesforce

Signal path: signals table (dedup on signal_key) → SF Task (critical/warning)
             → Slack alert (once per signal, via notification_log)
```

## Deploying on Railway

### 1. Prerequisites

- **MongoDB**: add the Railway MongoDB service to the project (or use Atlas) and
  note its connection string. Collections and unique indexes are created
  automatically on first connection — no migration step.
- **Salesforce**: connected app with the OAuth2 client-credentials flow enabled.
- **Slack**: incoming webhook for `#renewal-intel-alerts`.

### 2. Web service

1. Railway → New Project → **Deploy from GitHub repo** → select this repo.
   `railway.json` supplies the build (`npm run build`) and start (`npm start`)
   commands; Nixpacks detects Node automatically.
2. Set every variable from `.env.example` on the service
   (Settings → Variables). Generate a strong random `CRON_SECRET`.
3. Settings → Networking → **Generate Domain**. That domain is also what you
   paste into Clay's HTTP-API callback column:
   `https://<your-domain>/api/webhooks/clay-callback?secret=<CLAY_CALLBACK_SECRET>`

### 3. Cron services (one per schedule)

Railway runs crons as scheduled services: the service starts on the schedule,
runs its command, and must exit. Create **three more services from the same
repo**, each with:

| Service | Custom start command | Cron schedule (service settings) |
|---|---|---|
| `cron-sf-sync` | `sh scripts/run-cron.sh /api/cron/sf-sync` | `0 5 * * *` |
| `cron-leadiq-sync` | `sh scripts/run-cron.sh /api/cron/leadiq-sync` | `0 6 * * *` |
| `cron-industry-intel` | `sh scripts/run-cron.sh /api/cron/industry-intel` | `0 4 * * 0` |

On each cron service set two variables (reference the web service's values):

- `APP_URL` = `https://<your-web-domain>` (or the private URL
  `http://<web-service>.railway.internal:3000` to stay off the public network)
- `CRON_SECRET` = same as the web service

Also override their build command to skip the Next build (Settings → Build →
custom build command: `echo skip`) — the cron services only need the shell script.

### 4. Seed & verify

```sh
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/sf-sync
```

Then open the dashboard — accounts and contacts should be populated. Trigger a
Clay batch when ready:

```sh
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/enrich/clay/dispatch
```

### Local development

Copy `.env.example` → `.env.local`, then `npm install && npm run dev`.

## Auth & users

Email/password auth with MongoDB-backed sessions (httpOnly cookie, 30-day TTL,
scrypt password hashing — no external auth provider needed):

- `/signup` — the **first account created becomes the workspace admin**
- `/login`, sign-out from the avatar menu
- `/profile` — display name + password change
- `/settings` — per-user preferences (signal email alerts, weekly digest,
  default view) and workspace integration status
- All dashboard pages and the signals API require a session; cron/webhook
  routes use `CRON_SECRET` / `CLAY_CALLBACK_SECRET` instead.

## Pages

| Route | Purpose |
|---|---|
| `/` | Account cards sorted by health score (100 − 40·critical − 15·warning − 5·info) |
| `/signals` | Ranked signal feed with dismiss + 👍/👎 relevance feedback |
| `/contacts` | Enrichment status, validity, quality flags, provenance |
| `/industry` | Cached weekly industry briefings |
| `/login` · `/signup` | Auth |
| `/profile` · `/settings` | User profile and preferences |

## Credit protection

- Junk gate (`src/lib/cleaning.ts`) flags role mailboxes, placeholder
  domains/names, and internal staff — junk never reaches a paid provider.
- Clay dispatch is manual, capped at 100 contacts/batch, 90-day re-enrichment
  cooldown, prioritized by nearest renewal date.
- Every run writes to `enrichment_run_log` — watch spend there.

See `RUNBOOK.md` for operational detail and open questions.
