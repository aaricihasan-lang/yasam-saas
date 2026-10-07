// Astroloji — Aşama 5 Roxy VEDİK adaptörleri (SAF). Hesap motoru Roxy; burada yalnız beyaz liste
// projeksiyon + iç tutarlılık denetimi (fail-closed) yapılır, ikinci bir hesap motoru YOKTUR.
//
// Tutarlılık denetimleri (sağlayıcı verisinin kendi içinde çelişmemesi; bağımsız hesap değildir):
//   • frame.ayanamsa = istenen ayanamsa
//   • rashi ↔ boylam (⌊boylam/30⌋), nakshatra.key ↔ boylam (⌊boylam/13°20′⌋), pada ↔ boylam,
//     nakshatra lord ↔ Vimshottari sırası, ev ↔ Lagna'dan bütün-burç sayımı, 12 rashi kutusu ↔ meta
// Uyuşmazlık → hata (sonuç KAYDEDİLMEZ). Bilinmeyen alan → teknik sayılmaz, yalnız yolu raporlanır.

import { SIGN_IDS, type SignId } from "../../model/western";
import {
  BALADI,
  DEEPTADI,
  JAGRADADI,
  NAKSHATRAS,
  NAKSHATRA_LORDS,
  VEDIC_D1_INTERP_SCHEMA,
  VEDIC_D1_TECHNICAL_SCHEMA,
  VEDIC_GRAHAS,
  BAV_TOTALS,
  KARANA_IDS,
  NAISARGIKA_BALA,
  SHADBALA_COMPONENTS,
  SHADBALA_MIN_RUPAS,
  VEDIC_ASHTAKAVARGA_TECHNICAL_SCHEMA,
  VEDIC_DASHA_INTERP_SCHEMA,
  VEDIC_DRISHTI_TECHNICAL_SCHEMA,
  VEDIC_PANCHANGA_INTERP_SCHEMA,
  VEDIC_PANCHANGA_TECHNICAL_SCHEMA,
  VEDIC_SHADBALA_INTERP_SCHEMA,
  VEDIC_SHADBALA_TECHNICAL_SCHEMA,
  VEDIC_DASHA_TECHNICAL_SCHEMA,
  VEDIC_VARGA_INTERP_SCHEMA,
  VIMSHOTTARI_YEARS,
  VEDIC_VARGA_TECHNICAL_SCHEMA,
  type AshtakaRow,
  type NakshatraPlacement,
  type ShadbalaComponent,
  type VedicAshtakavargaTechnical,
  type VedicDrishtiTechnical,
  type VedicDrishtiType,
  type VedicPanchangaInterpretation,
  type VedicPanchangaTechnical,
  type VedicShadbalaInterpretation,
  type VedicShadbalaTechnical,
  type VedicDashaInterpretation,
  type VedicDashaLevel,
  type VedicDashaPeriod,
  type VedicDashaTechnical,
  type VedicVargaDivision,
  type VedicVargaGraha,
  type VedicVargaInterpretation,
  type VedicVargaPoint,
  type VedicVargaTechnical,
  type VedicAyanamsaId,
  type VedicD1Interpretation,
  type VedicD1Technical,
  type VedicGraha,
  type VedicGrahaId,
  type VedicPoint,
  type VedicYogaCheck,
} from "../../model/vedic";
import { arr, findUnmapped, int, keywords, num, obj, paths, text } from "./shared";
import type { AdapterResult } from "./timing";

const done = <T, I>(errors: string[], dropped: string[], technical: () => T, interpretation: () => I | null, raw: unknown, known: Set<string>, opaque: Set<string>): AdapterResult<T, I> => {
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return { ok: true, technical: technical(), interpretation: interpretation(), unmappedFields: findUnmapped(raw, known, opaque), droppedValues: [...new Set(dropped)] };
};

const NAK_SPAN = 360 / 27;
const PADA_SPAN = 360 / 108;
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");

export function mapGraha(v: unknown): VedicGrahaId | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  return (VEDIC_GRAHAS as readonly string[]).includes(k) ? (k as VedicGrahaId) : null;
}
export function mapRashi(v: unknown): SignId | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  return (SIGN_IDS as readonly string[]).includes(k) ? (k as SignId) : null;
}
const enumOf = <T extends string>(v: unknown, values: readonly T[]): T | null => {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  return (values as readonly string[]).includes(k) ? (k as T) : null;
};

/** Sağlayıcı nakshatra nesnesi → kanonik yerleşim; boylamla tutarlılık denetimi. */
export function projectNakshatra(o: Record<string, unknown> | null, longitude: number, ctx: string, errors: string[], dropped: string[]): NakshatraPlacement | null {
  const index = int(o?.key, 0, 26);
  const pada = int(o?.pada, 1, 4);
  const lord = mapGraha(o?.lord);
  const ratio = num(o?.ratio, 0, 1);
  const remaining = num(o?.left, 0, NAK_SPAN + 1e-6);
  if (index === null || pada === null || !lord || ratio === null || remaining === null || typeof o?.abhijit !== "boolean") {
    errors.push(`${ctx}.nakshatra: alan`);
    return null;
  }
  const expIndex = Math.min(26, Math.floor((((longitude % 360) + 360) % 360) / NAK_SPAN));
  const expPada = Math.min(4, Math.floor(((((longitude % 360) + 360) % 360) % NAK_SPAN) / PADA_SPAN) + 1);
  if (index !== expIndex) errors.push(`${ctx}.nakshatra.key boylamla uyuşmuyor`);
  if (pada !== expPada) errors.push(`${ctx}.nakshatra.pada boylamla uyuşmuyor`);
  if (lord !== NAKSHATRA_LORDS[index % 9]) errors.push(`${ctx}.nakshatra.lord sırayla uyuşmuyor`);
  if (typeof o?.name === "string" && slug(o.name) !== NAKSHATRAS[index]) dropped.push(`${ctx}.nakshatra.name`);
  return { index, id: NAKSHATRAS[index], pada: pada as 1 | 2 | 3 | 4, lord, ratio, remaining, abhijit: o!.abhijit as boolean };
}

function projectPoint(o: Record<string, unknown> | null, ctx: string, errors: string[], dropped: string[]): VedicPoint | null {
  const longitude = num(o?.longitude, 0, 360);
  const rashi = mapRashi(o?.rashi);
  if (longitude === null || !rashi) {
    errors.push(`${ctx}: boylam/rashi`);
    return null;
  }
  if (SIGN_IDS[Math.min(11, Math.floor(longitude / 30))] !== rashi) errors.push(`${ctx}: rashi boylamla uyuşmuyor`);
  const nakshatra = projectNakshatra(obj(o?.nakshatra), longitude, ctx, errors, dropped);
  if (!nakshatra) return null;
  return { longitude, rashi, degreeInRashi: longitude % 30, nakshatra };
}

// ═══ D1 (/vedic-astrology/birth-chart) ═══════════════════════════════════════
export const ROXY_VEDIC_D1 = { endpoint: "/vedic-astrology/birth-chart", adapter: "astro-roxy-vedic-d1-1", projection: "vedic-d1-proj-1" } as const;

const NAK_KEYS = ["anga", "key", "ratio", "abhijit", "left", "name", "pada", "lord"];
const GRAHA_KEYS = ["graha", "rashi", "longitude", "latitude", "nakshatra", "isRetrograde", "house", "awastha", "jagradadi", "deeptadi"];
const BOX_KEYS = ["graha", "nakshatra", "longitude", "isRetrograde", "house", "awastha", "jagradadi", "deeptadi"];
const META_NAMES = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu", "Lagna"];

