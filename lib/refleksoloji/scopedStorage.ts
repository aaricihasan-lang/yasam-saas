/**
 * Refleksoloji — kullanıcı/tenant KAPSAMLI yerel depolama (FA-03/04, DL-007).
 *
 * SORUN: eski anahtarlar (`yasam-refleksoloji-*-v1`) cihaz genelindeydi; aynı
 * tarayıcıda oturum açan ikinci uzman ilk uzmanın notlarını/atlasını görüyor ve
 * senkron bunları KENDİ tenant'ına yazabiliyordu.
 *
 * ÇÖZÜM: her veri kümesi `refleks:v2:{tenantId}:{userId}:{dataset}` altında tutulur.
 * Tenant/kullanıcı yoksa veri yalnız BELLEKTE yaşar (kalıcı değil, senkron yok).
 *
 * Eski (sahipsiz) anahtarlar: ASLA otomatik silinmez / otomatik başka kullanıcıya
 * yüklenmez. Sahipliği sunucu ile KANITLANANLAR benimsenir; kanıtlanamayanlar
 * `refleks:legacy-quarantine:*` altına taşınır ve kullanıcıya açık karar sunulur.
 *
 * Bu modül SAF'tır: React / yasamUser import ETMEZ (logout zincirinde döngü olmasın).
 * Depolama `KeyValueStore` arayüzüyle soyutlanır → harness sahte depo enjekte eder.
 */

import { atlasContentHash, hasAtlasContent } from "./atlasSyncCore";

export type ReflexDataset =
  | "notes"
  | "notes-outbox"
  | "atlas"
  | "organs"
  | "protocols"
  | "atlas-base";

export const REFLEX_DATASETS: readonly ReflexDataset[] = [
  "notes",
  "notes-outbox",
  "atlas",
  "organs",
  "protocols",
  "atlas-base",
] as const;

export const REFLEX_V2_PREFIX = "refleks:v2:";

/** Eski (v1, cihaz genelindeki, sahipsiz) anahtarlar — yalnız OKUNUR/karantinaya taşınır. */
export const LEGACY_REFLEX_KEYS = {
  notes: "yasam-refleksoloji-notlar-v1",
  atlas: "yasam-refleksoloji-atlas-v1",
  organs: "yasam-refleksoloji-organs-v1",
  protocols: "yasam-refleksoloji-protokoller-v1",
} as const;

/** Sahibi kanıtlanamayan eski veri — kullanıcı "Bana ait / Sil" diyene dek burada. */
export const LEGACY_QUARANTINE_KEYS = {
  notes: "refleks:legacy-quarantine:notes",
  atlas: "refleks:legacy-quarantine:atlas",
  protocols: "refleks:legacy-quarantine:protocols",
} as const;

export type ReflexScope = { tenantId: string; userId: string };

export type ReflexUserLike =
  | { id?: unknown; tenant_id?: unknown; is_demo_account?: unknown }
  | null
  | undefined;

/** Minimal anahtar-değer arayüzü (localStorage ile yapısal uyumlu). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

function cleanId(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

/** Kullanıcı kaydından kapsam; tenant veya kullanıcı yoksa null (→ bellek-içi, senkron yok). */
export function resolveReflexScope(user: ReflexUserLike): ReflexScope | null {
  if (!user || typeof user !== "object") return null;
  const tenantId = cleanId(user.tenant_id);
  const userId = cleanId(user.id);
  if (!tenantId || !userId) return null;
  return { tenantId, userId };
}

export function scopeId(scope: ReflexScope): string {
  return `${encodeURIComponent(scope.tenantId)}:${encodeURIComponent(scope.userId)}`;
}

export function scopePrefix(scope: ReflexScope): string {
  return `${REFLEX_V2_PREFIX}${scopeId(scope)}:`;
}

export function scopedKey(scope: ReflexScope, dataset: ReflexDataset): string {
  return `${scopePrefix(scope)}${dataset}`;
}

// ─── Aktif depo (tarayıcı localStorage | bellek) ─────────────────────────────

/** Kapsam yokken kullanılan bellek-içi depo (sayfa yenilenince kaybolur, senkron yok). */
const memoryFallback = createMemoryStore();
const MEMORY_PREFIX = "refleks:mem:";

export function clearReflexMemoryFallback(): void {
  const keys: string[] = [];
  for (let i = 0; i < memoryFallback.length; i++) {
    const k = memoryFallback.key(i);
    if (k) keys.push(k);
  }
  keys.forEach((k) => memoryFallback.removeItem(k));
}

