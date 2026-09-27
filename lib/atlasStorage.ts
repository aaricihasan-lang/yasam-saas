import type { FootSide, FootView, Region, RegionPoint, RegionShapeType } from "@/app/refleksoloji/bolge-haritasi/types";
import { organKey } from "@/app/refleksoloji/bolge-haritasi/utils/organUtils";
import {
  scheduleAtlasSync,
  setAtlasSyncSuspended,
  registerAtlasConflictResolver,
  registerAtlasLocalReader,
  hydrateAtlasFromServer,
  markAtlasHydrated,
  setAtlasBaseHash,
  type AtlasServerState,
} from "@/lib/refleksolojiAtlasSync";
import {
  markOrganDeleted,
  markOrganUpserted,
  mergeAtlasWithTombstones,
  mergeOrganListsWithTombstones,
  type AtlasDocLike,
  type OrganTimeMap,
} from "@/lib/refleksoloji/atlasMerge";
import { normalizeAtlasDocument } from "@/lib/refleksoloji/atlasNormalize";
import {
  atlasContentHash,
  atlasEquivalent,
  classifyLegacyAtlas,
  importLegacyAtlas,
  type LegacyAtlasPayload,
} from "@/lib/refleksoloji/atlasSyncCore";
import {
  LEGACY_QUARANTINE_KEYS,
  LEGACY_REFLEX_KEYS,
  readRawJson,
  removeRaw,
  writeRawJson,
} from "@/lib/refleksoloji/scopedStorage";
import { currentReflexScopeId, readReflex, writeReflex } from "@/lib/refleksoloji/reflexStore";

/**
 * FA-04: atlas + organ listesi artık kullanıcı/tenant kapsamlı
 * (`refleks:v2:{tenant}:{user}:atlas|organs`). Aşağıdaki eski (v1, cihaz geneli)
 * anahtarlar yalnız eski veri taşıma/karantina için OKUNUR.
 */
export const ATLAS_STORAGE_KEY = LEGACY_REFLEX_KEYS.atlas;
export const ORGAN_LIST_STORAGE_KEY = LEGACY_REFLEX_KEYS.organs;

export type AtlasMeta = {
  updated_at: string;
  version: string;
  // Çok-cihazlı zombie/duplicate koruması — mezar taşları + organ son-güncelleme.
  // Belgeyle birlikte jsonb olarak senkron olur (şema değişikliği yok).
  tombstones?: OrganTimeMap;
  organUpdatedAt?: OrganTimeMap;
};

export type StoredRegion = {
  id: string;
  shape: RegionShapeType;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  angle?: number;
  points?: RegionPoint[];
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  lineWidth?: number;
  color?: string;
};

export type AtlasFootBucket = {
  sol: StoredRegion[];
  sag: StoredRegion[];
};

/**
 * Canonical organ entry — EKOLE BAĞIMSIZ 3 görünüm bucket'ı. Region'ın görünüm
 * kimliği bucket konumundan türer (region.view = bucket). "yan" bucket'ı YENİ
 * kayıtta YAZILMAZ; yalnız legacy belgede bulunur ve normalizasyonda dönüştürülür.
 */
export type AtlasOrganEntry = {
  taban: AtlasFootBucket;
  yan_ic: AtlasFootBucket;
  yan_dis: AtlasFootBucket;
};

/** Legacy (eski) organ entry — yalnız normalizasyon girdisi olarak tanınır. */
export type LegacyAtlasOrganEntry = {
  taban: AtlasFootBucket;
  yan: AtlasFootBucket;
};

export type AtlasDocument = {
  _meta: AtlasMeta;
} & Record<string, AtlasOrganEntry | AtlasMeta>;

function emptyFootBucket(): AtlasFootBucket {
  return { sol: [], sag: [] };
}

export function emptyOrganEntry(): AtlasOrganEntry {
  return {
    taban: emptyFootBucket(),
    yan_ic: emptyFootBucket(),
    yan_dis: emptyFootBucket(),
  };
}

function createEmptyAtlas(): AtlasDocument {
  return {
    _meta: { version: "1", updated_at: new Date().toISOString() },
  };
}

function isOrganEntry(value: unknown): value is AtlasOrganEntry {
  if (typeof value !== "object" || value === null) return false;
  // Organ entry = taban + en az bir yan varyantı. Yeni: yan_ic/yan_dis; legacy: yan.
  return (
    "taban" in value &&
    ("yan_ic" in value || "yan_dis" in value || "yan" in value)
  );
}

