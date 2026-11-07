"use client";

/**
 * Owner bildirim zili — istemci deposu (tek örnek; tüm zil kopyaları aynı veriyi paylaşır).
 *
 *   - Yalnız admin oturumunda istek atar; uzman / ziyaretçi için HİÇ istek yok.
 *   - 401/403 (normal admin, süresi dolmuş oturum) → "denied": zil kendini gizler, yoklama durur.
 *   - 45 sn'de bir yoklama (sekme görünürken), sekmeye dönüş / pencere odağında anında yenileme.
 *   - Geçici hata (ağ / 5xx): SON BİLİNEN sayılar korunur, `stale` işaretlenir — sayaç 0'a DÜŞMEZ.
 */
import { isAdminUser, readSessionToken, readYasamUser } from "@/lib/auth/yasamUser";
import type { OwnerNotificationFeed } from "@/lib/admin/ownerNotifications";

export type OwnerBellSnapshot = {
  phase: "idle" | "ready" | "denied";
  feed: OwnerNotificationFeed | null;
  stale: boolean;
  loading: boolean;
  fetchedAt: number;
};

const ENDPOINT = "/api/admin/notifications";
const POLL_MS = 45_000;

let snap: OwnerBellSnapshot = { phase: "idle", feed: null, stale: false, loading: false, fetchedAt: 0 };
const SERVER_SNAP: OwnerBellSnapshot = snap;
const listeners = new Set<() => void>();
let holders = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;

function emit(next: Partial<OwnerBellSnapshot>): void {
  snap = { ...snap, ...next };
  for (const l of listeners) l();
}

export function ownerAdminHeaders(json = false): Record<string, string> | null {
  const u = readYasamUser();
  if (!u || !isAdminUser(u)) return null;
  const token = readSessionToken();
  return {
    "x-admin-id": u.id,
    ...(token ? { "x-session-token": token } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export function refreshOwnerBell(): Promise<void> {
  if (snap.phase === "denied") return Promise.resolve();
  if (inflight) return inflight;
  const headers = ownerAdminHeaders();
  if (!headers) {
    emit({ phase: "denied" });
    return Promise.resolve();
  }
  emit({ loading: true });
  inflight = (async () => {
    try {
      const res = await fetch(ENDPOINT, { headers, cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        stopPolling();
        emit({ phase: "denied", loading: false });
        return;
      }
      const json = (await res.json().catch(() => null)) as (OwnerNotificationFeed & { ok?: boolean }) | null;
      if (!res.ok || !json || json.ok === false || !json.counts) {
        emit({ stale: true, loading: false, phase: snap.feed ? "ready" : snap.phase });
        return;
      }
      emit({ phase: "ready", feed: json, stale: false, loading: false, fetchedAt: Date.now() });
    } catch {
      emit({ stale: true, loading: false, phase: snap.feed ? "ready" : snap.phase });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function onVisible(): void {
  if (document.visibilityState === "visible") void refreshOwnerBell();
}

function startPolling(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void refreshOwnerBell();
  }, POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
}

function stopPolling(): void {
  if (timer) clearInterval(timer);
  timer = null;
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  if (typeof window !== "undefined") window.removeEventListener("focus", onVisible);
}

/** Bileşen takıldığında çağrılır; dönen fonksiyon bırakır (son bırakan yoklamayı durdurur). */
export function acquireOwnerBell(): () => void {
  holders++;
  if (holders === 1) {
    void refreshOwnerBell();
    startPolling();
  }
  return () => {
    holders = Math.max(0, holders - 1);
    if (holders === 0) stopPolling();
  };
}

export function subscribeOwnerBell(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const getOwnerBellSnapshot = (): OwnerBellSnapshot => snap;
export const getOwnerBellServerSnapshot = (): OwnerBellSnapshot => SERVER_SNAP;

/** Yalnız bilgi bildirimlerini okundu işaretler (karar bekleyenler sunucuda asla kapanmaz). */
export async function markOwnerInfoRead(input: { ids?: number[]; allInfo?: boolean }): Promise<boolean> {
  const headers = ownerAdminHeaders(true);
  if (!headers) return false;
  try {
    const res = await fetch(`${ENDPOINT}/read`, { method: "POST", headers, body: JSON.stringify(input), cache: "no-store" });
    if (!res.ok) return false;
    if (inflight) await inflight; // eski yanıt yeni okundu bilgisini ezmesin
    await refreshOwnerBell();
    return true;
  } catch {
    return false;
  }
}
