// Klasik Numeroloji · Doğaltaş Kütüphanesi adaptörü (YALNIZ SUNUCU; YALNIZ OKUMA).
//
// Aday taş dizini YALNIZ uzman yayın RPC'lerinden kurulur (stone_library_viewer_allowed → stone_library_expert_search
// → stone_library_expert_stone). Tablolara doğrudan erişim YOK; kütüphaneye / taş tablolarına YAZMA YOK.
// Kütüphane bayrağı (STONE_LIBRARY_ENABLED) tam "true" değilse ya da uzmanın owner'dan aldığı etkin yetkisi yoksa
// { available:false } döner → eşleştirici yedek modda çalışır (doğrudan öneriler yalnız metin).
// Her taş kartı kütüphanenin kendi beyaz liste + sızıntı filtresinden geçer (toExpertStoneDoc + findStoneLibraryLeaks);
// sızıntılı kart dizine alınmaz. Dizinde yalnız slug / ad / facet anahtarı bulunur (kaynak adı, iç uuid, lisans YOK).
//
// Stok rozeti: `dogaltas_inventory` YALNIZ select (tenant oturumdan); mevcut Numeroloji rozetiyle aynı anlam (stock.ts).
//
// NOT: `import "server-only"` bu repoda tsx harness'lerini kırdığı için (bkz. lib/server/serverOnlyGuard.ts) aynı
// gerekçeyle assertServerOnly kullanılır.

import { assertServerOnly } from "../../server/serverOnlyGuard";
import { STONE_LIBRARY_ENV_FLAG, STONE_LIBRARY_RPC, STONE_LIBRARY_SEARCH_LIMITS } from "../../stone-library/contract";
import { findStoneLibraryLeaks, isStoneLibrarySlug, stoneDocAllowedLabels, toExpertSearchResult, toExpertStoneDoc } from "../../stone-library/expertDto";
import { buildClassicStockIndex, classicStockBadge, type ClassicStockBadge } from "./stock";
import type { StoneCandidate } from "./types";

assertServerOnly("lib/numeroloji-klasik/stones/libraryAdapter");

type RpcResult = { data: unknown; error: unknown };
/** Yapısal DB arayüzü (Supabase istemcisi ya da test sahtesi). */
export type ClassicStoneDb = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        order(col: string, opts?: { ascending?: boolean }): { range(from: number, to: number): PromiseLike<RpcResult> };
      };
    };
  };
};

export type ClassicStoneIndexUnavailableReason = "library_disabled" | "no_access" | "unavailable" | "empty";

export type ClassicStoneIndexResult =
  | { available: true; index: StoneCandidate[]; truncated: boolean; skipped: number }
  | { available: false; reason: ClassicStoneIndexUnavailableReason };

