import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/src/lib/supabaseRoute";
import { getUserRole } from "@/src/lib/roleAccess";
import { getAssignedBusinessId } from "@/src/lib/businessAccess";

/**
 * Resettable business data for re-import workflows.
 * Businesses, workspaces, roles, and audit history are kept intact.
 */
const OPERATIONAL_TABLES = [
  "daily_operations",
  "service_sales",
  "inventory_records",
  "expenses",
  "imports",
  "raw_imports",
  "services",
  "inventory_items",
] as const;

const FORECAST_TABLES = ["forecast_snapshots"] as const;

const SAFE_RESET_TABLES = [...OPERATIONAL_TABLES, ...FORECAST_TABLES] as const;

const NEVER_DELETE = new Set([
  "businesses",
  "workspace_members",
  "user_profiles",
  "audit_logs",
]);

type ResetAction = "operational" | "forecast" | "everything";

function isResetAction(value: unknown): value is ResetAction {
  return value === "operational" || value === "forecast" || value === "everything";
}

async function resolveBusinessId(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteClient>>,
  user: { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }
) {
  return (
    getAssignedBusinessId(user) ??
    (
      await supabase
        .from("user_profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .limit(1)
        .maybeSingle()
    )?.data?.workspace_id ??
    null
  );
}

async function auditResetAction(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteClient>>,
  businessId: string,
  userId: string,
  action: string,
  results: Array<{ table: string; status: string; detail?: string }>
) {
  try {
    const payload = {
      business_id: businessId,
      user_id: userId,
      action: "settings_reset",
      action_name: action,
      details: {
        route: "/api/settings/reset",
        scope: "transactional-only",
        results,
      },
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("audit_logs").insert(payload);
    if (error) {
      const message = String(error.message ?? "").toLowerCase();
      if (!message.includes("does not exist") && !message.includes("relation")) {
        console.warn("[settings/reset] audit log write failed:", error.message);
      }
    }
  } catch {
    // best effort
  }
}

async function clearTables(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteClient>>,
  businessId: string,
  tableNames: readonly string[]
) {
  const results: Array<{ table: string; status: string; detail?: string }> = [];

  for (const tableName of tableNames) {
    if (NEVER_DELETE.has(tableName)) {
      results.push({ table: tableName, status: "blocked", detail: "protected catalog/config table" });
      continue;
    }

    try {
      // Prefer returning deleted rows so we can detect RLS silent no-ops.
      const { data, error } = await supabase
        .from(tableName)
        .delete()
        .eq("business_id", businessId)
        .select("id");

      if (error) {
        const message = String(error.message ?? "");
        const lower = message.toLowerCase();
        if (lower.includes("does not exist") || lower.includes("relation") || lower.includes("could not find")) {
          results.push({ table: tableName, status: "skipped", detail: "table not present" });
          continue;
        }
        if (lower.includes("row-level security") || lower.includes("rls")) {
          results.push({
            table: tableName,
            status: "rls_blocked",
            detail: message,
          });
          continue;
        }
        results.push({ table: tableName, status: "error", detail: message });
        continue;
      }

      const deletedCount = Array.isArray(data) ? data.length : 0;
      results.push({
        table: tableName,
        status: "cleared",
        detail: `${deletedCount} row(s)`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lower = message.toLowerCase();
      if (lower.includes("does not exist") || lower.includes("relation")) {
        results.push({ table: tableName, status: "skipped", detail: "table not present" });
        continue;
      }
      results.push({ table: tableName, status: "error", detail: message });
    }
  }

  return results;
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = getUserRole(
      user as { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null
    );
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const payload = await request.json().catch(() => ({}));
    const action = typeof payload?.action === "string" ? payload.action : "";
    const confirm = Boolean(payload?.confirm);

    if (!confirm) {
      return NextResponse.json(
        { error: "Confirmation is required before destructive actions." },
        { status: 400 }
      );
    }

    if (action === "delete-business") {
      return NextResponse.json(
        {
          error:
            "Business deletion is disabled on this route. Use a separate admin-only workflow with full confirmation and a backup before removing the business account.",
        },
        { status: 400 }
      );
    }

    if (!isResetAction(action)) {
      return NextResponse.json({ error: "Unsupported reset action." }, { status: 400 });
    }

    const businessId = await resolveBusinessId(
      supabase,
      user as { id: string; app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }
    );

    if (!businessId) {
      return NextResponse.json(
        { error: "No active business was found for this account." },
        { status: 400 }
      );
    }

    let results: Array<{ table: string; status: string; detail?: string }> = [];
    let message: string;

    switch (action) {
      case "operational": {
        results = await clearTables(supabase, businessId, OPERATIONAL_TABLES);
        message =
          "Operational data clear finished. Services and inventory were also reset as part of the re-import workflow, while business identity and roles were left intact.";
        break;
      }
      case "forecast": {
        results = await clearTables(supabase, businessId, FORECAST_TABLES);
        message = "Forecast snapshot clear finished. Operational history and catalog were left intact.";
        break;
      }
      case "everything": {
        results = await clearTables(supabase, businessId, SAFE_RESET_TABLES);
        message =
          "Transactional and catalog data clear finished. Business identity, settings, and roles were left intact.";
        break;
      }
    }

    const blocked = results.filter((r) => r.status === "rls_blocked" || r.status === "error");
    if (blocked.length > 0) {
      await auditResetAction(supabase, businessId, user.id, action, results);
      return NextResponse.json(
        {
          error:
            "Some tables could not be cleared. Run the RLS fix migration (006_settings_rls_and_reset_fix.sql) so owner/admin DELETE policies exist.",
          message,
          action,
          results,
          business_id: businessId,
        },
        { status: 500 }
      );
    }

    await auditResetAction(supabase, businessId, user.id, action, results);

    return NextResponse.json({
      message,
      action,
      results,
      business_id: businessId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}