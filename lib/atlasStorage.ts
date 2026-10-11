import {
  ALL_FOOT_VIEWS,
  resolvePointSize,
  type FootSide,
  type FootView,
  type PointSize,
  type Region,
  type RegionPoint,
  type RegionShapeType,
} from "@/app/refleksoloji/bolge-haritasi/types";
import { organKey } from "@/app/refleksoloji/bolge-haritasi/utils/organUtils";
import {
  ATLAS_QUOTA_CONFLICT_MESSAGE,
  commitAtlasBase,
  fetchAtlasFromServer,
  flushAtlasNow,
  loadAtlasBase,
  markAtlasHydrated,
  registerAtlasConflictResolver,
  registerAtlasLocalReader,
  retryAtlasSync,
  scheduleAtlasSync,
  setAtlasBaseHash,
  setAtlasConflict,
  setAtlasSyncSuspended,
  type AtlasBase,
  type AtlasConflictResolution,
  type AtlasServerState,
} from "@/lib/refleksolojiAtlasSync";
import { setReflexologySyncStatus } from "@/lib/refleksoloji/syncStatus";
import {
  markOrganDeleted,
  markOrganUpserted,
  mergeAtlasThreeWay,
  mergeAtlasWithTombstones,
  mergeOrganListsWithTombstones,
  type AtlasDocLike,
  type OrganTimeMap,
} from "@/lib/refleksoloji/atlasMerge";
import { normalizeAtlasDocument } from "@/lib/refleksoloji/atlasNormalize";
import {
  atlasContentHash,
  atlasEquivalent,
  hasAtlasContent,
  hasAtlasTombstones,
  classifyLegacyAtlas,
  importLegacyAtlas,
  type LegacyAtlasPayload,
} from "@/lib/refleksoloji/atlasSyncCore";
import {
  LEGACY_QUARANTINE_KEYS,
  LEGACY_REFLEX_KEYS,
  REFLEX_V2_PREFIX,
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
  pointSize?: PointSize;
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
  /** El yüzeyleri — aynı sol/sag bucket şekli (sol el / sağ el). */
  el_avuc: AtlasFootBucket;
  el_sirt: AtlasFootBucket;
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
    el_avuc: emptyFootBucket(),
    el_sirt: emptyFootBucket(),
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
    ...(region.shape === "point" && region.pointSize ? { pointSize: region.pointSize } : {}),
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
    ...(stored.shape === "point" ? { pointSize: resolvePointSize(stored.pointSize) } : {}),
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
 * P1-1: base'siz birleştirme — sunucu ve yerel atlas belgelerini organ bazında
 * birleştirir. Ortak organda organUpdatedAt LWW (P1-5; eskiden koşulsuz sunucu
 * kazanırdı); yalnız yerelde olan organlar KORUNUR (veri kaybı yok). Base snapshot'ı
 * olan senkron yolları `mergeAtlasThreeWay` kullanır.
 */
export function mergeAtlasDocuments(
  server: AtlasDocument,
  local: AtlasDocument,
): AtlasDocument {
  // Tombstone-farkında birleştirme: yalnız yerelde olan organ korunur AMA
  // silinme/yeniden-adlandırma mezar taşı son güncellemeden yeniyse organ DİRİLMEZ
  // (zombie/duplicate engellenir). Mezar taşları _meta'da.
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
  if (ok) {
    scheduleAtlasSync();
    emitAtlasChanged(); // RF-02: aynı sekmedeki diğer açık ekranlar da tazelenir
  }
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
  if (ok) {
    scheduleAtlasSync();
    emitAtlasChanged(); // RF-02: aynı sekmedeki diğer açık ekranlar da tazelenir
  }
  return ok;
}

export function getRegionsForOrgan(
  atlas: AtlasDocument,
  organ: string,
  filter?: { foot?: FootSide; view?: FootView },
): Region[] {
  const entry = atlas[organ];
  if (!isOrganEntry(entry)) return [];

  const views: readonly FootView[] = filter?.view ? [filter.view] : ALL_FOOT_VIEWS;
  const footKeys: ("sol" | "sag")[] = filter?.foot
    ? [footToStorageKey(filter.foot)]
    : ["sol", "sag"];

  const result: Region[] = [];

  for (const view of views) {
    const bucket = entry[view];
    if (!bucket) continue; // normalize edilmiş belgede tüm görünüm bucket'ları vardır
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

// ─── P1-5: base-snapshot'lı birleştirme + çakışma çözümü ──────────────────────

/** Bölge Haritası vb. açık ekranların state'i yeniden yüklemesi için yayınlanan olay. */
export const ATLAS_CHANGED_EVENT = "refleks:atlas-changed";

/**
 * RF-02: başka sekmedeki `storage` olayı bu kullanıcının atlas/organ anahtarına mı ait
 * (`refleks:v2:{tenant}:{user}:atlas|organs`). Açık ekranlar bununla tazelenir.
 */
export function isAtlasStorageKey(key: string | null): boolean {
  const scope = currentReflexScopeId();
  if (!key || !scope) return false;
  const prefix = `${REFLEX_V2_PREFIX}${scope}:`;
  return key === `${prefix}atlas` || key === `${prefix}organs`;
}

function emitAtlasChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(ATLAS_CHANGED_EVENT));
  } catch {
    /* olay yayını en iyi çaba — veri yazımını etkilemez */
  }
}

