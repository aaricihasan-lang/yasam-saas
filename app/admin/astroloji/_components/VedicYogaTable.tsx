"use client";

/**
 * 2026-10-22 (vedik-yoga) — Vedik D1 yoga denetim tablosu. Yalnız KAYITLI D1 teknik verisinden (yeni istek yok): durum, nitelik,
 * kanıt kayıttaki karardır; oluşum kuralı + ekol notu kendi kataloğumuzdan; ilgili graha/bhava ve bağımsız denetim D1 graha
 * konumlarından türetilir. Sözlükteki diğer yoga başlıkları hesaplanmış gibi gösterilmez. Kart düzeni: 390 px'te tek sütun.
 */

import { useMemo, useState } from "react";
import { VEDIC_YOGA_FAMILY_LABELS, type VedicD1Technical } from "@/lib/astrology/model/vedic";
import {
  VEDIC_YOGA_CONSISTENCY_LABELS,
  VEDIC_YOGA_DICTIONARY_NOTE,
  VEDIC_YOGA_METHOD_TEXT,
  VEDIC_YOGA_QUALITY_LABELS,
  VEDIC_YOGA_STATUS_LABELS,
  type VedicYogaConsistency,
  type VedicYogaStatus,
} from "@/lib/astrology/model/vedicYoga";
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
  const rows = useMemo(() => analyzeVedicYogas(t), [t]);
  const sum = useMemo(() => vedicYogaSummary(rows), [rows]);
  const [filter, setFilter] = useState<Filter>("formed");
  if (!rows.length) return null;
  const shown = filter === "all" ? rows : rows.filter((r) => r.status !== "absent" || r.consistency === "inconsistent");
  const fam = (f: string) => (VEDIC_YOGA_FAMILY_LABELS as Record<string, string>)[f] ?? f;
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white" data-testid="astro-vedic-yoga-table">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h4 className="text-sm font-semibold text-slate-700">
          Yoga denetim tablosu · {sum.present} oluşuyor / {sum.total} kural denetlendi
          {sum.suppressed ? ` · ${sum.suppressed} bastırıldı` : ""}
        </h4>
        <div className="flex gap-1 text-xs" role="group" aria-label="Yoga listesi görünümü" data-testid="astro-vedic-yoga-filter">
          {(["formed", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              data-yoga-filter={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2.5 py-1 ${filter === f ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {f === "formed" ? "Oluşan ve bastırılan" : `Tüm denetimler (${sum.total})`}
            </button>
          ))}
        </div>
      </div>
      <p className="px-3 pt-2 text-xs text-slate-600">
        Bağımsız denetim: {sum.consistent} uyumlu · {sum.uncertain} ekole bağlı · {sum.notChecked} denetlenmedi
        {sum.inconsistent ? <strong className="text-rose-700"> · {sum.inconsistent} uyuşmazlık</strong> : null}
      </p>
      <ul className="grid min-w-0 gap-2 p-3 md:grid-cols-2">
        {shown.length === 0 && <li className="text-sm text-slate-500">Bu haritada oluşan ya da bastırılan yoga yok.</li>}
        {shown.map((r) => (
          <li key={r.id} data-yoga-id={r.id} data-yoga-status={r.status} data-yoga-check={r.consistency} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <span className="font-semibold text-slate-800">{r.sanskrit}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[r.status]}`}>{VEDIC_YOGA_STATUS_LABELS[r.status]}</span>
            </div>
            <div className="text-[11px] text-slate-500">
              {fam(r.family)}
              {r.quality ? ` · geleneksel nitelik: ${VEDIC_YOGA_QUALITY_LABELS[r.quality]}` : ""}
              {r.suppressedBy ? ` · bastıran aile: ${fam(r.suppressedBy)}` : ""}
            </div>
            {r.formation && <div className="mt-1 break-words text-xs text-slate-700">Oluşum kuralı: {r.formation}</div>}
            <div className="mt-0.5 break-words text-xs text-slate-700">İlgili graha · bhava: {vedicYogaTriggerText(r.triggers)}</div>
            <div className={`mt-0.5 break-words text-xs ${CHECK_TONE[r.consistency]}`}>
              Bağımsız denetim: {VEDIC_YOGA_CONSISTENCY_LABELS[r.consistency]} — {r.check.detail}
            </div>
            {(r.evidence || r.school) && (
              <details className="mt-1 text-xs text-slate-600">
                <summary className="cursor-pointer select-none">Kanıt ve ekol notu</summary>
                {r.evidence && <div className="mt-1 break-words">Kanıt: {r.evidence}</div>}
                {r.school && <div className="mt-1 break-words">Ekol: {r.school}</div>}
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
