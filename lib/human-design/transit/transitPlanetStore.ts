// Human Design transit — KALICI GEZEGEN KONUMU ÖNBELLEĞİ (L2, Supabase `hd_transit_planet_positions`). YALNIZ SUNUCU.
//
// Yalnız kişisel OLMAYAN gök verisi: tek UTC anının doğrulanmış boylamları. Danışan / doğum / kullanıcı / tenant bilgisi
// ne anahtarda ne değerde bulunur (tablo tenant'tan bağımsızdır; paylaşım kasıtlıdır).
//
// Okuma körü körüne güvenmez: kayıt sürüm alanları + mevcut `parseRoxyPlanets` kuralları (12 cisim, sonlu [0,360) boylam,
// Güney = Kuzey + 180°) + çağıranın verdiği `accept` (resolveTransit: yerel motor bandı) ile yeniden doğrulanır.
// Geçersiz kayıt SİLİNMEZ ve GÜNCELLENMEZ (tabloya UPDATE/DELETE yetkisi yok): aynı içerikten türetilen deterministik
// ONARIM anahtarına geçilir → tüm sunucu örnekleri aynı onarım anahtarında buluşur; aynı bozuk kayıt sürekli 502 ya da
// sürekli ücretli çağrı üretmez. Temizlik owner kararıdır.
//
// Tablo yoksa / DB erişilemezse `unavailable` → çağıran eski (Next Data Cache) yola döner. Yazma hatası sonucu ENGELLEMEZ.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanetName } from "../engine/types";
import { ROXY_PLANETS_ADAPTER_VERSION, parseRoxyPlanets } from "./roxyPlanetsClient";

export const HD_TRANSIT_PLANET_TABLE = "hd_transit_planet_positions";
/** Kayıt biçimi sürümü (anahtara girer). */
export const HD_TRANSIT_PLANET_SCHEMA_VERSION = 1;
/**
 * Doğrulama motoru sürümü: yerel motor (astronomy-engine, true node) + belirsizlik pay tablosu (transitUncertaintyArcsec,
 * roxyPlanetsUncertaintyArcsec). Bunlardan biri değişirse bu değer artırılır → eski kayıtlar okunmaz (silinmez).
 */
export const HD_TRANSIT_PLANET_ENGINE_VERSION = "ae1-band20261019";
export const HD_TRANSIT_PLANET_PROVIDER = "roxyapi";
/** Onarım zinciri üst sınırı (bozuk → onarım → bozuk …). Aşılırsa `unavailable` (eski yol), sonsuz döngü yok. */
const MAX_REPAIR_DEPTH = 3;

export type PlanetLongitudes = Record<PlanetName, number>;
export type PlanetStoreRead =
  | { status: "hit"; cacheKey: string; lon: PlanetLongitudes; repaired: boolean }
  | { status: "miss"; cacheKey: string; repaired: boolean }
  | { status: "unavailable"; reason: string };
export type PlanetStoreWrite = "stored" | "exists" | "failed";
export type PlanetStore = {
  /** `accept` false dönerse kayıt geçersiz sayılır (onarım anahtarına geçilir). */
  read(utcIso: string, nodeType: "true" | "mean", accept: (lon: PlanetLongitudes) => boolean): Promise<PlanetStoreRead>;
  write(cacheKey: string, utcIso: string, nodeType: "true" | "mean", lon: PlanetLongitudes): Promise<PlanetStoreWrite>;
};

const ISO_SECOND = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const STORED_BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "NorthNode", "SouthNode"] as const;
const ROXY_NAME: Partial<Record<PlanetName, string>> = { NorthNode: "North Node", SouthNode: "South Node" };

/** Birincil anahtar: kişisel olmayan parametreler + saniye hassasiyetli UTC anı. */
export function planetCacheKey(utcIso: string, nodeType: "true" | "mean"): string {
  if (!ISO_SECOND.test(utcIso)) throw new Error("planetCacheKey: UTC anı saniye hassasiyetli ISO olmalı");
  return `hdtp${HD_TRANSIT_PLANET_SCHEMA_VERSION}|${ROXY_PLANETS_ADAPTER_VERSION}|${nodeType}|${HD_TRANSIT_PLANET_ENGINE_VERSION}|${utcIso}`;
}
/** Bozuk kayıt içeriğinden deterministik onarım anahtarı (tüm örnekler aynı anahtarı türetir). */
export function repairCacheKey(badKey: string, badRow: unknown): string {
  const h = createHash("sha256").update(badKey).update("\u0000").update(JSON.stringify(badRow ?? null)).digest("hex").slice(0, 16);
  return `${badKey.split("|r:")[0]}|r:${h}`;
}

type Row = { cache_key: unknown; utc_at: unknown; provider: unknown; adapter_version: unknown; node_type: unknown; engine_version: unknown; schema_version: unknown; longitudes: unknown };

