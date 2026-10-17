"use client";

// "Ek Human Design Bilgileri" — haritanın altında, Kanallar / Kapılar yanında (owner kararı 2026-10-17: ilk ekran
// yalnız çekirdek bilgiler; Strateji / İmza / Kendilik Dışı Tema burada). Kayıtlı veriden; hesap / fetch YOK.

import { useId, useState } from "react";
import type { HdComputedChart } from "@/lib/human-design/chart/computedChart";
import type { HdAppChartCodes } from "@/lib/human-design/normalize/hdAppCodes";
import { HD_SIGNATURE_HELP, HD_TERM_BI, hdTypeKeynotes } from "@/lib/human-design/normalize/hdDisplayLabels";

/**
 * "EK HUMAN DESIGN BİLGİLERİ" — haritanın ALTINDA, Kanallar / Kapılar yanında (ilk ekranı kalabalıklaştırmaz).
 * Strateji (Strategy), İmza (Signature) + kısa açıklama ("i" düğmesi), Kendilik Dışı Tema (Not-Self Theme).
 * Değerler: Türkçe uygulama sözlüğü + kaydın Roxy KANONİK İngilizce değeri (yoksa standart HD terimi). Tip
 * bilinmiyorsa kutu gösterilmez (değer uydurulmaz).
 */
export function HdChartKeynotesCard({ result, codes }: { result: HdComputedChart; codes: HdAppChartCodes }) {
  const keynotes = hdTypeKeynotes(codes.type_code, { canonical: { strategy: result.strategy, signature: result.signature, notSelf: result.notSelf } });
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
  if (!keynotes) return null;
  const rows: Array<{ field: string; label: string; value: string; help?: boolean }> = [
    { field: "strategy", label: HD_TERM_BI.strategy, value: keynotes.strategy },
    { field: "signature", label: HD_TERM_BI.signature, value: keynotes.signature, help: true },
    { field: "notSelf", label: HD_TERM_BI.notSelf, value: keynotes.notSelf },
  ];
  return (
    <section aria-label="Ek Human Design bilgileri" className="rounded-xl border border-indigo-100 bg-white px-4 py-3" data-hd-keynotes>
      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-indigo-600">Ek Human Design Bilgileri</p>
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))]">
        {rows.map((r) => (
          <div key={r.field} className="min-w-0" data-hd-info-field={r.field}>
            <dt className="text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] text-slate-400">
              {r.label}
              {r.help ? (
                <button
                  type="button"
                  onClick={() => setHelpOpen((v) => !v)}
                  aria-expanded={helpOpen}
                  aria-controls={helpId}
                  aria-label={`${r.label} nedir?`}
                  title={`${r.label} nedir?`}
                  className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 align-[-2px] text-[9px] font-bold normal-case leading-none text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
                  data-hd-signature-help-toggle
                >
                  i
                </button>
              ) : null}
            </dt>
            <dd className="m-0 mt-0.5 break-words text-[13px] font-medium leading-snug text-slate-800">{r.value}</dd>
          </div>
        ))}
      </dl>
      {helpOpen ? (
        <p id={helpId} className="m-0 mt-2 rounded-lg bg-indigo-50/70 px-3 py-2 text-[11.5px] leading-snug text-slate-600" data-hd-signature-help>
          <span className="font-semibold text-slate-700">{HD_TERM_BI.signature}: </span>
          {HD_SIGNATURE_HELP}
        </p>
      ) : null}
    </section>
  );
}
