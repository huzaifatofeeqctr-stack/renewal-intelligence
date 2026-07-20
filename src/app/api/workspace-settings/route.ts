import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, isAdminRole } from '@/lib/authn';
import { logUserAction } from '@/lib/user-audit';
import { getWorkspaceSettings, updateWorkspaceSettings, WorkspaceSettings } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await getWorkspaceSettings());
}

// Admin-only: change workspace operational settings.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: 'admin only' }, { status: 403 });
  }
  const patch = (await req.json().catch(() => ({}))) as Partial<WorkspaceSettings>;
  const settings = await updateWorkspaceSettings(patch, user.email);
  await logUserAction(user.email, 'settings.update', `changed: ${Object.keys(patch).join(', ') || 'nothing'}`);
  return NextResponse.json(settings);
}