/**
 * Birleştirme sonucunu yerele yazar (senkron döngüsü TETİKLENMEZ). Atlas yazılamazsa
 * (kota) hiçbir şey değişmez → false; organ listesi yazılamazsa atlas geri alınır.
 */
function writeLocalAtlasState(doc: AtlasDocument, organs: string[]): boolean {
  const prevAtlas = readReflex<unknown>("atlas");
  setAtlasSyncSuspended(true);
  try {
    if (!writeReflex("atlas", doc)) return false;
    if (!writeReflex("organs", organs)) {
      if (prevAtlas !== null) writeReflex("atlas", prevAtlas);
      return false;
    }
  } finally {
    setAtlasSyncSuspended(false);
  }
  emitAtlasChanged();
  return true;
}

/** Yerel taban belgesi: kayıtlı base belgesi; yoksa yerel hâlâ tabanla aynıysa yerelin kendisi. */
function resolveBaseDocument(
  base: AtlasBase | null,
  local: AtlasDocument,
  localOrgans: string[],
): AtlasDocument | null {
  // Yerel boş + mezar taşsız (önbellek temizlenmiş / okunamadı) → "bilinçli silme" DEĞİL;
  // yerel değişmemiş sayılır → sunucu içeriği alınır (planAtlasPush ile aynı kural).
  if (!hasAtlasContent(local, localOrgans) && !hasAtlasTombstones(local)) return local;
  if (base?.doc) return normalizeAtlasDocument(base.doc as unknown as AtlasDocument);
  // Belgesiz eski taban: yerel içerik taban hash'iyle aynıysa yerel DEĞİŞMEMİŞTİR →
  // yerel = base (sunucu değişiklikleri güvenle alınır).
  if (base?.hash && base.hash === atlasContentHash(local, localOrgans)) return local;
  return null;
}

export type AtlasConflictBackupEntry = { saved_at: string; organs: Record<string, unknown> };
const CONFLICT_BACKUP_LIMIT = 5;

/** Base'siz (LWW) birleştirmede kaybeden yerel organları yedekle (en iyi çaba, son 5 kayıt). */
function backupLostLocalOrgans(lost: Record<string, unknown>, at: string): void {
  if (Object.keys(lost).length === 0) return;
  const prev = readReflex<AtlasConflictBackupEntry[]>("atlas-conflict-backup");
  const list = Array.isArray(prev) ? prev : [];
  const next = [...list, { saved_at: at, organs: lost }].slice(-CONFLICT_BACKUP_LIMIT);
  if (!writeReflex("atlas-conflict-backup", next)) {
    writeReflex("atlas-conflict-backup", [{ saved_at: at, organs: lost }]);
  }
}

/** Kayıtlı (base'siz birleştirmede kaybeden) yerel organ yedekleri. */
export function loadAtlasConflictBackup(): AtlasConflictBackupEntry[] {
  const v = readReflex<AtlasConflictBackupEntry[]>("atlas-conflict-backup");
  return Array.isArray(v) ? v : [];
}

