"use client";

/**
 * FAZ 10 — "HAYAT HİKÂYESİ" ve "KAYNAKLAR" sekmeleri (eğitmen; salt okunur). Biyografi merkezî ünlü kaydına aittir; her
 * eğitmen aynı metni görür, kendi notları ayrı kalır ("Notlarıma ekle" → çalışma alanında KAYDEDİLMEMİŞ not olarak).
 * Biyografik olgular Human Design yorumu DEĞİLDİR; ekranda bu ayrım açıkça yazılır. Metin düz metindir (HTML render YOK);
 * dış bağlantılar yalnız https ve rel="noopener noreferrer nofollow" ile yeni sekmede açılır.
 */
import { useMemo, useState } from "react";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/hayatHikayesi.module.css";
import {
  BIO_LANG_LABEL, BIO_SECTION_LABEL, BIO_SOURCE_KIND_LABEL,
  type BioLang, type BioSource, type BioTrainerResponse, type BioTrainerView,
} from "@/lib/human-design/education/biography/biographyContract";
import type { EduCatalogSourceView } from "@/lib/human-design/education/educationContract";

const ROLE_LABEL: Record<string, string> = { birth_time: "Doğum saati belgesi", date_place: "Tarih / yer", utc_standard: "Saat standardı kanıtı", extra: "Ek kaynak" };
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export function fmtBioDate(d: string): string {
  const [y, m, g] = d.split("-");
  if (g) return `${Number(g)} ${MONTHS[Number(m) - 1]} ${y}`;
  if (m) return `${MONTHS[Number(m) - 1]} ${y}`;
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
  return (
    <>
      {ids.filter((id) => nums.has(id)).map((id) => (
        <button key={id} type="button" className={css.cite} onClick={() => onCite(id)} aria-label={`Kaynak ${nums.get(id)}`} data-bio-cite={id}>
          {nums.get(id)}
        </button>
      ))}
    </>
  );
}

