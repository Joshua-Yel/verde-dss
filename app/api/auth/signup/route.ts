import { NextResponse } from 'next/server';
import { supabaseServer } from '@/src/lib/supabaseServer';

async function resolveSingleExistingBusinessId() {
  const { data, error } = await supabaseServer.from('businesses').select('id').limit(2);
  if (error || !data || data.length !== 1) {
    return null;
  }

  return data[0]?.id ?? null;
}

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Salon name, email, and password are required.' }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseServer.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        salon_name: name,
      },
    });

    if (authError || !authData?.user) {
      return NextResponse.json({ error: authError?.message ?? 'Unable to create account.' }, { status: 400 });
    }

    const assignedBusinessId = await resolveSingleExistingBusinessId();

    try {
      await supabaseServer.from('user_profiles').upsert(
        {
          id: authData.user.id,
          email,
          salon_name: name,
          role: 'user',
          is_admin: false,
          is_active: true,
          workspace_id: assignedBusinessId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
    } catch {
      // Best effort: preserve signup even if profile table is unavailable.
    }

    if (assignedBusinessId) {
      try {
        const nextUserMetadata = {
          ...(authData.user.user_metadata ?? {}),
          salon_name: name,
          business_id: assignedBusinessId,
          workspace_id: assignedBusinessId,
        };

        await supabaseServer.auth.admin.updateUserById(authData.user.id, {
          user_metadata: nextUserMetadata,
        });
      } catch {
        // Continue even if auth metadata sync fails.
      }

      try {
        await supabaseServer.from('workspace_members').upsert(
          {
            workspace_id: assignedBusinessId,
            user_id: authData.user.id,
            role: 'user',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,user_id' }
        );
      } catch {
        // Best effort only.
      }
    }

    return NextResponse.json({ success: true, user: authData.user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected signup error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
