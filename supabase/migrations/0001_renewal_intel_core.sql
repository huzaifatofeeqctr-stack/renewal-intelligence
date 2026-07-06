-- Renewal Intelligence — core read-model schema (Supabase / Postgres)
-- The n8n Data Tables (ri_signals, ri_run_log, ri_industry_intel,
-- ri_notification_log) are the interim store. When Supabase is provisioned,
-- apply this migration and swap the Data Table nodes for Supabase nodes —
-- column names match 1:1.

create table if not exists accounts (
  id            uuid primary key default gen_random_uuid(),
  sfdc_id       text unique not null,
  name          text not null,
  website       text,
  industry      text,
  owner_email   text,
  renewal_date  date,
  health_score  numeric,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists contacts (
  id                     uuid primary key default gen_random_uuid(),
  sfdc_id                text unique not null,
  account_id             uuid references accounts(id) on delete cascade,
  first_name             text,
  last_name              text,
  email                  text,
  title                  text,
  work_email             text,
  email_valid            text check (email_valid in ('valid','invalid','risky','unknown')) default 'unknown',
  personal_email         text,
  linkedin_url           text,
  is_junk                boolean not null default false,
  junk_reason            text,
  leadiq_tracking_status text check (leadiq_tracking_status in ('tracked','untrackable','excluded_junk')),
  leadiq_last_checked    timestamptz,
  clay_last_run          timestamptz,
  clay_no_data           boolean not null default false,
  work_email_provider    text,
  linkedin_url_provider  text,
  personal_email_provider text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Three-tier uniqueness: email first, LinkedIn URL as fallback.
create unique index if not exists contacts_account_email_uq
  on contacts(account_id, email) where email is not null;
create unique index if not exists contacts_account_linkedin_uq
  on contacts(account_id, linkedin_url) where email is null and linkedin_url is not null;

create table if not exists signals (
  id             uuid primary key default gen_random_uuid(),
  signal_key     text unique not null,
  account_id     uuid references accounts(id) on delete cascade,
  contact_id     uuid references contacts(id) on delete set null,
  account_name   text,
  contact_name   text,
  signal_type    text not null check (signal_type in ('job_change_new_company','job_change_new_title','new_stakeholder','data_quality')),
  severity       text not null check (severity in ('critical','warning','info')),
  summary        text not null,
  previous_value text,
  new_value      text,
  source         text not null check (source in ('leadiq','apollo','clay','manual')),
  csm_email      text,
  detected_at    timestamptz not null,
  sfdc_task_id   text,
  dismissed      boolean not null default false,
  dismissed_at   timestamptz,
  dismissed_by   text,
  -- feedback loop: was this notification useful?
  relevance      text check (relevance in ('helpful','not_helpful','inaccurate')),
  created_at     timestamptz not null default now()
);

create index if not exists signals_account_idx on signals(account_id, severity, dismissed);
create index if not exists signals_detected_idx on signals(detected_at desc);

create table if not exists industry_intel (
  id               uuid primary key default gen_random_uuid(),
  industry         text unique not null,
  briefing_summary text,
  sources          jsonb not null default '[]',
  tavily_query     text,
  model_used       text,
  generated_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists enrichment_run_log (
  id                 uuid primary key default gen_random_uuid(),
  workflow_name      text not null,
  run_at             timestamptz not null default now(),
  items_in           integer not null default 0,
  items_skipped_junk integer not null default 0,
  items_processed    integer not null default 0,
  credits_used       integer,
  errors             integer not null default 0,
  error_details      jsonb,
  notes              text
);

create index if not exists run_log_workflow_idx on enrichment_run_log(workflow_name, run_at desc);

create table if not exists notification_log (
  id          uuid primary key default gen_random_uuid(),
  signal_key  text not null,
  notified_at timestamptz not null default now(),
  channel     text
);

create unique index if not exists notification_log_key_uq on notification_log(signal_key);
