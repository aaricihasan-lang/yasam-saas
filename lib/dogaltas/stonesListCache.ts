/**
 * stonesListCache — PERF-2: Doğaltaş TAŞ LİSTESİ ve STONE-EXCLUSIONS GET
 * sonuçları için yalnız-istemci, kısa ömürlü (module-scope) stale-while-revalidate
 * cache'i + in-flight dedupe.
 *
 * KAPSAM: Yalnız taş liste (normal sorgu) ve stone-exclusions. Başka veri tipine
 * (detay/mineral/kombinasyon/knowledge/extended) GENELLEŞTİRİLMEZ.
 *
 * GÜVENLİK:
 *  - Cache tek seferde tek "kimlik" (userId + tenantId + oturum fingerprint) için
 *    tutulur. Kimlik değişince (logout/login/kullanıcı/oturum) TÜM cache otomatik
 *    temizlenir; eski kullanıcının verisi asla cache-hit olarak dönmez.
 *  - HAM session token hiçbir Map anahtarında, string'de veya log'da tutulmaz;
 *    yalnız geri döndürülemez kısa bir fingerprint kullanılır.
 *  - Yalnız başarılı sonuç cache'lenir; 401/403/hata cache'lenmez.
 *  - İstemci cache'i güvenlik katmanı DEĞİLDİR; API auth aynen korunur.
 */

import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/** Taş liste + exclusions için başlangıç TTL (ms). */
export const STONES_LIST_CACHE_TTL_MS = 60_000;

export type CacheState = "fresh" | "stale" | "miss";

type Entry<T> = { data: T; fetchedAt: number };

// ─── Kimlik (identity) yönetimi ──────────────────────────────────────────────

/**
 * Ham token'ı saklamadan oturumu ayırt etmek için geri döndürülemez kısa
 * fingerprint (FNV-1a → base36). Kriptografik amaç yok; yalnız oturum değişimini
 * saptamak için. Token'ın kendisi asla tutulmaz/loglanmaz.
 */
function tokenFingerprint(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Aktif kimlik: userId|tenantId|tokenFp. Auth yoksa null. */
function computeIdentity(): string | null {
  const user = readYasamUser();
  const token = readSessionToken();
  if (!user?.id || !token) return null;
  return `${user.id}|${user.tenant_id ?? ""}|${tokenFingerprint(token)}`;
}

let currentIdentity = "";
const listCache = new Map<string, Entry<unknown>>();
const listInflight = new Map<string, Promise<unknown>>();
let exclusionsEntry: Entry<Set<string>> | null = null;
let exclusionsInflight: Promise<Set<string> | null> | null = null;

function clearAll(): void {
  listCache.clear();
  listInflight.clear();
  exclusionsEntry = null;
  exclusionsInflight = null;
}

/**
 * Her cache erişiminden önce çağrılır. Kimlik değiştiyse tüm cache'i temizler.
 * @returns geçerli (auth mevcut) bir kimlik varsa true.
 */
function ensureIdentity(): boolean {
  const id = computeIdentity();
  if (!id) {
    if (currentIdentity) clearAll();
    currentIdentity = "";
    return false;
  }
  if (id !== currentIdentity) {
    clearAll();
    currentIdentity = id;
  }
  return true;
}

function stateFor(fetchedAt: number): CacheState {
  return Date.now() - fetchedAt < STONES_LIST_CACHE_TTL_MS ? "fresh" : "stale";
}

// ─── Taş liste cache'i ───────────────────────────────────────────────────────

/** Liste cache'ini oku. Auth yoksa daima miss. */
export function readStonesList<T>(key: string): { state: CacheState; value: T | null } {
  if (!ensureIdentity()) return { state: "miss", value: null };
  const e = listCache.get(key);
  if (!e) return { state: "miss", value: null };
  return { state: stateFor(e.fetchedAt), value: e.data as T };
}

/**
 * Liste GET'ini in-flight dedupe ile çalıştırır. Aynı anahtar için eşzamanlı
 * çağrılar tek Promise paylaşır. Yalnız `isSuccess(result) === true` olan sonuç
 * cache'lenir (401/403/hata cache'lenmez). Auth yoksa cache'siz düz fetch.
 */
export async function fetchStonesListDeduped<T>(
  key: string,
  fetcher: () => Promise<T>,
  isSuccess: (r: T) => boolean,
): Promise<T> {
  if (!ensureIdentity()) return fetcher();
  const existing = listInflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = (async () => {
    const res = await fetcher();
    // Sonuç yazılırken kimliğin hâlâ aynı olduğundan emin ol (yarış koruması).
    if (isSuccess(res) && ensureIdentity()) {
      listCache.set(key, { data: res as unknown, fetchedAt: Date.now() });
    }
    return res;
  })().finally(() => {
    listInflight.delete(key);
  });
  listInflight.set(key, p as Promise<unknown>);
  return p;
}

/** Tüm taş liste cache girdilerini geçersiz kıl (mutation sonrası). */
export function invalidateStonesList(): void {
  listCache.clear();
  listInflight.clear();
}

// ─── stone-exclusions cache'i (kimlik başına tek anahtar) ────────────────────

export function readStoneExclusions(): { state: CacheState; value: Set<string> | null } {
  if (!ensureIdentity()) return { state: "miss", value: null };
  if (!exclusionsEntry) return { state: "miss", value: null };
  return { state: stateFor(exclusionsEntry.fetchedAt), value: exclusionsEntry.data };
}

/**
 * Exclusions GET'ini dedupe ile çalıştırır. fetcher null döndürürse (hata/401)
 * cache'lenmez. Auth yoksa cache'siz düz fetch.
 */
export async function fetchStoneExclusionsDeduped(
  fetcher: () => Promise<Set<string> | null>,
): Promise<Set<string> | null> {
  if (!ensureIdentity()) return fetcher();
  if (exclusionsInflight) return exclusionsInflight;
  const p = (async () => {
    const res = await fetcher();
    if (res && ensureIdentity()) {
      exclusionsEntry = { data: res, fetchedAt: Date.now() };
    }
    return res;
  })().finally(() => {
    exclusionsInflight = null;
  });
  exclusionsInflight = p;
  return p;
}

/** Exclusions cache'ini geçersiz kıl (exclude/gizleme sonrası). */
export function invalidateStoneExclusions(): void {
  exclusionsEntry = null;
  exclusionsInflight = null;
}
