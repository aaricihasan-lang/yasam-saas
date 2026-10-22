"use client";

/**
 * Gökyüzü Atlası — ANALİZ ARŞİVİ listesi. YALNIZ en az bir kayıtlı analizi olan danışan profilleri (etkin + arşivli
 * birleşik; arşiv durumu değişmez, rozetle gösterilir). Arama, sıralama, sayfalama ve kapsam SUNUCUDA
 * (/profiles?view=archive; uzman sahipliği + tenant RPC içinde). Bu bileşen hiçbir şey silmez: silme talebini
 * ArchiveDeleteFlow'a iletir (çok katmanlı onay + sunucu doğrulaması).
 */
import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, CalendarDays, ChevronRight, Clock, FolderOpen, MapPin, Search, Trash2 } from "lucide-react";
import { AtlasEmpty, ap } from "./premium/AtlasPremium";
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
/** Başlık metrikleri (yalnız görüntü). analyses/lastAt yalnız liste TAM yüklüyken ve arama yokken hesaplanır (eksik veriyle sayı gösterilmez). */
export type ArchiveSummary = { total: number; filtered: boolean; analyses: number | null; lastAt: string | null };

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
  onSummary,
}: {
  reloadKey: number;
  onOpen: (id: string) => void;
  /** scope: "single" (satır) | "selected" (işaretliler) | "all" (TÜM arşiv — arama/filtreden bağımsız, sunucuda hesaplanır). */
  onDelete: (req: { scope: "single" | "selected" | "all"; ids: string[] }) => void;
  onItems?: (rows: { id: string; label: string }[]) => void;
  /** Dışarıdan sıralama isteği (ör. ana sayfa "Son Çalışmalar" → "last_desc"); her yeni n bir kez uygulanır. */
  sortRequest?: { sort: string; n: number };
  /** Başlık metrikleri için özet (yalnız görüntü). */
  onSummary?: (s: ArchiveSummary | null) => void;
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

  // Başlık metrikleri: yalnız mevcut liste verisinden; liste eksikse (sayfalı) toplam analiz / son analiz gösterilmez.
  const onSummaryRef = useRef(onSummary);
  useEffect(() => {
    onSummaryRef.current = onSummary;
  }, [onSummary]);
  useEffect(() => {
    if (!items) return;
    const complete = !meta.hasMore && !filtered;
    const last = complete ? items.reduce<string | null>((m, p) => (p.lastAnalysisAt && (!m || p.lastAnalysisAt > m) ? p.lastAnalysisAt : m), null) : null;
    onSummaryRef.current?.({
      total: meta.total,
      filtered,
      analyses: complete ? items.reduce((n, p) => n + p.analysisCount, 0) : null,
      lastAt: last ? day(last) : null,
    });
  }, [items, meta, filtered]);
  useEffect(() => () => onSummaryRef.current?.(null), []);

  return (
    <section className={`${ap.surface} flex min-w-0 flex-col overflow-hidden`} aria-label="Analiz Arşivi" data-testid="astro-archive-list">
      {/* Araç çubuğu: arama · sıralama · toplu işlemler */}
      <div className={ap.toolbar}>
        <label className={`${ap.field} min-w-[220px] flex-1`}>
          <Search className={`h-4 w-4 shrink-0 ${ap.muted}`} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} placeholder="Ad, soyad veya profil adı ara" aria-label="Arşivde ara" className={ap.fieldInput} />
        </label>
        <label className={`flex items-center gap-2 text-xs ${ap.muted}`}>
          <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama" className={ap.select} data-testid="astro-archive-sort">
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={() => onDelete({ scope: picked.size === 1 ? "single" : "selected", ids: [...picked].sort() })}
            className={ap.btnDanger}
            data-testid="astro-archive-delete-selected"
          >
            <Trash2 className="h-4 w-4" /> Seçilenleri sil ({picked.size})
          </button>
          <button
            type="button"
            disabled={!items || meta.total === 0}
            onClick={() => onDelete({ scope: "all", ids: [] })}
            className={ap.btnLight}
            data-testid="astro-archive-delete-all"
            title="Analiz Arşivi'ndeki TÜM danışanlar (arama/sıralamadan bağımsız)"
          >
            <Trash2 className="h-4 w-4" /> Tümünü sil
          </button>
        </div>
      </div>

      {error && <p className={`${ap.noteDanger} mx-4 mb-3`}>{error}</p>}
      {items === null ? (
        <div className="flex flex-col gap-2 p-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`h-12 animate-pulse rounded-xl ${ap.skeleton} motion-reduce:animate-none`} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <AtlasEmpty
          testId="astro-archive-empty"
          icon={<FolderOpen className="h-5 w-5" />}
          title={filtered ? "Aramaya uyan danışan bulunamadı" : "Arşiv henüz boş"}
          text={filtered ? "Aramaya uyan, kayıtlı analizi olan danışan yok." : "Henüz kayıtlı analizi olan danışan yok. Analiz kaydettiğiniz danışanlar burada listelenir."}
        />
      ) : (
        <div className="min-w-0">
          <div className={`flex items-center justify-between ${ap.divTop} px-4 py-2.5 text-xs ${ap.muted}`}>
            <span data-testid="astro-archive-count">
              <strong className={`font-semibold ${ap.ink}`}>{meta.total}</strong> danışan{items.length < meta.total ? ` · ${items.length} gösteriliyor` : ""}
              {filtered ? " · aramaya göre" : ""}
            </span>
            {picked.size > 0 && (
              <button type="button" onClick={() => setPicked(new Set())} className={`font-semibold ${ap.link}`}>
                Seçimi temizle
              </button>
            )}
          </div>
          {/* Masaüstü / tablet: tablo başlığı */}
          <div className={`${ap.tableHead} hidden grid-cols-[2.5rem_2rem_minmax(0,2.2fr)_7rem_minmax(0,1.6fr)_7.5rem_5rem_auto] items-center gap-3 px-4 py-2.5 md:grid`}>
            <span>#</span>
            <input type="checkbox" checked={allShownPicked} onChange={() => setPicked(allShownPicked ? new Set() : new Set(shownIds))} aria-label="Gösterilen tüm satırları seç" className={`h-4 w-4 ${ap.check}`} data-testid="astro-archive-pick-all" />
            <span>Danışan</span>
            <span>Doğum tarihi</span>
            <span>Doğum yeri</span>
            <span>Son analiz</span>
            <span className="text-right">Analiz</span>
            <span className="sr-only">İşlemler</span>
          </div>
          <ul className={ap.rows} data-testid="astro-archive-rows">
            {items.map((p) => {
              const on = picked.has(p.id);
              return (
                <li key={p.id} className={`${ap.row} ${on ? ap.rowPicked : ""} grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-4 py-3 text-sm md:grid-cols-[2.5rem_2rem_minmax(0,2.2fr)_7rem_minmax(0,1.6fr)_7.5rem_5rem_auto] md:items-center`} data-archive-row={p.id}>
                  <span className={`hidden text-xs tabular-nums ${ap.faint} md:block`}>{p.index}</span>
                  <input type="checkbox" className={`mt-1 h-4 w-4 ${ap.check} md:mt-0`} checked={on} onChange={() => toggle(p.id)} aria-label={`${p.label} seç`} data-archive-pick={p.id} />
                  <button type="button" onClick={() => onOpen(p.id)} className="flex min-w-0 items-center gap-3 text-left" title="Danışan dosyasını aç">
                    <span className={`${ap.avatar} hidden h-10 w-10 text-sm sm:flex`} aria-hidden="true">
                      {p.label.trim().charAt(0).toLocaleUpperCase("tr-TR") || "✦"}
                    </span>
                    <span className="min-w-0">
                      <span className={`block break-words font-semibold ${ap.ink} hover:underline`}>
                        <span className={`mr-1 text-xs tabular-nums ${ap.faint} md:hidden`}>{p.index}.</span>
                        {p.label}
                        {p.archivedAt && <span className={`${ap.chip} ml-1.5 align-middle !text-[10px] !font-normal`}>arşivli profil</span>}
                      </span>
                      {p.clientName && <span className="block text-[11px] text-emerald-700">Danışan Yolculuğu: {p.clientName}</span>}
                      {/* mobil özet */}
                      <span className={`mt-0.5 block text-xs ${ap.muted} md:hidden`}>
                        {day(p.current?.birthDate)} · {p.current?.locationLabel ?? "—"} · son analiz {day(p.lastAnalysisAt)} · {p.analysisCount} analiz
                      </span>
                    </span>
                  </button>
                  <span className={`hidden tabular-nums ${ap.text} md:block`}>{day(p.current?.birthDate)}</span>
                  <span className="hidden min-w-0 md:block">
                    <span className={`flex min-w-0 items-center gap-1.5 ${ap.text}`} title={p.current?.locationLabel}>
                      <MapPin className={`h-3.5 w-3.5 shrink-0 ${ap.iconLav}`} aria-hidden="true" />
                      <span className="truncate">{p.current?.locationLabel ?? "—"}</span>
                    </span>
                    <span className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${ap.faint}`}>
                      <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {p.current?.timeKnown ? `saat ${p.current.birthTime?.slice(0, 5)}` : "saat bilinmiyor"}
                    </span>
                  </span>
                  <span className={`hidden items-center gap-1.5 tabular-nums ${ap.text} md:flex`}>
                    <CalendarDays className={`h-3.5 w-3.5 shrink-0 ${ap.iconLav}`} aria-hidden="true" />
                    {day(p.lastAnalysisAt)}
                  </span>
                  <span className="hidden justify-end md:flex">
                    <span className={ap.count}>{p.analysisCount}</span>
                  </span>
                  <span className="col-start-3 row-start-1 flex items-center justify-end gap-1.5 md:col-start-auto md:row-start-auto">
                    <button type="button" onClick={() => onOpen(p.id)} aria-label={`${p.label} dosyasını aç`} title="Dosyayı aç" className={ap.iconBtn} data-archive-open={p.id}>
                      <FolderOpen className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => onDelete({ scope: "single", ids: [p.id] })} aria-label={`${p.label} sil`} title="Sil" className={ap.iconBtnDanger} data-archive-delete={p.id}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ChevronRight className={`hidden h-4 w-4 ${ap.faint} lg:block`} aria-hidden="true" />
                  </span>
                </li>
              );
            })}
          </ul>
          {meta.hasMore && (
            <div className={`${ap.divTop} p-3 text-center`}>
              <button type="button" disabled={more} onClick={() => void loadMore()} className={ap.btnLight} data-testid="astro-archive-more">
                {more ? "Yükleniyor…" : `Daha fazla göster (${items.length} / ${meta.total})`}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
