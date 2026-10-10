/**
 * components/notifications/notificationStore.ts — randevu bildirimi istemci deposu.
 *
 * Birden çok NotificationBell örneği (hub hero + modül üst barı) AYNI veriyi paylaşır:
 *   - tek polling (5 dk) + tek dakikalık saat (görünürlük/hatırlatma yeniden değerlendirme),
 *   - ilk çekim boşta (requestIdleCallback) → aktif sayfanın kendi verisi önce yüklenir,
 *   - 401/403 → polling DURUR (izinsiz/oturumsuz kullanıcıya tekrar istek yok),
 *   - hatırlatma toast'u TEK kez (ilk kayıtlı sink) gösterilir; çift toast yok.
 *
 * Kalıcılık:
 *   - "Tamamlandı" / "Tekrar gösterme" → SUNUCUDA (POST …/notifications/state).
 *   - "görüldü" (okunmamış rozeti; WT8: yalnız açılan/işlenen bildirim) + son hatırlatma zamanı → cihaz-yerel localStorage;
 *     YALNIZ "randevuId|epochMs" anahtarı + zaman damgası (ad/başlık/PII YOK).
 */

import { backgroundSyncYasamUserFromDb, readSessionToken, readYasamUser, hasWebSession } from "@/lib/auth/yasamUser";
import {
  isNotifiable,
  notificationStateKey,
  shouldRemind,
  type NotificationAppointment,
  type NotificationStateValue,
} from "@/lib/danisan/appointmentNotifications";

export type FeedItem = NotificationAppointment & {
  clientName: string | null;
  canOpenClient: boolean;
};

export type NotificationPhase = "idle" | "ready" | "denied";

export type NotificationSnapshot = {
  phase: NotificationPhase;
  items: readonly FeedItem[];
  seen: ReadonlySet<string>;
  /** Son yeniden değerlendirme anı (render'da Date.now() çağrılmaz). */
  now: number;
};

export type ReminderSink = (due: readonly FeedItem[], now: number) => void;

const POLL_MS = 5 * 60 * 1000;
const TICK_MS = 60 * 1000;
const STORAGE_KEY = "yasam.apptNotif.v1";
const ENDPOINT = "/api/appointments/notifications";

const SERVER_SNAPSHOT: NotificationSnapshot = Object.freeze({
  phase: "idle",
  items: [],
  seen: new Set<string>(),
  now: 0,
}) as NotificationSnapshot;

let snapshot: NotificationSnapshot = { phase: "idle", items: [], seen: new Set(), now: 0 };
const listeners = new Set<() => void>();
const sinks: ReminderSink[] = [];
/** POST sürerken gizlenen öğeler (arada gelen polling yanıtı geri getirmesin). */
const pendingHidden = new Map<string, FeedItem>();

let holders = 0;
let generation = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let kickoffTimeout: ReturnType<typeof setTimeout> | null = null;
let kickoffIdle: number | null = null;
let inflight: Promise<void> | null = null;

// ─── Cihaz-yerel kalıcılık (PII YOK) ──────────────────────────────────────────

type Persisted = { seen: string[]; reminded: Record<string, number> };
let persisted: Persisted | null = null;

function loadPersisted(): Persisted {
  if (persisted) return persisted;
  let next: Persisted = { seen: [], reminded: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      const seen = Array.isArray(p.seen) ? p.seen.filter((s): s is string => typeof s === "string").slice(0, 500) : [];
      const reminded: Record<string, number> = {};
      if (p.reminded && typeof p.reminded === "object") {
        for (const [k, v] of Object.entries(p.reminded)) {
          if (typeof v === "number" && Number.isFinite(v)) reminded[k] = v;
        }
      }
      next = { seen, reminded };
    }
  } catch {
    // erişilemeyen depolama (gizli pencere vb.) → bellek içi devam
  }
  persisted = next;
  return next;
}

function savePersisted(): void {
  if (!persisted) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // yoksay
  }
}