const D1_KNOWN = new Set<string>([
  ...paths("frame", ["ayanamsa", "ayanamsaDegrees"]),
  "meta",
  ...META_NAMES.flatMap((g) => [...paths(`meta.${g}`, GRAHA_KEYS), ...paths(`meta.${g}.nakshatra`, NAK_KEYS)]),
  ...SIGN_IDS.flatMap((s) => [...paths(s, ["rashi", "signs"]), `${s}.signs[]`, ...paths(`${s}.signs[]`, BOX_KEYS).slice(1), ...paths(`${s}.signs[].nakshatra`, NAK_KEYS)]),
  "houses",
  ...paths("houses[]", ["number", "name", "description", "themes"]),
  "combustion",
  ...paths("combustion[]", ["planet", "distanceFromSun", "orb"]),
  "planetaryWar",
  ...paths("planetaryWar[]", ["planet1", "planet2", "winner"]),
  "interpretations",
  ...META_NAMES.flatMap((g) => paths(`interpretations.${g}`, ["rashi", "nakshatra"])),
  "yogas",
  ...paths("yogas[]", ["id", "name", "description", "result", "quality", "family", "present", "evidence"]),
]);
const D1_OPAQUE = new Set(["houses[].themes"]);

export function projectRoxyVedicD1(raw: unknown, opts: { ayanamsa: VedicAyanamsaId }): AdapterResult<VedicD1Technical, VedicD1Interpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const frame = obj(r.frame);
  const ayDeg = num(frame?.ayanamsaDegrees, 0, 40);
  if (frame?.ayanamsa !== opts.ayanamsa || ayDeg === null) errors.push("frame: istenen ayanamsa değil");
  const meta = obj(r.meta);
  const lagnaP = projectPoint(obj(meta?.Lagna), "meta.Lagna", errors, dropped);
  const grahas: VedicGraha[] = [];
  for (const name of META_NAMES.slice(0, 9)) {
    const o = obj(meta?.[name]);
    const id = mapGraha(name)!;
    const p = projectPoint(o, `meta.${name}`, errors, dropped);
    const house = int(o?.house, 1, 12);
    if (!p || house === null || typeof o?.isRetrograde !== "boolean") {
      errors.push(`meta.${name}: alan`);
      continue;
    }
    if (lagnaP) {
      const exp = ((SIGN_IDS.indexOf(p.rashi) - SIGN_IDS.indexOf(lagnaP.rashi) + 12) % 12) + 1;
      if (exp !== house) errors.push(`meta.${name}.house bütün-burç sayımıyla uyuşmuyor`);
    }
    const baladi = o.awastha === undefined ? null : enumOf(o.awastha, BALADI);
    const jagradadi = o.jagradadi === undefined ? null : enumOf(o.jagradadi, JAGRADADI);
    const deeptadi = o.deeptadi === undefined ? null : enumOf(o.deeptadi, DEEPTADI);
    if (o.awastha !== undefined && !baladi) dropped.push(`meta.${name}.awastha`);
    if (o.jagradadi !== undefined && !jagradadi) dropped.push(`meta.${name}.jagradadi`);
    if (o.deeptadi !== undefined && !deeptadi) dropped.push(`meta.${name}.deeptadi`);
    grahas.push({ ...p, id, latitude: num(o.latitude, -90, 90), house, retrograde: o.isRetrograde, avastha: { baladi, jagradadi, deeptadi } });
  }
  if (grahas.length !== 9) errors.push("meta: 9 graha yok");
  // 12 rashi kutusu meta ile tutarlı olmalı (aynı veri; kopya — tutarlılık denetimi).
  for (const s of SIGN_IDS) {
    const box = obj(r[s]);
    if (!box || box.rashi !== s) {
      errors.push(`${s}: rashi kutusu`);
      continue;
    }
    for (const it of arr(box.signs) ?? []) {
      const g = obj(it);
      const name = typeof g?.graha === "string" ? g.graha : "";
      if (name === "Lagna") continue;
      const id = mapGraha(name);
      const m = grahas.find((x) => x.id === id);
      if (!id || !m) dropped.push(`${s}.signs[].graha`);
      else if (m.rashi !== s) errors.push(`${s}: ${name} kutusu meta ile uyuşmuyor`);
    }
  }
  const combustion: VedicD1Technical["combustion"] = [];
  for (const c of arr(r.combustion) ?? []) {
    const o = obj(c);
    const id = mapGraha(o?.planet);
    const d = num(o?.distanceFromSun, 0, 180);
    const orb = num(o?.orb, 0, 30);
    if (!id || d === null || orb === null) dropped.push("combustion[]");
    else combustion.push({ id, distanceFromSun: d, orb });
  }
  const planetaryWar: VedicD1Technical["planetaryWar"] = [];
  for (const w of arr(r.planetaryWar) ?? []) {
    const o = obj(w);
    const a = mapGraha(o?.planet1);
    const b = mapGraha(o?.planet2);
    if (!a || !b) dropped.push("planetaryWar[]");
    else planetaryWar.push({ a, b, winner: mapGraha(o?.winner) });
  }
  const yogas: VedicYogaCheck[] = [];
  const iYogas: VedicD1Interpretation["yogas"] = [];
  for (const y of arr(r.yogas) ?? []) {
    const o = obj(y);
    const id = typeof o?.id === "string" && /^[a-z0-9\-]{2,60}$/.test(o.id) ? o.id : null;
    if (!o || !id || typeof o.present !== "boolean") {
      dropped.push("yogas[]");
      continue;
    }
    const q = typeof o.quality === "string" ? o.quality.toLowerCase() : null;
    yogas.push({
      id,
      name: (text(o.name) ?? id).slice(0, 80),
      family: (typeof o.family === "string" ? o.family : "").slice(0, 40),
      quality: q === "positive" || q === "negative" || q === "both" ? q : null,
      present: o.present,
      evidence: text(o.evidence)?.slice(0, 400) ?? null,
    });
    iYogas.push({ id, description: text(o.description), result: text(o.result) });
  }
  const interp = obj(r.interpretations);
  return done(
    errors,
    dropped,
    () => ({
      schema: VEDIC_D1_TECHNICAL_SCHEMA,
      zodiac: "sidereal",
      frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! },
      houseSystem: "whole_sign",
      lagna: { ...lagnaP!, house: 1 },
      grahas,
      combustion,
      planetaryWar,
      yogas,
    }),
    () => ({
      schema: VEDIC_D1_INTERP_SCHEMA,
      grahas: META_NAMES.map((n) => {
        const o = obj(interp?.[n]);
        return { id: n === "Lagna" ? ("lagna" as const) : mapGraha(n)!, rashi: text(o?.rashi), nakshatra: text(o?.nakshatra) };
      }).filter((g) => g.rashi || g.nakshatra),
      houses: (arr(r.houses) ?? []).map((h) => obj(h)).filter((h): h is Record<string, unknown> => !!h).map((h) => ({ number: int(h.number, 1, 12) ?? 0, description: text(h.description), themes: keywords(h.themes) })).filter((h) => h.number > 0),
      yogas: iYogas.filter((y) => y.description || y.result),
    }),
    raw,
    D1_KNOWN,
    D1_OPAQUE,
  );
}

