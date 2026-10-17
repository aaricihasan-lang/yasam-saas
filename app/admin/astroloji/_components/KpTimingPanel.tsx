"use client";

/**
 * TRANSİT-03 (2026-10-17) — KP Transit ZAMAN ARALIĞI görünümü: Sub-Lord değişimleri, Rasi geçişleri, KP konum tablosu.
 * Yalnız kanonik teknik katman (sağlayıcı bu uçlarda yorum metni vermez). Anlar UTC saklanır; gösterim seçilen IANA
 * diliminde (yaz/kış saati dahil) ve UTC karşılığıyla. Uzun listeler sayfalı gösterilir (veri kırpılmaz; "daha fazla").
 * KP yöntemi Batı açılarıyla karıştırılmaz: yalnız KP numarası, yıldız (nakshatra) lordu, sub-lord ve rasi.
 */

import { useMemo, useState } from "react";
import type { KpTimingPlanet, KpTimingTechnical } from "@/lib/astrology/model/kp";
import { SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import { GRAHA_LABELS } from "@/lib/astrology/topics/vedic";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const inp = "max-w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs";
const PAGE = 100;
const KP_AY: Record<string, string> = { "kp-newcomb": "KP-Newcomb", "kp-old": "KP (eski tablo)" };
const short = (id: string) => (GRAHA_LABELS[id as keyof typeof GRAHA_LABELS] ?? id).split(" ")[0];
const dmy = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

function validZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
/** UTC anı → "GG.AA.YYYY SS:DD GMT+3" (seçilen bölge). */
export function kpAt(utcIso: string, tz: string): string {
  const ms = Date.parse(utcIso);
  if (!Number.isFinite(ms)) return utcIso;
  if (tz === "UTC") return `${dmy(utcIso)} ${utcIso.slice(11, 16)} UTC`;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute} ${p.timeZoneName}`;
}

function Pager({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (shown >= total) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-600">
      <span>
        {shown} / {total} satır gösteriliyor
      </span>
      <button type="button" className="rounded-lg border border-slate-300 px-2 py-1 hover:bg-slate-50" onClick={onMore} data-testid="astro-kp-more">
        {Math.min(PAGE, total - shown)} satır daha göster
      </button>
    </div>
  );
}

export function KpTimingPanel({ t, options = {} }: { t: KpTimingTechnical; options?: Record<string, unknown> }) {
  const [tz, setTz] = useState(validZone(options.displayTz) ? options.displayTz : "UTC");
  const [planet, setPlanet] = useState<KpTimingPlanet | "">("");
  const [nSub, setNSub] = useState(PAGE);
  const [nRasi, setNRasi] = useState(PAGE);
  const [nPos, setNPos] = useState(PAGE);
  const subRows = useMemo(
    () => t.sublord.filter((x) => !planet || x.planet === planet).flatMap((x) => x.changes.map((c) => ({ planet: x.planet, ...c }))).sort((a, b) => a.atUtc.localeCompare(b.atUtc)),
    [t.sublord, planet],
  );
  const rasiRows = useMemo(
    () => t.rasi.filter((x) => !planet || x.planet === planet).flatMap((x) => x.changes.map((c) => ({ planet: x.planet, ...c }))).sort((a, b) => a.atUtc.localeCompare(b.atUtc)),
    [t.rasi, planet],
  );
  const zones = [...new Set([validZone(options.displayTz) ? options.displayTz : "UTC", "Europe/Istanbul", "UTC"])];
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-kp-timing-panel">
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
        <p>
          <strong>KP Transit · zaman aralığı</strong> · {dmy(t.window.startDate)} – {dmy(t.window.endDate)} (UTC günleri, iki uç dahil) · {KP_AY[t.frame.ayanamsa] ?? t.frame.ayanamsa}
          {t.frame.ayanamsaDegrees !== null ? ` (${formatDegree(t.frame.ayanamsaDegrees)})` : ""} · Ay düğümü {t.nodeType === "true" ? "gerçek" : "ortalama"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <label className="flex items-center gap-1">
            gösterim saat dilimi
            <select className={inp} value={tz} onChange={(e) => setTz(e.target.value)} aria-label="KP aralık gösterim saat dilimi (sonuç)">
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </label>
          {t.planets.length > 1 && (
            <label className="flex items-center gap-1">
              gezegen
              <select className={inp} value={planet} onChange={(e) => setPlanet(e.target.value as KpTimingPlanet | "")} aria-label="KP aralık gezegen filtresi">
                <option value="">Tümü</option>
                {t.planets.map((p) => (
                  <option key={p} value={p}>
                    {GRAHA_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          Anlar sağlayıcıdan UTC alınır ve seçilen bölgede gösterilir (yaz/kış saati her an için ayrı uygulanır). KP yalnız KP numarası, yıldız (nakshatra) lordu, sub-lord ve rasi ile
          okunur; Batı açıları bu görünümde yoktur.
        </p>
      </div>
      {t.missing.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="astro-kp-missing">
          Hesaplanamayan parçalar: {t.missing.map((m) => { const [k, p] = m.split(":"); return `${k === "sublord" ? "Sub-Lord" : k === "rasi" ? "Rasi" : "Konum tablosu"}${p ? ` (${GRAHA_LABELS[p as KpTimingPlanet] ?? p})` : ""}`; }).join(", ")}. Liste bu parçalar için eksiktir; yeniden çalıştırınca yalnız eksikler istenir.
        </p>
      )}

      {t.kinds.includes("sublord") && (
        <section className="rounded-xl border border-slate-200 bg-white" data-testid="astro-kp-sublord">
          <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Sub-Lord değişimleri ({subRows.length})</h4>
          {subRows.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">Bu aralıkta Sub-Lord değişimi yok.</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100 sm:hidden">
                {subRows.slice(0, nSub).map((c, i) => (
                  <li key={`${c.planet}-${c.atUtc}-${i}`} className="px-3 py-2 text-sm">
                    <div className="text-xs tabular-nums text-slate-500">{kpAt(c.atUtc, tz)}</div>
                    <div>
                      <strong>{short(c.planet)}</strong> · KP {c.fromKp} ({short(c.fromStar)}/{short(c.fromSub)}) → KP {c.toKp} ({short(c.toStar)}/{short(c.toSub)})
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto sm:block">
                <table className="min-w-full" data-testid="astro-kp-sublord-table">
                  <thead>
                    <tr>
                      <th className={th}>An ({tz})</th>
                      <th className={th}>Gezegen</th>
                      <th className={th}>Önceki KP · yıldız / sub</th>
                      <th className={th}>Yeni KP · yıldız / sub</th>
                      <th className={th}>UTC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subRows.slice(0, nSub).map((c, i) => (
                      <tr key={`${c.planet}-${c.atUtc}-${i}`}>
                        <td className={`${td} whitespace-nowrap tabular-nums`}>{kpAt(c.atUtc, tz)}</td>
                        <td className={td}>{GRAHA_LABELS[c.planet]}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          {c.fromKp} · {short(c.fromStar)} / {short(c.fromSub)}
                        </td>
                        <td className={`${td} whitespace-nowrap font-medium`}>
                          {c.toKp} · {short(c.toStar)} / {short(c.toSub)}
                          {c.fromStar !== c.toStar && <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-800">yıldız değişti</span>}
                        </td>
                        <td className={`${td} whitespace-nowrap text-xs tabular-nums text-slate-500`}>{kpAt(c.atUtc, "UTC").slice(11)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager shown={Math.min(nSub, subRows.length)} total={subRows.length} onMore={() => setNSub((n) => n + PAGE)} />
            </>
          )}
        </section>
      )}

      {t.kinds.includes("rasi") && (
        <section className="rounded-xl border border-slate-200 bg-white" data-testid="astro-kp-rasi">
          <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Rasi (burç) geçişleri ({rasiRows.length})</h4>
          {rasiRows.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">Bu aralıkta rasi geçişi yok.</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {rasiRows.slice(0, nRasi).map((c, i) => (
                  <li key={`${c.planet}-${c.atUtc}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="text-xs tabular-nums text-slate-500">{kpAt(c.atUtc, tz)}</span>
                    <strong>{short(c.planet)}</strong>
                    <span>
                      {SIGN_GLYPHS[c.fromRashi]} {SIGN_LABELS[c.fromRashi]} ({short(c.fromLord)}) → {SIGN_GLYPHS[c.toRashi]} {SIGN_LABELS[c.toRashi]} ({short(c.toLord)})
                    </span>
                  </li>
                ))}
              </ul>
              <Pager shown={Math.min(nRasi, rasiRows.length)} total={rasiRows.length} onMore={() => setNRasi((n) => n + PAGE)} />
            </>
          )}
        </section>
      )}

      {t.positions && (
        <section className="rounded-xl border border-slate-200 bg-white" data-testid="astro-kp-positions">
          <h4 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
            KP konum tablosu ({t.positions.rows.length} an · {t.positions.intervalMinutes >= 60 ? `${t.positions.intervalMinutes / 60} saatte bir` : `${t.positions.intervalMinutes} dk`})
          </h4>
          <div className="overflow-x-auto">
            <table className="min-w-full" data-testid="astro-kp-positions-table">
              <thead>
                <tr>
                  <th className={`${th} sticky left-0 bg-white`}>An ({tz})</th>
                  {t.positions.rows[0]?.bodies.map((b) => (
                    <th key={b.id} className={th}>
                      {short(b.id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {t.positions.rows.slice(0, nPos).map((r) => (
                  <tr key={r.atUtc}>
                    <td className={`${td} sticky left-0 whitespace-nowrap bg-white text-xs tabular-nums`}>{kpAt(r.atUtc, tz)}</td>
                    {r.bodies.map((b) => (
                      <td key={b.id} className={`${td} whitespace-nowrap text-xs`}>
                        {SIGN_GLYPHS[b.rashi]} {formatDegree(b.degreeInRashi)}
                        {b.retrograde && b.id !== "rahu" && b.id !== "ketu" ? " ℞" : ""}
                        <div className="text-[11px] text-slate-500">
                          KP {b.kpNumber} · {short(b.starLord)}/{short(b.subLord)}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager shown={Math.min(nPos, t.positions.rows.length)} total={t.positions.rows.length} onMore={() => setNPos((n) => n + PAGE)} />
        </section>
      )}
    </div>
  );
}