/** Uzmana gösterilecek Türkçe açıklama (iç ayrıntı / kaynak adı içermez). */
export const CLASSIC_STONE_UNAVAILABLE_TR: Readonly<Record<ClassicStoneIndexUnavailableReason, string>> = Object.freeze({
  library_disabled: "Doğaltaş Kütüphanesi henüz açılmadı; önerilen taşlar yalnız ad olarak gösterilir.",
  no_access: "Doğaltaş Kütüphanesi erişiminiz bulunmuyor; önerilen taşlar yalnız ad olarak gösterilir.",
  unavailable: "Doğaltaş Kütüphanesi şu an okunamadı; önerilen taşlar yalnız ad olarak gösterilir.",
  empty: "Doğaltaş Kütüphanesinde yayında taş bulunmuyor; önerilen taşlar yalnız ad olarak gösterilir.",
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isClassicStoneLibraryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[STONE_LIBRARY_ENV_FLAG] === "true";
}

/** PostgREST skaler RPC sonucu → boolean (lib/stone-library/access.ts rpcBoolean ile aynı; o modül auth zincirini yüklediği için kopyalandı). */
function rpcBoolean(data: unknown): boolean {
  let v: unknown = data;
  if (Array.isArray(v)) v = v.length ? v[0] : null;
  if (v && typeof v === "object") v = Object.values(v as Record<string, unknown>)[0] ?? null;
  return v === true;
}

function rpcJson(data: unknown, fn: string): unknown {
  if (Array.isArray(data)) {
    const first = data[0] as Record<string, unknown> | undefined;
    return first && typeof first === "object" && fn in first ? first[fn] : first;
  }
  return data;
}

/** Yayın dokümanı → eşleştirici adayı (yalnız güvenli alanlar). */
export function stoneDocToCandidate(raw: unknown): StoneCandidate | null {
  const doc = toExpertStoneDoc(raw);
  if (!doc) return null;
  if (findStoneLibraryLeaks(doc, stoneDocAllowedLabels(doc)).length > 0) return null;
  const keys = (v: { key: string }[] | undefined) => (v ?? []).map((x) => x.key);
  return {
    stoneKey: doc.slug,
    nameTr: doc.name_tr,
    nameEn: doc.name_en,
    aliases: doc.aliases.map((a) => a.name),
    numericalVibration: doc.facets.numerical_vibration ?? null,
    planets: keys(doc.facets.planet),
    chakras: keys(doc.facets.chakra),
    elements: keys(doc.facets.element),
    pairsWith: doc.pairings.map((p) => p.slug),
  };
}

type CacheEntry = { at: number; value: { index: StoneCandidate[]; truncated: boolean; skipped: number } };
// Yayın yüzeyi tüm yetkili uzmanlar için AYNIDIR (tenant'sız); erişim her çağrıda ayrıca doğrulanır.
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

export function clearClassicStoneIndexCache(): void {
  cache = null;
}

export type LoadClassicStoneIndexInput = {
  db: ClassicStoneDb;
  viewerId: string;
  env?: Record<string, string | undefined>;
  /** Dizine alınacak en çok taş (varsayılan 300). */
  maxStones?: number;
  concurrency?: number;
  now?: () => number;
  useCache?: boolean;
};

export async function loadClassicStoneIndex(input: LoadClassicStoneIndexInput): Promise<ClassicStoneIndexResult> {
  if (!isClassicStoneLibraryEnabled(input.env)) return { available: false, reason: "library_disabled" };
  if (!input.viewerId || !UUID_RE.test(input.viewerId)) return { available: false, reason: "no_access" };
  const now = input.now ?? Date.now;
  try {
    const allowed = await input.db.rpc(STONE_LIBRARY_RPC.viewerAllowed, { p_viewer: input.viewerId });
    if (allowed.error) return { available: false, reason: "unavailable" };
    if (!rpcBoolean(allowed.data)) return { available: false, reason: "no_access" };

    if (input.useCache !== false && cache && now() - cache.at < CACHE_TTL_MS) {
      return cache.value.index.length ? { available: true, ...cache.value } : { available: false, reason: "empty" };
    }

    const maxStones = Math.max(1, Math.min(1000, Math.trunc(input.maxStones ?? 300)));
    const pageSize = STONE_LIBRARY_SEARCH_LIMITS.pageMax;
    const slugs: string[] = [];
    let total = 0;
    for (let offset = 0; offset < maxStones; offset += pageSize) {
      const res = await input.db.rpc(STONE_LIBRARY_RPC.expertSearch, {
        p_viewer: input.viewerId,
        p_query: "",
        p_filters: {},
        p_limit: Math.min(pageSize, maxStones - offset),
        p_offset: offset,
      });
      if (res.error) return { available: false, reason: "unavailable" };
      const page = toExpertSearchResult(rpcJson(res.data, STONE_LIBRARY_RPC.expertSearch));
      if (!page) return { available: false, reason: "unavailable" };
      total = page.total;
      for (const it of page.items) if (isStoneLibrarySlug(it.slug) && !slugs.includes(it.slug)) slugs.push(it.slug);
      if (page.items.length === 0 || offset + page.items.length >= total) break;
    }
    const truncated = total > slugs.length;

    const conc = Math.max(1, Math.min(8, Math.trunc(input.concurrency ?? 4)));
    const out: (StoneCandidate | null)[] = new Array(slugs.length).fill(null);
    let next = 0;
    let failed = false;
    const worker = async () => {
      while (next < slugs.length && !failed) {
        const i = next++;
        const r = await input.db.rpc(STONE_LIBRARY_RPC.expertStone, { p_viewer: input.viewerId, p_slug: slugs[i] });
        if (r.error) {
          failed = true;
          return;
        }
        out[i] = stoneDocToCandidate(rpcJson(r.data, STONE_LIBRARY_RPC.expertStone));
      }
    };
    await Promise.all(Array.from({ length: Math.min(conc, Math.max(1, slugs.length)) }, worker));
    if (failed) return { available: false, reason: "unavailable" };
    const index = out.filter((x): x is StoneCandidate => x !== null);
    const value = { index, truncated, skipped: slugs.length - index.length };
    if (input.useCache !== false) cache = { at: now(), value };
    if (index.length === 0) return { available: false, reason: "empty" };
    return { available: true, ...value };
  } catch {
    return { available: false, reason: "unavailable" };
  }
}

/**
 * Stok rozetleri: uzmanın KENDİ tenant'ındaki `dogaltas_inventory` (YALNIZ SELECT, sayfalı). Okuma hatasında rozet
 * gösterilmez (boş). tenantId oturumdan gelmelidir; istek gövdesinden ASLA.
 */
export async function lookupClassicStockBadges(
  db: ClassicStoneDb,
  tenantId: string,
  names: readonly string[],
  pageSize = 1000,
): Promise<ClassicStockBadge[]> {
  const uniq = [...new Set(names.filter((n) => typeof n === "string" && n.trim().length > 0))];
  if (uniq.length === 0 || !tenantId) return uniq.map((name) => ({ name, stocked: false, adet: 0, label: "" }));
  const rows: { name?: unknown; adet?: unknown }[] = [];
  try {
    for (let from = 0; from < 50_000; from += pageSize) {
      const res = await db.from("dogaltas_inventory").select("name, adet").eq("tenant_id", tenantId).order("name").range(from, from + pageSize - 1);
      if (res.error) return uniq.map((name) => ({ name, stocked: false, adet: 0, label: "" }));
      const batch = Array.isArray(res.data) ? (res.data as { name?: unknown; adet?: unknown }[]) : [];
      rows.push(...batch);
      if (batch.length < pageSize) break;
    }
  } catch {
    return uniq.map((name) => ({ name, stocked: false, adet: 0, label: "" }));
  }
  const idx = buildClassicStockIndex(rows);
  return uniq.map((name) => classicStockBadge(name, idx));
}
