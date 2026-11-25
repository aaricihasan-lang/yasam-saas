"use client";

/**
 * Gezegen dönüşü (Satürn / Jüpiter / Mars / Venüs / Merkür) — teknik sonuç görünümü (2026-10-22). Yalnız kanonik teknik katman:
 * seçilen kavuşum, kesin dönüş anı (UTC + konumun yerel saati + doğum ofsetli hesap saati), natal ↔ dönüş anı boylamı ve tutarlılık
 * farkı, dönüş haritası çarkı, gezegen / ev / açı tabloları. Sağlayıcı yorumu bu panelde DEĞİL, ayrı yorum katmanındadır.
 * Aynı bileşen canlı sonuç ve kayıtlı analiz (arşiv) görünümünde kullanılır.
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { AspectType } from "@/lib/astrology/model/western";
import type { PlanetaryReturnTechnical } from "@/lib/astrology/model/westernPlanetaryReturn";
import { ASPECT_GLYPHS, BODY_GLYPHS, SIGN_GLYPHS, type SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import NatalWheel, { type WheelChart } from "./NatalWheel";
import { fitGridCell, fitGridStyle } from "./atlas/fitGrid";
import { formatZoned } from "@/lib/astrology/birth/zonedFormat";

export type PlanetaryReturnPlace = { locationId: string | null; label: string; latitude: number; longitude: number; timezone: string | null };

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const MAJOR = new Set<AspectType>(["conjunction", "opposition", "trine", "square", "sextile"]);

/** Dönüş haritasının çark verisi (Solar/Lunar Return ile aynı dönüşüm). */
export function planetaryReturnWheel(t: PlanetaryReturnTechnical): WheelChart {
  const c = t.chart;
  return {
    bodies: c.bodies,
    houses: c.houses,
    angles: c.angles?.ascendant && c.angles.midheaven ? { ascendant: c.angles.ascendant, midheaven: c.angles.midheaven } : null,
    aspects: c.aspects,
  };
}