export function BiographyTab({ state, lang, onLang, onCite, onAddNote, displayName }: {
  state: BioState; lang: BioLang; onLang: (l: BioLang) => void; onCite: (id: string) => void; onAddNote: (text: string) => void; displayName: string;
}) {
  const [focusEv, setFocusEv] = useState<number | null>(null);
  if (state.kind === "loading") return <section className={`${base.panel} ${css.state}`} aria-busy="true" data-bio-state="loading"><p>Hayat hikâyesi yükleniyor…</p></section>;
  if (state.kind === "error") return <p className={base.err} role="alert" data-bio-state="error">Hayat hikâyesi şu anda yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.</p>;
  const { data } = state;
  const other = data.availableLangs.filter((l) => l !== lang);
  if (!data.biography) {
    return (
      <section className={`${base.panel} ${css.state}`} data-bio-state={data.availableLangs.length ? "lang-missing" : "none"}>
        <h2 className={css.stateTitle}>{data.availableLangs.length ? `${BIO_LANG_LABEL[lang]} hayat hikâyesi henüz hazır değil` : "Hayat hikâyesi henüz yayımlanmadı"}</h2>
        <p className={css.small}>
          {data.availableLangs.length
            ? "Bu dilde doğrulanmış bir metin yok; otomatik çeviri gösterilmez."
            : `${displayName} için kaynaklı hayat hikâyesi platform yönetimi tarafından hazırlanıp yayımlandığında burada görünür.`}
        </p>
        {other.length ? (
          <div className={css.langRow} style={{ justifyContent: "center", marginTop: 12 }}>
            {other.map((l) => <button key={l} type="button" className={`${base.btn} ${base.ghost}`} onClick={() => onLang(l)} data-bio-lang-switch={l}>{BIO_LANG_LABEL[l]} sürümünü aç</button>)}
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
  const nums = useMemo(() => sourceNumbers(bio.sources), [bio.sources]);
  const years = useMemo(() => {
    const seen = new Set<string>();
    return bio.timeline.map((e, i) => ({ y: e.date.slice(0, 4), i })).filter((x) => (seen.has(x.y) ? false : (seen.add(x.y), true)));
  }, [bio.timeline]);
  const go = (domId: string) => document.getElementById(domId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const jumpEvent = (i: number) => { setFocusEv(i); go(`bio-ev-${i}`); };
  const meta: Array<[string, string | null]> = [["Yaşam", bio.lifeSpan], ["Meslek", bio.profession], ["Ülke", bio.country], ["Dönem", bio.era]];

  return (
    <div className={css.story} data-bio-state="ok" data-bio-lang={bio.lang}>
      <div className={css.storyMain}>
        <section className={`${base.panel} ${css.intro}`} aria-labelledby="bio-name">
          <p className={base.eyebrow} style={{ margin: 0 }}>HAYAT HİKÂYESİ</p>
          <h2 id="bio-name" className={css.introName}>{bio.displayName}</h2>
          <ul className={css.introMeta}>
            {meta.filter(([, v]) => !!v).map(([k, v]) => <li key={k}><b>{k}:</b> {v}</li>)}
          </ul>
          {bio.knownFor ? <p className={css.small} style={{ marginTop: 6 }}><b>Tanındığı alan:</b> {bio.knownFor}</p> : null}
          <p className={css.introText} data-bio-intro>{bio.shortIntro}</p>
          <p className={css.factNote} data-bio-disclaimer>
            Bu bölüm kaynaklardan derlenmiş biyografik olgulardır; Human Design yorumu değildir. Bir yaşam olayı, haritanın bilimsel kanıtı
            olarak sunulmaz. Karşılaştırma ve yorum eğitmene aittir.
          </p>
          {bio.neutralityNote ? <p className={css.small} data-bio-neutrality>{bio.neutralityNote}</p> : null}
        </section>

        {bio.sections.map((s) => (
          <section key={s.key} id={`bio-sec-${s.key}`} className={`${base.panel} ${css.section}`} aria-labelledby={`bio-h-${s.key}`} data-bio-section={s.key}>
            <h3 id={`bio-h-${s.key}`} className={css.sectionTitle}>{s.title || BIO_SECTION_LABEL[s.key]}</h3>
            {s.paragraphs.map((p, j) => (
              <p key={j} className={css.para}>{p.text}<Cites ids={p.sourceIds} nums={nums} onCite={onCite} /></p>
            ))}
          </section>
        ))}

        {bio.timeline.length ? (
          <section id="bio-timeline" className={`${base.panel} ${css.tlPanel}`} aria-labelledby="bio-tl-h" data-bio-timeline>
            <h3 id="bio-tl-h" className={css.sectionTitle}>Önemli Yaşam Olayları · Zaman Çizelgesi</h3>
            <p className={css.small} style={{ marginTop: 0 }}>Bir yıla dokunarak olaya gidin. &quot;Notlarıma ekle&quot; olayı yalnız sizin eğitim notlarınıza taşır.</p>
            {years.length > 1 ? (
              <div className={css.tlJump} role="group" aria-label="Yıla git">
                {years.map((x) => <button key={x.y} type="button" className={css.tlJumpBtn} onClick={() => jumpEvent(x.i)} data-bio-jump={x.y}>{x.y}</button>)}
              </div>
            ) : null}
            <ol className={css.tl}>
              {bio.timeline.map((e, i) => (
                <li key={i} id={`bio-ev-${i}`} className={css.tlItem} data-bio-event={e.date}>
                  <span className={css.tlYear} aria-hidden>{e.date.slice(0, 4)}</span>
                  <div className={`${css.tlBody} ${focusEv === i ? css.tlFocus : ""}`}>
                    {e.date.length > 4 ? <span className={css.tlDate}>{fmtBioDate(e.date)}</span> : null}
                    <p className={css.tlTitle}>{e.title}</p>
                    {e.text ? <p className={css.tlText}>{e.text}</p> : null}
                    <div className={css.tlActions}>
                      <Cites ids={e.sourceIds} nums={nums} onCite={onCite} />
                      <button type="button" className={css.noteBtn} onClick={() => onAddNote(`${fmtBioDate(e.date)} — ${e.title}${e.text ? `: ${e.text}` : ""}`)} data-bio-add-note={i}>
                        Notlarıma ekle
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

      <aside className={css.storyAside} aria-label="Hayat hikâyesi gezinme">
        <section className={`${base.panel} ${css.aside} ${css.asideToc}`}>
          <p className={css.asideTitle}>Bölümler</p>
          <ul className={css.toc}>
            {bio.sections.map((s) => <li key={s.key}><button type="button" className={css.tocBtn} onClick={() => go(`bio-sec-${s.key}`)}>{s.title || BIO_SECTION_LABEL[s.key]}</button></li>)}
            {bio.timeline.length ? <li><button type="button" className={css.tocBtn} onClick={() => go("bio-timeline")}>Zaman çizelgesi</button></li> : null}
          </ul>
        </section>
        <section className={`${base.panel} ${css.aside}`}>
          <p className={css.asideTitle}>Dil</p>
          <div className={css.langRow} role="group" aria-label="Hayat hikâyesi dili">
            {(["tr", "en"] as BioLang[]).map((l) => (
              <button key={l} type="button" className={`${css.langBtn} ${lang === l ? css.langOn : ""}`} aria-pressed={lang === l} onClick={() => onLang(l)} data-bio-lang={l}>
                {BIO_LANG_LABEL[l]}{langs.includes(l) ? "" : " · hazır değil"}
              </button>
            ))}
          </div>
          <p className={css.small}>Sürüm {bio.revision} · güncelleme {new Date(bio.updatedAt).toLocaleDateString("tr-TR")}</p>
        </section>
      </aside>
    </div>
  );
}

export function SourcesTab({ birthSources, documentQuote, calendarNote, bio, focusSource }: {
  birthSources: EduCatalogSourceView[]; documentQuote: string; calendarNote: string | null; bio: BioTrainerView | null; focusSource: string | null;
}) {
  const nums = bio ? sourceNumbers(bio.sources) : new Map<string, number>();
  return (
    <div className={css.srcGrid} style={{ marginTop: 16 }} data-bio-sources-tab>
      <section className={base.panel} style={{ marginTop: 0 }} aria-labelledby="src-birth">
        <h2 id="src-birth" className={base.h2}>Doğum verisi kaynakları</h2>
        <dl className={base.dl} style={{ marginTop: 10 }}>
          <dt>Belge ifadesi</dt><dd className={base.quote}>{documentQuote}</dd>
          {calendarNote ? (<><dt>Takvim notu</dt><dd>{calendarNote}</dd></>) : null}
        </dl>
        <ul className={base.srcList} style={{ marginTop: 12 }}>
          {birthSources.length ? birthSources.map((s, i) => (
            <li key={i}>
              <b>{ROLE_LABEL[s.role] ?? "Kaynak"}</b>
              <a className={base.ext} href={safeHref(s.url)} target="_blank" rel="noopener noreferrer nofollow">{s.institution ?? s.documentTitle ?? "Belgeyi görüntüle"}</a>
              <small>{[s.documentTitle && s.institution ? s.documentTitle : null, s.archiveRef, s.documentDate, s.primarySecondary ? `${s.primarySecondary} kaynak` : null, s.timeExplicit ? "saat belgede açık" : null, s.license ? `lisans: ${s.license}` : null].filter(Boolean).join(" · ")}</small>
              {s.seenHow ? <small data-edu-seen-how>Belge nasıl görüldü: {s.seenHow}</small> : null}
            </li>
          )) : <li>Kaynak kaydı yok.</li>}
        </ul>
      </section>
      <section className={base.panel} style={{ marginTop: 0 }} aria-labelledby="src-bio">
        <h2 id="src-bio" className={base.h2}>Hayat hikâyesi kaynakları</h2>
        {bio ? (
          <>
            <ol className={css.srcItems}>
              {bio.sources.map((s) => (
                <li key={s.id} id={`bio-src-${s.id}`} className={`${css.srcItem} ${focusSource === s.id ? css.srcFocus : ""}`} data-bio-source={s.id}>
                  <span className={css.srcNo}>{nums.get(s.id)}</span>
                  <span className={css.srcBody}>
                    <a className={base.ext} href={safeHref(s.url)} target="_blank" rel="noopener noreferrer nofollow">{s.title}</a>
                    <small>{[s.publisher, BIO_SOURCE_KIND_LABEL[s.kind] ?? s.kind, s.revisionId ? `sayfa sürümü ${s.revisionId}` : null, s.accessedOn ? `erişim ${s.accessedOn}` : null, s.license].filter(Boolean).join(" · ")}</small>
                  </span>
                </li>
              ))}
            </ol>
            <div className={css.licBox} data-bio-license>
              <b>Lisans ve atıf.</b>{" "}
              {bio.licenseInfo.directQuotes || bio.licenseInfo.adaptedText
                ? "Bu metinde Vikipedi içeriğinden alıntı veya uyarlama bulunur; ilgili kısımlar CC BY-SA 4.0 lisansı ve aynı lisansla paylaşım koşuluna tabidir."
                : "Metin, aşağıdaki kaynaklardaki olgular karşılaştırılarak özgün olarak yazılmıştır; Vikipedi metni kopyalanmamış veya çevrilmemiştir."}
              {bio.licenseInfo.articles.length ? (
                <ul>
                  {bio.licenseInfo.articles.map((a, i) => (
                    <li key={i}>
                      <a className={base.ext} href={safeHref(a.url)} target="_blank" rel="noopener noreferrer nofollow">{a.title}</a>
                      {" "}({a.lang.toUpperCase()} Vikipedi{a.oldid ? `, sürüm ${a.oldid}` : ""}) · Vikipedi katkıcıları ·{" "}
                      <a className={base.ext} href="https://creativecommons.org/licenses/by-sa/4.0/deed.tr" target="_blank" rel="noopener noreferrer nofollow">CC BY-SA 4.0</a>
                    </li>
                  ))}
                </ul>
              ) : null}
              {bio.licenseInfo.note ? <p className={css.small}>{bio.licenseInfo.note}</p> : null}
            </div>
          </>
        ) : (
          <p className={css.small} data-bio-sources-empty>Bu kişi için yayımlanmış hayat hikâyesi kaynağı yok.</p>
        )}
      </section>
    </div>
  );
}
