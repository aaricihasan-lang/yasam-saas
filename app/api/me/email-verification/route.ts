import { NextRequest } from "next/server";
import { jsonNoStore, verifySelfSessionRequest } from "@/lib/auth/sessionModel";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { emailOtpConfigured, issueAndSendOtp, maskEmail, verifyOtp } from "@/lib/auth/emailOtp";
import { EMAIL_NOT_IN_SCOPE_TEXT, emailSelfServiceAllowed, emailVerificationAllowed } from "@/lib/auth/emailSelfService";

export const runtime = "nodejs";

/**
 * GİRİŞ GÜVENLİĞİ F2-D — oturumdaki kullanıcının KENDİ e-posta adresini doğrulaması (kutu sahipliği).
 * Doğrulanmış adres e-posta ile ikinci doğrulama yöntemini mümkün kılar (Owner ancak o zaman zorunluluk
 * açabilir). Adres DEĞİŞTİRİLMEZ (yalnız kayıtlı adres). Demo hesabında kapalı.
 *
 * F3: kapsam AUTH_EMAIL_SELF_SERVICE_ROLES (varsayılan yalnız Owner; lib/auth/emailSelfService). Kapsam dışı hesapta
 * kod GÖNDERİLMEZ / doğrulanmaz (403 METHOD_NOT_IN_SCOPE) — yalnız arayüz gizlemesi değildir.
 * F3 pilot: AUTH_EMAIL_VERIFY_PILOT_USER_ID'deki TEK uzman hesabı yalnız BU uçta (adres doğrulama) açılır; changeAvailable
 * (adres değişikliği) pilotla AÇILMAZ.
 *
 * GET  → { email: maske, verified: boolean, available: boolean, changeAvailable: boolean }
 * POST { action: "send" } → kod gönderir · POST { action: "confirm", code } → doğrular
 */
export async function GET(req: NextRequest) {
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  const { data } = await guard.db.from("users").select("email, email_verified_at").eq("id", guard.userId).maybeSingle();
  const r = (data ?? {}) as { email?: unknown; email_verified_at?: unknown };
  const configured = emailOtpConfigured() && !guard.isDemo;
  const available = configured && (await emailVerificationAllowed(guard.db, guard.userId, guard.role));
  const changeAvailable = configured && (await emailSelfServiceAllowed(guard.db, guard.userId, guard.role));
  return jsonNoStore({
    email: typeof r.email === "string" ? maskEmail(r.email) : null,
    verified: r.email_verified_at != null,
    available,
    // F3: "e-posta adresimi değiştir" kartı ROL kapsamına bağlı (doğrulama pilotu adres değişikliğini açmaz; uç ayrıca denetler).
    changeAvailable,
  }, 200);
}

export async function POST(req: NextRequest) {
  const guard = await verifySelfSessionRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.isDemo) return demoReadOnlyResponse();
  if (!(await emailVerificationAllowed(guard.db, guard.userId, guard.role))) {
    return jsonNoStore({ code: "METHOD_NOT_IN_SCOPE", error: EMAIL_NOT_IN_SCOPE_TEXT }, 403);
  }
  const body = (await req.json().catch(() => null)) as { action?: unknown; code?: unknown } | null;
  const { data } = await guard.db.from("users").select("email, name, full_name, email_verified_at").eq("id", guard.userId).maybeSingle();
  const u = (data ?? {}) as { email?: unknown; name?: unknown; full_name?: unknown; email_verified_at?: unknown };
  if (typeof u.email !== "string" || !u.email.trim()) return jsonNoStore({ error: "Kayıtlı e-posta adresi yok." }, 400);
  if (u.email_verified_at != null) return jsonNoStore({ verified: true }, 200);

  if (body?.action === "send") {
    const out = await issueAndSendOtp(guard.db, {
      userId: guard.userId, email: u.email,
      name: (typeof u.full_name === "string" && u.full_name) || (typeof u.name === "string" ? u.name : null),
      purpose: "verify_email", challengeId: null,
    });
    if (out.ok) return jsonNoStore({ sent: true, expiresAt: out.expiresAt }, 200);
    const status = out.code === "cooldown" || out.code === "rate_limited" ? 429 : out.code === "not_configured" || out.code === "quota_exhausted" || out.code === "send_failed" ? 503 : 400;
    return jsonNoStore({ code: out.code.toUpperCase(), error: out.code === "cooldown" ? "Yeni kod istemeden önce biraz bekleyin." : "Kod gönderilemedi.", ...(out.retryAfter ? { retryAfter: out.retryAfter } : {}) }, status);
  }
  if (body?.action === "confirm") {
    const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
    // F2-J (L1): kod, ŞU ANKİ kayıtlı adrese bağlı kapsamla doğrulanır (adres değiştiyse eski kod geçmez).
    const r = await verifyOtp(guard.db, { userId: guard.userId, purpose: "verify_email", challengeId: null, code, email: u.email });
    if (r.ok) return jsonNoStore({ verified: true }, 200);
    const msg = r.code === "wrong" ? `Kod hatalı.${r.attemptsLeft !== undefined ? ` Kalan deneme: ${r.attemptsLeft}.` : ""}`
      : r.code === "expired" ? "Kodun süresi doldu. Yeni kod isteyin."
        : r.code === "locked" ? "Kod 5 kez hatalı girildi. Yeni kod isteyin."
          : "Geçerli bir kod yok. Yeni kod isteyin.";
    return jsonNoStore({ code: `OTP_${r.code.toUpperCase()}`, error: msg }, 400);
  }
  return jsonNoStore({ error: "Geçersiz işlem." }, 400);
}
