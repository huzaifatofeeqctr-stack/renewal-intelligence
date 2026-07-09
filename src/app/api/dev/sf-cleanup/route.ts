import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/auth';
import { soql } from '@/lib/salesforce';

export const dynamic = 'force-dynamic';

// READ-ONLY audit of writes this app previously made to Salesforce (before
// the read-only policy). Verified 2026-07-09: zero '[Renewal Signal]' Tasks
// exist (task creation had silently failed on permissions), so there is
// nothing to delete. Contact field fills are listed for human review.

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
    note: 'Report only — this app has no Salesforce write paths.',
  });
}
