import { NextResponse } from 'next/server';
import { isCurrentUserAdmin, toggleUserAccess, createUserAccount, updateUserRole, listRegisteredUsers } from '@/src/lib/adminAccess';

export async function GET() {
  try {
    const allowed = await isCurrentUserAdmin();
    if (!allowed) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const users = await listRegisteredUsers();
    return NextResponse.json(users);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const allowed = await isCurrentUserAdmin();
    if (!allowed) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const payload = await request.json();
    const email = typeof payload?.email === 'string' ? payload.email.trim() : '';
    const password = typeof payload?.password === 'string' ? payload.password : '';
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
    const role = typeof payload?.role === 'string' ? payload.role : 'user';

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, password, and salon name are required.' }, { status: 400 });
    }

    const result = await createUserAccount({ email, password, name, role });
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
    const userId = typeof payload?.userId === 'string' ? payload.userId : '';
    const suspend = typeof payload?.suspend === 'boolean' ? payload.suspend : undefined;
    const role = typeof payload?.role === 'string' ? payload.role : undefined;

    if (!userId) {
      return NextResponse.json({ error: 'A user id is required.' }, { status: 400 });
    }

    if (typeof suspend === 'boolean') {
      return NextResponse.json(await toggleUserAccess(userId, suspend));
    }

    if (role) {
      return NextResponse.json(await updateUserRole(userId, role));
    }

    return NextResponse.json({ error: 'No action supplied.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