/** Kayıt → doğrulanmış boylamlar; geçersizse null. Mevcut sağlayıcı ayrıştırıcısının kuralları birebir uygulanır. */
export function validatePlanetRow(row: Row, expect: { cacheKey: string; utcIso: string; nodeType: string }): PlanetLongitudes | null {
  if (row.cache_key !== expect.cacheKey) return null;
  if (row.provider !== HD_TRANSIT_PLANET_PROVIDER || row.adapter_version !== ROXY_PLANETS_ADAPTER_VERSION) return null;
  if (row.node_type !== expect.nodeType || row.engine_version !== HD_TRANSIT_PLANET_ENGINE_VERSION) return null;
  if (Number(row.schema_version) !== HD_TRANSIT_PLANET_SCHEMA_VERSION) return null;
  const t = typeof row.utc_at === "string" ? Date.parse(row.utc_at) : NaN;
  if (!Number.isFinite(t) || t !== Date.parse(expect.utcIso)) return null;
  const l = row.longitudes;
  if (typeof l !== "object" || l === null || Array.isArray(l)) return null;
  const planets = STORED_BODIES.map((b) => ({ name: ROXY_NAME[b] ?? b, longitude: (l as Record<string, unknown>)[b] }));
  const p = parseRoxyPlanets({ planets });
  return p.ok ? p.longitudes : null;
}

const isMissingTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205") && String(e.message ?? "").includes(HD_TRANSIT_PLANET_TABLE);

async function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(p), new Promise<T>((_, rej) => { timer = setTimeout(() => rej(new Error("planet_store_timeout")), ms); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createSupabasePlanetStore(
  db: SupabaseClient,
  opts: { log?: (msg: string, detail?: unknown) => void; readTimeoutMs?: number; writeTimeoutMs?: number } = {},
): PlanetStore {
  const log = opts.log ?? (() => undefined);
  const readTimeoutMs = opts.readTimeoutMs ?? 2500;
  const writeTimeoutMs = opts.writeTimeoutMs ?? 2500;
  const COLS = "cache_key, utc_at, provider, adapter_version, node_type, engine_version, schema_version, longitudes";
  return {
    async read(utcIso, nodeType, accept) {
      let key: string;
      try { key = planetCacheKey(utcIso, nodeType); } catch { return { status: "unavailable", reason: "bad_moment" }; }
      for (let depth = 0; depth <= MAX_REPAIR_DEPTH; depth++) {
        let res: { data: unknown; error: { code?: string; message?: string } | null };
        try {
          const r = (await withTimeout(db.from(HD_TRANSIT_PLANET_TABLE).select(COLS).eq("cache_key", key).limit(1), readTimeoutMs)) as { data: unknown; error: typeof res.error };
          res = { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data ?? null, error: r.error };
        } catch (e) {
          log("[hd-transit] planet store read failed", { reason: String((e as Error)?.message ?? e).slice(0, 80) });
          return { status: "unavailable", reason: "read_error" };
        }
        if (res.error) {
          if (isMissingTable(res.error)) return { status: "unavailable", reason: "table_missing" };
          log("[hd-transit] planet store read error", { code: res.error.code ?? null });
          return { status: "unavailable", reason: "read_error" };
        }
        if (!res.data) return { status: "miss", cacheKey: key, repaired: depth > 0 };
        const lon = validatePlanetRow(res.data as Row, { cacheKey: key, utcIso, nodeType });
        if (lon && accept(lon)) return { status: "hit", cacheKey: key, lon, repaired: depth > 0 };
        // Geçersiz kayıt: silinmez; deterministik onarım anahtarına geç (günlükte yalnız UTC an + derinlik).
        log("[hd-transit] planet store invalid row", { utc: utcIso, depth, schemaOk: !!lon });
        key = repairCacheKey(key, (res.data as Row).longitudes);
      }
      return { status: "unavailable", reason: "repair_depth" };
    },
    async write(cacheKey, utcIso, nodeType, lon) {
      const longitudes: Record<string, number> = {};
      for (const b of STORED_BODIES) longitudes[b] = lon[b];
      try {
        const { error } = (await withTimeout(
          db.from(HD_TRANSIT_PLANET_TABLE).insert({
            cache_key: cacheKey,
            utc_at: utcIso,
            provider: HD_TRANSIT_PLANET_PROVIDER,
            adapter_version: ROXY_PLANETS_ADAPTER_VERSION,
            node_type: nodeType,
            engine_version: HD_TRANSIT_PLANET_ENGINE_VERSION,
            schema_version: HD_TRANSIT_PLANET_SCHEMA_VERSION,
            longitudes,
          }),
          writeTimeoutMs,
        )) as { error: { code?: string } | null };
        if (!error) return "stored";
        if (error.code === "23505") return "exists"; // başka örnek aynı anı yazdı — değer aynı doğrulamadan geçti
        log("[hd-transit] planet store write error", { code: error.code ?? null });
        return "failed";
      } catch (e) {
        log("[hd-transit] planet store write failed", { reason: String((e as Error)?.message ?? e).slice(0, 80) });
        return "failed";
      }
    },
  };
}

/** Özellik bayrağı: HD_TRANSIT_PLANET_STORE=off → kalıcı tablo kullanılmaz (eski Next Data Cache yolu). Varsayılan AÇIK. */
export function hdTransitPlanetStoreEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.HD_TRANSIT_PLANET_STORE ?? "").trim().toLowerCase() !== "off";
}
