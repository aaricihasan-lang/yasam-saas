"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { isMobileViewport, resolveViewerControls } from "../helpers/mobileUxLogic";
import {
  GorselRaporInfografik,
  type GorselTemaId,
} from "./NumerolojiGorselRaporInfografik";
import { TabSonucOzeti, TabAnalizOzetli, TabPlainAnaliz, TabTasAtamalari } from "./NumerolojiAnalizSonucTabs";
import { NumerolojiIliskiAnaliziTab } from "./NumerolojiIliskiAnaliziTab";
import { NumerolojiZamanlamaGelisimTab } from "./NumerolojiZamanlamaGelisimTab";
import { NumerolojiEvIsYeriSayisiTab } from "./NumerolojiEvIsYeriSayisiTab";
import {
  ContentFontSizeProvider,
  NumerolojiFontSizeControl,
  useContentTypography,
  type ContentFontSize,
} from "./numerolojiContentTypography";
import { gorselRaporuPngYakalaVeIndir } from "../gorselRaporExport";
import {
  resolveNumerolojiTenantId,
  updateNumerologyAnalysisGorsel,
} from "../helpers/numerolojiKayit";
import type { NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";
import { ChronoRecordProvider } from "../hooks/ChronoRecordContext";
import {
  extractGorselFromAnalysisData,
  extractTasFromAnalysisData,
  formatVirgulluTasGirdi,
  kayitBolumYokMesaji,
  type AnalysisGorselData,
  type AnalysisTasData,
} from "../utils/analysisJson";

const GORSEL_BASE_W = 1400;

function GorselScalePreview({
  out,
  isimGoster,
  dogumGoster,
  firstName,
  lastName,
  temaId,
  uzmanAdi,
  gorselTaslariGoster,
  tasBileklik,
  tasKolye,
  tasKutle,
}: {
  out: NumerolojiMotorOut;
  isimGoster: string;
  dogumGoster: string;
  firstName: string;
  lastName: string;
  temaId: GorselTemaId;
  uzmanAdi: string;
  gorselTaslariGoster: boolean;
  tasBileklik: string;
  tasKolye: string;
  tasKutle: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scaledH, setScaledH] = useState<number | undefined>(undefined);

  useEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;

    let sc = 1;
    let ih = 0;

    const wObs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) {
        sc = Math.min(1, w / GORSEL_BASE_W);
        setScale(sc);
        if (ih > 0) setScaledH(Math.ceil(ih * sc));
      }
    });

    const iObs = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 0) {
        ih = h;
        setScaledH(Math.ceil(h * sc));
      }
    });

    wObs.observe(wrap);
    iObs.observe(inner);
    return () => {
      wObs.disconnect();
      iObs.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="min-w-0 w-full overflow-hidden"
      style={{ height: scaledH }}
    >
      <div
        ref={innerRef}
        style={{
          width: GORSEL_BASE_W,
          transformOrigin: "top left",
          transform: `scale(${scale})`,
        }}
      >
        <GorselRaporInfografik
          out={out}
          isimGoster={isimGoster}
          dogumGoster={dogumGoster}
          firstName={firstName}
          lastName={lastName}
          temaId={temaId}
          uzmanAdi={uzmanAdi}
          gorselTaslariGoster={gorselTaslariGoster}
          tasBileklik={tasBileklik}
          tasKolye={tasKolye}
          tasKutle={tasKutle}
        />
      </div>
    </div>
  );
}

// I18N: `id` sekme kodu (kontrol akışı bununla); etiket yalnız gösterim → katalog anahtarı.
const DETAY_TABS = [
  { id: "summary" as const, labelKey: "summary" },
  { id: "plain" as const, labelKey: "plain" },
  { id: "detailed" as const, labelKey: "detailed" },
  { id: "zamanlama" as const, labelKey: "zamanlama" },
  { id: "tas" as const, labelKey: "tas" },
  { id: "gorsel" as const, labelKey: "gorsel" },
  { id: "iliski" as const, labelKey: "iliski" },
  { id: "ev-is-yeri" as const, labelKey: "evIsYeri" },
];