type AtlasMergeOutcome = {
  serverDoc: AtlasDocument;
  merged: AtlasDocument;
  mergedOrgans: string[];
  conflicts: string[];
  /** "three-way": ortak ata (son sunucu belgesi) biliniyordu; "lww": ata yok (ilk geçiş). */
  mode: "three-way" | "lww";
};

/**
 * Sunucu durumunu yerel ile birleştirir (YAZMAZ). Base = istemcinin son bildiği sunucu
 * belgesi (çağıran, tabanı GÜNCELLEMEDEN önce okur).
 */
function computeAtlasMerge(
  server: AtlasServerState,
  base: AtlasBase | null,
  onConflict: "local" | "server" = "local",
): AtlasMergeOutcome {
  const serverRaw =
    server.document && typeof server.document === "object"
      ? (server.document as unknown as AtlasDocument)
      : createEmptyAtlas();
  const serverDoc = normalizeAtlasDocument(serverRaw);
  const local = loadAtlas();
  const localOrgans = loadOrganList();
  // Sunucuda satır YOKSA (updated_at null) base kullanılmaz: korunacak sunucu sürümü yok;
  // yerel organlar "sunucu sildi" sanılıp silinmesin (önceki davranış: yerel korunur).
  const baseDoc = server.updated_at ? resolveBaseDocument(base, local, localOrgans) : null;
  const now = new Date().toISOString();
  const r = mergeAtlasThreeWay(
    serverDoc as unknown as AtlasDocLike,
    local as unknown as AtlasDocLike,
    baseDoc as unknown as AtlasDocLike | null,
    now,
    onConflict,
  );
  if (r.mode === "lww") backupLostLocalOrgans(r.lostLocal, now);
  const merged = r.document as unknown as AtlasDocument;
  const mergedOrgans = mergeOrganListsWithTombstones(server.organ_list, localOrgans, merged._meta);
  return { serverDoc, merged, mergedOrgans, conflicts: r.conflicts, mode: r.mode };
}

/** Birleşik yerel içerik sunucu içeriğiyle eşdeğerse tabanı yerel hash'e hizala. */
function alignBaseHashIfEquivalent(outcome: AtlasMergeOutcome, server: AtlasServerState): void {
  if (
    atlasEquivalent(
      { document: outcome.merged, organ_list: outcome.mergedOrgans },
      { document: outcome.serverDoc, organ_list: server.organ_list },
    )
  ) {
    setAtlasBaseHash(atlasContentHash(loadAtlas(), loadOrganList()));
  }
}

/**
 * REF-001 + P1-5 — Atlas PUT 409 (concurrency conflict) çözücüsü.
 *
 * Sunucudaki güncel belge + yerel belge, istemcinin SON BİLDİĞİ sunucu belgesine (base)
 * göre organ bazında 3-YOLLU birleştirilir:
 *   - çakışma YOK → birleşim yerele yazılır, taban sunucuya ilerletilir → "merged"
 *     (refleksolojiAtlasSync tek otomatik retry yapar; sunucuda A+B birlikte olur);
 *   - aynı organ iki cihazda FARKLI değişti → yerel sürüm KORUNUR (diğer organlardaki
 *     sunucu değişiklikleri alınır), taban İLERLETİLMEZ (çakışma yeniden yüklemede de
 *     tespit edilir), otomatik retry YOK → "conflict";
 *   - yerel yazılamadı (kota) → hiçbir şey değişmez → "failed".
 */
function resolveAtlasConflict(server: AtlasServerState): AtlasConflictResolution {
  const outcome = computeAtlasMerge(server, loadAtlasBase());
  if (!writeLocalAtlasState(outcome.merged, outcome.mergedOrgans)) return { kind: "failed" };
  if (outcome.conflicts.length > 0) return { kind: "conflict", organs: outcome.conflicts };
  if (!commitAtlasBase(server)) return { kind: "failed" };
  alignBaseHashIfEquivalent(outcome, server);
  return { kind: "merged" };
}

/**
 * Kullanıcı kararı (çakışma banner'ı): sunucuyu TAZE çeker, çakışan organlarda
 * `prefer` tarafını seçer, yerele yazar ve tabanı sunucuya ilerletir.
 *   "local"  → "Benim sürümümü gönder": PUT taze expected ile gider.
 *   "server" → "Sunucu sürümünü al": çakışan organlar sunucudan; kalan yerel-özel
 *              (çakışmasız) değişiklik varsa o da gönderilir.
 */
