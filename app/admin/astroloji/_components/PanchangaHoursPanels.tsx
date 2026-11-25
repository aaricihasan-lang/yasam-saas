"use client";

/**
 * 2026-10-22 — Janma Panchanga "Gezegen saatleri (Hora) + Choghadiya" seçeneğinin görünümü. Değerler sağlayıcıdan gelir; burada
 * hesap YOK — yalnız gündüz / gece tabloları (mobilde alt alta, geniş ekranda yan yana). Olumlu/olumsuz sınıfı metinle de yazılır
 * (yalnız renge dayanmaz).
 */

import { useLocale, useTranslations } from "next-intl";
import { dmyOf } from "../_lib/atlasDate";
import { CHOGHADIYA_LABELS, PANCHANGA_HOURS_NOTE, type ChoghadiyaSlot, type HoraSlot, type PanchangaHours } from "@/lib/astrology/model/panchangaHours";
import type { VedicGrahaId } from "@/lib/astrology/model/vedic";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1 text-sm text-slate-800";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const hm = (s: string) => s.slice(11, 16);
const dmy = (s: string, loc = "tr") => dmyOf(s, loc);
const span = (x: { start: string; end: string }) => `${hm(x.start)} – ${x.end.slice(0, 10) === x.start.slice(0, 10) ? hm(x.end) : `${hm(x.end)} (+1)`}`;
/** I18N ATLAS-V: metinler atlas.vedicExtra.hours.*; graha adları ortak terim kataloğundan (TR = GRAHA_LABELS birebir). */
function useHoursText() {
  const t = useTranslations("atlas.vedicExtra.hours");
  const tt = useTranslations("terms");
  return { t, graha: (id: VedicGrahaId) => tt(`graha.${id}`) };
}
const offLabel = (off: number) => `UTC${off >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(off))).padStart(2, "0")}:${String(Math.round((Math.abs(off) % 1) * 60)).padStart(2, "0")}`;

function HoraTable({ title, rows, testId }: { title: string; rows: HoraSlot[]; testId: string }) {
  const { t, graha } = useHoursText();
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full" data-testid={testId}>
        <caption className="px-2 pt-1.5 text-left text-xs font-semibold text-slate-700">{title}</caption>
        <thead>
          <tr>
            <th className={th}>#</th>
            <th className={th}>{t("lord")}</th>
            <th className={th}>{t("time")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((h) => (
            <tr key={h.n}>
              <td className={`${td} tabular-nums text-slate-500`}>{h.n}</td>
              <td className={`${td} whitespace-nowrap font-medium`}>{graha(h.lord)}</td>
              <td className={`${td} whitespace-nowrap tabular-nums`}>{span(h)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChoghadiyaTable({ title, rows, testId }: { title: string; rows: ChoghadiyaSlot[]; testId: string }) {
  const { t, graha } = useHoursText();
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full" data-testid={testId}>
        <caption className="px-2 pt-1.5 text-left text-xs font-semibold text-slate-700">{title}</caption>
        <thead>
          <tr>
            <th className={th}>#</th>
            <th className={th}>{t("name")}</th>
            <th className={th}>{t("class")}</th>
            <th className={th}>{t("lord")}</th>
            <th className={th}>{t("time")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c) => (
            <tr key={c.n} data-choghadiya-effect={c.effect}>
              <td className={`${td} tabular-nums text-slate-500`}>{c.n}</td>
              <td className={`${td} whitespace-nowrap font-medium`}>{CHOGHADIYA_LABELS[c.name]}</td>
              <td className={td}>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${c.effect === "good" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{t(`effect.${c.effect}`)}</span>
              </td>
              <td className={`${td} whitespace-nowrap`}>{graha(c.lord)}</td>
              <td className={`${td} whitespace-nowrap tabular-nums`}>{span(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PanchangaHoursView({ h }: { h: PanchangaHours }) {
  const { t, graha } = useHoursText();
  const loc = useLocale();
  const pl = h.hora?.place ?? h.choghadiya?.place ?? null;
  const dayLord = h.hora?.dayLord ?? h.choghadiya?.dayLord ?? null;
  return (
    <section className={`${card} p-3`} aria-label={t("sectionLabel")} data-testid="astro-vedic-panchanga-hours">
      <h4 className="text-sm font-semibold text-slate-900">
        {t("titleSep")}
        {dmy(h.date, loc)}
      </h4>
      <p className="text-xs text-slate-600">
        {pl ? t("placeLine", { label: pl.label ? `${pl.label} · ` : "", lat: pl.latitude.toFixed(4), lon: pl.longitude.toFixed(4), off: offLabel(pl.utcOffsetHours) }) : ""}
        {dayLord ? t("dayLord", { graha: graha(dayLord) }) : ""}
      </p>
      {h.missing.length > 0 && (
        <p className="mt-1 text-xs text-amber-800" data-testid="astro-panchanga-hours-missing">
          {t("missingA")}
          {h.missing.map((m) => (m === "hora" ? "Hora" : "Choghadiya")).join(", ")}
          {t("missingB")}
        </p>
      )}
      {h.hora && (
        <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2" data-testid="astro-panchanga-hora">
          <HoraTable title={t("horaDay")} rows={h.hora.day} testId="astro-hora-day" />
          <HoraTable title={t("horaNight")} rows={h.hora.night} testId="astro-hora-night" />
        </div>
      )}
      {h.choghadiya && (
        <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2" data-testid="astro-panchanga-choghadiya">
          <ChoghadiyaTable title={t("choghadiyaDay")} rows={h.choghadiya.day} testId="astro-choghadiya-day" />
          <ChoghadiyaTable title={t("choghadiyaNight")} rows={h.choghadiya.night} testId="astro-choghadiya-night" />
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-500">
        {PANCHANGA_HOURS_NOTE}
        {t("plusOneNote")}
      </p>
    </section>
  );
}