export function footToStorageKey(foot: FootSide): "sol" | "sag" {
  return foot === "left" ? "sol" : "sag";
}

export function storageKeyToFoot(key: "sol" | "sag"): FootSide {
  return key === "sol" ? "left" : "right";
}

export function regionToStored(region: Region): StoredRegion {
  return {
    id: region.id,
    shape: region.shape,
    cx: region.cx,
    cy: region.cy,
    rx: region.rx,
    ry: region.ry,
    angle: region.angle,
    points: region.points,
    x1: region.x1,
    y1: region.y1,
    x2: region.x2,
    y2: region.y2,
    lineWidth: region.lineWidth,
    color: region.color,
  };
}

export function storedToRegion(
  stored: StoredRegion,
  organ: string,
  footSide: FootSide,
  view: FootView,
): Region {
  return {
    id: stored.id,
    organ,
    footSide,
    view,
    shape: stored.shape,
    cx: stored.cx,
    cy: stored.cy,
    rx: stored.rx,
    ry: stored.ry,
    angle: stored.angle,
    points: stored.points,
    x1: stored.x1,
    y1: stored.y1,
    x2: stored.x2,
    y2: stored.y2,
    lineWidth: stored.lineWidth,
    color: stored.color,
  };
}

function regionsToOrganEntry(regions: Region[]): AtlasOrganEntry {
  const entry = emptyOrganEntry();

  for (const region of regions) {
    const footKey = footToStorageKey(region.footSide);
    // region.view canonical (taban/yan_ic/yan_dis) → doğrudan bucket. "yan" YAZILMAZ.
    const bucket = entry[region.view];
    if (!bucket) continue; // savunmacı: normalize edilmemiş legacy "yan" region asla buraya gelmemeli
    bucket[footKey].push(regionToStored(region));
  }

  return entry;
}

export function listOrganNamesFromAtlas(atlas: AtlasDocument): string[] {
  return Object.keys(atlas)
    .filter((key) => key !== "_meta" && isOrganEntry(atlas[key]))
    .sort((a, b) => a.localeCompare(b, "tr"));
}

/**
 * P1-1: hydrate birleştirme — sunucu ve yerel atlas belgelerini organ bazında
 * birleştirir. Ortak organda sunucu kazanır; yalnız yerelde olan organlar KORUNUR
 * (hydrate'te yerel-özel organ kaybolmaz → veri kaybı yok).
 */
export function mergeAtlasDocuments(
  server: AtlasDocument,
  local: AtlasDocument,
): AtlasDocument {
  // Tombstone-farkında birleştirme: ortak organda sunucu kazanır; yalnız yerelde
  // olan organ korunur AMA silinme/yeniden-adlandırma mezar taşı son güncellemeden
  // yeniyse organ DİRİLMEZ (zombie/duplicate engellenir). Mezar taşları _meta'da.
  return mergeAtlasWithTombstones(
    server as unknown as AtlasDocLike,
    local as unknown as AtlasDocLike,
  ) as unknown as AtlasDocument;
}

/** İki organ listesini birleştirir (Türkçe-duyarsız, tekilleştirilmiş). */
export function unionOrganLists(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...a, ...b]) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) continue;
    const key = organKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.sort((x, y) => x.localeCompare(y, "tr"));
}

