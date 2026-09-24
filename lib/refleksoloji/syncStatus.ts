/**
 * Refleksoloji senkron durumu — paylaşımlı istemci store'u (REF-007).
 *
 * Atlas ve Klinik Notlar senkron yardımcıları buraya durum yazar; UI (SyncStatusBadge
 * + hook) useSyncExternalStore ile okur. Amaç: "Kaydedildi" mesajının YALNIZ yerel
 * başarıyı değil, GERÇEK sunucu sonucunu yansıtması; başarısız/çevrimdışı/conflict
 * durumlarının görünür olması ve yeniden denenebilmesi.
 *
 * Çerçeve-bağımsız (React import etmez). SSR güvenli.
 */

export type ReflexologySyncState =
  | "idle"
  | "syncing"
  | "synced"
  | "error"
  | "offline"
  | "conflict";

export interface ReflexologySyncStatus {
  state: ReflexologySyncState;
  /** İnsan-okur kısa mesaj (badge metni). */
  message: string;
  /** error/offline/conflict'te tekrar denemek için (varsa). */
  retry?: () => void;
  /** monotonik değişim sayacı — snapshot kimliği. */
  seq: number;
}

const DEFAULT: ReflexologySyncStatus = { state: "idle", message: "", seq: 0 };

let current: ReflexologySyncStatus = DEFAULT;
const listeners = new Set<() => void>();

export function getReflexologySyncStatus(): ReflexologySyncStatus {
  return current;
}

export function subscribeReflexologySyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setReflexologySyncStatus(
  next: Omit<ReflexologySyncStatus, "seq">,
): void {
  current = { ...next, seq: current.seq + 1 };
  for (const l of listeners) l();
}

/** navigator.onLine'a göre hata mı çevrimdışı mı ayırt eder. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
