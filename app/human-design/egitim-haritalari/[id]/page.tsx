"use client";

/**
 * Hazır Eğitim Haritaları — EĞİTMEN KİŞİ AYRINTISI (FAZ 2-B3). Owner görsel PASS prototipi: detayView; prototipteki temsilî
 * BodyGraph yer tutucusu YERİNE mevcut onaylı bileşen (HdComputedChartView — kişisel harita ekranıyla aynı; çizim DEĞİŞMEZ).
 * Veri: owner'ın doğruladığı KAYITLI snapshot (sunucu: getPublishedDetail). Açılışta sağlayıcı çağrısı / yeniden hesap YOK;
 * danışan kaydı, Danışan Yolculuğu veya kişisel HD analizi YAZILMAZ. Yayımlı değil / kaldırılmış / hatalı kimlik /
 * yetkisiz → tek tip "Sayfa bulunamadı".
 */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useEduLabel } from "@/app/human-design/egitim-merkezi/_ui/labels";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/egitimKatalog.module.css";
import hh from "@/app/_premium/hd-education/hayatHikayesi.module.css";
// Owner kararı 30.10.2026: owner ekranındaki büyük BodyGraph görüntüleyicisi (aynı çizici bileşenler; hesap / snapshot DEĞİŞMEZ).
import { EduBodygraphViewer, EduChartFacts } from "@/app/admin/hd-egitim-haritalari/EduBodygraphViewer";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import { EDU_CATEGORY_LABEL, type EduCatalogDetail } from "@/lib/human-design/education/educationContract";
import { parseBioLang, type BioLang, type BioTrainerResponse } from "@/lib/human-design/education/biography/biographyContract";
import { catalogGet, fmtCalendarDate } from "../catalogApi";
import { EduLoading, EduNotFound, EduShell } from "../EduShell";
import { EvidenceTag } from "../EvidenceTag";
import { birthTimeSeenHow, splitTimeStandard } from "@/lib/human-design/education/birthEvidence";
import { putNoteHandoff } from "../noteHandoff";
import { BiographyTab, SourcesTab, type BioState } from "./_hayat/BiographyViews";

