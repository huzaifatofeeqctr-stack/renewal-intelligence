export type Severity = 'critical' | 'warning' | 'info';

// Inbox workflow for signals: new → acknowledged → actioned; dismissed is terminal.
export type SignalStatus = 'new' | 'acknowledged' | 'actioned' | 'dismissed';

export type SignalType =
  | 'job_change_new_company'
  | 'job_change_new_title'
  | 'new_stakeholder'
  | 'data_quality';

// Documents reference Salesforce IDs directly — no join tables needed.

export interface AccountDoc {
  sfdc_id: string;
  name: string;
  website: string | null;
  industry: string | null;
  owner_email: string | null;
  renewal_date: string | null;
  stakeholders_checked_at?: string | null;
  updated_at: string;
}

export interface ContactDoc {
  sfdc_id: string;
  account_sfdc_id: string | null;
  account_name: string | null;
  account_owner_email: string | null;
  account_renewal_date: string | null;
  account_website: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  title: string | null;
  work_email: string | null;
  email_valid: 'valid' | 'invalid' | 'risky' | 'unknown';
  personal_email: string | null;
  linkedin_url: string | null;
  is_junk: boolean;
  junk_reason: string | null;
  enriched_at: string | null;
  enrichment_provider: string | null;
  watch_checked_at?: string | null; // champion watch: last re-verification
  updated_at: string;
}

export interface SignalDoc {
  signal_key: string;
  account_sfdc_id: string | null;
  contact_sfdc_id: string | null;
  account_name: string | null;
  contact_name: string | null;
  signal_type: SignalType;
  severity: Severity;
  summary: string;
  previous_value: string | null;
  new_value: string | null;
  source: 'leadiq' | 'apollo' | 'clay' | 'manual';
  csm_email: string | null;
  detected_at: string;
  sfdc_task_id: string | null;
  dismissed: boolean;
  dismissed_at: string | null;
  // status supersedes the dismissed boolean but both are kept in sync.
  status?: SignalStatus;
  status_changed_at?: string | null;
  status_changed_by?: string | null;
  relevance: 'helpful' | 'not_helpful' | 'inaccurate' | null;
  created_at: string;
}

// Background job queue: enqueued work the hourly jobs cron picks up, so long
// enrichment backlogs drain without a browser request staying open.
export interface JobDoc {
  type: 'enrich' | 'champion_watch';
  status: 'pending' | 'running' | 'done' | 'failed';
  params: { account_sfdc_id?: string | null };
  created_at: string;
  created_by: string;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
  result: string | null;
  error: string | null;
}

export interface IndustryIntelDoc {
  industry: string;
  briefing_summary: string | null;
  sources: { title: string; url: string }[];
  tavily_query: string | null;
  model_used: string | null;
  generated_at: string | null;
  updated_at: string;
}

export interface RunLogDoc {
  workflow_name: string;
  run_at: string;
  items_in: number;
  items_skipped_junk: number;
  items_processed: number;
  errors: number;
  notes: string;
}

export interface NewSignal {
  signal_key: string;
  account_sfdc_id?: string;
  contact_sfdc_id?: string;
  account_name: string;
  contact_name: string;
  signal_type: SignalType;
  severity: Severity;
  summary: string;
  previous_value: string;
  new_value: string;
  source: SignalDoc['source'];
  csm_email: string;
  detected_at: string;
}
