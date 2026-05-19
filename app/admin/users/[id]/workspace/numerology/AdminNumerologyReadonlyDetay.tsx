"use client";

import { ELEMENT_ORDER, type ElementName } from "@/lib/numeroloji";
import {
  CakraOmurgasiTablo,
  TabTasAtamalari,
} from "@/app/numeroloji/components/NumerolojiAnalizSonucTabs";
import { GorselRaporInfografik } from "@/app/numeroloji/components/NumerolojiGorselRaporInfografik";
import { ContentFontSizeProvider } from "@/app/numeroloji/components/numerolojiContentTypography";
import {
  extractGorselFromAnalysisData,
  extractTasFromAnalysisData,
  kayitBolumYokMesaji,
  type AnalysisTasData,
} from "@/app/numeroloji/utils/analysisJson";
import { nrDisplay, type NumerolojiMotorOut } from "@/app/numeroloji/utils/numerolojiPlainMetin";

const panelClass =
  "rounded-[28px] border-2 border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-8";

const ELEMENT_BAR: Record<ElementName, string> = {
  Hava: "bg-sky-400",
  Su: "bg-blue-500",
  Ateş: "bg-orange-500",
  Toprak: "bg-amber-600",
};

function TasReadonlyBlock({ tas }: { tas: AnalysisTasData }) {
  const kolonlar = [
    { baslik: "Bileklik taşları", metin: tas.bileklik },
    { baslik: "Kolye taşları", metin: tas.kolye },
    { baslik: "Kütle taşları", metin: tas.kutle },
  ].filter((k) => k.metin?.trim());

  return (
    <div className="space-y-4">
      {kolonlar.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kolonlar.map((k) => (
            <article
              key={k.baslik}
              className="rounded-2xl border-2 border-amber-100 bg-amber-50/50 p-4"
            >
              <h4 className="text-sm font-black text-slate-900">{k.baslik}</h4>
              <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-700">
                {k.metin}
              </p>
            </article>
          ))}
        </div>
      ) : null}
      {tas.notlar?.trim() ? (
        <article className="rounded-2xl border-2 border-amber-200/80 bg-white p-4">
          <h4 className="text-sm font-black text-slate-900">Notlar</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-700">
            {tas.notlar}
          </p>
        </article>
      ) : null}
    </div>
  );
}

function ElementlerReadonlyPanel({ out }: { out: NumerolojiMotorOut }) {
  const el = out.elementler.counts;
  const elMax = Math.max(...ELEMENT_ORDER.map((n) => el[n]), 1);

  return (
    <section className={`${panelClass} border-amber-200/80`}>
      <h2 className="text-xl font-black text-slate-950">Elementler</h2>
      <p className="mt-2 text-sm font-semibold text-slate-700">
        Baskın: {out.elementler.key || "—"}
      </p>
      <div className="mt-6 space-y-5">
        {ELEMENT_ORDER.map((name) => (
          <div key={name}>
            <div className="mb-2 flex justify-between gap-4 text-sm font-black text-slate-700">
              <span>{name}</span>
              <span>{el[name]}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${ELEMENT_BAR[name]}`}
                style={{ width: `${Math.max(8, (el[name] / elMax) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {out.elementlerMetni?.trim() ? (
        <pre className="mt-6 max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm font-medium text-slate-700">
          {out.elementlerMetni}
        </pre>
      ) : null}
    </section>
  );
}

export function AdminNumerologyReadonlyDetay({
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
  const isimGoster = `${name} ${surname}`.replace(/\s+/g, " ").trim();
  const tas = extractTasFromAnalysisData(analysisData);
  const gorsel = extractGorselFromAnalysisData(analysisData);

  const gorselTema = gorsel?.temaId ?? "kozmikMor";
  const uzmanAdi = gorsel?.uzmanAdi ?? "";
  const gorselTaslariGoster = gorsel?.gorselTaslariGoster ?? false;
  const tasBileklik = gorsel?.tasBileklik ?? tas?.bileklik ?? "";
  const tasKolye = gorsel?.tasKolye ?? tas?.kolye ?? "";
  const tasKutle = gorsel?.tasKutle ?? tas?.kutle ?? "";

  return (
    <ContentFontSizeProvider size="normal">
      <div className="space-y-6">
        <section className={`${panelClass} border-fuchsia-200/80`}>
          <h2 className="text-xl font-black text-slate-950">Hesap Özeti</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Ana Kulvar", value: nrDisplay(out.anaKulvar) },
              { label: "Yan Kulvar", value: nrDisplay(out.yanKulvar) },
              { label: "İfade Sayısı", value: nrDisplay(out.ifadeSayisi) },
              { label: "Hayat Yolu", value: nrDisplay(out.hayatYolu) },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border-2 border-violet-100 bg-violet-50/60 p-4"
              >
                <p className="text-xs font-black uppercase text-violet-800">
                  {item.label}
                </p>
                <p className="mt-2 text-2xl font-black text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={`${panelClass} border-amber-200/80`}>
          <h2 className="text-xl font-black text-slate-950">Taşlar</h2>
          <div className="mt-4 space-y-6">
            <TabTasAtamalari out={out} />
            {tas ? (
              <TasReadonlyBlock tas={tas} />
            ) : (
              <p className="text-sm font-medium text-slate-600">{kayitBolumYokMesaji()}</p>
            )}
          </div>
        </section>

        <section className={`${panelClass} border-violet-200/80`}>
          <h2 className="text-xl font-black text-slate-950">Çakralar</h2>
          <div className="mt-4">
            <CakraOmurgasiTablo out={out} />
          </div>
        </section>

        <ElementlerReadonlyPanel out={out} />

        <section className={`${panelClass} border-indigo-200/80`}>
          <h2 className="text-xl font-black text-slate-950">Görsel Rapor</h2>
          <div className="mt-4 overflow-x-auto py-2">
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
        </section>
      </div>
    </ContentFontSizeProvider>
  );
}
