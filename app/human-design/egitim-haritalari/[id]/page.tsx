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
import { useLocale } from "next-intl";
import base from "@/app/_premium/hd-education/egitimYonetim.module.css";
import css from "@/app/_premium/hd-education/egitimKatalog.module.css";
import hh from "@/app/_premium/hd-education/hayatHikayesi.module.css";
import { HdComputedChartView } from "@/app/human-design/kayitli-haritalar/components/HdComputedChartView";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import { EDU_CATEGORY_LABEL, type EduCatalogDetail } from "@/lib/human-design/education/educationContract";
import { parseBioLang, type BioLang, type BioTrainerResponse } from "@/lib/human-design/education/biography/biographyContract";
import { catalogGet, fmtCalendarDate } from "../catalogApi";
import { EduLoading, EduNotFound, EduShell } from "../EduShell";
import { EvidenceTag } from "../EvidenceTag";
import { birthTimeSeenHow, splitTimeStandard } from "@/lib/human-design/education/birthEvidence";
import { putNoteHandoff } from "../noteHandoff";
import { BiographyTab, SourcesTab, type BioState } from "./_hayat/BiographyViews";

const ROLE_LABEL: Record<string, string> = { birth_time: "Doğum saati belgesi", date_place: "Tarih / yer", utc_standard: "Saat standardı kanıtı", extra: "Ek kaynak" };
// FAZ 10: üç sekme — HD haritası (mevcut içerik AYNEN) · Hayat Hikâyesi · Kaynaklar. Sekme adreste (?sekme=) tutulur.
type Tab = "harita" | "hayat" | "kaynaklar";
const TABS: Array<{ id: Tab; label: string; short: string }> = [
  { id: "harita", label: "Human Design Haritası", short: "HD Haritası" },
  { id: "hayat", label: "Hayat Hikâyesi", short: "Hayat Hikâyesi" },
  { id: "kaynaklar", label: "Kaynaklar", short: "Kaynaklar" },
];
const readTab = (): Tab => {
  if (typeof window === "undefined") return "harita";
  const t = new URLSearchParams(window.location.search).get("sekme");
  return t === "hayat" || t === "kaynaklar" ? t : "harita";
};
const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "—");
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
    return <EduShell><p className={base.err} role="alert">Harita şu anda yüklenemedi. Bağlantınızı kontrol edip sayfayı yenileyin.</p></EduShell>;
  }

  const ts = splitTimeStandard(d.timeStandard);
  const seenHow = birthTimeSeenHow(d.sources);

  return (
    <EduShell>
      <Link className={css.back} href="/human-design/egitim-haritalari">← Hazır Eğitim Haritaları</Link>
      <header className={css.dHead} aria-labelledby="edu-detail-title">
        <div>
          <span className={css.cKat}>{EDU_CATEGORY_LABEL[d.category] ?? d.category}</span>
          <h1 id="edu-detail-title" className={css.dTitle}>{d.displayName}</h1>
          <p className={css.sub2}>{fmtCalendarDate(d.birthDate)} · {d.documentedLocalTime} (belgedeki yerel saat) · {d.birthPlace}</p>
        </div>
        <span className={css.cTags}>
          <EvidenceTag value={d.birthTimeEvidence} />
          <span className={`${base.tag} ${base.tOk}`}>UTC doğrulandı</span>
          <Link className={`${base.btn} ${base.save}`} style={{ minHeight: 44 }} href={`/human-design/egitim-haritalari/${encodeURIComponent(d.id)}/calisma-alani`} data-edu-workspace>Çalışma alanını aç</Link>
        </span>
      </header>

      <nav className={hh.tabbar} role="tablist" aria-label="Harita bölümleri">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`edu-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`edu-panel-${t.id}`}
            className={`${hh.tabBtn} ${tab === t.id ? hh.tabOn : ""}`} onClick={() => setTab(t.id)} data-edu-tab={t.id} aria-label={t.label}>
            <span className={hh.tabLong}>{t.label}</span><span className={hh.tabShort}>{t.short}</span>
          </button>
        ))}
      </nav>

      <div id="edu-panel-harita" role="tabpanel" aria-labelledby="edu-tab-harita" hidden={tab !== "harita"}>
      <section className={`${base.panel} ${css.chartPanel}`} aria-label="BodyGraph ve harita bilgileri">
        <HdComputedChartView result={d.chart.result as unknown as HdComputedChart} roxyRender={d.chart.render} showProviderNote={false} />
      </section>

      <div className={css.below}>
        <section className={base.panel} aria-labelledby="edu-src">
          <h2 id="edu-src" className={base.h2}>Doğum verisi ve kaynaklar</h2>
          <dl className={base.dl} style={{ marginTop: 10 }}>
            <dt>Belge ifadesi</dt><dd className={base.quote}>{d.documentQuote}</dd>
            {d.calendarNote ? (<><dt>Takvim notu</dt><dd>{d.calendarNote}</dd></>) : null}
            {seenHow ? (<><dt>Belge nasıl görüldü</dt><dd data-edu-seen-how>{seenHow}</dd></>) : null}
          </dl>
          <ul className={base.srcList} style={{ marginTop: 12 }}>
            {d.sources.length ? d.sources.map((s, i) => (
              <li key={i}>
                <b>{ROLE_LABEL[s.role] ?? "Kaynak"}</b>
                <a className={base.ext} href={s.url} target="_blank" rel="noopener noreferrer">{s.institution ?? s.documentTitle ?? "Belgeyi görüntüle"}</a>
                <small>{[s.documentTitle && s.institution ? s.documentTitle : null, s.archiveRef, s.documentDate, s.primarySecondary ? `${s.primarySecondary} kaynak` : null, s.timeExplicit ? "saat belgede açık" : null, s.license ? `lisans: ${s.license}` : null].filter(Boolean).join(" · ")}</small>
              </li>
            )) : <li>Kaynak kaydı yok.</li>}
          </ul>
        </section>
        <section className={base.panel} aria-labelledby="edu-utc">
          <h2 id="edu-utc" className={base.h2}>Saat ve UTC</h2>
          <dl className={base.dl} style={{ marginTop: 10 }}>
            <dt>Belgedeki yerel saat</dt><dd>{d.documentedLocalTime}</dd>
            <dt>Saat standardı</dt><dd data-edu-time-standard>{ts.standard ?? "—"}</dd>
            {ts.sensitivity ? (<><dt>Harita duyarlılığı</dt><dd data-edu-sensitivity>{ts.sensitivity}</dd></>) : null}
            <dt>Ofset</dt><dd>{fmtOffset(d.utcOffsetSeconds)}</dd>
            <dt>UTC anı</dt><dd>{d.birthUtc}</dd>
            {d.latitude !== null && d.longitude !== null ? (<><dt>Koordinat</dt><dd>{d.latitude}, {d.longitude}</dd></>) : null}
            <dt>Metodoloji</dt><dd>{d.utcMethodology}</dd>
          </dl>
        </section>
      </div>

      <section className={`${base.panel} ${css.lowBand}`} aria-label="Kullanım bilgisi">
        <p>Bu harita platform yönetimi tarafından doğrulanmış kayıtlı hesap sonucudur (sürüm v{d.chart.version} · {fmtTime(d.chart.computedAt)}). Açılışta yeniden hesaplama yapılmaz.</p>
        <p>Dört Ok / PHS bu eğitim haritasında yer almıyor. Bu ekran danışan kaydı oluşturmaz.</p>
        <p>Eğitim amaçlıdır; kişi, mirasçıları veya hak sahipleriyle herhangi bir ticari bağlantı, sponsorluk ya da onay ilişkisi yoktur.</p>
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
