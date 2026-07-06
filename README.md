# Renewal Intelligence

CRM enrichment & account intelligence for renewal teams. Detects champion job
changes, title changes, and stale contact data before they put a renewal at
risk, and alerts the assigned CSM/CAE in Slack.

**Architecture: app-first, minimal n8n.** The Next.js app owns everything —
Salesforce sync, LeadIQ champion tracking, Clay enrichment dispatch/callback,
Tavily + Anthropic industry briefings, Slack alerts, and the dashboard — all on
Vercel with Vercel Cron. No n8n required.

## Stack

- **Next.js 14** (App Router) on Vercel — UI + all API routes
- **Supabase** (Postgres) — read model & signal store (`supabase/migrations/`)
- **Salesforce** — system of record (OAuth2 client-credentials, SOQL polling)
- **LeadIQ** — job/title change detection (champion tracking)
- **Clay** — waterfall enrichment (webhook-in / webhook-out)
- **Tavily + Anthropic** — weekly per-industry briefings
- **Slack** — incoming webhook to `#renewal-intel-alerts`

## Data flow

```
Vercel Cron ──► /api/cron/sf-sync         daily 5:00  SF accounts+contacts → Supabase (junk gate flags)
            ──► /api/cron/leadiq-sync     daily 6:00  sync tracked contacts → poll changes → signals
            ──► /api/cron/industry-intel  weekly Sun  Tavily search → Anthropic briefing → cache

Manual      ──► POST /api/enrich/clay/dispatch   budgeted batch → Clay table webhook
Clay        ──► POST /api/webhooks/clay-callback fill-only-empty → Supabase + Salesforce

Signal path: signals table (dedup on signal_key) → SF Task (critical/warning)
             → Slack alert (once per signal, via notification_log)
```

## Setup

1. **Supabase**: create a project, run `supabase/migrations/0001_renewal_intel_core.sql`.
2. **Salesforce**: create a connected app with the client-credentials flow enabled.
3. **Slack**: create an incoming webhook for `#renewal-intel-alerts`.
4. Copy `.env.example` → `.env.local` and fill everything in.
5. `npm install && npm run dev`, or deploy to Vercel (crons in `vercel.json`).
6. Seed data: `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/sf-sync`

## Pages

| Route | Purpose |
|---|---|
| `/` | Account cards sorted by health score (100 − 40·critical − 15·warning − 5·info) |
| `/signals` | Ranked signal feed with dismiss + 👍/👎 relevance feedback |
| `/contacts` | Enrichment status, validity, quality flags, provenance |
| `/industry` | Cached weekly industry briefings |

## Credit protection

- Junk gate (`src/lib/cleaning.ts`) flags role mailboxes, placeholder
  domains/names, and internal staff — junk never reaches a paid provider.
- Clay dispatch is manual, capped at 100 contacts/batch, 90-day re-enrichment
  cooldown, prioritized by nearest renewal date.
- Every run writes to `enrichment_run_log` — watch spend there.

See `RUNBOOK.md` for operational detail and open questions.
