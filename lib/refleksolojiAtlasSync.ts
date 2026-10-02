"use client";

/**
 * refleksolojiAtlasSync — Refleksoloji Atlas sunucu senkronu (P1-1 + REF-001/007 + FA-13/24).
 *
 * Atlas tenant başına TEK belgedir.
 *
 * FA-13 (veri ezme koruması):
 *   - Sunucu GET'i (hidrasyon + birleştirme) BİTMEDEN hiçbir PUT gönderilmez; GET
 *     öncesi kullanıcı eylemi varsa hidrasyon sonrası gönderilir.
 *   - Boş/hidrasyonsuz belge ASLA gönderilmez; son organ bilinçli silindiyse (mezar
 *     taşı var) `allow_empty` ile gönderilir. Sunucu da ayrıca korur (409).
 *   - Açılış/"migrate" otomatik PUT'ları KALDIRILDI — yalnız kullanıcı eylemi gönderir.
 *   - Dedupe içerik hash'i ile (`_meta.updated_at` HARİÇ) → aynı içerik tekrar gitmez.
 *   - Tek uçuş: aynı anda tek PUT; uçuştayken gelen değişiklik sonra gönderilir.
 *   - Sunucu sürüm belirteci + son sunucu içerik hash'i kullanıcı kapsamlı
 *     `atlas-base` anahtarında KALICIDIR (sayfa yenilense de expected doğru gider).
 *
 * REF-001 (optimistic concurrency): PUT `expected_updated_at` taşır; 409'da sunucu
 *   belgesi çekilir, yerel ile BÖLGE düzeyinde 3-yollu (base = son sunucu belgesi)
 *   birleştirilir, EN ÇOK 1 retry (RF-01/02/03/13 — atlasMerge.mergeAtlasThreeWay).
 * RF-08: her istek zaman aşımlı (AbortController); askıda kalan istek zinciri kilitlemez.
 * REF-007: sonuç paylaşımlı syncStatus store'una yazılır.
 * FA-04: modül durumu çıkışta `resetReflexologyRuntime` ile sıfırlanır; uçuştayken
 *   kullanıcı değişirse yanıt uygulanmaz.
 *
 * Güvenlik: tenant_id sunucuda oturumdan; istemci yalnız kimlik başlıkları gönderir.
 * Demo/oturumsuz/kapsamsız durumda senkron atlanır.
 */

import {
  getReflexologySyncStatus,
  isOffline,
  setReflexologySyncStatus,
} from "@/lib/refleksoloji/syncStatus";
import { atlasContentHash, hasAtlasContent, planAtlasPush } from "@/lib/refleksoloji/atlasSyncCore";
import { registerReflexologyRuntimeReset } from "@/lib/refleksoloji/runtimeReset";
import {
  currentReflexScopeId,
  isReflexSyncEligible,
  readReflex,
  reflexUserHeaders,
  writeReflex,
} from "@/lib/refleksoloji/reflexStore";

const ENDPOINT = "/api/refleksoloji/atlas";
const DEBOUNCE_MS = 600;

let suspended = false;
export function setAtlasSyncSuspended(v: boolean): void {
  suspended = v;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<unknown> | null = null;
let generation = 0;
/** Sunucu GET + birleştirme tamamlanan kapsam (null → henüz hidrasyon yok → PUT yok). */
let hydratedScope: string | null = null;
/** Hidrasyondan ÖNCE kullanıcı eylemi oldu → hidrasyon sonrası gönder. */
let pendingAfterHydrate = false;

registerReflexologyRuntimeReset(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  suspended = false;
  chain = null;
  generation += 1;
  hydratedScope = null;
  pendingAfterHydrate = false;
  pendingConflictLabels = [];
});

// ─── Kalıcı sunucu tabanı (kapsamlı) ─────────────────────────────────────────

/**
 * RF-01/02/03/13: base = bu cihazın son BİRLEŞTİRDİĞİ / GÖNDERDİĞİ sunucu belgesi.
 *   - updated_at → CAS belirteci (expected_updated_at)
 *   - hash       → o belgenin içerik özeti ("eşitlenmemiş değişiklik var mı")
 *   - doc/organ_list → 3-yollu birleştirmenin ORTAK ATASI (yoksa birleşim modu)
 * Taban YALNIZ yerel kalıcı yazım başarılı olduktan SONRA ilerletilir
 * (`commitAtlasBase`). Depolama yazımı başarısızsa taban ilerlemez → bir sonraki küçük
 * kayıt sunucudaki atlası küçültemez (RF-13).
 */
