export type Severity = 'critical' | 'warning' | 'info';

export type SignalType =
  | 'job_change_new_company'
  | 'job_change_new_title'
  | 'new_stakeholder'
  | 'data_quality';

export interface AccountRow {
  id: string;
  sfdc_id: string;
  name: string;
  website: string | null;
  industry: string | null;
  owner_email: string | null;
  renewal_date: string | null;
  health_score: number | null;
}

export interface ContactRow {
  id: string;
  sfdc_id: string;
  account_id: string | null;
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
  clay_last_run: string | null;
  work_email_provider: string | null;
}

export interface SignalRow {
  id: string;
  signal_key: string;
  account_id: string | null;
  contact_id: string | null;
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
  relevance: 'helpful' | 'not_helpful' | 'inaccurate' | null;
  created_at: string;
}

export interface IndustryIntelRow {
  id: string;
  industry: string;
  briefing_summary: string | null;
  sources: { title: string; url: string }[];
  generated_at: string | null;
  model_used: string | null;
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
  source: SignalRow['source'];
  csm_email: string;
  detected_at: string;
}
