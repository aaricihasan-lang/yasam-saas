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
  VEDIC_DASHA_INTERP_SCHEMA,
  VEDIC_DASHA_TECHNICAL_SCHEMA,
  VEDIC_VARGA_INTERP_SCHEMA,
  VIMSHOTTARI_YEARS,
  VEDIC_VARGA_TECHNICAL_SCHEMA,
  type NakshatraPlacement,
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