export type AtlasBase = {
  updated_at: string | null;
  hash: string | null;
  doc?: Record<string, unknown> | null;
  organ_list?: string[] | null;
};

export function loadAtlasBase(): AtlasBase | null {
  const b = readReflex<Partial<AtlasBase>>("atlas-base");
  if (!b || typeof b !== "object") return null;
  return {
    updated_at: typeof b.updated_at === "string" ? b.updated_at : null,
    hash: typeof b.hash === "string" ? b.hash : null,
    doc: b.doc && typeof b.doc === "object" && !Array.isArray(b.doc) ? (b.doc as Record<string, unknown>) : null,
    organ_list: Array.isArray(b.organ_list)
      ? b.organ_list.filter((o): o is string => typeof o === "string")
      : null,
  };
}

/** Tabanı kalıcılaştır; depolama başarısızsa false (çağıran başarı VARSAYMAZ). */
export function commitAtlasBase(base: AtlasBase): boolean {
  return writeReflex("atlas-base", base);
}

// ─── atlasStorage'ın kaydettiği okuyucu + conflict çözücü (döngüsel import yok) ─

type AtlasLocalReader = () => { document: unknown; organ_list: string[] };
let localReader: AtlasLocalReader | null = null;
export function registerAtlasLocalReader(fn: AtlasLocalReader): void {
  localReader = fn;
}

export type AtlasServerState = {
  document: Record<string, unknown> | null;
  organ_list: string[];
  updated_at: string | null;
};
/**
 * 409 çözücüsü: sunucu belgesini 3-yollu birleştirir, YEREL + TABAN yazımı başarılıysa
 * birleşik içeriği döndürür (retry PUT'u için). Depolama başarısızsa null → retry YOK.
 */
type AtlasConflictResolver = (
  server: AtlasServerState,
) => { document: unknown; organ_list: string[]; conflicts: string[] } | null;
let conflictResolver: AtlasConflictResolver | null = null;
export function registerAtlasConflictResolver(fn: AtlasConflictResolver): void {
  conflictResolver = fn;
}

// ─── Hidrasyon durumu ────────────────────────────────────────────────────────

export function isAtlasHydrated(): boolean {
  return hydratedScope !== null && hydratedScope === currentReflexScopeId();
}

/** Yerel içerik son sunucu içeriğinden farklı mı (eşitlenmemiş değişiklik). */
export function atlasHasUnsyncedChanges(): boolean {
  if (!localReader) return false;
  const { document, organ_list } = localReader();
  if (!hasAtlasContent(document, organ_list)) return false;
  const base = loadAtlasBase();
  return !base?.hash || base.hash !== atlasContentHash(document, organ_list);
}

/**
 * atlasStorage.hydrateAndMergeAtlas, sunucu belgesini yerelle birleştirip yazdıktan
 * SONRA çağırır → artık PUT serbest. Hidrasyondan önce kullanıcı eylemi olduysa gönderilir.
 */
export function markAtlasHydrated(opts: { autoPush?: boolean } = {}): void {
  hydratedScope = currentReflexScopeId();
  if (pendingAfterHydrate) {
    pendingAfterHydrate = false;
    scheduleAtlasSync();
    return;
  }
  // RF-03: 3-yollu modda (ortak ata biliniyor) birleşik belgede kalan fark YALNIZ bu
  // cihazın eşitlenmemiş gerçek değişiklikleridir → otomatik gönder (sessizce kaybolmaz).
  if (opts.autoPush && isReflexSyncEligible() && atlasHasUnsyncedChanges()) {
    scheduleAtlasSync();
    return;
  }
  // Birleşim modu (ata yok, ilk geçiş): otomatik PUT YOK (FA-13) — görünür uyarı +
  // kullanıcı "yeniden dene" ile gönderir.
  if (isReflexSyncEligible() && atlasHasUnsyncedChanges()) {
    setReflexologySyncStatus({
      state: "conflict",
      message: "Atlasta henüz eşitlenmemiş değişiklikler var.",
      retry: retryAtlasSync,
    });
  }
}

// ─── Gönderim ────────────────────────────────────────────────────────────────

/**
 * Yerel kaydetme sonrası çağrılır (yalnız KULLANICI EYLEMİ — hydrate yazımları
 * suspend ile bastırılır). Gönderilecek içerik flush anında depodan okunur.
 */
