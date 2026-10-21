"use client";

/**
 * 2026-10-22 — KP ruling planets ZAMAN TARAMASI görünümü (`kp.ruling_interval`). Değerler sağlayıcıdan gelir; burada hesap YOK —
 * tablo + değişim anları (bir önceki ana göre değişen lord; türetilmiş gösterim). Yöntem farkı (anın haritası ↔ natal) en üstte
 * açıkça yazılır. Geniş tablo kendi kutusunda yatay kayar (sayfa taşmaz); significator ayrıntısı satır başına açılır.
 */

import { useMemo, useState } from "react";
import { KP_RI_CHANGE_LABEL, KP_RI_METHOD_NOTE, KP_RI_NUMBER_NOTE, KP_RI_RULE_NOTE, kpIntervalChanges, type KpRiChangeKey, type KpRulingIntervalTechnical } from "@/lib/astrology/model/kpRulingInterval";
import { gs } from "../_lib/kpChart";
import { grahaTrName } from "../_lib/kundliLocalize";
import type { KbLookup } from "./VedicPanels";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1 text-sm text-slate-800";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const dmyhm = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)} ${s.slice(11, 16)}`;
const offLabel = (off: number) => `UTC${off >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(off))).padStart(2, "0")}:${String(Math.round((Math.abs(off) % 1) * 60)).padStart(2, "0")}`;

