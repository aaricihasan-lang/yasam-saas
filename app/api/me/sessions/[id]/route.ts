import { NextRequest } from "next/server";
import { jsonNoStore, verifySelfSessionRequest } from "@/lib/auth/sessionModel";
import { isUuid } from "@/lib/admin/memberRequestValidation";
import { writeAdminAudit } from "@/lib/admin/adminAudit";
import { resolveActorIsMainAdmin } from "@/lib/admin/accountSessionControls";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/me/sessions/[id] — "Bu oturumu kapat" (kayıp telefon dahil).
 * Yalnız KENDİ oturumu (sahiplik RPC'de token sahibine bağlı: revoke_own_session).
 * Admin için audit own_session_terminated (fail-closed); herkes için güvenlik olayı.
 */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  const { db, userId, token, role } = guard;

  const { id } = await ctx.params;
  if (!isUuid(id)) return jsonNoStore({ ok: false, error: "Geçersiz oturum." }, 400);

  const { data, error } = await db.rpc("revoke_own_session", { p_actor_token: token, p_session_id: id });
  if (error) return jsonNoStore({ ok: false, error: "Oturum kapatılamadı." }, 500);
  const res = (data ?? {}) as { ok?: boolean; code?: string; user_id?: string; was_current?: boolean };
  if (!res.ok) {
    return jsonNoStore({ ok: false, error: res.code === "not_found" ? "Oturum bulunamadı veya zaten kapalı." : "Yetki yok." },
      res.code === "not_found" ? 404 : 403);
  }
  if (res.user_id !== userId) return jsonNoStore({ ok: false, error: "Yetki yok." }, 403);

  try {
    await db.from("security_events").insert({
      user_id: userId,
      event_type: "own_session_terminated",
      severity: "low",
      message: "Kullanıcı kendi oturumlarından birini kapattı.",
      metadata: { was_current: res.was_current === true },
    });
    if (role === "admin") {
      const actorIsMainAdmin = await resolveActorIsMainAdmin(db, userId);
      await writeAdminAudit(db, {
        actorAdminId: userId,
        action: "own_session_terminated",
        targetUserId: userId,
        actorIsMainAdmin,
        context: { was_current: res.was_current === true },
      });
    }
  } catch {
    return jsonNoStore({ ok: false, error: "Oturum kapatıldı ancak denetim kaydı yazılamadı." }, 500);
  }
  return jsonNoStore({ ok: true, wasCurrent: res.was_current === true });
}
