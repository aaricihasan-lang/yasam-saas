"use client";

/**
 * 22.10 (Draft) — Sade Sati DÖNEM TARİHLERİ bölümü. Yalnız teknik veride `periodsStatus` varsa (sunucu bayrağı
 * ASTROLOGY_SADE_SATI_PERIODS açıkken) çizilir; bayrak kapalıyken bileşen hiçbir şey göstermez (ekran eskisiyle aynı).
 * Hesap YAPILMAZ: kayıtlı/teknik veriyi düzenler. Mobilde tablolar yatay kaydırılır.
 */

import { SIGN_GLYPHS, SIGN_LABELS } from "@/lib/astrology/labels/tr";
import type { SignId } from "@/lib/astrology/model/western";
import type { SadeSatiPeriods } from "@/lib/astrology/sadeSati/periods";
import { SADE_SATI_PERIODS_STATUS_TEXT, SS_PERIODS_METHOD_TEXT, SS_PERIODS_SCOPE_NOTE, SS_PERIODS_SOURCE_TEXT, SS_PHASE_SHORT, SS_RELATION_LABEL, ssIstanbul, ssMoonBoundaryText, ssUtc, type SadeSatiPeriodsStatus } from "@/lib/astrology/sadeSati/labels";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-xs text-slate-800 align-top";
const card = "min-w-0 rounded-xl border border-slate-200 bg-white";
const sign = (s: string) => `${SIGN_GLYPHS[s as SignId] ?? ""} ${SIGN_LABELS[s as SignId] ?? s}`.trim();

export function SadeSatiPeriodsPanel({ periods, status }: { periods: SadeSatiPeriods | undefined; status: SadeSatiPeriodsStatus | undefined }) {
  if (!status) return null;
  if (status.state !== "ok" || !periods) {
    return (
      <section className={`${card} p-3`} data-testid="astro-sade-sati-periods" data-periods-state={status.state}>
        <h4 className="text-sm font-semibold text-slate-700">Sade Sati dönem tarihleri</h4>
        <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{SADE_SATI_PERIODS_STATUS_TEXT[status.state === "ok" ? "" : status.reason] ?? "Dönem tarihleri gösterilemiyor."}</p>
      </section>
    );
  }
  const warn = ssMoonBoundaryText(periods);
  return (
    <section className={`${card} flex min-w-0 flex-col gap-3 p-3`} data-testid="astro-sade-sati-periods" data-periods-state="ok">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-700">Sade Sati dönem tarihleri</h4>
        <span className="text-[11px] text-slate-500">yöntem K1 · katalog v{periods.catalog.version}</span>
      </div>
      {warn && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="astro-sade-sati-moon-boundary">
          {warn}
        </p>
      )}
      {periods.cycles.length === 0 && <p className="text-xs text-slate-600">Katalog kapsamında listelenecek dönem yok.</p>}
      {periods.cycles.map((c, ci) => (
        <div key={`${c.start ?? "x"}-${ci}`} className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-100 p-2" data-testid="astro-sade-sati-cycle" data-relation={c.relation}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`text-sm font-semibold ${c.relation === "active" ? "text-amber-800" : "text-slate-800"}`}>{SS_RELATION_LABEL[c.relation]}</span>
            <span className="text-xs text-slate-700">
              {ssUtc(c.start)} → {ssUtc(c.end)}
            </span>
            {c.partial && <span className="text-[11px] text-slate-500">(kısmi: katalog kapsamı dışına taşıyor)</span>}
            {c.beginsBeforeBirth && <span className="text-[11px] text-slate-500">(doğumdan önce başlamış)</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[34rem] w-full">
              <thead>
                <tr>
                  <th className={th}>Evre</th>
                  <th className={th}>Satürn</th>
                  <th className={th}>Giriş (UTC)</th>
                  <th className={th}>Giriş (Türkiye saati)</th>
                  <th className={th}>Çıkış (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {c.segments.map((s, si) => (
                  <tr key={si} data-testid="astro-sade-sati-segment">
                    <td className={td}>{SS_PHASE_SHORT[s.phase]}</td>
                    <td className={td}>{sign(s.sign)}</td>
                    <td className={td}>
                      {ssUtc(s.start?.utc)}
                      {s.start?.motion === "retrograde" && <span className="ml-1 text-[11px] text-slate-500">geri dönüş (℞)</span>}
                      {s.start?.nearStation && <span className="ml-1 text-[11px] text-amber-700">duraklamaya yakın</span>}
                    </td>
                    <td className={td}>{ssIstanbul(s.start?.utc)}</td>
                    <td className={td}>
                      {ssUtc(s.end?.utc)}
                      {s.end?.nearStation && <span className="ml-1 text-[11px] text-amber-700">duraklamaya yakın</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.interruptions.length > 0 && (
            <ul className="text-xs text-slate-700" data-testid="astro-sade-sati-interruptions">
              {c.interruptions.map((x, xi) => (
                <li key={xi}>
                  Kesinti: Satürn {sign(x.sign)} burcunda (geçici çıkış) — {ssUtc(x.start)} → {ssUtc(x.end)}
                </li>
              ))}
            </ul>
          )}
          <details className="text-xs text-slate-700">
            <summary className="cursor-pointer text-sky-700">Karşılaştırma: K2a (ilk giriş) ve K2b (kalıcı giriş)</summary>
            <div className="mt-1 overflow-x-auto">
              <table className="min-w-[30rem] w-full" data-testid="astro-sade-sati-k2">
                <thead>
                  <tr>
                    <th className={th}>Evre</th>
                    <th className={th}>K2a başlangıç → bitiş</th>
                    <th className={th}>K2b başlangıç → bitiş</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(["rising", "peak", "setting"] as const).map((ph) => (
                    <tr key={ph}>
                      <td className={td}>{SS_PHASE_SHORT[ph]}</td>
                      <td className={td}>
                        {ssUtc(c.k2a[ph].start)} → {ssUtc(c.k2a[ph].end)}
                      </td>
                      <td className={td}>
                        {ssUtc(c.k2b[ph].start)} → {ssUtc(c.k2b[ph].end)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      ))}
      <p className="text-[11px] text-slate-500">{SS_PERIODS_METHOD_TEXT}</p>
      <p className="text-[11px] text-slate-500">{SS_PERIODS_SOURCE_TEXT}</p>
      <p className="text-[11px] text-slate-500">{SS_PERIODS_SCOPE_NOTE}</p>
    </section>
  );
}