export function scheduleAtlasSync(_document?: unknown, _organList?: string[]): void {
  void _document;
  void _organList;
  if (suspended || !isReflexSyncEligible()) return;
  if (!isAtlasHydrated()) {
    pendingAfterHydrate = true; // GET bitmeden flush yok
    return;
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushAtlasNow();
  }, DEBOUNCE_MS);
}

/** "Yeniden dene" — kullanıcı eylemi. */
export function retryAtlasSync(): void {
  void flushAtlasNow();
}

export type AtlasFlushOutcome = {
  status: "skipped" | "unchanged" | "empty" | "ok" | "conflict" | "error" | "offline";
};

export function flushAtlasNow(): Promise<AtlasFlushOutcome> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const prev = chain ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(() => doFlush(false));
  chain = run;
  void run.finally(() => {
    if (chain === run) chain = null;
  });
  return run;
}

async function doFlush(retrying: boolean): Promise<AtlasFlushOutcome> {
  const headers = reflexUserHeaders();
  if (!headers || !isReflexSyncEligible() || !isAtlasHydrated() || !localReader) {
    return { status: "skipped" };
  }

  const { document, organ_list } = localReader();
  const base = loadAtlasBase();
  const plan = planAtlasPush(document, organ_list, base?.hash ?? null);
  if (!plan.send) {
    // İçerik sunucudakiyle aynı (409 sonrası birleşik içerik zaten sunucuda / değişiklik
    // yok) → durum "gönderiliyor"da ASILI KALMAZ; doğru sonuç "kaydedildi".
    if (plan.reason === "unchanged" || retrying || getReflexologySyncStatus().state === "syncing") {
      reportSynced();
    }
    return { status: plan.reason };
  }

  const scopeAtStart = currentReflexScopeId();
  const gen = generation;

  setReflexologySyncStatus({ state: "syncing", message: "Atlas sunucuya gönderiliyor…" });
  let res: Response;
  try {
    res = await fetchWithTimeout(ENDPOINT, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        document,
        organ_list,
        expected_updated_at: base?.updated_at ?? null,
        allow_empty: plan.allowEmpty,
      }),
    });
  } catch (err) {
    if (gen !== generation) return { status: "skipped" };
    const offline = isOffline();
    // RF-08: zaman aşımı/ağ hatası SESSİZ başarı üretmez; yerel değişiklik cihazda
    // kalır (taban ilerlemedi) ve "Yeniden dene" / çevrimiçi olunca yeniden gönderilir.
    setReflexologySyncStatus(
      offline
        ? { state: "offline", message: "Çevrimdışı — atlas bu cihazda saklandı, bağlantı gelince gönderilecek." }
        : {
            state: "error",
            message: isTimeoutError(err)
              ? "Atlas sunucuya gönderilemedi (zaman aşımı) — bu cihazda saklandı."
              : "Atlas sunucuya gönderilemedi — bu cihazda saklandı.",
            retry: retryAtlasSync,
          },
    );
    return { status: offline ? "offline" : "error" };
  }

  if (gen !== generation || currentReflexScopeId() !== scopeAtStart) return { status: "skipped" };

  if (res.ok) {
    const json = (await res.json().catch(() => null)) as { updated_at?: string } | null;
    commitAtlasBase({
      updated_at: json?.updated_at ?? base?.updated_at ?? null,
      hash: plan.hash,
      doc: (document && typeof document === "object" ? document : {}) as Record<string, unknown>,
      organ_list,
    });
    reportSynced();
    // Uçuştayken yeni değişiklik olduysa onu da gönder.
    const latest = localReader();
    if (atlasContentHash(latest.document, latest.organ_list) !== plan.hash) scheduleAtlasSync();
    return { status: "ok" };
  }

  if (res.status === 409) {
    if (retrying) {
      setReflexologySyncStatus({
        state: "conflict",
        message: "Atlas başka bir cihazda güncellendi — değişiklikleriniz bu cihazda saklandı.",
        retry: retryAtlasSync,
      });
      return { status: "conflict" };
    }
    // İlk 409 (ATLAS_STALE / ATLAS_SHRINK / insert yarışı): sunucuyu çek, 3-yollu birleştir
    // (yerel + taban YAZIMI başarılıysa), en çok 1 retry.
    const server = await hydrateAtlasFromServer();
    if (server && conflictResolver && currentReflexScopeId() === scopeAtStart) {
      const merged = conflictResolver(server);
      if (merged) {
        if (merged.conflicts.length > 0) pendingConflictLabels = merged.conflicts;
        return doFlush(true);
      }
    }
    setReflexologySyncStatus({
      state: "conflict",
      message: "Atlas başka bir cihazda güncellendi — değişiklikleriniz bu cihazda saklandı.",
      retry: retryAtlasSync,
    });
    return { status: "conflict" };
  }

  if (res.status === 400 || res.status === 413) {
    setReflexologySyncStatus({
      state: "error",
      message: "Atlas verisi sunucu tarafından reddedildi — bu cihazda saklandı.",
      retry: retryAtlasSync,
    });
    return { status: "error" };
  }

  setReflexologySyncStatus({
    state: "error",
    message: "Atlas sunucuya gönderilemedi — bu cihazda saklandı.",
    retry: retryAtlasSync,
  });
  return { status: "error" };
}

