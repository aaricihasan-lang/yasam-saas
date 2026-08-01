import { NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { writeAdminAudit, AdminAuditError } from "@/lib/admin/adminAudit";
import {
  requireP2AccountActionTarget,
  ensureTargetExists,
  revokeAllActiveSessions,
  resolveActorIsMainAdmin,
  readLimitedJsonBody,
  isLogoutAllConfirmValid,
  SessionRevokeError,
  SESSION_END_REASON,
  jsonNoStore,
} from "@/lib/admin/accountSessionControls";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/[id]/logout-all — hedef kullanıcıyı TÜM cihazlardan çıkarır.
 *
 * Hesap durumu / parola / modül izinleri DEĞİŞMEZ; yalnız aktif oturumlar
 * geçersizleştirilir. İdempotent + deterministik no-op (aktif oturum yoksa
 * revokedSessionCount=0, yine de audit yazılır).
 *
 * Body: { confirm: "ÇIKIŞ YAPTIR" } — sunucu tarafında da doğrulanır.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!id) return jsonNoStore({ ok: false, error: "Kullanıcı ID gerekli." }, 400);

  const body = await readLimitedJsonBody(req);
  if (!body.ok) return jsonNoStore({ ok: false, error: body.error }, body.status);

  // Yetki kapısı: self-block + admin-hedef (ana yönetici) + ana yönetici hedef koruması.
  const targetGuard = await requireP2AccountActionTarget(db, adminId, id);
  if (!targetGuard.ok) return jsonNoStore({ ok: false, error: targetGuard.error }, targetGuard.status);

  const exists = await ensureTargetExists(db, id);
  if (!exists.ok) return jsonNoStore({ ok: false, error: exists.error }, exists.status);

  // İkinci onay: tam metin (baş/son boşluk kırpılır, harf toleransı YOK).
  if (!isLogoutAllConfirmValid(body.value.confirm)) {
    return jsonNoStore(
      { ok: false, error: `Onay için tam olarak "ÇIKIŞ YAPTIR" yazmalısınız.` },
      422,
    );
  }

  // Oturumları geçersizleştir (tek atomik UPDATE; deterministik sayım).
  let revokedSessionCount: number;
  try {
    revokedSessionCount = await revokeAllActiveSessions(db, id, SESSION_END_REASON.logoutAll);
  } catch (e) {
    if (e instanceof SessionRevokeError) {
      return jsonNoStore({ ok: false, error: "Oturumlar kapatılamadı." }, 500);
    }
    throw e;
  }

  // Audit (fail-closed). Güvenlik etkisi zaten kalıcı; audit hatası 500 verir ama
  // oturumlar kapalı kalır (fail-closed-toward-security), retry idempotenttir.
  try {
    const actorIsMainAdmin = await resolveActorIsMainAdmin(db, adminId);
    await writeAdminAudit(db, {
      actorAdminId: adminId,
      action: "all_sessions_terminated",
      targetUserId: id,
      actorIsMainAdmin,
      context: { revoked_session_count: revokedSessionCount },
    });
  } catch (e) {
    if (e instanceof AdminAuditError) {
      return jsonNoStore(
        { ok: false, error: "İşlem kaydı oluşturulamadı." },
        500,
      );
    }
    throw e;
  }

  return jsonNoStore({ ok: true, revokedSessionCount });
}
