"use client";

/**
 * Gökyüzü Atlası — KOMPAKT ANALİZ SEÇİCİ (V3, owner görsel PASS 2026-11-05).
 *
 * • Sonuç masasının başlığı seçicinin kendisidir: kapalıyken yalnız etkin analiz ("Natal · 04.11.2026 · Ali natal ⌄").
 *   Ayrı şerit / kart / ‹ › oku yok. Masaüstünde başlığın altında kompakt açılır liste; telefonda (<640 px) alttan açılan
 *   panel (arka sayfa kaymaz, Android geri tuşu yalnız paneli kapatır).
 * • Liste yalnız ETKİN DOĞUM PROFİLİNİN (kimlik) analizleri: kayıtlı (sunucu, profil sahipliği sunucuda denetlenir) +
 *   bu oturumda açık kaydedilmemiş sonuçlar. Bkz. _lib/analysisPicker.ts. Teknik gruplarına göre; 8'den fazla analizde arama.
 * • Seçim yalnız görünümü değiştirir: yeniden hesap, sağlayıcı (Roxy) isteği, otomatik kayıt YOK. Kayıtlı analiz değişmez
 *   kaydından, kaydedilmemiş sonuç bellekten açılır (page.tsx).
 * • Açık (kaydedilmemiş) sonucun satırında × yalnız çalışma sekmesini kapatır (eski şeritteki × ile aynı; kayıt silinmez,
 *   taslak varsa uyarı sorulur).
 * • Klavye: Enter/Boşluk/↓ açar; listede ↑ ↓ Home End, Enter seçer, Esc kapatır ve odağı seçiciye döndürür.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronDown, Lock, Search, X } from "lucide-react";
import { astroFetch } from "../../_lib/api";
import {
  PICKER_FAMILIES,
  PICKER_FAMILY_LABELS,
  filterPickerEntries,
  pickerHeadline,
  type PickerEntry,
  type PickerSavedRow,
} from "../../_lib/analysisPicker";

/* ───────────────────────── Kayıtlı analiz listesi (yalnız okuma) ───────────────────────── */

const PAGE = 100;
/** İlk yüklemede en fazla 5 sayfa (500); devamı kullanıcı isteğiyle ("Daha fazla yükle") — eksik liste "tümü" sayılmaz. */
const FIRST_PAGES = 5;

type ListPage = { analyses: PickerSavedRow[]; hasMore: boolean; total: number };
type ListState = { key: string; profileId: string; items: PickerSavedRow[]; total: number; hasMore: boolean; error: string | null };

/**
 * Profilin kayıtlı analizleri (mevcut liste ucu; salt okunur). Profil değişince önceki profilin listesi HİÇ dönmez
 * (`savedFor` yalnız güncel profil için dolu).
 */