// ═══ Varga (/vedic-astrology/divisional-chart) — D9 Navamsa + D2…D60 ══════════
// Ek tutarlılık denetimleri (bağımsız hesap motoru DEĞİL; sağlayıcı verisinin kendi içinde ve D1 kuralıyla
// çelişmemesi):
//   • division.number = istenen bölüm; frame (kök + chart.frame) = istenen ayanamsa
//   • D1 boylamı ↔ nakshatra/pada (D1 ile aynı kural), ev ↔ varga Lagna'sından bütün-burç sayımı
//   • 12 rashi kutusu (Lagna dahil) ↔ meta
//   • vargottama listesi ↔ (D1 rashisi = varga rashisi)
//   • YALNIZ D9: navamsa rashisi = (nakshatra sırası × 4 + pada − 1) mod 12 (Koç'tan) — klasik pada↔navamsa eşliği
export const ROXY_VEDIC_VARGA = { endpoint: "/vedic-astrology/divisional-chart", adapter: "astro-roxy-vedic-varga-1", projection: "vedic-varga-proj-1" } as const;

const VARGA_GRAHA_KEYS = ["graha", "rashi", "longitude", "latitude", "nakshatra", "isRetrograde", "house"];
const VARGA_BOX_KEYS = ["graha", "nakshatra", "longitude", "isRetrograde", "house"];
const VARGA_KNOWN = new Set<string>([
  ...paths("frame", ["ayanamsa", "ayanamsaDegrees"]),
  ...paths("division", ["number", "name", "sanskritName", "degreesPerDivision", "significance"]),
  "chart",
  ...paths("chart.frame", ["ayanamsa", "ayanamsaDegrees"]),
  "chart.meta",
  ...META_NAMES.flatMap((g) => [...paths(`chart.meta.${g}`, VARGA_GRAHA_KEYS), ...paths(`chart.meta.${g}.nakshatra`, NAK_KEYS)]),
  ...SIGN_IDS.flatMap((s) => [...paths(`chart.${s}`, ["rashi", "signs"]), `chart.${s}.signs[]`, ...paths(`chart.${s}.signs[]`, VARGA_BOX_KEYS).slice(1), ...paths(`chart.${s}.signs[].nakshatra`, NAK_KEYS)]),
  "vargottama",
  "vargottama[]",
]);

/** Klasik pada → navamsa rashisi (Koç'tan; 108 pada = 12 burç × 9). Yalnız D9 tutarlılık denetimi. */
export function navamsaRashiOfPada(nakIndex: number, pada: number): SignId {
  return SIGN_IDS[(nakIndex * 4 + pada - 1) % 12];
}

function projectVargaPoint(o: Record<string, unknown> | null, ctx: string, division: number, errors: string[], dropped: string[]): VedicVargaPoint | null {
  const longitude = num(o?.longitude, 0, 360);
  const rashi = mapRashi(o?.rashi);
  const house = int(o?.house, 1, 12);
  if (longitude === null || !rashi || house === null) {
    errors.push(`${ctx}: boylam/rashi/ev`);
    return null;
  }
  const nakshatra = projectNakshatra(obj(o?.nakshatra), longitude, ctx, errors, dropped);
  if (!nakshatra) return null;
  if (division === 9 && navamsaRashiOfPada(nakshatra.index, nakshatra.pada) !== rashi) errors.push(`${ctx}: navamsa rashisi pada ile uyuşmuyor`);
  return { longitude, d1Rashi: SIGN_IDS[Math.min(11, Math.floor(longitude / 30))], rashi, house, nakshatra };
}

export function projectRoxyVedicVarga(raw: unknown, opts: { ayanamsa: VedicAyanamsaId; division: VedicVargaDivision }): AdapterResult<VedicVargaTechnical, VedicVargaInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const frame = obj(r.frame);
  const ayDeg = num(frame?.ayanamsaDegrees, 0, 40);
  if (frame?.ayanamsa !== opts.ayanamsa || ayDeg === null) errors.push("frame: istenen ayanamsa değil");
  const chart = obj(r.chart);
  const cf = obj(chart?.frame);
  if (cf && (cf.ayanamsa !== frame?.ayanamsa || cf.ayanamsaDegrees !== frame?.ayanamsaDegrees)) errors.push("chart.frame kök frame ile uyuşmuyor");
  const div = obj(r.division);
  if (int(div?.number, 1, 300) !== opts.division) errors.push("division: istenen bölüm değil");
  const meta = obj(chart?.meta);
  const lagnaP = projectVargaPoint(obj(meta?.Lagna), "chart.meta.Lagna", opts.division, errors, dropped);
  if (lagnaP && lagnaP.house !== 1) errors.push("chart.meta.Lagna.house 1 değil");
  const grahas: VedicVargaGraha[] = [];
  for (const name of META_NAMES.slice(0, 9)) {
    const o = obj(meta?.[name]);
    const id = mapGraha(name)!;
    const p = projectVargaPoint(o, `chart.meta.${name}`, opts.division, errors, dropped);
    if (!p || typeof o?.isRetrograde !== "boolean") {
      errors.push(`chart.meta.${name}: alan`);
      continue;
    }
    if (lagnaP) {
      const exp = ((SIGN_IDS.indexOf(p.rashi) - SIGN_IDS.indexOf(lagnaP.rashi) + 12) % 12) + 1;
      if (exp !== p.house) errors.push(`chart.meta.${name}.house bütün-burç sayımıyla uyuşmuyor`);
    }
    grahas.push({ ...p, id, retrograde: o.isRetrograde, vargottama: p.d1Rashi === p.rashi });
  }
  if (grahas.length !== 9) errors.push("chart.meta: 9 graha yok");
  for (const s of SIGN_IDS) {
    const box = obj(chart?.[s]);
    if (!box || box.rashi !== s) {
      errors.push(`chart.${s}: rashi kutusu`);
      continue;
    }
    for (const it of arr(box.signs) ?? []) {
      const g = obj(it);
      const name = typeof g?.graha === "string" ? g.graha : "";
      if (name === "Lagna") {
        if (lagnaP && lagnaP.rashi !== s) errors.push(`chart.${s}: Lagna kutusu meta ile uyuşmuyor`);
        continue;
      }
      const id = mapGraha(name);
      const m = grahas.find((x) => x.id === id);
      if (!id || !m) dropped.push(`chart.${s}.signs[].graha`);
      else if (m.rashi !== s) errors.push(`chart.${s}: ${name} kutusu meta ile uyuşmuyor`);
    }
  }
  // Vargottama: sağlayıcı listesi, (D1 rashisi = varga rashisi) kuralıyla birebir olmalı.
  const vList: VedicGrahaId[] = [];
  for (const v of arr(r.vargottama) ?? []) {
    const id = mapGraha(v);
    if (!id) dropped.push("vargottama[]");
    else vList.push(id);
  }
  const vExp = grahas.filter((g) => g.vargottama).map((g) => g.id);
  if ([...vList].sort().join() !== [...vExp].sort().join()) errors.push("vargottama listesi D1/varga rashileriyle uyuşmuyor");
  const name = text(div?.name)?.slice(0, 60) ?? `D${opts.division}`;
  return done(
    errors,
    dropped,
    () => ({
      schema: VEDIC_VARGA_TECHNICAL_SCHEMA,
      zodiac: "sidereal",
      frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! },
      houseSystem: "whole_sign",
      division: { number: opts.division, name, sanskritName: text(div?.sanskritName)?.slice(0, 60) ?? name, degreesPerDivision: (typeof div?.degreesPerDivision === "string" ? div.degreesPerDivision : "").slice(0, 20) },
      lagna: { longitude: lagnaP!.longitude, d1Rashi: lagnaP!.d1Rashi, rashi: lagnaP!.rashi, house: 1, nakshatra: lagnaP!.nakshatra, vargottama: lagnaP!.d1Rashi === lagnaP!.rashi },
      grahas,
      vargottama: vExp,
    }),
    () => ({ schema: VEDIC_VARGA_INTERP_SCHEMA, significance: text(div?.significance) }),
    raw,
    VARGA_KNOWN,
    new Set(),
  );
}

