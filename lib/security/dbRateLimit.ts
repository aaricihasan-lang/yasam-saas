/**
 * MEM-012 — Global (instance-bağımsız) rate limit: PostgreSQL `auth_rate_limit_hit` RPC'si
 * (migration 20270130000000; advisory-lock ile atomik "say + kaydet").
 *
 * Neden DB: Vercel Fluid Compute çok-instance'lıdır; bellek-içi sayaç (lib/security/rateLimit)
 * instance-yereldir ve GERÇEK koruma sayılamaz. DB sayacı tüm instance'larda ortaktır.
 *
 * Gizlilik: kova anahtarı HMAC-SHA256(secret, "<scope>:<değer>") — ham IP/e-posta DB'ye yazılmaz.
 * Secret: RATE_LIMIT_SECRET, yoksa SUPABASE_SERVICE_ROLE_KEY (yalnız server).
 *
 * Fallback (dürüst): RPC yoksa/hata verirse (ör. migration henüz uygulanmadı) bellek-içi best-effort
 * sayaca düşülür ve sonuç `mode: "memory"` ile işaretlenir — bu mod global koruma DEĞİLDİR.
 */
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/security/rateLimit";

export type DbRateLimitResult = { allowed: boolean; retryAfterSec: number; mode: "db" | "memory" };

function secret(): string {
  return process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "yasam-rate-limit";
}

/** Kova anahtarı: ham değer saklanmaz (HMAC, 40 hex). */
export function rateLimitBucket(scope: string, value: string): string {
  const h = createHmac("sha256", secret()).update(`${scope}:${value}`).digest("hex").slice(0, 40);
  return `${scope}:${h}`;
}

export async function hitDbRateLimit(
  db: SupabaseClient,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<DbRateLimitResult> {
  try {
    const { data, error } = await db.rpc("auth_rate_limit_hit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (!error && data && typeof data === "object") {
      const d = data as { allowed?: unknown; retry_after?: unknown };
      return {
        allowed: d.allowed === true,
        retryAfterSec: Math.max(0, Number(d.retry_after) || 0),
        mode: "db",
      };
    }
  } catch {
    // aşağıdaki best-effort fallback
  }
  const r = checkRateLimit(bucket, limit, windowSeconds * 1000, Date.now());
  return { allowed: r.ok, retryAfterSec: r.retryAfterSec, mode: "memory" };
}

/** İstemci IP'si (Vercel: x-forwarded-for ilk değer). Bulunamazsa "unknown" (ortak kova). */
export function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || "unknown";
}
