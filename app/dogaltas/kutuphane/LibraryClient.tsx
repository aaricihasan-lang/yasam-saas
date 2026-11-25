"use client";

/**
 * Doğaltaş Kütüphanesi — uzman (ve owner önizleme) arama ekranı. Tüm içerik çalışma anında API'den gelir; kaynak dosyada
 * lisanslı metin yoktur. Taş sayısı sabit değildir (API `total`). Yetkisiz / kapalı → tek tip "bulunamadı" durumu.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { StoneLibraryFacetCatalog, StoneLibraryKeyedFacet, StoneLibraryListItem } from "@/lib/stone-library/contract";
import { viewerGet } from "./_shared/api";
import { AuthImage } from "./_shared/AuthImage";
import { FACET_ORDER } from "./_shared/labels";
import { libraryStoneName, libraryStoneSecondaryName, sortLibraryItemsForLocale } from "@/lib/dogaltas/stoneNames";
import s from "./kutuphane.module.css";

const PAGE = 30;
/** EN arayüzde (arama terimi yokken) İngilizce ada göre sıralama için yayımlanmış kartların tamamı sayfa sayfa okunur
 *  (sunucu sırası Türkçe `sort_key`; migration yok). Üst sınırı aşan kütüphanede sunucu sırasına dönülür. */
const EN_SORT_FETCH_PAGE = 50;
const EN_SORT_MAX_ITEMS = 500;
type Search = { total: number; limit: number; offset: number; items: StoneLibraryListItem[] };
type Selected = Record<StoneLibraryKeyedFacet | "birth_month", string[]>;
const emptySel = (): Selected => ({ color: [], chakra: [], zodiac: [], element: [], planet: [], birth_month: [] });

/** Kütüphane arayüz çevirisi: ay adı + facet değer etiketi (DB'den label_tr / label_en; anahtar kanonik kalır). */
export function useLibraryLabels() {
  const t = useTranslations("stones.library");
  const locale = useLocale();
  const monthName = (m: number): string => (Number.isInteger(m) && m >= 1 && m <= 12 ? t(`month.${m}`) : String(m));
  const facetValueLabel = (v: { label_tr: string; label_en: string }): string => (locale === "en" && v.label_en ? v.label_en : v.label_tr);
  return { t, locale, monthName, facetValueLabel };
}

export function ModuleNav({ current, ownerWorkspaceHref }: { current: "library" | "articles"; ownerWorkspaceHref?: string }) {
  const t = useTranslations("stones.library");
  return (
    <nav className={s.modnav} aria-label={t("moduleNavAria")}>
      <Link href="/dogaltas/kutuphane" aria-current={current === "library" ? "page" : undefined}>
        {t("title")}
      </Link>
      {ownerWorkspaceHref ? <Link href={ownerWorkspaceHref}>{t("managementTab")}</Link> : null}
    </nav>
  );
}

export function NotFoundState() {
  const t = useTranslations("stones.library");
  return (
    <div className={s.gate} role="status">
      <h1>{t("notFound")}</h1>
      <Link className={s.btn} href="/dogaltas">
        {t("backToModule")}
      </Link>
    </div>
  );
}

