// Doğaltaş Kütüphanesi · sağlayıcı kristal yanıtı → kütüphane yazım planı (SAF; IO yok).
// Metin DEĞİŞTİRİLMEZ (yalnız boşluk kırpılır); şüpheli dil / sağlık iddiası / tekrar yalnız İŞARETLENİR.

import { foldStoneLibraryText } from "../fold";
import { hasHealthClaim } from "./healthLexicon";
import { enFieldFlags, isDuplicateOf, trFieldFlags, type QualityFlag } from "./langQuality";

/** Sağlayıcı detay yanıtının bilinen alanları (OpenAPI v2.0.0). Bunların dışındakiler raporlanır. */
export const KNOWN_DETAIL_KEYS = [
  "name", "id", "imageUrl", "description", "meaning", "chakras", "zodiacSigns", "planet", "elements", "colors",
  "hardness", "numericalVibration", "keywords", "birthMonth", "affirmation", "pairsWith",
] as const;
export const KNOWN_MEANING_KEYS = ["spiritual", "emotional", "physical"] as const;

export const VOCAB = {
  chakra: new Map([["root", "root"], ["sacral", "sacral"], ["solar plexus", "solar_plexus"], ["heart", "heart"], ["throat", "throat"],
    ["third eye", "third_eye"], ["crown", "crown"]]),
  zodiac: new Set(["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]),
  element: new Set(["earth", "water", "fire", "air", "storm"]),
  planet: new Set(["sun", "moon", "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"]),
} as const;

export type PlanRecord = { field: string; lang: "tr" | "en"; content: string; flags: QualityFlag[]; health: boolean };
export type PlanFacet = {
  facet: string; lang?: "tr" | "en"; value_key?: string; value_text?: string; value_num?: number; pair_external_id?: string;
  flags: QualityFlag[]; health: boolean;
};
export type CrystalPlan = {
  externalId: string;
  nameTr: string | null;
  nameEn: string | null;
  nameTrSuspect: boolean;
  slug: string;
  records: PlanRecord[];
  facets: PlanFacet[];
  imageUrl: string | null;
  unknownKeys: string[];
  issues: string[];
};

const EXT_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : []);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function slugFrom(name: string | null, fallback: string): string {
  const s = foldStoneLibraryText(name ?? "").replace(/ /g, "-").slice(0, 70).replace(/-+$/, "");
  return s || foldStoneLibraryText(fallback).replace(/ /g, "-").slice(0, 70) || "tas";
}

export function colorKey(v: string): string | null {
  const k = foldStoneLibraryText(v).replace(/ /g, "_");
  return /^[a-z0-9_]{1,60}$/.test(k) ? k : null;
}

/**
 * Sağlayıcının serbest renk metni ("apple green", "black-green", "colourless" …) → sözlükteki renk AİLELERİ
 * (Türkçe etiketli filtre anahtarları). Özgün metin facet'in value_text alanında korunur; eşlenemeyen sözcük olay olur.
 */
const COLOR_TOKENS: Record<string, string> = {
  black: "black", blackish: "black", white: "white", whitish: "white", bluish_white: "white", clear: "clear", colorless: "clear", colourless: "clear",
  grey: "grey", gray: "grey", greyish: "grey", silver: "silver", silvery: "silver", gold: "golden", golden: "golden", brass: "golden",
  brown: "brown", browns: "brown", brownish: "brown", tan: "brown", beige: "beige", red: "red", reddish: "red", crimson: "red", burgundy: "red",
  brick: "red", orange: "orange", salmon: "orange", peach: "peach", yellow: "yellow", yellowish: "yellow", green: "green", greenish: "green",
  olive: "green", emerald: "green", bottle: "green", apple: "green", blue: "blue", bluish: "blue", azure: "blue", sky: "blue", cyan: "blue",
  royal: "blue", turquoise: "turquoise", indigo: "indigo", violet: "violet", lavender: "violet", lilac: "violet", mauve: "violet",
  purple: "purple", pink: "pink", pinkish: "pink", rose: "pink", magenta: "pink", cream: "cream", creamy: "cream", banded: "multicolor",
  multicolor: "multicolor", multicolored: "multicolor", multi: "multicolor",
};
const COLOR_IGNORE = new Set(["light", "dark", "deep", "pale", "rich", "faintly", "colored", "coloured"]);

export function colorFamilies(v: string): { families: string[]; unknown: string[] } {
  const toks = foldStoneLibraryText(v).split(" ").filter(Boolean);
  const fam = new Set<string>();
  const unknown: string[] = [];
  for (const t of toks) {
    if (COLOR_IGNORE.has(t)) continue;
    const f = COLOR_TOKENS[t];
    if (f) fam.add(f);
    else unknown.push(t);
  }
  return { families: [...fam], unknown };
}

const ALL_SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];

