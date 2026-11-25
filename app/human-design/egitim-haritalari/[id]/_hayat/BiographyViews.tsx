"use client";

/**
 * FAZ 10 — "HAYAT HİKÂYESİ" ve "KAYNAKLAR" sekmeleri (eğitmen; salt okunur). Biyografi merkezî ünlü kaydına aittir; her
 * eğitmen aynı metni görür, kendi notları ayrı kalır ("Notlarıma ekle" → çalışma alanında KAYDEDİLMEMİŞ not olarak).
 * Biyografik olgular Human Design yorumu DEĞİLDİR; ekranda bu ayrım açıkça yazılır. Metin düz metindir (HTML render YOK);
 * dış bağlantılar yalnız https ve rel="noopener noreferrer nofollow" ile yeni sekmede açılır.
 */
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useEduLabel } from "@/app/human-design/egitim-merkezi/_ui/labels";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/hayatHikayesi.module.css";
import {
  BIO_LANG_LABEL, BIO_SECTION_LABEL, BIO_SOURCE_KIND_LABEL,
  type BioLang, type BioSource, type BioTrainerResponse, type BioTrainerView,
} from "@/lib/human-design/education/biography/biographyContract";
import type { EduCatalogSourceView } from "@/lib/human-design/education/educationContract";

// i18n-ignore: TR ay adları (kaynak dil biçimi; diğer dillerde MONTHS_EN)
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Takvim tarihi (YYYY[-AA[-GG]]) → "7 Kasım 1867" (tr, varsayılan; bugünkü çıktı) / "7 November 1867" (diğer diller). */
export function fmtBioDate(d: string, locale: string = "tr"): string {
  const months = locale === "tr" ? MONTHS : MONTHS_EN;
  const [y, m, g] = d.split("-");
  if (g) return `${Number(g)} ${months[Number(m) - 1]} ${y}`;
  if (m) return `${months[Number(m) - 1]} ${y}`;
  return y;
}
const safeHref = (u: string) => (/^https:\/\//i.test(u) ? u : undefined);

export type BioState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ok"; data: BioTrainerResponse };

function sourceNumbers(sources: BioSource[]): Map<string, number> {
  return new Map(sources.map((s, i) => [s.id, i + 1]));
}

function Cites({ ids, nums, onCite }: { ids: string[]; nums: Map<string, number>; onCite: (id: string) => void }) {
  const t = useTranslations("hd.education");
  return (
    <>
      {ids.filter((id) => nums.has(id)).map((id) => (
        <button key={id} type="button" className={css.cite} onClick={() => onCite(id)} aria-label={t("bio.citeAria", { n: String(nums.get(id)) })} data-bio-cite={id}>
          {nums.get(id)}
        </button>
      ))}
    </>
  );
}

export function BiographyTab({ state, lang, onLang, onCite, onAddNote, displayName, onRetry }: {
  state: BioState; lang: BioLang; onLang: (l: BioLang) => void; onCite: (id: string) => void; onAddNote: (text: string) => void; displayName: string;
  /** FAZ 19: yükleme hatasında yeniden deneme (verilmezse düğme yok). */
  onRetry?: () => void;
}) {
  const t = useTranslations("hd.education");
  const label = useEduLabel();
  const [focusEv, setFocusEv] = useState<number | null>(null);
  if (state.kind === "loading") return <section className={`${base.panel} ${css.state}`} aria-busy="true" data-bio-state="loading"><p>{t("bio.loading")}</p></section>;
  if (state.kind === "error") {
    return (
      <p className={base.err} role="alert" data-bio-state="error">
        {t("bio.loadError")}
        {onRetry ? <>{" "}<button type="button" className={`${base.btn} ${base.ghost}`} onClick={onRetry} data-bio-retry>{t("shell.retry")}</button></> : null}
      </p>
    );
  }
  const { data } = state;
  const other = data.availableLangs.filter((l) => l !== lang);
  if (!data.biography) {
    return (
      <section className={`${base.panel} ${css.state}`} data-bio-state={data.availableLangs.length ? "lang-missing" : "none"}>
        <h2 className={css.stateTitle}>{data.availableLangs.length ? t("bio.langNotReady", { lang: label("bioLang", lang, BIO_LANG_LABEL[lang]) }) : t("bio.notPublished")}</h2>
        <p className={css.small}>
          {data.availableLangs.length
            ? t("bio.noVerified")
            : t("bio.willAppear", { name: displayName })}
        </p>
        {other.length ? (
          <div className={css.langRow} style={{ justifyContent: "center", marginTop: 12 }}>
            {other.map((l) => <button key={l} type="button" className={`${base.btn} ${base.ghost}`} onClick={() => onLang(l)} data-bio-lang-switch={l}>{t("bio.openLang", { lang: label("bioLang", l, BIO_LANG_LABEL[l]) })}</button>)}
          </div>
        ) : null}
      </section>
    );
  }
  return <BiographyBody bio={data.biography} langs={data.availableLangs} lang={lang} onLang={onLang} onCite={onCite} onAddNote={onAddNote} focusEv={focusEv} setFocusEv={setFocusEv} />;
}

function BiographyBody({ bio, langs, lang, onLang, onCite, onAddNote, focusEv, setFocusEv }: {
  bio: BioTrainerView; langs: BioLang[]; lang: BioLang; onLang: (l: BioLang) => void; onCite: (id: string) => void; onAddNote: (text: string) => void;
  focusEv: number | null; setFocusEv: (i: number | null) => void;
}) {
  const t = useTranslations("hd.education");
  const label = useEduLabel();
  const locale = useLocale();
  const nums = useMemo(() => sourceNumbers(bio.sources), [bio.sources]);
  const years = useMemo(() => {
    const seen = new Set<string>();
    return bio.timeline.map((e, i) => ({ y: e.date.slice(0, 4), i })).filter((x) => (seen.has(x.y) ? false : (seen.add(x.y), true)));
  }, [bio.timeline]);
  const go = (domId: string) => document.getElementById(domId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const jumpEvent = (i: number) => { setFocusEv(i); go(`bio-ev-${i}`); };
  const meta: Array<[string, string | null]> = [[t("bio.life"), bio.lifeSpan], [t("bio.profession"), bio.profession], [t("bio.country"), bio.country], [t("bio.era"), bio.era]];

  return (
    <div className={css.story} data-bio-state="ok" data-bio-lang={bio.lang}>
      <div className={css.storyMain}>
        <section className={`${base.panel} ${css.intro}`} aria-labelledby="bio-name">
          <p className={base.eyebrow} style={{ margin: 0 }}>{t("bio.eyebrow")}</p>
          <h2 id="bio-name" className={css.introName}>{bio.displayName}</h2>
          <ul className={css.introMeta}>
            {meta.filter(([, v]) => !!v).map(([k, v]) => <li key={k}><b>{k}:</b> {v}</li>)}
          </ul>
          {bio.knownFor ? <p className={css.small} style={{ marginTop: 6 }}><b>{t("bio.knownFor")}</b> {bio.knownFor}</p> : null}
          <p className={css.introText} data-bio-intro>{bio.shortIntro}</p>
          <p className={css.factNote} data-bio-disclaimer>
            {t("bio.disclaimer")}
          </p>
          {bio.neutralityNote ? <p className={css.small} data-bio-neutrality>{bio.neutralityNote}</p> : null}
        </section>

        {bio.sections.map((s) => (
          <section key={s.key} id={`bio-sec-${s.key}`} className={`${base.panel} ${css.section}`} aria-labelledby={`bio-h-${s.key}`} data-bio-section={s.key}>
            <h3 id={`bio-h-${s.key}`} className={css.sectionTitle}>{s.title || label("bioSection", s.key, BIO_SECTION_LABEL[s.key])}</h3>
            {s.paragraphs.map((p, j) => (
              <p key={j} className={css.para}>{p.text}<Cites ids={p.sourceIds} nums={nums} onCite={onCite} /></p>
            ))}
          </section>
        ))}

        {bio.timeline.length ? (
          <section id="bio-timeline" className={`${base.panel} ${css.tlPanel}`} aria-labelledby="bio-tl-h" data-bio-timeline>
            <h3 id="bio-tl-h" className={css.sectionTitle}>{t("bio.timelineTitle")}</h3>
            <p className={css.small} style={{ marginTop: 0 }}>{t("bio.timelineHint")}</p>
            {years.length > 1 ? (
              <div className={css.tlJump} role="group" aria-label={t("bio.yearJump")}>
                {years.map((x) => <button key={x.y} type="button" className={css.tlJumpBtn} onClick={() => jumpEvent(x.i)} data-bio-jump={x.y}>{x.y}</button>)}
              </div>
            ) : null}
            <ol className={css.tl}>
              {bio.timeline.map((e, i) => (
                <li key={i} id={`bio-ev-${i}`} className={css.tlItem} data-bio-event={e.date}>
                  <span className={css.tlYear} aria-hidden>{e.date.slice(0, 4)}</span>
                  <div className={`${css.tlBody} ${focusEv === i ? css.tlFocus : ""}`}>
                    {e.date.length > 4 ? <span className={css.tlDate}>{fmtBioDate(e.date, locale)}</span> : null}
                    <p className={css.tlTitle}>{e.title}</p>
                    {e.text ? <p className={css.tlText}>{e.text}</p> : null}
                    <div className={css.tlActions}>
                      <Cites ids={e.sourceIds} nums={nums} onCite={onCite} />
                      <button type="button" className={css.noteBtn} onClick={() => onAddNote(`${fmtBioDate(e.date, locale)} — ${e.title}${e.text ? `: ${e.text}` : ""}`)} data-bio-add-note={i}>
                        {t("bio.addNote")}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {/* FAZ 13: araştırmacı / editoryal notlar (openQuestions) eğitmene GÖSTERİLMEZ; yalnız owner içerik yönetiminde. */}
      </div>

      <aside className={css.storyAside} aria-label={t("bio.navAria")}>
        <section className={`${base.panel} ${css.aside} ${css.asideToc}`}>
          <p className={css.asideTitle}>{t("bio.sections")}</p>
          <ul className={css.toc}>
            {bio.sections.map((s) => <li key={s.key}><button type="button" className={css.tocBtn} onClick={() => go(`bio-sec-${s.key}`)}>{s.title || label("bioSection", s.key, BIO_SECTION_LABEL[s.key])}</button></li>)}
            {bio.timeline.length ? <li><button type="button" className={css.tocBtn} onClick={() => go("bio-timeline")}>{t("bio.timeline")}</button></li> : null}
          </ul>
        </section>
        <section className={`${base.panel} ${css.aside}`}>
          <p className={css.asideTitle}>{t("bio.lang")}</p>
          <div className={css.langRow} role="group" aria-label={t("bio.langAria")}>
            {(["tr", "en"] as BioLang[]).map((l) => (
              <button key={l} type="button" className={`${css.langBtn} ${lang === l ? css.langOn : ""}`} aria-pressed={lang === l} onClick={() => onLang(l)} data-bio-lang={l}>
                {label("bioLang", l, BIO_LANG_LABEL[l])}{langs.includes(l) ? "" : t("bio.notReadySuffix")}
              </button>
            ))}
          </div>
          <p className={css.small}>{t("bio.revision", { rev: String(bio.revision), date: new Date(bio.updatedAt).toLocaleDateString(locale === "tr" ? "tr-TR" : "en-GB") })}</p>
        </section>
      </aside>
    </div>
  );
}

export function SourcesTab({ birthSources, documentQuote, calendarNote, bio, focusSource, bioStatus = "ok", onRetry }: {
  birthSources: EduCatalogSourceView[]; documentQuote: string; calendarNote: string | null; bio: BioTrainerView | null; focusSource: string | null;
  /** FAZ 19 (P3): biyografi isteğinin durumu — hata / yükleniyor iken "kaynak yok" YAZILMAZ. */
  bioStatus?: "loading" | "error" | "ok";
  onRetry?: () => void;
}) {
  const t = useTranslations("hd.education");
  const label = useEduLabel();
  const nums = bio ? sourceNumbers(bio.sources) : new Map<string, number>();
  return (
    <div className={css.srcGrid} style={{ marginTop: 16 }} data-bio-sources-tab>
      <section className={base.panel} style={{ marginTop: 0 }} aria-labelledby="src-birth">
        <h2 id="src-birth" className={base.h2}>{t("bio.birthSources")}</h2>
        <dl className={base.dl} style={{ marginTop: 10 }}>
          <dt>{t("cdetail.docQuote")}</dt><dd className={base.quote}>{documentQuote}</dd>
          {calendarNote ? (<><dt>{t("cdetail.calNote")}</dt><dd>{calendarNote}</dd></>) : null}
        </dl>
        <ul className={base.srcList} style={{ marginTop: 12 }}>
          {birthSources.length ? birthSources.map((s, i) => (
            <li key={i}>
              <b>{t.has(`cdetail.srcRole.${s.role}`) ? t(`cdetail.srcRole.${s.role}`) : t("cdetail.srcRole.other")}</b>
              <a className={base.ext} href={safeHref(s.url)} target="_blank" rel="noopener noreferrer nofollow">{s.institution ?? s.documentTitle ?? t("cdetail.viewDoc")}</a>
              <small>{[s.documentTitle && s.institution ? s.documentTitle : null, s.archiveRef, s.documentDate, s.primarySecondary ? (t.has(`cdetail.ps.${s.primarySecondary}`) ? t(`cdetail.ps.${s.primarySecondary}`) : `${s.primarySecondary} kaynak`) : null, s.timeExplicit ? t("cdetail.timeExplicit") : null, s.license ? t("cdetail.license", { license: s.license }) : null].filter(Boolean).join(" · ")}</small>
              {s.seenHow ? <small data-edu-seen-how>{t("bio.seenHowPrefix", { text: s.seenHow })}</small> : null}
            </li>
          )) : <li>{t("cdetail.noSources")}</li>}
        </ul>
      </section>
      <section className={base.panel} style={{ marginTop: 0 }} aria-labelledby="src-bio">
        <h2 id="src-bio" className={base.h2}>{t("bio.bioSources")}</h2>
        {bio ? (
          <>
            <ol className={css.srcItems}>
              {bio.sources.map((s) => (
                <li key={s.id} id={`bio-src-${s.id}`} className={`${css.srcItem} ${focusSource === s.id ? css.srcFocus : ""}`} data-bio-source={s.id}>
                  <span className={css.srcNo}>{nums.get(s.id)}</span>
                  <span className={css.srcBody}>
                    <a className={base.ext} href={safeHref(s.url)} target="_blank" rel="noopener noreferrer nofollow">{s.title}</a>
                    <small>{[s.publisher, label("bioSourceKind", s.kind, BIO_SOURCE_KIND_LABEL[s.kind] ?? s.kind), s.revisionId ? t("bio.pageRevision", { id: s.revisionId }) : null, s.accessedOn ? t("bio.accessed", { date: s.accessedOn }) : null, s.licenseUrl ? null : s.license].filter(Boolean).join(" · ")}
                      {/* FAZ 19 (P2-e): lisans bağlantısı varsa atıfta görünür (CC BY-SA). */}
                      {s.licenseUrl && safeHref(s.licenseUrl) ? <>{" · "}<a className={base.ext} href={safeHref(s.licenseUrl)} target="_blank" rel="noopener noreferrer nofollow" data-bio-license-link>{s.license ?? t("bio.licenseWord")}</a></> : null}
                    </small>
                  </span>
                </li>
              ))}
            </ol>
            <div className={css.licBox} data-bio-license>
              <b>{t("bio.licTitle")}</b>{" "}
              {bio.licenseInfo.directQuotes || bio.licenseInfo.adaptedText
                ? t("bio.licAdapted")
                : t("bio.licOriginal")}
              {bio.licenseInfo.articles.length ? (
                <ul>
                  {bio.licenseInfo.articles.map((a, i) => (
                    <li key={i}>
                      <a className={base.ext} href={safeHref(a.url)} target="_blank" rel="noopener noreferrer nofollow">{a.title}</a>
                      {" "}{t("bio.wikiAttr", { lang: a.lang.toUpperCase(), rev: a.oldid ? t("bio.wikiRev", { id: String(a.oldid) }) : "" })}{" "}
                      <a className={base.ext} href="https://creativecommons.org/licenses/by-sa/4.0/deed.tr" target="_blank" rel="noopener noreferrer nofollow">CC BY-SA 4.0</a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {bio.licenseInfo.note ? <p className={css.small}>{bio.licenseInfo.note}</p> : null}
            </div>
          </>
        ) : bioStatus === "error" ? (
          <p className={base.err} role="alert" data-bio-sources-error>
            {t("bio.sourcesError")}
            {onRetry ? <>{" "}<button type="button" className={`${base.btn} ${base.ghost}`} onClick={onRetry} data-bio-retry>{t("shell.retry")}</button></> : null}
          </p>
        ) : bioStatus === "loading" ? (
          <p className={css.small} aria-busy="true" data-bio-sources-loading>{t("bio.sourcesLoading")}</p>
        ) : (
          <p className={css.small} data-bio-sources-empty>{t("bio.sourcesEmpty")}</p>
        )}
      </section>
    </div>
  );
}
