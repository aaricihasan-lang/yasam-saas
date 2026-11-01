"use client";

/**
 * Doğaltaş Kütüphanesi — uzman (ve owner önizleme) arama ekranı. Tüm içerik çalışma anında API'den gelir; kaynak dosyada
 * lisanslı metin yoktur. Taş sayısı sabit değildir (API `total`). Yetkisiz / kapalı → tek tip "bulunamadı" durumu.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { StoneLibraryFacetCatalog, StoneLibraryKeyedFacet, StoneLibraryListItem } from "@/lib/stone-library/contract";
import { viewerGet } from "./_shared/api";
import { AuthImage } from "./_shared/AuthImage";
import { FACET_LABEL, FACET_ORDER, LIBRARY_TITLE, NOT_FOUND_TEXT, monthName } from "./_shared/labels";
import s from "./kutuphane.module.css";

const PAGE = 30;
type Search = { total: number; limit: number; offset: number; items: StoneLibraryListItem[] };
type Selected = Record<StoneLibraryKeyedFacet | "birth_month", string[]>;
const emptySel = (): Selected => ({ color: [], chakra: [], zodiac: [], element: [], planet: [], birth_month: [] });

export function ModuleNav({ current, ownerWorkspaceHref }: { current: "library" | "articles"; ownerWorkspaceHref?: string }) {
  return (
    <nav className={s.modnav} aria-label="Doğaltaş modülü">
      <Link href="/dogaltas/kutuphane" aria-current={current === "library" ? "page" : undefined}>
        {LIBRARY_TITLE}
      </Link>
      {ownerWorkspaceHref ? <Link href={ownerWorkspaceHref}>Kütüphane Yönetimi</Link> : null}
    </nav>
  );
}

export function NotFoundState() {
  return (
    <div className={s.gate} role="status">
      <h1>{NOT_FOUND_TEXT}</h1>
      <Link className={s.btn} href="/dogaltas">
        Doğaltaş modülüne dön
      </Link>
    </div>
  );
}

/** ownerWorkspaceHref: "Kütüphane Yönetimi" sekmesi (yalnız owner yoklaması başarılıysa verilir; uzmanlara yok). */
export default function LibraryClient({ ownerWorkspaceHref }: { ownerWorkspaceHref?: string } = {}) {
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

  const queryKey = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ) p.set("q", debouncedQ);
    for (const k of [...FACET_ORDER, "birth_month"] as const) for (const v of sel[k]) p.append(k, v);
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    return p.toString();
  }, [debouncedQ, sel, offset]);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const r = await viewerGet<Search & { ok: true }>(`/api/dogaltas/kutuphane?${queryKey}`, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setResult({ key: queryKey, data: r.ok ? r.data : null, denied: !r.ok });
    })();
    return () => ctrl.abort();
  }, [queryKey]);

  const toggle = (k: keyof Selected, v: string) => {
    setSel((cur) => ({ ...cur, [k]: cur[k].includes(v) ? cur[k].filter((x) => x !== v) : [...cur[k], v] }));
    setOffset(0);
  };
  const clearAll = () => {
    setSel(emptySel());
    setOffset(0);
  };
  const activeCount = Object.values(sel).reduce((n, a) => n + a.length, 0);
  const labelOf = (k: StoneLibraryKeyedFacet, key: string) => catalog?.facets[k]?.find((x) => x.key === key)?.label_tr ?? key;

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

  const loading = !result || result.key !== queryKey;
  const data = result?.data ?? null;
  const total = data?.total ?? 0;

  const group = (k: StoneLibraryKeyedFacet) => {
    const vals = catalog?.facets[k] ?? [];
    if (!vals.length) return null;
    return (
      <section className={s.fgroup} key={k}>
        <h3>{FACET_LABEL[k]}</h3>
        <div className={s.chips}>
          {vals.map((v) => (
            <button key={v.key} type="button" className={s.chip} aria-pressed={sel[k].includes(v.key)} onClick={() => toggle(k, v.key)}>
              {v.label_tr} <small>{v.count}</small>
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
            <h1>{LIBRARY_TITLE}</h1>
            <p>Doğaltaşların açıklamaları, anlamları, olumlamaları ve eşleştirmeleri tek yerde. Kaynak metinler değiştirilmeden korunur; doğrulanmış Türkçe çeviri ayrı bir katmandır.</p>
          </div>
          {catalog ? (
            <div className={s.heroStats}>
              <div className={s.statPill}>
                <b>{catalog.total}</b>
                <span>Yayındaki taş</span>
              </div>
            </div>
          ) : null}
        </section>

        <div className={s.searchrow}>
          <label className={s.search}>
            <span className={s.srOnly}>Taş ara</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Taş adıyla arayın (Türkçe veya İngilizce)…" autoComplete="off" maxLength={80} enterKeyHint="search" />
            {q ? (
              <button type="button" className={s.iconBtn} aria-label="Aramayı temizle" onClick={() => setQ("")}>
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
            Filtreler {activeCount ? <span className={s.count}>{activeCount}</span> : null}
          </button>
        </div>

        <div className={`${s.lib} ${sheet ? s.sheetOpen : ""} ${collapsed ? s.filtersCollapsed : ""}`}>
          <aside className={s.filters} aria-label="Filtreler">
            <div className={s.filtersHead}>
              <h2>Filtreler</h2>
              {activeCount ? (
                <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={clearAll}>
                  Tümünü temizle
                </button>
              ) : null}
            </div>
            {catalog ? FACET_ORDER.map(group) : <p className={s.missing}>Filtreler yükleniyor…</p>}
            {catalog && catalog.birth_month.length ? (
              <section className={s.fgroup}>
                <h3>Doğum ayı</h3>
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
                Tümünü temizle
              </button>
              <button type="button" className={`btn-success ${s.btn}`} onClick={() => setSheet(false)}>
                Sonuçları göster ({total})
              </button>
            </div>
          </aside>

          <section aria-live="polite" aria-busy={loading}>
            <div className={s.resultsBar}>
              <span className={s.n}>{loading ? "Aranıyor…" : `${total} taş`}</span>
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
              <p className={s.loading}>Yükleniyor…</p>
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
                      Önceki
                    </button>
                    <span className={s.missing}>
                      {offset + 1}–{Math.min(offset + PAGE, total)} / {total}
                    </span>
                    <button type="button" className={`btn-outline ${s.btn}`} disabled={offset + PAGE >= total || loading} onClick={() => setOffset(offset + PAGE)}>
                      Sonraki
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className={s.emptyState}>
                <b>Bu ölçütlere uyan taş bulunamadı.</b>
                Filtreleri azaltmayı veya farklı bir ad yazmayı deneyin.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function StoneCard({ item }: { item: StoneLibraryListItem }) {
  const tags = [...(item.facets.color ?? []), ...(item.facets.chakra ?? [])].map((v) => v.label_tr);
  return (
    <Link className={s.card} href={`/dogaltas/kutuphane/${item.slug}`}>
      <span className={s.ph}>
        {item.has_image ? (
          <AuthImage src={`/api/dogaltas/kutuphane/${item.slug}/gorsel`} alt={`${item.name_tr} — taş görseli`} lazy className={s.phImg} placeholderClassName={s.phEmpty} />
        ) : (
          <span className={s.phEmpty}>Görsel yok</span>
        )}
      </span>
      <span className={s.cardBody}>
        <h3>{item.name_tr}</h3>
        {item.name_en && item.name_en !== item.name_tr ? <span className={s.alt}>{item.name_en}</span> : null}
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
