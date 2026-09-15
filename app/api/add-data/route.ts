import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

import { createSupabaseRouteClient } from '@/src/lib/supabaseRoute';
import { resolveBusinessIdForUser } from '@/src/lib/businessAccess';
import supabaseServer from '@/src/lib/supabaseServer';
import {
  validateManualEntry,
  type ManualEntryType,
  type ManualOperationNormalized,
  type ManualInventoryNormalized,
  type ManualExpenseNormalized,
  type ManualStaffingNormalized,
  type ManualServiceNormalized,
} from '@/src/lib/manualEntry';

const revalidateDashboardTag = revalidateTag as unknown as (tag: string) => void;

const VALID_TYPES: ManualEntryType[] = ['operation', 'inventory', 'expense', 'staffing', 'service'];

function revalidateForBusiness(businessId: string) {
  revalidateDashboardTag(`dashboard-data-${businessId}`);
  revalidateDashboardTag('aria-context');
}

async function upsertService(
  businessId: string,
  serviceName: string,
  category: string | null,
  price: number | null
): Promise<{ id: number } | { error: string }> {
  const { data: existingService, error: existingServiceError } = await supabaseServer
    .from('services')
    .select('id')
    .eq('business_id', businessId)
    .ilike('name', serviceName)
    .limit(1)
    .maybeSingle();

  if (existingServiceError) {
    return { error: existingServiceError.message };
  }

  if (existingService?.id) {
    if (category !== null || price !== null) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (category !== null) patch.category = category;
      if (price !== null) patch.price = price;
      await supabaseServer.from('services').update(patch).eq('id', existingService.id);
    }
    return { id: existingService.id };
  }

  const { data: insertedService, error: insertServiceError } = await supabaseServer
    .from('services')
    .insert({
      business_id: businessId,
      name: serviceName,
      category,
      price,
    })
    .select('id')
    .single();

  if (insertServiceError || !insertedService?.id) {
    return { error: insertServiceError?.message || 'Unable to create service.' };
  }

  return { id: insertedService.id };
}

