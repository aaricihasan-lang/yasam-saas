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
          className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition ${on ? "border-[#D9B56F]/50 bg-[#D9B56F]/10" : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"}`}
          data-client-option={p.id}
        >
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${on ? "bg-[#D9B56F] text-[#0B1430]" : "bg-white/[0.06] text-[#F6E7C3]/80 ring-1 ring-white/10"}`}>{initials(p.label)}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words text-sm font-medium">{p.label}</span>
              {p.archivedAt && <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[#F6F2EA]/70">Arşiv</span>}
            </span>
            {p.clientName && <span className="block text-xs text-emerald-200/80">Danışan: {p.clientName}</span>}
            {p.current && (
              <span className="block text-xs text-[#F6F2EA]/55">
                {fmtDay(p.current.birthDate)} · {p.current.timeKnown ? p.current.birthTime?.slice(0, 5) : "saat bilinmiyor"} · {p.current.locationLabel}
              </span>
            )}
            <span className="block text-[11px] text-[#F6F2EA]/45">{p.analysisCount > 0 ? `${p.analysisCount} kayıtlı analiz · son: ${fmtDay(p.lastAnalysisAt)}` : "Kayıtlı analiz yok"}</span>
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
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-[#F6F2EA] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-[#D9B56F]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B56F]"
          data-testid="atlas-client-trigger"
          title={selectedLabel ? `Seçili: ${selectedLabel}` : undefined}
        >
          <Search className="h-3.5 w-3.5 text-[#D9B56F]" /> Danışan Seç <ChevronDown className={`h-3.5 w-3.5 text-[#D9B56F] transition ${open ? "rotate-180" : ""}`} />
        </button>
      ) : (
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full min-w-0 items-center gap-3 rounded-2xl border border-[#D9B56F]/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.015))] py-2 pl-2 pr-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_14px_30px_-20px_rgba(0,0,0,0.9)] transition hover:border-[#D9B56F]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B56F]"
        data-testid="atlas-client-trigger"
      >
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#3a3f86,#141b48_70%)] text-sm font-semibold text-[#F6E7C3] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_0_1px_rgba(217,181,111,0.45),0_0_18px_-4px_rgba(217,181,111,0.45)]">
          {selectedLabel ? initials(selectedLabel) : <Search className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold tracking-[0.18em] text-[#E6CF9F]/75">DANIŞAN</span>
          <span className="block truncate text-[15px] text-[#F6F2EA] [font-family:var(--font-atlas-display)] font-light">{selectedLabel ?? "Danışan Seç"}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#D9B56F] transition ${open ? "rotate-180" : ""}`} />
      </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Danışan Seç"
          style={panelMax ? { maxHeight: panelMax } : undefined}
          className={`fixed inset-x-3 top-20 z-50 flex max-h-[min(70svh,620px)] flex-col overflow-hidden rounded-2xl border border-[#D9B56F]/30 bg-[linear-gradient(180deg,#141c4a,#0a1130)] text-[#F6F2EA] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.08)] sm:absolute sm:inset-x-auto sm:top-[calc(100%+8px)] sm:w-[420px] ${alignRight ? "sm:right-0" : "sm:left-0"}`}
          data-testid="atlas-client-panel"
        >
          <div className="flex flex-col gap-2 border-b border-white/[0.07] p-3">
            <div className="flex items-center gap-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/12 bg-black/25 px-3 py-2 focus-within:border-[#D9B56F]/70">
                <Search className="h-4 w-4 shrink-0 text-[#D9B56F]/80" />
                <input
                  ref={searchRef}
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  maxLength={100}
                  placeholder="Ad, soyad veya profil adı ara"
                  aria-label="Danışan ara"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[#F6F2EA] placeholder:text-[#F6F2EA]/40 outline-none"
                />
              </label>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat" className="rounded-lg p-2 text-[#F6F2EA]/60 hover:text-[#F6F2EA] sm:hidden">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[11px] text-[#F6F2EA]/50">Etkin ve arşivlenmiş danışanlar birlikte listelenir.</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "recent" | "name")}
                aria-label="Sıralama"
                className="rounded-lg border border-white/10 bg-[#0d1640] px-2 py-1 text-xs text-[#F6F2EA] [color-scheme:dark]"
              >
                <option value="recent">Son işlem</option>
                <option value="name">Ada göre</option>
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2 [scrollbar-width:thin]">
            {error && <p className="px-2 py-1 text-sm text-rose-300">{error}</p>}
            {items === null ? (
              <p className="px-2 py-3 text-sm text-[#F6F2EA]/50">Yükleniyor…</p>
            ) : items.length === 0 && (archItems?.length ?? 0) === 0 ? (
              <p className="px-2 py-3 text-sm text-[#F6F2EA]/60">{qDebounced.trim() ? "Aramaya uyan danışan yok." : "Henüz profil yok."}</p>
            ) : (
              <>
                {items.length > 0 && (
                  <ul className="flex flex-col gap-1" aria-label="Danışanlar">
                    {items.map(row)}
                  </ul>
                )}
                {meta.hasMore && (
                  <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="mt-1 w-full rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#F6F2EA]/75 hover:border-[#D9B56F]/50 disabled:opacity-60">
                    {loadingMore ? "Yükleniyor…" : `Daha fazla göster (${items.length} / ${meta.total})`}
                  </button>
                )}
                {archItems && archItems.length > 0 && (
                  <div className="mt-2 border-t border-white/[0.07] pt-2" data-testid="atlas-client-archived">
                    <p className="px-2 pb-1 text-[10.5px] font-semibold tracking-[0.14em] text-[#E6CF9F]/60">ARŞİVLENMİŞ DANIŞANLAR · {archMeta.total}</p>
                    <ul className="flex flex-col gap-1" aria-label="Arşivlenmiş danışanlar">
                      {archItems.map(row)}
                    </ul>
                    {archMeta.hasMore && (
                      <button type="button" disabled={loadingMore} onClick={() => void loadMore(true)} className="mt-1 w-full rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#F6F2EA]/75 hover:border-[#D9B56F]/50 disabled:opacity-60">
                        {loadingMore ? "Yükleniyor…" : `Daha fazla göster (${archItems.length} / ${archMeta.total})`}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] p-3">
            <span className="text-[11px] text-[#F6F2EA]/45">{items ? `${meta.total + archMeta.total} kayıt` : ""}</span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#E6C887,#C9A158)] px-3 py-1.5 text-sm font-semibold text-[#0B1430] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]"
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
