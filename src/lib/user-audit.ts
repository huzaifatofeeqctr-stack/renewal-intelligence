import { coll } from './db';

export interface UserAuditDoc {
  at: string;
  user_email: string;
  action: string; // e.g. 'login', 'settings.update', 'signal.dismiss'
  details: string; // human-readable specifics
}

// Append-only trail of user actions, readable only by the superadmin
// (/logs). Never throws — auditing must not break the action being audited.
export async function logUserAction(userEmail: string, action: string, details = ''): Promise<void> {
  try {
    const c = await coll<UserAuditDoc>('user_audit_log');
    await c.insertOne({
      at: new Date().toISOString(),
      user_email: userEmail,
      action,
      details: details.slice(0, 500),
    });
  } catch (e) {
    console.error('user audit log failed:', e);
  }
}
