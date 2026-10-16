// Astroloji — Roxy SABİT YILDIZLAR adaptörü (SAF). POST /astrology/fixed-stars?orb=3&lang=tr
//
// Beyaz liste projeksiyon (Aşama 3/4 ilkeleri):
//   • TEKNİK: yıldız kanonik kimliği, tropikal boylam/burç/derece, kadir (magnitude), geleneksel doğa (kanonik
//     gezegen kimlikleri), temaslar (nokta kimliği + nokta boylamı + orb).
//   • YORUM (ayrı katman, yetkiyle): stars[].keywords, conjunctions[].interpretation, summary.
//   • YOK SAYILAN (bilinen, kullanılmayan): stars[].name (görüntü adı Yaşam kataloğundan; yalnız düz kavuşum
//     listesinin yıldız adını kimliğe çevirmek için okunur), *Localized, birthDetails yankısı (yalnız denetim).
//   • Bilinmeyen alan → teknik SAYILMAZ; yalnız yolu raporlanır (fail-closed).
// KURAL: Sağlayıcının döndürdüğü yıldızların HİÇBİRİ kavuşumu yok diye atılmaz (43/43 kabul kriteri).
// GOLDEN 2026-10-14: 43 yıldız; boylamlar Swiss Ephemeris kataloğu (sefstars, ICRS J2000 + öz hareket) +
// presesyon + nütasyon + yıllık aberasyon ile bağımsız hesaplanan değerlerle ≤ 0,01′ uyumlu (testte yeniden üretilir).

import { BODY_IDS, NODE_TYPES, type BodyId, type NodeType } from "../../model/western";
import {
  FIXED_STARS_INTERP_SCHEMA,
  FIXED_STARS_TECHNICAL_SCHEMA,
  TRADITIONAL_PLANETS,
  type FixedStar,
  type FixedStarContact,
  type FixedStarPointId,
  type FixedStarsInterpretation,
  type FixedStarsTechnical,
  type TraditionalPlanet,
} from "../../model/westernFixedStars";
import { arr, eclipticPoint, findUnmapped, keywords, mapBody, num, obj, paths, text } from "./shared";
import type { AdapterResult } from "./timing";

export const ROXY_FIXED_STARS = { endpoint: "/astrology/fixed-stars", adapter: "astro-roxy-fixed-stars-1", projection: "fixed-stars-proj-1" } as const;

const STAR_ID_RE = /^[a-z][a-z0-9-]{1,40}$/;

const KNOWN = new Set<string>([
  ...paths("birthDetails", ["date", "time", "latitude", "longitude", "timezone", "nodeType"]),
  "orb",
  "stars",
  ...paths("stars[]", ["id", "name", "nameLocalized", "longitude", "sign", "signLocalized", "degree", "magnitude", "nature", "natureLocalized", "keywords", "conjunctions"]),
  ...paths("stars[].conjunctions[]", ["point", "pointLocalized", "pointLongitude", "orb"]),
  "conjunctions",
  ...paths("conjunctions[]", ["star", "point", "pointLocalized", "orb", "interpretation"]),
  "summary",
]);

const PLANET_WORD: Record<string, TraditionalPlanet> = { sun: "sun", moon: "moon", mercury: "mercury", venus: "venus", mars: "mars", jupiter: "jupiter", saturn: "saturn" };

/** "Saturn and Jupiter" → ["saturn","jupiter"]; tanınmayan sözcük varsa null (uydurma yok). */
export function parseStarNature(v: unknown): TraditionalPlanet[] | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const parts = v
    .toLowerCase()
    .split(/\s*(?:,|&|\band\b|\/|\+)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: TraditionalPlanet[] = [];
  for (const p of parts) {
    const id = PLANET_WORD[p];
    if (!id) return null;
    if (!out.includes(id)) out.push(id);
  }
  return out.length > 0 && out.every((x) => (TRADITIONAL_PLANETS as readonly string[]).includes(x)) ? out : null;
}

export function mapStarPoint(v: unknown): FixedStarPointId | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  if (k === "asc" || k === "ascendant") return "ascendant";
  if (k === "mc" || k === "midheaven") return "midheaven";
  const b = mapBody(v);
  return b && (BODY_IDS as readonly string[]).includes(b) ? (b as BodyId) : null;
}

const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export type FixedStarsExpect = {
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  timezone: number;
  nodeType: NodeType;
  orbQueried: number;
};