/** IANA saat dilimiyle yerel saat; dilim yok/geçersizse null (tahmin yok). */
function localIn(utcIso: string, timeZone: string | null, locale: string): string | null {
  if (!timeZone) return null;
  try {
    return formatZoned(locale === "en" ? "en-GB" : "tr-TR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }, Date.parse(utcIso), timeZone);
  } catch {
    return null;
  }
}

/** I18N-F1-R5 (ATLAS-B): EN gün/ay/yıl "/" ayırıcısı (Owner A13); TR `GG.AA.YYYY` aynen. Yalnız gösterim. */
const sepOf = (locale: string) => (locale === "en" ? "/" : ".");
const utcText = (iso: string, locale: string) => {
  const s = sepOf(locale);
  return `${iso.slice(8, 10)}${s}${iso.slice(5, 7)}${s}${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC`;
};
const localText = (v: string, locale: string) => {
  const s = sepOf(locale);
  return `${v.slice(8, 10)}${s}${v.slice(5, 7)}${s}${v.slice(0, 4)} ${v.slice(11, 16)}`;
};
const dec = (n: number, digits: number, locale: string) => (locale === "en" ? n.toFixed(digits) : n.toFixed(digits).replace(".", ","));
const offText = (h: number) => `UTC${h >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(h))).padStart(2, "0")}:${String(Math.round((Math.abs(h) % 1) * 60)).padStart(2, "0")}`;

function Sign({ sign, degree }: { sign: keyof typeof SIGN_LABELS; degree: number }) {
  const tt = useTranslations("terms");
  return (
    <span className="whitespace-nowrap">
      <span className="mr-1">{SIGN_GLYPHS[sign]}</span>
      {tt(`zodiac.${sign}`)} {formatDegree(degree)}
    </span>
  );
}

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-b border-slate-100 px-3 py-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:w-56">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-slate-800" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

function Section({ title, right, children, testId }: { title: string; right?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        {right}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export function PlanetaryReturnPanel({ t, place = null, showWheel = true }: { t: PlanetaryReturnTechnical; place?: PlanetaryReturnPlace | null; showWheel?: boolean }) {
  const tr = useTranslations("atlas.planetaryReturn");
  const tt = useTranslations("terms");
  const tm = useTranslations("atlas.timingMore");
  const locale = useLocale();
  const [onlyMajor, setOnlyMajor] = useState(true);
  const title = tr(`title.${t.planet}`);
  const planetName = tr(`planet.${t.planet}`);
  const c = t.chart;
  const relocated = !!place?.locationId;
  const local = localIn(t.returnUtc, place?.timezone ?? null, locale);
  const rq = t.requested;
  const aspects = [...c.aspects].filter((a) => !onlyMajor || MAJOR.has(a.type)).sort((a, b) => a.orb - b.orb);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-planetary-return-panel">
      <Section title={title} right={<span className="text-xs text-slate-500">{tt(`houseSystem.${c.houseSystem}`)}</span>}>
        <dl>
          <Row label={tr("crossingLabel")} testId="astro-pr-crossing">
            {tr("crossingValue", { crossing: rq.crossing, of: rq.of, retro: rq.of > 1 ? tr("retroCycle") : "", motion: tr(`motion.${rq.motion}`), date: localText(`${rq.approximateDate}T00:00`, locale).slice(0, 10) })}
          </Row>
          <Row label={tr("utcLabel")} testId="astro-pr-utc">
            <strong>{utcText(t.returnUtc, locale)}</strong>
          </Row>
          <Row label={relocated ? tr("localRelocated") : tr("localBirth")} testId="astro-pr-local">
            {local ? `${local}${place?.label ? ` · ${place.label}` : ""}` : tr("localUnknown")}
          </Row>
          <Row label={tr("providerLocalLabel")} testId="astro-pr-provider-local">
            {localText(t.returnLocal, locale)} · {offText(t.returnOffsetHours)}
          </Row>
          <Row label={tr("natalLabel", { planet: planetName })} testId="astro-pr-natal">
            <Sign sign={t.natalPoint.sign} degree={t.natalPoint.degreeInSign} /> <span className="text-xs text-slate-500">({dec(t.natalPoint.longitude, 4, locale)}°)</span>
          </Row>
          <Row label={tr("returnLabel", { planet: planetName })} testId="astro-pr-return">
            <Sign sign={t.returnPoint.sign} degree={t.returnPoint.degreeInSign} /> <span className="text-xs text-slate-500">({dec(t.returnPoint.longitude, 4, locale)}°)</span>
            {t.returnPoint.retrograde && <span className="ml-1 font-semibold text-rose-600">℞</span>}
          </Row>
          <Row label={tr("deltaLabel")} testId="astro-pr-delta">
            {tr("deltaValue", { delta: (t.longitudeDelta * 3600).toLocaleString(locale === "en" ? "en-GB" : "tr-TR", { maximumFractionDigits: 2 }) })}
          </Row>
          <Row label={tr("placeLabel")} testId="astro-pr-place">
            {place?.label ?? tr("birthPlace")} ({Math.abs(t.location.latitude).toFixed(2)}° {tm(`dir.${t.location.latitude >= 0 ? "N" : "S"}`)}, {Math.abs(t.location.longitude).toFixed(2)}° {tm(`dir.${t.location.longitude >= 0 ? "E" : "W"}`)})
            {relocated ? tr("relocatedSuffix") : tr("birthSuffix")}
          </Row>
          <Row label={tr("intervalLabel")} testId="astro-pr-interval">
            {tr(`interval.${t.planet}`)}
          </Row>
        </dl>
      </Section>
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600" data-testid="astro-pr-method">
        {tr("methodText")}
        {(t.planet === "mercury" || t.planet === "venus") && <span className="mt-1 block">{tr("cycleNote")}</span>}
      </p>
      {showWheel && <NatalWheel technical={planetaryReturnWheel(t)} label={tr("wheelLabel", { title })} />}
      {c.angles && (c.angles.ascendant || c.angles.midheaven) && (
        <p className="text-sm text-slate-700" data-testid="astro-pr-angles">
          {c.angles.ascendant && (
            <>
              {tr("asc")} <Sign sign={c.angles.ascendant.sign} degree={c.angles.ascendant.degreeInSign} />
            </>
          )}
          {c.angles.midheaven && (
            <>
              {" "}
              · MC <Sign sign={c.angles.midheaven.sign} degree={c.angles.midheaven.degreeInSign} />
            </>
          )}
          {c.points.partOfFortune && (
            <>
              {" "}
              · {tr("fortune")} <Sign sign={c.points.partOfFortune.sign} degree={c.points.partOfFortune.degreeInSign} />
              {c.points.partOfFortune.house ? tr("inHouse", { n: c.points.partOfFortune.house }) : ""}
            </>
          )}
          {c.points.vertex && (
            <>
              {" "}
              · Vertex <Sign sign={c.points.vertex.sign} degree={c.points.vertex.degreeInSign} />
            </>
          )}
        </p>
      )}
      <Section title={tr("bodiesTitle")} testId="astro-pr-bodies">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>{tr("colBody")}</th>
              <th className={th}>{tr("colSign")}</th>
              <th className={th}>{tr("colHouse")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {c.bodies.map((b) => (
              <tr key={b.id} className={b.id === t.planet ? "bg-amber-50" : undefined}>
                <td className={td}>
                  <span className="mr-1.5">{BODY_GLYPHS[b.id]}</span>
                  {tt(`body.${b.id}`)}
                  {b.retrograde && <span className="ml-1 font-semibold text-rose-600">℞</span>}
                </td>
                <td className={td}>
                  <Sign sign={b.sign} degree={b.degreeInSign} />
                </td>
                <td className={td}>{b.house ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {c.houses.length > 0 && (
        <Section title={tr("cuspsTitle")} testId="astro-pr-cusps">
          <div className="grid gap-y-1 px-3 py-2 text-sm" style={fitGridStyle()} data-fit-grid="cusps">
            {c.houses.map((h) => (
              <div key={h.number} className={fitGridCell}>
                <span className="font-medium text-slate-600">{tr("houseN", { n: h.number })}</span>
                <Sign sign={h.sign} degree={h.degreeInSign} />
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section
        title={tr("aspectsTitle", { shown: aspects.length, total: c.aspects.length })}
        testId="astro-pr-aspects"
        right={
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={onlyMajor} onChange={(e) => setOnlyMajor(e.target.checked)} /> {tr("majorOnly")}
          </label>
        }
      >
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>{tr("colAspect")}</th>
              <th className={th}>{tr("colOrb")}</th>
              <th className={th}>{tr("colNature")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {aspects.map((a, i) => (
              <tr key={`${a.a}-${a.b}-${a.type}-${i}`}>
                <td className={td}>
                  {BODY_GLYPHS[a.a]} {ASPECT_GLYPHS[a.type]} {BODY_GLYPHS[a.b]}{" "}
                  <span className="text-xs text-slate-500">
                    {tt(`body.${a.a}`)} {tt(`aspect.${a.type}`)} {tt(`body.${a.b}`)}
                  </span>
                </td>
                <td className={`${td} tabular-nums`}>{formatDegree(a.orb)}</td>
                <td className={td}>{a.nature ? tt(`aspectNature.${a.nature}`) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
