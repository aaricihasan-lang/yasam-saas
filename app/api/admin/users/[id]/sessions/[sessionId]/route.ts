import { NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { writeAdminAudit, AdminAuditError } from "@/lib/admin/adminAudit";
import {
  requireP2AccountActionTarget,
  resolveActorIsMainAdmin,
  jsonNoStore,
} from "@/lib/admin/accountSessionControls";
import { isUuid } from "@/lib/admin/memberRequestValidation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

/**
 * PATCH /api/admin/users/[id]/sessions/[sessionId]
 * Admin tarafından belirli bir kullanıcı oturumunu sonlandırır.
 * Kullanıcı eski cihazda max 60 saniye içinde login ekranına düşer (useSessionGuard).
 *
 * AŞAMA 2 · P1-7 sertleştirme:
 *   - Her iki ID UUID doğrulanır (400).
 *   - requireP2AccountActionTarget: kendi oturumunu bu ekrandan kapatma yok; admin hedef
 *     yalnız ana yönetici; ana yönetici hedef MUTLAK korumalı (403).
 *   - Tek atomik UPDATE (is_active=true koşullu) → yarışta çift sonlandırma/yanlış sayım yok.
 *   - Audit `single_session_terminated` (fail-closed; yalnız teknik özet, token/IP YOK).
 *   - Ham DB hatası istemciye dönmez (generic mesaj).
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id, sessionId } = await ctx.params;
  if (!isUuid(id) || !isUuid(sessionId)) {
    return jsonNoStore({ ok: false, error: "Geçersiz kullanıcı veya oturum ID." }, 400);
  }

  const targetGuard = await requireP2AccountActionTarget(db, adminId, id);
  if (!targetGuard.ok) return jsonNoStore({ ok: false, error: targetGuard.error }, targetGuard.status);

  // Oturumun bu kullanıcıya ait olduğunu doğrula
  const { data: session, error: readErr } = await db
    .from("user_sessions")
    .select("id, user_id, is_active")
    .eq("id", sessionId)
    .eq("user_id", id)
    .maybeSingle();

  if (readErr) return jsonNoStore({ ok: false, error: "Oturum okunamadı." }, 500);
  if (!session) return jsonNoStore({ ok: false, error: "Oturum bulunamadı." }, 404);
  if (!session.is_active) return jsonNoStore({ ok: false, error: "Oturum zaten kapalı." }, 409);

  const { data: revoked, error } = await db
    .from("user_sessions")
    .update({
      is_active:  false,
      ended_at:   new Date().toISOString(),
      end_reason: "admin_terminated",
    })
    .eq("id", sessionId)
    .eq("user_id", id)
    .eq("is_active", true)
    .select("id");

  if (error) return jsonNoStore({ ok: false, error: "Oturum sonlandırılamadı." }, 500);
  const revokedCount = Array.isArray(revoked) ? revoked.length : 0;
  if (revokedCount === 0) return jsonNoStore({ ok: false, error: "Oturum zaten kapalı." }, 409);

  // Audit (fail-closed): oturum zaten kapandı (güvenlik yönünde kalıcı); audit hatası 500 döner.
  try {
    const actorIsMainAdmin = await resolveActorIsMainAdmin(db, adminId);
    await writeAdminAudit(db, {
      actorAdminId: adminId,
      action: "single_session_terminated",
      targetUserId: id,
      actorIsMainAdmin,
      context: { revoked_session_count: revokedCount },
    });
  } catch (e) {
    if (e instanceof AdminAuditError) {
      return jsonNoStore({ ok: false, error: "İşlem kaydı oluşturulamadı." }, 500);
    }
    throw e;
  }

  return jsonNoStore({ ok: true, revokedSessionCount: revokedCount });
}
