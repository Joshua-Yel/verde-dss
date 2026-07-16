import { NextResponse } from 'next/server';
import { isCurrentUserAdmin, listBusinesses, createBusiness, updateBusinessOwner } from '@/src/lib/adminAccess';

export async function GET() {
  try {
    const allowed = await isCurrentUserAdmin();
    if (!allowed) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const businesses = await listBusinesses();
    return NextResponse.json(businesses);
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
    const name = typeof payload?.name === 'string' ? payload.name.trim() : '';

    if (!name) {
      return NextResponse.json({ error: 'A project name is required.' }, { status: 400 });
    }

    const result = await createBusiness(name);
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
    const businessId = typeof payload?.businessId === 'string' ? payload.businessId : '';
    const ownerId = typeof payload?.ownerId === 'string' ? payload.ownerId : null;

    if (!businessId) {
      return NextResponse.json({ error: 'A project id is required.' }, { status: 400 });
    }

    const result = await updateBusinessOwner(businessId, ownerId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
