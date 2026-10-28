/**
 * Klasik Numeroloji — tenant'a bağlı normalize yanıt önbelleği (YALNIZ SUNUCU).
 *
 * Anahtar = HMAC-SHA256(sır, tenant | uç | kanonik girdi JSON | lang | spec sürümü | adapter sürümü) (64 hex).
 *   • Tarih bağımlı uçlarda (personal_day: targetDate, chart: currentYear) tarih zaten sağlayıcı gövdesinin
 *     parçasıdır → kanonik girdiye girer → farklı gün/yıl = farklı anahtar.
 *   • Sır: NUMEROLOGY_CLASSIC_CACHE_SECRET, yoksa SUPABASE_SERVICE_ROLE_KEY (HMAC anahtarı alan ayırma etiketiyle
 *     `numk-cache:v1:` önekli; HD GUV-07 deseni: anahtar tek başına ad/doğum tarihi tahminine izin vermez).
 *     İkisi de yoksa: YALNIZ NODE_ENV=test'te düz SHA-256; diğer her ortamda önbellek KAPALI (okuma/yazma yok,
 *     tek seferlik log) — tahmin edilebilir düz özet kişisel veri anahtarı olarak saklanmaz.
 *   • Saklama: her satır expires_at = yazım anı + NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS (varsayılan 90, 1–365).
 *     Süresi geçen satır OKUNMAZ; silme retention.ts → purgeClassicPersonalData (zamanlama owner kararı).
 *   • Önbellek kişisel veridir → her okuma/yazma tenant_id ile bağlıdır; başka tenant'ın satırı görünmez.
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { createHash, createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalJson } from "../input";
import type { ClassicEndpointId } from "../endpoints";

assertServerOnly("lib/numeroloji-klasik/server/cache");

const TABLE = "numerology_classic_response_cache";
const DAY_MS = 24 * 60 * 60 * 1000;

export const CLASSIC_CACHE_TTL_DEFAULT_DAYS = 90;
export const CLASSIC_CACHE_TTL_MIN_DAYS = 1;
export const CLASSIC_CACHE_TTL_MAX_DAYS = 365;

/** NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS → gün (tamsayı değilse varsayılan 90; 1–365 aralığına sıkıştırılır). */
export function readCacheTtlDays(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS ?? "").trim();
  if (!/^\d{1,6}$/.test(raw)) return CLASSIC_CACHE_TTL_DEFAULT_DAYS;
  return Math.min(CLASSIC_CACHE_TTL_MAX_DAYS, Math.max(CLASSIC_CACHE_TTL_MIN_DAYS, Number(raw)));
}

export function readCacheSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = (env.NUMEROLOGY_CLASSIC_CACHE_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return s || null;
}

export type CacheKeying =
  | { mode: "secret" | "service_role"; secret: string; enabled: true }
  | { mode: "test_plain"; secret: null; enabled: true }
  | { mode: "disabled"; secret: null; enabled: false };

/** Önbellek anahtarlama kararı (ortamdan). Sırsız ortamda düz SHA-256 yalnız NODE_ENV=test'te. */
export function resolveCacheKeying(env: Record<string, string | undefined> = process.env): CacheKeying {
  const own = (env.NUMEROLOGY_CLASSIC_CACHE_SECRET ?? "").trim();
  if (own) return { mode: "secret", secret: own, enabled: true };
  const sr = (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (sr) return { mode: "service_role", secret: sr, enabled: true };
  if (env.NODE_ENV === "test") return { mode: "test_plain", secret: null, enabled: true };
  return { mode: "disabled", secret: null, enabled: false };
}

/** Servis katmanı: sır yoksa önbellek yalnız NODE_ENV=test'te kullanılabilir. */
export function cacheUsable(secret: string | null, env: Record<string, string | undefined> = process.env): boolean {
  return secret !== null || env.NODE_ENV === "test";
}

export type CacheKeyParts = {
  tenantId: string;
  endpointId: ClassicEndpointId;
  /** Sağlayıcıya gidecek gövde (veya GET için { n }) — kanonik JSON'a çevrilir. */
  input: unknown;
  lang: string;
  specVersion: string;
  adapterVersion: string;
};

export function classicCacheKey(p: CacheKeyParts, secret: string | null): string {
  const material = [p.tenantId.toLowerCase(), p.endpointId, canonicalJson(p.input), p.lang, p.specVersion, p.adapterVersion].join("|");
  if (secret) return createHmac("sha256", `numk-cache:v1:${secret}`).update(material, "utf8").digest("hex");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

export type CacheEntry = { normalized: unknown; createdAt: string };

/** Satırın son geçerlilik anı (ms). expires_at yoksa (eski satır) created_at + TTL. Okunamazsa 0 (= geçmiş). */
export function cacheRowExpiresAt(row: { created_at: string | null; expires_at: string | null }, ttlDays: number): number {
  if (row.expires_at) {
    const e = Date.parse(row.expires_at);
    return Number.isFinite(e) ? e : 0;
  }
  const c = row.created_at ? Date.parse(row.created_at) : NaN;
  return Number.isFinite(c) ? c + ttlDays * DAY_MS : 0;
}

export async function cacheGet(
  db: SupabaseClient,
  tenantId: string,
  cacheKey: string,
  now: Date,
  ttlDays: number = CLASSIC_CACHE_TTL_DEFAULT_DAYS,
): Promise<CacheEntry | null> {
  const { data, error } = await db
    .from(TABLE)
    .select("normalized, created_at, expires_at")
    .eq("tenant_id", tenantId)
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { normalized: unknown; created_at: string; expires_at: string | null };
  if (cacheRowExpiresAt(row, ttlDays) <= now.getTime()) return null;
  return { normalized: row.normalized, createdAt: row.created_at };
}

export async function cachePut(
  db: SupabaseClient,
  e: {
    tenantId: string;
    cacheKey: string;
    endpointId: ClassicEndpointId;
    lang: string;
    specVersion: string;
    adapterVersion: string;
    normalized: unknown;
    /** Yazım anı (varsayılan: şimdi). expires_at = now + ttlDays. */
    now?: Date;
    ttlDays?: number;
  },
): Promise<boolean> {
  const now = e.now ?? new Date();
  const ttl = Math.min(CLASSIC_CACHE_TTL_MAX_DAYS, Math.max(CLASSIC_CACHE_TTL_MIN_DAYS, Math.floor(e.ttlDays ?? CLASSIC_CACHE_TTL_DEFAULT_DAYS)));
  const expiresAt = new Date(now.getTime() + ttl * DAY_MS).toISOString();
  const { error } = await db.from(TABLE).insert({
    tenant_id: e.tenantId,
    cache_key: e.cacheKey,
    endpoint_id: e.endpointId,
    lang: e.lang,
    spec_version: e.specVersion,
    adapter_version: e.adapterVersion,
    normalized: e.normalized,
    expires_at: expiresAt,
  });
  if (!error) return true;
  if ((error as { code?: string }).code !== "23505") return false;
  // Aynı anahtar zaten var: eşzamanlı yazım (başka instance) VEYA süresi geçmiş (henüz temizlenmemiş) satır →
  // içerik + süre yenilenir (aksi hâlde süresi geçmiş satır, temizlenene dek önbelleği kalıcı ıskaya düşürürdü).
  const { error: upErr } = await db
    .from(TABLE)
    .update({ normalized: e.normalized, created_at: now.toISOString(), expires_at: expiresAt })
    .eq("tenant_id", e.tenantId)
    .eq("cache_key", e.cacheKey);
  return !upErr;
}