export function KpRulingIntervalPanel({ t, kbLookup, placeLabel }: { t: KpRulingIntervalTechnical; kbLookup?: KbLookup | null; placeLabel?: string | null }) {
  const changes = useMemo(() => kpIntervalChanges(t.rows), [t.rows]);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const planets = [...new Set(t.rows.flatMap((r) => r.rulingPlanets))];
  const kb = kbLookup ? kbLookup(planets.map((p) => `kp_ruling_planet:${p}`)) : null;
  const w = t.window;
  const moments = t.rows.map((r, i) => ({ r, i, c: changes[i] })).filter((x) => x.c.length > 0);
  const hl = (i: number, k: KpRiChangeKey) => (changes[i].includes(k) ? "bg-amber-50 font-semibold text-amber-900" : "");
  const rows = t.rows.map((r, i) => ({ r, i })).filter((x) => !onlyChanges || x.i === 0 || changes[x.i].length > 0);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-kp-ruling-interval-panel">
      <p className="text-sm text-slate-700">
        <strong>KP ruling planets zaman taraması</strong> · {dmyhm(w.startLocal)} → {dmyhm(w.endLocal)} yerel ({offLabel(w.utcOffsetHours)}) · {w.intervalMinutes} dk adım · {t.rows.length} an · gözlem yeri{" "}
        {placeLabel ? `${placeLabel} (${t.place.latitude.toFixed(4)}, ${t.place.longitude.toFixed(4)})` : `${t.place.latitude.toFixed(4)}, ${t.place.longitude.toFixed(4)}`} · {t.frame.ayanamsa === "kp-old" ? "KP (eski tablo)" : "KP-Newcomb"} · düğüm{" "}
        {t.nodeType === "true" ? "gerçek" : "ortalama"}
      </p>
      <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900" data-testid="astro-kp-ri-method">
        {KP_RI_METHOD_NOTE}
      </p>
      <p className="text-xs text-slate-500">
        {KP_RI_RULE_NOTE} {KP_RI_NUMBER_NOTE}
      </p>
      <section className={`${card} p-3`} aria-label="Değişim anları" data-testid="astro-kp-ri-changes">
        <h4 className="text-sm font-semibold text-slate-900">Değişim anları ({moments.length})</h4>
        {moments.length === 0 ? (
          <p className="text-xs text-slate-500">Pencere boyunca lordlar değişmedi.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-0.5 text-sm">
            {moments.map(({ r, i, c }) => (
              <li key={i} className="min-w-0 break-words">
                <span className="tabular-nums font-medium">{r.local.slice(11, 16)}</span> — {c.map((k) => KP_RI_CHANGE_LABEL[k]).join(", ")}
              </li>
            ))}
          </ul>
        )}
      </section>
      <label className="flex items-center gap-1.5 text-xs text-slate-700">
        <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} data-kp-ri-only-changes="toggle" /> Yalnız değişim anlarını göster
      </label>
      <div className={`${card} overflow-x-auto`}>
        <table className="min-w-full" data-testid="astro-kp-ri-table">
          <thead>
            <tr>
              <th className={th} rowSpan={2}>
                An (yerel)
              </th>
              <th className={th} rowSpan={2}>
                Gün L.
              </th>
              <th className={th} colSpan={4}>
                Lagna (ASC)
              </th>
              <th className={th} colSpan={4}>
                Ay
              </th>
              <th className={th} rowSpan={2}>
                Ruling planets
              </th>
              <th className={th} rowSpan={2}>
                Ayrıntı
              </th>
            </tr>
            <tr>
              {["Burç", "Yıldız", "Sub", "Sub-sub", "Burç", "Yıldız", "Sub", "Sub-sub"].map((h, i) => (
                <th key={i} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ i }) => (
              <RowPair key={i} t={t} i={i} open={open === i} onToggle={() => setOpen(open === i ? null : i)} hl={hl} changed={changes[i].length > 0} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Vurgulu hücre: bir önceki ana göre değişen lord. Significator&apos;lar her satırın “Ayrıntı” düğmesinde (o anın haritası).</p>
      <section className="min-w-0 rounded-xl border border-amber-200 bg-amber-50/40 p-3 text-sm" aria-label="KP ruling Bilgi Bankası">
        <div className="text-xs font-semibold text-indigo-900">Bilgi Bankam</div>
        {kb === null ? (
          <p className="text-xs text-slate-500">Bilgi Bankası eşleşmeleri çalışma alanı yüklenince görünür.</p>
        ) : kb.length === 0 ? (
          <p className="text-xs text-slate-500">Taramadaki ruling planet&apos;ler ({planets.map(grahaTrName).join(", ")}) için Bilgi Bankası kaydınız yok.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {kb.map((e) => (
              <li key={`${e.topicKey}-${e.title}`} className="rounded-lg bg-white px-2 py-1 text-xs">
                <div className="font-medium text-indigo-900">{e.topicLabel}</div>
                <div className="font-semibold text-slate-800">{e.title}</div>
                <p className="whitespace-pre-line text-slate-700">{e.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RowPair({ t, i, open, onToggle, hl, changed }: { t: KpRulingIntervalTechnical; i: number; open: boolean; onToggle: () => void; hl: (i: number, k: KpRiChangeKey) => string; changed: boolean }) {
  const r = t.rows[i];
  const lv = (x: { 1: number[]; 2: number[]; 3: number[]; 4: number[] }) => ([1, 2, 3, 4] as const).map((l) => `L${l} ${x[l].length ? x[l].join(", ") : "—"}`).join(" · ");
  return (
    <>
      <tr data-kp-ri-row={i} data-kp-ri-changed={changed ? "1" : "0"}>
        <td className={`${td} whitespace-nowrap tabular-nums font-medium`}>{r.local.slice(11, 16)}</td>
        <td className={`${td} whitespace-nowrap ${hl(i, "dayLord")}`}>{gs(r.dayLord)}</td>
        <td className={`${td} whitespace-nowrap ${hl(i, "lagna.sign")}`}>{gs(r.lagna.sign)}</td>
        <td className={`${td} whitespace-nowrap ${hl(i, "lagna.star")}`}>{gs(r.lagna.star)}</td>
        <td className={`${td} whitespace-nowrap ${hl(i, "lagna.sub")}`}>{gs(r.lagna.sub)}</td>
        <td className={`${td} whitespace-nowrap ${hl(i, "lagna.subSub")}`}>{gs(r.lagna.subSub)}</td>
        <td className={`${td} whitespace-nowrap ${hl(i, "moon.sign")}`}>{gs(r.moon.sign)}</td>
        <td className={`${td} whitespace-nowrap ${hl(i, "moon.star")}`}>{gs(r.moon.star)}</td>
        <td className={`${td} whitespace-nowrap ${hl(i, "moon.sub")}`}>{gs(r.moon.sub)}</td>
        <td className={`${td} whitespace-nowrap ${hl(i, "moon.subSub")}`}>{gs(r.moon.subSub)}</td>
        <td className={`${td} whitespace-nowrap ${hl(i, "rulingPlanets")}`}>{r.rulingPlanets.map(grahaTrName).join(", ")}</td>
        <td className={td}>
          <button type="button" className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700" onClick={onToggle} aria-expanded={open} data-kp-ri-detail={i}>
            {open ? "Kapat" : "Aç"}
          </button>
        </td>
      </tr>
      {open && (
        <tr data-kp-ri-detail-row={i}>
          <td className={`${td} bg-slate-50 text-xs`} colSpan={12}>
            <div className="flex flex-col gap-1">
              <div>
                <strong>Significator&apos;lar (o anın haritası, güç sırası):</strong> {r.significators.map((x) => `${grahaTrName(x.id)}: ${x.houses.join(", ")}`).join(" · ")}
              </div>
              <div>Ay burç lordu: {lv(r.moonLevels.signLord)}</div>
              <div>Ay yıldız lordu: {lv(r.moonLevels.starLord)}</div>
              <div>Ay sub lordu: {lv(r.moonLevels.subLord)}</div>
              <div>Ay: {lv(r.moonLevels.moon)}</div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