// FAZ 10: üç sekme — HD haritası (mevcut içerik AYNEN) · Hayat Hikâyesi · Kaynaklar. Sekme adreste (?sekme=) tutulur.
type Tab = "harita" | "hayat" | "kaynaklar";
// Sekme adları katalogdan: hd.education.detail.tab.<id> (uzun) / tabShort.<id> (kısa).
const TABS: Tab[] = ["harita", "hayat", "kaynaklar"];
const readTab = (): Tab => {
  if (typeof window === "undefined") return "harita";
  const t = new URLSearchParams(window.location.search).get("sekme");
  return t === "hayat" || t === "kaynaklar" ? t : "harita";
};
const fmtTime = (iso: string | null, tag = "tr-TR") => (iso ? new Date(iso).toLocaleString(tag, { dateStyle: "short", timeStyle: "short" }) : "—");
function fmtOffset(sec: number | null): string {
  if (sec === null) return "—";
  const a = Math.abs(sec);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${sec < 0 ? "−" : "+"}${p(Math.floor(a / 3600))}:${p(Math.floor((a % 3600) / 60))}:${p(a % 60)}`;
}

export default function EducationChartDetailPage() {
  const params = useParams<{ id: string }>();
  const id = String(params?.id ?? "");
  const [d, setD] = useState<EduCatalogDetail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("hd.education");
  const label = useEduLabel();
  const dateTag = locale === "tr" ? "tr-TR" : "en-GB";
  // İlk render'da veri yüklenirken yalnız "yükleniyor" çizilir; sekme adresten tembel okunur (hidrasyon farkı oluşmaz).
  const [tab, setTabState] = useState<Tab>(readTab);
  const [lang, setLang] = useState<BioLang>(parseBioLang(locale) ?? "tr");
  const [bio, setBio] = useState<Record<string, BioState>>({});
  const [focusSource, setFocusSource] = useState<string | null>(null);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    try {
      const u = new URL(window.location.href);
      if (t === "harita") u.searchParams.delete("sekme"); else u.searchParams.set("sekme", t);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch { /* adres güncellenemedi: sekme yine değişir */ }
  }, []);
  // Biyografi yalnız gerektiğinde (Hayat Hikâyesi / Kaynaklar sekmesi) ve dil başına bir kez yüklenir.
  const bioKey = `${lang}`;
  const bioState = bio[bioKey];
  const inflight = useRef(new Set<string>());
  useEffect(() => {
    if (state !== "ok" || tab === "harita" || bioState || inflight.current.has(bioKey)) return;
    inflight.current.add(bioKey);
    void catalogGet(`/api/hd/education/charts/${encodeURIComponent(id)}/biography?lang=${lang}`, (b) => (Array.isArray(b.availableLangs) ? (b as unknown as BioTrainerResponse) : undefined)).then((r) => {
      inflight.current.delete(bioKey);
      setBio((b) => ({ ...b, [bioKey]: r.ok ? { kind: "ok", data: r.data } : { kind: "error" } }));
    });
  }, [state, tab, bioState, bioKey, id, lang]);
  // FAZ 19: hata sonrası yeniden deneme — yalnız bu dilin durumu silinir; etki yeniden yükler.
  const retryBio = useCallback(() => setBio((b) => { const n = { ...b }; delete n[bioKey]; return n; }), [bioKey]);
  const onCite = useCallback((sid: string) => {
    setFocusSource(sid);
    setTab("kaynaklar");
    window.setTimeout(() => document.getElementById(`bio-src-${sid}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }, [setTab]);
  const onAddNote = useCallback((text: string) => {
    putNoteHandoff(id, text);
    router.push(`/human-design/egitim-haritalari/${encodeURIComponent(id)}/calisma-alani`);
  }, [id, router]);

  useEffect(() => {
    let live = true;
    void catalogGet(`/api/hd/education/charts/${encodeURIComponent(id)}`, (b) => (b.item && typeof b.item === "object" ? (b.item as EduCatalogDetail) : undefined)).then((r) => {
      if (!live) return;
      if (r.ok) { setD(r.data); setState("ok"); } else setState(r.notFound ? "notfound" : "error");
    });
    return () => { live = false; };
  }, [id]);

  if (state === "loading") return <EduLoading />;
  if (state === "notfound") return <EduNotFound />;
  if (state === "error" || !d) {
    return <EduShell><p className={base.err} role="alert">{t("ws.loadError")}</p></EduShell>;
  }

  const ts = splitTimeStandard(d.timeStandard);
  const seenHow = birthTimeSeenHow(d.sources);

  return (
    <EduShell>
      <Link className={css.back} href="/human-design/egitim-haritalari">{t("cat.back")}</Link>
      <header className={css.dHead} aria-labelledby="edu-detail-title">
        <div>
          <span className={css.cKat}>{label("eduCategory", d.category, EDU_CATEGORY_LABEL[d.category] ?? d.category)}</span>
          <h1 id="edu-detail-title" className={css.dTitle}>{d.displayName}</h1>
          <p className={css.sub2}>{fmtCalendarDate(d.birthDate)} · {d.documentedLocalTime}{t("cat.docTimeSuffix")} · {d.birthPlace}</p>
        </div>
        <span className={css.cTags}>
          <EvidenceTag value={d.birthTimeEvidence} />
          <span className={`${base.tag} ${base.tOk}`}>{t("cdetail.utcVerified")}</span>
          <Link className={`${base.btn} ${base.save}`} style={{ minHeight: 44 }} href={`/human-design/egitim-haritalari/${encodeURIComponent(d.id)}/calisma-alani`} data-edu-workspace>{t("detail.openWorkspace")}</Link>
        </span>
      </header>

      <nav className={hh.tabbar} role="tablist" aria-label={t("cdetail.tabsAria")}>
        {TABS.map((id) => (
          <button key={id} type="button" role="tab" id={`edu-tab-${id}`} aria-selected={tab === id} aria-controls={`edu-panel-${id}`}
            className={`${hh.tabBtn} ${tab === id ? hh.tabOn : ""}`} onClick={() => setTab(id)} data-edu-tab={id} aria-label={t(`cdetail.tab.${id}`)}>
            <span className={hh.tabLong}>{t(`cdetail.tab.${id}`)}</span><span className={hh.tabShort}>{t(`cdetail.tabShort.${id}`)}</span>
          </button>
        ))}
      </nav>

      <div id="edu-panel-harita" role="tabpanel" aria-labelledby="edu-tab-harita" hidden={tab !== "harita"}>
      <section className={`${base.panel} ${css.chartPanel}`} aria-label={t("detail.chartAria")}>
        <EduBodygraphViewer result={d.chart.result as unknown as HdComputedChart} roxyRender={d.chart.render} title={d.displayName} />
        <EduChartFacts result={d.chart.result as unknown as HdComputedChart} />
      </section>

      <div className={css.below}>
        <section className={base.panel} aria-labelledby="edu-src">
          <h2 id="edu-src" className={base.h2}>{t("cdetail.birthSources")}</h2>
          <dl className={base.dl} style={{ marginTop: 10 }}>
            <dt>{t("cdetail.docQuote")}</dt><dd className={base.quote}>{d.documentQuote}</dd>
            {d.calendarNote ? (<><dt>{t("cdetail.calNote")}</dt><dd>{d.calendarNote}</dd></>) : null}
            {seenHow ? (<><dt>{t("cdetail.seenHow")}</dt><dd data-edu-seen-how>{seenHow}</dd></>) : null}
          </dl>
          <ul className={base.srcList} style={{ marginTop: 12 }}>
            {d.sources.length ? d.sources.map((s, i) => (
              <li key={i}>
                <b>{t.has(`cdetail.srcRole.${s.role}`) ? t(`cdetail.srcRole.${s.role}`) : t("cdetail.srcRole.other")}</b>
                <a className={base.ext} href={s.url} target="_blank" rel="noopener noreferrer">{s.institution ?? s.documentTitle ?? t("cdetail.viewDoc")}</a>
                <small>{[s.documentTitle && s.institution ? s.documentTitle : null, s.archiveRef, s.documentDate, s.primarySecondary ? (t.has(`cdetail.ps.${s.primarySecondary}`) ? t(`cdetail.ps.${s.primarySecondary}`) : `${s.primarySecondary} kaynak`) : null, s.timeExplicit ? t("cdetail.timeExplicit") : null, s.license ? t("cdetail.license", { license: s.license }) : null].filter(Boolean).join(" · ")}</small>
              </li>
            )) : <li>{t("cdetail.noSources")}</li>}
          </ul>
        </section>
        <section className={base.panel} aria-labelledby="edu-utc">
          <h2 id="edu-utc" className={base.h2}>{t("cdetail.timeUtc")}</h2>
          <dl className={base.dl} style={{ marginTop: 10 }}>
            <dt>{t("cdetail.docLocalTime")}</dt><dd>{d.documentedLocalTime}</dd>
            <dt>{t("cdetail.timeStd")}</dt><dd data-edu-time-standard>{ts.standard ?? "—"}</dd>
            {ts.sensitivity ? (<><dt>{t("cdetail.sensitivity")}</dt><dd data-edu-sensitivity>{ts.sensitivity}</dd></>) : null}
            <dt>{t("cdetail.offset")}</dt><dd>{fmtOffset(d.utcOffsetSeconds)}</dd>
            <dt>{t("cdetail.utcMoment")}</dt><dd>{d.birthUtc}</dd>
            {d.latitude !== null && d.longitude !== null ? (<><dt>{t("cdetail.coords")}</dt><dd>{d.latitude}, {d.longitude}</dd></>) : null}
            <dt>{t("cdetail.method")}</dt><dd>{d.utcMethodology}</dd>
          </dl>
        </section>
      </div>

      <section className={`${base.panel} ${css.lowBand}`} aria-label={t("detail.usageAria")}>
        <p>{t("cdetail.usage1", { version: String(d.chart.version), at: fmtTime(d.chart.computedAt, dateTag) })}</p>
        <p>{t("cdetail.usage2")}</p>
        <p>{t("cdetail.usage3")}</p>
      </section>
      </div>

      <div id="edu-panel-hayat" role="tabpanel" aria-labelledby="edu-tab-hayat" hidden={tab !== "hayat"}>
        {tab === "hayat" ? (
          <BiographyTab state={bioState ?? { kind: "loading" }} lang={lang} onLang={setLang} onCite={onCite} onAddNote={onAddNote} displayName={d.displayName} onRetry={retryBio} />
        ) : null}
      </div>

      <div id="edu-panel-kaynaklar" role="tabpanel" aria-labelledby="edu-tab-kaynaklar" hidden={tab !== "kaynaklar"}>
        {tab === "kaynaklar" ? (
          <SourcesTab birthSources={d.sources} documentQuote={d.documentQuote} calendarNote={d.calendarNote}
            bio={bioState?.kind === "ok" ? bioState.data.biography : null} focusSource={focusSource}
            bioStatus={bioState?.kind === "error" ? "error" : bioState?.kind === "ok" ? "ok" : "loading"} onRetry={retryBio} />
        ) : null}
      </div>
    </EduShell>
  );
}
