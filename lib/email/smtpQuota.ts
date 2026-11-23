/**
 * GİRİŞ GÜVENLİĞİ — SMTP (Turhost) SAATLİK gönderim kotası (yalnız sunucu).
 *
 * Owner kararı 23.11.2026: tek posta kutusu (info@) kullanılır; Turhost hesap sınırı 60 ileti/saat, alan adı 250 alıcı/saat.
 * Otomatik gönderimler (OTP + güvenlik bildirimleri) kutunun normal kullanımına pay bırakmak için EN ÇOK 50 ileti/saat.
 *
 * Nasıl: mevcut, production'da kurulu `auth_rate_limit_hit` RPC'si (migration 20270130000000) — KAYAN 3600 sn pencere,
 * danışma kilidiyle atomik "say + kaydet". Sayaç veritabanında olduğu için bütün Vercel örnekleri AYNI kovayı paylaşır;
 * eşzamanlı istekler kotayı aşamaz. Yeni migration GEREKMEZ.
 *   - Kova sabittir (tek gönderen hesap): bir kayıt = bir SMTP gönderim GİRİŞİMİ (bağlantıdan ÖNCE alınır; gönderim başarısız
 *     olsa da sayılır → sağlayıcı tarafında da aşım olmaz, tutucu).
 *   - FAIL-CLOSED: RPC yoksa / hata verirse dbRateLimit bellek kipine düşer; bellek sayacı örnekler arası DEĞİLDİR → gönderim
 *     YAPILMAZ (kota garanti edilemiyorsa ileti gönderilmez).
 *   - Günlük sınır (EMAIL_DAILY_LIMIT, auth_email_* RPC'leri) DEĞİŞMEZ; saatlik kota ona EK bir kapıdır.
 *   - Tavan: SMTP_HOURLY_LIMIT yalnız DÜŞÜRÜLEBİLİR (1…50); geçersiz / büyük değer → 50.
 * Gizli değer YOK: kova adı sabit, parola / adres kullanılmaz.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hitDbRateLimit } from "@/lib/security/dbRateLimit";

type Env = Record<string, string | undefined>;

export const SMTP_HOURLY_LIMIT_CAP = 50;
export const SMTP_HOURLY_WINDOW_SECONDS = 3600;
export const SMTP_HOURLY_BUCKET = "email-smtp-saatlik:hesap";

/** Saatlik sınır: env yalnız düşürebilir (1…50); geçersiz → 50. */
export function smtpHourlyLimit(env: Env = process.env): number {
  const raw = String(env.SMTP_HOURLY_LIMIT ?? "").trim();
  if (!/^[0-9]+$/.test(raw)) return SMTP_HOURLY_LIMIT_CAP;
  const n = Number(raw);
  return n >= 1 && n <= SMTP_HOURLY_LIMIT_CAP ? n : SMTP_HOURLY_LIMIT_CAP;
}

export type SmtpGateResult = { allowed: boolean; retryAfterSec: number };
export type SmtpGate = () => Promise<SmtpGateResult>;

/** Veritabanı (örnekler arası) saatlik kapı. Veritabanı sayacı kullanılamazsa REDDEDER. */
export function createSmtpHourlyGate(db: () => SupabaseClient, env: Env = process.env): SmtpGate {
  return async () => {
    try {
      const r = await hitDbRateLimit(db(), SMTP_HOURLY_BUCKET, smtpHourlyLimit(env), SMTP_HOURLY_WINDOW_SECONDS);
      if (r.mode !== "db") return { allowed: false, retryAfterSec: 60 };
      return { allowed: r.allowed, retryAfterSec: r.retryAfterSec };
    } catch {
      return { allowed: false, retryAfterSec: 60 };
    }
  };
}
