"use client";

/**
 * 2026-10-22 — Deklinasyon paralelleri (aylık) TEKNİK görünümü. Yalnız kanonik teknik katman (doğrulanmış sağlayıcı alanları)
 * gösterilir; hesap YAPILMAZ — filtre, gün şeridi ve tablo yalnız düzenlemedir. OOB (sınır dışı) işareti sağlayıcının deklinasyon
 * değerinden türetilen gösterimdir. Aynı bileşen canlı sonuç ve kayıtlı analiz (arşiv) görünümünde kullanılır. 390 / 768 genişlikte
 * tablo yatay kaydırılır, filtreler alt alta iner.
 */

import { useMemo, useState } from "react";
import { BODY_GLYPHS, BODY_LABELS } from "@/lib/astrology/labels/tr";
import {
  DECLINATION_BODIES,
  DECLINATION_METHOD_TEXT,
  DECLINATION_OOB_NOTE,
  DECLINATION_SCOPE_TEXT,
  DECLINATION_TYPE_GLYPHS,
  DECLINATION_TYPE_LABELS,
  declinationMonthLabel,
  fmtDeclination,
  fmtOrb,
  isOutOfBounds,
  type DeclinationContactType,
  type DeclinationParallelsTechnical,
} from "@/lib/astrology/model/westernDeclination";
import { formatInZone } from "@/lib/astrology/transitDetail";
import type { KbLookup } from "./VedicPanels";

const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const th = "whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "whitespace-nowrap px-2 py-1.5 text-sm text-slate-800";
const sel = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm";
const utcL = (v: string) => `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)} ${v.slice(11, 16)}`;

