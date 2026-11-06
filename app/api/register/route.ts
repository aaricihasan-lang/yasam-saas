import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { buildTenantDisplayName, buildTenantSlugBase } from "@/lib/auth/createExpertTenant";
import { provisionExpert } from "@/lib/auth/provisionExpert";
import { DEFAULT_MODULE_PERMISSIONS } from "@/lib/auth/modulePermissions";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { validateRegisterBody } from "@/lib/auth/registerValidation";
import { newPasswordPolicyMessage } from "@/lib/auth/passwordPolicy";
import { clientIpFromHeaders, hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { TRIAL_DEFAULT_MODULE_PERMISSIONS } from "@/lib/trial/trialCore";
import {
  assessTrialRisk,
  isSelfTrialSignupEnabled,
  recentTrialSignupsForIp,
  registerTrialExpert,
  trialClaimHash,
  trialIpBucket,
  turnstileSiteKey,
  verifyTurnstileToken,
} from "@/lib/trial/trialServer";

export const runtime = "nodejs";

/** MEM-012 — kayıt deneme sınırları (DB-temelli, tüm instance'larda ortak). */
const IP_LIMIT = 10;
const IP_WINDOW_SEC = 15 * 60;
const EMAIL_LIMIT = 3;
const EMAIL_WINDOW_SEC = 60 * 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function err(error: string, code: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ error, code }, { status, headers: { ...NO_STORE, ...headers } });
}

/**
 * POST /api/register
 *
 * Public kayıt endpoint — kullanıcı kendi hesabını oluşturur (service_role).
 * BF-11F-B: tenant+user artık atomik `provision_expert` RPC'sinde oluşturulur;
 * bu route tenant/users INSERT veya rollback YAPMAZ. Şifre server-side bcrypt ile
 * hashlenir (hash_password RPC — DB mutasyonu değildir). Public kayıt DEĞİŞMEZ
 * biçimde: role=expert, active=false, approval_status=pending (RPC server-forced).
 *
 * MEM-012 sertleştirme: 8 KB gövde sınırı + JSON içerik türü; sıkı ad/e-posta/parola doğrulaması
 * (lib/auth/registerValidation); honeypot (`website`) dolu → kayıt OLUŞTURULMAZ (bota başarı gibi
 * görünür); IP + e-posta başına DB-temelli rate limit (HMAC'li kova, ham IP/e-posta saklanmaz);
 * hash'ten ÖNCE uygulanır (pahalı bcrypt DoS'u sınırlanır). Ham DB hatası dönmez.
 */
/**
 * GET /api/register — kayıt formu yapılandırması (gizli bilgi YOK): otomatik deneme açık mı + Turnstile
 * site anahtarı (herkese açık anahtar). Form bu yanıta göre CAPTCHA'yı ve metinleri gösterir.
 */
export async function GET() {
  const selfTrial = isSelfTrialSignupEnabled();
  return NextResponse.json(
    { selfTrial, turnstileSiteKey: selfTrial ? turnstileSiteKey() : null },
    { headers: NO_STORE },
  );
}

export async function POST(req: NextRequest) {
  let db: ReturnType<typeof getServerDb>;
  try {
    db = getServerDb();
  } catch {
    return err("Sunucu yapılandırma hatası.", "config", 500);
  }

  // IP kovası HER denemeyi sayar (geçersiz/bozuk istekler dahil) → deneme-yanılma sınırlanır.
  const ipHit = await hitDbRateLimit(db, rateLimitBucket("reg-ip", clientIpFromHeaders(req.headers)), IP_LIMIT, IP_WINDOW_SEC);
  if (!ipHit.allowed) {
    return err("Çok fazla deneme. Lütfen daha sonra tekrar deneyin.", "rate_limited", 429, {
      "Retry-After": String(ipHit.retryAfterSec || IP_WINDOW_SEC),
    });
  }

  const parsed = await readLimitedJsonBody(req);
  if (!parsed.ok) return err("Geçersiz istek.", "invalid_request", parsed.status === 413 ? 413 : 400);

  const v = validateRegisterBody(parsed.value);
  if (!v.ok) {
    const messages: Record<string, string> = {
      missing_fields: "Tüm alanları doldurunuz.",
      invalid_name: "Ad soyad 2–120 karakter olmalıdır.",
      invalid_email: "Geçerli bir e-posta adresi girin.",
      weak_password:
        newPasswordPolicyMessage(
          typeof parsed.value.password === "string" ? parsed.value.password.trim() : "",
          typeof parsed.value.email === "string" ? parsed.value.email : "",
        ) ?? "Parola en az 6 karakter olmalı.",
      invalid_request: "Geçersiz istek.",
    };
    return err(messages[v.code] ?? "Geçersiz istek.", v.code, 400);
  }
  // Parola politikası (lib/auth/passwordPolicy — tek kaynak; validateRegisterBody ile aynı kural)
  // sunucu tarafında ayrıca açıkça zorlanır.
  const pwPolicy = newPasswordPolicyMessage(v.value.password, v.value.email);
  if (pwPolicy) return err(pwPolicy, "weak_password", 400);

  // E-posta kovası (geçerli biçimli istekler; honeypot'lu istekler de sayılır).
  const emailHit = await hitDbRateLimit(db, rateLimitBucket("reg-email", v.value.email), EMAIL_LIMIT, EMAIL_WINDOW_SEC);
  if (!emailHit.allowed) {
    return err("Çok fazla deneme. Lütfen daha sonra tekrar deneyin.", "rate_limited", 429, {
      "Retry-After": String(emailHit.retryAfterSec || EMAIL_WINDOW_SEC),
    });
  }

  // Honeypot: insanlar bu gizli alanı görmez. Doluysa kayıt OLUŞTURULMAZ; bota ipucu verilmez.
  if (v.bot) return NextResponse.json({ ok: true }, { headers: NO_STORE });

  const { fullName, email, password } = v.value;

  // TRIAL7 — yönetici onaysız 7 günlük deneme (bayrak + Turnstile anahtarları birlikte gerekir; aksi
  // halde aşağıdaki mevcut yönetici onaylı akış BİREBİR çalışır).
  if (isSelfTrialSignupEnabled()) return registerSelfTrial(req, db, { fullName, email, plainSecret: password }, parsed.value);

  // Şifreyi server-side bcrypt ile hashle (pgcrypto RPC; DB mutasyonu değil).
  const { data: hashResult, error: hashError } = await db.rpc("hash_password", { p_plain: password });
  if (hashError || !hashResult) return err("Parola işlenemedi.", "hash", 500);

  // Atomik provisioning (tenant+user+event TEK transaction). E-posta tekilliği +
  // race güvenliği DB'de (UNIQUE normalized email); orphan tenant üretilmez.
  const result = await provisionExpert(db, {
    mode: "public",
    email,
    passwordHash: hashResult as string,
    fullName,
    tenantName: buildTenantDisplayName(fullName, email),
    tenantSlugBase: buildTenantSlugBase(fullName, email),
    modulePermissions: DEFAULT_MODULE_PERMISSIONS,
  });

  if (result.ok) return NextResponse.json({ ok: true }, { headers: NO_STORE });
  // AUTH-03: hesap varlığı sızdırılmaz — kayıtlı e-posta için de başarılı başvuruyla AYNI yanıt.
  // Yeni hesap/tenant OLUŞTURULMAZ (provisionExpert already_exists); giriş ucu da tek mesaj kullanır.
  if (result.outcome === "already_exists") return NextResponse.json({ ok: true }, { headers: NO_STORE });
  if (result.outcome === "idempotency_key_conflict") return err("İşlem kimliği çakışması.", "idempotency", 409);
  return err("Kayıt oluşturulamadı.", "failed", 500);
}

