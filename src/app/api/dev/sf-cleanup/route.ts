import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/auth';
import { soql, sfFetch } from '@/lib/salesforce';

export const dynamic = 'force-dynamic';

// ONE-TIME cleanup of writes this app previously made to Salesforce, before
// the read-only policy. GET reports; POST ?confirm=1 deletes the
// '[Renewal Signal]' Tasks we created. Contact field fills are REPORTED only
// (reverting can't be attributed field-by-field safely, so a human decides).
// This endpoint is removed after the cleanup run.

interface SfTask {
  Id: string;
  Subject: string;
  CreatedDate: string;
  WhatId: string | null;
  WhoId: string | null;
}

async function findOurTasks(): Promise<SfTask[]> {
  return soql<SfTask>(
    "SELECT Id, Subject, CreatedDate, WhatId, WhoId FROM Task WHERE Subject LIKE '[Renewal Signal]%'"
  );
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const tasks = await findOurTasks();
  const touchedContacts = await soql(
    "SELECT Id, FirstName, LastName, Email, Title, LastModifiedDate FROM Contact WHERE LastModifiedDate >= 2026-07-08T00:00:00Z ORDER BY LastModifiedDate DESC LIMIT 200"
  );
  return NextResponse.json({
    tasks_to_delete: tasks.length,
    tasks: tasks.map((t) => ({ id: t.Id, subject: t.Subject.slice(0, 80), created: t.CreatedDate })),
    contacts_modified_in_write_window: touchedContacts,
    note: 'POST ?confirm=1 deletes the tasks. Contact fills are report-only — review the list.',
  });
}

export async function POST(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (req.nextUrl.searchParams.get('confirm') !== '1') {
    return NextResponse.json({ error: 'add ?confirm=1 to delete' }, { status: 400 });
  }

  const tasks = await findOurTasks();
  let deleted = 0;
  const failures: string[] = [];
  for (const t of tasks) {
    const res = await sfFetch(`/services/data/v60.0/sobjects/Task/${t.Id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) deleted++;
    else failures.push(`${t.Id}: ${res.status} ${(await res.text()).slice(0, 120)}`);
  }
  return NextResponse.json({ found: tasks.length, deleted, failures });
}