export function useProfileAnalyses(profileId: string | null, reloadKey: number, enabled: boolean) {
  const key = profileId ? `${profileId}|${reloadKey}` : "";
  const [state, setState] = useState<ListState | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  const fetchPages = useCallback(async (pid: string, offset: number, pages: number) => {
    const items: PickerSavedRow[] = [];
    let total = 0;
    let hasMore = false;
    for (let p = 0; p < pages; p++) {
      const sp = new URLSearchParams({ profileId: pid, offset: String(offset + items.length), limit: String(PAGE) });
      const r = await astroFetch<ListPage>(`/api/admin/astroloji/analyses?${sp.toString()}`);
      if (!r.ok) return { items, total, hasMore, error: r.error };
      total = r.data.total;
      items.push(...r.data.analyses);
      hasMore = r.data.hasMore && r.data.analyses.length > 0;
      if (!hasMore) break;
    }
    return { items, total, hasMore, error: null as string | null };
  }, []);

  useEffect(() => {
    if (!enabled || !profileId) return;
    let alive = true;
    void fetchPages(profileId, 0, FIRST_PAGES).then((r) => {
      if (alive) setState({ key, profileId, items: r.items, total: r.total, hasMore: r.hasMore, error: r.error });
    });
    return () => {
      alive = false;
    };
  }, [enabled, profileId, key, fetchPages]);

  const cur = state && state.key === key ? state : null;
  const loadMore = useCallback(async () => {
    if (!cur || !cur.hasMore || loadingMore) return;
    const k = cur.key;
    setLoadingMore(true);
    const r = await fetchPages(cur.profileId, cur.items.length, FIRST_PAGES);
    setLoadingMore(false);
    if (keyRef.current !== k) return; // profil / yenileme değişti — eski sonuç yazılmaz
    setState((s) => {
      if (!s || s.key !== k) return s;
      const seen = new Set(s.items.map((x) => x.id));
      return { ...s, items: [...s.items, ...r.items.filter((x) => !seen.has(x.id))], total: r.total || s.total, hasMore: r.hasMore, error: r.error };
    });
  }, [cur, loadingMore, fetchPages]);

  return {
    savedFor: cur ? cur.profileId : null,
    items: cur?.items ?? [],
    total: cur?.total ?? 0,
    hasMore: !!cur?.hasMore,
    loading: enabled && !!profileId && !cur,
    error: cur?.error ?? null,
    loadMore,
    loadingMore,
  };
}

/* ───────────────────────── Seçici ───────────────────────── */

const SEARCH_MIN = 8;
const MOBILE_Q = "(max-width: 639px)";

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_Q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}

const STATE_NOTE: Partial<Record<PickerEntry["state"], string>> = {
  unsaved: "kaydedilmedi",
  "unsaved-old": "eski doğum bilgisi · kaydedilmedi",
  locked: "teknik izni kapalı",
};