/**
 * TRIAL7 — otomatik 7 günlük deneme kaydı. Mevcut korumalar (IP + e-posta hız sınırı, honeypot, gövde
 * sınırı, parola politikası) yukarıda AYNEN uygulanmıştır. Ek olarak:
 *   1) Cloudflare Turnstile — SUNUCU tarafı Siteverify ZORUNLU (bcrypt'ten ÖNCE; doğrulanamazsa kayıt yok).
 *   2) Risk sinyalleri (aynı IP kovasından çoklu kayıt, tek kullanımlık e-posta, eksik tarayıcı bilgisi):
 *      yüksek risk → hesap "inceleme" durumunda açılır (modüller + Roxy kapalı; admin karar verir).
 *      Aynı IP'yi paylaşan masum kullanıcılar KALICI engellenmez.
 *   3) Tek deneme hakkı: kanonik e-postanın HMAC'ı (gmail nokta/+etiket normalizasyonu) DB'de tekil.
 * Hesap varlığı / hak durumu SIZDIRILMAZ (AUTH-03): mevcut hesap ve kullanılmış hak aynı başarılı yanıtı alır.
 */
async function registerSelfTrial(
  req: NextRequest,
  db: ReturnType<typeof getServerDb>,
  value: { fullName: string; email: string; plainSecret: string },
  rawBody: Record<string, unknown>,
) {
  const ip = clientIpFromHeaders(req.headers);
  const captcha = await verifyTurnstileToken(rawBody.turnstileToken);
  if (!captcha.ok) {
    if (captcha.reason === "unavailable" || captcha.reason === "not_configured") {
      return err("Güvenlik doğrulaması şu anda yapılamıyor. Lütfen biraz sonra tekrar deneyin.", "captcha_unavailable", 503);
    }
    return err("Güvenlik doğrulaması tamamlanamadı. Lütfen doğrulamayı yenileyip tekrar deneyin.", "captcha_failed", 400);
  }

  const { data: hashResult, error: hashError } = await db.rpc("hash_password", { p_plain: value.plainSecret });
  if (hashError || !hashResult) return err("Parola işlenemedi.", "hash", 500);

  const ipBucket = trialIpBucket(ip);
  const recent = await recentTrialSignupsForIp(db, ipBucket);
  const risk = assessTrialRisk({ email: value.email, recentSignupsFromIp: recent, userAgent: req.headers.get("user-agent") });

  const result = await registerTrialExpert(db, {
    email: value.email,
    passwordHash: hashResult as string,
    fullName: value.fullName,
    tenantName: buildTenantDisplayName(value.fullName, value.email),
    tenantSlugBase: buildTenantSlugBase(value.fullName, value.email),
    modulePermissions: { ...TRIAL_DEFAULT_MODULE_PERMISSIONS },
    claimHash: trialClaimHash(value.email),
    ipBucket,
    risk,
  });
  if (result.ok || result.outcome === "already_exists" || result.outcome === "trial_already_used") {
    return NextResponse.json({ ok: true, mode: "trial" }, { headers: NO_STORE });
  }
  return err("Kayıt oluşturulamadı.", "failed", 500);
}