// ═══ Vimshottari Dasha (/vedic-astrology/dasha/major · /sub/{md} · /sub/{md}/{ad}) ═══════════════
// Tutarlılık denetimleri (tarih HESAPLAMAYIZ; sağlayıcı dizisinin kendi içinde ve Vimshottari kuralıyla çelişmemesi):
//   • ayanamsaType = istenen; moonNakshatra ↔ moonLongitude; nakshatraLord ↔ Vimshottari sırası
//   • dönem sırası = döngü (üst dönemin yöneticisinden başlar; doğumla kesilmişse döngünün SONEKİ)
//   • ardışıklık (bitiş_i = başlangıç_{i+1}); ilk başlangıç / son bitiş = üst dönem sınırları
//   • süre = kanonik oran (MD yıl × AD yıl / 120 …) ±0.003 yıl; kesilmiş ilk dönem ≤ kanonik ve nominalStart taşır
//   • mahadasha: ilk başlangıç = doğum yerel zamanı; ilk süre ≈ (1 − Ay'ın nakshatra oranı) × yıl (bağımsız)
export const ROXY_VEDIC_DASHA = { adapter: "astro-roxy-vedic-dasha-1", projection: "vedic-dasha-proj-1" } as const;

const ROXY_LORD: Record<VedicGrahaId, string> = { sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury", jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rahu", ketu: "Ketu" };

/** Dasha uç yolu — YALNIZ beyaz listedeki yönetici adlarından (belgelenmiş enum yazımı) kurulur. */
export function dashaEndpoint(md: VedicGrahaId | null, ad: VedicGrahaId | null): string {
  if (!md) return "/vedic-astrology/dasha/major";
  return ad ? `/vedic-astrology/dasha/sub/${ROXY_LORD[md]}/${ROXY_LORD[ad]}` : `/vedic-astrology/dasha/sub/${ROXY_LORD[md]}`;
}

const DASHA_TOL = 0.003;
const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const PERIOD_KEYS = ["planet", "startDate", "endDate", "durationYears", "nominalStartDate", "interpretation", "mahadashaLord", "antardashaLord"];
const DASHA_KNOWN = new Set<string>([
  "moonNakshatra",
  "nakshatraName",
  "nakshatraLord",
  "moonLongitude",
  "ayanamsa",
  "ayanamsaType",
  ...paths("birthDashaBalance", ["years", "months", "days", "totalDays"]),
  "mahadashas",
  ...paths("mahadashas[]", PERIOD_KEYS),
  "totalYears",
  "mahadashaLord",
  "antardashaLord",
  ...paths("mahadashaPeriod", PERIOD_KEYS),
  ...paths("antardashaPeriod", PERIOD_KEYS),
  "antardashas",
  ...paths("antardashas[]", PERIOD_KEYS),
  "pratyantardashas",
  ...paths("pratyantardashas[]", PERIOD_KEYS),
]);

function cycleFrom(lord: VedicGrahaId): VedicGrahaId[] {
  const i = NAKSHATRA_LORDS.indexOf(lord);
  return Array.from({ length: 9 }, (_, k) => NAKSHATRA_LORDS[(i + k) % 9]);
}

function projectPeriod(o: Record<string, unknown> | null, ctx: string, errors: string[]): (VedicDashaPeriod & { text: string | null }) | null {
  const lord = mapGraha(o?.planet);
  const start = typeof o?.startDate === "string" && LOCAL_DT_RE.test(o.startDate) ? o.startDate : null;
  const end = typeof o?.endDate === "string" && LOCAL_DT_RE.test(o.endDate) ? o.endDate : null;
  const durationYears = num(o?.durationYears, 0, 20 + 1e-6);
  const nominalStart = o?.nominalStartDate === undefined ? null : typeof o.nominalStartDate === "string" && LOCAL_DT_RE.test(o.nominalStartDate) ? o.nominalStartDate : undefined;
  if (!lord || !start || !end || durationYears === null || nominalStart === undefined || !(start < end)) {
    errors.push(`${ctx}: dönem alanı`);
    return null;
  }
  return { lord, start, end, durationYears, nominalStart, text: text(o?.interpretation) };
}

/** Dizi denetimi: sıra (döngü soneki), ardışıklık, kanonik süreler, üst sınırlar. */
function checkSequence(
  list: (VedicDashaPeriod & { text: string | null })[],
  cycle: VedicGrahaId[],
  fullYears: (l: VedicGrahaId) => number,
  bounds: { start: string; end: string } | null,
  ctx: string,
  errors: string[],
) {
  if (list.length < 1 || list.length > 9) {
    errors.push(`${ctx}: dönem sayısı`);
    return;
  }
  const expected = cycle.slice(9 - list.length);
  if (list.length === 9 ? list.some((p, i) => p.lord !== cycle[i]) : list.some((p, i) => p.lord !== expected[i])) errors.push(`${ctx}: Vimshottari sırası`);
  list.forEach((p, i) => {
    if (i > 0 && list[i - 1].end !== p.start) errors.push(`${ctx}[${i}]: ardışık değil`);
    const full = fullYears(p.lord);
    const truncated = i === 0 && (p.nominalStart !== null || list.length < 9);
    if (truncated) {
      if (p.durationYears > full + DASHA_TOL) errors.push(`${ctx}[0]: kesilmiş dönem kanonikten uzun`);
    } else if (Math.abs(p.durationYears - full) > DASHA_TOL) errors.push(`${ctx}[${i}]: süre kanonik orana uymuyor`);
    if (i > 0 && p.nominalStart !== null) errors.push(`${ctx}[${i}]: beklenmeyen nominalStart`);
  });
  if (list.length < 9 && list[0].nominalStart === null) errors.push(`${ctx}: eksik dizi ama kesilme işareti yok`);
  if (bounds) {
    if (list[0].start !== bounds.start) errors.push(`${ctx}: ilk başlangıç üst dönemle uyuşmuyor`);
    if (list[list.length - 1].end !== bounds.end) errors.push(`${ctx}: son bitiş üst dönemle uyuşmuyor`);
  }
}