/** Yalnız güncel akıştaki anahtarları tut (depolama büyümez). */
function prunePersisted(keys: Set<string>): void {
  const p = loadPersisted();
  p.seen = p.seen.filter((k) => keys.has(k) || pendingHidden.has(k));
  for (const k of Object.keys(p.reminded)) if (!keys.has(k)) delete p.reminded[k];
  savePersisted();
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function emit(next: NotificationSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

export function itemKey(item: Pick<FeedItem, "id" | "appointment_date">): string {
  return notificationStateKey(item.id, item.appointment_date) ?? item.id;
}

export function hasNotificationSession(): boolean {
  if (typeof window === "undefined") return false;
  return hasWebSession(); // HTTPONLY H5: web token yoksa HttpOnly cookie
}

function authHeaders(json = false): Record<string, string> {
  const uid = readYasamUser()?.id;
  const token = readSessionToken();
  return {
    "x-user-id": uid ?? "",
    ...(token ? { "x-session-token": token } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function sortItems(items: FeedItem[]): FeedItem[] {
  return items.sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime());
}

function stopTimers(): void {
  if (pollTimer) clearInterval(pollTimer);
  if (tickTimer) clearInterval(tickTimer);
  if (kickoffTimeout) clearTimeout(kickoffTimeout);
  if (kickoffIdle !== null) {
    const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (typeof cic === "function") cic(kickoffIdle);
  }
  pollTimer = null;
  tickTimer = null;
  kickoffTimeout = null;
  kickoffIdle = null;
}

/** Şu an görünür (isNotifiable) öğeler — done/muted sunucuda zaten süzülmüş durumda. */
export function visibleItems(snap: NotificationSnapshot, now: number = snap.now): FeedItem[] {
  const at = new Date(now);
  return snap.items.filter((i) => isNotifiable(i, at));
}

export function unreadCount(snap: NotificationSnapshot): number {
  return visibleItems(snap).filter((i) => !snap.seen.has(itemKey(i))).length;
}

// ─── Hatırlatma ───────────────────────────────────────────────────────────────

function runReminders(): void {
  if (snapshot.phase !== "ready") return;
  const now = Date.now();
  const p = loadPersisted();
  const due = visibleItems(snapshot, now).filter((i) => shouldRemind(i, new Date(now), p.reminded[itemKey(i)] ?? null));
  if (due.length === 0) return;
  const seen = new Set(snapshot.seen);
  for (const i of due) {
    const k = itemKey(i);
    p.reminded[k] = now;
    seen.delete(k); // rozet tekrar okunmamış
  }
  p.seen = [...seen];
  savePersisted();
  emit({ ...snapshot, seen, now });
  const sink = sinks[0];
  if (sink) sink(due, now);
}

// ─── Ağ ───────────────────────────────────────────────────────────────────────

export function refreshNotifications(): Promise<void> {
  if (inflight) return inflight;
  const gen = generation;
  inflight = (async () => {
    if (!hasNotificationSession()) {
      emit({ ...snapshot, phase: "idle", items: [], now: Date.now() });
      return;
    }
    try {
      const res = await fetch(ENDPOINT, { headers: authHeaders(), cache: "no-store" });
      if (gen !== generation) return;
      if (res.status === 401 || res.status === 403) {
        // Oturum/üyelik/modül izni yok → bir daha istek atma (bu yaşam döngüsünde).
        stopTimers();
        emit({ ...snapshot, phase: "denied", items: [], now: Date.now() });
        return;
      }
      if (!res.ok) return; // geçici hata → önceki liste korunur, sonraki polling dener
      const json = (await res.json()) as { items?: FeedItem[] };
      if (gen !== generation) return;
      const items = sortItems((json.items ?? []).filter((i) => !pendingHidden.has(itemKey(i))));
      const keys = new Set(items.map(itemKey));
      prunePersisted(keys);
      const seen = new Set(loadPersisted().seen);
      emit({ phase: "ready", items, seen, now: Date.now() });
      runReminders();
    } catch {
      // ağ hatası → sessiz; sonraki polling dener (PII/hata metni loglanmaz)
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

function tick(): void {
  emit({ ...snapshot, now: Date.now() });
  runReminders();
}

function start(): void {
  generation++;
  const p = loadPersisted();
  emit({ phase: "idle", items: [], seen: new Set(p.seen), now: Date.now() });
  const kickoff = () => {
    kickoffIdle = null;
    kickoffTimeout = null;
    backgroundSyncYasamUserFromDb();
    void refreshNotifications();
  };
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof ric === "function") kickoffIdle = ric(kickoff, { timeout: 3000 });
  else kickoffTimeout = setTimeout(kickoff, 2000);
  pollTimer = setInterval(() => void refreshNotifications(), POLL_MS);
  tickTimer = setInterval(tick, TICK_MS);
}

function stop(): void {
  generation++;
  stopTimers();
}

// ─── Dış API ──────────────────────────────────────────────────────────────────

export function subscribeNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNotificationSnapshot(): NotificationSnapshot {
  return snapshot;
}

export function getServerNotificationSnapshot(): NotificationSnapshot {
  return SERVER_SNAPSHOT;
}

/** Bir zil örneği aktifken çağrılır; ilk örnek polling'i başlatır, son örnek durdurur. */
export function acquireNotifications(): () => void {
  holders++;
  if (holders === 1) start();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) stop();
  };
}

/** Hatırlatma toast'u gösterecek sink (yalnız ilk kayıtlı sink çağrılır). */
export function registerReminderSink(sink: ReminderSink): () => void {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
  };
}

/**
 * WT8 owner kararı: paneli AÇMAK hiçbir bildirimi "görüldü" saymaz (rozet sayısı değişmez).
 * Yalnız kullanıcı o bildirimi gerçekten açtığında (randevu / danışan kartı bağlantısı) veya
 * işlediğinde (Tamamlandı / Tekrar gösterme) YALNIZ O bildirim görüldü olur (cihaz-yerel).
 * Saatlik hatırlatma bir bildirimi yine tekrar okunmamış yapar (runReminders — değişmedi).
 */
export function markNotificationSeen(item: Pick<FeedItem, "id" | "appointment_date">): void {
  const key = itemKey(item);
  if (snapshot.seen.has(key)) return;
  const seen = new Set(snapshot.seen);
  seen.add(key);
  const p = loadPersisted();
  p.seen = [...seen];
  savePersisted();
  emit({ ...snapshot, seen });
}

/**
 * "Tamamlandı" / "Tekrar gösterme" — iyimser kaldırma + sunucu kaydı.
 * Hata → öğe geri eklenir ve false döner (çağıran toast gösterir).
 */
export async function setNotificationState(item: FeedItem, state: NotificationStateValue): Promise<boolean> {
  const key = itemKey(item);
  pendingHidden.set(key, item);
  emit({ ...snapshot, items: snapshot.items.filter((i) => itemKey(i) !== key) });
  let ok = false;
  try {
    const res = await fetch(`${ENDPOINT}/state`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ appointmentId: item.id, state }),
      cache: "no-store",
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  pendingHidden.delete(key);
  if (!ok && !snapshot.items.some((i) => itemKey(i) === key)) {
    emit({ ...snapshot, items: sortItems([...snapshot.items, item]) });
  }
  return ok;
}