export function DeclinationParallelsPanel({ t, displayTz, kbLookup }: { t: DeclinationParallelsTechnical; displayTz?: string | null; kbLookup?: KbLookup | null }) {
  const [type, setType] = useState<"all" | DeclinationContactType>("all");
  const [body, setBody] = useState<string>("all");
  const tz = displayTz && displayTz !== "UTC" ? displayTz : null;
  const present = useMemo(() => DECLINATION_BODIES.filter((b) => t.contacts.some((c) => c.a === b || c.b === b)), [t.contacts]);
  const shown = useMemo(() => t.contacts.filter((c) => (type === "all" || c.type === type) && (body === "all" || c.a === body || c.b === body)), [t.contacts, type, body]);
  const days = useMemo(() => {
    const y = Number(t.month.slice(0, 4));
    const m = Number(t.month.slice(5, 7));
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: n }, (_, i) => {
      const d = `${t.month}-${String(i + 1).padStart(2, "0")}`;
      const list = shown.filter((c) => c.exactUtc.startsWith(d));
      return { d, day: i + 1, parallel: list.filter((c) => c.type === "parallel").length, contra: list.filter((c) => c.type === "contraparallel").length };
    });
  }, [t.month, shown]);
  const kb = kbLookup ? kbLookup([...new Set(shown.map((c) => `declination_${c.type}:${c.a}:${c.b}`))]) : null;

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-declination-panel">
      <section className={`${card} p-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-700">Deklinasyon paralelleri — {declinationMonthLabel(t.month)}</h4>
          <span className="text-xs text-slate-500">
            yer merkezli · tarihin ekvatoru · orb ≤ {fmtOrb(t.orbLimit)} · {t.nodeType === "mean" ? "ortalama düğüm" : "gerçek düğüm"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-800" data-testid="astro-declination-summary">
          {t.summary.total} temas · {DECLINATION_TYPE_LABELS.parallel.toLocaleLowerCase("tr-TR")} {t.summary.parallel} · {DECLINATION_TYPE_LABELS.contraparallel.toLocaleLowerCase("tr-TR")} {t.summary.contraparallel}
        </p>
        <p className="text-xs text-slate-500">Saatler UTC{tz ? ` ve ${tz} yerel saatiyle` : ""} gösterilir; ay sınırı UTC&apos;dir.</p>
      </section>

      <section className={`${card} flex min-w-0 flex-wrap items-center gap-2 p-3 text-xs`} data-testid="astro-declination-filters">
        <label className="flex min-w-0 flex-wrap items-center gap-1.5">
          Tür
          <select className={sel} value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Temas türü filtresi" data-dp-filter="type">
            <option value="all">Tümü</option>
            <option value="parallel">Paralel ∥</option>
            <option value="contraparallel">Kontraparalel ⋕</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-wrap items-center gap-1.5">
          Gök cismi
          <select className={sel} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Gök cismi filtresi" data-dp-filter="body">
            <option value="all">Tümü</option>
            {present.map((b) => (
              <option key={b} value={b}>
                {BODY_LABELS[b]}
              </option>
            ))}
          </select>
        </label>
        <span className="text-slate-500" data-testid="astro-declination-count">
          {shown.length} / {t.contacts.length} temas
        </span>
      </section>

      <section className={`${card} overflow-x-auto p-3`} data-testid="astro-declination-strip">
        <h4 className="mb-2 text-sm font-semibold text-slate-700">Ay şeridi (UTC günü)</h4>
        <ol className="grid min-w-[18rem] grid-cols-7 gap-1 sm:grid-cols-[repeat(16,minmax(0,1fr))]">
          {days.map((d) => (
            <li key={d.d} className={`rounded-md border px-1 py-1 text-center ${d.parallel + d.contra > 0 ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white"}`} title={`${d.day}: paralel ${d.parallel}, kontraparalel ${d.contra}`}>
              <div className="text-[11px] font-semibold text-slate-500">{d.day}</div>
              <div className="text-[11px] leading-tight text-indigo-900">
                {d.parallel > 0 && <span>∥{d.parallel > 1 ? d.parallel : ""}</span>} {d.contra > 0 && <span>⋕{d.contra > 1 ? d.contra : ""}</span>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${card} overflow-x-auto`} data-testid="astro-declination-table">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Kesinleşme (UTC)</th>
              {tz && <th className={th}>Yerel ({tz})</th>}
              <th className={th}>Tür</th>
              <th className={th}>Gök cisimleri</th>
              <th className={th}>Deklinasyon 1</th>
              <th className={th}>Deklinasyon 2</th>
              <th className={th}>Orb</th>
              <th className={th}>OOB</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((c) => {
              const local = tz ? formatInZone(c.exactUtc, tz) : null;
              const oob = [isOutOfBounds(c.declinationA, c.exactUtc) ? BODY_LABELS[c.a] : null, isOutOfBounds(c.declinationB, c.exactUtc) ? BODY_LABELS[c.b] : null].filter(Boolean).join(", ");
              return (
                <tr key={`${c.a}-${c.b}-${c.type}-${c.exactUtc}`} data-dp-row={c.type}>
                  <td className={`${td} tabular-nums`}>{utcL(c.exactUtc)}</td>
                  {tz && <td className={`${td} tabular-nums`}>{local ? `${local.text} (${local.zone})` : "—"}</td>}
                  <td className={td}>
                    {DECLINATION_TYPE_GLYPHS[c.type]} {DECLINATION_TYPE_LABELS[c.type]}
                  </td>
                  <td className={td}>
                    {BODY_GLYPHS[c.a]} {BODY_LABELS[c.a]} – {BODY_GLYPHS[c.b]} {BODY_LABELS[c.b]}
                  </td>
                  <td className={`${td} tabular-nums`}>{fmtDeclination(c.declinationA)}</td>
                  <td className={`${td} tabular-nums`}>{fmtDeclination(c.declinationB)}</td>
                  <td className={`${td} tabular-nums`}>{fmtOrb(c.orb)}</td>
                  <td className={td}>{oob || "—"}</td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td className="px-2 py-3 text-sm text-slate-500" colSpan={tz ? 8 : 7}>
                  {t.contacts.length === 0 ? "Bu ayda seçilen orb içinde deklinasyon teması yok." : "Filtreye uyan temas yok."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {kb !== null && (
        <div className={`${card} px-3 py-2`} data-testid="astro-declination-kb">
          <div className="text-xs font-semibold text-indigo-900">Bilgi Bankam</div>
          {kb.length === 0 ? (
            <p className="text-xs text-slate-500">Listelenen temaslar için Bilgi Bankası kaydınız yok.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {kb.map((e) => (
                <li key={`${e.topicKey}-${e.title}`} className="rounded-lg bg-white px-2 py-1 text-xs">
                  <div className="font-medium text-indigo-900">{e.topicLabel}</div>
                  <div className="font-semibold text-slate-800">{e.title}</div>
                  <p className="whitespace-pre-line text-slate-700">{e.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-slate-500" data-testid="astro-declination-method">
        {DECLINATION_METHOD_TEXT}
      </p>
      <p className="text-xs leading-relaxed text-slate-500" data-testid="astro-declination-scope">
        {DECLINATION_SCOPE_TEXT}
      </p>
      <p className="text-xs leading-relaxed text-slate-500">{DECLINATION_OOB_NOTE}</p>
    </div>
  );
}
