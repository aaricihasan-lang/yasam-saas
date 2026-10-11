"use client";

/**
 * Gökyüzü Atlası — ANALİZ ARŞİVİ listesi. YALNIZ en az bir kayıtlı analizi olan danışan profilleri (etkin + arşivli
 * birleşik; arşiv durumu değişmez, rozetle gösterilir). Arama, sıralama, sayfalama ve kapsam SUNUCUDA
 * (/profiles?view=archive; uzman sahipliği + tenant RPC içinde). Bu bileşen hiçbir şey silmez: silme talebini
 * ArchiveDeleteFlow'a iletir (çok katmanlı onay + sunucu doğrulaması).
 */
import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, FolderOpen, Search, Trash2 } from "lucide-react";
import { atlasDarkInput, atlasPanel, atlasSurface } from "../AtlasShell";
import { astroFetch } from "../../_lib/api";

export type ArchiveRow = {
  index: number;
  id: string;
  label: string;
  clientName: string | null;
  currentRevision: number;
  current: { birthDate: string; birthTime: string | null; timeKnown: boolean; locationLabel: string } | null;
  archivedAt: string | null;
  analysisCount: number;
  lastAnalysisAt: string | null;
};
type Page = { total: number; hasMore: boolean; profiles: ArchiveRow[] };

const SORTS: [string, string][] = [
  ["name_asc", "Ad A–Z"],
  ["name_desc", "Ad Z–A"],
  ["last_desc", "Son analiz: en yeni"],
  ["last_asc", "Son analiz: en eski"],
  ["birth_desc", "Doğum tarihi: en yeni"],
  ["birth_asc", "Doğum tarihi: en eski"],
];
const PAGE = 30;

const day = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("tr-TR");
};

