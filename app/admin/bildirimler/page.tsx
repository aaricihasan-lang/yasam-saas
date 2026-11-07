"use client";

/**
 * Admin › Tüm bildirimler (Owner bildirim zili geçmişi). Yalnız owner; sunucu 403 → bilgi mesajı.
 * Filtreler: arama (ad / e-posta), tür, durum (açık karar / çözülen / okunmamış / okunmuş bilgi),
 * Türkiye günü tarih aralığı; 25'li sayfalama. Çözülen kararlar silinmez, sonucu ile listelenir.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  OWNER_HISTORY_PAGE_SIZE,
  OWNER_NOTIFICATION_RESOLUTION_LABEL,
  OWNER_NOTIFICATION_TITLE,
  OWNER_NOTIFICATION_TYPE_LABEL,
  OWNER_NOTIFICATION_TYPES,
  type OwnerHistoryStatus,
  type OwnerNotificationHistoryRow,
  type OwnerNotificationType,
} from "@/lib/admin/ownerNotifications";
import { ownerAdminHeaders } from "@/components/admin/notifications/ownerBellStore";

const STATUS_LABEL: Record<OwnerHistoryStatus, string> = {
  all: "Tüm durumlar",
  open: "Karar bekleyen (açık)",
  resolved: "Çözülen kararlar",
  unread: "Okunmamış bilgi",
  read: "Okunmuş bilgi",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

type State =
  | { phase: "loading" }
  | { phase: "denied" }
  | { phase: "error" }
  | { phase: "ready"; rows: OwnerNotificationHistoryRow[]; total: number };

export default function AdminNotificationsPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | OwnerNotificationType>("all");
  const [status, setStatus] = useState<OwnerHistoryStatus>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<State>({ phase: "loading" });
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const headers = ownerAdminHeaders();
    if (!headers) {
      setState({ phase: "denied" });
      return;
    }
    const id = ++reqRef.current;
    const sp = new URLSearchParams({ q, type, status, page: String(page) });
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    try {
      const res = await fetch(`/api/admin/notifications/history?${sp}`, { headers, cache: "no-store" });
      if (id !== reqRef.current) return;
      if (res.status === 401 || res.status === 403) {
        setState({ phase: "denied" });
        return;
      }
      const json = (await res.json().catch(() => null)) as { ok?: boolean; rows?: OwnerNotificationHistoryRow[]; total?: number } | null;
      if (!res.ok || !json?.ok) {
        setState({ phase: "error" });
        return;
      }
      setState({ phase: "ready", rows: json.rows ?? [], total: Number(json.total ?? 0) });
    } catch {
      if (id === reqRef.current) setState({ phase: "error" });
    }
  }, [q, type, status, from, to, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const pages = state.phase === "ready" ? Math.max(1, Math.ceil(state.total / OWNER_HISTORY_PAGE_SIZE)) : 1;
  const field = "min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800";

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-6" data-owner-history>
      <div>
        <Link href="/admin/users" className="text-sm font-black text-violet-700 hover:underline">
          ← Üye Yönetimi
        </Link>
        <h1 className="mt-2 text-2xl font-black text-slate-950">Tüm bildirimler</h1>
        <p className="text-sm font-medium text-slate-600">
          Zil son 30 bilgiyi gösterir; geçmişin tamamı burada. Kararlar çözüldükten sonra da kayıtta kalır.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="grid gap-2 border-b border-slate-100 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          <label className="grid min-w-0">
            <span className="sr-only">Ad veya e-posta ara</span>
            <input
              id="owner-history-q"
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Ad veya e-posta ara"
              className={field}
              autoComplete="off"
            />
          </label>
          <label className="grid min-w-0">
            <span className="sr-only">Bildirim türü</span>
            <select id="owner-history-type" value={type} onChange={(e) => { setType(e.target.value as typeof type); setPage(1); }} className={field}>
              <option value="all">Tüm türler</option>
              {OWNER_NOTIFICATION_TYPES.map((t) => (
                <option key={t} value={t}>{OWNER_NOTIFICATION_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0">
            <span className="sr-only">Durum</span>
            <select id="owner-history-status" value={status} onChange={(e) => { setStatus(e.target.value as OwnerHistoryStatus); setPage(1); }} className={field}>
              {(Object.keys(STATUS_LABEL) as OwnerHistoryStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0">
            <span className="text-[11px] font-bold text-slate-500">Başlangıç</span>
            <input id="owner-history-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={field} />
          </label>
          <label className="grid min-w-0">
            <span className="text-[11px] font-bold text-slate-500">Bitiş</span>
            <input id="owner-history-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={field} />
          </label>
        </div>

        {state.phase === "denied" ? (
          <p className="p-4 text-sm font-semibold text-slate-600">Bu alan yalnız platform owner’ına açıktır.</p>
        ) : state.phase === "error" ? (
          <p className="p-4 text-sm font-semibold text-amber-800">
            Bildirim geçmişi şu an okunamadı.{" "}
            <button type="button" onClick={() => void load()} className="font-black text-violet-700 underline">Tekrar dene</button>
          </p>
        ) : state.phase === "loading" ? (
          <p className="p-4 text-sm font-semibold text-slate-500">Yükleniyor…</p>
        ) : state.rows.length === 0 ? (
          <p className="p-4 text-sm font-semibold text-slate-500">Bu filtrede bildirim yok.</p>
        ) : (
          <ul>
            {state.rows.map((r) => {
              const name = r.full_name || r.email || "Silinmiş üye";
              const st =
                r.kind === "info"
                  ? r.read ? "Bilgi · okundu" : "Bilgi · yeni"
                  : r.resolved_at
                    ? `Çözüldü · ${OWNER_NOTIFICATION_RESOLUTION_LABEL[r.resolution ?? ""] ?? "kapandı"} · ${fmt(r.resolved_at)}`
                    : "Karar bekliyor";
              const tone = r.kind === "info" ? "text-sky-700" : r.resolved_at ? "text-emerald-700" : "text-orange-700";
              const body = (
                <>
                  <span className={`h-fit whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-black ${r.kind === "action" ? "bg-orange-50 text-orange-700" : "bg-sky-50 text-sky-700"}`}>
                    {r.kind === "action" ? "Karar" : "Bilgi"}
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-bold text-slate-900">{name} — {OWNER_NOTIFICATION_TITLE[r.type]}</span>
                    <span className="block text-xs font-semibold text-slate-500">{fmt(r.occurred_at)}</span>
                  </span>
                  <span className={`text-xs font-black sm:text-right ${tone}`}>{st}</span>
                </>
              );
              const cls = "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-slate-100 px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] [&>span:last-child]:col-start-2 sm:[&>span:last-child]:col-start-auto";
              return (
                <li key={r.id} data-owner-history-row data-kind={r.kind}>
                  {r.target_user_id ? (
                    <Link href={`/admin/users/${encodeURIComponent(r.target_user_id)}`} className={`${cls} hover:bg-slate-50`}>{body}</Link>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-2 p-3 text-xs font-semibold text-slate-500">
          <span data-owner-history-total>{state.phase === "ready" ? `${state.total} bildirim` : ""}</span>
          <span className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-black disabled:opacity-40">Önceki</button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-black disabled:opacity-40">Sonraki</button>
          </span>
        </div>
      </section>
    </main>
  );
}
