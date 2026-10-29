/**
 * Klasik Numeroloji — Word / PNG rapor üretimi için kullanıcı başına hız sınırı (NK-R15; YALNIZ SUNUCU).
 * Rapor üretimi CPU'ya ağırdır (docx paketleme, resvg, kütüphane RPC'leri); sağlayıcı kredisi harcamaz.
 * Sınır: kullanıcı başına 10 dakikada 40 rapor (Word + PNG ortak kova). DB yoksa bellek içi yedek (dbRateLimit).
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { classicJson } from "./http";

assertServerOnly("lib/numeroloji-klasik/server/reportRateLimit");

export const CLASSIC_REPORT_RATE = Object.freeze({ limit: 40, windowSeconds: 600 });

/** İzin varsa null; aşıldıysa 429 yanıtı (Retry-After). */
export async function classicReportRateLimit(db: SupabaseClient, userId: string): Promise<Response | null> {
  const r = await hitDbRateLimit(db, rateLimitBucket("numk-report", userId), CLASSIC_REPORT_RATE.limit, CLASSIC_REPORT_RATE.windowSeconds);
  if (r.allowed) return null;
  const retry = Math.max(1, r.retryAfterSec || 60);
  return classicJson(429, { ok: false, code: "RATE_LIMITED", error: "Kısa sürede çok fazla rapor üretildi. Lütfen biraz sonra tekrar deneyin.", retryAfterSec: retry }, { "Retry-After": String(retry) });
}