export function loadOrganList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = readReflex<unknown>("organs");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((o): o is string => typeof o === "string" && o.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveOrganList(organs: string[]): boolean {
  if (typeof window === "undefined") return false;
  const ok = writeReflex("organs", organs);
  // P1-1: organ listesi değişince (kullanıcı eylemi) senkron planla. Hidrasyon
  // yazımları suspend ile bastırılır; hidrasyon bitmeden PUT gitmez (FA-13).
  if (ok) scheduleAtlasSync();
  return ok;
}

export function loadAtlas(): AtlasDocument {
  if (typeof window === "undefined") return createEmptyAtlas();
  try {
    const parsed = readReflex<AtlasDocument>("atlas");
    if (!parsed || typeof parsed !== "object") return createEmptyAtlas();
    if (!parsed._meta) {
      parsed._meta = { version: "1", updated_at: new Date().toISOString() };
    }
    // CANONICAL SINIR: legacy `{taban,yan}` → `{taban,yan_ic,yan_dis}`. Downstream
    // yalnız 3-görünüm görür; UI legacy şekli asla bilmez. Idempotent (yeni → no-op).
    return normalizeAtlasDocument(parsed);
  } catch {
    return createEmptyAtlas();
  }
}

export function saveAtlas(atlas: AtlasDocument): boolean {
  if (typeof window === "undefined") return false;
  const prevMeta = (atlas._meta ?? {}) as AtlasMeta;
  const next: AtlasDocument = {
    ...atlas,
    _meta: {
      version: "1",
      updated_at: new Date().toISOString(),
      // Mezar taşlarını/organ zaman damgalarını KORU (senkron için kritik).
      tombstones: prevMeta.tombstones ?? {},
      organUpdatedAt: prevMeta.organUpdatedAt ?? {},
    },
  };
  const ok = writeReflex("atlas", next);
  // P1-1: atlas değişince (kullanıcı eylemi) senkron planla — içerik flush anında okunur.
  if (ok) scheduleAtlasSync();
  return ok;
}

export function getRegionsForOrgan(
  atlas: AtlasDocument,
  organ: string,
  filter?: { foot?: FootSide; view?: FootView },
): Region[] {
  const entry = atlas[organ];
  if (!isOrganEntry(entry)) return [];

  const views: FootView[] = filter?.view ? [filter.view] : ["taban", "yan_ic", "yan_dis"];
  const footKeys: ("sol" | "sag")[] = filter?.foot
    ? [footToStorageKey(filter.foot)]
    : ["sol", "sag"];

  const result: Region[] = [];

  for (const view of views) {
    const bucket = entry[view];
    if (!bucket) continue; // normalize edilmiş belgede 3 bucket da vardır
    for (const footKey of footKeys) {
      const storedList = bucket[footKey] ?? [];
      for (const stored of storedList) {
        result.push(storedToRegion(stored, organ, storageKeyToFoot(footKey), view));
      }
    }
  }

  return result;
}

export function getRegionsForOrgans(
  atlas: AtlasDocument,
  organs: string[],
  filter?: { foot?: FootSide; view?: FootView },
): Region[] {
  return organs.flatMap((organ) => getRegionsForOrgan(atlas, organ, filter));
}

export function buildDisplayRegions(
  atlas: AtlasDocument,
  draftRegions: Region[],
  deletedRegionIds: string[],
  selectedOrgans: string[],
  foot: FootSide,
  view: FootView,
): Region[] {
  const deleted = new Set(deletedRegionIds);
  const draftForView = draftRegions.filter(
    (r) =>
      selectedOrgans.includes(r.organ) &&
      r.footSide === foot &&
      r.view === view &&
      !deleted.has(r.id),
  );
  const draftIds = new Set(draftForView.map((r) => r.id));
  const fromAtlas = getRegionsForOrgans(atlas, selectedOrgans, { foot, view }).filter(
    (r) => !deleted.has(r.id) && !draftIds.has(r.id),
  );

  return [...fromAtlas, ...draftForView];
}

export function mergeDraftIntoAtlas(
  atlas: AtlasDocument,
  draftRegions: Region[],
  deletedRegionIds: string[] = [],
): AtlasDocument {
  const next = structuredClone(atlas) as AtlasDocument;
  const deleted = new Set(deletedRegionIds);

  // Etkilenen organları tespit et: draft'ı olan VEYA silinen bir bölgeye sahip.
  // Yalnız bunların son-güncelleme damgası tazelenir (değişmemiş organ bayat sanılmasın).
  const regionOwner = new Map<string, string>();
  for (const organ of listOrganNamesFromAtlas(atlas)) {
    for (const r of getRegionsForOrgan(atlas, organ)) regionOwner.set(r.id, organ);
  }
  const affected = new Set<string>(draftRegions.map((r) => r.organ));
  for (const id of deleted) {
    const owner = regionOwner.get(id);
    if (owner) affected.add(owner);
  }

  const organNames = new Set<string>([
    ...listOrganNamesFromAtlas(atlas),
    ...draftRegions.map((r) => r.organ),
  ]);

  for (const organ of organNames) {
    const merged = getRegionsForOrgan(atlas, organ).filter((r) => !deleted.has(r.id));

    for (const draft of draftRegions) {
      if (draft.organ !== organ) continue;
      const idx = merged.findIndex((r) => r.id === draft.id);
      if (idx >= 0) merged[idx] = draft;
      else merged.push(draft);
    }

    if (merged.length > 0) {
      next[organ] = regionsToOrganEntry(merged);
      if (affected.has(organ)) markOrganUpserted(next as unknown as AtlasDocLike, organ);
    } else if (isOrganEntry(next[organ])) {
      delete next[organ];
      markOrganDeleted(next as unknown as AtlasDocLike, organ);
    }
  }

  // _meta: mezar taşları/damgalar mark* ile güncellendi → koru; updated_at tazele.
  next._meta = {
    ...(next._meta as AtlasMeta),
    version: "1",
    updated_at: new Date().toISOString(),
  };
  return next;
}

export function removeOrganFromAtlas(atlas: AtlasDocument, organ: string): AtlasDocument {
  const next = structuredClone(atlas) as AtlasDocument;
  delete next[organ];
  // Mezar taşı bırak → başka cihazın bayat kopyası dirilmesin (zombie fix).
  markOrganDeleted(next as unknown as AtlasDocLike, organ);
  next._meta = {
    ...(next._meta as AtlasMeta),
    version: "1",
    updated_at: new Date().toISOString(),
  };
  return next;
}

export function atlasHasRegionId(atlas: AtlasDocument, regionId: string): boolean {
  for (const organ of listOrganNamesFromAtlas(atlas)) {
    if (getRegionsForOrgan(atlas, organ).some((r) => r.id === regionId)) return true;
  }
  return false;
}

/**
 * REF-001 — Atlas PUT 409 (concurrency conflict) çözücüsü.
 *
 * Sunucudaki güncel belge + yereldeki belge TOMBSTONE-FARKINDA birleştirilir (iki
 * sekmenin/cihazın eklemeleri kaybolmaz). Sonuç yerele yazılır (senkron döngüsü
 * tetiklenmez) ve retry PUT'u için döndürülür. Bu fonksiyon refleksolojiAtlasSync'e
 * kaydedilir (döngüsel import olmadan).
 */
function resolveAtlasConflict(server: AtlasServerState): {
  document: unknown;
  organ_list: string[];
} {
  const serverRaw =
    server.document && typeof server.document === "object"
      ? (server.document as AtlasDocument)
      : createEmptyAtlas();
  const serverDoc = normalizeAtlasDocument(serverRaw);
  const local = loadAtlas();
  const merged = mergeAtlasDocuments(serverDoc, local);
  const mergedList = unionOrganLists(server.organ_list, loadOrganList());

  // Yerele yaz AMA scheduleAtlasSync'i tetikleme (retry PUT'u flush yapacak).
  setAtlasSyncSuspended(true);
  try {
    writeReflex("atlas", merged);
    writeReflex("organs", mergedList);
  } finally {
    setAtlasSyncSuspended(false);
  }
  return { document: merged, organ_list: mergedList };
}

// İstemci tarafında modül yüklenince çözücüyü + yerel okuyucuyu kaydet (SSR'de no-op).
registerAtlasConflictResolver(resolveAtlasConflict);
registerAtlasLocalReader(() => ({ document: loadAtlas(), organ_list: loadOrganList() }));

// ─── Hidrasyon (TEK merkez) + eski (v1) veri karantinası ─────────────────────

function toLegacyPayload(doc: unknown, list: unknown): LegacyAtlasPayload {
  return {
    document: normalizeAtlasDocument(
      (doc && typeof doc === "object" ? doc : {}) as AtlasDocument,
    ) as unknown as AtlasDocLike,
    organ_list: Array.isArray(list)
      ? list.filter((o): o is string => typeof o === "string" && o.trim().length > 0)
      : [],
  };
}

function readLegacyAtlasPayload(): LegacyAtlasPayload | null {
  const doc = readRawJson<unknown>(LEGACY_REFLEX_KEYS.atlas);
  const list = readRawJson<unknown>(LEGACY_REFLEX_KEYS.organs);
  if (doc == null && list == null) return null;
  return toLegacyPayload(doc, list);
}

/** Karantina anahtarı `{document, organ_list}` biçimindedir. */
export function loadQuarantinedAtlas(): LegacyAtlasPayload | null {
  const q = readRawJson<{ document?: unknown; organ_list?: unknown }>(LEGACY_QUARANTINE_KEYS.atlas);
  if (!q || typeof q !== "object") return null;
  return toLegacyPayload(q.document, q.organ_list);
}

/** Karantinadaki (sahibi belirsiz) atlas organ sayısı. */
export function quarantinedAtlasOrganCount(): number {
  const q = loadQuarantinedAtlas();
  if (!q) return 0;
  return new Set(
    [...listOrganNamesFromAtlas(q.document as unknown as AtlasDocument), ...q.organ_list].map((n) =>
      organKey(n),
    ),
  ).size;
}

/**
 * Eski cihaz-geneli atlas: sunucuyla BİREBİR örtüşüyorsa (veri sunucuda) güvenle
 * bırakılır; değilse karantinaya taşınır (kullanıcı kararı). ASLA otomatik
 * silme / otomatik hesaba yükleme yok. Önce hedef yazılır, sonra kaynak kaldırılır.
 */
function processLegacyAtlas(serverDoc: AtlasDocument, serverList: string[]): void {
  const legacy = readLegacyAtlasPayload();
  if (!legacy) return;
  const cls = classifyLegacyAtlas(legacy, { document: serverDoc, organ_list: serverList });
  if (cls === "quarantine") {
    const existing = loadQuarantinedAtlas();
    const payload = existing ? importLegacyAtlas(existing, legacy) : legacy;
    const ok = writeRawJson(LEGACY_QUARANTINE_KEYS.atlas, {
      document: payload.document,
      organ_list: payload.organ_list,
    });
    if (!ok) return; // kota → kaynağa dokunma (veri kaybı yok)
  }
  removeRaw(LEGACY_REFLEX_KEYS.atlas);
  removeRaw(LEGACY_REFLEX_KEYS.organs);
}

/**
 * Sunucu hidrasyonu + tombstone-farkında birleştirme (Bölge Haritası, Kayıtlı Atlas,
 * protokol önizleme — HEPSİ bunu kullanır). Otomatik PUT YOK (FA-13): yerel-özel
 * değişiklik varsa yalnız kullanıcı eylemiyle gönderilir. Dönüş null → demo /
 * oturumsuz / sunucu erişilemez (yerel korunur).
 */
export async function hydrateAndMergeAtlas(): Promise<{ quarantineCount: number } | null> {
  const scopeAtStart = currentReflexScopeId();
  const server = await hydrateAtlasFromServer();
  if (!server || currentReflexScopeId() !== scopeAtStart) return null;

  // CANONICAL SINIR: sunucu belgesi legacy olabilir → 3-görünüme normalize.
  const serverDoc = normalizeAtlasDocument((server.document ?? {}) as AtlasDocument);
  processLegacyAtlas(serverDoc, server.organ_list);

  const mergedDoc = mergeAtlasDocuments(serverDoc, loadAtlas());
  const mergedOrgans = mergeOrganListsWithTombstones(
    server.organ_list,
    loadOrganList(),
    mergedDoc._meta,
  );
  setAtlasSyncSuspended(true);
  try {
    writeReflex("atlas", mergedDoc);
    writeReflex("organs", mergedOrgans);
  } finally {
    setAtlasSyncSuspended(false);
  }
  // Yerel = sunucu (eşdeğer) ise tabanı yerel hash'e hizala → sahte "eşitlenmemiş" yok.
  if (
    atlasEquivalent(
      { document: mergedDoc, organ_list: mergedOrgans },
      { document: serverDoc, organ_list: server.organ_list },
    )
  ) {
    setAtlasBaseHash(atlasContentHash(loadAtlas(), loadOrganList()));
  }
  markAtlasHydrated();
  return { quarantineCount: quarantinedAtlasOrganCount() };
}

/** "Bana ait, içe aktar": karantinadaki atlas bu hesabın atlasına EKLENİR ve senkronlanır. */
export function importQuarantinedAtlasToAccount(): { ok: boolean; changedOrgans: number } {
  const q = loadQuarantinedAtlas();
  if (!q) return { ok: true, changedOrgans: 0 };
  const r = importLegacyAtlas(
    { document: loadAtlas() as unknown as AtlasDocLike, organ_list: loadOrganList() },
    q,
  );
  const okAtlas = saveAtlas(r.document as unknown as AtlasDocument);
  const okList = okAtlas && saveOrganList(r.organ_list);
  if (!okAtlas || !okList) return { ok: false, changedOrgans: 0 };
  removeRaw(LEGACY_QUARANTINE_KEYS.atlas);
  return { ok: true, changedOrgans: r.changedOrgans };
}

/** "Sil": karantinadaki sahibi belirsiz atlası bu cihazdan kaldırır (açık kullanıcı kararı). */
export function discardQuarantinedAtlas(): void {
  removeRaw(LEGACY_QUARANTINE_KEYS.atlas);
}