export default function ArchiveList({
  reloadKey,
  onOpen,
  onDelete,
  onItems,
  sortRequest,
}: {
  reloadKey: number;
  onOpen: (id: string) => void;
  /** scope: "single" (satır) | "selected" (işaretliler) | "all" (TÜM arşiv — arama/filtreden bağımsız, sunucuda hesaplanır). */
  onDelete: (req: { scope: "single" | "selected" | "all"; ids: string[] }) => void;
  onItems?: (rows: { id: string; label: string }[]) => void;
  /** Dışarıdan sıralama isteği (ör. ana sayfa "Son Çalışmalar" → "last_desc"); her yeni n bir kez uygulanır. */
  sortRequest?: { sort: string; n: number };
}) {
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [sort, setSort] = useState(sortRequest?.sort ?? "name_asc");
  const [sortReqN, setSortReqN] = useState(sortRequest?.n);
  if (sortRequest && sortRequest.n !== sortReqN) {
    setSortReqN(sortRequest.n);
    setSort(sortRequest.sort);
  }
  const [items, setItems] = useState<ArchiveRow[] | null>(null);
  const [meta, setMeta] = useState({ total: 0, hasMore: false });
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const seq = useRef(0);
  const onItemsRef = useRef(onItems);
  useEffect(() => {
    onItemsRef.current = onItems;
  }, [onItems]);

  useEffect(() => {
    const t = setTimeout(() => setQd(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = (offset: number) => {
    const sp = new URLSearchParams({ view: "archive", sort, limit: String(PAGE), offset: String(offset) });
    if (qd.trim()) sp.set("q", qd.trim());
    return sp.toString();
  };
  useEffect(() => {
    const my = ++seq.current;
    void astroFetch<Page>(`/api/admin/astroloji/profiles?${params(0)}`).then((r) => {
      if (my !== seq.current) return;
      setItems(r.ok ? r.data.profiles : []);
      setMeta(r.ok ? { total: r.data.total, hasMore: r.data.hasMore } : { total: 0, hasMore: false });
      setError(r.ok ? null : r.error);
      // Silinen / listeden düşen kayıtlar seçimde kalmaz.
      if (r.ok) setPicked((s) => new Set([...s].filter((id) => r.data.profiles.some((p) => p.id === id))));
      if (r.ok) onItemsRef.current?.(r.data.profiles);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qd, sort, reloadKey]);

  async function loadMore() {
    if (!items) return;
    const my = seq.current;
    setMore(true);
    const r = await astroFetch<Page>(`/api/admin/astroloji/profiles?${params(items.length)}`);
    setMore(false);
    if (my !== seq.current || !r.ok) return;
    setItems([...items, ...r.data.profiles.filter((p) => !items.some((x) => x.id === p.id))]);
    setMeta({ total: r.data.total, hasMore: r.data.hasMore });
    onItemsRef.current?.(r.data.profiles);
  }

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const shownIds = items?.map((x) => x.id) ?? [];
  const allShownPicked = shownIds.length > 0 && shownIds.every((id) => picked.has(id));
  const filtered = qd.trim() !== "";

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Analiz Arşivi" data-testid="astro-archive-list">
      {/* Araç çubuğu (koyu cam): arama · sıralama · toplu işlemler */}
      <div className={`${atlasSurface} flex flex-wrap items-center gap-2 px-3 py-2.5`}>
        <label className={`${atlasDarkInput} flex min-w-[220px] flex-1 items-center gap-2 py-1.5 focus-within:border-[#D9B56F]/70`}>
          <Search className="h-4 w-4 text-[#E6CF9F]/70" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} placeholder="Ad, soyad veya profil adı ara" aria-label="Arşivde ara" className="min-w-0 flex-1 bg-transparent text-sm text-[#F6F2EA] outline-none placeholder:text-[#F6F2EA]/40" />
        </label>
        <label className="flex items-center gap-2 text-xs text-[#F6F2EA]/60">
          <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama" className={`${atlasDarkInput} py-1.5`} data-testid="astro-archive-sort">
            {SORTS.map(([v, l]) => (
              <option key={v} value={v} className="bg-[#0B1430]">
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={() => onDelete({ scope: picked.size === 1 ? "single" : "selected", ids: [...picked].sort() })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/50 px-3 py-1.5 text-sm text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-35"
            data-testid="astro-archive-delete-selected"
          >
            <Trash2 className="h-4 w-4" /> Seçilenleri sil ({picked.size})
          </button>
          <button
            type="button"
            disabled={!items || meta.total === 0}
            onClick={() => onDelete({ scope: "all", ids: [] })}
            className="rounded-lg border border-white/12 px-3 py-1.5 text-sm text-[#F6F2EA]/70 transition hover:border-rose-300/60 hover:text-rose-200 disabled:opacity-35"
            data-testid="astro-archive-delete-all"
            title="Analiz Arşivi'ndeki TÜM danışanlar (arama/sıralamadan bağımsız)"
          >
            Tümünü sil
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-rose-300/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-100">{error}</p>}
      {items === null ? (
        <div className={`${atlasPanel} flex flex-col gap-2 p-4`} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-12 animate-pulse rounded-xl bg-[#efe6d2]/70 motion-reduce:animate-none" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={`${atlasPanel} flex flex-col items-center gap-2 px-6 py-12 text-center`} data-testid="astro-archive-empty">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0B1430] text-[#E6CF9F]" aria-hidden="true">
            <FolderOpen className="h-5 w-5" />
          </span>
          <p className="font-medium text-slate-800">{filtered ? "Aramaya uyan danışan bulunamadı" : "Arşiv henüz boş"}</p>
          <p className="max-w-md text-sm text-slate-600">
            {filtered ? "Aramaya uyan, kayıtlı analizi olan danışan yok." : "Henüz kayıtlı analizi olan danışan yok. Analiz kaydettiğiniz danışanlar burada listelenir."}
          </p>
        </div>
      ) : (
        <div className={`${atlasPanel} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-[#efe6d2] px-4 py-2.5 text-xs text-slate-500">
            <span data-testid="astro-archive-count">
              <strong className="font-semibold text-slate-800">{meta.total}</strong> danışan{items.length < meta.total ? ` · ${items.length} gösteriliyor` : ""}
              {filtered ? " · aramaya göre" : ""}
            </span>
            {picked.size > 0 && (
              <button type="button" onClick={() => setPicked(new Set())} className="text-slate-600 underline">
                Seçimi temizle
              </button>
            )}
          </div>
          {/* Masaüstü / tablet: tablo başlığı */}
          <div className="hidden grid-cols-[2.5rem_2rem_minmax(0,2.2fr)_7rem_minmax(0,1.6fr)_7.5rem_5rem_auto] items-center gap-3 border-b border-[#efe6d2] bg-[#f6efe0]/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8a6d33] md:grid">
            <span>#</span>
            <input type="checkbox" checked={allShownPicked} onChange={() => setPicked(allShownPicked ? new Set() : new Set(shownIds))} aria-label="Gösterilen tüm satırları seç" className="accent-[#0B1430]" data-testid="astro-archive-pick-all" />
            <span>Danışan</span>
            <span>Doğum tarihi</span>
            <span>Doğum yeri</span>
            <span>Son analiz</span>
            <span className="text-right">Analiz</span>
            <span className="sr-only">İşlemler</span>
          </div>
          <ul className="divide-y divide-[#efe6d2]" data-testid="astro-archive-rows">
            {items.map((p) => {
              const on = picked.has(p.id);
              return (
                <li key={p.id} className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-3 text-sm transition md:grid-cols-[2.5rem_2rem_minmax(0,2.2fr)_7rem_minmax(0,1.6fr)_7.5rem_5rem_auto] md:items-center ${on ? "bg-rose-50/60" : "hover:bg-[#fbf3e1]"}`} data-archive-row={p.id}>
                  <span className="hidden text-xs tabular-nums text-slate-400 md:block">{p.index}</span>
                  <input type="checkbox" className="mt-1 accent-[#0B1430] md:mt-0" checked={on} onChange={() => toggle(p.id)} aria-label={`${p.label} seç`} data-archive-pick={p.id} />
                  <button type="button" onClick={() => onOpen(p.id)} className="flex min-w-0 items-center gap-3 text-left" title="Danışan dosyasını aç">
                    <span className="relative hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1430] text-sm text-[#F6E7C3] sm:flex" aria-hidden="true">
                      <span className="absolute inset-[3px] rounded-full border border-[#D9B56F]/45" />
                      {p.label.trim().charAt(0).toLocaleUpperCase("tr-TR") || "✦"}
                    </span>
                    <span className="min-w-0">
                      <span className="block break-words font-semibold text-slate-900 hover:underline">
                        <span className="mr-1 text-xs tabular-nums text-slate-400 md:hidden">{p.index}.</span>
                        {p.label}
                        {p.archivedAt && <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 align-middle text-[10px] font-normal text-slate-700">arşivli profil</span>}
                      </span>
                      {p.clientName && <span className="block text-[11px] text-emerald-700">Danışan Yolculuğu: {p.clientName}</span>}
                      {/* mobil özet */}
                      <span className="mt-0.5 block text-xs text-slate-500 md:hidden">
                        {day(p.current?.birthDate)} · {p.current?.locationLabel ?? "—"} · son analiz {day(p.lastAnalysisAt)} · {p.analysisCount} analiz
                      </span>
                    </span>
                  </button>
                  <span className="hidden tabular-nums text-slate-700 md:block">{day(p.current?.birthDate)}</span>
                  <span className="hidden min-w-0 md:block">
                    <span className="block truncate text-slate-700" title={p.current?.locationLabel}>
                      {p.current?.locationLabel ?? "—"}
                    </span>
                    <span className="block text-[11px] text-slate-400">{p.current?.timeKnown ? `saat ${p.current.birthTime?.slice(0, 5)}` : "saat bilinmiyor"}</span>
                  </span>
                  <span className="hidden tabular-nums text-slate-700 md:block">{day(p.lastAnalysisAt)}</span>
                  <span className="hidden justify-end md:flex">
                    <span className="min-w-[2rem] rounded-full bg-[#0B1430]/[0.06] px-2 py-0.5 text-center text-xs font-semibold tabular-nums text-[#0B1430]">{p.analysisCount}</span>
                  </span>
                  <span className="col-start-3 row-start-1 flex items-center justify-end gap-1 md:col-start-auto md:row-start-auto">
                    <button type="button" onClick={() => onOpen(p.id)} aria-label={`${p.label} dosyasını aç`} title="Dosyayı aç" className="rounded-lg border border-[#d9c9a3] bg-white/80 p-1.5 text-slate-600 transition hover:border-[#0b1430]/40 hover:text-[#0b1430]" data-archive-open={p.id}>
                      <FolderOpen className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => onDelete({ scope: "single", ids: [p.id] })} aria-label={`${p.label} sil`} title="Sil" className="rounded-lg border border-[#d9c9a3] bg-white/80 p-1.5 text-slate-500 transition hover:border-rose-300 hover:text-rose-700" data-archive-delete={p.id}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {meta.hasMore && (
            <div className="border-t border-[#efe6d2] p-2 text-center">
              <button type="button" disabled={more} onClick={() => void loadMore()} className="rounded-lg border border-[#d9c9a3] bg-white/80 px-3 py-1.5 text-sm text-slate-700 hover:border-[#b8954e] disabled:opacity-60" data-testid="astro-archive-more">
                {more ? "Yükleniyor…" : `Daha fazla göster (${items.length} / ${meta.total})`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