type DetayTabId = (typeof DETAY_TABS)[number]["id"];

function KayitBosBolum({ children }: { children?: string }) {
  const typo = useContentTypography();
  return (
    <div className="min-w-0 rounded-xl border-2 border-dashed border-violet-200/80 bg-white/80 p-4 text-center shadow-[0_0_16px_rgba(139,92,246,0.08)]">
      <p className={`w-full px-3 py-3 ${typo.body}`}>{children ?? kayitBolumYokMesaji()}</p>
    </div>
  );
}

function TasKayitGorunum({ tas }: { tas: AnalysisTasData }) {
  const typo = useContentTypography();
  const t = useTranslations("numerology.result.detail");
  // Slot kodu (bileklik|kolye|kutle) kanonik; başlık yalnız gösterim.
  const kolonlar = [
    { slot: "bileklik", baslik: t("stones.bracelet"), metin: tas.bileklik },
    { slot: "kolye", baslik: t("stones.necklace"), metin: tas.kolye },
    { slot: "kutle", baslik: t("stones.mass"), metin: tas.kutle },
  ].filter((k) => k.metin && k.metin.trim());

  return (
    <div className="space-y-3">
      {kolonlar.length > 0 ? (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {kolonlar.map((k) => (
            <section
              key={k.slot}
              className="rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-sm ring-1 ring-violet-100/40"
            >
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">{k.baslik}</h3>
              <p className={`mt-2 ${typo.body} font-medium text-slate-800`}>{k.metin}</p>
            </section>
          ))}
        </div>
      ) : null}
      {tas.notlar ? (
        <section className="rounded-xl border border-amber-300/45 bg-white/80 p-3 shadow-[0_0_16px_rgba(245,158,11,0.08)]">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">{t("notes")}</h3>
          <p className={`mt-2 whitespace-pre-wrap ${typo.body} text-slate-800`}>{tas.notlar}</p>
        </section>
      ) : null}
    </div>
  );
}

function gorselDefaults(gorsel: AnalysisGorselData | null) {
  return {
    temaId: (gorsel?.temaId ?? "kozmikMor") as GorselTemaId,
    uzmanAdi: gorsel?.uzmanAdi ?? "",
    gorselTaslariGoster: gorsel?.gorselTaslariGoster ?? false,
    tasBileklik: gorsel?.tasBileklik ?? "",
    tasKolye: gorsel?.tasKolye ?? "",
    tasKutle: gorsel?.tasKutle ?? "",
  };
}

const kayitGorselInputClass =
  "h-9 w-full rounded-xl border border-violet-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-200/40";

const kayitGorselTextareaClass =
  "min-h-[70px] w-full resize-y rounded-xl border border-violet-200/80 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-200/40";

