"use client";

/**
 * Gökyüzü Atlası — kompakt danışan seçici (Aşama D3, Göksel Analiz Hazırlık Merkezi).
 *
 * Eski uzun sol listenin yerine: tek satırlık tetik + açılır arama paneli. Veri ClientList ile AYNI uçtan gelir
 * (/profiles; arama, Etkin/Arşiv, sıralama ve kademeli yükleme SUNUCUDA; uzman sahipliği filtresi korunur).
 * Toplu silme / arşivleme gibi yönetim işlemleri Analiz Arşivi'nde kalır.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { ap } from "./premium/AtlasPremium";
import { astroFetch } from "../../_lib/api";
import type { ClientListItem } from "../ClientList";

type Page = { profiles: ClientListItem[]; total: number; hasMore: boolean };
const PAGE = 30;

function fmtDay(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("tr-TR");
}

function initials(label: string): string {
  // "Ali Örnek — natal" → profil eki ("— natal") baş harflere girmez.
  const p = label.split(/\s[—–-]\s/)[0].trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? (p[p.length - 1][0] ?? "") : "")).toLocaleUpperCase("tr-TR") || "·";
}

export default function ClientPicker({
  selectedId,
  selectedLabel,
  reloadKey,
  onSelect,
  onCreate,
  onItems,
  compact = false,
}: {
  /** D4: kompakt tetik ("Danışan Seç"); seçili danışanın adı Hazırlık Merkezi kimlik satırında gösterilir. */
  compact?: boolean;
  selectedId: string | null;
  selectedLabel: string | null;
  reloadKey: number;
  onSelect: (item: ClientListItem) => void;
  onCreate: () => void;
  onItems?: (items: ClientListItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  // 2026-10-12 (Android UAT madde 5): "Etkin / Arşivli" düğmesi KALDIRILDI — uzman danışanını iki sekme arasında
  // aramak zorunda kalmıyor. Tek liste: önce etkin profiller, altında ayrı başlıkla arşivlenmiş profiller (durum korunur,
  // "Arşiv" rozeti); ikisi de aynı arama / sıralamayla sunucudan okunur.
  const [archItems, setArchItems] = useState<ClientListItem[] | null>(null);
  const [archMeta, setArchMeta] = useState({ total: 0, hasMore: false });
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [items, setItems] = useState<ClientListItem[] | null>(null);
  const [meta, setMeta] = useState({ total: 0, hasMore: false });
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const seq = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  // Panel yüksekliği = tetikten görünür alanın altına (sabit konsol payı) kadar → alt bilgi ve "Yeni Danışan" her zaman görünür.
  const [panelMax, setPanelMax] = useState<number | null>(null);
  const [alignRight, setAlignRight] = useState(false);
  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      const t = triggerRef.current?.getBoundingClientRect();
      if (!t || window.innerWidth < 640) return setPanelMax(null);
      setAlignRight(t.left + 420 > window.innerWidth - 12);
      setPanelMax(Math.max(260, Math.min(620, Math.round(window.innerHeight - t.bottom - 8 - 112))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);
  const onItemsRef = useRef(onItems);
  useEffect(() => {
    onItemsRef.current = onItems;
  }, [onItems]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = (offset: number, archived = false) => {
    const sp = new URLSearchParams({ limit: String(PAGE), offset: String(offset), sort });
    if (qDebounced.trim()) sp.set("q", qDebounced.trim());
    if (archived) sp.set("archived", "1");
    return sp.toString();
  };

  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    void Promise.all([astroFetch<Page>(`/api/admin/astroloji/profiles?${query(0)}`), astroFetch<Page>(`/api/admin/astroloji/profiles?${query(0, true)}`)]).then(([r, ra]) => {
      if (my !== seq.current) return;
      setItems(r.ok ? r.data.profiles : []);
      setMeta(r.ok ? { total: r.data.total, hasMore: r.data.hasMore } : { total: 0, hasMore: false });
      setArchItems(ra.ok ? ra.data.profiles : []);
      setArchMeta(ra.ok ? { total: ra.data.total, hasMore: ra.data.hasMore } : { total: 0, hasMore: false });
      setError(r.ok ? (ra.ok ? null : ra.error) : r.error);
      if (r.ok) onItemsRef.current?.(r.data.profiles);
      if (ra.ok) onItemsRef.current?.(ra.data.profiles);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, qDebounced, sort, reloadKey]);

  // Dışarı tıklama / Esc → kapat; açılınca arama alanına odak.
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function loadMore(archived = false) {
    const cur = archived ? archItems : items;
    if (!cur) return;
    const my = seq.current;
    setLoadingMore(true);
    const r = await astroFetch<Page>(`/api/admin/astroloji/profiles?${query(cur.length, archived)}`);
    setLoadingMore(false);
    if (my !== seq.current || !r.ok) return;
    const next = [...cur, ...r.data.profiles.filter((p) => !cur.some((x) => x.id === p.id))];
    if (archived) {
      setArchItems(next);
      setArchMeta({ total: r.data.total, hasMore: r.data.hasMore });
    } else {
      setItems(next);
      setMeta({ total: r.data.total, hasMore: r.data.hasMore });
    }
    onItemsRef.current?.(r.data.profiles);
  }

  const row = (p: ClientListItem) => {
    const on = p.id === selectedId;
    return (
      <li key={p.id}>
        <button
          type="button"
          aria-current={on ? "true" : undefined}
          onClick={() => {
            onSelect(p);
            setOpen(false);
          }}
          className={`flex w-full items-start gap-3 px-3 py-2 text-left ${on ? ap.popItemOn : ap.popItem}`}
          data-client-option={p.id}
        >
          <span className={`${ap.avatar} mt-0.5 h-8 w-8 text-[11px]`}>{initials(p.label)}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className={`${ap.ink} min-w-0 break-words text-sm font-semibold`}>{p.label}</span>
              {p.archivedAt && <span className={`${ap.chip} shrink-0 !text-[10px]`}>Arşiv</span>}
            </span>
            {p.clientName && <span className="block text-xs text-emerald-700">Danışan: {p.clientName}</span>}
            {p.current && (
              <span className={`${ap.text} block text-xs`}>
                {fmtDay(p.current.birthDate)} · {p.current.timeKnown ? p.current.birthTime?.slice(0, 5) : "saat bilinmiyor"} · {p.current.locationLabel}
              </span>
            )}
            <span className={`${ap.muted} block text-[11px]`}>{p.analysisCount > 0 ? `${p.analysisCount} kayıtlı analiz · son: ${fmtDay(p.lastAnalysisAt)}` : "Kayıtlı analiz yok"}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div ref={rootRef} className="relative min-w-0" data-testid="atlas-client-picker">
      {compact ? (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`${ap.btnLight} shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f55c9]`}
          data-testid="atlas-client-trigger"
          title={selectedLabel ? `Seçili: ${selectedLabel}` : undefined}
        >
          <Search className={`${ap.iconLav} h-4 w-4`} /> Danışan Seç <ChevronDown className={`${ap.iconLav} h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
      ) : (
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${ap.surface} group flex w-full min-w-0 items-center gap-3 py-2 pl-2 pr-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f55c9]`}
        data-testid="atlas-client-trigger"
      >
        <span className={`${ap.avatar} relative h-11 w-11 text-sm`}>
          {selectedLabel ? initials(selectedLabel) : <Search className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`${ap.eyebrowSm} block`}>DANIŞAN</span>
          <span className={`${ap.ink} ${ap.display} block truncate text-[15px]`}>{selectedLabel ?? "Danışan Seç"}</span>
        </span>
        <ChevronDown className={`${ap.iconLav} h-4 w-4 shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Danışan Seç"
          style={panelMax ? { maxHeight: panelMax } : undefined}
          className={`${ap.popover} fixed inset-x-3 top-20 z-50 flex max-h-[min(70svh,620px)] flex-col overflow-hidden sm:absolute sm:inset-x-auto sm:top-[calc(100%+8px)] sm:w-[420px] ${alignRight ? "sm:right-0" : "sm:left-0"}`}
          data-testid="atlas-client-panel"
        >
          <div className={`${ap.divBottom} flex flex-col gap-2 p-3`}>
            <div className="flex items-center gap-2">
              <label className={`${ap.field} flex-1`}>
                <Search className={`${ap.muted} h-4 w-4 shrink-0`} />
                <input
                  ref={searchRef}
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  maxLength={100}
                  placeholder="Ad, soyad veya profil adı ara"
                  aria-label="Danışan ara"
                  className={ap.fieldInput}
                />
              </label>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat" className={`${ap.muted} rounded-lg p-2 hover:bg-black/5 sm:hidden`}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className={`${ap.muted} flex-1 text-[11px]`}>Etkin ve arşivlenmiş danışanlar birlikte listelenir.</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "recent" | "name")}
                aria-label="Sıralama"
                className={`${ap.select} !min-h-[32px] !text-xs`}
              >
                <option value="recent">Son işlem</option>
                <option value="name">Ada göre</option>
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
            {error && <p className={`${ap.dangerInk} px-2 py-1 text-sm`}>{error}</p>}
            {items === null ? (
              <p className={`${ap.muted} px-2 py-3 text-sm`}>Yükleniyor…</p>
            ) : items.length === 0 && (archItems?.length ?? 0) === 0 ? (
              <p className={`${ap.muted} px-2 py-3 text-sm`}>{qDebounced.trim() ? "Aramaya uyan danışan yok." : "Henüz profil yok."}</p>
            ) : (
              <>
                {items.length > 0 && (
                  <ul className="flex flex-col gap-1" aria-label="Danışanlar">
                    {items.map(row)}
                  </ul>
                )}
                {meta.hasMore && (
                  <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className={`${ap.btnGhost} mt-1 w-full`}>
                    {loadingMore ? "Yükleniyor…" : `Daha fazla göster (${items.length} / ${meta.total})`}
                  </button>
                )}
                {archItems && archItems.length > 0 && (
                  <div className={`${ap.divTop} mt-2 pt-2`} data-testid="atlas-client-archived">
                    <p className={`${ap.eyebrowSm} px-2 pb-1`}>ARŞİVLENMİŞ DANIŞANLAR · {archMeta.total}</p>
                    <ul className="flex flex-col gap-1" aria-label="Arşivlenmiş danışanlar">
                      {archItems.map(row)}
                    </ul>
                    {archMeta.hasMore && (
                      <button type="button" disabled={loadingMore} onClick={() => void loadMore(true)} className={`${ap.btnGhost} mt-1 w-full`}>
                        {loadingMore ? "Yükleniyor…" : `Daha fazla göster (${archItems.length} / ${archMeta.total})`}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className={`${ap.divTop} flex items-center justify-between gap-2 p-3`}>
            <span className={`${ap.muted} text-[11px]`}>{items ? `${meta.total + archMeta.total} kayıt` : ""}</span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
              className={`${ap.btnGold} !min-h-[36px]`}
              data-testid="atlas-client-create"
            >
              <Plus className="h-4 w-4" /> Yeni Danışan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
