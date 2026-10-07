"use client";

/**
 * Aşama 3 teknik sonuç görünümleri — her teknik KENDİ doğal veri yapısıyla gösterilir (hepsi tek tabloya
 * zorlanmaz). Yalnız kanonik teknik katman kullanılır; etiketler Yaşam sözlüğünden (labels/tr).
 * Sağlayıcı metni bu dosyada GÖRÜNMEZ (yorum ayrı panelde).
 */

import { useMemo, useState, type ReactNode } from "react";
import type { AspectType, BodyId, NatalAspect, NatalHouse, NatalTechnical, SignId } from "@/lib/astrology/model/western";
import type {
  CompositeTechnical,
  ForecastEvent,
  ForecastTechnical,
  PointId,
  ProgressionTechnical,
  ReturnTechnical,
  SolarArcTechnical,
  SynastryTechnical,
  TransitTechnical,
} from "@/lib/astrology/model/westernTiming";
import {
  ASPECT_GLYPHS,
  ASPECT_LABELS,
  BODY_GLYPHS,
  BODY_LABELS,
  HOUSE_SYSTEM_LABELS,
  NATURE_LABELS,
  SIGN_GLYPHS,
  SIGN_LABELS,
  formatDegree,
} from "@/lib/astrology/labels/tr";
import NatalWheel, { type WheelChart } from "./NatalWheel";
import NatalTechnicalPanel from "./NatalTechnicalPanel";
import { AstrocartographyPanel, LocalSpacePanel, RelocationPanel, type Place } from "./LocationPanels";
import { VedicD1Panel, VedicDashaPanel, VedicVargaPanel, type DashaDrill, type KbLookup } from "./VedicPanels";
import type {
  VedicAshtakavargaTechnical,
  VedicD1Technical,
  VedicDashaTechnical,
  VedicDrishtiTechnical,
  VedicGrahaId,
  VedicPanchangaTechnical,
  VedicShadbalaTechnical,
  VedicVargaTechnical,
} from "@/lib/astrology/model/vedic";
import { VedicAshtakavargaPanel, VedicDrishtiPanel, VedicPanchangaPanel, VedicShadbalaPanel } from "./VedicExtraPanels";
import type { AstrocartographyTechnical, LocalSpaceTechnical, RelocationTechnical } from "@/lib/astrology/model/westernLocation";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
const MAJOR = new Set<AspectType>(["conjunction", "opposition", "trine", "square", "sextile"]);

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        {right}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function SignCell({ sign, degree }: { sign: SignId; degree: number }) {
  return (
    <span className="whitespace-nowrap">
      <span className="mr-1">{SIGN_GLYPHS[sign]}</span>
      {SIGN_LABELS[sign]} {formatDegree(degree)}
    </span>
  );
}

const pointLabel = (p: PointId) => (p === "ascendant" ? "Yükselen" : p === "midheaven" ? "MC" : BODY_LABELS[p as BodyId]);
const pointGlyph = (p: PointId) => (p === "ascendant" ? "ASC" : p === "midheaven" ? "MC" : BODY_GLYPHS[p as BodyId]);

function Point({ id, prefix }: { id: PointId; prefix?: string }) {
  return (
    <span className="whitespace-nowrap">
      {prefix && <span className="mr-1 text-[11px] text-slate-500">{prefix}</span>}
      <span className="mr-1">{pointGlyph(id)}</span>
      {pointLabel(id)}
    </span>
  );
}

