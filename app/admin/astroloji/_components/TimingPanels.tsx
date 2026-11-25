"use client";

/**
 * Aşama 3 teknik sonuç görünümleri — her teknik KENDİ doğal veri yapısıyla gösterilir (hepsi tek tabloya
 * zorlanmaz). Yalnız kanonik teknik katman kullanılır; etiketler Yaşam sözlüğünden (labels/tr).
 * Sağlayıcı metni bu dosyada GÖRÜNMEZ (yorum ayrı panelde).
 */

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { dmyOf, dmyText } from "../_lib/atlasDate";
import { hasViewWarning } from "@/lib/astrology/viewWarnings";
import type { AspectType, BodyId, NatalAspect, NatalHouse, NatalTechnical, SignId } from "@/lib/astrology/model/western";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import type {
  CompositeTechnical,
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
  BODY_GLYPHS,
  NATAL_HOUSE_SYSTEM_LABELS,
  NATURE_LABELS,
  SIGN_GLYPHS,
  formatDegree,
} from "@/lib/astrology/labels/tr";
import NatalWheel, { type WheelChart } from "./NatalWheel";
import {
  progressedToNatalAspects,
  solarArcAspectsWithMotion,
  type AspectMotion,
} from "@/lib/astrology/directionAspects";
import NatalTechnicalPanel from "./NatalTechnicalPanel";
import { balaPolarNotice, type BalaBirthMoment } from "@/lib/astrology/balaPolarNotice";
import { ForecastPanel, TransitPanel, type CalendarTransitApi } from "./TransitPanels";
import { AstrocartographyPanel, LocalSpacePanel, RelocationPanel, type Place } from "./LocationPanels";
import { VedicD1Panel, VedicDashaPanel, VedicVargaPanel, type DashaDrill, type DashaLevelSel, type KbLookup } from "./VedicPanels";
import type {
  VedicAshtakavargaTechnical,
  VedicD1Technical,
  VedicDashaTechnical,
  VedicDrishtiTechnical,
  VedicPanchangaTechnical,
  VedicTransitTechnical,
  VedicShadbalaTechnical,
  VedicVargaTechnical,
} from "@/lib/astrology/model/vedic";
import { KpChartPanel, KpHoraryPanel, KpRulingPanel, KpTransitPanel } from "./KpPanels";
import { horaryDisplayZone, horaryPlaceZone } from "@/lib/astrology/transitDetail";
import { formatZoned } from "@/lib/astrology/birth/zonedFormat";
import { progressedWholeSignCusps, progressionHouseColumns } from "@/lib/astrology/progressionHouses";
import { KP_TIMING_TECHNICAL_SCHEMA, type KpChartTechnical, type KpHoraryTechnical, type KpRulingTechnical, type KpTimingTechnical, type KpTransitTechnical } from "@/lib/astrology/model/kp";
import { KpTimingPanel } from "./KpTimingPanel";
import { KpRulingIntervalPanel } from "./KpRulingIntervalPanel";
import type { KpRulingIntervalTechnical } from "@/lib/astrology/model/kpRulingInterval";
import { VedicAshtakavargaPanel, VedicDrishtiPanel, VedicPanchangaPanel, VedicShadbalaPanel, VedicTransitPanel } from "./VedicExtraPanels";
import type { AstrocartographyTechnical, LocalSpaceTechnical, RelocationTechnical } from "@/lib/astrology/model/westernLocation";
import type { FixedStarsInterpretation, FixedStarsTechnical } from "@/lib/astrology/model/westernFixedStars";
import { FixedStarsPanel } from "./FixedStarsPanel";
import { ProfectionsPanel } from "./ProfectionsPanel";
// 22.10.2026 Vedik harita panelleri (ayrı satır).
import { VedicArudhaPanel, VedicBhavaBalaPanel, VedicBhavChalitPanel, VedicCharaKarakaPanel } from "./VedicHaritaPanels";
import type { VedicArudhaTechnical, VedicBhavaBalaTechnical, VedicBhavChalitTechnical, VedicCharaKarakaTechnical } from "@/lib/astrology/model/vedicHarita";
import { ExtraPointsPanel } from "./ExtraPointsPanels";
import type { ExtraPointsTechnical } from "@/lib/astrology/model/westernExtraPoints";
import { GunMilanPanel, SadeSatiPanel } from "./VedicMatchPanels";
import { DashakootPanel, PapasamyamPanel } from "./VedicPoruthamPanels";
import type { VedicDashakootTechnical, VedicPapasamyamTechnical } from "@/lib/astrology/model/vedicPorutham";
// 2026-10-22 — Vedik aylık zamanlama (ayrı satırlar: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { VedicMonthlyPanel } from "./VedicMonthlyPanel";
import type { VedicMonthlyTechnical } from "@/lib/astrology/model/vedicMonthly";
import type { VedicGunMilanTechnical, VedicSadeSatiTechnical } from "@/lib/astrology/model/vedicMatch";
// 22.10.2026 Vedik noktalar (ayrı satırlar).
import { VedicHeliacalPanel, VedicUpagrahaPanel } from "./VedicNoktalarPanels";
import type { VedicHeliacalTechnical, VedicUpagrahaTechnical } from "@/lib/astrology/model/vedicNoktalar";
import type { ProfectionsTechnical } from "@/lib/astrology/model/westernProfections";
// 2026-10-22 — Gezegen dönüşleri (ayrı satırlar: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { PlanetaryReturnPanel, planetaryReturnWheel, type PlanetaryReturnPlace } from "./PlanetaryReturnPanel";
import { PLANETARY_RETURN_LABELS, type PlanetaryReturnTechnical } from "@/lib/astrology/model/westernPlanetaryReturn";
// 2026-10-22 — Deklinasyon paralelleri (ayrı satırlar: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { ClassicalDignitiesPanel } from "./ClassicalDignitiesPanel";
import { TransitScanPanel } from "./TransitScanPanel";
import type { TransitScanTechnical } from "@/lib/astrology/model/westernTransitScan";
import type { ClassicalDignitiesTechnical } from "@/lib/astrology/model/westernClassicalDignities";
import { DeclinationParallelsPanel } from "./DeclinationParallelsPanel";
import type { DeclinationParallelsTechnical } from "@/lib/astrology/model/westernDeclination";
import { deltaTBirthNotes, deltaTTargetNotes } from "@/lib/astrology/deltaTNotice";
import { fitGridCell, fitGridStyle } from "./atlas/fitGrid";

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "px-2 py-1.5 text-sm text-slate-800";
/**
 * K4 (15.11.2026): `th` büyük harf (CSS uppercase) + sayfa dili Türkçe → İngilizce / Latince ev sistemi adındaki "i" de "İ" oluyordu
 * ("WHOLE SİGN", "PLACİDUS"). Bu adlar lang="en" ile sarılır → "WHOLE SIGN"; Türkçe kısım ("İlerletilmiş") Türkçe kuralla kalır.
 */