/** ownerWorkspaceHref: "Kütüphane Yönetimi" sekmesi (yalnız owner yoklaması başarılıysa verilir; uzmanlara yok). */
export default function LibraryClient({ ownerWorkspaceHref }: { ownerWorkspaceHref?: string } = {}) {
  const { t, locale, monthName, facetValueLabel } = useLibraryLabels();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sel, setSel] = useState<Selected>(emptySel);
  const [offset, setOffset] = useState(0);
  const [catalog, setCatalog] = useState<StoneLibraryFacetCatalog | null>(null);
  const [result, setResult] = useState<{ key: string; data: Search | null; denied: boolean } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const r = await viewerGet<StoneLibraryFacetCatalog & { ok: true }>("/api/dogaltas/kutuphane?filtreler=1", ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (r.ok) setCatalog(r.data);
      else if (r.status === 404 || r.status === 401 || r.status === 403) setDenied(true);
    })();
    return () => ctrl.abort();
  }, []);

  // EN arayüz + arama terimi yok → görünen (İngilizce) ada göre sıra. Arama terimi varken sunucunun alaka sırası korunur.
  // TR arayüzde istek ve sıra birebir aynı.
  const sortByEn = locale === "en" && !debouncedQ;
  const filterQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ) p.set("q", debouncedQ);
    for (const k of [...FACET_ORDER, "birth_month"] as const) for (const v of sel[k]) p.append(k, v);
    return p;
  }, [debouncedQ, sel]);
  const queryKey = useMemo(() => {
    const p = new URLSearchParams(filterQuery);
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    return p.toString();
  }, [filterQuery, offset]);
  const resultKey = sortByEn ? `${queryKey}#en` : queryKey;

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      if (sortByEn) {
        const all = await fetchAllForEnSort(filterQuery, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (all) {
          const items = sortLibraryItemsForLocale(all.items, locale).slice(offset, offset + PAGE);
          setResult({ key: resultKey, data: { total: all.total, limit: PAGE, offset, items }, denied: false });
          return;
        }
      }
      const r = await viewerGet<Search & { ok: true }>(`/api/dogaltas/kutuphane?${queryKey}`, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setResult({ key: resultKey, data: r.ok ? r.data : null, denied: !r.ok });
    })();
    return () => ctrl.abort();
  }, [queryKey, resultKey, sortByEn, filterQuery, offset, locale]);

  const toggle = (k: keyof Selected, v: string) => {
    setSel((cur) => ({ ...cur, [k]: cur[k].includes(v) ? cur[k].filter((x) => x !== v) : [...cur[k], v] }));
    setOffset(0);
  };
  const clearAll = () => {
    setSel(emptySel());
    setOffset(0);
  };
  const activeCount = Object.values(sel).reduce((n, a) => n + a.length, 0);
  const labelOf = (k: StoneLibraryKeyedFacet, key: string) => {
    const v = catalog?.facets[k]?.find((x) => x.key === key);
    return v ? facetValueLabel(v) : key;
  };

  if (denied) {
    return (
      <main className={s.root}>
        <div className={s.page}>
          <ModuleNav current="library" ownerWorkspaceHref={ownerWorkspaceHref} />
          <NotFoundState />
        </div>
      </main>
    );
  }

  const loading = !result || result.key !== resultKey;
  const data = result?.data ?? null;
  const total = data?.total ?? 0;

  const group = (k: StoneLibraryKeyedFacet) => {
    const vals = catalog?.facets[k] ?? [];
    if (!vals.length) return null;
    return (
      <section className={s.fgroup} key={k}>
        <h3>{t(`facet.${k}`)}</h3>
        <div className={s.chips}>
          {vals.map((v) => (
            <button key={v.key} type="button" className={s.chip} aria-pressed={sel[k].includes(v.key)} onClick={() => toggle(k, v.key)}>
              {facetValueLabel(v)} <small>{v.count}</small>
            </button>
          ))}
        </div>
      </section>
    );
  };

  return (
    <main className={s.root}>
      <div className={s.page}>
        <ModuleNav current="library" ownerWorkspaceHref={ownerWorkspaceHref} />
        <section className={s.hero}>
          <div>
            <span className={s.eyebrow}>Yaşam Sistemi</span>
            <h1>{t("title")}</h1>
            <p>{t("heroLead")}</p>
          </div>
          {catalog ? (
            <div className={s.heroStats}>
              <div className={s.statPill}>
                <b>{catalog.total}</b>
                <span>{t("publishedStones")}</span>
              </div>
            </div>
          ) : null}
        </section>

        <div className={s.searchrow}>
          <label className={s.search}>
            <span className={s.srOnly}>{t("searchLabel")}</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} autoComplete="off" maxLength={80} enterKeyHint="search" />
            {q ? (
              <button type="button" className={s.iconBtn} aria-label={t("clearSearch")} onClick={() => setQ("")}>
                ×
              </button>
            ) : null}
          </label>
          <button
            type="button"
            className={`${s.btn} ${s.filterToggle}`}
            aria-expanded={sheet || !collapsed}
            onClick={() => {
              setSheet((v) => !v);
              setCollapsed((v) => !v);
            }}
          >
            {t("filters")} {activeCount ? <span className={s.count}>{activeCount}</span> : null}
          </button>
        </div>

        <div className={`${s.lib} ${sheet ? s.sheetOpen : ""} ${collapsed ? s.filtersCollapsed : ""}`}>
          <aside className={s.filters} aria-label={t("filters")}>
            <div className={s.filtersHead}>
              <h2>{t("filters")}</h2>
              {activeCount ? (
                <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={clearAll}>
                  {t("clearAll")}
                </button>
              ) : null}
            </div>
            {catalog ? FACET_ORDER.map(group) : <p className={s.missing}>{t("filtersLoading")}</p>}
            {catalog && catalog.birth_month.length ? (
              <section className={s.fgroup}>
                <h3>{t("birthMonth")}</h3>
                <div className={s.chips}>
                  {catalog.birth_month.map((m) => (
                    <button key={m.value} type="button" className={s.chip} aria-pressed={sel.birth_month.includes(String(m.value))} onClick={() => toggle("birth_month", String(m.value))}>
                      {monthName(m.value)} <small>{m.count}</small>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <div className={s.sheetFoot}>
              <button type="button" className={s.btn} onClick={clearAll}>
                {t("clearAll")}
              </button>
              <button type="button" className={`btn-success ${s.btn}`} onClick={() => setSheet(false)}>
                {t("showResults", { total })}
              </button>
            </div>
          </aside>

          <section aria-live="polite" aria-busy={loading}>
            <div className={s.resultsBar}>
              <span className={s.n}>{loading ? t("searching") : t("resultCount", { total })}</span>
              <div className={s.chips}>
                {FACET_ORDER.flatMap((k) =>
                  sel[k].map((v) => (
                    <button key={`${k}-${v}`} type="button" className={`${s.chip} ${s.activeChip}`} aria-pressed="true" onClick={() => toggle(k, v)}>
                      {labelOf(k, v)} ×
                    </button>
                  )),
                )}
                {sel.birth_month.map((v) => (
                  <button key={`m-${v}`} type="button" className={`${s.chip} ${s.activeChip}`} aria-pressed="true" onClick={() => toggle("birth_month", v)}>
                    {monthName(Number(v))} ×
                  </button>
                ))}
              </div>
            </div>
            {loading && !data ? (
              <p className={s.loading}>{t("loading")}</p>
            ) : !data ? (
              <NotFoundState />
            ) : data.items.length ? (
              <>
                <div className={s.grid}>
                  {data.items.map((it) => (
                    <StoneCard key={it.slug} item={it} />
                  ))}
                </div>
                {total > PAGE ? (
                  <div className={s.pager}>
                    <button type="button" className={`btn-outline ${s.btn}`} disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
                      {t("prev")}
                    </button>
                    <span className={s.missing}>
                      {offset + 1}–{Math.min(offset + PAGE, total)} / {total}
                    </span>
                    <button type="button" className={`btn-outline ${s.btn}`} disabled={offset + PAGE >= total || loading} onClick={() => setOffset(offset + PAGE)}>
                      {t("next")}
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className={s.emptyState}>
                <b>{t("emptyTitle")}</b>
                {t("emptyHint")}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

/**
 * EN sıralaması için filtreye uyan tüm yayımlanmış kartlar (sayfa sayfa; yalnız okuma ucu, kredi/sağlayıcı çağrısı yok).
 * Hata / yetkisiz / üst sınır aşımı → null (çağıran sunucu sayfalamasına döner).
 */
async function fetchAllForEnSort(filter: URLSearchParams, signal: AbortSignal): Promise<{ total: number; items: StoneLibraryListItem[] } | null> {
  const items: StoneLibraryListItem[] = [];
  let total = 0;
  for (let off = 0; off < EN_SORT_MAX_ITEMS; off += EN_SORT_FETCH_PAGE) {
    const p = new URLSearchParams(filter);
    p.set("limit", String(EN_SORT_FETCH_PAGE));
    p.set("offset", String(off));
    const r = await viewerGet<Search & { ok: true }>(`/api/dogaltas/kutuphane?${p.toString()}`, signal);
    if (!r.ok || signal.aborted) return null;
    total = r.data.total;
    if (total > EN_SORT_MAX_ITEMS) return null;
    items.push(...r.data.items);
    if (r.data.items.length < EN_SORT_FETCH_PAGE || items.length >= total) break;
  }
  return { total, items };
}

function StoneCard({ item }: { item: StoneLibraryListItem }) {
  const { t, locale, facetValueLabel } = useLibraryLabels();
  // Sistem kartı: EN arayüzde name_en birincil, Türkçe ad alt satırda; TR'de bugünkü gibi name_tr + name_en alt satır.
  const name = libraryStoneName(item, locale);
  const secondary = libraryStoneSecondaryName(item, locale);
  const tags = [...(item.facets.color ?? []), ...(item.facets.chakra ?? [])].map(facetValueLabel);
  return (
    <Link className={s.card} href={`/dogaltas/kutuphane/${item.slug}`}>
      <span className={s.ph}>
        {item.has_image ? (
          <AuthImage src={`/api/dogaltas/kutuphane/${item.slug}/gorsel`} alt={t("imageAlt", { name })} lazy className={s.phImg} placeholderClassName={s.phEmpty} />
        ) : (
          <span className={s.phEmpty}>{t("noImage")}</span>
        )}
      </span>
      <span className={s.cardBody}>
        <h3>{name}</h3>
        {secondary ? <span className={s.alt}>{secondary}</span> : null}
        {tags.length ? (
          <span className={s.tags}>
            {tags.slice(0, 3).map((t) => (
              <span key={t} className={s.tag}>
                {t}
              </span>
            ))}
            {tags.length > 3 ? <span className={s.tag}>+{tags.length - 3}</span> : null}
          </span>
        ) : null}
        {item.excerpt ? <span className={s.excerpt}>{item.excerpt}</span> : null}
        {item.excerpt && item.excerpt_attribution ? <span className={s.attrib}>{item.excerpt_attribution}</span> : null}
      </span>
    </Link>
  );
}
