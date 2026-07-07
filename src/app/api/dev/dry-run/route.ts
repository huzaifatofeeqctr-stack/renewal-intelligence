import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth, logRun } from '@/lib/auth';
import { coll, isDuplicateKeyError } from '@/lib/db';
import { junkCheck } from '@/lib/cleaning';
import { notifySlack } from '@/lib/slack';
import type { AccountDoc, ContactDoc, SignalDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Dry run: walks a demo account ("Glow Recipe (Demo)") through the full
// pipeline — ingest, junk gate, Clay dispatch/callback, LeadIQ change,
// signal + notification — using the real store and real code paths, but
// WITHOUT calling Salesforce, LeadIQ, or Clay. Slack is attempted for real
// if SLACK_WEBHOOK_URL is set. Everything it writes is prefixed DEMO- and
// removable with ?cleanup=1.
export async function GET(req: NextRequest) {
  try {
    const denied = requireCronAuth(req);
    if (denied) return denied;

    const accounts = await coll<AccountDoc>('accounts');
    const contacts = await coll<ContactDoc>('contacts');
    const signals = await coll<SignalDoc>('signals');
    const notifications = await coll('notification_log');

    if (req.nextUrl.searchParams.get('cleanup') === '1') {
      const [a, c, s, n] = await Promise.all([
        accounts.deleteMany({ sfdc_id: /^DEMO-/ }),
        contacts.deleteMany({ sfdc_id: /^DEMO-/ }),
        signals.deleteMany({ signal_key: /^DEMO-/ }),
        notifications.deleteMany({ signal_key: /^DEMO-/ }),
      ]);
      return NextResponse.json({
        cleaned: { accounts: a.deletedCount, contacts: c.deletedCount, signals: s.deletedCount, notifications: n.deletedCount },
      });
    }

    const trace: { phase: string; detail: string; data?: unknown }[] = [];
    const now = new Date().toISOString();
    const renewal = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // ── Phase 1: Salesforce ingest (simulated CRM pull) ──────────────────
    await accounts.updateOne(
      { sfdc_id: 'DEMO-ACCT-001' },
      {
        $set: {
          name: 'Glow Recipe (Demo)',
          website: 'glowrecipe.com',
          industry: 'Beauty & Cosmetics',
          owner_email: 'huzaifa.tofeeq.ctr@postscript.io',
          renewal_date: renewal,
          updated_at: now,
        },
      },
      { upsert: true }
    );
    trace.push({
      phase: '1. sf-sync (ingest)',
      detail: `Account "Glow Recipe (Demo)" upserted — renews ${renewal}, owner huzaifa.tofeeq.ctr@postscript.io`,
    });

    const rawContacts = [
      { sfdc_id: 'DEMO-C-001', first: 'Sarah', last: 'Kim', email: 'sarah.kim@glowrecipe.com', title: 'VP Retention Marketing' },
      { sfdc_id: 'DEMO-C-002', first: 'David', last: 'Chen', email: null, title: null },
      { sfdc_id: 'DEMO-C-003', first: 'Glow', last: 'Recipe', email: 'info@glowrecipe.com', title: null },
    ];
    const gate: string[] = [];
    for (const rc of rawContacts) {
      const verdict = junkCheck({ email: rc.email, firstName: rc.first, lastName: rc.last });
      gate.push(`${rc.first} ${rc.last} (${rc.email ?? 'no email'}) → ${verdict.isJunk ? `JUNK [${verdict.reason}] — will never spend a provider credit` : 'clean'}`);
      await contacts.updateOne(
        { sfdc_id: rc.sfdc_id },
        {
          $set: {
            account_sfdc_id: 'DEMO-ACCT-001',
            account_name: 'Glow Recipe (Demo)',
            account_owner_email: 'huzaifa.tofeeq.ctr@postscript.io',
            account_website: 'glowrecipe.com',
            account_renewal_date: renewal,
            first_name: rc.first,
            last_name: rc.last,
            email: rc.email,
            title: rc.title,
            is_junk: verdict.isJunk,
            junk_reason: verdict.reason,
            updated_at: now,
          },
          $setOnInsert: {
            sfdc_id: rc.sfdc_id,
            work_email: null,
            email_valid: 'unknown' as const,
            personal_email: null,
            linkedin_url: null,
            clay_last_run: null,
            work_email_provider: null,
          },
        },
        { upsert: true }
      );
    }
    trace.push({ phase: '2. junk gate', detail: '3 contacts ingested and screened', data: gate });

    // ── Phase 3: Clay dispatch (what WOULD be sent) ───────────────────────
    const incomplete = await contacts
      .find({ account_sfdc_id: 'DEMO-ACCT-001', is_junk: false, $or: [{ email: null }, { title: null }, { linkedin_url: null }] })
      .toArray();
    trace.push({
      phase: '3. clay dispatch',
      detail: `${incomplete.length} incomplete non-junk contact(s) would be POSTed to the Clay table webhook (budgeted, renewal-priority order)`,
      data: incomplete.map((c) => ({ contact_id: c.sfdc_id, name: `${c.first_name} ${c.last_name}`, missing: [!c.email && 'email', !c.title && 'title', !c.linkedin_url && 'linkedin'].filter(Boolean) })),
    });

    // ── Phase 4: Clay callback (simulated enriched row, fill-only-empty) ──
    const enriched = {
      work_email: 'david.chen@glowrecipe.com',
      email_valid: 'valid' as const,
      personal_email: 'dchen88@gmail.com',
      linkedin_url: 'https://linkedin.com/in/davidchen-demo',
      title: 'Director of Ecommerce',
      provider_used: 'prospeo (via Clay waterfall)',
    };
    const before = await contacts.findOne({ sfdc_id: 'DEMO-C-002' });
    const updates: Partial<ContactDoc> = {
      email_valid: enriched.email_valid,
      clay_last_run: now,
      work_email_provider: enriched.provider_used,
      updated_at: now,
    };
    if (!before?.email) { updates.email = enriched.work_email; updates.work_email = enriched.work_email; }
    if (!before?.title) updates.title = enriched.title;
    if (!before?.linkedin_url) updates.linkedin_url = enriched.linkedin_url;
    if (!before?.personal_email) updates.personal_email = enriched.personal_email;
    await contacts.updateOne({ sfdc_id: 'DEMO-C-002' }, { $set: updates });
    trace.push({
      phase: '4. clay callback (fill-only-empty)',
      detail: 'David Chen enriched — only blank fields were written; in live mode Email/Title also mirror back to the Salesforce contact',
      data: { filled: Object.keys(updates).filter((k) => !['updated_at', 'clay_last_run'].includes(k)) },
    });

    // ── Phase 5: LeadIQ champion tracking detects a job change ───────────
    const signalDocs: SignalDoc[] = [
      {
        signal_key: 'DEMO-SIG-champion-left',
        account_sfdc_id: 'DEMO-ACCT-001',
        contact_sfdc_id: 'DEMO-C-001',
        account_name: 'Glow Recipe (Demo)',
        contact_name: 'Sarah Kim',
        signal_type: 'job_change_new_company',
        severity: 'critical',
        summary: 'Sarah Kim left Glow Recipe and is now VP Lifecycle at Rhode Skin',
        previous_value: 'Glow Recipe',
        new_value: 'Rhode Skin',
        source: 'leadiq',
        csm_email: 'huzaifa.tofeeq.ctr@postscript.io',
        detected_at: now,
        sfdc_task_id: null,
        dismissed: false,
        dismissed_at: null,
        relevance: null,
        created_at: now,
      },
      {
        signal_key: 'DEMO-SIG-title-change',
        account_sfdc_id: 'DEMO-ACCT-001',
        contact_sfdc_id: 'DEMO-C-002',
        account_name: 'Glow Recipe (Demo)',
        contact_name: 'David Chen',
        signal_type: 'job_change_new_title',
        severity: 'warning',
        summary: 'David Chen changed title from Director of Ecommerce to VP of Digital',
        previous_value: 'Director of Ecommerce',
        new_value: 'VP of Digital',
        source: 'leadiq',
        csm_email: 'huzaifa.tofeeq.ctr@postscript.io',
        detected_at: now,
        sfdc_task_id: null,
        dismissed: false,
        dismissed_at: null,
        relevance: null,
        created_at: now,
      },
      {
        signal_key: 'DEMO-SIG-new-stakeholder',
        account_sfdc_id: 'DEMO-ACCT-001',
        contact_sfdc_id: null,
        account_name: 'Glow Recipe (Demo)',
        contact_name: 'Priya Patel',
        signal_type: 'new_stakeholder',
        severity: 'warning',
        summary: 'Priya Patel — Head of Retention at Glow Recipe is not in the CRM',
        previous_value: '',
        new_value: 'Head of Retention',
        source: 'apollo',
        csm_email: 'huzaifa.tofeeq.ctr@postscript.io',
        detected_at: now,
        sfdc_task_id: null,
        dismissed: false,
        dismissed_at: null,
        relevance: null,
        created_at: now,
      },
    ];

    const emitted: string[] = [];
    let slackSent = 0;
    for (const doc of signalDocs) {
      try {
        await signals.insertOne({ ...doc });
        emitted.push(`${doc.severity.toUpperCase()}: ${doc.summary}`);
      } catch (e) {
        if (isDuplicateKeyError(e)) { emitted.push(`deduped (already exists): ${doc.signal_key}`); continue; }
        throw e;
      }
      try {
        await notifications.insertOne({ signal_key: doc.signal_key, notified_at: now, channel: 'slack-webhook' });
        const ok = await notifySlack({
          signal_key: doc.signal_key,
          account_name: doc.account_name ?? '',
          contact_name: doc.contact_name ?? '',
          signal_type: doc.signal_type,
          severity: doc.severity,
          summary: doc.summary,
          previous_value: doc.previous_value ?? '',
          new_value: doc.new_value ?? '',
          source: doc.source,
          csm_email: doc.csm_email ?? '',
          detected_at: doc.detected_at,
        });
        if (ok) slackSent++;
      } catch (e) {
        if (!isDuplicateKeyError(e)) throw e;
      }
    }
    trace.push({
      phase: '5. signal engine (LeadIQ + Apollo simulated)',
      detail: `Signals stored with signal_key dedup. Salesforce Task mirroring is SKIPPED in dry-run (would create real Tasks). Slack ${process.env.SLACK_WEBHOOK_URL ? `sent for ${slackSent} new signal(s)` : 'skipped — SLACK_WEBHOOK_URL not set'}.`,
      data: emitted,
    });

    // ── Phase 6: dashboard read model ────────────────────────────────────
    const openSignals = await signals.find({ account_sfdc_id: 'DEMO-ACCT-001', dismissed: false }).toArray();
    const critical = openSignals.filter((s) => s.severity === 'critical').length;
    const warning = openSignals.filter((s) => s.severity === 'warning').length;
    const score = Math.max(0, 100 - critical * 40 - warning * 15);
    trace.push({
      phase: '6. dashboard',
      detail: `Health score for Glow Recipe (Demo): ${score}/100 (${critical} critical, ${warning} warning). Now visible on /, /signals and /contacts. Dismiss or rate signals there — that is the feedback loop.`,
    });

    await logRun({
      workflow_name: 'dry-run',
      items_in: rawContacts.length,
      items_skipped_junk: gate.filter((g) => g.includes('JUNK')).length,
      items_processed: signalDocs.length,
      errors: 0,
      notes: 'demo pipeline walkthrough (cleanup with ?cleanup=1)',
    });

    return NextResponse.json({ ok: true, trace, cleanup: 'add ?cleanup=1 to remove all DEMO- data' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('dry-run failed:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