async function resolveAtlasConflictByUser(prefer: "local" | "server"): Promise<boolean> {
  const scopeAtStart = currentReflexScopeId();
  const base = loadAtlasBase();
  const server = await fetchAtlasFromServer();
  if (!server || currentReflexScopeId() !== scopeAtStart) {
    setReflexologySyncStatus({ state: "error", message: "Atlas sunucudan alınamadı.", retry: retryAtlasSync });
    return false;
  }
  const outcome = computeAtlasMerge(server, base, prefer);
  if (!writeLocalAtlasState(outcome.merged, outcome.mergedOrgans) || !commitAtlasBase(server)) {
    setReflexologySyncStatus({ state: "conflict", message: ATLAS_QUOTA_CONFLICT_MESSAGE, retry: retryAtlasSync });
    return false;
  }
  alignBaseHashIfEquivalent(outcome, server);
  setAtlasConflict(null);
  const r = await flushAtlasNow();
  if (r.status === "unchanged" || r.status === "empty") {
    setReflexologySyncStatus({ state: "synced", message: "Atlas eşitlendi" });
  }
  return r.status === "ok" || r.status === "unchanged" || r.status === "empty";
}

/** "Benim sürümümü gönder" — çakışan organlarda bu cihazın sürümü sunucuya yazılır. */
export function pushLocalAtlasVersion(): Promise<boolean> {
  return resolveAtlasConflictByUser("local");
}

/** "Sunucu sürümünü al" — çakışan organlarda sunucu sürümü bu cihaza alınır. */
export function adoptServerAtlasVersion(): Promise<boolean> {
  return resolveAtlasConflictByUser("server");
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
 *
 * P1-5: birleştirme, istemcinin SON BİLDİĞİ sunucu belgesine (atlas-base; GET'ten ÖNCE
 * okunur) göre 3-yollu yapılır → çevrimdışı/eşitlenmemiş yerel düzenleme her açılışta
 * sunucu tarafından EZİLMEZ. Aynı organ iki tarafta farklı değiştiyse yerel korunur ve
 * çakışma bildirilir (taban ilerletilmez). Kota → yerel/taban DOKUNULMAZ.
 */
export async function hydrateAndMergeAtlas(): Promise<{ quarantineCount: number } | null> {
  const scopeAtStart = currentReflexScopeId();
  const base = loadAtlasBase();
  const server = await fetchAtlasFromServer();
  if (!server || currentReflexScopeId() !== scopeAtStart) return null;

  // CANONICAL SINIR: sunucu belgesi legacy olabilir → 3-görünüme normalize.
  const serverDoc = normalizeAtlasDocument((server.document ?? {}) as AtlasDocument);
  processLegacyAtlas(serverDoc, server.organ_list);

  const outcome = computeAtlasMerge(server, base);
  const wrote = writeLocalAtlasState(outcome.merged, outcome.mergedOrgans);
  if (!wrote) {
    // RF-13: birleşik belge yerele YAZILAMADI (kota) → taban İLERLEMEZ ve hidrasyon
    // TAMAMLANMIŞ SAYILMAZ → PUT gönderilmez; bayat/küçük yerel kopya sunucudaki atlası
    // küçültemez. Kullanıcı görünür uyarı alır; yer açılıp yeniden açılınca normal akar.
    setReflexologySyncStatus({ state: "error", message: ATLAS_QUOTA_CONFLICT_MESSAGE });
    return null;
  }
  const clean = outcome.conflicts.length === 0;
  if (clean) {
    commitAtlasBase(server);
    // Yerel = sunucu (eşdeğer) ise tabanı yerel hash'e hizala → sahte "eşitlenmemiş" yok.
    alignBaseHashIfEquivalent(outcome, server);
    setAtlasConflict(null);
  } else {
    setAtlasConflict(outcome.conflicts);
  }
  // RF-03: ata biliniyorsa (3-yollu) kalan fark bu cihazın eşitlenmemiş GERÇEK
  // değişikliğidir → otomatik gönderilir (çakışma varsa kullanıcı kararı beklenir).
  markAtlasHydrated({ autoPush: clean && outcome.mode === "three-way" });
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