const LATIN_TERMS = /(Whole Sign|Placidus|Regiomontanus|Campanus|Alcabitius|Porphyry|Koch)/;
function CapsSafe({ text }: { text: string }) {
  return (
    <>
      {text.split(LATIN_TERMS).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} lang="en">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
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
  const tt = useTranslations("terms");
  return (
    <span className="whitespace-nowrap">
      <span className="mr-1">{SIGN_GLYPHS[sign]}</span>
      {tt(`zodiac.${sign}`)} {formatDegree(degree)}
    </span>
  );
}

/** I18N mod-g: ortak tablo / nokta etiketleri katalogdan (atlas.timing + terms; TR değerleri önceki metinle birebir). */
function usePointLabel() {
  const tt = useTranslations("terms");
  const t = useTranslations("atlas.timing");
  return (p: PointId) => (p === "ascendant" ? tt("angle.ascendant") : p === "midheaven" ? t("pointMc") : tt(`body.${p as BodyId}`));
}
const pointGlyph = (p: PointId) => (p === "ascendant" ? "ASC" : p === "midheaven" ? "MC" : BODY_GLYPHS[p as BodyId]);

function Point({ id, prefix }: { id: PointId; prefix?: string }) {
  const pointLabel = usePointLabel();
  return (
    <span className="whitespace-nowrap">
      {prefix && <span className="mr-1 text-[11px] text-slate-500">{prefix}</span>}
      <span className="mr-1">{pointGlyph(id)}</span>
      {pointLabel(id)}
    </span>
  );
}

function NatureBadge({ n }: { n: keyof typeof NATURE_LABELS | null }) {
  const tt = useTranslations("terms");
  if (!n) return <span className="text-slate-400">—</span>;
  const c = n === "harmonious" ? "bg-sky-50 text-sky-800" : n === "challenging" ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] ${c}`}>{tt(`aspectNature.${n}`)}</span>;
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
  const t = useTranslations("atlas.timing");
  return (
    <label className="flex items-center gap-1 text-xs text-slate-600">
      <input type="checkbox" checked={only} onChange={(e) => set(e.target.checked)} /> {t("majorOnly")}
    </label>
  );
}

/** Tek harita içi açı tablosu (return / composite). */
function ChartAspects({ aspects }: { aspects: NatalAspect[] }) {
  const t = useTranslations("atlas.timing");
  const tt = useTranslations("terms");
  const [only, setOnly] = useState(true);
  const list = [...aspects].filter((a) => !only || MAJOR.has(a.type)).sort((a, b) => a.orb - b.orb);
  return (
    <Section title={t("aspectsCount", { shown: list.length, total: aspects.length })} right={<MajorToggle only={only} set={setOnly} />}>
      <table className="min-w-full">
        <thead>
          <tr>
            <th className={th}>{t("aspectCol")}</th>
            <th className={th}>{t("orbCol")}</th>
            <th className={th}>{t("natureCol")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {list.map((a, i) => (
            <tr key={`${a.a}-${a.b}-${a.type}-${i}`}>
              <td className={td}>
                {BODY_GLYPHS[a.a]} {ASPECT_GLYPHS[a.type]} {BODY_GLYPHS[a.b]}{" "}
                <span className="text-xs text-slate-500">
                  {tt(`body.${a.a}`)} {ASPECT_GLYPHS[a.type]} {tt(`aspect.${a.type}`)} {tt(`body.${a.b}`)}
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
  const t = useTranslations("atlas.timing");
  const tt = useTranslations("terms");
  return (
    <table className="min-w-full">
      <thead>
        <tr>
          <th className={th}>{t("bodyCol")}</th>
          <th className={th}>{t("signDegreeCol")}</th>
          {showHouse && <th className={th}>{t("houseCol")}</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {bodies.map((b) => (
          <tr key={b.id}>
            <td className={td}>
              <span className="mr-1.5">{BODY_GLYPHS[b.id]}</span>
              {tt(`body.${b.id}`)}
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
  const t = useTranslations("atlas.timing");
  if (houses.length === 0) return null;
  return (
    <Section title={t("cuspsTitle")}>
      <div className="grid gap-y-1 px-3 py-2 text-sm" style={fitGridStyle()} data-fit-grid="cusps">
        {houses.map((h) => (
          <div key={h.number} className={fitGridCell}>
            <span className="font-medium text-slate-600">{t("houseN", { n: h.number })}</span>
            <SignCell sign={h.sign} degree={h.degreeInSign} />
          </div>
        ))}
      </div>
    </Section>
  );
}


// ─── Transit + Transit Takvimi: TRANSİT-01 profesyonel görünümleri ./TransitPanels.tsx içinde ──────────────
export { TransitPanel, ForecastPanel, type CalendarTransitApi } from "./TransitPanels";

// ─── Secondary progression ──────────────────────────────────────────────────
// AŞAMA 2.1 (2026-10-21): hesap tarihi/dönemi + yöntem + ilerletilmiş konum tablosu (natal karşılaştırmalı) + ilerletilmiş →
// natal açı tablosu (majör, orb ≤ 1°, yaklaşan/ayrılan). Natal taraf yalnız önbellekteki uyumlu natal çerçeveden gelir.
const lonCell = (lon: number) => {
  const l = ((lon % 360) + 360) % 360;
  return <SignCell sign={SIGN_IDS[Math.floor(l / 30)]} degree={l % 30} />;
};

function MethodBox({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600" data-testid={testId}>
      {children}
    </div>
  );
}

function MotionCell({ m }: { m: AspectMotion | null }) {
  const t = useTranslations("atlas.timing");
  if (!m) return <span className="text-slate-400">—</span>;
  return <span className={m === "applying" ? "font-medium text-emerald-700" : "text-slate-600"}>{t(`motion.${m}`)}</span>;
}

type DirectionRow = { moving: PointId; natal: PointId; type: AspectType; orb: number; motion: AspectMotion | null; nature: "harmonious" | "challenging" | "neutral" };

function DirectionAspectTable({ rows, movingPrefix, testId }: { rows: DirectionRow[]; movingPrefix: string; testId: string }) {
  const t = useTranslations("atlas.timing");
  const tt = useTranslations("terms");
  if (rows.length === 0)
    return (
      <p className="px-3 py-3 text-sm text-slate-500" data-testid={`${testId}-empty`}>
        {t("noMajorWithinOrb")}
      </p>
    );
  return (
    <table className="min-w-full" data-testid={testId}>
      <thead>
        <tr>
          <th className={th}>{movingPrefix}</th>
          <th className={th}>{t("aspectCol")}</th>
          <th className={th}>{t("natalCol")}</th>
          <th className={th}>{t("orbCol")}</th>
          <th className={th}>{t("statusCol")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((a, i) => (
          <tr key={`${a.moving}-${a.type}-${a.natal}-${i}`}>
            <td className={td}>
              <Point id={a.moving} />
            </td>
            <td className={td}>
              <span className="whitespace-nowrap">
                {ASPECT_GLYPHS[a.type]} {tt(`aspect.${a.type}`)}
              </span>{" "}
              <NatureBadge n={a.nature} />
            </td>
            <td className={td}>
              <Point id={a.natal} />
            </td>
            <td className={`${td} tabular-nums`}>{formatDegree(a.orb)}</td>
            <td className={td}>
              <MotionCell m={a.motion} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Ev sistemi kimliği → katalog etiketi (tanınmayan kimlik ham gösterilir; lib/astrology/progressionHouses.ts ile aynı geri dönüş). */
function useHouseSystemLabel() {
  const tt = useTranslations("terms");
  return (hs: string) => (Object.prototype.hasOwnProperty.call(NATAL_HOUSE_SYSTEM_LABELS, hs) ? tt(`houseSystem.${hs}`) : String(hs));
}

export function ProgressionPanel({ t, timeUnknownMasked = false }: { t: ProgressionTechnical; timeUnknownMasked?: boolean }) {
  const tp = useTranslations("atlas.timing.progression");
  const loc = useLocale();
  const tc = useTranslations("atlas.timing");
  const tt = useTranslations("terms");
  const hsLabel = useHouseSystemLabel();
  const f = t.natalFrame ?? null;
  const natalById = new Map((f?.bodies ?? []).map((b) => [b.id, b]));
  const aspects = progressedToNatalAspects(t);
  // ATL-B04: iki ev çerçevesi ayrı ve doğru etiketli sütunlarda (natal ev / ilerletilmiş harita evi) — progressionHouses.ts.
  const hc = progressionHouseColumns(t);
  // I18N mod-g: sütun başlığı / açıklaması kanonik dallardan (progressionHouseColumns ile aynı sıra) katalogdan seçilir; lib metni
  // (Word/PDF) değişmez. Kare çerçeve → kayıtlı natal ev sistemi; sağlayıcı değeri → eski kutup kaydı ya da Placidus.
  const frameHs = t.natalFrame && Array.isArray(t.natalFrame.houses) && t.natalFrame.houses.length === 12 ? hsLabel(t.natalFrame.houseSystem) : null;
  const natalHead = !hc.natal
    ? null
    : hc.natal.source === "natal_frame" && frameHs !== null
      ? { label: tp("natalHouseFrame", { hs: frameHs }), method: tp("natalHouseFrameMethod", { hs: frameHs }) }
      : t.natalHouseStatus?.status === "legacy_polar_provider"
        ? { label: tp("natalHouseLegacyPolar"), method: tp("legacyPolarWarning") }
        : { label: tp("natalHouseProvider"), method: tp("natalHouseProviderMethod") };
  const polarLat = t.natalHouseStatus?.status === "polar_undefined" ? t.natalHouseStatus.latitude : null;
  return (
    <div className="flex flex-col gap-3" data-testid="astro-progression-panel">
      <p className="text-sm text-slate-600" data-testid="astro-progression-period">
        {tp.rich("calcDate", { date: dmyOf(t.targetDate, loc), strong: (c) => <strong>{c}</strong> })}
        {t.progressedDate && (
          <>
            {" "}
            {tp.rich("progressedDay", { date: dmyOf(t.progressedDate, loc), strong: (c) => <strong>{c}</strong> })}
          </>
        )}
        {t.elapsedYears !== null && ` ${tp("elapsed", { years: t.elapsedYears.toFixed(2) })}`}
      </p>
      <MethodBox testId="astro-progression-method">{tp("methodNote")}</MethodBox>
      {/* F1/F2 (14.11.2026): düğüm kaynağı ve kutup natal evleri — açık yöntem notu / eski kayıt uyarısı (progressionNodesText.ts). */}
      {t.nodeComputation && <MethodBox testId="astro-progression-mean-node-note">{tp("meanNodeNote")}</MethodBox>}
      {t.nodeType === "mean" && !t.nodeComputation && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900" data-testid="astro-progression-legacy-mean">
          {tp("legacyMeanNode")}
        </p>
      )}
      {t.natalHouseStatus?.status === "polar_undefined" && !f && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900" data-testid="astro-progression-polar-note">
          {polarLat === null ? tp("polarNote") : tp("polarNoteLat", { lat: polarLat.toFixed(1) })}
        </p>
      )}
      {t.natalHouseStatus?.status === "legacy_polar_provider" && !f && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900" data-testid="astro-progression-legacy-polar">
          {tp("legacyPolarWarning")}
        </p>
      )}
      {t.angles && (
        <Section title={tp("anglesTitle")}>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={th}>{tc("pointCol")}</th>
                <th className={th}>{tp("progressedCol")}</th>
                {f && <th className={th}>{tc("natalCol")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className={td}>{tp("ascendant")}</td>
                <td className={td}>
                  <SignCell sign={t.angles.ascendant.sign} degree={t.angles.ascendant.degreeInSign} />
                </td>
                {f && <td className={`${td} text-slate-500`}>{lonCell(f.angles.ascendant.longitude)}</td>}
              </tr>
              <tr>
                <td className={td}>MC</td>
                <td className={td}>
                  <SignCell sign={t.angles.midheaven.sign} degree={t.angles.midheaven.degreeInSign} />
                </td>
                {f && <td className={`${td} text-slate-500`}>{lonCell(f.angles.midheaven.longitude)}</td>}
              </tr>
            </tbody>
          </table>
        </Section>
      )}
      <Section title={tp("positionsTitle")}>
        <table className="min-w-full" data-testid="astro-progression-positions">
          <thead>
            <tr>
              <th className={th}>{tc("bodyCol")}</th>
              <th className={th}>{tp("progressedCol")}</th>
              {hc.natal && natalHead && (
                <th className={th} title={natalHead.method} data-testid="astro-progression-natal-house-head">
                  <CapsSafe text={natalHead.label} />
                </th>
              )}
              {hc.progressed && (
                <th className={th} title={tp("chartHouseMethod")} data-testid="astro-progression-chart-house-head">
                  {/* 390 px'te tam etiket tablo kutusunu taşırıyordu (owner kararı 14.11.2026: dar ekranda kısa etiket). */}
                  <span className="sm:hidden" data-testid="astro-progression-chart-house-head-short">
                    {tp("chartHouseShort")}
                  </span>
                  <span className="hidden sm:inline">
                    <CapsSafe text={tp("chartHouse")} />
                  </span>
                </th>
              )}
              {f && <th className={th}>{tc("natalCol")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.bodies.map((b) => {
              const n = natalById.get(b.id);
              return (
                <tr key={b.id}>
                  <td className={td}>
                    <span className="mr-1.5">{BODY_GLYPHS[b.id]}</span>
                    {tt(`body.${b.id}`)}
                    {b.retrograde && <span className="ml-1 font-semibold text-rose-600">℞</span>}
                  </td>
                  <td className={td}>
                    <SignCell sign={b.sign} degree={b.degreeInSign} />
                  </td>
                  {hc.natal && <td className={td} data-testid="astro-progression-natal-house">{hc.natal.of(b.id) ?? "—"}</td>}
                  {hc.progressed && <td className={td} data-testid="astro-progression-chart-house">{hc.progressed.of(b.id) ?? "—"}</td>}
                  {f && <td className={`${td} text-slate-500`}>{n ? <SignCell sign={n.sign} degree={n.degreeInSign} /> : "—"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <Section title={`${tp("aspectsTitle")}${aspects ? ` (${aspects.length})` : ""}`}>
        <p className="px-3 pt-2 text-xs text-slate-500" data-testid="astro-progression-orb-rule">
          {tp("aspectRule")}
        </p>
        {aspects ? (
          <DirectionAspectTable rows={aspects} movingPrefix={tp("progressedCol")} testId="astro-progression-aspects" />
        ) : (
          <p className="px-3 py-3 text-sm text-sky-900" data-testid="astro-progression-no-frame">
            {timeUnknownMasked ? tp("noFrameTimeUnknown") : tp("natalFrameMissing")}
          </p>
        )}
      </Section>
      {f && (
        <p className="text-[11px] text-slate-500" data-testid="astro-progression-natal-source">
          {tp("natalSource", { hs: hsLabel(f.houseSystem) })}
        </p>
      )}
    </div>
  );
}

// ─── Solar arc ──────────────────────────────────────────────────────────────
// AŞAMA 2.2 (2026-10-21): yöntem + Solar Arc konum tablosu + Solar Arc → natal açılar (kayıtlı adaptör aritmetiği aynen;
// yaklaşan/ayrılan eklendi). Natal çerçeve yalnız çift halka için.
export function SolarArcPanel({ t }: { t: SolarArcTechnical; /** Arayüz uyumu (ProgressionPanel ile aynı imza). */ timeUnknownMasked?: boolean }) {
  const ts = useTranslations("atlas.timing.solarArc");
  const loc = useLocale();
  const tc = useTranslations("atlas.timing");
  const hsLabel = useHouseSystemLabel();
  const aspects: DirectionRow[] = solarArcAspectsWithMotion(t).map((a) => ({ moving: a.directed, natal: a.natal, type: a.type, orb: a.orb, motion: a.motion, nature: a.nature }));
  const f = t.natalFrame ?? null;
  return (
    <div className="flex flex-col gap-3" data-testid="astro-solar-arc-panel">
      <p className="text-sm text-slate-600" data-testid="astro-solar-arc-period">
        {ts.rich("period", { date: dmyOf(t.targetDate, loc), arc: formatDegree(t.arc), arcDec: t.arc.toFixed(3), strong: (c) => <strong>{c}</strong> })}
      </p>
      <MethodBox testId="astro-solar-arc-method">{ts("methodNote")}</MethodBox>
      <Section title={ts("positionsTitle")}>
        <table className="min-w-full" data-testid="astro-solar-arc-positions">
          <thead>
            <tr>
              {/* Y4 (15.11.2026): asıl değer (Solar Arc) noktanın hemen yanında; natal başlangıç son sütunda — 390 px'te Solar Arc
                  sütunu yatay kaydırma olmadan görünür. Word/PDF sütun sırası değişmez. */}
              <th className={th}>{tc("pointCol")}</th>
              <th className={th}>{ts("col")}</th>
              <th className={th}>{tc("natalCol")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {t.directed.map((d) => (
              <tr key={d.id}>
                <td className={td}>
                  <Point id={d.id} />
                </td>
                <td className={td}>
                  <SignCell sign={d.sign} degree={d.degreeInSign} />
                </td>
                <td className={`${td} text-slate-500`}>{lonCell(d.natalLongitude)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title={ts("aspectsTitle", { n: aspects.length })}>
        <p className="px-3 pt-2 text-xs text-slate-500" data-testid="astro-solar-arc-orb-rule">
          {ts("aspectRule")}
        </p>
        <DirectionAspectTable rows={aspects} movingPrefix={ts("col")} testId="astro-solar-arc-aspects" />
      </Section>
      {f ? (
        <p className="text-[11px] text-slate-500" data-testid="astro-solar-arc-natal-source">
          {ts("natalSource", { hs: hsLabel(f.houseSystem) })}
        </p>
      ) : null}
    </div>
  );
}

/** İlerletilmiş / Solar Arc çift halka çizilemiyorsa uzmana açık neden (transitWheelGap ile aynı ilke). */
export function directedWheelGap(technique: string, technical: unknown, timeUnknownMasked: boolean): string | null {
  if (technique !== "western.progression" && technique !== "western.solar_arc") return null;
  const t = technical as { natalFrame?: unknown } | null;
  if (!t || t.natalFrame) return null;
  const what = technique === "western.progression" ? "Natal + ilerletilmiş çift halka" : "Natal + Solar Arc çift halka";
  if (timeUnknownMasked) return `Doğum saati bilinmediği için natal evler/Yükselen yok; ${what} çizilmez (konum ve açı tabloları aşağıda).`;
  return `${what} için uyumlu Natal (Doğum) analizi gerekiyor (aynı doğum bilgisi revizyonu ve aynı düğüm türü). Natal analizi hesaplandığında çift halka da görüntülenir. Natal kendiliğinden hesaplanmaz; yeni ücretli istek gerekiyorsa önce plan gösterilir.`;
}

/** Çift halka künyesi (Türkçe; "Transit" etiketi YOK). */
export function DirectedWheelCaption({ technique, technical, natalName }: { technique: string; technical: unknown; natalName: string }) {
  const tm = useTranslations("atlas.timingMore");
  const hsLabel = useHouseSystemLabel();
  const f = (technical as { natalFrame?: ProgressionTechnical["natalFrame"] } | null)?.natalFrame;
  if (!f || (technique !== "western.progression" && technique !== "western.solar_arc")) return null;
  const prog = technique === "western.progression";
  return (
    <p className="text-center text-[11px] leading-snug text-slate-500 max-sm:px-3" data-testid="astro-directed-caption">
      {tm("directedCaption", {
        name: natalName,
        hs: hsLabel(f.houseSystem),
        outer: tm(prog ? "outerProgression" : "outerSolarArc"),
        angles: tm(prog ? "anglesProgression" : "anglesSolarArc"),
      })}
    </p>
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
    return formatZoned("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short" }, Date.parse(utcIso), timeZone);
  } catch {
    return null;
  }
}

/** Dönüş haritasının çark verisi (çizimle AYNI dönüşüm; yalnız ortak kullanım için dışa açıldı). */
export function returnWheel(t: ReturnTechnical): WheelChart {
  const c = t.chart;
  return {
    bodies: c.bodies,
    houses: c.houses,
    angles: c.angles?.ascendant && c.angles.midheaven ? { ascendant: c.angles.ascendant, midheaven: c.angles.midheaven } : null,
    aspects: c.aspects,
  };
}

/**
 * D3.1: çark üreten teknikler → çark verisi + etiket (sonuç ekranında harita istasyonunda gösterilir).
 * Yalnız gerçekten çark çizen teknikler; diğerleri için null (sahte harita ÜRETİLMEZ).
 */
export function wheelForTechnique(technique: string, technical: unknown): { wheel: WheelChart; label: string } | null {
  if (!technical) return null;
  if (technique === "western.natal") return { wheel: technical as NatalTechnical, label: "Natal harita çarkı" };
  if (technique === "western.solar_return" || technique === "western.lunar_return") {
    const t = technical as ReturnTechnical;
    return t.chart ? { wheel: returnWheel(t), label: t.kind === "solar" ? "Solar return çarkı" : "Lunar return çarkı" } : null;
  }
  if (technique === "western.composite") return { wheel: technical as CompositeTechnical, label: "Composite çarkı" };
  if (technique === "western.planetary_return") {
    const t = technical as PlanetaryReturnTechnical;
    return t.chart ? { wheel: planetaryReturnWheel(t), label: `${PLANETARY_RETURN_LABELS[t.planet]?.title ?? "Gezegen dönüşü"} çarkı` } : null;
  }
  // 2026-10-12 (UAT madde 8): Secondary progression — ilerletilmiş gezegen boylamları + ilerletilmiş ASC/MC sağlayıcı
  // yanıtında VAR; haritası mevcut veriden çizilir (yeni çağrı yok). Evler sağlayıcının yöntemiyle: ilerletilmiş
  // Yükselen'in burcundan TAM BURÇ evleri (houseMethod). Saat bilinmiyorsa açılar maskeli → çark çizilmez (tablo kalır).
  if (technique === "western.progression") {
    const t = technical as ProgressionTechnical;
    // AŞAMA 2.1: natal çerçeve varsa çift halka (iç natal, dış ilerletilmiş); yoksa eski tek ilerletilmiş çark.
    if (t.natalFrame) {
      const f = t.natalFrame;
      return {
        wheel: {
          bodies: f.bodies.map((b) => ({ id: b.id, longitude: b.longitude, sign: b.sign, degreeInSign: b.degreeInSign, retrograde: b.retrograde })),
          houses: f.houses,
          angles: f.angles,
          aspects: [],
          outer: {
            title: "İlerletilmiş",
            bodies: t.bodies.map((b) => ({ id: b.id, longitude: b.longitude, sign: b.sign, degreeInSign: b.degreeInSign, retrograde: b.retrograde })),
            crossAspects: (progressedToNatalAspects(t) ?? [])
              .filter((a) => !isAnglePoint(a.moving) && !isAnglePoint(a.natal))
              .map((a) => ({ outer: a.moving as BodyId, inner: a.natal as BodyId, type: a.type, nature: a.nature })),
          },
        },
        label: "Natal + ilerletilmiş (secondary progression) çift halka",
      };
    }
    if (!t.angles) return null;
    // ATL-B04: tablodaki "İlerletilmiş harita evi" sütunuyla AYNI kural (progressionHouses.ts).
    const houses = progressedWholeSignCusps(t.angles.ascendant.longitude);
    return {
      wheel: { bodies: t.bodies.map((b) => ({ id: b.id, longitude: b.longitude, sign: b.sign, degreeInSign: b.degreeInSign, retrograde: b.retrograde })), houses, angles: t.angles, aspects: [] },
      label: "İlerletilmiş (secondary progression) harita çarkı · tam burç evleri",
    };
  }
  // AŞAMA 2.2: Solar Arc çift halka — yalnız natal çerçeve varsa (iç natal, dış Solar Arc). Yoksa çark YOK (tablolar).
  if (technique === "western.solar_arc") {
    const t = technical as SolarArcTechnical;
    const f = t.natalFrame;
    if (!f) return null;
    const outerBodies = t.directed.filter((d) => !isAnglePoint(d.id)).map((d) => ({ id: d.id as BodyId, longitude: d.directedLongitude, sign: d.sign, degreeInSign: d.degreeInSign, retrograde: false }));
    if (outerBodies.length === 0) return null;
    return {
      wheel: {
        bodies: f.bodies.map((b) => ({ id: b.id, longitude: b.longitude, sign: b.sign, degreeInSign: b.degreeInSign, retrograde: b.retrograde })),
        houses: f.houses,
        angles: f.angles,
        aspects: [],
        outer: {
          title: "Solar Arc",
          bodies: outerBodies,
          crossAspects: solarArcAspectsWithMotion(t)
            .filter((a) => !isAnglePoint(a.directed) && !isAnglePoint(a.natal))
            .map((a) => ({ outer: a.directed as BodyId, inner: a.natal as BodyId, type: a.type, nature: a.nature })),
        },
      },
      label: "Natal + Solar Arc çift halka",
    };
  }
  return null;
}
const isAnglePoint = (p: PointId) => p === "ascendant" || p === "midheaven";

export function ReturnPanel({ t, place = null, showWheel = true }: { t: ReturnTechnical; place?: ReturnPlace | null; /** D3.1: çark harita istasyonundaysa burada tekrar çizilmez. */ showWheel?: boolean }) {
  // I18N-F1-R5: metin katalogdan (atlas.timingMore + terms); metin düğümü yapısı korunur (TR HTML taban ile bayt-bayt aynı).
  const tm = useTranslations("atlas.timingMore");
  const loc = useLocale();
  const tt = useTranslations("terms");
  const hsLabel = useHouseSystemLabel();
  const c = t.chart;
  const wheel = returnWheel(t);
  const off = t.returnOffsetHours;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        {tm("returnMoment")}<strong>{t.returnLocal.replace("T", " ").slice(0, 16)}</strong> (UTC{off >= 0 ? "+" : "−"}
        {Math.abs(off)}) · natal {tt(t.kind === "solar" ? "body.sun" : "body.moon")} <SignCell sign={t.natalPoint.sign} degree={t.natalPoint.degreeInSign} /> ·{" "}
        {hsLabel(c.houseSystem)}
      </p>
      {(() => {
        const utc = returnUtcIso(t);
        const local = utc && place ? localTimeIn(utc, place.timezone) : null;
        const relocated = !!place?.locationId;
        return (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="astro-return-place">
            <div>
              <strong>{tm("calcPlace")}</strong>{" "}
              {place
                ? tm("coord", {
                    label: place.label,
                    lat: Math.abs(t.location.latitude).toFixed(2),
                    ns: tm(t.location.latitude >= 0 ? "dir.N" : "dir.S"),
                    lon: Math.abs(t.location.longitude).toFixed(2),
                    ew: tm(t.location.longitude >= 0 ? "dir.E" : "dir.W"),
                  })
                : tm("birthPlace")}
              {relocated ? tm("relocated") : tm("notRelocated")}
            </div>
            <div className="text-xs text-slate-600">
              {tm("exactMoment")}<strong>{utc ? `${utc.slice(0, 16).replace("T", " ")} UTC` : "—"}</strong>
              {local ? tm("localTime", { place: place?.label?.split(",")[0] ?? tm("placeFallback"), time: dmyText(local, loc) }) : tm("noLocalTime")}
            </div>
            <div className="text-[11px] text-slate-500">{tm("placeIndependent")}</div>
          </div>
        );
      })()}
      {t.kind === "lunar" && (
        <p className="text-xs text-slate-500" data-testid="astro-lunar-sequence">
          {t.requested.sequence
            ? tm("lunarSeq", { n: String(t.requested.sequence), at: (t.requested.expectedUtc ?? "").replace("T", " ") })
            : tm("lunarSeqLegacy")}
        </p>
      )}
      {showWheel && <NatalWheel technical={wheel} label={tm(t.kind === "solar" ? "solarWheel" : "lunarWheel")} />}
      {c.angles && (c.angles.ascendant || c.angles.midheaven) && (
        <p className="text-sm text-slate-700">
          {c.angles.ascendant && (
            <>
              {tm("ascLead")}<SignCell sign={c.angles.ascendant.sign} degree={c.angles.ascendant.degreeInSign} />
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
      <Section title={tm("returnBodies")}>
        <BodiesTable bodies={c.bodies} showHouse />
      </Section>
      <Cusps houses={c.houses} />
      <ChartAspects aspects={c.aspects} />
    </div>
  );
}

// ─── Synastry ───────────────────────────────────────────────────────────────
export function SynastryPanel({ t, names }: { t: SynastryTechnical; names: [string, string] }) {
  const tm = useTranslations("atlas.timingMore");
  const tt = useTranslations("terms");
  const [only, setOnly] = useState(true);
  const list = [...t.aspects].filter((a) => !only || MAJOR.has(a.type)).sort((a, b) => a.orb - b.orb);
  const person = (idx: 0 | 1) => {
    const p = idx === 0 ? t.person1 : t.person2;
    const other = names[idx === 0 ? 1 : 0];
    const anyHouse = p.bodies.some((b) => b.house !== null);
    const anyOver = p.bodies.some((b) => b.houseInOther !== null);
    return (
      <Section title={tm("personTitle", { n: String(idx + 1), name: names[idx] })}>
        {p.ascendant && (
          <p className="px-3 pt-2 text-sm text-slate-700">
            {tm("ascLead")}<SignCell sign={p.ascendant.sign} degree={p.ascendant.degreeInSign} />
          </p>
        )}
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>{tm("colBody")}</th>
              <th className={th}>{tm("colSignDegree")}</th>
              {anyHouse && <th className={th}>{tm("colOwnHouse")}</th>}
              {anyOver && <th className={th}>{other}{tm("inOtherHouse")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {p.bodies.map((b) => (
              <tr key={b.id}>
                <td className={td}>
                  <span className="mr-1.5">{BODY_GLYPHS[b.id]}</span>
                  {tt(`body.${b.id}`)}
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
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{tm("scoreLabel")}{t.compatibilityScore.toFixed(1)}</span>
        )}
        {t.summary.total !== null && (
          <span className="text-xs text-slate-500">
            {t.summary.total}{tm("sumAspects")}{t.summary.harmonious ?? "—"}{tm("sumChallenging")}{t.summary.challenging ?? "—"}{tm("sumNeutral")}{t.summary.neutral ?? "—"}
          </span>
        )}
      </div>
      <Section title={tm("interAspects", { shown: String(list.length), total: String(t.aspects.length) })} right={<MajorToggle only={only} set={setOnly} />}>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className={th}>{names[0]}</th>
              <th className={th}>{tm("colAspect")}</th>
              <th className={th}>{names[1]}</th>
              <th className={th}>{tm("colOrb")}</th>
              <th className={th}>{tm("colNature")}</th>
              <th className={th}>{tm("colCourse")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((a, i) => (
              <tr key={`${a.a}-${a.type}-${a.b}-${i}`}>
                <td className={td}>
                  <Point id={a.a} />
                </td>
                <td className={td}>
                  {ASPECT_GLYPHS[a.type]} {tt(`aspect.${a.type}`)}
                </td>
                <td className={td}>
                  <Point id={a.b} />
                </td>
                <td className={`${td} tabular-nums`}>{formatDegree(a.orb)}</td>
                <td className={td}>
                  <NatureBadge n={a.nature} />
                </td>
                {/* AŞAMA 2: eski kayıtta (synastry-proj-1) alan yok → "—" (uydurulmaz). */}
                <td className={`${td} text-xs`}>{a.applying === true ? tm("applying") : a.applying === false ? tm("separating") : "—"}</td>
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
export function CompositePanel({ t, showWheel = true }: { t: CompositeTechnical; showWheel?: boolean }) {
  const tm = useTranslations("atlas.timingMore");
  const hsLabel = useHouseSystemLabel();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">{tm("compositeMethod")}{hsLabel(t.houseSystem)}</p>
      {showWheel && <NatalWheel technical={t} label={tm("compositeWheel")} />}
      {t.angles && (
        <p className="text-sm text-slate-700">
          {tm("ascLead")}<SignCell sign={t.angles.ascendant.sign} degree={t.angles.ascendant.degreeInSign} /> · MC{" "}
          <SignCell sign={t.angles.midheaven.sign} degree={t.angles.midheaven.degreeInSign} />
        </p>
      )}
      <Section title={tm("compositeBodies")}>
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
  birthMoment = null,
  kbLookup = null,
  dashaDrill,
  onDashaLevel,
  hideWheel = false,
  interpretation = null,
  calendarTransit = null,
  deltaTBirths = [],
  warningCodes,
}: {
  technique: string;
  technical: unknown;
  timeUnknownMasked: boolean;
  warnings: string[];
  /** I18N-0008: görünümün dil-bağımsız uyarı kodları (yoksa eski kayıt okuyucusu: Türkçe metin). */
  warningCodes?: readonly string[] | null;
  names: [string, string];
  /** Normalize seçenekler (Aşama 4: hedef/referans yer etiketi). */
  options?: Record<string, unknown>;
  birthplace?: Place | null;
  /** 24.10.2026: Shadbala / Bhava Bala kutup günü uyarısı için doğum anı (yalnız sunum; hesap değişmez). Yoksa uyarı yok. */
  birthMoment?: BalaBirthMoment | null;
  /** Aşama 5: Vedik ayrıntı panelinde Bilgi Bankam eşleşmesi (çalışma alanından; ek istek yok). */
  kbLookup?: KbLookup | null;
  /** Aşama 5E: dasha alt düzeyini tembel yükle (yalnız çalışma alanında; kayıtlı analizde verilmez). */
  dashaDrill?: DashaDrill;
  onDashaLevel?: (o: DashaLevelSel) => void;
  /** D3.1: çark harita istasyonunda gösteriliyorsa ayrıntı panelinde tekrar çizilmez (veri ve tablolar aynı). */
  hideWheel?: boolean;
  /**
   * 2026-10-14: GÖRÜNÜR sağlayıcı yorum içeriği (sunucu yetki + görünürlük kapısından geçmiş; yoksa null). Yalnız sabit
   * yıldızlar kavuşum kartında kısa yorumu gösterir; diğer teknikler bu dosyada sağlayıcı metni göstermez.
   */
  interpretation?: unknown;
  /** TRANSİT-01: takvim gününden transit haritası (yalnız çalışma masasında; kayıtlı analizde verilmez). */
  calendarTransit?: CalendarTransitApi | null;
  /** ΔT bilgi notu (24.10.2026): bu alanda gösterilecek doğum tarihleri (kayıtlı analizde 2. kişi; 1. kişi hazırlık alanında). */
  deltaTBirths?: { who: string | null; birthDate: unknown }[];
}) {
  const tm = useTranslations("atlas.timingMore");
  const deltaT = [...deltaTBirths.flatMap((x) => deltaTBirthNotes(x.birthDate, x.who)), ...deltaTTargetNotes(options)];
  const placeLabel = (k: "target" | "reference") => (options[k] as { label?: string } | undefined)?.label ?? null;
  const body = (() => {
    if (technical === null || technical === undefined) return <p className="text-sm text-slate-500">{tm("noTechnical")}</p>;
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
        return <TransitPanel t={technical as TransitTechnical} options={options} />;
      case "western.forecast":
        return <ForecastPanel t={technical as ForecastTechnical} options={options} calendarTransit={calendarTransit} />;
      case "western.progression":
        return <ProgressionPanel t={technical as ProgressionTechnical} timeUnknownMasked={timeUnknownMasked} />;
      case "western.solar_arc":
        return <SolarArcPanel t={technical as SolarArcTechnical} timeUnknownMasked={timeUnknownMasked} />;
      case "western.solar_return":
      case "western.lunar_return":
        return <ReturnPanel t={technical as ReturnTechnical} place={(options.returnLocation as ReturnPlace | undefined) ?? null} showWheel={!hideWheel} />;
      case "western.synastry":
        return <SynastryPanel t={technical as SynastryTechnical} names={names} />;
      case "western.composite":
        return <CompositePanel t={technical as CompositeTechnical} showWheel={!hideWheel} />;
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
      case "vedic.transit":
        return <VedicTransitPanel t={technical as VedicTransitTechnical} kbLookup={kbLookup} />;
      case "vedic.bhav_chalit":
        return <VedicBhavChalitPanel t={technical as VedicBhavChalitTechnical} kbLookup={kbLookup} />;
      case "vedic.chara_karaka":
        return <VedicCharaKarakaPanel t={technical as VedicCharaKarakaTechnical} kbLookup={kbLookup} />;
      case "vedic.arudha":
        return <VedicArudhaPanel t={technical as VedicArudhaTechnical} kbLookup={kbLookup} />;
      case "vedic.bhava_bala":
        return <VedicBhavaBalaPanel t={technical as VedicBhavaBalaTechnical} kbLookup={kbLookup} />;
      case "kp.chart":
        return <KpChartPanel t={technical as KpChartTechnical} kbLookup={kbLookup} />;
      case "kp.dasha":
        return <VedicDashaPanel t={technical as VedicDashaTechnical} kbLookup={kbLookup} drill={dashaDrill} onOpenLevel={onDashaLevel} />;
      case "kp.ruling":
        return <KpRulingPanel t={technical as KpRulingTechnical} kbLookup={kbLookup} placeLabel={(options.place as { label?: string } | undefined)?.label ?? null} birthplace={birthplace} />;
      case "kp.ruling_interval":
        return <KpRulingIntervalPanel t={technical as KpRulingIntervalTechnical} kbLookup={kbLookup} placeLabel={(options.place as { label?: string } | undefined)?.label ?? null} />;
      case "kp.transit":
        // TRANSİT-03: zaman aralığı kipi ayrı görünüm (şemaya göre).
        if ((technical as { schema?: string }).schema === KP_TIMING_TECHNICAL_SCHEMA) return <KpTimingPanel t={technical as KpTimingTechnical} options={options} />;
        return <KpTransitPanel t={technical as KpTransitTechnical} kbLookup={kbLookup} />;
      case "kp.horary":
        return <KpHoraryPanel t={technical as KpHoraryTechnical} kbLookup={kbLookup} placeLabel={(options.place as { label?: string } | undefined)?.label ?? null} displayTz={horaryDisplayZone(options)} placeTz={horaryPlaceZone(options)} />;
      case "vedic.dasha":
        return <VedicDashaPanel t={technical as VedicDashaTechnical} kbLookup={kbLookup} drill={dashaDrill} onOpenLevel={onDashaLevel} />;
      case "western.fixed_stars":
        return <FixedStarsPanel t={technical as FixedStarsTechnical} options={options} interpretation={(interpretation as FixedStarsInterpretation | null) ?? null} />;
      case "western.profections":
        return <ProfectionsPanel t={technical as ProfectionsTechnical} />;
      case "western.extra_points":
        return <ExtraPointsPanel t={technical as ExtraPointsTechnical} timeUnknownMasked={timeUnknownMasked} />;
      case "western.planetary_return":
        return <PlanetaryReturnPanel t={technical as PlanetaryReturnTechnical} place={(options.returnLocation as PlanetaryReturnPlace | undefined) ?? null} showWheel={!hideWheel} />;
      case "western.local_space":
        return <LocalSpacePanel t={technical as LocalSpaceTechnical} referenceLabel={placeLabel("reference") ?? "doğum yeri"} />;
      case "vedic.gun_milan":
        return <GunMilanPanel t={technical as VedicGunMilanTechnical} names={names} />;
      case "vedic.dashakoot":
        return <DashakootPanel t={technical as VedicDashakootTechnical} names={names} />;
      case "vedic.papasamyam":
        return <PapasamyamPanel t={technical as VedicPapasamyamTechnical} names={names} />;
      case "vedic.sade_sati":
        return <SadeSatiPanel t={technical as VedicSadeSatiTechnical} kbLookup={kbLookup} />;
      case "western.classical_dignities":
        return <ClassicalDignitiesPanel t={technical as ClassicalDignitiesTechnical} />;
      case "western.transit_scan":
        return <TransitScanPanel t={technical as TransitScanTechnical} />;
      case "western.declination_parallels":
        return <DeclinationParallelsPanel t={technical as DeclinationParallelsTechnical} displayTz={typeof options.displayTz === "string" ? options.displayTz : null} kbLookup={kbLookup} />;
      case "vedic.upagraha":
        return <VedicUpagrahaPanel t={technical as VedicUpagrahaTechnical} kbLookup={kbLookup} />;
      case "vedic.heliacal":
        return <VedicHeliacalPanel t={technical as VedicHeliacalTechnical} kbLookup={kbLookup} />;
      case "vedic.monthly":
        return <VedicMonthlyPanel t={technical as VedicMonthlyTechnical} options={options} kbLookup={kbLookup} />;
      default:
        return <p className="text-sm text-slate-500">{tm("noView")}</p>;
    }
  })();
  const polarNotice = technical !== null && technical !== undefined ? balaPolarNotice(technique, birthMoment) : null;
  return (
    <div className="flex flex-col gap-3">
      {deltaT.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600" data-testid="astro-delta-t-notes">
          {deltaT.map((n) => (
            <li key={n.text}>{n.text}</li>
          ))}
        </ul>
      )}
      {technique !== "western.natal" && <Warnings warnings={warnings} />}
      {technique === "western.natal" && hasViewWarning({ warnings, warningCodes }, "missing_parts") && <Warnings warnings={warnings} />}
      {polarNotice && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900" data-testid="astro-bala-polar-notice">
          {polarNotice}
        </p>
      )}
      {body}
    </div>
  );
}
