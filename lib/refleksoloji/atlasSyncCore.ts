/**
 * Refleksoloji Atlas senkron çekirdeği (SAF — DOM/localStorage/fetch yok) — FA-13/24.
 *
 * İçerir:
 *   - atlasContentHash: `_meta.updated_at` HARİÇ kararlı içerik özeti. Her kayıt/
 *     birleştirme `updated_at`'i değiştirdiğinden eski JSON-dedupe hiç tutmuyordu
 *     → açılışta/her hydrate'te gereksiz PUT. Artık yalnız GERÇEK içerik değişince PUT.
 *   - hasAtlasContent / hasAtlasTombstones: boş (hidrasyonsuz) belgenin dolu sunucu
 *     belgesini ezmesini engelleyen istemci kuralı.
 *   - decideAtlasPut: sunucu PUT kararı (satır varken expected null → 409; dolu
 *     belgeyi boşla değiştirme → 409, allow_empty yoksa).
 *   - Eski (v1, sahipsiz) atlas sınıflandırma + açık onaylı içe aktarma.
 */

import { isOrganEntryLike, markOrganUpserted, normOrgan, type AtlasDocLike } from "./atlasMerge";

// ─── Kararlı içerik özeti ────────────────────────────────────────────────────

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 33) + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Belgenin `_meta.updated_at` alanı çıkarılmış kopyası (hash girdisi). */
function withoutVolatileMeta(doc: unknown): unknown {
  if (!doc || typeof doc !== "object") return {};
  const d = doc as Record<string, unknown>;
  const meta = d._meta && typeof d._meta === "object" ? { ...(d._meta as Record<string, unknown>) } : undefined;
  if (meta) delete meta.updated_at;
  return meta ? { ...d, _meta: meta } : { ...d };
}

