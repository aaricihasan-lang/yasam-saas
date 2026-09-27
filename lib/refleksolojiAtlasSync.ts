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
 *   belgesi çekilir, yerel ile TOMBSTONE-FARKINDA birleştirilir, EN ÇOK 1 retry.
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
});

// ─── Kalıcı sunucu tabanı (kapsamlı) ─────────────────────────────────────────

export type AtlasBase = { updated_at: string | null; hash: string | null };

export function loadAtlasBase(): AtlasBase | null {
  const b = readReflex<Partial<AtlasBase>>("atlas-base");
  if (!b || typeof b !== "object") return null;
  return {
    updated_at: typeof b.updated_at === "string" ? b.updated_at : null,
    hash: typeof b.hash === "string" ? b.hash : null,
  };
}

function saveAtlasBase(base: AtlasBase): void {
  writeReflex("atlas-base", base);
}

/** Geriye dönük: sunucu sürüm belirtecini elle ayarla (hash korunur). */
export function setAtlasBaseUpdatedAt(v: string | null): void {
  const cur = loadAtlasBase();
  saveAtlasBase({ updated_at: v, hash: cur?.hash ?? null });
}

/** Hidrasyon sonrası yerel içerik sunucuyla EŞDEĞERse tabanı yerel hash'e hizala. */
export function setAtlasBaseHash(hash: string): void {
  const cur = loadAtlasBase();
  saveAtlasBase({ updated_at: cur?.updated_at ?? null, hash });
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
type AtlasConflictResolver = (
  server: AtlasServerState,
) => { document: unknown; organ_list: string[] } | null;
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
export function markAtlasHydrated(): void {
  hydratedScope = currentReflexScopeId();
  if (pendingAfterHydrate) {
    pendingAfterHydrate = false;
    scheduleAtlasSync();
    return;
  }
  // Otomatik PUT YOK — yalnız görünür uyarı + kullanıcı "yeniden dene" ile gönderir.
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
  if (!plan.send) return { status: plan.reason };

  const scopeAtStart = currentReflexScopeId();
  const gen = generation;

  setReflexologySyncStatus({ state: "syncing", message: "Atlas eşitleniyor…" });
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        document,
        organ_list,
        expected_updated_at: base?.updated_at ?? null,
        allow_empty: plan.allowEmpty,
      }),
    });
  } catch {
    if (gen !== generation) return { status: "skipped" };
    const offline = isOffline();
    setReflexologySyncStatus(
      offline
        ? { state: "offline", message: "Çevrimdışı — atlas cihazda saklandı." }
        : { state: "error", message: "Atlas eşitlenemedi.", retry: retryAtlasSync },
    );
    return { status: offline ? "offline" : "error" };
  }

  if (gen !== generation || currentReflexScopeId() !== scopeAtStart) return { status: "skipped" };

  if (res.ok) {
    const json = (await res.json().catch(() => null)) as { updated_at?: string } | null;
    saveAtlasBase({ updated_at: json?.updated_at ?? base?.updated_at ?? null, hash: plan.hash });
    setReflexologySyncStatus({ state: "synced", message: "Atlas eşitlendi" });
    // Uçuştayken yeni değişiklik olduysa onu da gönder.
    const latest = localReader();
    if (atlasContentHash(latest.document, latest.organ_list) !== plan.hash) scheduleAtlasSync();
    return { status: "ok" };
  }

  if (res.status === 409) {
    if (retrying) {
      await hydrateAtlasFromServer();
      setReflexologySyncStatus({
        state: "conflict",
        message: "Atlas başka bir cihazda güncellendi — yeniden denendi.",
        retry: retryAtlasSync,
      });
      return { status: "conflict" };
    }
    // İlk 409: sunucuyu çek (taban güncellenir), yerelle birleştir, 1 retry.
    const server = await hydrateAtlasFromServer();
    if (server && conflictResolver && currentReflexScopeId() === scopeAtStart) {
      const merged = conflictResolver(server);
      if (merged) return doFlush(true);
    }
    setReflexologySyncStatus({
      state: "conflict",
      message: "Atlas başka bir cihazda güncellendi.",
      retry: retryAtlasSync,
    });
    return { status: "conflict" };
  }

  setReflexologySyncStatus({
    state: "error",
    message: "Atlas eşitlenemedi.",
    retry: retryAtlasSync,
  });
  return { status: "error" };
}

/**
 * Sunucudan atlas belgesini indirir ve kalıcı tabanı (sürüm + içerik hash'i)
 * günceller. Dönüş null → demo/oturumsuz/erişilemez.
 * NOT: hidrasyon "tamam" sayılması için çağıranın birleştirme sonrası
 * `markAtlasHydrated()` çağırması gerekir (atlasStorage.hydrateAndMergeAtlas).
 */
export async function hydrateAtlasFromServer(): Promise<AtlasServerState | null> {
  const headers = reflexUserHeaders();
  if (!headers || !isReflexSyncEligible()) return null;
  const scopeAtStart = currentReflexScopeId();
  try {
    const res = await fetch(ENDPOINT, { headers, cache: "no-store" });
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
    saveAtlasBase({
      updated_at: json.updated_at ?? null,
      hash: json.updated_at ? atlasContentHash(json.document ?? {}, organ_list) : null,
    });
    return {
      document: json.document ?? null,
      organ_list,
      updated_at: json.updated_at ?? null,
    };
  } catch {
    return null;
  }
}
