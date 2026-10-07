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
  type NakshatraPlacement,
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