export function projectRoxyVedicDasha(
  raw: unknown,
  opts: { ayanamsa: VedicAyanamsaId; mahadasha: VedicGrahaId | null; antardasha: VedicGrahaId | null; birthLocal: string; utcOffsetHours: number },
): AdapterResult<VedicDashaTechnical, VedicDashaInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (r.ayanamsaType !== opts.ayanamsa) errors.push("ayanamsaType: istenen ayanamsa değil");
  const ayDeg = num(r.ayanamsa, 0, 40);
  const moonLon = num(r.moonLongitude, 0, 360);
  if (ayDeg === null || moonLon === null) errors.push("ayanamsa/moonLongitude");
  const nakIdx = moonLon === null ? 0 : Math.min(26, Math.floor(moonLon / NAK_SPAN));
  const birthLord = NAKSHATRA_LORDS[nakIdx % 9];
  const level: VedicDashaLevel = opts.antardasha ? "pratyantardasha" : opts.mahadasha ? "antardasha" : "mahadasha";
  let parent: (VedicDashaPeriod & { text: string | null }) | null = null;
  let balance: VedicDashaTechnical["balance"] = null;
  const list: (VedicDashaPeriod & { text: string | null })[] = [];
  const collect = (a: unknown, ctx: string, extra?: (o: Record<string, unknown>, i: number) => void) =>
    (arr(a) ?? []).forEach((x, i) => {
      const o = obj(x);
      const p = projectPeriod(o, `${ctx}[${i}]`, errors);
      if (p && o) {
        extra?.(o, i);
        list.push(p);
      }
    });
  if (level === "mahadasha") {
    const mn = int(r.moonNakshatra, 1, 27);
    if (mn === null || mn - 1 !== nakIdx) errors.push("moonNakshatra boylamla uyuşmuyor");
    if (mapGraha(r.nakshatraLord) !== birthLord) errors.push("nakshatraLord Vimshottari sırasıyla uyuşmuyor");
    if (typeof r.nakshatraName === "string" && slug(r.nakshatraName) !== NAKSHATRAS[nakIdx]) dropped.push("nakshatraName");
    if (r.totalYears !== 120) errors.push("totalYears 120 değil");
    const b = obj(r.birthDashaBalance);
    const by = int(b?.years, 0, 20);
    const bm = int(b?.months, 0, 11);
    const bd = int(b?.days, 0, 31);
    const bt = int(b?.totalDays, 0, 7400);
    if (by === null || bm === null || bd === null || bt === null) errors.push("birthDashaBalance");
    else balance = { years: by, months: bm, days: bd, totalDays: bt };
    collect(r.mahadashas, "mahadashas");
    checkSequence(list, cycleFrom(birthLord), (l) => VIMSHOTTARI_YEARS[l], null, "mahadashas", errors);
    if (list.length !== 9) errors.push("mahadashas: 9 dönem değil");
    if (list[0]) {
      if (list[0].start !== opts.birthLocal) errors.push("ilk mahadasha doğum anında başlamıyor");
      // Bağımsız: doğumdaki bakiye = (1 − Ay'ın nakshatra içindeki oranı) × ilk yöneticinin yılı.
      if (moonLon !== null) {
        const ratio = (moonLon - nakIdx * NAK_SPAN) / NAK_SPAN;
        if (Math.abs(list[0].durationYears - (1 - ratio) * VIMSHOTTARI_YEARS[birthLord]) > DASHA_TOL) errors.push("doğum bakiyesi Ay boylamıyla uyuşmuyor");
      }
      if (balance && Math.abs(balance.totalDays - list[0].durationYears * 365.25) > 2) errors.push("birthDashaBalance.totalDays süreyle uyuşmuyor");
    }
  } else {
    const md = opts.mahadasha!;
    if (mapGraha(r.mahadashaLord) !== md) errors.push("mahadashaLord istenen değil");
    if (level === "antardasha") {
      parent = projectPeriod(obj(r.mahadashaPeriod), "mahadashaPeriod", errors);
      if (parent && parent.lord !== md) errors.push("mahadashaPeriod yöneticisi istenen değil");
      collect(r.antardashas, "antardashas", (o) => {
        if (mapGraha(o.mahadashaLord) !== md) errors.push("antardashas[].mahadashaLord");
      });
      checkSequence(list, cycleFrom(md), (l) => (VIMSHOTTARI_YEARS[md] * VIMSHOTTARI_YEARS[l]) / 120, parent, "antardashas", errors);
      if (parent && list.length < 9 && parent.nominalStart === null) errors.push("kesilmiş antardasha dizisi ama mahadasha kesilmemiş");
    } else {
      const ad = opts.antardasha!;
      if (mapGraha(r.antardashaLord) !== ad) errors.push("antardashaLord istenen değil");
      const po = obj(r.antardashaPeriod);
      parent = projectPeriod(po, "antardashaPeriod", errors);
      if (parent && (parent.lord !== ad || mapGraha(po?.mahadashaLord) !== md)) errors.push("antardashaPeriod yöneticileri istenen değil");
      const adFull = (VIMSHOTTARI_YEARS[md] * VIMSHOTTARI_YEARS[ad]) / 120;
      if (parent && parent.nominalStart === null && Math.abs(parent.durationYears - adFull) > DASHA_TOL) errors.push("antardashaPeriod süresi kanonik değil");
      collect(r.pratyantardashas, "pratyantardashas", (o) => {
        if (mapGraha(o.mahadashaLord) !== md || mapGraha(o.antardashaLord) !== ad) errors.push("pratyantardashas[] üst yöneticiler");
      });
      checkSequence(list, cycleFrom(ad), (l) => (adFull * VIMSHOTTARI_YEARS[l]) / 120, parent, "pratyantardashas", errors);
    }
  }
  const strip = (p: VedicDashaPeriod & { text: string | null }): VedicDashaPeriod => ({ lord: p.lord, start: p.start, end: p.end, durationYears: p.durationYears, nominalStart: p.nominalStart });
  return done(
    errors,
    dropped,
    () => ({
      schema: VEDIC_DASHA_TECHNICAL_SCHEMA,
      zodiac: "sidereal",
      frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! },
      system: "vimshottari",
      utcOffsetHours: opts.utcOffsetHours,
      level,
      path: { mahadasha: opts.mahadasha, antardasha: opts.antardasha },
      moon: { longitude: moonLon!, nakshatraIndex: nakIdx, nakshatraLord: birthLord },
      balance,
      parent: parent ? strip(parent) : null,
      periods: list.map(strip),
    }),
    () => ({
      schema: VEDIC_DASHA_INTERP_SCHEMA,
      parent: parent?.text ?? null,
      periods: list.map((p) => ({ lord: p.lord, start: p.start, text: p.text })).filter((p) => p.text),
    }),
    raw,
    DASHA_KNOWN,
    new Set(),
  );
}

// ═══ 5F · Graha Drishti (/vedic-astrology/aspects, Lahiri sabit) ══════════════
// Denetimler: 9 graha konumu (rashi ↔ boylam); her bakış için açı ≈ (n−1)×30° ± orb (sağlayıcı orb'u ile
// tutarlı); bakış türü grahaya izinli (herkes 7; Mars 4/8; Jüpiter 5/9; Satürn 3/10); karşılıklı bakışlar iki
// yönde de listede; bakış tablosu listeyle aynı.
export const ROXY_VEDIC_DRISHTI = { endpoint: "/vedic-astrology/aspects", adapter: "astro-roxy-vedic-drishti-1", projection: "vedic-drishti-proj-1" } as const;
const DRISHTI_ALLOWED: Record<VedicGrahaId, number[]> = { sun: [7], moon: [7], mercury: [7], venus: [7], rahu: [7], ketu: [7], mars: [4, 7, 8], jupiter: [5, 7, 9], saturn: [3, 7, 10] };
const DRISHTI_KNOWN = new Set<string>([
  "datetime",
  "planets",
  ...paths("planets[]", ["name", "longitude", "sign"]),
  "aspects",
  ...paths("aspects[]", ["aspectingPlanet", "aspectedPlanet", "aspectType", "strength", "orb"]),
  "aspectTable",
  ...paths("aspectTable[]", ["planet", "aspects"]),
  ...paths("aspectTable[].aspects[]", ["planet", "aspectType", "strength"]),
  "mutualAspects",
  ...paths("mutualAspects[]", ["planet1", "planet2", "aspectType"]),
]);
const drishtiType = (v: unknown): VedicDrishtiType | null => {
  const m = typeof v === "string" ? /^(3|4|5|7|8|9|10)(st|nd|rd|th)$/.exec(v) : null;
  return m ? (Number(m[1]) as VedicDrishtiType) : null;
};