/** Bileşik değerleri böler: "Fire / Earth", "Earth/Air/Fire", "Venus & Neptune", "All (Earth, Water)". */
export function splitCompound(v: string): string[] {
  return v.split(/[\/&,()]|\band\b/i).map((x) => x.trim()).filter(Boolean);
}

function unknownKeys(o: Record<string, unknown>): string[] {
  const out = Object.keys(o).filter((k) => !(KNOWN_DETAIL_KEYS as readonly string[]).includes(k));
  if (isObj(o.meaning)) for (const k of Object.keys(o.meaning)) if (!(KNOWN_MEANING_KEYS as readonly string[]).includes(k)) out.push(`meaning.${k}`);
  return out;
}

/** EN ve TR detay yanıtlarından plan üretir. Biri eksikse diğeriyle devam eder (eksik dil olay olarak raporlanır). */
export function planCrystal(en: unknown, tr: unknown): CrystalPlan | null {
  const E = isObj(en) ? en : null;
  const T = isObj(tr) ? tr : null;
  const id = text(E?.id) ?? text(T?.id);
  if (!id || !EXT_RE.test(id)) return null;
  const issues: string[] = [];
  if (!E) issues.push("en_missing");
  if (!T) issues.push("tr_missing");
  if (E && T && text(E.id) !== text(T.id)) issues.push("id_mismatch");

  const nameEn = text(E?.name);
  const nameTrRaw = text(T?.name);
  const nameTrSuspect = !!nameTrRaw && !!nameEn && nameTrRaw.toLowerCase() === nameEn.toLowerCase();
  const nameTr = nameTrRaw ?? nameEn;
  if (nameTrSuspect) issues.push("tr_name_equals_en");

  const fields: [string, (o: Record<string, unknown>) => unknown][] = [
    ["description", (o) => o.description],
    ["meaning_spiritual", (o) => (isObj(o.meaning) ? o.meaning.spiritual : null)],
    ["meaning_emotional", (o) => (isObj(o.meaning) ? o.meaning.emotional : null)],
    ["meaning_physical", (o) => (isObj(o.meaning) ? o.meaning.physical : null)],
    ["affirmation", (o) => o.affirmation],
  ];
  const records: PlanRecord[] = [];
  for (const lang of ["en", "tr"] as const) {
    const src = lang === "en" ? E : T;
    if (!src) continue;
    const vals = new Map(fields.map(([f, g]) => [f, text(g(src))]));
    for (const [field] of fields) {
      const content = vals.get(field);
      if (!content) continue;
      const flags = new Set<QualityFlag>(lang === "tr" ? trFieldFlags(content, E ? text(fields.find((x) => x[0] === field)![1](E)) : null) : enFieldFlags(content));
      if (field !== "meaning_physical" && field !== "description" && isDuplicateOf(content, vals.get("meaning_physical"))) flags.add("duplicate_text");
      if (field === "meaning_spiritual" && isDuplicateOf(content, vals.get("meaning_emotional"))) flags.add("duplicate_text");
      const health = field === "meaning_physical" || hasHealthClaim(content);
      if (health && field !== "meaning_physical") flags.add("health_lexicon");
      records.push({ field, lang, content, flags: [...flags], health });
    }
  }

  // Sağlık işareti diller arası yayılır: aynı alanın bir dilinde tıbbi iddia varsa iki dil de kilitlenir.
  const healthFields = new Set(records.filter((r) => r.health).map((r) => r.field));
  for (const r of records) {
    if (healthFields.has(r.field) && !r.health) {
      r.health = true;
      if (r.field !== "meaning_physical" && !r.flags.includes("health_lexicon")) r.flags.push("health_lexicon");
    }
  }

  const base = E ?? T!;
  const facets: PlanFacet[] = [];
  for (const c of list(base.chakras)) {
    const k = VOCAB.chakra.get(c.toLowerCase().replace(/[-_]+/g, " ").trim());
    if (k) facets.push({ facet: "chakra", value_key: k, flags: [], health: false });
    else issues.push(`vocab_missing:chakra:${c}`);
  }
  const seen = new Set<string>();
  const addKeyed = (facet: string, key: string, valueText?: string) => {
    if (seen.has(`${facet}|${key}`)) return;
    seen.add(`${facet}|${key}`);
    facets.push({ facet, value_key: key, ...(valueText ? { value_text: valueText } : {}), flags: [], health: false });
  };
  for (const z of list(base.zodiacSigns)) {
    const parts = splitCompound(z);
    if (parts.some((p) => /^all\b/i.test(p))) {
      // "All" / "All birth signs": 12 burca açılır; owner görsün diye olay olarak raporlanır.
      for (const s of ALL_SIGNS) addKeyed("zodiac", s);
      issues.push(`zodiac_all_expanded:${z}`);
      continue;
    }
    for (const p of parts) {
      const k = p.toLowerCase();
      if (VOCAB.zodiac.has(k)) addKeyed("zodiac", k);
      else issues.push(`vocab_missing:zodiac:${p}`);
    }
  }
  for (const el of list(base.elements)) {
    const parts = splitCompound(el);
    // Elementte "All" belirsiz ("All (Earth, Water)") → genişletilmez; yalnız açıkça yazılan elementler alınır.
    if (parts.some((p) => /^all\b/i.test(p))) issues.push(`element_all_ambiguous:${el}`);
    for (const p of parts) {
      const k = p.toLowerCase();
      if (/^all\b/.test(k)) continue;
      if (VOCAB.element.has(k)) addKeyed("element", k);
      else issues.push(`vocab_missing:element:${p}`);
    }
  }
  const planet = text(base.planet);
  if (planet) {
    for (const p of splitCompound(planet)) {
      const k = p.toLowerCase();
      if (VOCAB.planet.has(k)) addKeyed("planet", k);
      else issues.push(`vocab_missing:planet:${p}`);
    }
  }
  const famText = new Map<string, string[]>();
  for (const col of list(base.colors)) {
    const { families, unknown } = colorFamilies(col);
    for (const f of families) famText.set(f, [...(famText.get(f) ?? []), col]);
    if (families.length === 0) issues.push(`color_unmapped:${col}`);
    else if (unknown.length) issues.push(`color_partial:${col}`);
  }
  for (const [f, texts] of famText) addKeyed("color", f, texts.join(", ").slice(0, 200));
  const enKw = new Set(list(E?.keywords).map((x) => x.toLowerCase()));
  for (const lang of ["en", "tr"] as const) {
    const src = lang === "en" ? E : T;
    if (!src) continue;
    for (const kw of list(src.keywords)) {
      const key = foldStoneLibraryText(kw);
      if (!key || key.length > 120) { issues.push(`keyword_skipped:${lang}`); continue; }
      const flags = new Set<QualityFlag>();
      if (lang === "tr" && enKw.has(kw.toLowerCase())) { flags.add("tr_equals_en"); flags.add("lang_suspect"); }
      const health = hasHealthClaim(kw);
      if (health) flags.add("health_lexicon");
      facets.push({ facet: "keyword", lang, value_text: kw, flags: [...flags], health });
    }
  }
  const hard = numOrNull(base.hardness);
  if (hard != null) { if (hard >= 0 && hard <= 10) facets.push({ facet: "hardness", value_num: hard, flags: [], health: false }); else issues.push("hardness_out_of_range"); }
  const vib = numOrNull(base.numericalVibration);
  if (vib != null) facets.push({ facet: "numerical_vibration", value_num: vib, flags: [], health: false });
  const bm = numOrNull(base.birthMonth);
  if (bm != null) { if (Number.isInteger(bm) && bm >= 1 && bm <= 12) facets.push({ facet: "birth_month", value_num: bm, flags: [], health: false }); else issues.push("birth_month_invalid"); }
  for (const p of list(base.pairsWith)) {
    if (EXT_RE.test(p) && p !== id) facets.push({ facet: "pairing", pair_external_id: p, flags: [], health: false });
    else issues.push("pairing_invalid");
  }

  const img = text(base.imageUrl) ?? text(T?.imageUrl);
  const unk = [...new Set([...(E ? unknownKeys(E) : []), ...(T ? unknownKeys(T) : [])])];
  return {
    externalId: id,
    nameTr,
    nameEn,
    nameTrSuspect,
    slug: slugFrom(nameTr, id),
    records,
    facets,
    imageUrl: img,
    unknownKeys: unk,
    issues,
  };
}

/** Liste yanıtı → harici kimlikler (sayfa toplamı ile). */
export function parseCatalogPage(json: unknown): { total: number | null; ids: string[]; names: Map<string, string> } {
  const o = isObj(json) ? json : {};
  const items = Array.isArray(o.crystals) ? o.crystals : [];
  const names = new Map<string, string>();
  const ids: string[] = [];
  for (const it of items) {
    if (!isObj(it)) continue;
    const id = text(it.id);
    if (id && EXT_RE.test(id) && !names.has(id)) { ids.push(id); names.set(id, text(it.name) ?? id); }
  }
  return { total: typeof o.total === "number" ? o.total : null, ids, names };
}

/** Doğum taşı yanıtı → (ay, kimlikler). */
export function parseBirthstone(json: unknown): { month: number | null; ids: string[] } {
  const o = isObj(json) ? json : {};
  const month = typeof o.month === "number" ? o.month : null;
  const ids = (Array.isArray(o.crystals) ? o.crystals : []).map((c) => (isObj(c) ? text(c.id) : null)).filter((x): x is string => !!x && EXT_RE.test(x));
  return { month, ids };
}
