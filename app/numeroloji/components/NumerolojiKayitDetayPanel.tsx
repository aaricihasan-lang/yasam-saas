"use client";

import { useRef, useState } from "react";
import {
  GorselRaporInfografik,
  type GorselTemaId,
} from "./NumerolojiGorselRaporInfografik";
import { GorselRaporKontrolYanPanel } from "./NumerolojiGorselRaporKontrolPaneli";
import { TabSonucOzeti, TabAnalizOzetli } from "./NumerolojiAnalizSonucTabs";
import { gorselRaporuPngYakalaVeIndir } from "../gorselRaporExport";
import { buildPlainAnalizFull, type NumerolojiMotorOut } from "../utils/numerolojiPlainMetin";
import {
  extractGorselFromAnalysisData,
  extractTasFromAnalysisData,
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
  return (
    <div className="rounded-[26px] border border-dashed border-slate-200/90 bg-slate-50/70 px-8 py-16 text-center sm:py-20">
      <p className="text-base font-medium leading-relaxed text-slate-600 sm:text-lg">{children ?? kayitBolumYokMesaji()}</p>
    </div>
  );
}

function TasKayitGorunum({ tas }: { tas: AnalysisTasData }) {
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
              <h3 className="text-xs font-black uppercase tracking-[0.18em] text-violet-800/90 sm:text-sm">{k.baslik}</h3>
              <p className="mt-4 text-base font-medium leading-relaxed text-slate-800 sm:text-lg">{k.metin}</p>
            </section>
          ))}
        </div>
      ) : null}
      {tas.notlar ? (
        <section className="rounded-[26px] border border-amber-200/70 bg-amber-50/40 p-6 ring-1 ring-amber-100/50 sm:p-7">
          <h3 className="text-xs font-black uppercase tracking-[0.18em] text-amber-950/85 sm:text-sm">Notlar</h3>
          <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-slate-800 sm:text-lg">{tas.notlar}</p>
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

export function NumerolojiKayitDetayPanel({
  out,
  name,
  surname,
  birthDate,
  analysisData,
}: {
  out: NumerolojiMotorOut;
  name: string;
  surname: string;
  birthDate: string;
  analysisData: unknown;
}) {
  const [tab, setTab] = useState<DetayTabId>("summary");
  const isimGoster = `${name} ${surname}`.replace(/\s+/g, " ").trim();
  const tas = extractTasFromAnalysisData(analysisData);
  const gorselKayit = extractGorselFromAnalysisData(analysisData);
  const gorsel = gorselDefaults(gorselKayit);

  const [uzmanAdi, setUzmanAdi] = useState(gorsel.uzmanAdi);
  const [gorselTaslariGoster, setGorselTaslariGoster] = useState(gorsel.gorselTaslariGoster);
  const [tasBileklik, setTasBileklik] = useState(gorsel.tasBileklik);
  const [tasKolye, setTasKolye] = useState(gorsel.tasKolye);
  const [tasKutle, setTasKutle] = useState(gorsel.tasKutle);
  const gorselRaporRef = useRef<HTMLDivElement>(null);
  const [gorselPngHazirlaniyor, setGorselPngHazirlaniyor] = useState(false);

  return (
    <div className="overflow-hidden rounded-[32px] border border-slate-200/85 bg-white/85 shadow-[0_28px_64px_-20px_rgba(91,33,182,0.22)] ring-1 ring-violet-100/55 backdrop-blur-md">
      <div className="flex flex-wrap gap-2 border-b border-slate-200/80 bg-gradient-to-r from-violet-50/85 via-amber-50/55 to-sky-50/85 p-2 sm:gap-3 sm:p-3">
        {DETAY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-[3.5rem] shrink-0 whitespace-nowrap rounded-xl px-6 py-3.5 text-left text-sm font-black uppercase tracking-wide transition lg:px-8 lg:py-4 lg:text-base ${
              tab === t.id
                ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_10px_28px_-4px_rgba(91,33,182,0.52)] ring-2 ring-violet-300/45"
                : "bg-white/70 text-slate-600 hover:bg-white hover:text-violet-800 hover:shadow-[0_4px_14px_-6px_rgba(91,33,182,0.25)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-gradient-to-b from-white/98 via-slate-50/40 to-violet-50/25 p-6 sm:p-10 lg:p-12">
        {tab === "summary" ? (
          <TabSonucOzeti out={out} isimGoster={isimGoster} dogumGoster={birthDate} layout="premium" />
        ) : null}

        {tab === "plain" ? (
          <div className="rounded-[26px] border border-slate-200/80 bg-white/90 p-7 shadow-inner ring-1 ring-slate-100/80 sm:p-9">
            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-slate-800 sm:text-base">
              {buildPlainAnalizFull(out)}
            </pre>
          </div>
        ) : null}

        {tab === "detailed" ? <TabAnalizOzetli out={out} layout="detay" /> : null}

        {tab === "tas" ? tas ? <TasKayitGorunum tas={tas} /> : <KayitBosBolum /> : null}

        {tab === "gorsel" ? (
          <div
            className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5"
            data-gorsel-rapor-scroll-host
          >
            <div className="shrink-0 space-y-3 lg:w-[min(100%,300px)]">
              <GorselRaporKontrolYanPanel
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
              />
              <button
                type="button"
                disabled={gorselPngHazirlaniyor}
                onClick={async () => {
                  if (!gorselRaporRef.current) {
                    console.warn("Görsel rapor alanı bulunamadı.");
                    return;
                  }
                  try {
                    setGorselPngHazirlaniyor(true);
                    await gorselRaporuPngYakalaVeIndir(gorselRaporRef.current);
                  } finally {
                    setGorselPngHazirlaniyor(false);
                  }
                }}
                className="w-full rounded-xl border-2 border-emerald-400/70 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-sm font-black uppercase tracking-wide text-white shadow-[0_10px_28px_-8px_rgba(16,185,129,0.45)] ring-1 ring-emerald-300/40 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {gorselPngHazirlaniyor ? "Görsel hazırlanıyor..." : "PNG İndir"}
              </button>
            </div>
            <div className="flex min-w-0 flex-1 justify-center py-1 sm:py-2">
              <GorselRaporInfografik
                ref={gorselRaporRef}
                out={out}
                isimGoster={isimGoster}
                dogumGoster={birthDate}
                firstName={name}
                lastName={surname}
                temaId={gorsel.temaId}
                uzmanAdi={uzmanAdi}
                gorselTaslariGoster={gorselTaslariGoster}
                tasBileklik={tasBileklik}
                tasKolye={tasKolye}
                tasKutle={tasKutle}
              />
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
  return <NumerolojiKayitDetayPanel {...props} analysisData={{ version: 1, motor: props.out, summary: "" }} />;
}
