import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { jsonNoStore, readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { isUuid } from "@/lib/admin/memberRequestValidation";
import {
  checkPurgeEligibility,
  purgeEmailMatches,
  purgeRpcError,
  purgeTenantStorage,
  PURGE_FINAL_PHRASE,
} from "@/lib/admin/expertPurge";
import { normalizeBulkPhrase } from "@/lib/ui/bulkDeleteGuard";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/admin/users/[id]/purge — ARŞİVDEKİ UZMANI KALICI SİLME (OWNER-ONLY).
 *
 * Body: { adminPassword, confirmEmail, finalPhrase: "KALICI OLARAK SİL" }
 *
 * Güvenlik (sıra bilinçli — normal admin hiçbir hedef bilgisi öğrenmeden 403 alır):
 *   1. verifyAdminRequest (x-admin-id + oturum token'ı, aktif admin)
 *   2. requireMainAdmin → yalnız sistem sahibi (is_super_admin); normal admin/uzman → 403
 *   3. Kendi hesabı → 400 (owner kendini silemez)
 *   4. Hedef arşiv kapsamında mı (expert + approved + active=false, demo değil)
 *   5. Hedef e-postası birebir yazılmış mı + son onay ifadesi
 *   6. Owner parolası server-side (verify_admin_login)
 *   7. admin_purge_archived_expert RPC: tüm kontroller kilit altında YENİDEN yapılır; hesap + tenant
 *      iş verisi TEK transaction'da silinir; append-only denetim kayıtları korunur; audit aynı tx'te.
 *   8. DB COMMIT sonrası tenant Storage dosyaları silinir (hata olursa raporlanır, gizlenmez).
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  const { id } = await ctx.params;

  // Yetki ÖNCE: normal admin hedef hakkında hiçbir şey öğrenmeden reddedilir.
  const main = await requireMainAdmin(db, adminId);
  if (!main.ok) return bad("Kalıcı uzman silme yalnızca sistem sahibine açıktır.", 403);

  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");
  if (id === adminId) return bad("Kendi hesabınızı silemezsiniz.");

  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const body = parsed.value;
  const adminPassword = typeof body.adminPassword === "string" ? body.adminPassword.trim() : "";
  const confirmEmail = typeof body.confirmEmail === "string" ? body.confirmEmail : "";
  const finalPhrase = typeof body.finalPhrase === "string" ? body.finalPhrase : "";
  if (!adminPassword) return bad("Yönetici parolası gerekli.");
  if (normalizeBulkPhrase(finalPhrase) !== normalizeBulkPhrase(PURGE_FINAL_PHRASE)) {
    return bad(`Son onay ifadesi “${PURGE_FINAL_PHRASE}” olmalıdır.`);
  }

  const { data: target, error: targetErr } = await db
    .from("users")
    .select("id, email, role, approval_status, active, is_super_admin, is_demo_account, tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (targetErr) return bad("Kullanıcı okunamadı.", 500);
  if (!target) return bad("Kullanıcı bulunamadı.", 404);

  const eligible = checkPurgeEligibility(target);
  if (!eligible.ok) return bad(eligible.error, eligible.status);
  if (!purgeEmailMatches(confirmEmail, target.email)) return bad("E-posta doğrulaması uyuşmadı.");

  const { data: adminRow } = await db.from("users").select("email").eq("id", adminId).maybeSingle();
  const adminEmail = String(adminRow?.email ?? "").trim().toLowerCase();
  if (!adminEmail) return bad("Admin kaydı bulunamadı.", 403);
  const { data: verified, error: verifyErr } = await db.rpc("verify_admin_login", {
    p_email: adminEmail,
    p_password: adminPassword,
  });
  if (verifyErr || !verified) return bad("Yönetici parolası doğrulanamadı.", 403);

  const { data, error } = await db.rpc("admin_purge_archived_expert", {
    p_user_id: id,
    p_actor_admin_id: adminId,
    p_confirm_email: confirmEmail.trim(),
  });
  if (error) {
    const mapped = purgeRpcError(error);
    return bad(mapped.error, mapped.status);
  }

  const result = (data ?? {}) as {
    tenant_id?: string | null;
    total_rows?: number;
    unsupported_tenant_tables?: string[];
  };
  const storage = result.tenant_id
    ? await purgeTenantStorage(db, String(result.tenant_id))
    : { removed: 0, failures: [] as string[] };

  return jsonNoStore({
    ok: true,
    deletedRows: Number(result.total_rows ?? 0),
    storageRemoved: storage.removed,
    storageFailures: storage.failures.length,
    unsupportedTables: Array.isArray(result.unsupported_tenant_tables) ? result.unsupported_tenant_tables.length : 0,
  });
}