export function projectRoxyVedicDrishti(raw: unknown, opts: { birthLocal: string }): AdapterResult<VedicDrishtiTechnical, null> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  if (r.datetime !== opts.birthLocal) errors.push("datetime doğum anı değil");
  const positions: VedicDrishtiTechnical["positions"] = [];
  for (const p of arr(r.planets) ?? []) {
    const o = obj(p);
    const id = mapGraha(o?.name);
    const lon = num(o?.longitude, 0, 360);
    const rashi = mapRashi(o?.sign);
    if (!id || lon === null || !rashi) {
      errors.push("planets[]: alan");
      continue;
    }
    if (SIGN_IDS[Math.min(11, Math.floor(lon / 30))] !== rashi) errors.push(`planets.${id}: rashi boylamla uyuşmuyor`);
    positions.push({ id, longitude: lon, rashi });
  }
  if (positions.length !== 9 || new Set(positions.map((x) => x.id)).size !== 9) errors.push("planets: 9 graha yok");
  const lonOf = new Map(positions.map((x) => [x.id, x.longitude]));
  const aspects: VedicDrishtiTechnical["aspects"] = [];
  for (const a of arr(r.aspects) ?? []) {
    const o = obj(a);
    const from = mapGraha(o?.aspectingPlanet);
    const to = mapGraha(o?.aspectedPlanet);
    const type = drishtiType(o?.aspectType);
    const strength = num(o?.strength, 0, 100);
    const orb = num(o?.orb, 0, 30);
    if (!from || !to || from === to || !type || strength === null || orb === null) {
      errors.push("aspects[]: alan");
      continue;
    }
    if (!DRISHTI_ALLOWED[from].includes(type)) errors.push(`aspects: ${from} için ${type}. bakış izinli değil`);
    const lf = lonOf.get(from);
    const lt = lonOf.get(to);
    if (lf !== undefined && lt !== undefined) {
      const sep = (((lt - lf) % 360) + 360) % 360;
      const want = (type - 1) * 30;
      const dev = Math.abs(((sep - want + 540) % 360) - 180);
      if (Math.abs(dev - orb) > 0.02) errors.push(`aspects: ${from}→${to} orb açıyla uyuşmuyor`);
    }
    aspects.push({ from, to, type, strength, orb });
  }
  const has = (a: VedicGrahaId, b: VedicGrahaId, t: number) => aspects.some((x) => x.from === a && x.to === b && x.type === t);
  const mutual: VedicDrishtiTechnical["mutual"] = [];
  for (const m of arr(r.mutualAspects) ?? []) {
    const o = obj(m);
    const a = mapGraha(o?.planet1);
    const b = mapGraha(o?.planet2);
    const type = drishtiType(o?.aspectType);
    if (!a || !b || !type) {
      errors.push("mutualAspects[]: alan");
      continue;
    }
    if (!has(a, b, type) && !aspects.some((x) => x.from === a && x.to === b)) errors.push(`mutualAspects: ${a}→${b} listede yok`);
    if (!aspects.some((x) => x.from === b && x.to === a)) errors.push(`mutualAspects: ${b}→${a} listede yok`);
    mutual.push({ a, b, type });
  }
  for (const row of arr(r.aspectTable) ?? []) {
    const o = obj(row);
    const from = mapGraha(o?.planet);
    for (const x of arr(o?.aspects) ?? []) {
      const xo = obj(x);
      const to = mapGraha(xo?.planet);
      const type = drishtiType(xo?.aspectType);
      if (!from || !to || !type || !has(from, to, type)) errors.push("aspectTable listeyle uyuşmuyor");
    }
  }
  return done(
    errors,
    dropped,
    () => ({ schema: VEDIC_DRISHTI_TECHNICAL_SCHEMA, zodiac: "sidereal", frame: { ayanamsa: "lahiri", ayanamsaDegrees: null }, method: "degree_orb", positions, aspects, mutual }),
    () => null,
    raw,
    DRISHTI_KNOWN,
    new Set(),
  );
}

// ═══ 5F · Ashtakavarga (/vedic-astrology/ashtakavarga) ═══════════════════════
// Denetimler: BAV toplamları BPHS sabitleri; SAV = 7 grahanın BAV toplamı (Lagna hariç) ve 337; indirgenmiş
// SAV = indirgenmiş 7 BAV toplamı; indirgenmiş ≤ özgün; Shodhya Pinda = Rashi + Graha Pinda; burç sırası Koç→Balık.
export const ROXY_VEDIC_ASHTAKAVARGA = { endpoint: "/vedic-astrology/ashtakavarga", adapter: "astro-roxy-vedic-ashtakavarga-1", projection: "vedic-ashtakavarga-proj-1" } as const;
const ASHTAKA_KNOWN = new Set<string>([
  ...paths("frame", ["ayanamsa", "ayanamsaDegrees"]),
  "bhinnashtakavarga",
  ...paths("bhinnashtakavarga[]", ["planet", "bindus", "total"]),
  "bhinnashtakavarga[].bindus[]",
  ...paths("sarvashtakavarga", ["bindus", "total"]),
  "sarvashtakavarga.bindus[]",
  "reducedBhinnashtakavarga",
  ...paths("reducedBhinnashtakavarga[]", ["planet", "bindus", "total"]),
  "reducedBhinnashtakavarga[].bindus[]",
  ...paths("reducedSarvashtakavarga", ["bindus", "total"]),
  "reducedSarvashtakavarga.bindus[]",
  "shodhyaPinda",
  ...paths("shodhyaPinda[]", ["planet", "rashiPinda", "grahaPinda", "shodhyaPinda"]),
  "signs",
  "signs[]",
]);
const ASHTAKA_ORDER = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "lagna"] as const;
const ashtakaId = (v: unknown): VedicGrahaId | "lagna" | null => (typeof v === "string" && v.trim().toLowerCase() === "lagna" ? "lagna" : mapGraha(v));
function bindus12(v: unknown, max: number): number[] | null {
  const a = arr(v);
  if (!a || a.length !== 12) return null;
  const out = a.map((x) => int(x, 0, max));
  return out.every((x) => x !== null) ? (out as number[]) : null;
}
function ashtakaRows(v: unknown, ctx: string, errors: string[]): AshtakaRow[] {
  const rows: AshtakaRow[] = [];
  for (const it of arr(v) ?? []) {
    const o = obj(it);
    const id = ashtakaId(o?.planet);
    const b = bindus12(o?.bindus, 8);
    const total = int(o?.total, 0, 96);
    if (!id || !b || total === null) {
      errors.push(`${ctx}[]: alan`);
      continue;
    }
    if (b.reduce((x, y) => x + y, 0) !== total) errors.push(`${ctx}.${id}: toplam bindus ile uyuşmuyor`);
    rows.push({ id, bindus: b, total });
  }
  if (rows.map((x) => x.id).join() !== ASHTAKA_ORDER.join()) errors.push(`${ctx}: 7 graha + Lagna sırası`);
  return rows;
}

