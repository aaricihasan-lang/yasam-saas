"use client";

/**
 * refleksolojiAtlasSync — Refleksoloji Atlas sunucu senkronu (P1-1 + REF-001/007 + FA-13/24 + P1-5).
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
 *   - Sunucu sürüm belirteci + son sunucu içerik hash'i + (P1-5) son sunucu BELGESİ
 *     kullanıcı kapsamlı `atlas-base` anahtarında KALICIDIR.
 *
 * REF-001 + P1-5 (optimistic concurrency, lost update kapanışı): PUT `expected_updated_at`
 *   taşır; 409'da sunucu belgesi çekilir ve `atlas-base` belgesine göre 3-YOLLU birleştirilir
 *   (atlasStorage çözücüsü):
 *     - çakışmasız (yalnız bir tarafın değiştirdiği organlar) → yerele yazılır, taban
 *       sunucuya ilerletilir, EN ÇOK 1 otomatik retry;
 *     - aynı organ iki cihazda FARKLI değiştiyse → yerel KORUNUR, otomatik retry YOK,
 *       durum "conflict" + kullanıcı kararı ("Benim sürümümü gönder" / "Sunucu sürümünü al").
 *   Base belgesi taahhüdü (commitAtlasBase) YALNIZ birleştirme başarılıysa yapılır —
 *   aksi halde bayat yerel, sunucunun yeni sürümünü "beklenen" sanıp ezemez.
 * RF-01/02/03/13: birleştirme ORGAN değil BÖLGE düzeyindedir (atlasMerge.mergeAtlasThreeWay)
 *   → aynı organın farklı bölgeleri/yüzeyleri çakışma sayılmaz, ikisi de korunur; "çakışma"
 *   yalnız AYNI bölgenin iki tarafta farklı değişmesidir. Hidrasyonda yerel değişiklik varsa
 *   (ata biliniyorsa) otomatik gönderilir; yerel yazım başarısızsa hidrasyon TAMAMLANMAZ.
 * RF-08: her istek zaman aşımlı (AbortController); askıda kalan istek zinciri kilitlemez.
 * REF-007: sonuç paylaşımlı syncStatus store'una yazılır.
 * FA-04: modül durumu çıkışta `resetReflexologyRuntime` ile sıfırlanır; uçuştayken
 *   kullanıcı değişirse yanıt uygulanmaz.
 *
 * Güvenlik: tenant_id sunucuda oturumdan; istemci yalnız kimlik başlıkları gönderir.
 * Demo/oturumsuz/kapsamsız durumda senkron atlanır.
 */

import { isOffline, setReflexologySyncStatus } from "@/lib/refleksoloji/syncStatus";
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

/** P1-5: atlas çakışması — kullanıcıya gösterilen TEK mesaj (badge + banner). */
export const ATLAS_CONFLICT_MESSAGE =
  "Atlas başka bir cihazda güncellendi — yenileyin. Bu cihazdaki değişiklikleriniz korunuyor.";
/** Yerel depolama dolu → birleştirme yazılamadı; yerel KORUNUR, otomatik gönderim yok. */
export const ATLAS_QUOTA_CONFLICT_MESSAGE =
  "Atlas başka bir cihazda güncellendi ancak cihaz depolaması dolu olduğu için birleştirilemedi. Bu cihazdaki değişiklikleriniz korunuyor.";

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

// ─── P1-5: çakışma durumu (banner için abone olunabilir store) ────────────────

export type AtlasConflictState = { organs: string[]; seq: number } | null;
let conflictState: AtlasConflictState = null;
let conflictSeq = 0;
const conflictListeners = new Set<() => void>();

export function getAtlasConflict(): AtlasConflictState {
  return conflictState;
}
export function subscribeAtlasConflict(listener: () => void): () => void {
  conflictListeners.add(listener);
  return () => {
    conflictListeners.delete(listener);
  };
}
/** Çakışan organları (görünen ad) ayarla; boş/null → çakışma temizlenir. */
export function setAtlasConflict(organs: string[] | null): void {
  const next = organs && organs.length > 0 ? { organs: [...organs], seq: ++conflictSeq } : null;
  if (next === null && conflictState === null) return;
  conflictState = next;
  for (const l of conflictListeners) l();
}

function showConflictStatus(message: string = ATLAS_CONFLICT_MESSAGE): void {
  setReflexologySyncStatus({ state: "conflict", message, retry: retryAtlasSync });
}

