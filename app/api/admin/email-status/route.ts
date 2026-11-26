import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { getEmailProvider } from "@/lib/email/provider";
import { smtpConfigIssue } from "@/lib/email/smtpProvider";
import { renderOtpEmail } from "@/lib/email/templates/otpEmail";
import { emailLimits, emailOtpConfigured, hashRecipient, otpPepper } from "@/lib/auth/emailOtp";
import { emailSelfServiceScope } from "@/lib/auth/emailSelfService";
import { emailVerifyPilotConfig, emailVerifyPilotDecision } from "@/lib/auth/emailVerifyPilot";
import { smtpHourlyLimit } from "@/lib/email/smtpQuota";
import { resolveOwnerTestRecipient } from "@/lib/email/ownerTestRecipient";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: NO_STORE });

/**
 * GİRİŞ GÜVENLİĞİ F2-D — Owner e-posta gönderim durumu ve test gönderimi.
 * Yetki DB'de (auth_email_status / auth_email_owner_test_reserve: yalnız is_super_admin Owner).
 * Gizli değer, alıcı adresi veya kod DÖNMEZ; yapılandırma yalnız var/yok olarak gösterilir.
 *
 * GET  → { configured, provider, limits, last_24h, last_failure, last_success_at, verified_users }
 * POST { action: "test" } → Owner'ın KENDİ adresine test iletisi (kod içermez; saatte ≤5).
 * POST { action: "test", target: "test_account" } → F3: sunucu ayarındaki KAYITLI test hesabına (EMAIL_OWNER_TEST_RECIPIENT;
 *      alıcı istekten ALINMAZ). Aynı Owner yetkisi, aynı saatlik 5 sınırı, aynı denetim kaydı ve SMTP 50/saat kapısı.
 * POST { action: "ack" }  → açık "e-posta uyarısı" bildirimlerini kapatır (sorun giderildikten sonra).
 */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  if (!guard.sessionToken) return json({ error: "Oturum doğrulanamadı." }, 401);
  const { data, error } = await guard.db.rpc("auth_email_status", { p_actor_token: guard.sessionToken });
  if (error) return json({ error: "Durum alınamadı." }, 500);
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) return json({ error: "Bu bilgi yalnız Owner'a açıktır." }, 403);
  const provider = getEmailProvider();
  return json({
    configured: emailOtpConfigured(),
    provider: provider?.name ?? null,
    // F2-M: EMAIL_PROVIDER=smtp iken eksik / geçersiz ayarın KODU (değer, adres, parola DÖNMEZ).
    configIssue: smtpConfigIssue(),
    pepperConfigured: !!otpPepper(),
    limits: emailLimits(),
    // F3: SMTP saatlik tavan (yalnız SMTP sağlayıcısında uygulanır; ≤ 50) ve kullanıcı e-postası kapsamı (rol adları;
    // tanınmayan değerlerin yalnız SAYISI döner, değerleri dönmez).
    hourlyLimit: provider?.name === "smtp" ? smtpHourlyLimit() : null,
    selfServiceScope: emailSelfServiceScope(),
    // F3 pilot: tek hesaplık e-posta DOĞRULAMA pilotu — yalnız durum kodu (kimlik / adres / özet DÖNMEZ).
    verifyPilot: await (async () => {
      const cfg = emailVerifyPilotConfig();
      if (!cfg) return { configured: false, eligible: false, reason: "not_configured" };
      const d = await emailVerifyPilotDecision(guard.db, cfg.userId);
      return { configured: true, eligible: d.allowed, reason: d.reason };
    })(),
    // F3: kayıtlı test hesabı alıcısı — yalnız maske ve durum kodu (tam adres DÖNMEZ).
    testRecipient: await (async () => {
      const t = await resolveOwnerTestRecipient(guard.db);
      return t.ok ? { available: true, masked: t.masked, issue: null } : { available: false, masked: null, issue: t.issue };
    })(),
    last24h: r.last_24h ?? null,
    lastFailure: r.last_failure ?? null,
    lastSuccessAt: r.last_success_at ?? null,
    verifiedUsers: r.verified_users ?? 0,
    openAlerts: Array.isArray(r.open_alerts) ? r.open_alerts : [],
  }, 200);
}

export async function POST(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  if (!guard.sessionToken) return json({ error: "Oturum doğrulanamadı." }, 401);
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  if (body?.action === "ack") {
    const { data, error } = await guard.db.rpc("auth_email_alerts_ack", { p_actor_token: guard.sessionToken });
    const r = (data ?? {}) as { ok?: unknown; closed?: unknown };
    if (error) return json({ error: "Uyarılar kapatılamadı." }, 500);
    if (r.ok !== true) return json({ error: "Bu işlem yalnız Owner'a açıktır." }, 403);
    return json({ ok: true, closed: Number(r.closed) || 0 }, 200);
  }
  if (body?.action !== "test") return json({ error: "Geçersiz işlem." }, 400);
  const target = (body as { target?: unknown }).target;
  if (target !== undefined && target !== "self" && target !== "test_account") return json({ error: "Geçersiz alıcı seçimi." }, 400);
  const provider = getEmailProvider();
  const pepper = otpPepper();
  if (!provider || !pepper) return json({ code: "NOT_CONFIGURED", error: "E-posta sağlayıcısı yapılandırılmamış." }, 503);
  const { data: me } = await guard.db.from("users").select("email, name").eq("id", guard.adminId).maybeSingle();
  let email = typeof (me as { email?: unknown } | null)?.email === "string" ? String((me as { email: string }).email) : "";
  let name: string | null = (me as { name?: string } | null)?.name ?? null;
  if (target === "test_account") {
    // Alıcı YALNIZ sunucu ayarından; kayıtlı, etkin, demo / arşiv / pasif olmayan tek hesap şartı (fail-closed).
    const t = await resolveOwnerTestRecipient(guard.db);
    if (!t.ok) return json({ code: "TEST_RECIPIENT_UNAVAILABLE", issue: t.issue, error: "Kayıtlı test hesabı alıcısı kullanılamıyor." }, 409);
    email = t.email;
    name = null;
  }
  if (!email) return json({ error: "Owner e-posta adresi yok." }, 400);
  const toHash = hashRecipient(email, pepper);
  const { data, error } = await guard.db.rpc("auth_email_owner_test_reserve", { p_actor_token: guard.sessionToken, p_to_hash: toHash, p_provider: provider.name });
  if (error) return json({ error: "Test başlatılamadı." }, 500);
  const r = (data ?? {}) as { ok?: unknown; code?: unknown; delivery_id?: unknown };
  if (r.ok !== true) return json({ error: r.code === "rate_limited" ? "Saatte en fazla 5 test gönderilebilir." : "Bu işlem yalnız Owner'a açıktır." }, r.code === "rate_limited" ? 429 : 403);
  const mail = renderOtpEmail({ purpose: "owner_test", name });
  const sent = await provider.send({ to: email, subject: mail.subject, text: mail.text, html: mail.html, category: "owner_test" });
  await guard.db.rpc("auth_email_delivery_result", {
    p_delivery_id: Number(r.delivery_id), p_ok: sent.ok, p_error_code: sent.ok ? null : sent.code, p_provider_message_id: sent.ok ? sent.providerMessageId : null,
  });
  return sent.ok ? json({ ok: true }, 200) : json({ ok: false, code: sent.code, error: "Test iletisi gönderilemedi." }, 503);
}
