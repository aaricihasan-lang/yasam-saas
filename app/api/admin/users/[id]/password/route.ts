import { NextRequest } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { writeAdminAudit, AdminAuditError } from "@/lib/admin/adminAudit";
import {
  requireP2AccountActionTarget,
  ensureTargetExists,
  validateNewPassword,
  revokeAllActiveSessions,
  resolveActorIsMainAdmin,
  readLimitedJsonBody,
  SessionRevokeError,
  SESSION_END_REASON,
  jsonNoStore,
} from "@/lib/admin/accountSessionControls";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/[id]/password — yetkili adminin uzman şifresini sıfırlaması.
 *
 * Sonuç: yeni parola (hash) yazılır + hedefin TÜM oturumları geçersizleştirilir +
 * audit (password_changed_by_admin) yazılır. Yeni parola hiçbir zaman loglanmaz,
 * audit'e/yanıta/hataya yazılmaz.
 *
 * Yetki: self-block (kendi şifreni buradan değiştirme → Ayarlar), admin-hedef yalnız
 * ana yönetici, ana yönetici hedef mutlak korumalı (bkz. requireP2AccountActionTarget).
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;
  if (!id) return jsonNoStore({ ok: false, error: "Kullanıcı ID gerekli." }, 400);

  const body = await readLimitedJsonBody(req);
  if (!body.ok) return jsonNoStore({ ok: false, error: body.error }, body.status);

  // Yetki kapısı (P1 korunur).
  const targetGuard = await requireP2AccountActionTarget(db, adminId, id);
  if (!targetGuard.ok) return jsonNoStore({ ok: false, error: targetGuard.error }, targetGuard.status);

  const exists = await ensureTargetExists(db, id);
  if (!exists.ok) return jsonNoStore({ ok: false, error: exists.error }, exists.status);

  // Parola politikası (repo standardı: min 6). Yeni parola değişkeni yalnız hash'e
  // gider; hiçbir yere loglanmaz.
  const pw = validateNewPassword(body.value.newPassword);
  if (!pw.ok) return jsonNoStore({ ok: false, error: pw.error }, pw.status);

  // Server-side bcrypt hash (pgcrypto RPC).
  const { data: hashResult, error: hashError } = await db.rpc("hash_password", {
    p_plain: pw.value,
  });
  if (hashError || !hashResult) {
    // hashError.message parola DEĞERİ taşımaz.
    return jsonNoStore({ ok: false, error: "Şifre hashlenemedi." }, 500);
  }

  // Parolayı güncelle.
  const { error: updateError } = await db
    .from("users")
    .update({ password_hash: hashResult as string })
    .eq("id", id);
  if (updateError) {
    return jsonNoStore({ ok: false, error: "Şifre güncellenemedi." }, 500);
  }

  // Parola değişti → hedefin TÜM oturumlarını geçersizleştir (eski token çalışamaz).
  // Kısmi başarısızlık: parola değişmiş ama revoke başarısızsa 500 verilir; güvenlik
  // etkisi eksik olduğundan admin tekrar dener (idempotent: aynı parola tekrar yazılır).
  let revokedSessionCount: number;
  try {
    revokedSessionCount = await revokeAllActiveSessions(db, id, SESSION_END_REASON.passwordReset);
  } catch (e) {
    if (e instanceof SessionRevokeError) {
      return jsonNoStore(
        { ok: false, error: "Şifre güncellendi ancak oturumlar kapatılamadı. Lütfen tekrar deneyin." },
        500,
      );
    }
    throw e;
  }

  // Audit — parola/secret İÇERMEZ (yalnız güvenli teknik özet).
  try {
    const actorIsMainAdmin = await resolveActorIsMainAdmin(db, adminId);
    await writeAdminAudit(db, {
      actorAdminId: adminId,
      action: "password_changed_by_admin",
      targetUserId: id,
      actorIsMainAdmin,
      context: { revoked_session_count: revokedSessionCount },
    });
  } catch (e) {
    if (e instanceof AdminAuditError) {
      return jsonNoStore({ ok: false, error: "İşlem kaydı oluşturulamadı." }, 500);
    }
    throw e;
  }

  return jsonNoStore({ ok: true, revokedSessionCount });
}