async function handleOperation(businessId: string, normalized: ManualOperationNormalized) {
  const serviceResult = await upsertService(
    businessId,
    normalized.service_name.trim(),
    normalized.category,
    normalized.price
  );
  if ('error' in serviceResult) {
    return NextResponse.json({ error: serviceResult.error }, { status: 500 });
  }

  const baseOperation = {
    business_id: businessId,
    service_id: serviceResult.id,
    date: normalized.date,
    quantity: normalized.quantity,
    revenue: normalized.revenue,
  };

  // time_of_day / hour may already exist on some deployments — try, then fall back.
  const insertPayload = {
    ...baseOperation,
    ...(normalized.time_of_day !== null ? { time_of_day: normalized.time_of_day } : {}),
    ...(normalized.hour !== null ? { hour: normalized.hour } : {}),
  };

  const { error: insertError } = await supabaseServer.from('daily_operations').insert(insertPayload);

  if (insertError) {
    const message = insertError.message ?? '';
    if (/time_of_day|hour/i.test(message)) {
      const { error: fallbackError } = await supabaseServer.from('daily_operations').insert(baseOperation);
      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  // Notes are not a column on daily_operations — store audit side-row in raw_imports (no schema change).
  if (normalized.notes) {
    await supabaseServer.from('raw_imports').insert({
      business_id: businessId,
      filename: `manual-operation-note-${normalized.date}.json`,
      data: [
        {
          entry_type: 'operation_note',
          source: 'manual_entry',
          date: normalized.date,
          service_name: normalized.service_name,
          service_id: serviceResult.id,
          quantity: normalized.quantity,
          revenue: normalized.revenue,
          notes: normalized.notes,
          time_of_day: normalized.time_of_day,
          hour: normalized.hour,
        },
      ],
    });
  }

  revalidateForBusiness(businessId);
  return NextResponse.json({
    message: 'Daily log record saved. It will appear on Overview and Daily Log.',
    type: 'operation',
  });
}

async function handleInventory(businessId: string, normalized: ManualInventoryNormalized) {
  const stock = normalized.stock ?? normalized.closing_stock ?? 0;
  const reorderPoint = normalized.reorder_point ?? 0;
  const unitCost = normalized.unit_cost ?? 0;

  const { data: existing, error: findError } = await supabaseServer
    .from('inventory_items')
    .select('id, stock, name')
    .eq('business_id', businessId)
    .ilike('name', normalized.name)
    .limit(1)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  const previousStock = existing?.stock ?? null;

  if (existing?.id) {
    const { error: updateError } = await supabaseServer
      .from('inventory_items')
      .update({
        supplier: normalized.supplier,
        stock,
        reorder_point: reorderPoint,
        unit_cost: unitCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabaseServer.from('inventory_items').insert({
      business_id: businessId,
      name: normalized.name,
      supplier: normalized.supplier,
      stock,
      reorder_point: reorderPoint,
      unit_cost: unitCost,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const hasMovement =
    normalized.month ||
    normalized.purchased !== null ||
    normalized.used !== null ||
    normalized.opening_stock !== null ||
    normalized.closing_stock !== null ||
    normalized.notes;

  if (hasMovement) {
    const month = normalized.month ?? new Date().toISOString().slice(0, 7);

    const movementRow = {
      product_name: normalized.name,
      'Product Name': normalized.name,
      product: normalized.name,
      name: normalized.name,
      month,
      Month: month,
      opening_stock: normalized.opening_stock ?? null,
      'Opening Stock': normalized.opening_stock ?? null,
      purchased: normalized.purchased ?? null,
      Purchased: normalized.purchased ?? null,
      used: normalized.used ?? null,
      Used: normalized.used ?? null,
      closing_stock: normalized.closing_stock ?? stock,
      'Closing Stock': normalized.closing_stock ?? stock,
      supplier: normalized.supplier,
      Supplier: normalized.supplier,
      reorder_point: reorderPoint,
      'Reorder Point': reorderPoint,
      unit_cost: unitCost,
      'Unit Cost': unitCost,
      notes: normalized.notes,
      source: 'manual_entry',
      entry_type: 'inventory_movement',
    };

    await supabaseServer.from('raw_imports').insert({
      business_id: businessId,
      filename: `manual-inventory-${month}.json`,
      data: [movementRow],
    });
  }

  revalidateForBusiness(businessId);

  const stockMsg =
    previousStock !== null && previousStock !== stock
      ? ` Stock ${previousStock} → ${stock}.`
      : '';

  return NextResponse.json({
    message: existing?.id
      ? `Inventory item updated.${stockMsg}`
      : 'Inventory item added successfully.',
    type: 'inventory',
    previousStock,
    stock,
  });
}

async function handleExpense(businessId: string, normalized: ManualExpenseNormalized) {
  const expenseRow = {
    date: normalized.date,
    Date: normalized.date,
    category: normalized.category,
    Category: normalized.category,
    amount: normalized.amount,
    'Amount (PHP)': normalized.amount,
    Amount: normalized.amount,
    notes: normalized.notes,
    Notes: normalized.notes,
    vendor: normalized.vendor,
    Vendor: normalized.vendor,
    source: 'manual_entry',
    entry_type: 'expense',
  };

  const { error } = await supabaseServer.from('raw_imports').insert({
    business_id: businessId,
    filename: `manual-expense-${normalized.date}.json`,
    data: [expenseRow],
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateForBusiness(businessId);
  return NextResponse.json({
    message: 'Expense recorded. It will appear on Financials and net-income charts.',
    type: 'expense',
  });
}

async function handleStaffing(businessId: string, normalized: ManualStaffingNormalized) {
  const staffRow = {
    date: normalized.date,
    Date: normalized.date,
    staff_name: normalized.staff_name,
    Staff_Name: normalized.staff_name,
    'Staff Name': normalized.staff_name,
    role: normalized.role,
    Role: normalized.role,
    hours_worked: normalized.hours_worked,
    Hours_Worked: normalized.hours_worked,
    shift: normalized.shift,
    Shift: normalized.shift,
    notes: normalized.notes,
    Notes: normalized.notes,
    entry_type: 'staffing',
    source: 'manual_entry',
  };

  const { error } = await supabaseServer.from('raw_imports').insert({
    business_id: businessId,
    filename: `manual-staffing-${normalized.date}.json`,
    data: [staffRow],
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateForBusiness(businessId);
  return NextResponse.json({
    message:
      'Staffing log saved (audit). Peak-hour plans still use service-demand forecasts on the Staffing page.',
    type: 'staffing',
  });
}

async function handleService(businessId: string, normalized: ManualServiceNormalized) {
  const result = await upsertService(businessId, normalized.name, normalized.category, normalized.price);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  revalidateForBusiness(businessId);
  return NextResponse.json({
    message: 'Service catalog entry saved. You can now log sessions under Daily Log.',
    type: 'service',
  });
}

export async function POST(request: Request) {
  try {
    const routeClient = await createSupabaseRouteClient();
    const {
      data: { user },
    } = await routeClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'You must be signed in to add data.' }, { status: 401 });
    }

    const body = await request.json();
    const rawType = typeof body.type === 'string' ? body.type : 'operation';
    const type = (VALID_TYPES.includes(rawType as ManualEntryType) ? rawType : 'operation') as ManualEntryType;

    const validation = validateManualEntry(type, body);
    if (validation.errors.length > 0) {
      return NextResponse.json(
        { error: validation.errors.join(' '), fieldErrors: validation.fieldErrors },
        { status: 400 }
      );
    }

    const businessId = await resolveBusinessIdForUser(supabaseServer, user);
    if (!businessId) {
      return NextResponse.json({ error: 'No workspace is associated with this account yet.' }, { status: 404 });
    }

    switch (type) {
      case 'operation':
        return handleOperation(businessId, validation.normalized as unknown as ManualOperationNormalized);
      case 'inventory':
        return handleInventory(businessId, validation.normalized as unknown as ManualInventoryNormalized);
      case 'expense':
        return handleExpense(businessId, validation.normalized as unknown as ManualExpenseNormalized);
      case 'staffing':
        return handleStaffing(businessId, validation.normalized as unknown as ManualStaffingNormalized);
      case 'service':
        return handleService(businessId, validation.normalized as unknown as ManualServiceNormalized);
      default:
        return NextResponse.json({ error: 'Unknown entry type.' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to add data.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
