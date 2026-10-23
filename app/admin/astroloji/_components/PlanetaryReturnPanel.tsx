"use client";

/**
 * Gezegen dönüşü (Satürn / Jüpiter / Mars / Venüs / Merkür) — teknik sonuç görünümü (2026-10-22). Yalnız kanonik teknik katman:
 * seçilen kavuşum, kesin dönüş anı (UTC + konumun yerel saati + doğum ofsetli hesap saati), natal ↔ dönüş anı boylamı ve tutarlılık
 * farkı, dönüş haritası çarkı, gezegen / ev / açı tabloları. Sağlayıcı yorumu bu panelde DEĞİL, ayrı yorum katmanındadır.
 * Aynı bileşen canlı sonuç ve kayıtlı analiz (arşiv) görünümünde kullanılır.
 */

import { useState } from "react";
import type { AspectType } from "@/lib/astrology/model/western";
import { PLANETARY_RETURN_CYCLE_NOTE, PLANETARY_RETURN_LABELS, PLANETARY_RETURN_METHOD_TEXT, PLANETARY_RETURN_TYPICAL_INTERVAL, motionLabel, type PlanetaryReturnTechnical } from "@/lib/astrology/model/westernPlanetaryReturn";
import { ASPECT_GLYPHS, ASPECT_LABELS, BODY_GLYPHS, BODY_LABELS, HOUSE_SYSTEM_LABELS, NATURE_LABELS, SIGN_GLYPHS, SIGN_LABELS, formatDegree } from "@/lib/astrology/labels/tr";
import NatalWheel, { type WheelChart } from "./NatalWheel";

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
function localIn(utcIso: string, timeZone: string | null): string | null {
  if (!timeZone) return null;
  try {
    return new Intl.DateTimeFormat("tr-TR", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }).format(new Date(utcIso));
  } catch {
    return null;
  }
}

