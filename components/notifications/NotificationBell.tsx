"use client";

/**
 * components/notifications/NotificationBell.tsx — header akışındaki randevu bildirim zili
 * (AŞAMA 2 · §4.2 + §4.4). position:fixed YOK; yerleşimi çağıran belirler:
 *   import NotificationBell from "@/components/notifications/NotificationBell";
 *   <NotificationBell compact className="…" />
 *
 * Davranış:
 *   - Oturumsuz ziyaretçide, /dogaltas* ve /admin* rotalarında HİÇ istek yok, hiçbir şey render edilmez.
 *   - 401/403 (oturum / üyelik / "appointments" izni yok) → polling durur, zil gizlenir.
 *   - Rozet = görünür & okunmamış bildirim sayısı ("görüldü" cihaz-yerel).
 *   - "Tamamlandı" / "Tekrar gösterme" SUNUCUDA (hesap bazlı); iyimser güncelleme, hata → geri al + toast.
 *   - Saatlik tekrar: koşullar sürerken hatırlatma toast'u + rozet tekrar okunmamış (alert() YOK).
 *   - Rota değişimi / dışarı tıklama / Escape → dropdown kapanır.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { shouldSkipAppointmentNotifications } from "@/shared/DashboardNotifications";
import { buildNotificationView } from "@/lib/danisan/appointmentNotifications";
import type { NotificationStateValue } from "@/lib/danisan/appointmentNotifications";
import {
  acquireNotifications,
  getNotificationSnapshot,
  getServerNotificationSnapshot,
  hasNotificationSession,
  itemKey,
  markAllNotificationsSeen,
  registerReminderSink,
  setNotificationState,
  subscribeNotifications,
  unreadCount,
  visibleItems,
  type FeedItem,
} from "./notificationStore";

export type NotificationBellProps = {
  className?: string;
  /** Dar üst bar (modül header'ı) için küçük buton. */
  compact?: boolean;
};

type ShowToast = ReturnType<typeof useToast>["showToast"];

/**
 * Toast sağlayıcısı dışında (ör. layout'ta ToastProvider'ın üstünde) render edilirse
 * çökmez: useToast bağlamı yoksa hata fırlatır → null döner (toast'suz çalışır).
 * useToast her render'da AYNI sırada çağrılır (hook sırası sabit).
 */
function useOptionalToast(): ShowToast | null {
  try {
    return useToast().showToast;
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => {};

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export default function NotificationBell({ className, compact = false }: NotificationBellProps) {
  const pathname = usePathname() ?? "/";
  const skip = shouldSkipAppointmentNotifications(pathname);
  // Hidrasyon güvenli: sunucuda/ilk render'da false → localStorage okunmaz.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  // Oturum bilgisi localStorage'da; giriş/çıkış rota değişimiyle birlikte yeniden değerlendirilir.
  const hasSession = mounted && hasNotificationSession();
  const active = mounted && !skip && hasSession;

  const snap = useSyncExternalStore(subscribeNotifications, getNotificationSnapshot, getServerNotificationSnapshot);
  const showToast = useOptionalToast();

  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt !== null && openAt === pathname; // rota değişince otomatik kapanır
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!active) return;
    return acquireNotifications();
  }, [active]);

  useEffect(() => {
    if (!active || !showToast) return;
    return registerReminderSink((due, now) => {
      const views = due.map((i) =>
        buildNotificationView(i, { clientName: i.clientName, canOpenClient: i.canOpenClient, now: new Date(now) }),
      );
      const first = views[0];
      if (!first) return;
      showToast({
        type: "info",
        duration: 8000,
        title: views.length === 1 ? "Randevu hatırlatması" : `${views.length} randevu hatırlatması`,
        message:
          views.length === 1
            ? `${first.heading} — ${first.whenLabel}`
            : `${first.heading} — ${first.whenLabel} ve ${views.length - 1} randevu daha`,
      });
    });
  }, [active, showToast]);

  const close = useCallback(() => setOpenAt(null), []);

  // Dışarı tıklama + Escape → kapan.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = wrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpenAt(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenAt(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const act = useCallback(
    async (item: FeedItem, state: NotificationStateValue) => {
      const key = itemKey(item);
      setBusyKeys((prev) => new Set(prev).add(key));
      const ok = await setNotificationState(item, state);
      setBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if (!ok) {
        showToast?.({
          type: "error",
          title: "Bildirim güncellenemedi",
          message: "İşlem kaydedilemedi. Lütfen tekrar deneyin.",
        });
      }
    },
    [showToast],
  );

  if (!active || snap.phase === "denied") return null;

  const visible = visibleItems(snap);
  const unread = unreadCount(snap);
  const now = new Date(snap.now || 0);

  const toggle = () => {
    if (open) {
      setOpenAt(null);
      return;
    }
    setOpenAt(pathname);
    markAllNotificationsSeen();
  };

  const size = compact ? "h-9 w-9" : "h-10 w-10";
  const iconSize = compact ? "h-[18px] w-[18px]" : "h-5 w-5";

  return (
    <div ref={wrapRef} className={`relative inline-flex shrink-0 ${className ?? ""}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label="Bildirimler"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Bildirimler"
        className={`relative inline-flex ${size} items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400`}
      >
        <BellIcon className={iconSize} />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-black leading-none text-white"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Bugünkü randevu bildirimleri"
          style={{ width: "min(320px, calc(100vw - 32px))" }}
          className="absolute right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_18px_36px_rgba(15,23,42,0.16)]"
        >
          <div className="bg-gradient-to-r from-slate-900 via-indigo-700 to-fuchsia-600 px-3.5 py-2.5 text-white">
            <div className="text-[11px] font-bold opacity-80">Bildirimler</div>
            <div className="text-sm font-black">Bugünkü randevular</div>
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-2">
            {visible.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs font-semibold text-slate-500">
                {snap.phase === "ready" ? "Bugün için bekleyen randevu bildirimi yok." : "Yükleniyor…"}
              </p>
            ) : (
              <ul className="grid gap-2">
                {visible.map((item) => {
                  const view = buildNotificationView(item, {
                    clientName: item.clientName,
                    canOpenClient: item.canOpenClient,
                    now,
                  });
                  const key = itemKey(item);
                  const busy = busyKeys.has(key);
                  return (
                    <li key={key} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2">
                      <Link href={view.href} onClick={close} className="block min-w-0 rounded-lg px-1 py-0.5 hover:bg-white">
                        <span className="block truncate text-[13px] font-black text-slate-900">{view.heading}</span>
                        {view.subtitle && (
                          <span className="block truncate text-xs font-semibold text-slate-600">{view.subtitle}</span>
                        )}
                        <span className="mt-0.5 block text-xs font-bold text-indigo-700">{view.whenLabel}</span>
                      </Link>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {view.clientHref && (
                          <Link
                            href={view.clientHref}
                            onClick={close}
                            className="rounded-lg border border-violet-200 bg-white px-2 py-1 text-[11px] font-black text-violet-700 hover:bg-violet-50"
                          >
                            Danışan kartı
                          </Link>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void act(item, "done")}
                          title="Bildirimi kapatır; randevu durumunu değiştirmez."
                          className="rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[11px] font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                        >
                          Tamamlandı
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void act(item, "muted")}
                          title="Bu randevu için bildirimi bir daha gösterme."
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                        >
                          Tekrar gösterme
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-slate-100 px-3 py-2 text-right">
            <Link href="/dashboard/ajanda" onClick={close} className="text-xs font-black text-indigo-700 hover:underline">
              Ajandayı aç
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
