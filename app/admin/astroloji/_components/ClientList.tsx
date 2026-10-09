"use client";

/**
 * Astroloji Danışan Listesi (Aşama 7B). Arama, doğum tarihi filtresi, arşiv görünümü, sıralama ve
 * kademeli yükleme SUNUCUDA yapılır (uzman sahipliği filtresi korunur; 200 kayıt sınırı yoktur).
 * Her satırda kayıtlı analiz sayısı ve son analiz tarihi gösterilir.
 */

import { useEffect, useRef, useState } from "react";
import { astroFetch } from "../_lib/api";

export type ClientListItem = {
  id: string;
  label: string;
  clientId: string | null;
  clientName: string | null;
  currentRevision: number;
  current: { birthDate: string; birthTime: string | null; timeKnown: boolean; locationLabel: string } | null;
  archivedAt: string | null;
  analysisCount: number;
  lastAnalysisAt: string | null;
};

type Page = { profiles: ClientListItem[]; total: number; hasMore: boolean };

const PAGE = 30;

export const ASTRO_SEPARATION_NOTE =
  "Astroloji analizleri kendi modülünde saklanır. Danışan Yolculuğu ile yalnızca isteğe bağlı danışan eşleştirmesi ve analiz bulunma durumu paylaşılır. Haritalar, yorumlar ve raporlar Danışan Yolculuğu'na aktarılmaz.";

function fmtDay(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("tr-TR");
}

/** Küçük bilgi simgesi: tıklayınca / klavyeyle açılır, mobilde tam genişlikte okunur. */
export function AstroSeparationInfo() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="astro-separation-note"
        aria-label="Astroloji ve Danışan Yolculuğu ayrımı hakkında bilgi"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-400 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
        data-testid="astro-info-icon"
      >
        i
      </button>
      {open && (
        <span
          id="astro-separation-note"
          role="note"
          className="fixed inset-x-4 top-24 z-30 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700 shadow-lg sm:absolute sm:inset-x-auto sm:left-0 sm:top-7 sm:w-80"
          data-testid="astro-info-note"
        >
          {ASTRO_SEPARATION_NOTE}
          <button type="button" onClick={() => setOpen(false)} className="mt-2 block text-[11px] text-violet-700 underline">
            Kapat
          </button>
        </span>
      )}
    </span>
  );
}

export default function ClientList({
  selectedId,
  reloadKey,
  onSelect,
  onCreate,
  onItems,
}: {
  selectedId: string | null;
  reloadKey: number;
  onSelect: (item: ClientListItem) => void;
  onCreate: () => void;
  onItems?: (items: ClientListItem[]) => void;
}) {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [items, setItems] = useState<ClientListItem[] | null>(null);
  const [meta, setMeta] = useState<{ total: number; hasMore: boolean }>({ total: 0, hasMore: false });
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const seq = useRef(0);
  const onItemsRef = useRef(onItems);
  useEffect(() => {
    onItemsRef.current = onItems;
  }, [onItems]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = (offset: number) => {
    const sp = new URLSearchParams({ limit: String(PAGE), offset: String(offset), sort });
    if (qDebounced.trim()) sp.set("q", qDebounced.trim());
    if (birthDate) sp.set("birthDate", birthDate);
    if (archived) sp.set("archived", "1");
    return sp.toString();
  };

  useEffect(() => {
    const my = ++seq.current;
    void astroFetch<Page>(`/api/admin/astroloji/profiles?${params(0)}`).then((r) => {
      if (my !== seq.current) return; // bayat yanıt (filtre değişti)
      setItems(r.ok ? r.data.profiles : []);
      setMeta(r.ok ? { total: r.data.total, hasMore: r.data.hasMore } : { total: 0, hasMore: false });
      setError(r.ok ? null : r.error);
      if (r.ok) onItemsRef.current?.(r.data.profiles);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDebounced, birthDate, archived, sort, reloadKey]);

  async function loadMore() {
    if (!items) return;
    const my = seq.current;
    setLoadingMore(true);
    const r = await astroFetch<Page>(`/api/admin/astroloji/profiles?${params(items.length)}`);
    setLoadingMore(false);
    if (my !== seq.current || !r.ok) return;
    const next = [...items, ...r.data.profiles.filter((p) => !items.some((x) => x.id === p.id))];
    setItems(next);
    setMeta({ total: r.data.total, hasMore: r.data.hasMore });
    onItemsRef.current?.(r.data.profiles);
  }

  const filtered = qDebounced.trim() !== "" || birthDate !== "";

  return (
    <aside className="flex min-w-0 flex-col gap-3" aria-label="Astroloji danışan listesi" data-testid="astro-client-list">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Danışanlar <AstroSeparationInfo />
        </h2>
        <button type="button" className="text-sm text-violet-700 underline" onClick={onCreate}>
          + Yeni
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={100}
          placeholder="Ad, soyad veya profil adı ara"
          aria-label="Danışan ara"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} aria-label="Doğum tarihine göre filtrele" className="min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          <select value={sort} onChange={(e) => setSort(e.target.value as "recent" | "name")} aria-label="Sıralama" className="min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="recent">Son işlem</option>
            <option value="name">Ada göre</option>
          </select>
        </div>
        <div className="flex rounded-lg border border-slate-300 p-0.5 text-xs" role="group" aria-label="Kayıt durumu">
          {([
            [false, "Etkin"],
            [true, "Arşiv"],
          ] as const).map(([v, l]) => (
            <button key={l} type="button" aria-pressed={archived === v} onClick={() => setArchived(v)} className={`flex-1 rounded-md px-2 py-1 ${archived === v ? "bg-slate-800 text-white" : "text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {items === null ? (
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">{archived ? "Arşivde kayıt yok." : filtered ? "Aramaya uyan danışan yok." : "Henüz profil yok."}</p>
      ) : (
        <>
          <p className="text-xs text-slate-500" data-testid="astro-client-count">
            {meta.total} kayıt{items.length < meta.total ? ` · ${items.length} gösteriliyor` : ""}
          </p>
          <ul className="flex flex-col gap-1.5">
            {items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  aria-current={selectedId === p.id ? "true" : undefined}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${selectedId === p.id ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white hover:border-violet-200"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-slate-800">{p.label}</span>
                    {p.archivedAt && <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">Arşiv</span>}
                  </div>
                  {p.clientName && <div className="text-xs text-emerald-700">Danışan: {p.clientName}</div>}
                  {p.current && (
                    <div className="text-xs text-slate-500">
                      {fmtDay(p.current.birthDate)} · {p.current.timeKnown ? p.current.birthTime?.slice(0, 5) : "saat bilinmiyor"} · {p.current.locationLabel}
                    </div>
                  )}
                  <div className="text-xs text-slate-600">
                    {p.analysisCount > 0 ? `${p.analysisCount} kayıtlı analiz · son: ${fmtDay(p.lastAnalysisAt)}` : "Kayıtlı analiz yok"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {meta.hasMore && (
            <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-60" data-testid="astro-client-more">
              {loadingMore ? "Yükleniyor…" : `Daha fazla göster (${items.length} / ${meta.total})`}
            </button>
          )}
        </>
      )}
    </aside>
  );
}
