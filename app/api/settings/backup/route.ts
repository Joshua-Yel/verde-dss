import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/src/lib/supabaseRoute";
import { getUserRole } from "@/src/lib/roleAccess";
import { getAssignedBusinessId } from "@/src/lib/businessAccess";

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = getUserRole(user as { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null);
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const businessId = getAssignedBusinessId(user as { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null) ??
      (await supabase
        .from("user_profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .limit(1)
        .maybeSingle())?.data?.workspace_id;

    if (!businessId) {
      return NextResponse.json({ error: "No active business was found for this account." }, { status: 400 });
    }

    const [services, inventoryItems, operations, rawImports, forecastSnapshots] = await Promise.all([
      supabase.from("services").select("*").eq("business_id", businessId),
      supabase.from("inventory_items").select("*").eq("business_id", businessId),
      supabase.from("daily_operations").select("*").eq("business_id", businessId),
      supabase.from("raw_imports").select("*").eq("business_id", businessId),
      supabase.from("forecast_snapshots").select("*").eq("business_id", businessId),
    ]);

    return NextResponse.json({
      businessId,
      exportedAt: new Date().toISOString(),
      services: services.data ?? [],
      inventory_items: inventoryItems.data ?? [],
      daily_operations: operations.data ?? [],
      raw_imports: rawImports.data ?? [],
      forecast_snapshots: forecastSnapshots.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
