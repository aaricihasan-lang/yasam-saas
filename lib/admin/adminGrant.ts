/**
 * GİRİŞ GÜVENLİĞİ F2-K (N2) — yönetici yetkisi verme (yeni yönetici, uzman → yönetici, pasif yönetici → etkin).
 *
 * Yalnız Owner, son 30 dakikada ikinci doğrulamayla açılmış oturum ve hedefe bağlı, tek kullanımlık işleme özel kanıt
 * (telefon QR / e-posta kodu, eylem `admin_grant`) ile. Çalınmış Owner çerezi tek başına kalıcı yönetici erişimi açamaz.
 * Asıl zorlama veritabanındadır (users tetikleyicisi + kanıt tüketen fonksiyonlar); bu yardımcı yalnız yanıtları eşler.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Yeni yönetici için kanıt hedefi (DB: auth_admin_grant_email_target ile aynı). */
export function adminGrantEmailTarget(email: string): string {
  const h = createHash("md5").update(`admin_grant:${email.trim().toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** DB sonucu → HTTP yanıtı (başarısızlıkta). Başarıda null. */
export function adminGrantFailure(r: Record<string, unknown> | null | undefined): NextResponse | null {
  if (r && r.ok === true) return null;
  const code = String(r?.code ?? "error");
  if (code === "step_up_required") {
    return NextResponse.json({
      ok: false, code: "STEP_UP_REQUIRED", action: "admin_grant", target: r?.target,
      error: "Yönetici yetkisi vermek için telefonunuzdan (QR) veya e-postanıza gelen kodla işleme özel doğrulama gerekiyor.",
    }, { status: 403, headers: NO_STORE });
  }
  if (code === "fresh_mfa_required") {
    return NextResponse.json({
      ok: false, code: "FRESH_MFA_REQUIRED",
      error: "Güvenliğiniz için çıkış yapıp ikinci doğrulamayla yeniden giriş yapın (son 30 dakika içinde açılmış oturum gerekir).",
    }, { status: 403, headers: NO_STORE });
  }
  if (code === "not_found") return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404, headers: NO_STORE });
  if (code === "bad_request") return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400, headers: NO_STORE });
  return NextResponse.json({ ok: false, error: "Yönetici yetkisi yalnız Owner tarafından verilebilir." }, { status: 403, headers: NO_STORE });
}

/** Mevcut kullanıcıyı yöneticiye yükselt veya pasif yöneticiyi etkinleştir (kanıtı tüketir). */
export async function grantAdminRole(
  db: SupabaseClient,
  sessionToken: string | undefined,
  userId: string,
  op: "promote" | "activate",
  expectedActive?: boolean,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  if (!sessionToken) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Oturum doğrulanamadı." }, { status: 401, headers: NO_STORE }) };
  }
  const { data, error } = await db.rpc("auth_admin_role_grant", {
    p_actor_token: sessionToken, p_user_id: userId, p_op: op, p_expected_active: expectedActive ?? null,
  });
  if (error) {
    return { ok: false, response: NextResponse.json({ ok: false, error: "Yönetici yetkisi verilemedi." }, { status: 500, headers: NO_STORE }) };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  const fail = adminGrantFailure(r);
  return fail ? { ok: false, response: fail } : { ok: true, data: r };
}
