/**
 * Klasik Numeroloji — tenant'a bağlı normalize yanıt önbelleği (YALNIZ SUNUCU).
 *
 * Anahtar = HMAC-SHA256(sır, tenant | uç | kanonik girdi JSON | lang | spec sürümü | adapter sürümü) (64 hex).
 *   • Tarih bağımlı uçlarda (personal_day: targetDate, chart: currentYear) tarih zaten sağlayıcı gövdesinin
 *     parçasıdır → kanonik girdiye girer → farklı gün/yıl = farklı anahtar.
 *   • Sır: NUMEROLOGY_CLASSIC_CACHE_SECRET, yoksa SUPABASE_SERVICE_ROLE_KEY (HD GUV-07 deseni: anahtar tek
 *     başına ad/doğum tarihi tahminine izin vermez). İkisi de yoksa düz SHA-256 (yalnız yerel test).
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

export function readCacheSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = (env.NUMEROLOGY_CLASSIC_CACHE_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return s || null;
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

export async function cacheGet(db: SupabaseClient, tenantId: string, cacheKey: string, now: Date): Promise<CacheEntry | null> {
  const { data, error } = await db
    .from(TABLE)
    .select("normalized, created_at, expires_at")
    .eq("tenant_id", tenantId)
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { normalized: unknown; created_at: string; expires_at: string | null };
  if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) return null;
  return { normalized: row.normalized, createdAt: row.created_at };
}

export async function cachePut(
  db: SupabaseClient,
  e: { tenantId: string; cacheKey: string; endpointId: ClassicEndpointId; lang: string; specVersion: string; adapterVersion: string; normalized: unknown; expiresAt?: string | null },
): Promise<boolean> {
  const { error } = await db.from(TABLE).insert({
    tenant_id: e.tenantId,
    cache_key: e.cacheKey,
    endpoint_id: e.endpointId,
    lang: e.lang,
    spec_version: e.specVersion,
    adapter_version: e.adapterVersion,
    normalized: e.normalized,
    expires_at: e.expiresAt ?? null,
  });
  // Eşzamanlı yazım (başka instance aynı anahtarı yazdı) → zaten var; başarı say.
  if (error && (error as { code?: string }).code !== "23505") return false;
  return true;
}