function KayitGorselKontrolPanel({
  gorselTaslariGoster,
  setGorselTaslariGoster,
  uzmanAdi,
  setUzmanAdi,
  tasBileklik,
  setTasBileklik,
  tasKolye,
  setTasKolye,
  tasKutle,
  setTasKutle,
  onKaydet,
  kayitGorselKaydediliyor,
  kayitGorselMesaj,
  kayitGorselBasarili,
  gorselPngHazirlaniyor,
  onPngIndir,
}: {
  gorselTaslariGoster: boolean;
  setGorselTaslariGoster: (value: boolean) => void;
  uzmanAdi: string;
  setUzmanAdi: (value: string) => void;
  tasBileklik: string;
  setTasBileklik: (value: string) => void;
  tasKolye: string;
  setTasKolye: (value: string) => void;
  tasKutle: string;
  setTasKutle: (value: string) => void;
  onKaydet: () => void;
  kayitGorselKaydediliyor: boolean;
  kayitGorselMesaj: string | null;
  /** Mesajın başarı/hata rengi metinden değil bu bayraktan (çevrilmiş metin kontrol akışına girmez). */
  kayitGorselBasarili: boolean;
  gorselPngHazirlaniyor: boolean;
  onPngIndir: () => void;
}) {
  const t = useTranslations("numerology.result.detail");
  return (
    <aside className="w-full space-y-2.5 py-1 md:rounded-[14px] md:border md:border-violet-200/70 md:bg-gradient-to-br md:from-white/95 md:via-violet-50/30 md:to-white/90 md:p-3 md:shadow-[0_8px_24px_-10px_rgba(91,33,182,0.18)] md:ring-1 md:ring-violet-100/55 lg:sticky lg:top-3">
      <p className="text-sm font-black tracking-wide text-violet-800">{t("visualSettings")}</p>

      <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
        <input
          type="checkbox"
          checked={gorselTaslariGoster}
          onChange={(e) => setGorselTaslariGoster(e.target.checked)}
          className="size-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
        />
        <span>{t("showStones")}</span>
      </label>

      <div>
        <label htmlFor="kayit-noj-uzman" className="mb-1 block text-xs font-bold text-slate-600">
          {t("expertName")}
        </label>
        <input
          id="kayit-noj-uzman"
          type="text"
          value={uzmanAdi}
          onChange={(e) => setUzmanAdi(e.target.value)}
          placeholder={t("expertPlaceholder")}
          className={kayitGorselInputClass}
          autoComplete="name"
        />
      </div>

      <div>
        <label htmlFor="kayit-noj-tas-bileklik" className="mb-1 block text-xs font-bold text-slate-600">
          {t("stones.bracelet")}
        </label>
        <textarea
          id="kayit-noj-tas-bileklik"
          value={tasBileklik}
          onChange={(e) => setTasBileklik(formatVirgulluTasGirdi(e.target.value))}
          rows={2}
          placeholder={t("stonesPlaceholder")}
          className={kayitGorselTextareaClass}
        />
      </div>

      <div>
        <label htmlFor="kayit-noj-tas-kolye" className="mb-1 block text-xs font-bold text-slate-600">
          {t("stones.necklace")}
        </label>
        <textarea
          id="kayit-noj-tas-kolye"
          value={tasKolye}
          onChange={(e) => setTasKolye(formatVirgulluTasGirdi(e.target.value))}
          rows={2}
          placeholder={t("stonesPlaceholder")}
          className={kayitGorselTextareaClass}
        />
      </div>

      <div>
        <label htmlFor="kayit-noj-tas-kutle" className="mb-1 block text-xs font-bold text-slate-600">
          {t("stones.mass")}
        </label>
        <textarea
          id="kayit-noj-tas-kutle"
          value={tasKutle}
          onChange={(e) => setTasKutle(formatVirgulluTasGirdi(e.target.value))}
          rows={2}
          placeholder={t("stonesPlaceholder")}
          className={kayitGorselTextareaClass}
        />
      </div>

      {kayitGorselMesaj ? (
        <p
          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
            kayitGorselBasarili
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60"
              : "bg-rose-50 text-rose-800 ring-1 ring-rose-200/60"
          }`}
          role="status"
        >
          {kayitGorselMesaj}
        </p>
      ) : null}

      <div className="space-y-1.5 pt-0.5">
        <button
          type="button"
          onClick={onKaydet}
          disabled={kayitGorselKaydediliyor || gorselPngHazirlaniyor}
          className="h-9 w-full rounded-xl border border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-3 text-sm font-black text-white shadow-[0_4px_14px_-4px_rgba(91,33,182,0.40)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {kayitGorselKaydediliyor ? t("saving") : t("save")}
        </button>
        {/* 2026-10-14: PNG İndir telefon genişliğinde ve Android uygulamasında da görünür. */}
        <button
          type="button"
          disabled={gorselPngHazirlaniyor || kayitGorselKaydediliyor}
          onClick={onPngIndir}
          className="block h-9 w-full rounded-xl border border-emerald-400/70 bg-gradient-to-r from-emerald-600 to-teal-600 px-3 text-sm font-black text-white shadow-[0_4px_14px_-4px_rgba(16,185,129,0.40)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {gorselPngHazirlaniyor ? t("preparing") : t("pngDownload")}
        </button>
      </div>
    </aside>
  );
}

export function NumerolojiKayitDetayPanel({
  out,
  name,
  surname,
  birthDate,
  analysisData,
  recordId,
  onAnalysisDataUpdate,
}: {
  out: NumerolojiMotorOut;
  name: string;
  surname: string;
  birthDate: string;
  analysisData: unknown;
  recordId: string;
  onAnalysisDataUpdate?: (analysisData: unknown) => void;
}) {
  const t = useTranslations("numerology.result.detail");
  const isSourceLocale = useLocale() === DEFAULT_LOCALE;
  const [tab, setTab] = useState<DetayTabId>("summary");
  const isimGoster = `${name} ${surname}`.replace(/\s+/g, " ").trim();
  const tas = extractTasFromAnalysisData(analysisData);
  const gorselKayit = extractGorselFromAnalysisData(analysisData);
  const gorsel = gorselDefaults(gorselKayit);

  const [gorselTema, setGorselTema] = useState<GorselTemaId>(gorsel.temaId);
  const [uzmanAdi, setUzmanAdi] = useState(gorsel.uzmanAdi);
  const [gorselTaslariGoster, setGorselTaslariGoster] = useState(gorsel.gorselTaslariGoster);
  const [tasBileklik, setTasBileklik] = useState(gorsel.tasBileklik);
  const [tasKolye, setTasKolye] = useState(gorsel.tasKolye);
  const [tasKutle, setTasKutle] = useState(gorsel.tasKutle);
  const [gorselPngHazirlaniyor, setGorselPngHazirlaniyor] = useState(false);
  const [kayitGorselKaydediliyor, setKayitGorselKaydediliyor] = useState(false);
  const [kayitGorselMesaj, setKayitGorselMesaj] = useState<string | null>(null);
  const [kayitGorselBasarili, setKayitGorselBasarili] = useState(false);
  const [contentFontSize, setContentFontSize] = useState<ContentFontSize>("normal");
  // NUM-MOB-1: mobil tam ekran görsel rapor viewer.
  const [tamEkran, setTamEkran] = useState(false);
  // NUM-MOB-2-FIX2: reaktif viewport → viewer kontrol kararı saf model üzerinden.
  const [viewportW, setViewportW] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1024));
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const viewerCtl = resolveViewerControls(viewportW);
  useEffect(() => {
    if (!tamEkran) return;
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTamEkran(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevBody;
      document.removeEventListener("keydown", onKey);
    };
  }, [tamEkran]);

  const isOkumaTab = tab === "summary" || tab === "plain" || tab === "detailed" || tab === "tas";
  const isIliskiTab = tab === "iliski";

  useEffect(() => {
    const next = gorselDefaults(extractGorselFromAnalysisData(analysisData));
    setGorselTema(next.temaId);
    setUzmanAdi(next.uzmanAdi);
    setGorselTaslariGoster(next.gorselTaslariGoster);
    setTasBileklik(next.tasBileklik);
    setTasKolye(next.tasKolye);
    setTasKutle(next.tasKutle);
    setKayitGorselMesaj(null);
  }, [recordId, analysisData]);

  async function handleGorselAyarKaydet() {
    setKayitGorselMesaj(null);
    setKayitGorselBasarili(false);
    setKayitGorselKaydediliyor(true);
    const tenantId = await resolveNumerolojiTenantId();
    if (!tenantId) {
      setKayitGorselKaydediliyor(false);
      setKayitGorselMesaj(t("noTenant"));
      return;
    }
    const gorselData: AnalysisGorselData = {
      temaId: gorselTema,
      uzmanAdi: uzmanAdi.trim(),
      gorselTaslariGoster,
      tasBileklik: tasBileklik.trim(),
      tasKolye: tasKolye.trim(),
      tasKutle: tasKutle.trim(),
    };
    const { error, analysis_data: updated } = await updateNumerologyAnalysisGorsel(
      recordId,
      tenantId,
      gorselData,
      analysisData,
    );
    setKayitGorselKaydediliyor(false);
    if (error) {
      // TR: yardımcı/sunucu metni birebir; EN: genel metin.
      setKayitGorselMesaj(isSourceLocale ? error : t("saveFailed"));
      return;
    }
    if (updated) onAnalysisDataUpdate?.(updated);
    setKayitGorselBasarili(true);
    setKayitGorselMesaj(t("saved"));
  }

  async function handleGorselPngIndir() {
    const el =
      document.querySelector<HTMLElement>("[data-gorsel-rapor-root]") ??
      document.getElementById("numeroloji-kayit-gorsel-rapor-png-root");
    if (!el) {
      alert(t("visualNotFound"));
      return;
    }
    try {
      setGorselPngHazirlaniyor(true);
      await gorselRaporuPngYakalaVeIndir(el, t("pngFileName"));
    } catch (err) {
      console.error(err);
      alert(t("pngFailed"));
    } finally {
      setGorselPngHazirlaniyor(false);
    }
  }

  // NUM-MOB-2: mobilde kutusuz (dış kart kaldırıldı); md+ mevcut kart korunur.
  return (
    // I18N-0003: kaydın yapısal doğum tarihi + sunucu süzme durumu kronolojik bölümlere bağlamla iletilir.
    <ChronoRecordProvider birthDate={birthDate} analysisData={analysisData}>
    <div className="w-full overflow-hidden md:rounded-[16px] md:border md:border-violet-200/55 md:bg-white/80 md:shadow-[0_0_18px_rgba(139,92,246,0.08)] md:backdrop-blur-xl">
      {/* NUM-MOB-2-FIX1: mobilde sekme başlığı kutusuz (bg/border yok); md+ korunur. */}
      <div className="px-0 py-2 md:border-b md:border-violet-100/60 md:bg-gradient-to-r md:from-violet-50/60 md:via-white/80 md:to-fuchsia-50/40 md:px-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex min-w-max gap-1 pb-px">
              {DETAY_TABS.map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  onClick={() => {
                    setTab(tb.id);
                    setTamEkran(false);
                  }}
                  className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wide transition-all duration-150 ${
                    tab === tb.id
                      ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_2px_8px_rgba(139,92,246,0.25)]"
                      : "border border-violet-100/80 bg-white/80 text-slate-600 hover:border-violet-200 hover:bg-violet-50"
                  }`}
                >
                  {t(`tabs.${tb.labelKey}`)}
                </button>
              ))}
            </div>
          </div>
          {isOkumaTab ? (
            <div className="shrink-0">
              <NumerolojiFontSizeControl value={contentFontSize} onChange={setContentFontSize} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="w-full px-[clamp(8px,2.5vw,14px)] py-3 md:bg-gradient-to-b md:from-white/98 md:via-slate-50/30 md:to-violet-50/20 md:p-4">
        {isOkumaTab ? (
          <ContentFontSizeProvider size={contentFontSize}>
            {tab === "summary" ? (
              <TabSonucOzeti out={out} isimGoster={isimGoster} dogumGoster={birthDate} layout="premium" />
            ) : null}

            {tab === "plain" ? <TabPlainAnaliz out={out} /> : null}

            {tab === "detailed" ? <TabAnalizOzetli out={out} layout="detay" /> : null}

            {tab === "tas" ? (
              <div className="space-y-3">
                <TabTasAtamalari out={out} />
                {tas ? <TasKayitGorunum tas={tas} /> : null}
              </div>
            ) : null}
          </ContentFontSizeProvider>
        ) : null}

        {/* FAZ 6 P0: kayıtlı analizde de Zamanlama & Gelişim — ilk analizle AYNI component,
            CANLI hesap (name/surname/birth_date row'dan; yeni engine/DB/snapshot YOK). */}
        {tab === "zamanlama" ? (
          <NumerolojiZamanlamaGelisimTab
            firstName={name}
            lastName={surname}
            birthDate={birthDate}
          />
        ) : null}

        {isIliskiTab ? (
          <NumerolojiIliskiAnaliziTab
            kisi1Name={name}
            kisi1Surname={surname}
            kisi1BirthDate={birthDate}
            kisi1Pin={out.pinKodu}
          />
        ) : null}

        {tab === "ev-is-yeri" ? <NumerolojiEvIsYeriSayisiTab /> : null}

        {tab === "gorsel" ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div>
              <KayitGorselKontrolPanel
                gorselTaslariGoster={gorselTaslariGoster}
                setGorselTaslariGoster={setGorselTaslariGoster}
                uzmanAdi={uzmanAdi}
                setUzmanAdi={setUzmanAdi}
                tasBileklik={tasBileklik}
                setTasBileklik={setTasBileklik}
                tasKolye={tasKolye}
                setTasKolye={setTasKolye}
                tasKutle={tasKutle}
                setTasKutle={setTasKutle}
                onKaydet={() => void handleGorselAyarKaydet()}
                kayitGorselKaydediliyor={kayitGorselKaydediliyor}
                kayitGorselMesaj={kayitGorselMesaj}
                kayitGorselBasarili={kayitGorselBasarili}
                gorselPngHazirlaniyor={gorselPngHazirlaniyor}
                onPngIndir={() => void handleGorselPngIndir()}
              />
            </div>
            {/* NUM-MOB-1: mobilde önizlemeye dokununca tam ekran açılır. */}
            <div>
              <p className="mb-1 text-center text-[11px] font-bold text-violet-700/80 md:hidden">
                {t("tapFullscreen")}
              </p>
              <div
                className="max-md:cursor-zoom-in"
                onClick={() => {
                  // Yalnız viewport <768 iken tam ekran aç (masaüstünde no-op).
                  if (typeof window !== "undefined" && isMobileViewport(window.innerWidth)) {
                    setTamEkran(true);
                  }
                }}
              >
                <GorselScalePreview
                  out={out}
                  isimGoster={isimGoster}
                  dogumGoster={birthDate}
                  firstName={name}
                  lastName={surname}
                  temaId={gorselTema}
                  uzmanAdi={uzmanAdi}
                  gorselTaslariGoster={gorselTaslariGoster}
                  tasBileklik={tasBileklik}
                  tasKolye={tasKolye}
                  tasKutle={tasKutle}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* NUM-MOB-1: mobil tam ekran görsel rapor viewer (portal + scroll-lock + ESC). */}
      {tamEkran && typeof document !== "undefined"
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t("fullscreenAria")}
              className="fixed inset-0 z-[9999] overflow-y-auto overflow-x-hidden bg-black/95"
            >
              {/* NUM-MOB-2-FIX1: kapatma YALNIZ altta, normal akışta, görselden sonra ≥40px
                  boşlukla. Görselin üzerinde/öncesinde hiçbir kontrol yok. */}
              <div className="flex min-h-full flex-col items-center px-1 py-6">
                <div className="w-full max-w-[min(760px,210mm)] shrink-0">
                  <GorselScalePreview
                    out={out}
                    isimGoster={isimGoster}
                    dogumGoster={birthDate}
                    firstName={name}
                    lastName={surname}
                    temaId={gorselTema}
                    uzmanAdi={uzmanAdi}
                    gorselTaslariGoster={gorselTaslariGoster}
                    tasBileklik={tasBileklik}
                    tasKolye={tasKolye}
                    tasKutle={tasKutle}
                  />
                </div>
                {viewerCtl.footerCloseVisible ? (
                  <div
                    className="mt-10 flex w-full justify-center"
                    style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                  >
                    <button
                      type="button"
                      onClick={() => setTamEkran(false)}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-yellow-300/60 bg-black/70 px-8 text-sm font-black uppercase tracking-wider text-white shadow-lg transition hover:bg-yellow-300 hover:text-black"
                    >
                      {t("close")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
    </ChronoRecordProvider>
  );
}

/** @deprecated NumerolojiKayitDetayPanel kullanın */
export function NumerolojiKayitSonucPanel(props: {
  out: NumerolojiMotorOut;
  name: string;
  surname: string;
  birthDate: string;
}) {
  return (
    <NumerolojiKayitDetayPanel
      {...props}
      analysisData={{ version: 1, motor: props.out, summary: "" }}
      recordId=""
    />
  );
}
