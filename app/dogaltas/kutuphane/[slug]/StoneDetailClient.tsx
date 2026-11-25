"use client";

/**
 * Taş ayrıntısı (uzman + owner önizleme). İçerik kaynağı seçici: varsayılan gösterim (alan başına çözülmüş katman),
 * Doğrulanmış Türkçe çeviri, Kaynak metin (Türkçe), Kaynak metin (İngilizce). Tüm metin çalışma anında API'den gelir.
 * Uzmana iç yönetim durumu (taslak / eskimiş / sürüm no) gösterilmez.
 */

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  STONE_LIBRARY_DISPLAY_FIELDS,
  type StoneLibraryDisplayField,
  type StoneLibraryDisplaySource,
  type StoneLibraryStoneDoc,
} from "@/lib/stone-library/contract";
import { viewerGet } from "../_shared/api";
import { AuthImage } from "../_shared/AuthImage";
import { FACET_ORDER, formatHardness, splitKeywords } from "../_shared/labels";
import { ModuleNav, NotFoundState, useLibraryLabels } from "../LibraryClient";
import { libraryStoneName, libraryStoneSecondaryName } from "@/lib/dogaltas/stoneNames";
import s from "../kutuphane.module.css";

type Mode = "default" | "verified" | "tr" | "en";
type Block = { key: string; label: string | null; text: string; tag: string; verified?: boolean };

const MODES: { key: Mode; labelKey: "modeDefault" | "modeVerified" | "modeTr" | "modeEn" }[] = [
  { key: "default", labelKey: "modeDefault" },
  { key: "verified", labelKey: "modeVerified" },
  { key: "tr", labelKey: "modeTr" },
  { key: "en", labelKey: "modeEn" },
];

/** Arayüz metinleri (çevrilmiş); kaynak içerik metinleri API'den aynen gelir. */
type DetailText = {
  displaySource: (src: StoneLibraryDisplaySource) => string;
  noVerified: string;
  sourceTr: string;
  sourceEn: string;
};

function blocksFor(item: StoneLibraryStoneDoc, f: StoneLibraryDisplayField, mode: Mode, tx: DetailText): { blocks: Block[]; note: string | null } {
  const disp = item.display.fields.find((x) => x.field === f) ?? null;
  if (mode === "default") {
    if (!disp) return { blocks: [], note: null };
    return {
      blocks: [{ key: "d", label: null, text: disp.content, tag: tx.displaySource(disp.display_source), verified: disp.display_source === "DOGRULANMIS_TR_CEVIRI" }],
      note: null,
    };
  }
  if (mode === "verified") {
    if (item.display.verified_available[f] !== true) return { blocks: [], note: tx.noVerified };
    const vt = item.display.verified_content[f] ?? (disp?.display_source === "DOGRULANMIS_TR_CEVIRI" ? disp.content : null);
    if (vt) return { blocks: [{ key: "v", label: null, text: vt, tag: tx.displaySource("DOGRULANMIS_TR_CEVIRI"), verified: true }], note: null };
    return { blocks: [], note: tx.noVerified };
  }
  const lang = mode;
  const tag = lang === "tr" ? tx.sourceTr : tx.sourceEn;
  if (f === "keywords") {
    const words = (item.facets.keyword ?? []).filter((k) => k.lang === lang).map((k) => k.text);
    return words.length ? { blocks: [{ key: "k", label: null, text: words.join(" | "), tag }], note: null } : { blocks: [], note: null };
  }
  const blocks: Block[] = [];
  for (const sec of item.sections) {
    for (const x of sec.fields) {
      if (x.field === f && x.lang === lang) blocks.push({ key: `${sec.key}-${lang}`, label: [sec.label, sec.attribution].filter(Boolean).join(" · ") || null, text: x.content, tag });
    }
  }
  return { blocks, note: null };
}