registerReflexologyRuntimeReset(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  suspended = false;
  chain = null;
  generation += 1;
  hydratedScope = null;
  pendingAfterHydrate = false;
  setAtlasConflict(null);
});

// ─── Kalıcı sunucu tabanı (kapsamlı) ─────────────────────────────────────────

/**
 * `doc`: istemcinin son BİLDİĞİ sunucu belgesi (3-yollu birleştirmenin base'i). Eski
 * kayıtlarda / kota yetmediğinde yoktur → birleştirme organUpdatedAt LWW'ye düşer.
 */
export type AtlasBase = {
  updated_at: string | null;
  hash: string | null;
  doc?: Record<string, unknown> | null;
};

export function loadAtlasBase(): AtlasBase | null {
  const b = readReflex<Partial<AtlasBase>>("atlas-base");
  if (!b || typeof b !== "object") return null;
  return {
    updated_at: typeof b.updated_at === "string" ? b.updated_at : null,
    hash: typeof b.hash === "string" ? b.hash : null,
    doc: b.doc && typeof b.doc === "object" && !Array.isArray(b.doc) ? b.doc : null,
  };
}

/**
 * Tabanı yazar. Kota yetmezse belge OLMADAN (yalnız sürüm + hash) yeniden dener —
 * sürüm belirteci ASLA kaybolmaz (aksi halde sonraki PUT expected'sız 409 alırdı).
 */
function saveAtlasBase(base: AtlasBase): boolean {
  if (writeReflex("atlas-base", base)) return true;
  return writeReflex("atlas-base", { updated_at: base.updated_at, hash: base.hash, doc: null });
}

/** Geriye dönük: sunucu sürüm belirtecini elle ayarla (hash + belge korunur). */
export function setAtlasBaseUpdatedAt(v: string | null): void {
  const cur = loadAtlasBase();
  saveAtlasBase({ updated_at: v, hash: cur?.hash ?? null, doc: cur?.doc ?? null });
}

/** Hidrasyon sonrası yerel içerik sunucuyla EŞDEĞERse tabanı yerel hash'e hizala. */
export function setAtlasBaseHash(hash: string): void {
  const cur = loadAtlasBase();
  saveAtlasBase({ updated_at: cur?.updated_at ?? null, hash, doc: cur?.doc ?? null });
}

/**
 * P1-5: sunucu durumunu yeni TABAN olarak taahhüt et (sürüm + içerik hash'i + belge).
 * Yalnız sunucu belgesi yerelle BAŞARIYLA birleştirildikten sonra çağrılır.
 */
