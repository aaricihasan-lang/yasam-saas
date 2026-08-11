import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security/rateLimit";

/**
 * Biyoenerji DOCX rapor endpoint'leri için ortak güvenlik yardımcıları.
 *
 * - HARD CAP (deterministik): exportMode="all"da en çok MAX_EXPORT_RECORDS kayıt
 *   render edilir; sorgu .limit(MAX_EXPORT_RECORDS) ile sınırlanır → sınırsız fetch
 *   (bellek/timeout) engellenir. Tavana ulaşılırsa çağıran, dokümana GÖRÜNÜR bir
 *   kırpma notu ekler (sessiz veri düşürme YOK).
 * - MAX_SELECTED_IDS: "selected" modunda id dizisi tavanı.
 * - reportRateLimit: best-effort (bkz. lib/security/rateLimit) ek katman; asıl
 *   koruma HARD CAP'tir.
 *
 * Gerekçe (canlı veri hacmi): Preflight'ta gözlenen en büyük tek-modül içerik
 * kümesi ≈ 5.584 satır (subconscious_causes, admin master kütüphanesi — uzman
 * rapor route'larından export EDİLMEZ). Tipik uzman katalogları çok daha küçüktür.
 * 5.000 tavanı: (a) Word üretimini bellek/süre olarak deterministik sınırlar,
 * (b) gerçekçi uzman kataloglarını kapsar, (c) aşımda kullanıcı kategori/seçili
 * export'a yönlendirilir. Bu tahmini değil, ölçülen hacme dayalı bir tavandır.
 */

export const MAX_EXPORT_RECORDS = 5000;
export const MAX_SELECTED_IDS = 1000;

const RATE_LIMIT = 10; // pencere başına istek
const RATE_WINDOW_MS = 60_000; // 60 sn

/** GÖRÜNÜR kırpma notu (dokümana eklenecek metin). */
export const EXPORT_TRUNCATED_NOTE = (n: number): string =>
  `Not: Çok sayıda kayıt nedeniyle rapora ilk ${n} kayıt dahil edildi. ` +
  `Tümü için kategori filtresi veya seçili export kullanın.`;

/**
 * Best-effort rate-limit. Sınır aşılırsa hazır 429 Response döner (aksi halde null).
 * Not: NextResponse, Response'u genişletir → route imzası Promise<Response> ile uyumlu.
 */
export function reportRateLimit(routeKey: string, tenantId: string): NextResponse | null {
  const { ok, retryAfterSec } = checkRateLimit(
    `bioreport:${routeKey}:${tenantId}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
    Date.now(),
  );
  if (ok) return null;
  return NextResponse.json(
    { ok: false, error: "Çok fazla istek. Lütfen biraz sonra tekrar deneyin." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

/** "selected" id listesini güvenli tavana kırpar (string + trim + benzersiz değil, sıralı). */
export function capSelectedIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return ids
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .slice(0, MAX_SELECTED_IDS);
}