function normalizeOrganListForHash(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((o): o is string => typeof o === "string" && o.trim().length > 0)
    .map((o) => o.trim())
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** İçerik özeti — `_meta.updated_at` HARİÇ; organ listesi sırası önemsiz. */
export function atlasContentHash(document: unknown, organList: unknown): string {
  const s = stableStringify({
    document: withoutVolatileMeta(document),
    organ_list: normalizeOrganListForHash(organList),
  });
  return `${fnv1a(s)}${djb2(s)}${s.length.toString(16)}`;
}

export function atlasOrganKeys(document: unknown): string[] {
  if (!document || typeof document !== "object") return [];
  const d = document as Record<string, unknown>;
  return Object.keys(d).filter((k) => k !== "_meta" && isOrganEntryLike(d[k]));
}

/** Belgede organ VEYA organ listesinde ad var mı. */
export function hasAtlasContent(document: unknown, organList: unknown): boolean {
  return atlasOrganKeys(document).length > 0 || normalizeOrganListForHash(organList).length > 0;
}

/** Açık silme izi (mezar taşı) var mı — boş belge ancak bununla "bilinçli boş" sayılır. */
export function hasAtlasTombstones(document: unknown): boolean {
  if (!document || typeof document !== "object") return false;
  const meta = (document as { _meta?: { tombstones?: unknown } })._meta;
  const t = meta?.tombstones;
  return !!t && typeof t === "object" && Object.keys(t as object).length > 0;
}

/**
 * İstemci PUT ön-kararı. Boş belge (organ yok + liste boş):
 *   - mezar taşı yoksa → GÖNDERME (hidrasyonsuz/boş yerel durum sunucuyu ezmesin)
 *   - mezar taşı varsa  → kullanıcı son organı sildi → allow_empty ile gönder
 */
export function planAtlasPush(
  document: unknown,
  organList: unknown,
  baseHash: string | null,
): { send: false; reason: "unchanged" | "empty" } | { send: true; allowEmpty: boolean; hash: string } {
  const hash = atlasContentHash(document, organList);
  if (baseHash && hash === baseHash) return { send: false, reason: "unchanged" };
  if (!hasAtlasContent(document, organList)) {
    if (!hasAtlasTombstones(document)) return { send: false, reason: "empty" };
    return { send: true, allowEmpty: true, hash };
  }
  return { send: true, allowEmpty: false, hash };
}

// ─── Sunucu PUT kararı ───────────────────────────────────────────────────────

/**
 * P1-5: ATLAS_STALE (409) için TEK Türkçe mesaj — insert yarışı, CAS kaybı ve expected
 * uyuşmazlığı aynı metni döndürür (istemci kendi çakışma mesajını gösterir).
 */
export const ATLAS_STALE_ERROR = "Atlas başka bir cihazda güncellendi.";

export type AtlasCurrentRow = {
  updated_at: string;
  document: unknown;
  organ_list: unknown;
} | null;

export type AtlasPutDecision =
  | { kind: "insert" }
  | { kind: "update"; expected: string }
  | {
      kind: "conflict";
      code: "ATLAS_BASE_REQUIRED" | "ATLAS_STALE" | "ATLAS_EMPTY_OVERWRITE" | "ATLAS_SHRINK";
      error: string;
    };

/**
 * RF-13 / RF-02 savunma-derinliği: sunucudaki bir organ gelen belgede YOKSA ve gelen
 * `_meta.tombstones` bu organ için mezar taşı taşımıyorsa → bu bir silme değil, bayat /
 * eksik yerel durumdur. Tüm meşru silme yolları (organ sil, son bölgeyi sil, yeniden
 * adlandır) mezar taşı yazar. Dönüş: mezar taşsız düşen organ anahtarları.
 */
export function findUntombstonedOrganDrops(current: unknown, incoming: unknown): string[] {
  const incomingKeys = new Set(atlasOrganKeys(incoming).map(normOrgan));
  const meta =
    incoming && typeof incoming === "object"
      ? ((incoming as { _meta?: { tombstones?: Record<string, unknown> } })._meta ?? {})
      : {};
  const tombstones = meta.tombstones && typeof meta.tombstones === "object" ? meta.tombstones : {};
  const drops: string[] = [];
  for (const key of atlasOrganKeys(current)) {
    const norm = normOrgan(key);
    if (incomingKeys.has(norm)) continue;
    if (typeof tombstones[norm] === "string") continue;
    drops.push(key);
  }
  return drops;
}

export function decideAtlasPut(input: {
  current: AtlasCurrentRow;
  expected: string | null;
  incomingDocument: unknown;
  incomingOrganList: unknown;
  allowEmpty: boolean;
}): AtlasPutDecision {
  const { current, expected } = input;
  if (!current) return { kind: "insert" };

  // Satır VAR ama istemci sunucu sürümünü bilmiyor (hiç GET yapmamış / eski istemci)
  // → körlemesine üzerine yazma YOK.
  if (expected === null) {
    return {
      kind: "conflict",
      code: "ATLAS_BASE_REQUIRED",
      error: "Atlas sunucuda mevcut; önce güncel atlas yüklenmeli.",
    };
  }
  if (current.updated_at !== expected) {
    return { kind: "conflict", code: "ATLAS_STALE", error: ATLAS_STALE_ERROR };
  }
  const incomingEmpty = !hasAtlasContent(input.incomingDocument, input.incomingOrganList);
  const currentHasContent = hasAtlasContent(current.document, current.organ_list);
  if (incomingEmpty && currentHasContent && !input.allowEmpty) {
    return {
      kind: "conflict",
      code: "ATLAS_EMPTY_OVERWRITE",
      error: "Dolu atlas boş bir belgeyle değiştirilemez.",
    };
  }
  if (findUntombstonedOrganDrops(current.document, input.incomingDocument).length > 0) {
    return {
      kind: "conflict",
      code: "ATLAS_SHRINK",
      error: "Atlas eksik bir yerel kopyayla değiştirilemez; güncel atlas yükleniyor.",
    };
  }
  return { kind: "update", expected };
}

// ─── Eski (v1) atlas: sınıflandırma + açık onaylı içe aktarma ────────────────

export type LegacyAtlasPayload = { document: AtlasDocLike; organ_list: string[] };

/**
 * Eski atlas sunucu içeriğiyle KANITLANABİLİR biçimde örtüşüyor mu?
 *   - Her eski organ sunucuda aynı kanonik adla ve BİREBİR aynı bölgelerle var
 *   - Eski organ listesindeki her ad sunucu organ/listesinde var
 * → "identical": hiçbir şey kaybolmadan eski anahtar bırakılabilir.
 * Aksi halde → "quarantine" (kullanıcı kararı).
 */
export function classifyLegacyAtlas(
  legacy: LegacyAtlasPayload,
  server: { document: unknown; organ_list: string[] },
): "empty" | "identical" | "quarantine" {
  const legacyOrgans = atlasOrganKeys(legacy.document);
  const legacyList = normalizeOrganListForHash(legacy.organ_list);
  if (legacyOrgans.length === 0 && legacyList.length === 0) return "empty";

  const sDoc = (server.document && typeof server.document === "object" ? server.document : {}) as Record<string, unknown>;
  const serverByKey = new Map<string, unknown>();
  for (const k of atlasOrganKeys(sDoc)) serverByKey.set(normOrgan(k), sDoc[k]);
  const serverNames = new Set<string>([
    ...serverByKey.keys(),
    ...normalizeOrganListForHash(server.organ_list).map(normOrgan),
  ]);

  for (const k of legacyOrgans) {
    const s = serverByKey.get(normOrgan(k));
    if (!s) return "quarantine";
    if (stableStringify(s) !== stableStringify((legacy.document as Record<string, unknown>)[k])) {
      return "quarantine";
    }
  }
  for (const name of legacyList) {
    if (!serverNames.has(normOrgan(name))) return "quarantine";
  }
  return "identical";
}

/**
 * İki atlas içerik olarak EŞDEĞER mi: aynı kanonik organ kümesi, birebir aynı bölge
 * girdileri ve aynı organ-listesi ad kümesi (`_meta` ve sıra önemsiz). Hidrasyon
 * sonrası "yerel = sunucu" tespiti (yanlış "eşitlenmemiş değişiklik" uyarısı olmasın).
 */
export function atlasEquivalent(
  a: { document: unknown; organ_list: unknown },
  b: { document: unknown; organ_list: unknown },
): boolean {
  const entries = (doc: unknown): Map<string, string> => {
    const d = (doc && typeof doc === "object" ? doc : {}) as Record<string, unknown>;
    const m = new Map<string, string>();
    for (const k of atlasOrganKeys(d)) m.set(normOrgan(k), stableStringify(d[k]));
    return m;
  };
  const ea = entries(a.document);
  const eb = entries(b.document);
  if (ea.size !== eb.size) return false;
  for (const [k, v] of ea) if (eb.get(k) !== v) return false;
  const names = (list: unknown, e: Map<string, string>): Set<string> =>
    new Set([...normalizeOrganListForHash(list).map(normOrgan), ...e.keys()]);
  const na = names(a.organ_list, ea);
  const nb = names(b.organ_list, eb);
  if (na.size !== nb.size) return false;
  for (const k of na) if (!nb.has(k)) return false;
  return true;
}

type Bucket = { sol?: unknown[]; sag?: unknown[] };

function regionId(r: unknown): string | null {
  return r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string"
    ? (r as { id: string }).id
    : null;
}

/**
 * Kullanıcı "Bana ait, içe aktar" dediğinde: eski organları mevcut atlasa EKLER.
 *   - Mevcutta olmayan organ → eklenir (+ damga)
 *   - Her ikisinde olan organ → bölgeler id bazında birleşir (mevcut kazanır)
 *   - Eski mezar taşları İÇE AKTARILMAZ (mevcut organları silemesin)
 * Döndürür: yeni belge + birleşik organ listesi + eklenen/değişen organ sayısı.
 */
export function importLegacyAtlas(
  current: { document: AtlasDocLike; organ_list: string[] },
  legacy: LegacyAtlasPayload,
  now: string = new Date().toISOString(),
): { document: AtlasDocLike; organ_list: string[]; changedOrgans: number } {
  const next = JSON.parse(JSON.stringify(current.document ?? {})) as AtlasDocLike;
  const byKey = new Map<string, string>();
  for (const k of atlasOrganKeys(next)) byKey.set(normOrgan(k), k);

  let changedOrgans = 0;
  for (const legacyName of atlasOrganKeys(legacy.document)) {
    const legacyEntry = (legacy.document as Record<string, unknown>)[legacyName] as Record<string, Bucket>;
    const existingName = byKey.get(normOrgan(legacyName));
    if (!existingName) {
      next[legacyName] = JSON.parse(JSON.stringify(legacyEntry));
      markOrganUpserted(next, legacyName, now);
      byKey.set(normOrgan(legacyName), legacyName);
      changedOrgans++;
      continue;
    }
    const target = next[existingName] as Record<string, Bucket>;
    let changed = false;
    for (const view of Object.keys(legacyEntry)) {
      const lb = legacyEntry[view];
      if (!lb || typeof lb !== "object") continue;
      if (!target[view] || typeof target[view] !== "object") {
        target[view] = { sol: [], sag: [] };
      }
      for (const foot of ["sol", "sag"] as const) {
        const src = Array.isArray(lb[foot]) ? (lb[foot] as unknown[]) : [];
        const dst = Array.isArray(target[view][foot]) ? (target[view][foot] as unknown[]) : [];
        const ids = new Set(dst.map(regionId).filter((x): x is string => !!x));
        for (const r of src) {
          const id = regionId(r);
          if (id && ids.has(id)) continue;
          dst.push(JSON.parse(JSON.stringify(r)));
          if (id) ids.add(id);
          changed = true;
        }
        target[view][foot] = dst;
      }
    }
    if (changed) {
      markOrganUpserted(next, existingName, now);
      changedOrgans++;
    }
  }

  const seen = new Set<string>();
  const organ_list: string[] = [];
  for (const name of [...(current.organ_list ?? []), ...(legacy.organ_list ?? [])]) {
    const t = (name ?? "").trim();
    if (!t) continue;
    const k = normOrgan(t);
    if (seen.has(k)) continue;
    seen.add(k);
    organ_list.push(t);
  }
  organ_list.sort((a, b) => a.localeCompare(b, "tr"));

  const meta = (next._meta ?? {}) as Record<string, unknown>;
  next._meta = { ...meta, version: "1", updated_at: now };
  return { document: next, organ_list, changedOrgans };
}
