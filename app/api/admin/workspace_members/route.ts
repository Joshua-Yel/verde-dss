import { NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/src/lib/adminAccess';
import { supabaseServer } from '@/src/lib/supabaseServer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const allowed = await isCurrentUserAdmin();
    if (!allowed) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });

    const payload = await request.json();
    const workspaceId = typeof payload?.workspaceId === 'string' ? payload.workspaceId : null;
    const userIds = Array.isArray(payload?.userIds) ? payload.userIds.filter((id: unknown): id is string => typeof id === 'string') : [];

    if (!workspaceId || userIds.length === 0) {
      return NextResponse.json({ error: 'workspaceId and userIds are required.' }, { status: 400 });
    }

    const rows = userIds.map((userId: string) => ({
      workspace_id: workspaceId,
      user_id: userId,
      role: 'user',
      is_active: true,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabaseServer.from('workspace_members').upsert(rows, { onConflict: 'workspace_id,user_id' });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: rows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
