import { NextResponse } from 'next/server';
import { supabaseServer } from '@/src/lib/supabaseServer';

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

    const { error: profileError } = await supabaseServer
  .from("businesses")
  .insert({
    owner_id: authData.user.id,
    name,
  });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, user: authData.user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected signup error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
