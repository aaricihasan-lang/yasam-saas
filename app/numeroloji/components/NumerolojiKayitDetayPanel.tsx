"use client";

import { useEffect, useState } from "react";
import {
  GorselRaporInfografik,
  type GorselTemaId,
} from "./NumerolojiGorselRaporInfografik";
import { TabSonucOzeti, TabAnalizOzetli, TabPlainAnaliz, TabTasAtamalari } from "./NumerolojiAnalizSonucTabs";
import {
  ContentFontSizeProvider,
  NumerolojiFontSizeControl,
  useContentTypography,
  type ContentFontSize,
} from "./numerolojiContentTypography";
import { gorselRaporuPngYakalaVeIndir } from "../gorselRaporExport";
import { getTenantIdFromStorage, updateNumerologyAnalysisGorsel } from "../helpers/numerolojiKayit";
import type { NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";
import {
  extractGorselFromAnalysisData,
  extractTasFromAnalysisData,
  formatVirgulluTasGirdi,
  kayitBolumYokMesaji,
  type AnalysisGorselData,
  type AnalysisTasData,
} from "../utils/analysisJson";

const DETAY_TABS = [
  { id: "summary" as const, label: "Sonuç Özeti" },
  { id: "plain" as const, label: "Analiz (Hesap Özetsiz)" },
  { id: "detailed" as const, label: "Analiz (Hesap Özetli)" },
  { id: "tas" as const, label: "Taş Açıklamaları" },
  { id: "gorsel" as const, label: "Görsel Rapor" },
];

type DetayTabId = (typeof DETAY_TABS)[number]["id"];

function KayitBosBolum({ children }: { children?: string }) {
  const typo = useContentTypography();
  return (
    <div className="rounded-[26px] border border-dashed border-slate-200/90 bg-slate-50/70 px-8 py-16 text-center sm:py-20">
      <p className={`${typo.body} font-medium text-slate-600`}>{children ?? kayitBolumYokMesaji()}</p>
    </div>
  );
}

function TasKayitGorunum({ tas }: { tas: AnalysisTasData }) {
  const typo = useContentTypography();
  const kolonlar = [
    { baslik: "Bileklik taşları", metin: tas.bileklik },
    { baslik: "Kolye taşları", metin: tas.kolye },
    { baslik: "Kütle taşları", metin: tas.kutle },
  ].filter((k) => k.metin && k.metin.trim());

  return (
    <div className="space-y-6 sm:space-y-7">
      {kolonlar.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {kolonlar.map((k) => (
            <section
              key={k.baslik}
              className="rounded-[26px] border border-slate-200/90 bg-white/95 p-6 shadow-md ring-1 ring-violet-100/40 sm:p-7"
            >
              <h3 className={`${typo.sectionTitle} text-violet-800/90`}>{k.baslik}</h3>
              <p className={`mt-4 ${typo.body} font-medium text-slate-800`}>{k.metin}</p>
            </section>
          ))}
        </div>
      ) : null}
      {tas.notlar ? (
        <section className="rounded-[26px] border border-amber-200/70 bg-amber-50/40 p-6 ring-1 ring-amber-100/50 sm:p-7">
          <h3 className={`${typo.sectionTitle} text-amber-950/85`}>Notlar</h3>
          <p className={`mt-4 whitespace-pre-wrap ${typo.body} text-slate-800`}>{tas.notlar}</p>
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
  "w-full rounded-2xl border border-violet-200/80 bg-white px-4 py-3.5 text-base font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-200/40";

const kayitGorselTextareaClass =
  "w-full resize-y rounded-2xl border border-violet-200/80 bg-white px-4 py-3.5 text-base font-medium leading-relaxed text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-200/40";

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
  gorselPngHazirlaniyor: boolean;
  onPngIndir: () => void;
}) {
  return (
    <aside className="w-full space-y-4 rounded-[26px] border border-violet-200/70 bg-gradient-to-br from-white/95 via-violet-50/30 to-white/90 p-5 shadow-[0_12px_36px_-14px_rgba(91,33,182,0.22)] ring-1 ring-violet-100/55 sm:p-6 lg:sticky lg:top-3">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-800/90">Görsel rapor ayarları</p>

      <label className="flex cursor-pointer items-start gap-3 text-sm font-semibold leading-snug text-slate-800 sm:text-base">
        <input
          type="checkbox"
          checked={gorselTaslariGoster}
          onChange={(e) => setGorselTaslariGoster(e.target.checked)}
          className="mt-1 size-5 shrink-0 rounded-md border-slate-300 text-violet-600 focus:ring-violet-500"
        />
        <span>Taş önerilerini görsel raporda göster</span>
      </label>

      <div>
        <label htmlFor="kayit-noj-uzman" className="mb-2 block text-sm font-bold text-slate-700">
          Uzman adı
        </label>
        <input
          id="kayit-noj-uzman"
          type="text"
          value={uzmanAdi}
          onChange={(e) => setUzmanAdi(e.target.value)}
          placeholder="Örn. Hasan Arıcı"
          className={kayitGorselInputClass}
          autoComplete="name"
        />
      </div>

      <div>
        <label htmlFor="kayit-noj-tas-bileklik" className="mb-2 block text-sm font-bold text-slate-700">
          Bileklik taşları
        </label>
        <textarea
          id="kayit-noj-tas-bileklik"
          value={tasBileklik}
          onChange={(e) => setTasBileklik(formatVirgulluTasGirdi(e.target.value))}
          rows={3}
          placeholder="Örn. Ametist, Sitrin, Turmalin"
          className={kayitGorselTextareaClass}
        />
      </div>

      <div>
        <label htmlFor="kayit-noj-tas-kolye" className="mb-2 block text-sm font-bold text-slate-700">
          Kolye taşları
        </label>
        <textarea
          id="kayit-noj-tas-kolye"
          value={tasKolye}
          onChange={(e) => setTasKolye(formatVirgulluTasGirdi(e.target.value))}
          rows={3}
          placeholder="Örn. Ametist, Sitrin, Turmalin"
          className={kayitGorselTextareaClass}
        />
      </div>

      <div>
        <label htmlFor="kayit-noj-tas-kutle" className="mb-2 block text-sm font-bold text-slate-700">
          Kütle taşları
        </label>
        <textarea
          id="kayit-noj-tas-kutle"
          value={tasKutle}
          onChange={(e) => setTasKutle(formatVirgulluTasGirdi(e.target.value))}
          rows={3}
          placeholder="Örn. Ametist, Sitrin, Turmalin"
          className={kayitGorselTextareaClass}
        />
      </div>

      {kayitGorselMesaj ? (
        <p
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${
            kayitGorselMesaj.startsWith("Kaydedildi")
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60"
              : "bg-rose-50 text-rose-800 ring-1 ring-rose-200/60"
          }`}
          role="status"
        >
          {kayitGorselMesaj}
        </p>
      ) : null}

      <div className="space-y-3 pt-1">
        <button
          type="button"
          onClick={onKaydet}
          disabled={kayitGorselKaydediliyor || gorselPngHazirlaniyor}
          className="w-full rounded-2xl border-2 border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-[0_10px_28px_-8px_rgba(91,33,182,0.45)] ring-1 ring-violet-300/40 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {kayitGorselKaydediliyor ? "Kaydediliyor…" : "Ayarları Kaydet"}
        </button>
        <button
          type="button"
          disabled={gorselPngHazirlaniyor || kayitGorselKaydediliyor}
          onClick={onPngIndir}
          className="w-full rounded-2xl border-2 border-emerald-400/70 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-[0_10px_28px_-8px_rgba(16,185,129,0.45)] ring-1 ring-emerald-300/40 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {gorselPngHazirlaniyor ? "Görsel hazırlanıyor..." : "PNG İndir"}
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
  const [contentFontSize, setContentFontSize] = useState<ContentFontSize>("normal");

  const isOkumaTab = tab === "summary" || tab === "plain" || tab === "detailed" || tab === "tas";

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
    setKayitGorselKaydediliyor(true);
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
      getTenantIdFromStorage(),
      gorselData,
      analysisData,
    );
    setKayitGorselKaydediliyor(false);
    if (error) {
      setKayitGorselMesaj(error);
      return;
    }
    if (updated) onAnalysisDataUpdate?.(updated);
    setKayitGorselMesaj("Kaydedildi.");
  }

  async function handleGorselPngIndir() {
    const el = document.getElementById("numeroloji-kayit-gorsel-rapor-png-root");
    if (!el) {
      alert("Görsel rapor alanı bulunamadı.");
      return;
    }
    try {
      setGorselPngHazirlaniyor(true);
      await gorselRaporuPngYakalaVeIndir(el);
    } catch (err) {
      console.error(err);
      alert("PNG hazırlanırken hata oluştu. Konsolu kontrol edin.");
    } finally {
      setGorselPngHazirlaniyor(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[32px] border border-slate-200/85 bg-white/85 shadow-[0_28px_64px_-20px_rgba(91,33,182,0.22)] ring-1 ring-violet-100/55 backdrop-blur-md">
      <div className="border-b border-slate-200/80 bg-gradient-to-r from-violet-50/85 via-amber-50/55 to-sky-50/85 p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-3 sm:mb-4">
          <NumerolojiFontSizeControl value={contentFontSize} onChange={setContentFontSize} />
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
        {DETAY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-[58px] shrink-0 whitespace-nowrap rounded-xl px-7 py-4 text-left text-base font-black uppercase tracking-wide transition ${
              tab === t.id
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_10px_28px_-4px_rgba(91,33,182,0.52)] ring-2 ring-violet-300/45"
                : "bg-white/70 text-slate-600 hover:bg-white hover:text-violet-800 hover:shadow-[0_4px_14px_-6px_rgba(91,33,182,0.25)]"
            }`}
          >
            {t.label}
          </button>
        ))}
        </div>
      </div>

      <div className="bg-gradient-to-b from-white/98 via-slate-50/40 to-violet-50/25 p-5 sm:p-8 lg:px-10 lg:py-12 xl:px-12">
        {isOkumaTab ? (
          <ContentFontSizeProvider size={contentFontSize}>
            {tab === "summary" ? (
              <TabSonucOzeti out={out} isimGoster={isimGoster} dogumGoster={birthDate} layout="premium" />
            ) : null}

            {tab === "plain" ? <TabPlainAnaliz out={out} /> : null}

            {tab === "detailed" ? <TabAnalizOzetli out={out} layout="detay" /> : null}

            {tab === "tas" ? (
              <div className="space-y-6 sm:space-y-8">
                <TabTasAtamalari out={out} />
                {tas ? <TasKayitGorunum tas={tas} /> : null}
              </div>
            ) : null}
          </ContentFontSizeProvider>
        ) : null}

        {tab === "gorsel" ? (
          <div
            className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6 xl:gap-8"
            data-gorsel-rapor-scroll-host
          >
            <div className="w-full shrink-0 lg:w-[min(100%,400px)] xl:w-[420px]">
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
                gorselPngHazirlaniyor={gorselPngHazirlaniyor}
                onPngIndir={() => void handleGorselPngIndir()}
              />
            </div>
            <div className="flex min-w-0 w-full flex-1 justify-center py-1 sm:py-2 lg:justify-start">
              <div
                id="numeroloji-kayit-gorsel-rapor-png-root"
                className="w-full max-w-[min(960px,100%)] [&_.numeroloji-gorsel-root]:w-full [&_.numeroloji-gorsel-root]:max-w-none"
              >
                <GorselRaporInfografik
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
    </div>
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
