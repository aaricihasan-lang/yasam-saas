"use client";

/**
 * 2026-10-22 (vedik-yoga) — Vedik D1 yoga denetim tablosu. Yalnız KAYITLI D1 teknik verisinden (yeni istek yok): durum, nitelik,
 * kanıt kayıttaki karardır; oluşum kuralı + ekol notu kendi kataloğumuzdan; ilgili graha/bhava ve bağımsız denetim D1 graha
 * konumlarından türetilir. Sözlükteki diğer yoga başlıkları hesaplanmış gibi gösterilmez. Kart düzeni: 390 px'te tek sütun.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { VEDIC_YOGA_FAMILIES, type VedicD1Technical } from "@/lib/astrology/model/vedic";
import { VEDIC_YOGA_DICTIONARY_NOTE, VEDIC_YOGA_METHOD_TEXT, type VedicYogaConsistency, type VedicYogaStatus } from "@/lib/astrology/model/vedicYoga";
import { analyzeVedicYogas, vedicYogaSummary, vedicYogaTriggerText } from "@/lib/astrology/verify/vedicYoga";

const STATUS_TONE: Record<VedicYogaStatus, string> = {
  present: "border-emerald-200 bg-emerald-50 text-emerald-800",
  suppressed: "border-amber-200 bg-amber-50 text-amber-800",
  absent: "border-slate-200 bg-slate-50 text-slate-600",
};
const CHECK_TONE: Record<VedicYogaConsistency, string> = {
  consistent: "text-emerald-700",
  inconsistent: "font-semibold text-rose-700",
  uncertain: "text-amber-700",
  not_checked: "text-slate-500",
};
type Filter = "formed" | "all";

export function VedicYogaTable({ t }: { t: VedicD1Technical }) {
  // I18N ATLAS-V: durum / nitelik / denetim / aile adları koddan katalogla (TR değerleri lib *_LABELS ile birebir; atlas-vedic-i18n kilidi).
  const tx = useTranslations("atlas.vedic.yogaTable");
  const rows = useMemo(() => analyzeVedicYogas(t), [t]);
  const sum = useMemo(() => vedicYogaSummary(rows), [rows]);
  const [filter, setFilter] = useState<Filter>("formed");
  if (!rows.length) return null;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status !== "absent" || r.consistency === "inconsistent");
  const fam = (f: string) => ((VEDIC_YOGA_FAMILIES as readonly string[]).includes(f) ? tx(`family.${f}`) : f);
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white" data-testid="astro-vedic-yoga-table">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h4 className="text-sm font-semibold text-slate-700">
          {tx("titleA")}
          {sum.present}
          {tx("titleB")}
          {sum.total}
          {tx("titleC")}
          {sum.suppressed ? tx("suppressedCount", { n: String(sum.suppressed) }) : ""}
        </h4>
        <div className="flex gap-1 text-xs" role="group" aria-label={tx("filterLabel")} data-testid="astro-vedic-yoga-filter">
          {(["formed", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              data-yoga-filter={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2.5 py-1 ${filter === f ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {f === "formed" ? tx("filterFormed") : tx("filterAll", { n: String(sum.total) })}
            </button>
          ))}
        </div>
      </div>
      <p className="px-3 pt-2 text-xs text-slate-600">
        {tx("checkA")}
        {sum.consistent}
        {tx("checkB")}
        {sum.uncertain}
        {tx("checkC")}
        {sum.notChecked}
        {tx("checkD")}
        {sum.inconsistent ? (
          <strong className="text-rose-700">
            {" · "}
            {sum.inconsistent}
            {tx("checkE")}
          </strong>
        ) : null}
      </p>
      <ul className="grid min-w-0 gap-2 p-3 md:grid-cols-2">
        {shown.length === 0 && <li className="text-sm text-slate-500">{tx("empty")}</li>}
        {shown.map((r) => (
          <li key={r.id} data-yoga-id={r.id} data-yoga-status={r.status} data-yoga-check={r.consistency} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <span className="font-semibold text-slate-800">{r.sanskrit}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[r.status]}`}>{tx(`status.${r.status}`)}</span>
            </div>
            <div className="text-[11px] text-slate-500">
              {fam(r.family)}
              {r.quality ? tx("qualityLine", { q: tx(`quality.${r.quality}`) }) : ""}
              {r.suppressedBy ? tx("suppressedByLine", { f: fam(r.suppressedBy) }) : ""}
            </div>
            {r.formation && (
              <div className="mt-1 break-words text-xs text-slate-700">
                {tx("formation")}
                {r.formation}
              </div>
            )}
            <div className="mt-0.5 break-words text-xs text-slate-700">
              {tx("triggers")}
              {vedicYogaTriggerText(r.triggers)}
            </div>
            <div className={`mt-0.5 break-words text-xs ${CHECK_TONE[r.consistency]}`}>
              {tx("checkLabel")}
              {tx(`consistency.${r.consistency}`)} — {r.check.detail}
            </div>
            {(r.evidence || r.school) && (
              <details className="mt-1 text-xs text-slate-600">
                <summary className="cursor-pointer select-none">{tx("evidenceSummary")}</summary>
                {r.evidence && (
                  <div className="mt-1 break-words">
                    {/* K2: hizmetin kanıt cümlesi İngilizce — özgün metin olarak işaretli (Türkçe kural yukarıda). */}
                    {tx("evidenceLabel")}
                    <span lang="en">{r.evidence}</span>
                  </div>
                )}
                {r.school && (
                  <div className="mt-1 break-words">
                    {tx("school")}
                    {r.school}
                  </div>
                )}
              </details>
            )}
          </li>
        ))}
      </ul>
      <p className="px-3 pb-1 text-[11px] text-slate-500">{VEDIC_YOGA_METHOD_TEXT}</p>
      <p className="px-3 pb-2 text-[11px] text-slate-500">{VEDIC_YOGA_DICTIONARY_NOTE}</p>
    </section>
  );
}
