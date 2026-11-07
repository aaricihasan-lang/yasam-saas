"use client";

/**
 * Owner bildirim zili (Admin Üye Yönetimi V2 · Aşama 1). Mevcut randevu zilinden (NotificationBell)
 * TAMAMEN ayrıdır; onun kodu ve davranışı değişmez.
 *
 *   - Yalnız platform owner'ı görür: sunucu 403 dönerse (normal admin) veya oturum admin değilse
 *     hiçbir şey çizilmez. Uzman tarayıcısı bu uca hiç istek atmaz.
 *   - İki bölüm: "Karar bekleyen" (yalnız işlem sonuçlanınca düşer) ve "Bilgi" (okununca okunur).
 *   - "Tümünü okundu" yalnız bilgileri okur. "Tüm bildirimler" → /admin/bildirimler.
 *   - placement="side": uzman/ana sayfa sol menüsü (admin sayfalarında gizlenir; orada admin
 *     gezinme satırındaki zil kullanılır). placement="admin": admin üst gezinme satırı.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { computeBellPanelBox } from "@/components/notifications/NotificationBell";
import {
  OWNER_ACTION_HINT,
  OWNER_NOTIFICATION_TITLE,
  type OwnerNotificationItem,
} from "@/lib/admin/ownerNotifications";
import {
  acquireOwnerBell,
  getOwnerBellServerSnapshot,
  getOwnerBellSnapshot,
  markOwnerInfoRead,
  refreshOwnerBell,
  subscribeOwnerBell,
} from "./ownerBellStore";

type Props = { placement: "side" | "admin"; compact?: boolean };
const noopSubscribe = () => () => {};
type Box = ReturnType<typeof computeBellPanelBox>;

function ago(iso: string, nowMs: number): string {
  const d = nowMs - Date.parse(iso);
  if (!Number.isFinite(d)) return "";
  if (d < 3_600_000) return `${Math.max(1, Math.round(d / 60_000))} dk önce`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)} sa önce`;
  const n = Math.round(d / 86_400_000);
  return n === 1 ? "dün" : `${n} gün önce`;
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export default function OwnerBell({ placement, compact = false }: Props) {
  const pathname = usePathname() ?? "";
  const hiddenHere = placement === "side" && pathname.startsWith("/admin");
  const snap = useSyncExternalStore(subscribeOwnerBell, getOwnerBellSnapshot, getOwnerBellServerSnapshot);
  // Panel, açıldığı adreste açık kalır; sayfa değişince kendiliğinden kapanır (randevu ziliyle aynı kalıp).
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean | ((p: boolean) => boolean)) =>
    setOpenAt((prev) => ((typeof v === "function" ? v(prev === pathname) : v) ? pathname : null));
  const [box, setBox] = useState<Box | null>(null);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const titleId = useId();

  useEffect(() => {
    if (hiddenHere) return;
    return acquireOwnerBell();
  }, [hiddenHere]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      if (!b) return;
      const vv = window.visualViewport;
      setBox(computeBellPanelBox(b, { width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight }));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpenAt(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenAt(null);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!mounted || hiddenHere || snap.phase === "denied" || (snap.phase === "idle" && !snap.feed)) return null;

  const feed = snap.feed;
  const actionCount = feed?.counts.action ?? 0;
  const unreadInfo = feed?.counts.unread_info ?? 0;
  // Göreli zaman, sunucunun yanıt anına göre (saf; render sırasında saat okunmaz).
  const nowMs = feed ? Date.parse(feed.server_now) || snap.fetchedAt : snap.fetchedAt;
  const label = `Yönetim bildirimleri: ${actionCount} karar bekliyor, ${unreadInfo} okunmamış bilgi`;

  const toggle = () => {
    if (!open) void refreshOwnerBell();
    setOpen((v) => !v);
  };

  const row = (it: OwnerNotificationItem, kind: "action" | "info") => {
    const name = it.full_name || it.email || "Silinmiş üye";
    const hint = OWNER_ACTION_HINT[it.type];
    const href = it.target_user_id ? `/admin/users/${encodeURIComponent(it.target_user_id)}` : "/admin/bildirimler";
    const unread = kind === "info" && !it.read;
    return (
      <li key={it.id}>
        <Link
          href={href}
          onClick={() => {
            if (unread) void markOwnerInfoRead({ ids: [it.id] });
            setOpen(false);
          }}
          data-owner-notif={kind}
          data-owner-notif-id={it.id}
          className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-xl px-2.5 py-2 hover:bg-slate-50"
        >
          <span
            aria-hidden
            className={`mt-1.5 h-2.5 w-2.5 rounded-full ${kind === "action" ? "bg-orange-600" : unread ? "bg-sky-600" : "border-2 border-slate-300"}`}
          />
          <span className="min-w-0">
            <span className="block break-words text-[13px] font-bold leading-snug text-slate-900">
              {name} — {OWNER_NOTIFICATION_TITLE[it.type]}
            </span>
            <span className="block text-xs font-medium text-slate-500">
              {kind === "action" && hint ? `${hint.sub} · ` : ""}
              {ago(it.occurred_at, nowMs)}
            </span>
          </span>
          <span className={`self-center whitespace-nowrap text-xs font-black ${kind === "action" ? "text-orange-700" : "text-violet-700"}`}>
            {kind === "action" && hint ? hint.go : "Üyeye git"} →
          </span>
        </Link>
      </li>
    );
  };

  const size = compact ? "h-9" : "h-10";
  return (
    <div className="relative inline-flex shrink-0" data-owner-bell>
      <button
        ref={btnRef}
        type="button"
        id="owner-bell"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Yönetim bildirimleri — yalnız owner görür"
        className={`relative inline-flex ${size} items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-2.5 text-xs font-black text-orange-800 shadow-sm transition hover:bg-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400`}
      >
        <BellIcon className="h-[18px] w-[18px]" />
        {placement === "admin" ? <span>Yönetim</span> : null}
        {actionCount > 0 ? (
          <span
            data-owner-bell-action
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-orange-600 px-1 text-[10px] font-black leading-none text-white"
          >
            {actionCount > 99 ? "99+" : actionCount}
          </span>
        ) : null}
        {unreadInfo > 0 ? (
          <span data-owner-bell-info aria-hidden className="absolute bottom-1 right-1 h-2 w-2 rounded-full border border-white bg-sky-600" />
        ) : null}
        {snap.stale ? <span data-owner-bell-stale className="sr-only">Güncellenemedi</span> : null}
      </button>
      <span className="sr-only" aria-live="polite">{actionCount > 0 ? `${actionCount} karar bekliyor` : ""}</span>

      {open && box && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              data-owner-bell-panel
              style={{ top: box.bottom === undefined ? box.top : undefined, bottom: box.bottom, left: box.left, width: box.width, maxHeight: box.maxHeight }}
              className="fixed z-[95] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-[0_18px_36px_rgba(15,23,42,0.22)]"
            >
              <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
                <div>
                  <div id={titleId} className="text-sm font-black text-slate-900">Yönetim bildirimleri</div>
                  <div className="text-[11px] font-semibold text-slate-500">Yalnız owner görür · randevu bildirimleri ayrı</div>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-1.5 text-xs font-black text-violet-700 hover:bg-violet-50">
                  Kapat
                </button>
              </div>
              {snap.stale ? (
                <p data-owner-bell-stale-note className="shrink-0 border-b border-amber-100 bg-amber-50 px-3.5 py-1.5 text-[11px] font-semibold text-amber-900">
                  Bildirimler şu an güncellenemedi; son bilinen durum gösteriliyor.
                </p>
              ) : null}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <section data-owner-sec="action" className="px-1.5 py-1.5">
                  <h3 className="flex items-center gap-2 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    Karar bekleyen
                    <span className="rounded-full border border-orange-200 bg-orange-50 px-2 text-[11px] text-orange-700">{actionCount}</span>
                  </h3>
                  {feed && feed.actions.length ? (
                    <ul className="grid">{feed.actions.map((it) => row(it, "action"))}</ul>
                  ) : (
                    <p className="px-2.5 py-2 text-xs font-semibold text-slate-500">Bekleyen karar yok.</p>
                  )}
                </section>
                <section data-owner-sec="info" className="border-t border-slate-100 px-1.5 py-1.5">
                  <h3 className="flex items-center gap-2 px-2 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    Bilgi
                    <span className="rounded-full bg-sky-50 px-2 text-[11px] text-sky-700">{unreadInfo} yeni</span>
                    <span className="flex-1" />
                    {unreadInfo > 0 ? (
                      <button
                        type="button"
                        data-owner-read-all
                        onClick={() => void markOwnerInfoRead({ allInfo: true })}
                        className="rounded px-1 text-[11px] font-black normal-case tracking-normal text-violet-700 hover:bg-violet-50"
                      >
                        Tümünü okundu
                      </button>
                    ) : null}
                  </h3>
                  {feed && feed.infos.length ? (
                    <ul className="grid">{feed.infos.map((it) => row(it, "info"))}</ul>
                  ) : (
                    <p className="px-2.5 py-2 text-xs font-semibold text-slate-500">Bilgi bildirimi yok.</p>
                  )}
                </section>
              </div>
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-3.5 py-2">
                <span className="text-[11px] font-semibold text-slate-500">“Tümünü okundu” yalnız bilgileri okur.</span>
                <Link
                  href="/admin/bildirimler"
                  onClick={() => setOpen(false)}
                  data-owner-all-notifs
                  className="whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-black text-slate-800 hover:bg-slate-50"
                >
                  Tüm bildirimler →
                </Link>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
