import { NextResponse } from 'next/server';
import { saveSupabaseConfig, getSupabaseConfigStatus, getSystemStatus, recordMigrationRun } from '@/src/lib/adminConfig';
import { isCurrentUserAdmin } from '@/src/lib/adminAccess';

export async function GET() {
  try {
    const allowed = await isCurrentUserAdmin();
    if (!allowed) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const [supabaseStatus, systemStatus] = await Promise.all([getSupabaseConfigStatus(), getSystemStatus()]);
    return NextResponse.json({ ...supabaseStatus, ...systemStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const supabaseUrl = typeof payload?.supabaseUrl === 'string' ? payload.supabaseUrl.trim() : '';
    const supabasePublishableKey = typeof payload?.supabasePublishableKey === 'string' ? payload.supabasePublishableKey.trim() : '';
    const supabaseSecretKey = typeof payload?.supabaseSecretKey === 'string' ? payload.supabaseSecretKey.trim() : '';

    if (!supabaseUrl || !supabasePublishableKey || !supabaseSecretKey) {
      return NextResponse.json({ error: 'All Supabase fields are required.' }, { status: 400 });
    }

    const result = await saveSupabaseConfig({ supabaseUrl, supabasePublishableKey, supabaseSecretKey });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const allowed = await isCurrentUserAdmin();
    if (!allowed) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const payload = await request.json();
    if (payload?.action !== 'migrate') {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
    }

    const result = await recordMigrationRun();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
