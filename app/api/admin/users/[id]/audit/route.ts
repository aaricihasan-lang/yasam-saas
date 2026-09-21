import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 50;

/**
 * GET /api/admin/users/[id]/audit
 *
 * Hedef kullanıcının admin_audit_log işlem geçmişini (SALT OKUNUR, metadata-only) döner.
 * Üye detayı bu kayıttan "onaylayan yönetici + onay tarihi" ve "pasife alan yönetici +
 * tarih" bilgilerini türetir. admin_audit_log YALNIZ service_role erişimlidir; bu kapı
 * verifyAdminRequest (admin + aktif + token binding) ile korunur. PII/secret bu tabloya
 * zaten yazılmaz (assertAuditFieldSafe). Yazma YOK.
 */
export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { id } = await ctx.params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Geçerli kullanıcı ID gerekli." }, { status: 400 });
  }

  const { data, error } = await db
    .from("admin_audit_log")
    .select("id, action, actor_admin_id, actor_is_main_admin, created_at, old_value, new_value, context")
    .eq("target_user_id", id)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  // Aktör adlarını çöz (id → ad). Tek sorgu; PII değil, yönetimsel gösterim.
  const actorIds = Array.from(
    new Set(
      rows
        .map((r) => (r.actor_admin_id != null ? String(r.actor_admin_id) : ""))
        .filter((v) => v !== ""),
    ),
  );

  const actorNameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actors } = await db
      .from("users")
      .select("id, full_name, email")
      .in("id", actorIds);
    for (const a of (actors ?? []) as Record<string, unknown>[]) {
      const aid = a.id != null ? String(a.id) : "";
      if (!aid) continue;
      const name = String(a.full_name ?? "").trim() || String(a.email ?? "").trim();
      actorNameById.set(aid, name);
    }
  }

  const result = rows.map((r) => {
    const actorAdminId = r.actor_admin_id != null ? String(r.actor_admin_id) : null;
    return {
      id: r.id != null ? String(r.id) : "",
      action: r.action != null ? String(r.action) : "",
      actorAdminId,
      actorName: actorAdminId ? actorNameById.get(actorAdminId) ?? null : null,
      actorIsMainAdmin: r.actor_is_main_admin === true,
      createdAt: r.created_at != null ? String(r.created_at) : null,
      oldValue: r.old_value ?? null,
      newValue: r.new_value ?? null,
      context: r.context ?? null,
    };
  });

  return NextResponse.json({ ok: true, rows: result });
}
