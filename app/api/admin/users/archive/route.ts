import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import { DEACTIVATION_AUDIT_ACTIONS } from "@/lib/admin/membershipActions";

export const runtime = "nodejs";

/**
 * GET /api/admin/users/archive
 *
 * Arşiv görünümü — SALT OKUNUR. Kapsam KESİN: role=expert & approval_status=approved &
 * active=false (pending/rejected/admin HARİÇ → reddedilmiş başvuru arşivdeki onaylı uzmanla
 * karışmaz). İKİNCİ bir users tablosu veya içerik kopyası YOKTUR — mevcut hesap satırları
 * üzerinden türetilir. Her arşiv kaydı için pasife alınma tarih+aktörü admin_audit_log'un
 * EN SON user_deactivated/user_archived kaydından çözülür. Yazma YOK.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { data, error } = await db
    .from("users")
    .select(USERS_SAFE_SELECT)
    .eq("role", "expert")
    .eq("approval_status", "approved")
    .eq("active", false)
    .order("full_name", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const users = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = users
    .map((u) => (u.id != null ? String(u.id) : ""))
    .filter((v) => v !== "");

  // Pasife alınma tarih+aktörü: hedef başına EN SON user_deactivated / user_archived kaydı.
  const deactivations: Record<
    string,
    { at: string | null; byId: string | null; byName: string | null; actorIsMainAdmin: boolean }
  > = {};

  if (ids.length > 0) {
    const { data: auditRows } = await db
      .from("admin_audit_log")
      .select("target_user_id, actor_admin_id, actor_is_main_admin, created_at, action")
      .in("target_user_id", ids)
      .in("action", [...DEACTIVATION_AUDIT_ACTIONS])
      .order("created_at", { ascending: false });

    const actorIds = new Set<string>();
    for (const r of (auditRows ?? []) as unknown as Record<string, unknown>[]) {
      const target = r.target_user_id != null ? String(r.target_user_id) : "";
      if (!target || deactivations[target]) continue; // ilk (en yeni) kazanır
      const actorId = r.actor_admin_id != null ? String(r.actor_admin_id) : null;
      if (actorId) actorIds.add(actorId);
      deactivations[target] = {
        at: r.created_at != null ? String(r.created_at) : null,
        byId: actorId,
        byName: null,
        actorIsMainAdmin: r.actor_is_main_admin === true,
      };
    }

    if (actorIds.size > 0) {
      const { data: actors } = await db
        .from("users")
        .select("id, full_name, email")
        .in("id", Array.from(actorIds));
      const nameById = new Map<string, string>();
      for (const a of (actors ?? []) as unknown as Record<string, unknown>[]) {
        const aid = a.id != null ? String(a.id) : "";
        if (!aid) continue;
        nameById.set(aid, String(a.full_name ?? "").trim() || String(a.email ?? "").trim());
      }
      for (const key of Object.keys(deactivations)) {
        const d = deactivations[key];
        if (d.byId) d.byName = nameById.get(d.byId) ?? null;
      }
    }
  }

  return NextResponse.json({ ok: true, users, deactivations });
}
