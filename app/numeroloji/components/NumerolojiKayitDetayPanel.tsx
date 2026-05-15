"use client";

import { useState } from "react";
import {
  GorselRaporInfografik,
  type GorselTemaId,
} from "./NumerolojiGorselRaporInfografik";
import { TabSonucOzeti, TabAnalizOzetli } from "./NumerolojiAnalizSonucTabs";
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
    <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/70 px-6 py-14 text-center">
      <p className="text-sm font-medium leading-relaxed text-slate-600">{children ?? kayitBolumYokMesaji()}</p>
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
    <div className="space-y-5">
      {kolonlar.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kolonlar.map((k) => (
            <section
              key={k.baslik}
              className="rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-sm ring-1 ring-violet-100/40"
            >
              <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-800/90">{k.baslik}</h3>
              <p className="mt-3 text-sm font-medium leading-relaxed text-slate-800">{k.metin}</p>
            </section>
          ))}
        </div>
      ) : null}
      {tas.notlar ? (
        <section className="rounded-2xl border border-amber-200/70 bg-amber-50/40 p-5 ring-1 ring-amber-100/50">
          <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-950/85">Notlar</h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{tas.notlar}</p>
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

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200/85 bg-white/85 shadow-[0_24px_56px_-20px_rgba(91,33,182,0.18)] ring-1 ring-violet-100/55 backdrop-blur-md">
      <div className="flex flex-wrap gap-0 border-b border-slate-200/80 bg-gradient-to-r from-violet-50/85 via-amber-50/55 to-sky-50/85 px-1 pt-1">
        {DETAY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-[2.75rem] shrink-0 rounded-t-xl px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-wide transition sm:px-4 sm:text-xs ${
              tab === t.id
                ? "bg-amber-100 text-amber-950 shadow-inner ring-1 ring-amber-200/90"
                : "text-slate-600 hover:bg-white/70"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-gradient-to-b from-white/98 via-slate-50/40 to-violet-50/25 p-5 sm:p-8 lg:p-10">
        {tab === "summary" ? (
          <TabSonucOzeti out={out} isimGoster={isimGoster} dogumGoster={birthDate} layout="detay" />
        ) : null}

        {tab === "plain" ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-inner ring-1 ring-slate-100/80 sm:p-8">
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-800 sm:text-sm">
              {buildPlainAnalizFull(out)}
            </pre>
          </div>
        ) : null}

        {tab === "detailed" ? <TabAnalizOzetli out={out} layout="detay" /> : null}

        {tab === "tas" ? tas ? <TasKayitGorunum tas={tas} /> : <KayitBosBolum /> : null}

        {tab === "gorsel" ? (
          <div className="flex justify-center py-2">
            <GorselRaporInfografik
              out={out}
              isimGoster={isimGoster}
              dogumGoster={birthDate}
              firstName={name}
              lastName={surname}
              temaId={gorsel.temaId}
              uzmanAdi={gorsel.uzmanAdi}
              gorselTaslariGoster={gorsel.gorselTaslariGoster}
              tasBileklik={gorsel.tasBileklik}
              tasKolye={gorsel.tasKolye}
              tasKutle={gorsel.tasKutle}
            />
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