/** Son birleştirmede gerçek çakışma yaşanan organlar (bir kez raporlanır). */
let pendingConflictLabels: string[] = [];

function conflictMessage(labels: string[]): string {
  return `Aynı bölge başka bir cihazda da değiştirilmişti (${labels.slice(0, 3).join(", ")}); bu cihazdaki sürüm korundu.`;
}

/** Birleştirme gerçek çakışma buldu → görünür uyarı (sessiz kayıp YOK); gönderim sonrası da kalır. */
export function reportAtlasMergeConflicts(labels: string[]): void {
  if (labels.length === 0) return;
  pendingConflictLabels = labels;
  setReflexologySyncStatus({ state: "conflict", message: conflictMessage(labels) });
}

function reportSynced(): void {
  if (pendingConflictLabels.length > 0) {
    const labels = pendingConflictLabels;
    pendingConflictLabels = [];
    setReflexologySyncStatus({ state: "conflict", message: conflictMessage(labels) });
    return;
  }
  setReflexologySyncStatus({ state: "synced", message: "Atlas sunucuya kaydedildi" });
}

let REQUEST_TIMEOUT_MS = 20_000;

/** YALNIZ harness: zaman aşımı senaryosunu saniyeler içinde doğrulamak için. */
export function __setAtlasRequestTimeoutMsForTests(ms: number): void {
  REQUEST_TIMEOUT_MS = ms;
}

function isTimeoutError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { name?: string }).name === "TimeoutError";
}

/** RF-08: askıda kalan istek zinciri kilitlemesin — zaman aşımında AbortError/TimeoutError. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    const e = new Error("timeout");
    e.name = "TimeoutError";
    controller.abort(e);
  }, REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      const e = new Error("timeout");
      e.name = "TimeoutError";
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// RF-03: bağlantı geri gelince bekleyen yerel değişiklik otomatik gönderilir.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (isAtlasHydrated() && atlasHasUnsyncedChanges()) scheduleAtlasSync();
  });
}

/**
 * Sunucudan atlas belgesini indirir. Tabanı GÜNCELLEMEZ (RF-13): taban ancak çağıran
 * birleşik belgeyi yerele başarıyla yazdıktan sonra `commitAtlasBase` ile ilerler.
 * Dönüş null → demo/oturumsuz/erişilemez.
 * NOT: hidrasyon "tamam" sayılması için çağıranın birleştirme sonrası
 * `markAtlasHydrated()` çağırması gerekir (atlasStorage.hydrateAndMergeAtlas).
 */
export async function hydrateAtlasFromServer(): Promise<AtlasServerState | null> {
  const headers = reflexUserHeaders();
  if (!headers || !isReflexSyncEligible()) return null;
  const scopeAtStart = currentReflexScopeId();
  try {
    const res = await fetchWithTimeout(ENDPOINT, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as
      | {
          ok?: boolean;
          document?: Record<string, unknown> | null;
          organ_list?: unknown;
          updated_at?: string | null;
        }
      | null;
    if (!json?.ok) return null;
    if (currentReflexScopeId() !== scopeAtStart) return null;
    const organ_list = Array.isArray(json.organ_list)
      ? json.organ_list.filter((o): o is string => typeof o === "string")
      : [];
    return {
      document: json.document ?? null,
      organ_list,
      updated_at: json.updated_at ?? null,
    };
  } catch {
    return null;
  }
}
