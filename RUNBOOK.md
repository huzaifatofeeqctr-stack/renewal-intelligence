# Renewal Intelligence — Build Runbook (v2, Phase 1)

Built: 2026-07-02 · n8n instance: https://n8n.corp.postscript.io

This phase delivers the **LeadIQ + Clay + Tavily/Anthropic** integrations from the
Renewal Intelligence v2 design doc as five n8n workflows plus a persistence layer.
Apollo stakeholder discovery, Salesforce CDC, and the dashboard changes are later phases.

---

## What was built

### n8n workflows

| Workflow | ID | Trigger | Status | Blocked on |
|---|---|---|---|---|
| [Renewal Intel] Slack Notification Engine | `6SVJ8FNCAhK9uJXG` | Called by other workflows | **Published** | Create `#renewal-intel-alerts` channel + invite Audit Bot |
| [Renewal Intel] LeadIQ Champion Tracking | `0AVLm7aI50tumeW3` | Daily 6:00 UTC | Unpublished | LeadIQ API key + endpoint confirmation |
| [Renewal Intel] Clay Enrichment Dispatch | `dqNjFee8NPJxywPv` | Manual (budgeted batches) | Unpublished | Clay table webhook URL |
| [Renewal Intel] Clay Enrichment Callback | `4cyutb2zCzzPp6h8` | Webhook `POST /clay-enrichment-callback` | **Published** | Clay HTTP-API column pointed at it |
| [Renewal Intel] Industry Intelligence | `OKUmdtynlKCHa0dj` | Weekly Sun 4:00 UTC | Unpublished | Tavily API key |

### n8n Data Tables (interim store — swap to Supabase later)

| Table | ID | Purpose |
|---|---|---|
| `ri_signals` | `WF8Tq4DC2d7F4Th5` | Signal store (job changes, stakeholders); `signal_key` is the dedup key |
| `ri_run_log` | `QEMGYHCXtjdnNTkY` | Per-run observability: items in/skipped/processed, errors |
| `ri_industry_intel` | `aMgiRCn3dH3KUxXz` | One briefing row per industry, upserted weekly |
| `ri_notification_log` | `pkvL72c4tgtT2Cjq` | Slack dedup — a signal_key notifies exactly once |

### Credentials

| Credential | Status |
|---|---|
| Salesforce account (OAuth2) | ✅ wired into all SF nodes |
| Anthropic account | ✅ wired into industry summarizer |
| Audit Bot (Slack) | ✅ wired into Slack engine |
| LeadIQ API (header auth) | ❌ created as stub — add the key |
| Tavily API (bearer) | ❌ created as stub — add the key |
| Clay | ❌ no key needed; uses table webhook URL instead |

### Repo artifacts (this directory)

- `supabase/migrations/0001_renewal_intel_core.sql` — the full Postgres schema
  (accounts, contacts with three-tier uniqueness, signals, industry_intel,
  enrichment_run_log, notification_log) for when Supabase is provisioned.
  Column names match the n8n Data Tables 1:1, so the migration is a node swap.

---

## Data flow

```
                    ┌── daily cron ──► LeadIQ Champion Tracking ─┐
Salesforce ─ SOQL ──┤                                            ├─► ri_signals ─► SF Task ─► Slack Engine ─► #renewal-intel-alerts
                    ├── manual ─────► Clay Dispatch ─► Clay table │                                (dedup via ri_notification_log)
                    │                        │  waterfall runs    │
                    │                        ▼                    │
                    │                 Clay Callback (webhook) ────┴─► fills empty Email/Title on SF Contact
                    │
                    └── weekly cron ─► Tavily search ─► Anthropic Haiku ─► ri_industry_intel
```

Every workflow writes a summary row to `ri_run_log`. The junk gate
(role mailboxes, placeholder domains/names, internal postscript.io addresses)
runs before every credit-metered call.

## Design decisions made during the build

1. **n8n Data Tables instead of Supabase for now.** No Supabase credential exists
   in n8n. Data Tables need zero setup and the schema mirrors the SQL migration,
   so cutover later is mechanical.
2. **Salesforce Task instead of a Renewal Signal custom object.** The custom
   object doesn't exist yet (open question #8). Tasks work today; swap the
   "Mirror Signal to Salesforce Task" node for a customObject:create node once
   the object is deployed.
3. **Fixed alert channel, not per-CSM DMs.** Messages go to
   `#renewal-intel-alerts` and include the account owner's email. DM routing via
   `users.lookupByEmail` needs the `users:read.email` scope on the Audit Bot app —
   add it later and switch the Slack node to `select: user`.
4. **LeadIQ endpoints are best-guess placeholders.** The `/v2/champion-tracking/*`
   URLs must be confirmed against the actual LeadIQ Data API docs (open question
   #1/#2). The response parser tolerates several payload shapes
   (`changes` / `data` / `results` / bare array, snake_case and camelCase).
5. **Clay integration is webhook-in / webhook-out.** Dispatch POSTs contacts to a
   Clay table's Webhook source; a Clay HTTP-API column POSTs enriched rows back
   to the callback. This is Clay's native automation pattern and avoids polling.
6. **Fill-only-empty writeback.** The Clay callback never overwrites a non-null
   Salesforce Email/Title, and only writes emails Clay marks `valid`. LinkedIn and
   personal email land in the contact Description until custom fields exist.
7. **Credit budget is a constant, not config.** `DAILY_CREDIT_BUDGET = 100` in the
   dispatch workflow's Junk Gate code node. Deliberately conservative pending the
   March-2026 Clay re-pricing validation (open question #3).

## Go-live checklist

1. Create `#renewal-intel-alerts` in Slack and invite the Audit Bot app.
2. Test the Slack engine: run it manually with a sample signal payload.
3. LeadIQ: get the Data API key from Huzaifa's account → fill the "LeadIQ API"
   credential → confirm/fix the two endpoint URLs → run once manually → publish.
4. Clay: create the table + webhook source → paste URL into the dispatch HTTP
   node → add the HTTP-API callback column pointing at
   `https://n8n.corp.postscript.io/webhook/clay-enrichment-callback` → run one
   10-contact test batch → check ri_run_log and a few SF contacts → then run
   budgeted batches in renewal-date priority order.
5. Tavily: create a free-tier key → fill the "Tavily API" credential → run the
   industry workflow manually once → check ri_industry_intel → publish.
6. Review ri_run_log weekly for credit burn and junk-gate hit rate.

## Later phases (not built)

- Apollo stakeholder discovery (`new_stakeholder` signals — the Slack engine
  already formats them, so that workflow just needs to feed it).
- Salesforce CDC / Platform Events sync (current workflows poll via SOQL).
- Renewal Signal custom object + feedback-loop UI (relevance field already in
  the Supabase schema).
- Supabase cutover + Next.js dashboard reads.