/** Tarayıcı localStorage (yoksa/erişilemezse null). */
export function browserStore(): KeyValueStore | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveTarget(
  scope: ReflexScope | null,
  dataset: ReflexDataset,
  kv?: KeyValueStore | null,
): { store: KeyValueStore; key: string } {
  if (!scope) return { store: memoryFallback, key: `${MEMORY_PREFIX}${dataset}` };
  const store = kv ?? browserStore() ?? memoryFallback;
  return { store, key: scopedKey(scope, dataset) };
}

export function readScopedRaw(
  scope: ReflexScope | null,
  dataset: ReflexDataset,
  kv?: KeyValueStore | null,
): string | null {
  try {
    const { store, key } = resolveTarget(scope, dataset, kv);
    return store.getItem(key);
  } catch {
    return null;
  }
}

export function readScopedJson<T>(
  scope: ReflexScope | null,
  dataset: ReflexDataset,
  kv?: KeyValueStore | null,
): T | null {
  const raw = readScopedRaw(scope, dataset, kv);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Yazma; kota/erişim hatasında false (çağıran kota mesajı gösterir). */
export function writeScopedJson(
  scope: ReflexScope | null,
  dataset: ReflexDataset,
  value: unknown,
  kv?: KeyValueStore | null,
): boolean {
  try {
    const { store, key } = resolveTarget(scope, dataset, kv);
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeScoped(
  scope: ReflexScope | null,
  dataset: ReflexDataset,
  kv?: KeyValueStore | null,
): void {
  try {
    const { store, key } = resolveTarget(scope, dataset, kv);
    store.removeItem(key);
  } catch {
    /* sessiz */
  }
}

// ─── Eski / karantina ham erişim ─────────────────────────────────────────────

export function readRawJson<T>(key: string, kv?: KeyValueStore | null): T | null {
  try {
    const store = kv ?? browserStore();
    const raw = store?.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeRawJson(key: string, value: unknown, kv?: KeyValueStore | null): boolean {
  try {
    const store = kv ?? browserStore();
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeRaw(key: string, kv?: KeyValueStore | null): void {
  try {
    (kv ?? browserStore())?.removeItem(key);
  } catch {
    /* sessiz */
  }
}

// ─── Bekleyen iş tespiti + çıkış temizliği ───────────────────────────────────

type MaybeNote = { dirty?: unknown };
type MaybeProtocol = { pendingSync?: unknown };
type AtlasBase = { hash?: unknown };

/**
 * Bu kapsamda sunucuya henüz ulaşmamış yerel iş var mı?
 *  - notes-outbox (bekleyen silme) boş değil
 *  - kirli (dirty) not
 *  - bekleyen (pendingSync) protokol
 *  - atlas içeriği son sunucu hash'inden farklı (ve boş değil)
 * Varsa çıkışta önbellek SİLİNMEZ (veri kaybı yok; aynı kullanıcı geri dönünce devam).
 */
export function hasPendingReflexWork(scope: ReflexScope, kv?: KeyValueStore | null): boolean {
  const outbox = readScopedJson<unknown[]>(scope, "notes-outbox", kv);
  if (Array.isArray(outbox) && outbox.length > 0) return true;

  const notes = readScopedJson<MaybeNote[]>(scope, "notes", kv);
  if (Array.isArray(notes) && notes.some((n) => n && n.dirty === true)) return true;

  const protocols = readScopedJson<MaybeProtocol[]>(scope, "protocols", kv);
  if (Array.isArray(protocols) && protocols.some((p) => p && p.pendingSync === true)) return true;

  const atlas = readScopedJson<Record<string, unknown>>(scope, "atlas", kv);
  const organs = readScopedJson<string[]>(scope, "organs", kv) ?? [];
  if (atlas && hasAtlasContent(atlas, organs)) {
    const base = readScopedJson<AtlasBase>(scope, "atlas-base", kv);
    const hash = atlasContentHash(atlas, organs);
    if (!base || base.hash !== hash) return true;
  }
  return false;
}

/**
 * Çıkış: kapsamın v2 önbelleğini temizler — YALNIZ bekleyen iş yoksa (veya
 * `force` — demo hesap verisi oturumluktur). Dönüş: temizlendi mi.
 */
export function clearScopedReflexCache(
  scope: ReflexScope,
  kv?: KeyValueStore | null,
  opts?: { force?: boolean },
): { cleared: boolean; reason?: "pending" } {
  if (!opts?.force && hasPendingReflexWork(scope, kv)) {
    return { cleared: false, reason: "pending" };
  }
  for (const ds of REFLEX_DATASETS) removeScoped(scope, ds, kv);
  return { cleared: true };
}
