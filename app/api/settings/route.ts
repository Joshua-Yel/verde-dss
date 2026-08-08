import { NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/src/lib/supabaseRoute";
import { getUserRole } from "@/src/lib/roleAccess";
import { getAssignedBusinessId } from "@/src/lib/businessAccess";

function normalizeUserRole(role: unknown) {
  return typeof role === "string" ? role.trim().toLowerCase() : "user";
}

type MemberPayload = {
  id?: string | null;
  role?: string | null;
  is_active?: boolean | null;
};

async function getBusinessContext(
  supabase: Awaited<ReturnType<typeof createSupabaseRouteClient>>,
  user: { id: string } | null
) {
  const businessId =
    getAssignedBusinessId(
      user as {
        app_metadata?: Record<string, unknown>;
        user_metadata?: Record<string, unknown>;
        id?: string;
      } | null
    ) ??
    (
      await supabase
        .from("user_profiles")
        .select("workspace_id")
        .eq("id", user?.id ?? "")
        .limit(1)
        .maybeSingle()
    )?.data?.workspace_id;

  if (!businessId) {
    return { businessId: null, business: null };
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("id,name,currency,settings")
    .eq("id", businessId)
    .maybeSingle();

  if (businessError) {
    throw new Error(businessError.message);
  }

  return { businessId, business };
}

export async function GET() {
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

    const { businessId, business } = await getBusinessContext(supabase, user);

    if (!businessId || !business) {
      return NextResponse.json({ error: "No active business found for this account." }, { status: 400 });
    }

    // Configuration only — never load services, inventory, or daily operations.
    const { data: members, error: membersError } = await supabase
      .from("workspace_members")
      .select("workspace_id,user_id,role,is_active")
      .eq("workspace_id", businessId)
      .order("created_at", { ascending: false });

    if (membersError) {
      throw new Error(membersError.message);
    }

    const memberIds = (members ?? []).map((member) => member.user_id).filter(Boolean);
    const { data: memberUsers } =
      memberIds.length > 0
        ? await supabase
            .from("user_profiles")
            .select("id,email,full_name,role,is_active")
            .in("id", memberIds)
        : { data: [] };

    const users = (members ?? []).map((member) => {
      const profile = (memberUsers ?? []).find((userRow) => userRow.id === member.user_id) ?? null;
      return {
        id: member.user_id,
        email: profile?.email ?? "unknown-user@example.com",
        full_name: profile?.full_name ?? "Unknown user",
        role: member.role,
        is_active: member.is_active,
      };
    });

    return NextResponse.json({
      business: {
        id: business.id,
        name: business.name,
        currency: business.currency,
      },
      settings: business.settings ?? {},
      users,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
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

    const { businessId, business } = await getBusinessContext(supabase, user);

    if (!businessId || !business) {
      return NextResponse.json({ error: "No active business found for this account." }, { status: 400 });
    }

    // Persist configuration only.
    const settingsBlob =
      typeof payload.settings === "object" && payload.settings !== null ? payload.settings : {};
    const nextSettings = { ...((business.settings as Record<string, unknown>) ?? {}), ...settingsBlob };
    const nextBusinessName =
      typeof payload.business?.name === "string" && payload.business.name.trim()
        ? payload.business.name.trim()
        : business.name;
    const nextCurrency =
      typeof payload.business?.currency === "string" && payload.business.currency.trim()
        ? payload.business.currency.trim()
        : business.currency;

    const { error: businessError } = await supabase
      .from("businesses")
      .update({
        name: nextBusinessName,
        currency: nextCurrency,
        settings: nextSettings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", businessId);

    if (businessError) {
      throw new Error(businessError.message);
    }

    // Role updates: UPDATE existing memberships only (no upsert INSERT).
    // This avoids "new row violates row-level security policy" on workspace_members.
    const users = Array.isArray(payload.users) ? (payload.users as MemberPayload[]) : [];
    for (const member of users) {
      const userId = String(member?.id ?? "").trim();
      if (!userId) continue;

      const nextRole = normalizeUserRole(member?.role);
      const nextActive = Boolean(member?.is_active ?? true);
      const now = new Date().toISOString();

      const { data: updatedRows, error: memberError } = await supabase
        .from("workspace_members")
        .update({
          role: nextRole,
          is_active: nextActive,
          updated_at: now,
        })
        .eq("workspace_id", businessId)
        .eq("user_id", userId)
        .select("user_id");

      if (memberError) {
        throw new Error(memberError.message);
      }

      // If no existing membership row, skip INSERT from the client.
      // New members should be invited through a dedicated invite flow that
      // can satisfy INSERT RLS with a proper invite token / admin path.
      if (!updatedRows || updatedRows.length === 0) {
        continue;
      }

      // Keep profile role in sync (UPDATE only — profiles are created by auth trigger).
      const { error: profileError } = await supabase
        .from("user_profiles")
        .update({
          role: nextRole,
          is_active: nextActive,
          workspace_id: businessId,
          updated_at: now,
        })
        .eq("id", userId);

      if (profileError) {
        // Non-fatal: membership was updated; profile sync may lag.
        console.warn("[settings] profile role sync failed:", profileError.message);
      }
    }

    return NextResponse.json({ success: true, businessId, settings: nextSettings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}