export function projectRoxyVedicAshtakavarga(raw: unknown, opts: { ayanamsa: VedicAyanamsaId }): AdapterResult<VedicAshtakavargaTechnical, null> {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const frame = obj(r.frame);
  const ayDeg = num(frame?.ayanamsaDegrees, 0, 40);
  if (frame?.ayanamsa !== opts.ayanamsa || ayDeg === null) errors.push("frame: istenen ayanamsa değil");
  const signs = arr(r.signs);
  if (!signs || signs.map((s) => mapRashi(s)).join() !== SIGN_IDS.join()) errors.push("signs: Koç→Balık sırası değil");
  const bav = ashtakaRows(r.bhinnashtakavarga, "bhinnashtakavarga", errors);
  const rbav = ashtakaRows(r.reducedBhinnashtakavarga, "reducedBhinnashtakavarga", errors);
  for (const row of bav) if (BAV_TOTALS[row.id] !== row.total) errors.push(`bhinnashtakavarga.${row.id}: BPHS toplamı değil`);
  const savO = obj(r.sarvashtakavarga);
  const rsavO = obj(r.reducedSarvashtakavarga);
  const sav = { bindus: bindus12(savO?.bindus, 56), total: int(savO?.total, 0, 400) };
  const rsav = { bindus: bindus12(rsavO?.bindus, 56), total: int(rsavO?.total, 0, 400) };
  if (!sav.bindus || sav.total === null || !rsav.bindus || rsav.total === null) errors.push("sarvashtakavarga: alan");
  const sum7 = (rows: AshtakaRow[], i: number) => rows.filter((x) => x.id !== "lagna").reduce((a, x) => a + x.bindus[i], 0);
  if (sav.bindus && rsav.bindus && bav.length === 8 && rbav.length === 8) {
    for (let i = 0; i < 12; i++) {
      if (sav.bindus[i] !== sum7(bav, i)) errors.push(`sarvashtakavarga[${i}] ≠ 7 BAV toplamı`);
      if (rsav.bindus[i] !== sum7(rbav, i)) errors.push(`reducedSarvashtakavarga[${i}] ≠ 7 indirgenmiş BAV toplamı`);
    }
    if (sav.total !== 337 || sav.bindus.reduce((a, b) => a + b, 0) !== 337) errors.push("sarvashtakavarga toplamı 337 değil");
    if (rsav.total !== rsav.bindus.reduce((a, b) => a + b, 0)) errors.push("reducedSarvashtakavarga toplamı");
    bav.forEach((row, k) => row.bindus.forEach((b, i) => rbav[k] && rbav[k].bindus[i] > b && errors.push(`indirgenmiş > özgün: ${row.id}[${i}]`)));
  }
  const shodhyaPinda: VedicAshtakavargaTechnical["shodhyaPinda"] = [];
  for (const it of arr(r.shodhyaPinda) ?? []) {
    const o = obj(it);
    const id = ashtakaId(o?.planet);
    const rp = num(o?.rashiPinda, 0, 10000);
    const gp = num(o?.grahaPinda, 0, 10000);
    const sp = num(o?.shodhyaPinda, 0, 20000);
    if (!id || rp === null || gp === null || sp === null) {
      errors.push("shodhyaPinda[]: alan");
      continue;
    }
    if (Math.abs(rp + gp - sp) > 1e-6) errors.push(`shodhyaPinda.${id}: toplam`);
    shodhyaPinda.push({ id, rashiPinda: rp, grahaPinda: gp, total: sp });
  }
  if (shodhyaPinda.map((x) => x.id).join() !== ASHTAKA_ORDER.join()) errors.push("shodhyaPinda: 7 graha + Lagna sırası");
  return done(
    errors,
    [],
    () => ({
      schema: VEDIC_ASHTAKAVARGA_TECHNICAL_SCHEMA,
      zodiac: "sidereal",
      frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! },
      bav,
      sav: { bindus: sav.bindus!, total: sav.total! },
      reducedBav: rbav,
      reducedSav: { bindus: rsav.bindus!, total: rsav.total! },
      shodhyaPinda,
    }),
    () => null,
    raw,
    ASHTAKA_KNOWN,
    new Set(),
  );
}

// ═══ 5F · Shadbala (/vedic-astrology/shadbala) ═══════════════════════════════
// Denetimler: toplam virupa = 6 bileşen toplamı; rupa = virupa/60; asgari rupa ve Naisargika Bala BPHS sabitleri;
// oran = rupa/asgari; sıralama orana göre (1 = en güçlü). balaThemes (yerelleştirilmiş ad/anlam) → yorum katmanı.
export const ROXY_VEDIC_SHADBALA = { endpoint: "/vedic-astrology/shadbala", adapter: "astro-roxy-vedic-shadbala-1", projection: "vedic-shadbala-proj-1" } as const;
const SHADBALA_KNOWN = new Set<string>([
  ...paths("frame", ["ayanamsa", "ayanamsaDegrees"]),
  "balaThemes",
  ...SHADBALA_COMPONENTS.flatMap((c) => paths(`balaThemes.${c}`, ["name", "meaning"])),
  "planets",
  ...paths("planets[]", ["planet", ...SHADBALA_COMPONENTS, "totalVirupas", "totalRupas", "minRequired", "strengthRatio", "ishtaPhala", "kashtaPhala", "relativeRank"]),
]);
const SHADBALA_ORDER: VedicGrahaId[] = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn"];

export function projectRoxyVedicShadbala(raw: unknown, opts: { ayanamsa: VedicAyanamsaId }): AdapterResult<VedicShadbalaTechnical, VedicShadbalaInterpretation> {
  const errors: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const frame = obj(r.frame);
  const ayDeg = num(frame?.ayanamsaDegrees, 0, 40);
  if (frame?.ayanamsa !== opts.ayanamsa || ayDeg === null) errors.push("frame: istenen ayanamsa değil");
  const planets: VedicShadbalaTechnical["planets"] = [];
  for (const it of arr(r.planets) ?? []) {
    const o = obj(it);
    const id = mapGraha(o?.planet);
    const comp = Object.fromEntries(SHADBALA_COMPONENTS.map((c) => [c, num(o?.[c], -1000, 2000)])) as Record<ShadbalaComponent, number | null>;
    const tv = num(o?.totalVirupas, -1000, 5000);
    const tr = num(o?.totalRupas, -20, 100);
    const mr = num(o?.minRequired, 0, 20);
    const sr = num(o?.strengthRatio, -5, 20);
    const ip = num(o?.ishtaPhala, 0, 60);
    const kp = num(o?.kashtaPhala, 0, 60);
    const rank = int(o?.relativeRank, 1, 7);
    if (!id || Object.values(comp).some((x) => x === null) || tv === null || tr === null || mr === null || sr === null || ip === null || kp === null || rank === null) {
      errors.push("planets[]: alan");
      continue;
    }
    const sum = SHADBALA_COMPONENTS.reduce((a, c) => a + (comp[c] as number), 0);
    if (Math.abs(sum - tv) > 0.05) errors.push(`${id}: toplam virupa bileşen toplamı değil`);
    if (Math.abs(tv / 60 - tr) > 0.001) errors.push(`${id}: rupa = virupa/60 değil`);
    if (SHADBALA_MIN_RUPAS[id] !== mr) errors.push(`${id}: asgari rupa BPHS değil`);
    if (Math.abs((comp.naisargikaBala as number) - NAISARGIKA_BALA[id]) > 0.011) errors.push(`${id}: Naisargika Bala BPHS değil`);
    if (Math.abs(tr / mr - sr) > 0.001) errors.push(`${id}: oran rupa/asgari değil`);
    planets.push({ id, ...(comp as Record<ShadbalaComponent, number>), totalVirupas: tv, totalRupas: tr, minRequired: mr, strengthRatio: sr, ishtaPhala: ip, kashtaPhala: kp, rank });
  }
  if (planets.map((x) => x.id).join() !== SHADBALA_ORDER.join()) errors.push("planets: 7 klasik graha sırası");
  const byRatio = [...planets].sort((a, b) => b.strengthRatio - a.strengthRatio).map((x) => x.id);
  planets.forEach((p) => p.rank !== byRatio.indexOf(p.id) + 1 && errors.push(`${p.id}: sıralama orana göre değil`));
  const th = obj(r.balaThemes);
  return done(
    errors,
    [],
    () => ({ schema: VEDIC_SHADBALA_TECHNICAL_SCHEMA, zodiac: "sidereal", frame: { ayanamsa: opts.ayanamsa, ayanamsaDegrees: ayDeg! }, planets }),
    () => ({
      schema: VEDIC_SHADBALA_INTERP_SCHEMA,
      themes: SHADBALA_COMPONENTS.map((c) => ({ component: c, name: text(obj(th?.[c])?.name), meaning: text(obj(th?.[c])?.meaning) })).filter((x) => x.name || x.meaning),
    }),
    raw,
    SHADBALA_KNOWN,
    new Set(),
  );
}