const utcText = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC`;
const localText = (v: string) => `${v.slice(8, 10)}.${v.slice(5, 7)}.${v.slice(0, 4)} ${v.slice(11, 16)}`;
const offText = (h: number) => `UTC${h >= 0 ? "+" : "−"}${String(Math.floor(Math.abs(h))).padStart(2, "0")}:${String(Math.round((Math.abs(h) % 1) * 60)).padStart(2, "0")}`;

function Sign({ sign, degree }: { sign: keyof typeof SIGN_LABELS; degree: number }) {
  return (
    <span className="whitespace-nowrap">
      <span className="mr-1">{SIGN_GLYPHS[sign]}</span>
      {SIGN_LABELS[sign]} {formatDegree(degree)}
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
  const [onlyMajor, setOnlyMajor] = useState(true);
  const lbl = PLANETARY_RETURN_LABELS[t.planet];
  const c = t.chart;
  const relocated = !!place?.locationId;
  const local = localIn(t.returnUtc, place?.timezone ?? null);
  const rq = t.requested;
  const aspects = [...c.aspects].filter((a) => !onlyMajor || MAJOR.has(a.type)).sort((a, b) => a.orb - b.orb);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="astro-planetary-return-panel">
      <Section title={lbl.title} right={<span className="text-xs text-slate-500">{HOUSE_SYSTEM_LABELS[c.houseSystem]}</span>}>
        <dl>
          <Row label="Seçilen kavuşum" testId="astro-pr-crossing">
            {rq.crossing}. kavuşum / {rq.of}
            {rq.of > 1 ? " (retro döngüsü)" : ""} · {motionLabel(rq.motion)} · hedef tarih {localText(`${rq.approximateDate}T00:00`).slice(0, 10)}
          </Row>
          <Row label="Kesin dönüş anı (UTC)" testId="astro-pr-utc">
            <strong>{utcText(t.returnUtc)}</strong>
          </Row>
          <Row label={relocated ? "Dönüş konumu yerel saati" : "Doğum yeri yerel saati"} testId="astro-pr-local">
            {local ? `${local}${place?.label ? ` · ${place.label}` : ""}` : "gösterilmiyor (saat dilimi doğrulanamadı)"}
          </Row>
          <Row label="Hesap saati (doğum ofseti)" testId="astro-pr-provider-local">
            {localText(t.returnLocal)} · {offText(t.returnOffsetHours)}
          </Row>
          <Row label={`Natal ${lbl.planet}`} testId="astro-pr-natal">
            <Sign sign={t.natalPoint.sign} degree={t.natalPoint.degreeInSign} /> <span className="text-xs text-slate-500">({t.natalPoint.longitude.toFixed(4).replace(".", ",")}°)</span>
          </Row>
          <Row label={`Dönüş anında ${lbl.planet}`} testId="astro-pr-return">
            <Sign sign={t.returnPoint.sign} degree={t.returnPoint.degreeInSign} /> <span className="text-xs text-slate-500">({t.returnPoint.longitude.toFixed(4).replace(".", ",")}°)</span>
            {t.returnPoint.retrograde && <span className="ml-1 font-semibold text-rose-600">℞</span>}
          </Row>
          <Row label="Tutarlılık denetimi" testId="astro-pr-delta">
            |dönüş − natal| = {(t.longitudeDelta * 3600).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}″ · eşik 0,05° · doğrulandı
          </Row>
          <Row label="Hesaplama konumu" testId="astro-pr-place">
            {place?.label ?? "doğum yeri"} ({Math.abs(t.location.latitude).toFixed(2)}° {t.location.latitude >= 0 ? "K" : "G"}, {Math.abs(t.location.longitude).toFixed(2)}° {t.location.longitude >= 0 ? "D" : "B"})
            {relocated ? " · farklı konum" : " · doğum yeri"}
          </Row>
          <Row label="Tipik dönüş aralığı" testId="astro-pr-interval">
            {PLANETARY_RETURN_TYPICAL_INTERVAL[t.planet]}
          </Row>
        </dl>
      </Section>
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600" data-testid="astro-pr-method">
        {PLANETARY_RETURN_METHOD_TEXT}
        {(t.planet === "mercury" || t.planet === "venus") && <span className="mt-1 block">{PLANETARY_RETURN_CYCLE_NOTE}</span>}
      </p>
      {showWheel && <NatalWheel technical={planetaryReturnWheel(t)} label={`${lbl.title} çarkı`} />}
      {c.angles && (c.angles.ascendant || c.angles.midheaven) && (
        <p className="text-sm text-slate-700" data-testid="astro-pr-angles">
          {c.angles.ascendant && (
            <>
              Yükselen <Sign sign={c.angles.ascendant.sign} degree={c.angles.ascendant.degreeInSign} />
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
              · Şans Noktası <Sign sign={c.points.partOfFortune.sign} degree={c.points.partOfFortune.degreeInSign} />
              {c.points.partOfFortune.house ? ` (${c.points.partOfFortune.house}. ev)` : ""}
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
      <Section title="Dönüş haritası gök cisimleri" testId="astro-pr-bodies">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Gök cismi</th>
              <th className={th}>Burç / derece</th>
              <th className={th}>Ev</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {c.bodies.map((b) => (
              <tr key={b.id} className={b.id === t.planet ? "bg-amber-50" : undefined}>
                <td className={td}>
                  <span className="mr-1.5">{BODY_GLYPHS[b.id]}</span>
                  {BODY_LABELS[b.id]}
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
        <Section title="Ev başlangıçları (cusp)" testId="astro-pr-cusps">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 text-sm sm:grid-cols-3">
            {c.houses.map((h) => (
              <div key={h.number} className="flex items-center justify-between gap-2 border-b border-slate-50 py-1">
                <span className="font-medium text-slate-600">{h.number}. ev</span>
                <Sign sign={h.sign} degree={h.degreeInSign} />
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section
        title={`Açılar (${aspects.length}/${c.aspects.length})`}
        testId="astro-pr-aspects"
        right={
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={onlyMajor} onChange={(e) => setOnlyMajor(e.target.checked)} /> yalnız majör açılar
          </label>
        }
      >
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Açı</th>
              <th className={th}>Orb</th>
              <th className={th}>Nitelik</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {aspects.map((a, i) => (
              <tr key={`${a.a}-${a.b}-${a.type}-${i}`}>
                <td className={td}>
                  {BODY_GLYPHS[a.a]} {ASPECT_GLYPHS[a.type]} {BODY_GLYPHS[a.b]}{" "}
                  <span className="text-xs text-slate-500">
                    {BODY_LABELS[a.a]} {ASPECT_LABELS[a.type]} {BODY_LABELS[a.b]}
                  </span>
                </td>
                <td className={`${td} tabular-nums`}>{formatDegree(a.orb)}</td>
                <td className={td}>{a.nature ? NATURE_LABELS[a.nature] : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
