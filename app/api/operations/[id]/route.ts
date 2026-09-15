import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

import { createSupabaseRouteClient } from '@/src/lib/supabaseRoute';
import { resolveBusinessIdForUser } from '@/src/lib/businessAccess';
import supabaseServer from '@/src/lib/supabaseServer';
import { normalizeDate } from '@/src/lib/dateUtils';
import { normalizeNumber, normalizeText } from '@/src/lib/manualEntry';

const revalidateDashboardTag = revalidateTag as unknown as (tag: string) => void;

function revalidateForBusiness(businessId: string) {
  revalidateDashboardTag(`dashboard-data-${businessId}`);
  revalidateDashboardTag('aria-context');
}

async function assertOwnedOperation(operationId: number, businessId: string) {
  const { data, error } = await supabaseServer
    .from('daily_operations')
    .select('id, business_id, service_id, date, quantity, revenue')
    .eq('id', operationId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (error) return { error: error.message, status: 500 as const };
  if (!data) return { error: 'Record not found.', status: 404 as const };
  return { data };
}

async function resolveServiceId(
  businessId: string,
  serviceName: string,
  category?: string | null,
  price?: number | null
): Promise<{ id: number } | { error: string }> {
  const name = serviceName.trim();
  if (!name) return { error: 'Service name is required.' };

  const { data: existing, error: findError } = await supabaseServer
    .from('services')
    .select('id')
    .eq('business_id', businessId)
    .ilike('name', name)
    .limit(1)
    .maybeSingle();

  if (findError) return { error: findError.message };
  if (existing?.id) return { id: existing.id };

  const { data: inserted, error: insertError } = await supabaseServer
    .from('services')
    .insert({
      business_id: businessId,
      name,
      category: category ?? null,
      price: price ?? null,
    })
    .select('id')
    .single();

  if (insertError || !inserted?.id) {
    return { error: insertError?.message || 'Unable to create service.' };
  }
  return { id: inserted.id };
}

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

async function resolveId(context: RouteContext): Promise<number | null> {
  const params = typeof (context.params as Promise<{ id: string }>).then === 'function'
    ? await (context.params as Promise<{ id: string }>)
    : (context.params as { id: string });
  const id = Number(params.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** PATCH /api/operations/:id — update date, quantity, revenue, and/or service */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const routeClient = await createSupabaseRouteClient();
    const {
      data: { user },
    } = await routeClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const operationId = await resolveId(context);
    if (operationId === null) {
      return NextResponse.json({ error: 'Invalid record id.' }, { status: 400 });
    }

    const businessId = await resolveBusinessIdForUser(supabaseServer, user);
    if (!businessId) {
      return NextResponse.json({ error: 'No workspace associated with this account.' }, { status: 404 });
    }

    const owned = await assertOwnedOperation(operationId, businessId);
    if ('error' in owned && !('data' in owned)) {
      return NextResponse.json({ error: owned.error }, { status: owned.status });
    }

    const body = await request.json();
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.date !== undefined) {
      const date = normalizeDate(body.date);
      if (!date) {
        return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
      }
      patch.date = date;
    }

    if (body.quantity !== undefined) {
      const quantity = normalizeNumber(body.quantity);
      if (quantity === null || quantity < 0) {
        return NextResponse.json({ error: 'Quantity must be a non-negative number.' }, { status: 400 });
      }
      patch.quantity = quantity;
    }

    if (body.revenue !== undefined) {
      const revenue = normalizeNumber(body.revenue);
      if (revenue === null || revenue < 0) {
        return NextResponse.json({ error: 'Revenue must be a non-negative number.' }, { status: 400 });
      }
      patch.revenue = revenue;
    }

    const serviceName = normalizeText(body.service_name ?? body.topService ?? '');
    if (serviceName) {
      const category = normalizeText(body.category) || null;
      const price = body.price !== undefined ? normalizeNumber(body.price) : null;
      const serviceResult = await resolveServiceId(businessId, serviceName, category, price);
      if ('error' in serviceResult) {
        return NextResponse.json({ error: serviceResult.error }, { status: 500 });
      }
      patch.service_id = serviceResult.id;
    }

    if (Object.keys(patch).length <= 1) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const { error: updateError } = await supabaseServer
      .from('daily_operations')
      .update(patch)
      .eq('id', operationId)
      .eq('business_id', businessId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    revalidateForBusiness(businessId);
    return NextResponse.json({ message: 'Record updated successfully.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update record.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/operations/:id — remove a daily operation row */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const routeClient = await createSupabaseRouteClient();
    const {
      data: { user },
    } = await routeClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const operationId = await resolveId(context);
    if (operationId === null) {
      return NextResponse.json({ error: 'Invalid record id.' }, { status: 400 });
    }

    const businessId = await resolveBusinessIdForUser(supabaseServer, user);
    if (!businessId) {
      return NextResponse.json({ error: 'No workspace associated with this account.' }, { status: 404 });
    }

    const owned = await assertOwnedOperation(operationId, businessId);
    if ('error' in owned && !('data' in owned)) {
      return NextResponse.json({ error: owned.error }, { status: owned.status });
    }

    const { error: deleteError } = await supabaseServer
      .from('daily_operations')
      .delete()
      .eq('id', operationId)
      .eq('business_id', businessId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    revalidateForBusiness(businessId);
    return NextResponse.json({ message: 'Record deleted successfully.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete record.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
