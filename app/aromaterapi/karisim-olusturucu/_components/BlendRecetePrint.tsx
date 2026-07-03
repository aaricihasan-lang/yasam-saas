"use client";

import { collectSafetyWarnings, type Blend } from "@/lib/aromaterapi/blendData";

/** Yazdırılabilir reçetenin ihtiyaç duyduğu alt küme — hem kayıtlı Blend hem
 *  builder'daki aktif taslak bu şekle uyar. */
export type PrintableBlend = Pick<
  Blend,
  "name" | "notes" | "carrier_oil_name" | "bottle_ml" | "dilution_percent" | "total_drops" | "items"
>;

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
  const safety = collectSafetyWarnings(blend.items);

  return (
    <div className="mx-auto max-w-[720px] bg-white p-8 text-slate-900 print:max-w-none print:p-6">
      {/* Başlık */}
      <div className="border-b-2 border-amber-500 pb-3">
        <h1 className="text-2xl font-black tracking-tight">Yaşam Sistemi · Aromaterapi Reçetesi</h1>
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-[12px] text-slate-600">
          <span>Uzman: <b className="text-slate-800">{expertName || "—"}</b></span>
          <span>Tarih: <b className="text-slate-800">{dateStr}</b></span>
        </div>
      </div>

      {/* Karışım özeti */}
      <h2 className="mt-5 text-lg font-black">{blend.name || "(Adsız karışım)"}</h2>
      <table className="mt-2 w-full border-collapse text-[13px]">
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="py-1.5 pr-3 font-bold text-slate-500">Taşıyıcı (sabit) yağ</td>
            <td className="py-1.5 font-semibold">{blend.carrier_oil_name || "—"}</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="py-1.5 pr-3 font-bold text-slate-500">Şişe hacmi</td>
            <td className="py-1.5 font-semibold">{blend.bottle_ml} ml</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="py-1.5 pr-3 font-bold text-slate-500">Seyreltme oranı</td>
            <td className="py-1.5 font-semibold">%{blend.dilution_percent}</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="py-1.5 pr-3 font-bold text-slate-500">Toplam damla</td>
            <td className="py-1.5 font-semibold">{blend.total_drops} damla</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[11px] italic text-slate-500">1 ml ≈ 20 damla (yaklaşık; damla boyutu yağa göre değişebilir).</p>

      {/* Yağ tablosu */}
      <h3 className="mt-5 text-[13px] font-black uppercase tracking-wide text-amber-800">Uçucu Yağlar</h3>
      <table className="mt-1.5 w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b-2 border-slate-300 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3">Yağ Adı</th>
            <th className="py-1.5 pr-3">Latince Adı</th>
            <th className="py-1.5 text-right">Damla</th>
          </tr>
        </thead>
        <tbody>
          {blend.items.map((it, i) => (
            <tr key={i} className="border-b border-slate-200">
              <td className="py-1.5 pr-3 font-semibold">
                {it.oil_name}
                {it.is_photosensitive ? <span className="ml-1 text-[10px] font-bold text-amber-700">☀️ fotosensitif</span> : null}
              </td>
              <td className="py-1.5 pr-3 italic text-slate-600">{it.latin_name || "—"}</td>
              <td className="py-1.5 text-right font-black">{it.drops}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Güvenlik notları */}
      <h3 className="mt-5 text-[13px] font-black uppercase tracking-wide text-amber-800">Güvenlik Bilgisi</h3>
      <p className="mt-1 text-[12px] leading-snug text-slate-700">{safety.summary}</p>
      {safety.hasWarnings ? (
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[12px] text-slate-700">
          {safety.warnings.map((w, i) => (
            <li key={i}><b>{w.oil_name}</b> — {w.label}{w.detail ? `: ${w.detail}` : ""}</li>
          ))}
        </ul>
      ) : null}

      {/* Uzman notları */}
      {blend.notes?.trim() ? (
        <>
          <h3 className="mt-5 text-[13px] font-black uppercase tracking-wide text-amber-800">Uzman Notları</h3>
          <p className="mt-1 whitespace-pre-wrap text-[12px] leading-snug text-slate-700">{blend.notes}</p>
        </>
      ) : null}

      {/* Guardrail footer */}
      <footer className="mt-7 border-t border-slate-300 pt-3 text-[10px] leading-relaxed text-slate-500">
        Bu belge bir ilaç/tedavi reçetesi değildir ve tıbbi tavsiye yerine geçmez. Aromaterapi uygulaması
        uzman gözetiminde yapılır. Yağlar uzman tarafından seçilmiştir; sistem yağ önermez. Güvenlik bilgileri
        veri-temelli olup kesin tıbbi hüküm içermez; uygulamadan önce uzman değerlendirmesi esastır.
      </footer>
    </div>
  );
}