export function projectRoxyFixedStars(raw: unknown, expect: FixedStarsExpect): AdapterResult<FixedStarsTechnical, FixedStarsInterpretation> {
  const errors: string[] = [];
  const dropped: string[] = [];
  const r = obj(raw);
  if (!r) return { ok: false, errors: ["root"] };

  // Yankı denetimi: sağlayıcı İSTENEN doğum verisiyle hesaplamalı (yanlış danışana bağlanma/yanlış saat koruması).
  const bd = obj(r.birthDetails);
  if (!bd) errors.push("birthDetails yok");
  else {
    if (bd.date !== expect.date) errors.push("birthDetails.date uyuşmuyor");
    if (typeof bd.time !== "string" || bd.time.slice(0, 5) !== expect.time.slice(0, 5)) errors.push("birthDetails.time uyuşmuyor");
    const la = num(bd.latitude, -90, 90);
    const lo = num(bd.longitude, -180, 180);
    if (la === null || lo === null || Math.abs(la - expect.latitude) > 1e-4 || Math.abs(lo - expect.longitude) > 1e-4) errors.push("birthDetails konum uyuşmuyor");
    const tz = num(bd.timezone, -14, 14);
    if (tz === null || Math.abs(tz - expect.timezone) > 1e-4) errors.push("birthDetails.timezone uyuşmuyor");
    if (bd.nodeType !== undefined && bd.nodeType !== expect.nodeType) errors.push("birthDetails.nodeType uyuşmuyor");
  }
  const orbEcho = num(r.orb, 0, 3);
  if (orbEcho === null || Math.abs(orbEcho - expect.orbQueried) > 1e-9) errors.push("orb yankısı uyuşmuyor");

  const stars: FixedStar[] = [];
  const nested = new Map<string, { point: FixedStarPointId; pointLongitude: number; orb: number }>();
  const byName = new Map<string, string>();
  const iStars: FixedStarsInterpretation["stars"] = [];
  for (const s of arr(r.stars) ?? []) {
    const o = obj(s);
    const id = typeof o?.id === "string" && STAR_ID_RE.test(o.id) ? o.id : null;
    if (!o || !id) {
      errors.push("stars[]: geçersiz kimlik");
      continue;
    }
    if (stars.some((x) => x.id === id)) {
      errors.push(`stars[${id}]: yinelenen kimlik`);
      continue;
    }
    const p = eclipticPoint(o);
    const mag = num(o.magnitude, -2, 7);
    if (!p || mag === null) {
      errors.push(`stars[${id}]: konum/kadir`);
      continue;
    }
    const nature = parseStarNature(o.nature);
    if (nature === null && o.nature !== undefined) dropped.push(`stars[${id}].nature`);
    stars.push({ id, ...p, magnitude: mag, nature });
    if (typeof o.name === "string") byName.set(nameKey(o.name), id);
    byName.set(nameKey(id), id);
    iStars.push({ id, keywords: keywords(o.keywords) });
    for (const c of arr(o.conjunctions) ?? []) {
      const co = obj(c);
      const point = mapStarPoint(co?.point);
      const pl = num(co?.pointLongitude, 0, 360);
      const orb = num(co?.orb, 0, 3.0000001);
      if (!point || pl === null || orb === null) {
        errors.push(`stars[${id}].conjunctions[]`);
        continue;
      }
      nested.set(`${id}|${point}`, { point, pointLongitude: pl, orb });
    }
  }
  if (stars.length === 0) errors.push("stars: boş");

  // Düz kavuşum listesi = yorumlu kaynak; iç içe listeyle BİREBİR tutarlı olmalı (eksik/fazla → hata).
  const contacts: FixedStarContact[] = [];
  const iContacts: FixedStarsInterpretation["contacts"] = [];
  const seen = new Set<string>();
  for (const c of arr(r.conjunctions) ?? []) {
    const co = obj(c);
    const starId = typeof co?.star === "string" ? byName.get(nameKey(co.star)) ?? null : null;
    const point = mapStarPoint(co?.point);
    const orb = num(co?.orb, 0, 3.0000001);
    if (!co || !starId || !point || orb === null) {
      errors.push("conjunctions[]: yıldız/nokta/orb");
      continue;
    }
    const key = `${starId}|${point}`;
    const n = nested.get(key);
    if (!n || Math.abs(n.orb - orb) > 1e-6) {
      errors.push(`conjunctions[${key}]: yıldız listesiyle tutarsız`);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    if (orb > expect.orbQueried + 1e-6) {
      errors.push(`conjunctions[${key}]: orb sınır dışı`);
      continue;
    }
    contacts.push({ star: starId, point, pointLongitude: n.pointLongitude, orb });
    const t = text(co.interpretation);
    if (t) iContacts.push({ star: starId, point, text: t });
  }
  for (const k of nested.keys()) if (!seen.has(k)) errors.push(`stars[].conjunctions[${k}]: düz listede yok`);
  contacts.sort((a, b) => a.orb - b.orb || a.star.localeCompare(b.star));
  iContacts.sort((a, b) => contacts.findIndex((c) => c.star === a.star && c.point === a.point) - contacts.findIndex((c) => c.star === b.star && c.point === b.point));

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25) };
  return {
    ok: true,
    technical: {
      schema: FIXED_STARS_TECHNICAL_SCHEMA,
      zodiac: "tropical",
      method: "ecliptic_longitude_conjunction",
      nodeType: (NODE_TYPES as readonly string[]).includes(expect.nodeType) ? expect.nodeType : "true",
      orbQueried: expect.orbQueried,
      stars,
      contacts,
    },
    interpretation: { schema: FIXED_STARS_INTERP_SCHEMA, stars: iStars, contacts: iContacts, summary: text(r.summary) },
    unmappedFields: findUnmapped(raw, KNOWN, new Set()),
    droppedValues: [...new Set(dropped)],
  };
}
