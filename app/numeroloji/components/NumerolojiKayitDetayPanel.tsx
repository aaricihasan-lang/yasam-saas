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
import {
  resolveNumerolojiTenantId,
  updateNumerologyAnalysisGorsel,
} from "../helpers/numerolojiKayit";
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
    <div className="min-w-0 rounded-[28px] border-[3px] border-dashed border-violet-200/90 bg-white/80 p-7 text-center shadow-[0_0_32px_rgba(139,92,246,0.10)]">
      <p className={`min-h-[140px] w-full px-6 py-5 ${typo.body}`}>{children ?? kayitBolumYokMesaji()}</p>
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
              <h3 className="text-lg font-black tracking-wide text-slate-950">{k.baslik}</h3>
              <p className={`mt-4 ${typo.body} font-medium text-slate-800`}>{k.metin}</p>
            </section>
          ))}
        </div>
      ) : null}
      {tas.notlar ? (
        <section className="rounded-[28px] border-[3px] border-amber-300/45 bg-white/80 p-6 shadow-[0_0_32px_rgba(245,158,11,0.10)] xl:p-7">
          <h3 className="text-lg font-black tracking-wide text-slate-950">Notlar</h3>
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
  "h-14 w-full rounded-2xl border border-violet-200/80 bg-white px-4 text-base leading-7 font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-200/40";

const kayitGorselTextareaClass =
  "min-h-[130px] w-full resize-y rounded-2xl border border-violet-200/80 bg-white px-4 py-3 text-base leading-7 font-medium text-slate-900 outline-none ring-1 ring-violet-100/60 transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-200/40";

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
      <p className="text-lg font-black tracking-wide text-violet-800">Görsel rapor ayarları</p>

      <label className="flex cursor-pointer items-start gap-3 text-base leading-7 font-semibold text-slate-800">
        <input
          type="checkbox"
          checked={gorselTaslariGoster}
          onChange={(e) => setGorselTaslariGoster(e.target.checked)}
          className="mt-1 size-5 shrink-0 rounded-md border-slate-300 text-violet-600 focus:ring-violet-500"
        />
        <span>Taş önerilerini görsel raporda göster</span>
      </label>

      <div>
        <label htmlFor="kayit-noj-uzman" className="mb-2 block text-base font-bold leading-7 text-slate-700">
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
        <label htmlFor="kayit-noj-tas-bileklik" className="mb-2 block text-base font-bold leading-7 text-slate-700">
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
        <label htmlFor="kayit-noj-tas-kolye" className="mb-2 block text-base font-bold leading-7 text-slate-700">
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
        <label htmlFor="kayit-noj-tas-kutle" className="mb-2 block text-base font-bold leading-7 text-slate-700">
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
          className="h-14 w-full rounded-2xl border-2 border-violet-300/80 bg-gradient-to-r from-violet-600 to-indigo-600 px-4 text-base font-black text-white shadow-[0_10px_28px_-8px_rgba(91,33,182,0.45)] ring-1 ring-violet-300/40 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {kayitGorselKaydediliyor ? "Kaydediliyor…" : "Ayarları Kaydet"}
        </button>
        <button
          type="button"
          disabled={gorselPngHazirlaniyor || kayitGorselKaydediliyor}
          onClick={onPngIndir}
          className="h-14 w-full rounded-2xl border-2 border-emerald-400/70 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-base font-black text-white shadow-[0_10px_28px_-8px_rgba(16,185,129,0.45)] ring-1 ring-emerald-300/40 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
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
    const tenantId = await resolveNumerolojiTenantId();
    if (!tenantId) {
      setKayitGorselKaydediliyor(false);
      setKayitGorselMesaj("Aktif kullanıcı tenant_id bulunamadı.");
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
      setKayitGorselMesaj(error);
      return;
    }
    if (updated) onAnalysisDataUpdate?.(updated);
    setKayitGorselMesaj("Kaydedildi.");
  }

  async function handleGorselPngIndir() {
    const el =
      document.querySelector<HTMLElement>("[data-gorsel-rapor-root]") ??
      document.getElementById("numeroloji-kayit-gorsel-rapor-png-root");
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
    <div className="w-full overflow-hidden rounded-[20px] border border-violet-200/55 bg-white/80 shadow-[0_0_22px_rgba(139,92,246,0.09)] backdrop-blur-xl">
      <div className="border-b border-violet-100/60 bg-gradient-to-r from-violet-50/60 via-white/80 to-fuchsia-50/40 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {DETAY_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide transition-all duration-150 ${
                  tab === t.id
                    ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_2px_8px_rgba(139,92,246,0.25)]"
                    : "border border-violet-100/80 bg-white/80 text-slate-600 hover:border-violet-200 hover:bg-violet-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {isOkumaTab ? (
            <div className="ml-auto">
              <NumerolojiFontSizeControl value={contentFontSize} onChange={setContentFontSize} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="w-full bg-gradient-to-b from-white/98 via-slate-50/30 to-violet-50/20 p-4 sm:p-5 xl:p-7">
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
            <div className="min-w-0 w-full flex-1 overflow-x-auto py-1 sm:py-2">
              <div className="inline-block origin-top-left scale-[0.48] sm:scale-[0.52] lg:scale-[0.55] xl:scale-[0.58]">
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
