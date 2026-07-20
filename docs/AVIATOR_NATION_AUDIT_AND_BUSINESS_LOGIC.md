# Renewal Intelligence — Aviator Nation Data Audit & Business Logic Documentation

*Prepared 2026-07-10 · Sources: Salesforce (read-only SOQL), Apollo people search (free endpoint, no credits spent), and the application's own rule code (`src/lib/`). App database (MongoDB on Railway) was not directly reachable at audit time; app-side behavior was reproduced by running the production rule code against the Salesforce source records.*

---

# Part 1 — First-Pass Audit: Aviator Nation

**Account:** Aviator Nation · SFDC `0013i00001zRuxhAAC` · Industry: Fashion & Apparel · Owner: charlie.webber@postscript.io · Website: www.aviatornation.com

**Population:** 46 contacts in Salesforce. 5 Opportunities (4 closed, 1 open).

**Renewal date check:** the earliest open Opportunity is *"Aviator Nation | Renewal | 9 - 2026"* (Stage: In Progress, CloseDate **2026-08-31**). The app's renewal-date rule (earliest open Opportunity CloseDate) should display **2026-08-31** on the account card. ✅ Rule verified against source.

## 1.1 Summary of findings

| # | Finding | Severity | Count |
|---|---------|----------|-------|
| F1 | Stale Salesforce titles (person promoted; Apollo shows newer title) | High | 6 confirmed |
| F2 | Duplicate contact records (same person, two SFDC records) | High | 2 pairs |
| F3 | Missing email addresses | Medium | 8 of 46 |
| F4 | Missing titles | Medium | 2 of 46 |
| F5 | Placeholder record ("Unknown Unknown") — correctly junk-flagged by the app | Low (working as designed) | 1 |
| F6 | Probable staffing change around CEO office (champion-risk) | High | 1 |
| F7 | ICP matcher misses a compound title (app logic gap) | Medium | 1 |
| F8 | Decision-makers present at the company but absent from the CRM | Medium | ≥4 notable |

## 1.2 F1 — Stale titles (SF value vs. Apollo's current title)