function NatureBadge({ n }: { n: keyof typeof NATURE_LABELS | null }) {
  if (!n) return <span className="text-slate-400">—</span>;
  const c = n === "harmonious" ? "bg-sky-50 text-sky-800" : n === "challenging" ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ${c}`}>{NATURE_LABELS[n]}</span>;
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {warnings.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}

function MajorToggle({ only, set }: { only: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1 text-xs text-slate-600">
      <input type="checkbox" checked={only} onChange={(e) => set(e.target.checked)} /> yalnız majör açılar
    </label>
  );
}

/** Tek harita içi açı tablosu (return / composite). */
function ChartAspects({ aspects }: { aspects: NatalAspect[] }) {
  const [only, setOnly] = useState(true);
  const list = [...aspects].filter((a) => !only || MAJOR.has(a.type)).sort((a, b) => a.orb - b.orb);
  return (
    <Section title={`Açılar (${list.length}/${aspects.length})`} right={<MajorToggle only={only} set={setOnly} />}>
      <table className="min-w-full">
        <thead>
          <tr>
            <th className={th}>Açı</th>
            <th className={th}>Orb</th>
            <th className={th}>Nitelik</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {list.map((a, i) => (
            <tr key={`${a.a}-${a.b}-${a.type}-${i}`}>
              <td className={td}>
                {BODY_GLYPHS[a.a]} {ASPECT_GLYPHS[a.type]} {BODY_GLYPHS[a.b]}{" "}
                <span className="text-xs text-slate-500">
                  {BODY_LABELS[a.a]} {ASPECT_LABELS[a.type]} {BODY_LABELS[a.b]}
                </span>
              </td>
              <td className={`${td} tabular-nums`}>{formatDegree(a.orb)}</td>
              <td className={td}>
                <NatureBadge n={a.nature} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function BodiesTable({ bodies, showHouse }: { bodies: { id: BodyId; sign: SignId; degreeInSign: number; house: number | null; retrograde: boolean }[]; showHouse: boolean }) {
  return (
    <table className="min-w-full">
      <thead>
        <tr>
          <th className={th}>Gök cismi</th>
          <th className={th}>Burç / derece</th>
          {showHouse && <th className={th}>Ev</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {bodies.map((b) => (
          <tr key={b.id}>
            <td className={td}>
              <span className="mr-1.5">{BODY_GLYPHS[b.id]}</span>
              {BODY_LABELS[b.id]}
              {b.retrograde && <span className="ml-1 font-semibold text-rose-600">℞</span>}
            </td>
            <td className={td}>
              <SignCell sign={b.sign} degree={b.degreeInSign} />
            </td>
            {showHouse && <td className={td}>{b.house ?? "—"}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cusps({ houses }: { houses: NatalHouse[] }) {
  if (houses.length === 0) return null;
  return (
    <Section title="Ev başlangıçları (cusp)">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 text-sm sm:grid-cols-3">
        {houses.map((h) => (
          <div key={h.number} className="flex items-center justify-between gap-2 border-b border-slate-50 py-1">
            <span className="font-medium text-slate-600">{h.number}. ev</span>
            <SignCell sign={h.sign} degree={h.degreeInSign} />
          </div>
        ))}
      </div>
    </Section>
  );
}

const fmtUtc = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC`;
const fmtDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

// ─── Transit ────────────────────────────────────────────────────────────────
export function TransitPanel({ t }: { t: TransitTechnical }) {
  const [only, setOnly] = useState(true);
  const list = [...t.aspects].filter((a) => !only || MAJOR.has(a.type)).sort((a, b) => a.orb - b.orb);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Transit anı: <strong>{fmtUtc(t.atUtc)}</strong>
        {t.summary.harmonious !== null && (
          <span className="ml-2 text-xs text-slate-500">
            uyumlu {t.summary.harmonious} · zorlayıcı {t.summary.challenging} · nötr {t.summary.neutral}
          </span>
        )}
      </p>
      <Section title={`Transit → natal açılar (${list.length}/${t.aspects.length})`} right={<MajorToggle only={only} set={setOnly} />}>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Transit</th>
              <th className={th}>Açı</th>
              <th className={th}>Natal</th>
              <th className={th}>Orb</th>
              <th className={th}>Seyir</th>
              <th className={th}>Nitelik</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((a, i) => (
              <tr key={`${a.transit}-${a.type}-${a.natal}-${i}`}>
                <td className={td}>
                  <Point id={a.transit} />
                </td>
                <td className={td}>
                  {ASPECT_GLYPHS[a.type]} {ASPECT_LABELS[a.type]}
                </td>
                <td className={td}>
                  <Point id={a.natal} prefix="natal" />
                </td>
                <td className={`${td} tabular-nums`}>{formatDegree(a.orb)}</td>
                <td className={td}>{a.applying ? "yaklaşıyor" : "ayrılıyor"}</td>
                <td className={td}>
                  <NatureBadge n={a.nature} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Transit gök cisimleri">
        <BodiesTable bodies={t.bodies.map((b) => ({ ...b, house: null }))} showHouse={false} />
      </Section>
    </div>
  );
}

// ─── Forecast ───────────────────────────────────────────────────────────────
const EVENT_LABELS: Record<ForecastEvent["type"], string> = {
  transit_aspect: "Transit açı",
  sign_ingress: "Burç girişi",
  retrograde_station: "İstasyon",
  eclipse: "Tutulma",
  lunar_phase: "Ay evresi",
};
const ECLIPSE_LABELS: Record<string, string> = { penumbral: "yarıgölge", partial: "parçalı", annular: "halkalı", total: "tam" };

function eventText(e: ForecastEvent): string {
  const body = e.body ? BODY_LABELS[e.body] : "";
  switch (e.type) {
    case "transit_aspect":
      return `${body} ${e.aspect ? ASPECT_LABELS[e.aspect] : ""} natal ${e.targetBody ? pointLabel(e.targetBody) : ""}`;
    case "sign_ingress":
      return `${body} ${e.targetSign ? SIGN_LABELS[e.targetSign] : ""} burcuna girer`;
    case "retrograde_station":
      return `${body} ${e.station === "retrograde" ? "retro" : "direkt"} istasyonu`;
    case "eclipse":
      return `${e.body === "moon" ? "Ay" : "Güneş"} tutulması${e.eclipseKind ? ` (${ECLIPSE_LABELS[e.eclipseKind]})` : ""}${e.obscuration !== null ? ` · örtme %${Math.round(e.obscuration * 100)}` : ""}`;
    case "lunar_phase":
      return `${e.phase === "new_moon" ? "Yeni Ay" : "Dolunay"}${e.targetSign ? ` — ${SIGN_LABELS[e.targetSign]}` : ""}`;
  }
}

export function ForecastPanel({ t }: { t: ForecastTechnical }) {
  const [types, setTypes] = useState<Set<ForecastEvent["type"]>>(() => new Set(["transit_aspect", "sign_ingress", "retrograde_station", "eclipse", "lunar_phase"]));
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of t.events) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return m;
  }, [t.events]);
  const byMonth = useMemo(() => {
    const m = new Map<string, ForecastEvent[]>();
    for (const e of t.events) {
      if (!types.has(e.type)) continue;
      const k = e.date.slice(0, 7);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [t.events, types]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Dönem: <strong>{fmtDay(t.window.start)}</strong> – <strong>{fmtDay(t.window.end)}</strong> · {t.events.length} olay
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Olay türü filtresi">
        {(Object.keys(EVENT_LABELS) as ForecastEvent["type"][]).map((k) => (
          <label key={k} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${types.has(k) ? "border-violet-300 bg-violet-50 text-violet-900" : "border-slate-200 text-slate-500"}`}>
            <input
              type="checkbox"
              checked={types.has(k)}
              onChange={(e) => {
                const n = new Set(types);
                if (e.target.checked) n.add(k);
                else n.delete(k);
                setTypes(n);
              }}
            />
            {EVENT_LABELS[k]} ({counts.get(k) ?? 0})
          </label>
        ))}
      </div>
      {byMonth.length === 0 ? (
        <p className="text-sm text-slate-500">Seçili türde olay yok.</p>
      ) : (
        byMonth.map(([month, list]) => (
          <Section key={month} title={`${month.slice(5, 7)}.${month.slice(0, 4)} (${list.length})`}>
            <table className="min-w-full">
              <tbody className="divide-y divide-slate-100">
                {list.map((e, i) => (
                  <tr key={`${e.datetime}-${i}`}>
                    <td className={`${td} whitespace-nowrap tabular-nums text-slate-500`}>{fmtUtc(e.datetime)}</td>
                    <td className={td}>
                      <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{EVENT_LABELS[e.type]}</span>
                      {eventText(e)}
                    </td>
                    <td className={`${td} tabular-nums text-xs text-slate-500`}>{e.orb !== null ? `orb ${formatDegree(e.orb)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        ))
      )}
    </div>
  );
}

// ─── Secondary progression ──────────────────────────────────────────────────
export function ProgressionPanel({ t }: { t: ProgressionTechnical }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Hedef tarih <strong>{fmtDay(t.targetDate)}</strong>
        {t.progressedDate && (
          <>
            {" "}
            · ilerletilmiş gün <strong>{fmtDay(t.progressedDate)}</strong>
          </>
        )}
        {t.elapsedYears !== null && <> · {t.elapsedYears.toFixed(2)} yıl</>}
      </p>
      <p className="text-xs text-slate-500">Ev yerleşimi: ilerletilmiş Yükselen&apos;den sayılan tam burç evi (sağlayıcı yöntemi).</p>
      {t.angles && (
        <Section title="İlerletilmiş açısal noktalar">
          <table className="min-w-full">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className={td}>Yükselen</td>
                <td className={td}>
                  <SignCell sign={t.angles.ascendant.sign} degree={t.angles.ascendant.degreeInSign} />
                </td>
              </tr>
              <tr>
                <td className={td}>MC</td>
                <td className={td}>
                  <SignCell sign={t.angles.midheaven.sign} degree={t.angles.midheaven.degreeInSign} />
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}
      <Section title="İlerletilmiş gök cisimleri">
        <BodiesTable bodies={t.bodies} showHouse={t.angles !== null} />
      </Section>
    </div>
  );
}

// ─── Solar arc ──────────────────────────────────────────────────────────────
export function SolarArcPanel({ t }: { t: SolarArcTechnical }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Hedef tarih <strong>{fmtDay(t.targetDate)}</strong> · yay <strong>{formatDegree(t.arc)}</strong> ({t.arc.toFixed(3)}°)
      </p>
      <Section title="Yönlendirilmiş (directed) noktalar">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Nokta</th>
              <th className={th}>Natal</th>
              <th className={th}>Directed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.directed.map((d) => (
              <tr key={d.id}>
                <td className={td}>
                  <Point id={d.id} />
                </td>
                <td className={`${td} tabular-nums text-slate-500`}>{d.natalLongitude.toFixed(2)}°</td>
                <td className={td}>
                  <SignCell sign={d.sign} degree={d.degreeInSign} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title={`Directed → natal açılar (${t.aspects.length})`}>
        <p className="px-3 pt-2 text-xs text-slate-500">Yöntem: Yaşam Sistemi aritmetiği — majör açılar, orb ≤ 1° (sağlayıcı bu açıları vermez).</p>
        <table className="min-w-full">
          <tbody className="divide-y divide-slate-100">
            {[...t.aspects]
              .sort((a, b) => a.orb - b.orb)
              .map((a, i) => (
                <tr key={`${a.directed}-${a.type}-${a.natal}-${i}`}>
                  <td className={td}>
                    <Point id={a.directed} prefix="SA" />
                  </td>
                  <td className={td}>
                    {ASPECT_GLYPHS[a.type]} {ASPECT_LABELS[a.type]}
                  </td>
                  <td className={td}>
                    <Point id={a.natal} prefix="natal" />
                  </td>
                  <td className={`${td} tabular-nums`}>{formatDegree(a.orb)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

// ─── Solar / Lunar return ───────────────────────────────────────────────────
export type ReturnPlace = { locationId: string | null; label: string; latitude: number; longitude: number; timezone: string | null };

/** Dönüş anı UTC (sağlayıcının yerel saati − ofset). Ayrıştırılamazsa null (tahmin yok). */
export function returnUtcIso(t: Pick<ReturnTechnical, "returnLocal" | "returnOffsetHours">): string | null {
  const local = t.returnLocal.length === 16 ? `${t.returnLocal}:00` : t.returnLocal;
  const ms = Date.parse(`${local}Z`) - t.returnOffsetHours * 3600_000;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** IANA saat dilimiyle yerel saat; dilim yok/geçersizse null (tahmin üretilmez → yalnız UTC gösterilir). */
export function localTimeIn(utcIso: string, timeZone: string | null): string | null {
  if (!timeZone) return null;
  try {
    return new Intl.DateTimeFormat("tr-TR", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }).format(new Date(utcIso));
  } catch {
    return null;
  }
}

export function ReturnPanel({ t, place = null }: { t: ReturnTechnical; place?: ReturnPlace | null }) {
  const c = t.chart;
  const wheel: WheelChart = {
    bodies: c.bodies,
    houses: c.houses,
    angles: c.angles?.ascendant && c.angles.midheaven ? { ascendant: c.angles.ascendant, midheaven: c.angles.midheaven } : null,
    aspects: c.aspects,
  };
  const off = t.returnOffsetHours;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Dönüş anı: <strong>{t.returnLocal.replace("T", " ").slice(0, 16)}</strong> (UTC{off >= 0 ? "+" : "−"}
        {Math.abs(off)}) · natal {t.kind === "solar" ? "Güneş" : "Ay"} <SignCell sign={t.natalPoint.sign} degree={t.natalPoint.degreeInSign} /> ·{" "}
        {HOUSE_SYSTEM_LABELS[c.houseSystem]}
      </p>
      {(() => {
        const utc = returnUtcIso(t);
        const local = utc && place ? localTimeIn(utc, place.timezone) : null;
        const relocated = !!place?.locationId;
        return (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="astro-return-place">
            <div>
              <strong>Hesaplama konumu:</strong>{" "}
              {place ? `${place.label} (${Math.abs(t.location.latitude).toFixed(2)}° ${t.location.latitude >= 0 ? "K" : "G"}, ${Math.abs(t.location.longitude).toFixed(2)}° ${t.location.longitude >= 0 ? "D" : "B"})` : "doğum yeri"}
              {relocated ? " · farklı konum (relocated return)" : " · doğum yeri"}
            </div>
            <div className="text-xs text-slate-600">
              Kesin dönüş anı: <strong>{utc ? `${utc.slice(0, 16).replace("T", " ")} UTC` : "—"}</strong>
              {local ? ` · ${place?.label?.split(",")[0] ?? "konum"} yerel saati: ${local}` : " · konumun yerel saati gösterilmiyor (saat dilimi doğrulanamadı)"}
            </div>
            <div className="text-[11px] text-slate-500">Dönüş anı konumdan bağımsızdır (doğum anı aynı); konum yalnız Yükselen/MC ve evleri değiştirir.</div>
          </div>
        );
      })()}
      {t.kind === "lunar" && (
        <p className="text-xs text-slate-500" data-testid="astro-lunar-sequence">
          {t.requested.sequence
            ? `Ayın ${t.requested.sequence}. lunar return'ü (beklenen ~${(t.requested.expectedUtc ?? "").replace("T", " ")} UTC; sağlayıcı anı bununla doğrulandı)`
            : "Ayın ilk lunar return'ü (eski kayıt — dönüş sırası saklanmamış)"}
        </p>
      )}
      <NatalWheel technical={wheel} label={t.kind === "solar" ? "Solar return çarkı" : "Lunar return çarkı"} />
      {c.angles && (c.angles.ascendant || c.angles.midheaven) && (
        <p className="text-sm text-slate-700">
          {c.angles.ascendant && (
            <>
              Yükselen <SignCell sign={c.angles.ascendant.sign} degree={c.angles.ascendant.degreeInSign} />
            </>
          )}
          {c.angles.midheaven && (
            <>
              {" "}
              · MC <SignCell sign={c.angles.midheaven.sign} degree={c.angles.midheaven.degreeInSign} />
            </>
          )}
        </p>
      )}
      <Section title="Dönüş haritası gök cisimleri">
        <BodiesTable bodies={c.bodies} showHouse />
      </Section>
      <Cusps houses={c.houses} />
      <ChartAspects aspects={c.aspects} />
    </div>
  );
}

// ─── Synastry ───────────────────────────────────────────────────────────────
export function SynastryPanel({ t, names }: { t: SynastryTechnical; names: [string, string] }) {
  const [only, setOnly] = useState(true);
  const list = [...t.aspects].filter((a) => !only || MAJOR.has(a.type)).sort((a, b) => a.orb - b.orb);
  const person = (idx: 0 | 1) => {
    const p = idx === 0 ? t.person1 : t.person2;
    const other = names[idx === 0 ? 1 : 0];
    const anyHouse = p.bodies.some((b) => b.house !== null);
    const anyOver = p.bodies.some((b) => b.houseInOther !== null);
    return (
      <Section title={`${idx + 1}. kişi — ${names[idx]}`}>
        {p.ascendant && (
          <p className="px-3 pt-2 text-sm text-slate-700">
            Yükselen <SignCell sign={p.ascendant.sign} degree={p.ascendant.degreeInSign} />
          </p>
        )}
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>Gök cismi</th>
              <th className={th}>Burç / derece</th>
              {anyHouse && <th className={th}>Kendi evi</th>}
              {anyOver && <th className={th}>{other} evinde</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {p.bodies.map((b) => (
              <tr key={b.id}>
                <td className={td}>
                  <span className="mr-1.5">{BODY_GLYPHS[b.id]}</span>
                  {BODY_LABELS[b.id]}
                  {b.retrograde && <span className="ml-1 font-semibold text-rose-600">℞</span>}
                </td>
                <td className={td}>
                  <SignCell sign={b.sign} degree={b.degreeInSign} />
                </td>
                {anyHouse && <td className={td}>{b.house ?? "—"}</td>}
                {anyOver && <td className={td}>{b.houseInOther ?? "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
        {t.compatibilityScore !== null && (
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Sağlayıcı uyum skoru: {t.compatibilityScore.toFixed(1)}</span>
        )}
        {t.summary.total !== null && (
          <span className="text-xs text-slate-500">
            {t.summary.total} açı · uyumlu {t.summary.harmonious ?? "—"} · zorlayıcı {t.summary.challenging ?? "—"} · nötr {t.summary.neutral ?? "—"}
          </span>
        )}
      </div>
      <Section title={`Kişiler arası açılar (${list.length}/${t.aspects.length})`} right={<MajorToggle only={only} set={setOnly} />}>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>{names[0]}</th>
              <th className={th}>Açı</th>
              <th className={th}>{names[1]}</th>
              <th className={th}>Orb</th>
              <th className={th}>Nitelik</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((a, i) => (
              <tr key={`${a.a}-${a.type}-${a.b}-${i}`}>
                <td className={td}>
                  <Point id={a.a} />
                </td>
                <td className={td}>
                  {ASPECT_GLYPHS[a.type]} {ASPECT_LABELS[a.type]}
                </td>
                <td className={td}>
                  <Point id={a.b} />
                </td>
                <td className={`${td} tabular-nums`}>{formatDegree(a.orb)}</td>
                <td className={td}>
                  <NatureBadge n={a.nature} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <div className="grid gap-3 xl:grid-cols-2">
        {person(0)}
        {person(1)}
      </div>
    </div>
  );
}

// ─── Composite ──────────────────────────────────────────────────────────────
export function CompositePanel({ t }: { t: CompositeTechnical }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">Yöntem: orta nokta (midpoint) · {HOUSE_SYSTEM_LABELS[t.houseSystem]}</p>
      <NatalWheel technical={t} label="Composite çarkı" />
      {t.angles && (
        <p className="text-sm text-slate-700">
          Yükselen <SignCell sign={t.angles.ascendant.sign} degree={t.angles.ascendant.degreeInSign} /> · MC{" "}
          <SignCell sign={t.angles.midheaven.sign} degree={t.angles.midheaven.degreeInSign} />
        </p>
      )}
      <Section title="Composite gök cisimleri">
        <BodiesTable bodies={t.bodies} showHouse={t.bodies.some((b) => b.house !== null)} />
      </Section>
      <Cusps houses={t.houses} />
      <ChartAspects aspects={t.aspects} />
    </div>
  );
}

/** Teknik → doğru görünüm. Natal Aşama 1 bileşenlerini kullanır. */
export function TechniqueTechnical({
  technique,
  technical,
  timeUnknownMasked,
  warnings,
  names,
  options = {},
  birthplace = null,
  kbLookup = null,
  dashaDrill,
  onDashaLevel,
}: {
  technique: string;
  technical: unknown;
  timeUnknownMasked: boolean;
  warnings: string[];
  names: [string, string];
  /** Normalize seçenekler (Aşama 4: hedef/referans yer etiketi). */
  options?: Record<string, unknown>;
  birthplace?: Place | null;
  /** Aşama 5: Vedik ayrıntı panelinde Bilgi Bankam eşleşmesi (çalışma alanından; ek istek yok). */
  kbLookup?: KbLookup | null;
  /** Aşama 5E: dasha alt düzeyini tembel yükle (yalnız çalışma alanında; kayıtlı analizde verilmez). */
  dashaDrill?: DashaDrill;
  onDashaLevel?: (o: { mahadasha: VedicGrahaId | null; antardasha: VedicGrahaId | null }) => void;
}) {
  const placeLabel = (k: "target" | "reference") => (options[k] as { label?: string } | undefined)?.label ?? null;
  const body = (() => {
    if (technical === null || technical === undefined) return <p className="text-sm text-slate-500">Teknik veri gösterilmiyor.</p>;
    switch (technique) {
      case "western.natal": {
        const n = technical as NatalTechnical;
        return (
          <>
            <NatalWheel technical={n} />
            <NatalTechnicalPanel technical={n} timeUnknown={timeUnknownMasked} />
          </>
        );
      }
      case "western.transit":
        return <TransitPanel t={technical as TransitTechnical} />;
      case "western.forecast":
        return <ForecastPanel t={technical as ForecastTechnical} />;
      case "western.progression":
        return <ProgressionPanel t={technical as ProgressionTechnical} />;
      case "western.solar_arc":
        return <SolarArcPanel t={technical as SolarArcTechnical} />;
      case "western.solar_return":
      case "western.lunar_return":
        return <ReturnPanel t={technical as ReturnTechnical} place={(options.returnLocation as ReturnPlace | undefined) ?? null} />;
      case "western.synastry":
        return <SynastryPanel t={technical as SynastryTechnical} names={names} />;
      case "western.composite":
        return <CompositePanel t={technical as CompositeTechnical} />;
      case "western.astrocartography":
        return <AstrocartographyPanel t={technical as AstrocartographyTechnical} birthplace={birthplace} />;
      case "western.relocation":
        return <RelocationPanel t={technical as RelocationTechnical} targetLabel={placeLabel("target") ?? "hedef"} birthLabel={birthplace?.label ?? null} />;
      case "vedic.d1":
        return <VedicD1Panel t={technical as VedicD1Technical} kbLookup={kbLookup} />;
      case "vedic.varga":
        return <VedicVargaPanel t={technical as VedicVargaTechnical} kbLookup={kbLookup} />;
      case "vedic.drishti":
        return <VedicDrishtiPanel t={technical as VedicDrishtiTechnical} kbLookup={kbLookup} />;
      case "vedic.ashtakavarga":
        return <VedicAshtakavargaPanel t={technical as VedicAshtakavargaTechnical} />;
      case "vedic.shadbala":
        return <VedicShadbalaPanel t={technical as VedicShadbalaTechnical} kbLookup={kbLookup} />;
      case "vedic.panchanga":
        return <VedicPanchangaPanel t={technical as VedicPanchangaTechnical} kbLookup={kbLookup} />;
      case "vedic.dasha":
        return <VedicDashaPanel t={technical as VedicDashaTechnical} kbLookup={kbLookup} drill={dashaDrill} onOpenLevel={onDashaLevel} />;
      case "western.local_space":
        return <LocalSpacePanel t={technical as LocalSpaceTechnical} referenceLabel={placeLabel("reference") ?? "doğum yeri"} />;
      default:
        return <p className="text-sm text-slate-500">Bu teknik için görünüm yok.</p>;
    }
  })();
  return (
    <div className="flex flex-col gap-3">
      {technique !== "western.natal" && <Warnings warnings={warnings} />}
      {technique === "western.natal" && warnings.filter((w) => w.includes("parça")).length > 0 && <Warnings warnings={warnings} />}
      {body}
    </div>
  );
}