// ═══ 5F · Janma Panchanga (/vedic-astrology/panchang/basic, Lahiri sabit) ═════
// BAĞIMSIZ denetimler (Güneş/Ay sidereal boylamından): tithi = ⌊(Ay−Güneş)/12°⌋+1, paksha, yüzde; nitya yoga =
// ⌊(Güneş+Ay)/13°20′⌋+1, yüzde; karana = yarım-tithi sırası (0 Kimstughna, 1–56 hareketli 7'li döngü, 57–59
// Shakuni/Chatushpada/Naga); nakshatra/pada/yönetici = Ay boylamı. characteristics → yorum katmanı.
export const ROXY_VEDIC_PANCHANGA = { endpoint: "/vedic-astrology/panchang/basic", adapter: "astro-roxy-vedic-panchanga-1", projection: "vedic-panchanga-proj-1" } as const;
const PANCHANGA_KNOWN = new Set<string>([
  ...paths("tithi", ["number", "name", "paksha", "percent", "deity", "rulingPlanet", "element"]),
  ...paths("nakshatra", ["number", "name", "lord", "pada", "deity", "symbol", "characteristics"]),
  ...paths("yoga", ["number", "name", "percent", "characteristics"]),
  ...paths("karana", ["number", "name", "percent", "type", "characteristics"]),
  "sunLongitude",
  "moonLongitude",
]);
/** Yarım-tithi sırası (0…59) → karana kimliği ve Roxy numarası (hareketli 1–7, Shakuni 8, Chatushpada 9, Naga 10, Kimstughna 11). */
export function karanaOfHalfTithi(h: number): { id: (typeof KARANA_IDS)[number]; number: number; movable: boolean } {
  if (h === 0) return { id: "kimstughna", number: 11, movable: false };
  if (h >= 57) return { id: (["shakuni", "chatushpada", "naga"] as const)[h - 57], number: h - 49, movable: false };
  const i = (h - 1) % 7;
  return { id: KARANA_IDS[i], number: i + 1, movable: true };
}

export function projectRoxyVedicPanchanga(raw: unknown): AdapterResult<VedicPanchangaTechnical, VedicPanchangaInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };
  const sun = num(r.sunLongitude, 0, 360);
  const moon = num(r.moonLongitude, 0, 360);
  const t = obj(r.tithi);
  const n = obj(r.nakshatra);
  const y = obj(r.yoga);
  const k = obj(r.karana);
  const tn = int(t?.number, 1, 30);
  const tp = num(t?.percent, 0, 100);
  const pk = typeof t?.paksha === "string" ? t.paksha.trim().toLowerCase() : "";
  const nn = int(n?.number, 1, 27);
  const np = int(n?.pada, 1, 4);
  const nl = mapGraha(n?.lord);
  const yn = int(y?.number, 1, 27);
  const yp = num(y?.percent, 0, 100);
  const kn = int(k?.number, 1, 11);
  const kpct = num(k?.percent, 0, 100);
  if (sun === null || moon === null || tn === null || tp === null || (pk !== "shukla" && pk !== "krishna") || nn === null || np === null || !nl || yn === null || yp === null || kn === null || kpct === null || !text(t?.name) || !text(y?.name) || !text(k?.name)) {
    return { ok: false, errors: ["panchang: alan"] };
  }
  const elong = (((moon - sun) % 360) + 360) % 360;
  if (Math.floor(elong / 12) + 1 !== tn) errors.push("tithi Güneş/Ay boylamıyla uyuşmuyor");
  if (Math.abs(((elong % 12) / 12) * 100 - tp) > 0.5) errors.push("tithi yüzdesi");
  if ((tn <= 15 ? "shukla" : "krishna") !== pk) errors.push("paksha tithi ile uyuşmuyor");
  const ysum = (sun + moon) % 360;
  if (Math.floor(ysum / NAK_SPAN) + 1 !== yn) errors.push("nitya yoga Güneş+Ay ile uyuşmuyor");
  if (Math.abs(((ysum % NAK_SPAN) / NAK_SPAN) * 100 - yp) > 0.5) errors.push("nitya yoga yüzdesi");
  const h = Math.floor(elong / 6);
  const kar = karanaOfHalfTithi(h);
  if (kar.movable ? kar.number !== kn : !slug(String(k?.name)).startsWith(kar.id.slice(0, 4))) errors.push("karana yarım-tithi ile uyuşmuyor");
  if (Math.abs(((elong % 6) / 6) * 100 - kpct) > 0.5) errors.push("karana yüzdesi");
  const ni = Math.min(26, Math.floor(moon / NAK_SPAN));
  if (nn - 1 !== ni) errors.push("nakshatra Ay boylamıyla uyuşmuyor");
  if (Math.min(4, Math.floor((moon % NAK_SPAN) / PADA_SPAN) + 1) !== np) errors.push("pada Ay boylamıyla uyuşmuyor");
  if (nl !== NAKSHATRA_LORDS[ni % 9]) errors.push("nakshatra yöneticisi sırayla uyuşmuyor");
  if (typeof n?.name === "string" && slug(n.name) !== NAKSHATRAS[ni]) dropped.push("nakshatra.name");
  const rp = t?.rulingPlanet === undefined ? null : mapGraha(t.rulingPlanet);
  if (t?.rulingPlanet !== undefined && !rp) dropped.push("tithi.rulingPlanet");
  const short = (v: unknown) => (typeof v === "string" && v.trim() && v.length <= 40 ? v.trim() : null);
  return done(
    errors,
    dropped,
    () => ({
      schema: VEDIC_PANCHANGA_TECHNICAL_SCHEMA,
      zodiac: "sidereal",
      frame: { ayanamsa: "lahiri", ayanamsaDegrees: null },
      sunLongitude: sun,
      moonLongitude: moon,
      tithi: { number: tn, name: (text(t?.name) as string).slice(0, 40), paksha: pk as "shukla" | "krishna", percent: tp, deity: short(t?.deity), rulingPlanet: rp, element: short(t?.element) },
      nakshatra: { index: ni, id: NAKSHATRAS[ni], pada: np, lord: nl, deity: short(n?.deity), symbol: short(n?.symbol) },
      nityaYoga: { number: yn, name: (text(y?.name) as string).slice(0, 40), percent: yp },
      karana: { number: kn, id: kar.id, name: (text(k?.name) as string).slice(0, 40), percent: kpct, movable: kar.movable },
    }),
    () => ({ schema: VEDIC_PANCHANGA_INTERP_SCHEMA, nakshatra: text(n?.characteristics), yoga: text(y?.characteristics), karana: text(k?.characteristics) }),
    raw,
    PANCHANGA_KNOWN,
    new Set(),
  );
}
