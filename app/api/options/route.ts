import { NextResponse } from 'next/server';

import { createSupabaseRouteClient } from '@/src/lib/supabaseRoute';
import { resolveBusinessIdForUser } from '@/src/lib/businessAccess';
import supabaseServer from '@/src/lib/supabaseServer';

/**
 * GET /api/add-data/options
 * Returns distinct labels for autocomplete — no schema changes required.
 */
export async function GET() {
  try {
    const routeClient = await createSupabaseRouteClient();
    const {
      data: { user },
    } = await routeClient.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const businessId = await resolveBusinessIdForUser(supabaseServer, user);
    if (!businessId) {
      return NextResponse.json({
        services: [],
        products: [],
        serviceCategories: [],
        expenseCategories: [],
        suppliers: [],
        staffNames: [],
        roles: [],
      });
    }

    const [servicesRes, inventoryRes, importsRes] = await Promise.all([
      supabaseServer
        .from('services')
        .select('name, category, price')
        .eq('business_id', businessId)
        .order('name')
        .range(0, 1999),
      supabaseServer
        .from('inventory_items')
        .select('name, supplier, stock, reorder_point, unit_cost')
        .eq('business_id', businessId)
        .order('name')
        .range(0, 1999),
      supabaseServer
        .from('raw_imports')
        .select('data')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .range(0, 199),
    ]);

    const services = (servicesRes.data ?? [])
      .map((row) => ({
        name: String(row.name ?? '').trim(),
        category: row.category ? String(row.category).trim() : null,
        price: typeof row.price === 'number' ? row.price : row.price != null ? Number(row.price) : null,
      }))
      .filter((s) => s.name);

    const products = (inventoryRes.data ?? [])
      .map((row) => ({
        name: String(row.name ?? '').trim(),
        supplier: row.supplier ? String(row.supplier).trim() : null,
        stock: typeof row.stock === 'number' ? row.stock : Number(row.stock ?? 0),
        reorder_point:
          typeof row.reorder_point === 'number' ? row.reorder_point : Number(row.reorder_point ?? 0),
        unit_cost:
          typeof row.unit_cost === 'number' ? row.unit_cost : Number(row.unit_cost ?? 0),
      }))
      .filter((p) => p.name);

    const serviceCategories = Array.from(
      new Set(services.map((s) => s.category).filter((c): c is string => Boolean(c)))
    ).sort((a, b) => a.localeCompare(b));

    const suppliers = Array.from(
      new Set(products.map((p) => p.supplier).filter((s): s is string => Boolean(s)))
    ).sort((a, b) => a.localeCompare(b));

    const expenseCategories = new Set<string>();
    const staffNames = new Set<string>();
    const roles = new Set<string>();

    for (const payload of importsRes.data ?? []) {
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const rec = row as Record<string, unknown>;

        const cat =
          rec.category ?? rec.Category ?? rec['expense_category'] ?? rec['Expense Category'];
        if (typeof cat === 'string' && cat.trim()) expenseCategories.add(cat.trim());

        // Heuristic: amount-like keys ⇒ expense category already captured
        const staff =
          rec.staff_name ?? rec.Staff_Name ?? rec['Staff Name'] ?? rec.staff ?? rec.Staff;
        if (typeof staff === 'string' && staff.trim()) staffNames.add(staff.trim());

        const role = rec.role ?? rec.Role;
        if (typeof role === 'string' && role.trim()) roles.add(role.trim());
      }
    }

    // Common salon defaults if workspace is empty
    const defaultExpense = ['Rent', 'Utilities', 'Supplies', 'Payroll', 'Marketing', 'Maintenance'];
    for (const d of defaultExpense) expenseCategories.add(d);

    return NextResponse.json({
      services,
      products,
      serviceCategories,
      expenseCategories: Array.from(expenseCategories).sort((a, b) => a.localeCompare(b)),
      suppliers,
      staffNames: Array.from(staffNames).sort((a, b) => a.localeCompare(b)),
      roles: Array.from(roles).sort((a, b) => a.localeCompare(b)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load options.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