export function commitAtlasBase(server: AtlasServerState): boolean {
  return saveAtlasBase({
    updated_at: server.updated_at ?? null,
    hash: server.updated_at ? atlasContentHash(server.document ?? {}, server.organ_list) : null,
    doc: server.updated_at && server.document ? server.document : null,
  });
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
 * 409 çözüm sonucu:
 *   merged   → çakışmasız birleşti, yerele yazıldı, taban sunucuya ilerletildi → 1 retry
 *   conflict → aynı organ iki tarafta farklı değişti; yerel KORUNDU, retry YOK
 *   failed   → yerel yazılamadı (kota) / okunamadı; yerel DOKUNULMADI, retry YOK
 */
export type AtlasConflictResolution =
  | { kind: "merged" }
  | { kind: "conflict"; organs: string[] }
  | { kind: "failed" };
type AtlasConflictResolver = (server: AtlasServerState) => AtlasConflictResolution;
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
  if (conflictState) {
    // P1-5: çözülmemiş çakışma → otomatik gönderim YOK; kullanıcı kararı beklenir.
    pendingAfterHydrate = false;
    if (isReflexSyncEligible()) showConflictStatus();
    return;
  }
  if (pendingAfterHydrate) {
    pendingAfterHydrate = false;
    scheduleAtlasSync();
    return;
  }
  // RF-03: 3-yollu modda (ortak ata = son sunucu belgesi biliniyor) birleşik belgede
  // kalan fark YALNIZ bu cihazın eşitlenmemiş GERÇEK değişiklikleridir (ör. başarısız
  // PUT sonrası yenileme, kaydet + hemen sayfa değişimi) → otomatik gönder; sessizce
  // kaybolmaz ve kullanıcının "yeniden dene"yi bilmesine bağlı kalmaz.
  if (opts.autoPush && isReflexSyncEligible() && atlasHasUnsyncedChanges()) {
    scheduleAtlasSync();
    return;
  }
  // Ata bilinmiyor (ilk geçiş / eski taban): otomatik PUT YOK (FA-13) — görünür uyarı +
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
    // 409 birleştirmesi sonrası yerel = sunucu → gönderecek bir şey yok (eşitlendi).
    if (retrying && plan.reason === "unchanged") {
      setAtlasConflict(null);
      setReflexologySyncStatus({ state: "synced", message: "Atlas eşitlendi" });
    } else if (plan.reason === "unchanged" && !conflictState) {
      // RF-03/RF-08: içerik zaten sunucudakiyle aynı (değişiklik yok / uçuştaki istek
      // tamamlanmış) → durum "gönderiliyor"da ASILI KALMAZ; doğru sonuç "eşitlendi".
      setReflexologySyncStatus({ state: "synced", message: "Atlas eşitlendi" });
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
    // RF-08: zaman aşımı / ağ hatası SESSİZ başarı üretmez; yerel değişiklik cihazda kalır
    // (taban ilerlemedi) → "Yeniden dene", çevrimiçi olunca veya sonraki açılışta gönderilir.
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
    // P1-5: gönderilen belge = sunucunun yeni içeriği → sonraki 3-yollu birleştirmenin base'i.
    saveAtlasBase({
      updated_at: json?.updated_at ?? base?.updated_at ?? null,
      hash: plan.hash,
      doc: document && typeof document === "object" ? (document as Record<string, unknown>) : null,
    });
    setAtlasConflict(null);
    setReflexologySyncStatus({ state: "synced", message: "Atlas eşitlendi" });
    // Uçuştayken yeni değişiklik olduysa onu da gönder.
    const latest = localReader();
    if (atlasContentHash(latest.document, latest.organ_list) !== plan.hash) scheduleAtlasSync();
    return { status: "ok" };
  }

  if (res.status === 409) {
    if (retrying) {
      // Otomatik retry de 409 aldı (yeni yarış) → taban İLERLETİLMEZ (birleştirilmemiş
      // sunucu sürümü "beklenen" sayılırsa ezilirdi); kullanıcı "yeniden dene" ile tekrarlar.
      showConflictStatus();
      return { status: "conflict" };
    }
    // İlk 409: sunucuyu çek, yerelle 3-yollu birleştir (taban yalnız başarıda ilerler).
    const server = await fetchAtlasFromServer();
    if (!server || !conflictResolver || currentReflexScopeId() !== scopeAtStart || gen !== generation) {
      showConflictStatus();
      return { status: "conflict" };
    }
    const resolution = conflictResolver(server);
    if (resolution.kind === "merged") {
      setAtlasConflict(null);
      return doFlush(true); // çakışmasız → tek otomatik retry (taze expected)
    }
    if (resolution.kind === "conflict") {
      setAtlasConflict(resolution.organs);
      showConflictStatus();
    } else {
      showConflictStatus(ATLAS_QUOTA_CONFLICT_MESSAGE);
    }
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

let REQUEST_TIMEOUT_MS = 20_000;

/** YALNIZ harness: zaman aşımı senaryosunu saniyeler içinde doğrulamak için. */
export function __setAtlasRequestTimeoutMsForTests(ms: number): void {
  REQUEST_TIMEOUT_MS = ms;
}

function isTimeoutError(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { name?: string }).name === "TimeoutError";
}

/** RF-08: askıda kalan istek zinciri kilitlemesin — zaman aşımında TimeoutError. */
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
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("online", () => {
    if (isAtlasHydrated() && !conflictState && atlasHasUnsyncedChanges()) scheduleAtlasSync();
  });
}

/**
 * Sunucudan atlas belgesini indirir — TABANI DEĞİŞTİRMEZ (P1-5). Birleştirme yapan
 * çağıran, başarıdan sonra `commitAtlasBase(server)` ile tabanı ilerletir.
 * Dönüş null → demo/oturumsuz/erişilemez.
 */
export async function fetchAtlasFromServer(): Promise<AtlasServerState | null> {
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

/**
 * Geriye dönük: indir + tabanı DOĞRUDAN taahhüt et. Yerel birleştirme gerektiren
 * yollar (hidrasyon, 409 çözümü) bunu DEĞİL `fetchAtlasFromServer` kullanır.
 * NOT: hidrasyon "tamam" sayılması için çağıranın birleştirme sonrası
 * `markAtlasHydrated()` çağırması gerekir (atlasStorage.hydrateAndMergeAtlas).
 */
export async function hydrateAtlasFromServer(): Promise<AtlasServerState | null> {
  const server = await fetchAtlasFromServer();
  if (server) commitAtlasBase(server);
  return server;
}