export default function AnalysisPicker({
  clientLabel,
  clientSub,
  entries,
  activeRef,
  fallbackTitle,
  onSelect,
  onCloseBench,
  closableBenchKey = null,
  savedTotal,
  savedLoaded,
  hasMore,
  onLoadMore,
  loadingMore,
  loading,
  error,
}: {
  /** Etkin danışan dosyasının adı (profil etiketi). */
  clientLabel: string;
  /** Kısa künye (ör. doğum tarihi). */
  clientSub?: string | null;
  entries: readonly PickerEntry[];
  activeRef: string | null;
  /** Etkin girdi henüz listede yoksa (yükleniyor) başlıkta görünecek metin. */
  fallbackTitle: string;
  onSelect: (e: PickerEntry) => void;
  /** Açık (masadaki) sonucun çalışma sekmesini kapatır — kayıt silinmez. */
  onCloseBench?: (e: PickerEntry) => void;
  /** × yalnız ekrandaki masanın sekmelerinde (eski şeritle aynı kapsam). */
  closableBenchKey?: string | null;
  savedTotal: number;
  savedLoaded: number;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
  loading: boolean;
  error: string | null;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [maxH, setMaxH] = useState<number | null>(null);
  const sheetHistory = useRef(false);

  const active = entries.find((e) => e.ref === activeRef) ?? null;
  const visible = useMemo(() => filterPickerEntries(entries, query), [entries, query]);
  const selectable = useMemo(() => visible.filter((e) => e.state !== "locked"), [visible]);
  const showSearch = entries.length > SEARCH_MIN;
  const partial = hasMore || savedLoaded < savedTotal;

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (sheetHistory.current) {
      sheetHistory.current = false;
      // Telefon panelinin geçmiş girdisini geri al (sayfanın kendi gezinmesi tetiklenmez; bkz. popstate yakalayıcı).
      (window as unknown as { __atlasPickerPop?: boolean }).__atlasPickerPop = true;
      window.history.back();
    }
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const openList = () => {
    setCursor(activeRef);
    setOpen(true);
  };

  // Konum + odak (açılınca)
  useEffect(() => {
    if (!open) return;
    if (!isMobile && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      setMaxH(Math.max(240, Math.min(520, window.innerHeight - r.bottom - 16)));
    } else setMaxH(null);
    const raf = requestAnimationFrame(() => {
      const sel = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (sel && listRef.current) listRef.current.scrollTop = Math.max(0, sel.offsetTop - 56);
      if (showSearch && !isMobile) searchRef.current?.focus();
      else (sel ?? listRef.current?.querySelector<HTMLElement>("[role=option]"))?.focus();
    });
    return () => cancelAnimationFrame(raf);
    // yalnız açılış anında
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Dışarı tıklama / Esc (masaüstü); telefonda arka sayfa kaydırması kilidi + geri tuşu
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (isMobile) return;
      const t = e.target as Node;
      if (wrapRef.current && !wrapRef.current.contains(t)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    let restoreOverflow: string | null = null;
    let onPop: ((e: PopStateEvent) => void) | null = null;
    if (isMobile) {
      restoreOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      // Geri tuşu: önce paneli kapatır. Panel için geçmişe aynı adresle bir girdi eklenir; geri gelince yalnız panel kapanır,
      // sayfanın kendi popstate yönlendirmesine iletilmez (yakalama aşamasında durdurulur).
      window.history.pushState({ ...(window.history.state ?? {}), atlasPickerSheet: true }, "", window.location.href);
      sheetHistory.current = true;
      onPop = (e: PopStateEvent) => {
        const w = window as unknown as { __atlasPickerPop?: boolean };
        e.stopImmediatePropagation();
        if (w.__atlasPickerPop) {
          w.__atlasPickerPop = false;
          return;
        }
        sheetHistory.current = false;
        setOpen(false);
        setQuery("");
      };
      window.addEventListener("popstate", onPop, true);
    }
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      if (restoreOverflow !== null) document.body.style.overflow = restoreOverflow;
      if (onPop) {
        const handler = onPop;
        // UI ile kapatıldıysa history.back() sonrası gelecek popstate'i de yut, sonra dinleyiciyi kaldır.
        if ((window as unknown as { __atlasPickerPop?: boolean }).__atlasPickerPop) {
          const once = (e: PopStateEvent) => {
            e.stopImmediatePropagation();
            (window as unknown as { __atlasPickerPop?: boolean }).__atlasPickerPop = false;
            window.removeEventListener("popstate", once, true);
          };
          window.addEventListener("popstate", once, true);
        }
        window.removeEventListener("popstate", handler, true);
      }
    };
  }, [open, isMobile, close]);

  // Bileşen panel açıkken kaldırılırsa (görünüm değişti) geçmiş girdisi bırakılmaz.
  useEffect(
    () => () => {
      if (sheetHistory.current) {
        sheetHistory.current = false;
        document.body.style.overflow = "";
      }
    },
    [],
  );

  const choose = (e: PickerEntry) => {
    if (e.state === "locked") return;
    close(true);
    if (e.ref !== activeRef) onSelect(e);
  };

  const focusOption = (ref: string) => {
    setCursor(ref);
    listRef.current?.querySelector<HTMLElement>(`[data-picker-ref="${CSS.escape(ref)}"]`)?.focus();
  };
  const onListKey = (ev: ReactKeyboardEvent<HTMLElement>) => {
    if (selectable.length === 0) return;
    const i = Math.max(0, selectable.findIndex((x) => x.ref === cursor));
    let n = -1;
    if (ev.key === "ArrowDown") n = Math.min(selectable.length - 1, cursor ? i + 1 : 0);
    else if (ev.key === "ArrowUp") n = Math.max(0, i - 1);
    else if (ev.key === "Home") n = 0;
    else if (ev.key === "End") n = selectable.length - 1;
    if (n < 0) return;
    ev.preventDefault();
    focusOption(selectable[n].ref);
  };

  const headline = active ? pickerHeadline(active) : fallbackTitle;
  const unsavedActive = active && (active.state === "unsaved" || active.state === "unsaved-old");

  const groups = PICKER_FAMILIES.map((f) => ({ f, items: visible.filter((e) => e.family === f) })).filter((g) => g.items.length > 0);

  return (
    <div ref={wrapRef} className="relative min-w-0" data-testid="atlas-analysis-picker" data-open={open ? "1" : "0"}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500" data-testid="atlas-picker-client">
        {clientLabel}
        {clientSub ? <span className="font-medium normal-case tracking-[0.02em] text-slate-400"> · {clientSub}</span> : null}
      </p>
      <h2 className="m-0 min-w-0">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={`Analiz değiştir — şu an: ${headline}${unsavedActive ? " (kaydedilmedi)" : ""}`}
          title={headline}
          onClick={() => (open ? close(false) : openList())}
          onKeyDown={(e) => {
            if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              openList();
            }
          }}
          className={`-ml-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f766e] ${open ? "bg-slate-100" : ""}`}
          data-testid="atlas-picker-trigger"
        >
          <span className="min-w-0 truncate text-[17px] font-semibold tracking-[0.005em] text-slate-900 max-sm:text-[16px]" data-testid="atlas-picker-headline">
            {headline}
          </span>
          {unsavedActive && <span className="shrink-0 text-[11px] font-semibold text-amber-700">kaydedilmedi</span>}
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </h2>

      {open && (
        <>
          {isMobile && <div className="fixed inset-0 z-[60] bg-slate-900/30" aria-hidden="true" onClick={() => close(true)} data-testid="atlas-picker-scrim" />}
          <div
            ref={panelRef}
            role="dialog"
            aria-modal={isMobile ? true : undefined}
            aria-label={`${clientLabel} — analizler`}
            className={
              isMobile
                ? "fixed inset-x-0 bottom-0 z-[61] flex max-h-[82dvh] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-[0_-10px_30px_rgba(15,23,42,0.18)]"
                : "absolute left-0 top-[calc(100%+6px)] z-50 flex w-[440px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_20px_48px_-12px_rgba(15,23,42,0.22),0_2px_6px_rgba(15,23,42,0.05)]"
            }
            style={!isMobile && maxH ? { maxHeight: maxH } : undefined}
            data-testid="atlas-picker-panel"
            data-mode={isMobile ? "sheet" : "popover"}
          >
            {isMobile && (
              <>
                <div className="mx-auto mb-0.5 mt-2 h-1 w-10 rounded-full bg-slate-300" aria-hidden="true" />
                <div className="flex items-baseline justify-between gap-2 px-4 pt-1">
                  <b className="min-w-0 truncate text-[15px] font-semibold text-slate-900">{clientLabel}</b>
                  <span className="shrink-0 text-xs text-slate-500">{entries.length} analiz</span>
                </div>
              </>
            )}
            {showSearch && (
              <label className="relative mx-2.5 mb-1 mt-2.5 block max-sm:mx-3">
                <span className="sr-only">Analizlerde ara</span>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" && selectable[0]) {
                      e.preventDefault();
                      focusOption(selectable[0].ref);
                    }
                  }}
                  placeholder="Analiz ara"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-8 pr-2 text-[13.5px] text-slate-800 outline-none focus:border-slate-300 focus:bg-white max-sm:h-10 max-sm:text-[15px]"
                  data-testid="atlas-picker-search"
                />
              </label>
            )}
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={`${clientLabel} — analizler`}
              onKeyDown={onListKey}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2 max-sm:px-2 max-sm:pb-4"
              data-testid="atlas-picker-list"
            >
              {loading && entries.length === 0 && <p className="px-2 py-4 text-sm text-slate-500">Analizler yükleniyor…</p>}
              {!loading && entries.length === 0 && <p className="px-2 py-4 text-sm text-slate-500" data-testid="atlas-picker-empty">Bu danışan için açık ya da kayıtlı analiz yok.</p>}
              {entries.length > 0 && visible.length === 0 && <p className="px-2 py-4 text-sm text-slate-500">Eşleşen analiz yok{partial ? " (yalnız yüklenen analizler arandı)" : ""}.</p>}
              {groups.map((g) => (
                <div key={g.f} role="group" aria-label={PICKER_FAMILY_LABELS[g.f]} data-picker-family={g.f}>
                  <div className="sticky top-0 z-[1] bg-white px-2 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400" aria-hidden="true">
                    {PICKER_FAMILY_LABELS[g.f]}
                  </div>
                  {g.items.map((e) => {
                    const sel = e.ref === activeRef;
                    const note = STATE_NOTE[e.state];
                    const locked = e.state === "locked";
                    return (
                      <div key={e.ref} className="flex items-stretch gap-0.5">
                        <div
                          role="option"
                          tabIndex={e.ref === cursor || (!cursor && sel) ? 0 : -1}
                          aria-selected={sel}
                          aria-disabled={locked ? true : undefined}
                          onClick={() => choose(e)}
                          onKeyDown={(k) => {
                            if (k.key === "Enter" || k.key === " ") {
                              k.preventDefault();
                              choose(e);
                            }
                          }}
                          onFocus={() => setCursor(e.ref)}
                          className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]/60 max-sm:min-h-[52px] ${
                            locked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-slate-50"
                          } ${sel ? "bg-[#f3f1ea]" : ""}`}
                          data-picker-ref={e.ref}
                          data-picker-kind={e.kind}
                          data-picker-state={e.state}
                          data-picker-technique={e.technique}
                          title={locked ? "Bu tekniğin izni kapalı — kayıt korunur, açılmaz" : pickerHeadline(e)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              {locked && <Lock className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />}
                              <span className="truncate text-[14px] font-medium text-slate-900">{e.title ? `${e.label} · ${e.title}` : e.label}</span>
                              {e.partial && <span className="shrink-0 text-[11px] text-slate-500">· kısmi</span>}
                              {e.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" title="Kaydedilmemiş not" aria-label="kaydedilmemiş not" />}
                            </span>
                            <span className="block truncate text-[12px] text-slate-500">
                              {note && <span className={`font-semibold ${locked ? "text-slate-500" : "text-amber-700"}`}>{note}</span>}
                              {note && e.detail ? " · " : ""}
                              {e.detail}
                            </span>
                          </span>
                          {e.date && <span className="shrink-0 text-[12.5px] tabular-nums text-slate-600">{e.date}</span>}
                          <Check className={`h-4 w-4 shrink-0 text-[#0B1430] ${sel ? "" : "invisible"}`} aria-hidden="true" />
                        </div>
                        {e.kind === "bench" && onCloseBench && e.benchKey === closableBenchKey && (
                          <button
                            type="button"
                            onClick={() => onCloseBench(e)}
                            aria-label={`${e.label}${e.detail ? ` · ${e.detail}` : ""} sekmesini kapat (kayıt silinmez)`}
                            title="Açık sekmeyi kapat (kayıt silinmez)"
                            className="flex w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0f766e] max-sm:w-11"
                            data-picker-close={e.ref}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {(partial || error) && (
                <div className="mt-1 border-t border-slate-100 px-2 pt-2 text-[12px] text-slate-500" data-testid="atlas-picker-partial">
                  {error ? (
                    <p className="text-rose-700">Kayıtlı analizlerin bir kısmı yüklenemedi: {error}</p>
                  ) : (
                    <p>
                      {savedLoaded} / {savedTotal} kayıtlı analiz yüklendi.
                    </p>
                  )}
                  {hasMore && (
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={onLoadMore}
                      className="mt-1.5 min-h-[36px] rounded-lg border border-slate-200 px-3 text-[12.5px] text-slate-700 hover:border-slate-400 disabled:opacity-60"
                      data-testid="atlas-picker-more"
                    >
                      {loadingMore ? "Yükleniyor…" : "Daha fazla yükle"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