export default function StoneDetailClient({ slug }: { slug: string }) {
  const [state, setState] = useState<{ slug: string; item: StoneLibraryStoneDoc | null } | null>(null);
  const [mode, setMode] = useState<Mode>("default");
  const { t: tl, locale, monthName, facetValueLabel } = useLibraryLabels();
  const t = useTranslations("stones.library.detail");
  const tx: DetailText = {
    displaySource: (src) => t(`displaySource.${src}`),
    noVerified: t("noVerified"),
    sourceTr: t("modeTr"),
    sourceEn: t("modeEn"),
  };

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      const r = await viewerGet<{ ok: true; item: StoneLibraryStoneDoc }>(`/api/dogaltas/kutuphane/${encodeURIComponent(slug)}`, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setState({ slug, item: r.ok ? r.data.item : null });
    })();
    return () => ctrl.abort();
  }, [slug]);

  const shell = (children: ReactNode) => (
    <main className={s.root}>
      <div className={s.page}>
        <ModuleNav current="library" />
        {children}
      </div>
    </main>
  );

  if (!state || state.slug !== slug) return shell(<p className={s.loading}>{tl("loading")}</p>);
  const item = state.item;
  if (!item) return shell(<NotFoundState />);

  const anyVerified = STONE_LIBRARY_DISPLAY_FIELDS.some((f) => item.display.verified_available[f] === true);
  const hasEn = item.sections.some((x) => x.fields.some((f) => f.lang === "en")) || (item.facets.keyword ?? []).some((k) => k.lang === "en");
  const hasTr = item.sections.some((x) => x.fields.some((f) => f.lang === "tr")) || (item.facets.keyword ?? []).some((k) => k.lang === "tr");
  const disabled: Record<Mode, boolean> = { default: false, verified: !anyVerified, tr: !hasTr, en: !hasEn };
  const sourceOnly = item.display.fields.length > 0 && item.display.fields.every((f) => f.display_source === "KAYNAK_TR");

  const facts: [string, string][] = [];
  const hard = formatHardness(item.hardness);
  if (hard) facts.push([t("hardness"), hard]);
  if (item.facets.birth_month?.length) facts.push([tl("birthMonth"), item.facets.birth_month.map(monthName).join(", ")]);
  if (item.facets.numerical_vibration?.length) facts.push([t("numericalVibration"), item.facets.numerical_vibration.join(", ")]);
  const groups = FACET_ORDER.filter((k) => (item.facets[k]?.length ?? 0) > 0);

  const notice = (
    <aside className={`${s.notice} ${item.has_health_content ? s.noticeStrong : ""}`} role="note">
      <b>{t("healthNotice")}</b>
      <p>{locale === "en" && item.medical_notice.en ? item.medical_notice.en : item.medical_notice.tr}</p>
    </aside>
  );
  const warnings = item.owner_info.filter((n) => n.kind === "warning");
  const notes = item.owner_info.filter((n) => n.kind !== "warning");

  return shell(
    <>
      <div className={s.crumbrow}>
        <Link className={s.crumb} href="/dogaltas/kutuphane">
          {t("backToLibrary")}
        </Link>
      </div>
      <div className={s.detail}>
        <aside className={s.aside}>
          <div>
            <div className={s.photo}>
              {item.image ? (
                <AuthImage src={`/api/dogaltas/kutuphane/${item.slug}/gorsel`} alt={tl("imageAlt", { name: libraryStoneName(item, locale) })} className={s.phImg} placeholderClassName={s.phEmpty} />
              ) : (
                <span className={s.phEmpty}>{tl("noImage")}</span>
              )}
            </div>
            {item.image?.attribution ? <p className={s.photoCaption}>{item.image.attribution}</p> : null}
          </div>
          {facts.length ? (
            <div className={s.panel}>
              <h2>{t("stoneInfo")}</h2>
              <dl className={s.facts}>
                {facts.map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {groups.length ? (
            <div className={s.panel}>
              <h2>{t("associations")}</h2>
              {groups.map((k) => (
                <div key={k} className={s.matchGroup}>
                  <h3>{tl(`facet.${k}`)}</h3>
                  <div className={s.chips}>
                    {(item.facets[k] ?? []).map((v) => (
                      <span key={v.key} className={`${s.chip} ${s.chipStatic}`}>
                        {facetValueLabel(v)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </aside>

        <div className={s.main}>
          <header className={s.head}>
            {/* Sistem kartı adı: TR'de name_tr + "İngilizce adı"; EN'de name_en birincil + "Turkish name" (kaynak alanlar değişmez). */}
            <h1>{libraryStoneName(item, locale)}</h1>
            {libraryStoneSecondaryName(item, locale) ? (
              <p>{t(locale === "en" ? "turkishName" : "englishName", { name: libraryStoneSecondaryName(item, locale) ?? "" })}</p>
            ) : null}
          </header>

          <div className={s.srcbar}>
            <span className={s.srcLabel}>{t("contentSource")}</span>
            <div className={s.srcsw} role="radiogroup" aria-label={t("contentSource")}>
              {MODES.map((m) => (
                <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} disabled={disabled[m.key]} onClick={() => setMode(m.key)}>
                  {t(m.labelKey)}
                </button>
              ))}
            </div>
          </div>
          {!anyVerified || sourceOnly ? (
            <p className={s.expertNote}>{t("sourceOnlyNote")}</p>
          ) : null}

          {STONE_LIBRARY_DISPLAY_FIELDS.map((f) => {
            const { blocks, note } = blocksFor(item, f, mode, tx);
            const sec = (
              <section key={f} className={s.sec}>
                <div className={s.secHead}>
                  <h2>
                    <span className={s.bar} />
                    {tl(`field.${f}`)}
                  </h2>
                  {blocks.length === 1 ? <span className={`${s.srcTag} ${blocks[0].verified ? s.srcTagVer : ""}`}>{blocks[0].tag}</span> : null}
                </div>
                {blocks.length ? (
                  blocks.map((b) => (
                    <div key={b.key}>
                      {blocks.length > 1 && b.label ? <p className={s.srcNote}>{b.label}</p> : null}
                      {f === "keywords" ? (
                        <div className={s.chips}>
                          {splitKeywords(b.text).map((k) => (
                            <span key={k} className={`${s.chip} ${s.chipStatic}`}>
                              {k}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className={`${s.txt} ${f === "affirmation" ? s.affirm : ""}`}>{b.text}</p>
                      )}
                      {blocks.length === 1 && b.label ? <p className={s.srcNote}>{b.label}</p> : null}
                    </div>
                  ))
                ) : (
                  <p className={s.missing}>{note ?? t("fieldMissing")}</p>
                )}
              </section>
            );
            return f === "description" && item.has_health_content ? [sec, <div key="notice">{notice}</div>] : sec;
          })}

          {item.owner_info.length ? (
            <section className={`${s.sec} ${s.notes}`}>
              <div className={s.secHead}>
                <h2>
                  <span className={`${s.bar} ${s.barAlt}`} />
                  {t("notesTitle")}
                </h2>
              </div>
              <p className={s.notesSub}>{t("notesSub")}</p>
              {[...warnings, ...notes].map((n, i) => (
                <article key={i} className={`${s.noteItem} ${n.kind === "warning" ? s.noteWarn : ""}`}>
                  <div className={s.noteCat}>{n.kind === "warning" ? t("noteWarning") : t("noteInfo")}</div>
                  {n.title ? <h3>{n.title}</h3> : null}
                  <p>{n.body}</p>
                </article>
              ))}
            </section>
          ) : null}

          {item.pairings.length ? (
            <section className={s.sec}>
              <div className={s.secHead}>
                <h2>
                  <span className={s.bar} />
                  {t("pairedStones")}
                </h2>
              </div>
              <div className={s.pairs}>
                {item.pairings.map((p) => (
                  <Link key={p.slug} className={s.pair} href={`/dogaltas/kutuphane/${p.slug}`}>
                    {libraryStoneName(p, locale)}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {!item.has_health_content ? notice : null}
        </div>
      </div>
    </>,
  );
}
