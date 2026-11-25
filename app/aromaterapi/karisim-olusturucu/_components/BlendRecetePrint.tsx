"use client";

import { collectSafetyWarnings, sumDrops, type Blend } from "@/lib/aromaterapi/blendData";
import { useTranslations } from "next-intl";
import { useBlendSafetyText } from "@/lib/aromaterapi/useBlendSafetyText";

/** Yazdırılabilir reçetenin ihtiyaç duyduğu alt küme — hem kayıtlı Blend hem
 *  builder'daki aktif taslak bu şekle uyar. */
export type PrintableBlend = Pick<
  Blend,
  | "name"
  | "notes"
  | "carrier_oil_name"
  | "carrier_photosensitivity_status"
  | "carrier_contraindications"
  | "carrier_safety_notes"
  | "bottle_ml"
  | "dilution_percent"
  | "total_drops"
  | "items"
> & {
  /** ARO-023 — güvenlik snapshot tarihi (kaydın updated_at/created_at'i veya aktif taslakta bugün). */
  snapshotDate?: string;
};

/**
 * Aromaterapi karışım reçetesi — yazdırılabilir görünüm (window.print → "PDF olarak kaydet").
 * DİL GUARDRAIL: "güvenli" DENMEZ, tedavi iddiası YOK, AI YOK.
 * Yalnız gösterim; API/DB'ye dokunmaz.
 */
export function BlendRecetePrint({
  blend,
  expertName,
  dateStr,
}: {
  blend: PrintableBlend;
  expertName: string;
  dateStr: string;
}) {
  const carrier = blend.carrier_oil_name?.trim()
    ? {
        oil_name: blend.carrier_oil_name,
        photosensitivity_status: blend.carrier_photosensitivity_status ?? "unknown",
        contraindications: blend.carrier_contraindications ?? "",
        safety_notes: blend.carrier_safety_notes ?? "",
      }
    : null;
  const safety = collectSafetyWarnings(blend.items, carrier);
  const oilsSum = sumDrops(blend.items);
  const tp = useTranslations("aromatherapy.blend.print");
  const tPage = useTranslations("aromatherapy.blend.page");
  const safetyText = useBlendSafetyText();

  return (
    <div className="mx-auto max-w-[720px] bg-white p-8 text-slate-900 print:max-w-none print:p-6">
      {/* Başlık */}
      <div className="border-b-2 border-amber-500 pb-3">
        <h1 className="text-2xl font-black tracking-tight">{tp("title")}</h1>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-[12px] text-slate-600">
          <span>{tp("expert")} <b className="text-slate-800">{expertName || "—"}</b></span>
          <span>{tp("date")} <b className="text-slate-800">{dateStr}</b></span>
        </div>
      </div>

      {/* Karışım özeti */}
      <h2 className="mt-5 text-lg font-black">{blend.name || tPage("unnamed")}</h2>
      <table className="mt-2 w-full border-collapse text-[13px]">
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="py-1.5 pr-3 font-bold text-slate-500">{tp("carrier")}</td>
            <td className="py-1.5 font-semibold">{blend.carrier_oil_name || "—"}</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="py-1.5 pr-3 font-bold text-slate-500">{tp("bottle")}</td>
            <td className="py-1.5 font-semibold">{tp("bottleValue", { ml: blend.bottle_ml })}</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="py-1.5 pr-3 font-bold text-slate-500">{tp("dilution")}</td>
            <td className="py-1.5 font-semibold">{tp("dilutionValue", { value: blend.dilution_percent })}</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="py-1.5 pr-3 font-bold text-slate-500">{tp("target")}</td>
            <td className="py-1.5 font-semibold">{tp("dropsValue", { count: blend.total_drops })}</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="py-1.5 pr-3 font-bold text-slate-500">{tp("oilsSum")}</td>
            <td className="py-1.5 font-semibold">
              {tp("dropsValue", { count: oilsSum })}
              {oilsSum !== blend.total_drops ? (
                <span className="ml-1 text-[11px] font-bold text-amber-700">
                  ({oilsSum < blend.total_drops ? tp("missing", { count: blend.total_drops - oilsSum }) : tp("excess", { count: oilsSum - blend.total_drops })})
                </span>
              ) : null}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[11px] italic text-slate-500">{tp("dropsNote")}</p>

      {/* Yağ tablosu */}
      <h3 className="mt-5 text-[13px] font-black uppercase tracking-wide text-amber-800">{tp("oilsTitle")}</h3>
      <table className="mt-1.5 w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b-2 border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3">{tp("colName")}</th>
            <th className="py-1.5 pr-3">{tp("colLatin")}</th>
            <th className="py-1.5 text-right">{tp("colDrops")}</th>
          </tr>
        </thead>
        <tbody>
          {blend.items.map((it, i) => (
            <tr key={i} className="border-b border-slate-200">
              <td className="py-1.5 pr-3 font-semibold">
                {it.oil_name}
                {it.is_photosensitive ? <span className="ml-1 text-[10px] font-bold text-amber-700">{tp("photosensitive")}</span> : null}
              </td>
              <td className="py-1.5 pr-3 italic text-slate-600">{it.latin_name || "—"}</td>
              <td className="py-1.5 text-right font-black">{it.drops}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Güvenlik notları */}
      <h3 className="mt-5 text-[13px] font-black uppercase tracking-wide text-amber-800">{tp("safetyTitle")}</h3>
      <p className="mt-1 text-[12px] leading-snug text-slate-700">{safetyText.summary(safety)}</p>
      {safety.hasWarnings ? (
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[12px] text-slate-700">
          {safety.warnings.map((w, i) => (
            <li key={i}><b>{safetyText.name(w)}</b> — {safetyText.label(w)}{w.detail ? `: ${safetyText.detail(w)}` : ""}</li>
          ))}
        </ul>
      ) : null}
      {/* ARO-023 — güvenlik bilgisi snapshot uyarısı */}
      <p className="mt-2 text-[11px] italic text-slate-500">
        {tp("snapshot", { date: blend.snapshotDate ? ` (${blend.snapshotDate})` : "" })}
      </p>

      {/* Uzman notları */}
      {blend.notes?.trim() ? (
        <>
          <h3 className="mt-5 text-[13px] font-black uppercase tracking-wide text-amber-800">{tp("notesTitle")}</h3>
          <p className="mt-1 whitespace-pre-wrap text-[12px] leading-snug text-slate-700">{blend.notes}</p>
        </>
      ) : null}

      {/* Guardrail footer */}
      <footer className="mt-7 border-t border-slate-300 pt-3 text-[10px] leading-relaxed text-slate-500">
        {tp("footer")}
      </footer>
    </div>
  );
}
