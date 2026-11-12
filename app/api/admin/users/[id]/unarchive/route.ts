import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { jsonNoStore, readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { isUuid } from "@/lib/admin/memberRequestValidation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/admin/users/[id]/unarchive — AŞAMA 4a: ARŞİVDEN ÇIKAR.
 *
 * Body: { adminPassword }
 *
 * Hesabı yalnız YÖNETİM arşivinden çıkarır: archived_at=NULL. Hesap PASİF kalır (giriş kapalı); erişim
 * ayrıca "Aktif Yap" ile ve onun kurallarıyla (onay durumu, deneme/Pro kuralları) açılır. Paket, deneme,
 * ödeme, modül ve onay alanlarına DOKUNULMAZ. user_unarchived audit kaydı aynı transaction'da yazılır.
 *
 * Güvenlik (arşivleme ile aynı düzey):
 *   1. verifyAdminRequest (x-admin-id + oturum token'ı, aktif admin)
 *   2. requireMainAdmin → yalnız ana yönetici (is_super_admin); DB fonksiyonu da ayrıca doğrular (42501)
 *   3. Kendi hesabı → 400
 *   4. Ana yönetici parolası server-side (verify_admin_login)
 *   5. admin_unarchive_user: hedef satır FOR UPDATE; arşivde değilse 409 (tekrar/eşzamanlı istek tutarlı)
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { adminId, db } = guard;

  // Yetki ÖNCE: normal admin hedef hakkında hiçbir şey öğrenmeden reddedilir.
  const main = await requireMainAdmin(db, adminId);
  if (!main.ok) return bad("Arşivden çıkarma yalnızca ana yöneticiye açıktır.", 403);

  const { id } = await ctx.params;
  if (!isUuid(id)) return bad("Geçersiz kullanıcı ID.");
  if (id === adminId) return bad("Kendi hesabınız üzerinde bu işlem yapılamaz.");

  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return bad(parsed.error, parsed.status);
  const rawPassword = parsed.value.adminPassword;
  const adminPassword = typeof rawPassword === "string" ? rawPassword.trim() : "";
  if (!adminPassword) return bad("Yönetici parolası gerekli.");

  const { data: adminRow } = await db.from("users").select("email").eq("id", adminId).maybeSingle();
  const adminEmail = String(adminRow?.email ?? "").trim().toLowerCase();
  if (!adminEmail) return bad("Admin kaydı bulunamadı.", 403);
  const { data: verified, error: verifyErr } = await db.rpc("verify_admin_login", {
    p_email: adminEmail,
    p_password: adminPassword,
  });
  if (verifyErr || !verified) return bad("Yönetici parolası doğrulanamadı.", 403);

  const { data, error } = await db.rpc("admin_unarchive_user", {
    p_user_id: id,
    p_actor_admin_id: adminId,
  });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "UY002") return bad("Hesap arşivde değil (başka bir yönetici çıkarmış olabilir). Sayfayı yenileyin.", 409);
    if (code === "UY003") return bad("Kullanıcı bulunamadı.", 404);
    if (code === "42501") return bad("Arşivden çıkarma yalnızca ana yöneticiye açıktır.", 403);
    // Migration (20280101000600) uygulanmamışsa fonksiyon yoktur → işlem yapılmaz.
    if (code === "42883" || code === "PGRST202") return bad("Arşiv ayrımı henüz etkin değil.", 503);
    return bad("Arşivden çıkarma tamamlanamadı.", 500);
  }
  const result = (data ?? {}) as { active?: boolean };
  return jsonNoStore({ ok: true, archived: false, active: result.active === true });
}
