import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { buildTenantDisplayName, buildTenantSlugBase } from "@/lib/auth/createExpertTenant";
import { provisionExpert } from "@/lib/auth/provisionExpert";
import { DEFAULT_MODULE_PERMISSIONS } from "@/lib/auth/modulePermissions";
import { readLimitedJsonBody } from "@/lib/admin/accountSessionControls";
import { validateRegisterBody } from "@/lib/auth/registerValidation";
import { clientIpFromHeaders, hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";

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
      weak_password: "Şifre en az 8 karakter olmalı; en az bir harf ve bir rakam içermelidir.",
      invalid_request: "Geçersiz istek.",
    };
    return err(messages[v.code] ?? "Geçersiz istek.", v.code, 400);
  }

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

  // Şifreyi server-side bcrypt ile hashle (pgcrypto RPC; DB mutasyonu değil).
  const { data: hashResult, error: hashError } = await db.rpc("hash_password", { p_plain: password });
  if (hashError || !hashResult) return err("Şifre işlenemedi.", "hash", 500);

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
  if (result.outcome === "already_exists") return err("Bu e-posta adresi zaten kayıtlı.", "already_exists", 409);
  if (result.outcome === "idempotency_key_conflict") return err("İşlem kimliği çakışması.", "idempotency", 409);
  return err("Kayıt oluşturulamadı.", "failed", 500);
}
