"use client";

/**
 * 2026-10-22 — Janma Panchanga "Gezegen saatleri (Hora) + Choghadiya" seçeneğinin görünümü. Değerler sağlayıcıdan gelir; burada
 * hesap YOK — yalnız gündüz / gece tabloları (mobilde alt alta, geniş ekranda yan yana). Olumlu/olumsuz sınıfı metinle de yazılır
 * (yalnız renge dayanmaz).
 */

import { CHOGHADIYA_EFFECT_LABEL, CHOGHADIYA_LABELS, PANCHANGA_HOURS_NOTE, type ChoghadiyaSlot, type HoraSlot, type PanchangaHours } from "@/lib/astrology/model/panchangaHours";
import { GRAHA_LABELS } from "@/lib/astrology/topics/vedic";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1 text-sm text-slate-800";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const hm = (s: string) => s.slice(11, 16);
const dmy = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
const span = (x: { start: string; end: string }) => `${hm(x.start)} – ${x.end.slice(0, 10) === x.start.slice(0, 10) ? hm(x.end) : `${hm(x.end)} (+1)`}`;
const offLabel = (off: number) => `UTC${off >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(off))).padStart(2, "0")}:${String(Math.round((Math.abs(off) % 1) * 60)).padStart(2, "0")}`;

function HoraTable({ title, rows, testId }: { title: string; rows: HoraSlot[]; testId: string }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full" data-testid={testId}>
        <caption className="px-2 pt-1.5 text-left text-xs font-semibold text-slate-700">{title}</caption>
        <thead>
          <tr>
            <th className={th}>#</th>
            <th className={th}>Yönetici</th>
            <th className={th}>Saat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((h) => (
            <tr key={h.n}>
              <td className={`${td} tabular-nums text-slate-500`}>{h.n}</td>
              <td className={`${td} whitespace-nowrap font-medium`}>{GRAHA_LABELS[h.lord]}</td>
              <td className={`${td} whitespace-nowrap tabular-nums`}>{span(h)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChoghadiyaTable({ title, rows, testId }: { title: string; rows: ChoghadiyaSlot[]; testId: string }) {
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full" data-testid={testId}>
        <caption className="px-2 pt-1.5 text-left text-xs font-semibold text-slate-700">{title}</caption>
        <thead>
          <tr>
            <th className={th}>#</th>
            <th className={th}>Ad</th>
            <th className={th}>Sınıf</th>
            <th className={th}>Yönetici</th>
            <th className={th}>Saat</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c) => (
            <tr key={c.n} data-choghadiya-effect={c.effect}>
              <td className={`${td} tabular-nums text-slate-500`}>{c.n}</td>
              <td className={`${td} whitespace-nowrap font-medium`}>{CHOGHADIYA_LABELS[c.name]}</td>
              <td className={td}>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${c.effect === "good" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{CHOGHADIYA_EFFECT_LABEL[c.effect]}</span>
              </td>
              <td className={`${td} whitespace-nowrap`}>{GRAHA_LABELS[c.lord]}</td>
              <td className={`${td} whitespace-nowrap tabular-nums`}>{span(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PanchangaHoursView({ h }: { h: PanchangaHours }) {
  const pl = h.hora?.place ?? h.choghadiya?.place ?? null;
  const dayLord = h.hora?.dayLord ?? h.choghadiya?.dayLord ?? null;
  return (
    <section className={`${card} p-3`} aria-label="Gezegen saatleri ve Choghadiya" data-testid="astro-vedic-panchanga-hours">
      <h4 className="text-sm font-semibold text-slate-900">Gezegen saatleri (Hora) ve Choghadiya · {dmy(h.date)}</h4>
      <p className="text-xs text-slate-600">
        {pl ? `${pl.label ? `${pl.label} · ` : ""}${pl.latitude.toFixed(4)}°, ${pl.longitude.toFixed(4)}° · saatler yerel (${offLabel(pl.utcOffsetHours)})` : ""}
        {dayLord ? ` · gün yöneticisi ${GRAHA_LABELS[dayLord]}` : ""}
      </p>
      {h.missing.length > 0 && (
        <p className="mt-1 text-xs text-amber-800" data-testid="astro-panchanga-hours-missing">
          Bu kayıtta eksik bölüm: {h.missing.map((m) => (m === "hora" ? "Hora" : "Choghadiya")).join(", ")} (hesaplanamadı).
        </p>
      )}
      {h.hora && (
        <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2" data-testid="astro-panchanga-hora">
          <HoraTable title="Gündüz horaları (gün doğumu → gün batımı)" rows={h.hora.day} testId="astro-hora-day" />
          <HoraTable title="Gece horaları (gün batımı → ertesi gün doğumu)" rows={h.hora.night} testId="astro-hora-night" />
        </div>
      )}
      {h.choghadiya && (
        <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2" data-testid="astro-panchanga-choghadiya">
          <ChoghadiyaTable title="Gündüz choghadiya" rows={h.choghadiya.day} testId="astro-choghadiya-day" />
          <ChoghadiyaTable title="Gece choghadiya" rows={h.choghadiya.night} testId="astro-choghadiya-night" />
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-500">{PANCHANGA_HOURS_NOTE} “(+1)” ertesi gün demektir.</p>
    </section>
  );
}