These six people appear in both systems with materially different titles. In every case the Apollo title is more senior — consistent with promotions the CRM never captured. The app **will** detect these as `job_change_new_title` signals when the contacts are enriched (fill-only-empty means it will not overwrite SF's title, by design — see Part 2 §2.3).

| Contact | Salesforce title (stale) | Apollo current title |
|---|---|---|
| Ariel Levine | Marketing Coordinator | Director of Social and Content Strategy |
| Rheagan Kaufman | Store Manager | SoCal South and NorCal Regional Manager |
| Taylor Huie | Brand Marketing Manager | E-Commerce Merchandise Manager / Senior Brand Manager |
| Danielle Koch | Visual Director & Project Manager | Director of Retail Merchandising & Project Manager |
| Bianca Pirone | Creative Marketing & Social Media Manager (Dreamland) | Director of Marketing / Booker, Dreamland Malibu, Nashville & RIDE |
| Matthew Solusod | Ecommerce Customer Service Member | Senior Manager, Ecommerce Operations & Systems |

Positive control: **Reed Thompson** — SF "Sales Director/Brand Partnerships" vs. Apollo "Director of Sales/Brand Partnerships". The app's title normalization correctly treats these as equivalent (word-order/containment rule), so **no false title-change signal** fires. ✅

## 1.3 F2 — Duplicate records

The app's duplicate detector currently keys on **shared email** only; both of these pairs have the email on only one record, so they display as separate clean contacts:

| Person | Record A | Record B |
|---|---|---|
| Andrew Pintar | `003Uw000004CBiGIAW` — no email, "Ecommerce Specialist" (untouched since 2025-04) | `0036e00003ydvUgAAI` — andrew@aviatornation.com, "eCommerce Specialist" |
| Kaleb Solusod | `0036e00004MWXB3AAP` — no email, no title (untouched since 2025-04) | `0036e00004MWXBNAA5` — kaleb@aviatornation.com, "Customer Service Specialist" |

**Action:** merge in Salesforce (the app never writes to SF). **App improvement noted in Part 2 §5:** extend duplicate detection to same-name-same-account.

## 1.4 F3/F4 — Missing data

- **Missing email (8):** Kourosh Bakhtiar (SVP Production), Josh Goudy, Bridget Lancaster, Jessica Madrid (Director of Retail Ops), Andrew Pintar (dup A), Stephen Solusod, Kaleb Solusod (dup A), Unknown Unknown. These render with the red **missing email** badge and are exactly the population the "Enrich incomplete contacts" run targets.
- **Missing title (2):** Kaleb Solusod (dup A), Unknown Unknown.
- All 8 missing-email records date from the 2025-04-19 bulk creation batch and have never been touched since — they look like a partial import.

## 1.5 F5 — Junk gate verification

Running the production `junkCheck` over all 46 records flags exactly one: **"Unknown Unknown"** (`0036e00004M8y6tAAB`, no email/title) → reason `placeholder_name`. No over-flagging observed; the other 45 pass. ✅ Working as designed.

## 1.6 F6 — Champion-risk observation (CEO office)

Salesforce holds **Kamryn Biondo — "Personal Assistant to CEO"**, but Apollo's current roster shows a different person, **Leah — "Personal Assistant to Chief Executive Officer"**, and Kamryn does not appear in Apollo's top results for the domain. This pattern (role present, person replaced) suggests Kamryn **may have left or changed roles**. Two adjacent records worth verifying in the same pass: Haley Love ("Assistant to CEO") and Hayden Gibson ("…Executive Assistant to CEO"). A champion-watch/enrichment pass on these three will confirm via employment history and set the ⚠ *not at company* flag if warranted.

Also verify manually: **Cory Uehlein — "Head of Growth & Retention Marketing"** (the most renewal-relevant contact on the account) did not appear in Apollo's first page of company results. Not conclusive — pagination — but he is the single most important record to confirm before the 2026-08-31 renewal.

## 1.7 F7 — ICP matcher gap (app logic finding)

Against the default ICP list, only **Curtis Ulrich — "Director of eCommerce"** flags as ICP. **Cory Uehlein — "Head of Growth & Retention Marketing" does NOT match** the ICP entry "Head of Retention", because the containment rule requires one normalized title to contain the other as a contiguous string ("head of retention" is interrupted by "growth and"). He is plainly ICP.

**Immediate workaround (no code change):** add a line to Settings → Signal rules → Title equivalences: `Head of Growth & Retention Marketing = Head of Retention`. **Longer-term fix** logged as an open question in Part 2 §6 (token-subset matching).

## 1.8 F8 — In-company decision-makers absent from the CRM

Apollo's roster for aviatornation.com includes people with buying-relevant titles who have no CRM record — these are what the stakeholder-discovery cron surfaces as `new_stakeholder` signals:

- **Kelly — Managing Director**
- **Natalie — Director of National Events and Activations**
- **Candace — National Inventory & Visual Operations Manager**
- Plus store/field staff (lower relevance): Kyla, Grace ×2, Fannie, Meredith, Brooke, Maya, Ruby, Savannah, Abigail.

Note: none of these carry the default ICP titles, so discovery with the current ICP list would skip them — deliberate credit protection, but "Managing Director" arguably belongs on the ICP list (open question, Part 2 §6).

## 1.9 Recommended actions from this audit

1. Merge the two duplicate pairs **in Salesforce** (F2).
2. Run card-level ⚡ Enrich on Aviator Nation once Apollo credits allow — it fills the 8 missing emails / 2 titles where Apollo has data and confirms/flags F6 candidates.
3. Add the title-equivalence line for Cory Uehlein (F7) so he counts as ICP today.
4. Decide whether "Managing Director" joins the ICP list (F8).
5. Treat the six F1 title changes as expected `job_change_new_title` signals on next enrichment — they are CRM staleness, not app errors.

---

# Part 2 — Business Logic Documentation

*Everything below is stated from the production code and is the current behavior of the deployed app.*

## 2.1 Data flow overview

```
Salesforce (READ-ONLY) ──sync/import──▶ MongoDB ◀──enrichment/watch── Apollo
                                          │
                                   signal engine ──▶ Slack (instant or daily digest)
```

**Hard constraint: Salesforce is permanently read-only.** The app authenticates with OAuth2 client-credentials and exposes only a SOQL query helper; no write path exists in the codebase. All enriched data lives in MongoDB only.

## 2.2 Ingestion rules (Salesforce → app)

- **Tracked-accounts model:** only accounts imported via the Import page (or `?mode=full` sync) exist in the app. Daily sync refreshes exactly the tracked set.
- **Fields synced per contact:** first/last name, email (lowercased), title, account linkage (denormalized: account name, owner email, website, renewal date).
- **Renewal date rule:** earliest **open** Opportunity `CloseDate` per account (`IsClosed = false`, ascending). No open opps → no renewal date. Tolerates missing Opportunity permissions (skips, never fails the sync).
- **Junk gate (`junkCheck`)** runs on every ingest; junk contacts are stored but flagged, excluded from enrichment, and never spend credits. Reasons:
  - `role_mailbox` — email prefix in {info, support, sales, hello, admin, contact, noreply, no-reply, billing, help, team, office, marketing, webmaster, postmaster}
  - `placeholder_domain` — mailinator.com, guerrillamail.com, example.com, test.com, yopmail.com
  - `internal_staff` — @postscript.io
  - `placeholder_name` — BOTH first and last name in {test, unknown, n/a, tbd, na, none, placeholder, x, xx}
  - `no_identity` — no email and no names at all
- **Per-run trace:** every sync/import logs one line per account (contacts pulled, junk count, renewal date) — visible in Activity and in each account's History.

## 2.3 Enrichment rules (Apollo)

**Candidate selection ("Enrich incomplete", the default):** contact is non-junk AND has first+last name AND is missing at least one of {email, title, LinkedIn URL} AND is outside the re-enrichment cooldown (default 90 days, workspace-configurable 7–365). Processed in renewal-date order (soonest renewal first).

**"Re-enrich everything" (master button, second option):** every named non-junk contact regardless of completeness or cooldown, oldest-enriched first; only contacts refreshed in the last 24 h are skipped (loop prevention). Used to catch job changes on already-complete records on demand.

**Fill-only-empty policy:** Apollo data never overwrites an existing CRM value. Email is filled only if Apollo's `email_status` is `verified`; `email_valid` is set to `valid` (verified) or `risky` (guessed). Titles/LinkedIn fill only when blank. *Consequence (seen in Part 1 F1): stale SF titles stay stale in the record — the discrepancy surfaces as a signal instead.*

**Credit & rate protection:**
- 1 Apollo credit per `people/match` call; search calls are free.
- ≤30 match calls per HTTP request (proxy-timeout guard); workspace batch budget applies to normal runs; master-button runs ignore the budget but chain **background jobs** (hourly `cron-jobs`) until the backlog drains.
- Adaptive pacing from Apollo's rate-limit headers (speeds up when quota is plentiful; waits out the minute/hour window when nearly exhausted); 429 → 30 s retry once; "insufficient credits" → run aborts immediately and reports.
- Junk contacts and the first-name pre-filter (stakeholder discovery) prevent spending credits on people we already have.

**Champion watch (daily cron):** re-verifies already-**complete** contacts on a cadence (default every 30 days, budget 20/run) — signals only; exists because "Enrich incomplete" deliberately skips complete records.

## 2.4 Signal definitions (what fires an alert)

All signals dedupe on a unique `signal_key`; a signal fires **once** ever per key, and Slack is notified exactly once per signal (unique `notification_log`).

| Signal | Fires when | Default severity |
|---|---|---|
| `job_change_new_company` | Apollo's **full employment history** shows *no current role at the account* AND a current role elsewhere. A concurrent role at another company does NOT fire this (the Chad Held rule) — org names are normalized (Inc/LLC stripped, spacing/punctuation ignored, containment allowed) and the account's domain is checked (www/shop/checkout prefixes stripped). Also sets the persistent ⚠ `not at company` flag on the contact. | critical |
| `job_change_new_title` | The person's title *at the account* genuinely differs from the CRM title. "Genuinely" = survives normalization: abbreviation expansion (CMO→Chief Marketing Officer, VP/SVP/EVP, Dir, Mktg, Ecomm…), `&`→and, co-founder≈founder, punctuation/case ignored, containment allowed (a more specific variant of the same title does not fire), plus workspace **title equivalences** (one `A = B` pair per line; matching pairs never fire). Blank titles never fire. | warning |
| `new_stakeholder` | Stakeholder discovery (daily cron) finds a person at the account's domain matching an **ICP title** who is not in the CRM (email not on any contact; first-name pre-filter avoids re-revealing known people). | warning |

**Feedback suppression:** a signal rated *inaccurate* suppresses all future re-emission of that signal type for that person. 👎 ratings aggregate into the **ICP tuning widget** (Settings → Signal rules) with one-click removal of noisy ICP titles.

**Inbox states:** every signal is `new → acknowledged → actioned` (or `dismissed`); dismissal hides it from account health scores.

**Account health score:** `100 − 40·critical − 15·warning − 5·info` (floor 0), open signals only.

## 2.5 Field definitions (Contacts view)

| Field / badge | Meaning | Source |
|---|---|---|
| Name + `in↗` | LinkedIn profile; link shown (blue) only when a URL exists | Apollo (fill-only-empty) |
| `sf↗` | Opens the record in Salesforce (read-only navigation) | `SF_INSTANCE_URL` + SFDC Id |
| ICP badge | Title matches the workspace ICP list under full title normalization (+equivalences) | computed at render |
| Email `missing email` (red) | No email on the record | SF/Apollo |
| Validity `valid` / `risky` / `unknown` | `valid` = Apollo-verified; `risky` = Apollo guessed; `unknown` = never enriched | Apollo |
| ⚠ `not at company` (red) | Persistent flag set by enrichment/watch when no current role at the account (tooltip shows where they went); cleared automatically if a later check finds them back | Apollo employment history |
| `duplicate?` (amber) | Another record shares this email | computed |
| Junk reason (amber) | See §2.2 junk gate | ingest |
| `clean` | None of the above | — |
| Enriched | Date + provider of last enrichment; `never` = raw SF data | app |

## 2.6 Scheduling & operations

- Railway crons fire **hourly**; each job executes only at its configured local hour (workspace timezone), so schedules are changeable in-app without touching Railway. Jobs: SF sync (05:00), stakeholder discovery (07:00), champion watch (08:00), Slack digest (16:00, digest mode only), weekly industry intel (Sun 04:00), job-queue runner (every hour).
- **Slack delivery modes:** `instant` (one message per signal, workspace-editable templates with `{contact} {account} {previous} {new} {owner} {date} {summary}` placeholders) or `digest` (one daily message, grouped by account owner, only never-notified signals).
- **Ops alerting:** any crashed run or run with errors pings `SLACK_OPS_WEBHOOK_URL` (falls back to the alerts webhook).
- **Observability:** Activity page = per-run rows with per-item traces (which contact, what happened, which fields filled, which signals fired) + background-job queue with status/attempts/duration.
- **Roles:** first-ever signup = admin; everyone else = member. Members see all workspace settings read-only; admins edit and manage roles (Settings → Team).

## 2.7 Open questions (need product decisions)

1. **Stale-title overwrite policy** — fill-only-empty preserves provably stale SF titles (Part 1 F1: six records). Should a *confirmed* newer title ever update the app's copy (never SF)? Proposal: store `title_current` alongside the SF title rather than overwriting.
2. **ICP matching for compound titles** — "Head of Growth & Retention Marketing" fails to match "Head of Retention" (Part 1 F7). Move to token-subset matching, or keep containment + manual equivalences?
3. **Duplicate detection scope** — email-only today; both Aviator Nation dup pairs are name-dups without shared email (F2). Extend to same-normalized-name-same-account? What's the merge workflow given SF is read-only for us?
4. **ICP list curation ownership** — who approves additions like "Managing Director" (F8)? The tuning widget removes noisy titles but nothing proposes additions; should discovery suggest frequently-seen senior titles?
5. **"Not at company" SLA** — with a 30-day watch cadence and 20-credit budget, worst-case detection lag for a departed champion is ~cadence × (population/budget). Is that acceptable for accounts inside 90 days of renewal? Proposal: prioritize watch candidates by renewal proximity (currently oldest-checked first).
6. **Missing-email backfill batch** — the 2025-04 partial-import cohort (F3) likely exists on other accounts. Run a one-time "Enrich incomplete" sweep across the book once credits renew?
7. **Duplicate-pair display** — should a merged/duplicate record be excludable from counts and enrichment candidates in-app (a `suppressed` flag), pending the SF merge?

---

*Prepared with: SOQL against `postscript.my.salesforce.com` (Account/Contact/Opportunity, read-only), Apollo `mixed_people/api_search` (1 free call), and the app's production modules `cleaning.ts`, `apollo.ts` (junk gate, title normalization, ICP matching) executed against the live SF records.*
