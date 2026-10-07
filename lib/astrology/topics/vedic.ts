// Astroloji — VEDİK konu taksonomisi (Aşama 5; SAF, istemci güvenli).
//
// Vedik gelenek (tradition = "vedic") Batı'dan AYRIDIR: KB kayıtları gelenek sütunuyla ayrışır, anahtar
// türleri de ayrı adlandırılır (graha_*, d9_*, varga_*, dasha_*, yoga). Böylece Batı "planet_in_house"
// notu Vedik D1 yorumu gibi GÖRÜNMEZ; D1 ile D9 konuları da ayrı türlerdir.
//
//   graha_in_rashi:<graha>:<rashi>            (D1)
//   graha_in_bhava:<graha>:<ev 1-12>           (D1, Lagna'dan bütün-burç)
//   graha_in_nakshatra:<graha>:<nakshatra>     (D1)
//   graha_nakshatra_pada:<graha>:<nakshatra>:<pada 1-4>
//   lagna_rashi:<rashi> · lagna_nakshatra:<nakshatra>
//   yoga:<yoga-id>                             (D1'de oluşan yoga)
//   d9_graha_in_rashi:<graha>:<rashi> · d9_lagna_rashi:<rashi> · d9_vargottama:<graha>
//   varga_graha_in_rashi:<dN>:<graha>:<rashi>  (D2…D60, D9 hariç; dN = d2, d3, …)
//   dasha_mahadasha:<lord> · dasha_antardasha:<mahadasha lord>:<antardasha lord>
//
// DB biçim kısıtı (topic_key) ile uyumlu: ^[a-z][a-z_]{1,40}(:[a-z0-9_-]{1,40}){1,4}$

import { SIGN_IDS, type SignId } from "../model/western";
import { NAKSHATRAS, VEDIC_GRAHAS, type VedicD1Technical } from "../model/vedic";
import { SIGN_LABELS } from "../labels/tr";

export const VEDIC_CONTEXTS = ["vedic_d1", "vedic_varga", "vedic_dasha"] as const;
export type VedicContext = (typeof VEDIC_CONTEXTS)[number];
export const VEDIC_CONTEXT_LABELS: Record<VedicContext, string> = { vedic_d1: "Vedik D1 (Rashi)", vedic_varga: "Vedik Varga (D9 / Dn)", vedic_dasha: "Vimshottari Dasha" };

export const GRAHA_LABELS: Record<string, string> = {
  sun: "Surya (Güneş)",
  moon: "Chandra (Ay)",
  mars: "Mangala (Mars)",
  mercury: "Budha (Merkür)",
  jupiter: "Guru (Jüpiter)",
  venus: "Shukra (Venüs)",
  saturn: "Shani (Satürn)",
  rahu: "Rahu",
  ketu: "Ketu",
};
export const NAKSHATRA_LABELS: Record<string, string> = Object.fromEntries(
  NAKSHATRAS.map((n) => [n, n.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")]),
);
export const VARGA_DIVISIONS = [2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60] as const;

/**
 * Roxy D1 yanıtındaki 48 yoga denetiminin kimlik + adı (golden vedic-d1, @roxyapi v2). Konu seçici için
 * liste; doğrulama yine kalıpla yapılır (sağlayıcı yeni yoga eklerse anahtar geçerli kalır).
 * Not: "chandra" kimliği sağlayıcıda "Chakra Yoga" adını taşır — kimlik değiştirilmez.
 */
export const VEDIC_YOGA_NAMES: Record<string, string> = {
  gajakesari: "Gajakesari", sunapha: "Sunapha", anapha: "Anapha", dhurdhura: "Dhurdhura", kemadruma: "Kemadruma",
  chandramangala: "Chandra Mangala", budhaaditya: "Budha-Aditya", ruchaka: "Ruchaka", bhadra: "Bhadra", hamsa: "Hamsa",
  malavya: "Malavya", sasa: "Sasa", dhana: "Dhana", daridra: "Daridra", lakshmi: "Lakshmi", dhanamalika: "Dhana Malika",
  gada: "Gada", "sakata-2": "Sakata", vihaga: "Vihaga", sringhataka: "Sringhataka", hala: "Hala", kamala: "Kamala",
  vapee: "Vapee", yupa: "Yupa", ishu: "Ishu", sakti: "Sakti", danda: "Danda", nav: "Nav", kuta: "Kuta", chhatra: "Chhatra",
  "chapa-2": "Chapa", ardhachandra: "Ardha Chandra", chandra: "Chakra", samudra: "Samudra", vajra: "Vajra", yava: "Yava",
  rajju: "Rajju", musala: "Musala", nala: "Nala", sarpa: "Sarpa", mala: "Mala", "gola-2": "Gola", yuga: "Yuga", sula: "Sula",
  kedara: "Kedara", pasa: "Pasa", damni: "Damni", vallaki: "Vallaki",
};

export type VedicArgType = "graha" | "rashi" | "bhava" | "nakshatra" | "pada" | "yoga" | "division";
type ArgType = VedicArgType;
type Spec = { args: ArgType[]; context: VedicContext; label: (p: string[]) => string };

const g = (s: string) => GRAHA_LABELS[s] ?? s;
const r = (s: string) => (SIGN_LABELS as Record<string, string>)[s] ?? s;
const n = (s: string) => NAKSHATRA_LABELS[s] ?? s;

export const VEDIC_SPECS: Record<string, Spec> = {
  graha_in_rashi: { args: ["graha", "rashi"], context: "vedic_d1", label: (p) => `D1: ${g(p[0])} ${r(p[1])} rashisinde` },
  graha_in_bhava: { args: ["graha", "bhava"], context: "vedic_d1", label: (p) => `D1: ${g(p[0])} ${p[1]}. bhavada` },
  graha_in_nakshatra: { args: ["graha", "nakshatra"], context: "vedic_d1", label: (p) => `D1: ${g(p[0])} ${n(p[1])} nakshatrasında` },
  graha_nakshatra_pada: { args: ["graha", "nakshatra", "pada"], context: "vedic_d1", label: (p) => `D1: ${g(p[0])} ${n(p[1])} ${p[2]}. pada` },
  lagna_rashi: { args: ["rashi"], context: "vedic_d1", label: (p) => `D1: Lagna ${r(p[0])}` },
  lagna_nakshatra: { args: ["nakshatra"], context: "vedic_d1", label: (p) => `D1: Lagna ${n(p[0])} nakshatrasında` },
  yoga: { args: ["yoga"], context: "vedic_d1", label: (p) => `Yoga: ${VEDIC_YOGA_NAMES[p[0]] ? `${VEDIC_YOGA_NAMES[p[0]]} Yoga` : p[0]}` },
  d9_graha_in_rashi: { args: ["graha", "rashi"], context: "vedic_varga", label: (p) => `D9 Navamsa: ${g(p[0])} ${r(p[1])} rashisinde` },
  d9_lagna_rashi: { args: ["rashi"], context: "vedic_varga", label: (p) => `D9 Navamsa: Lagna ${r(p[0])}` },
  d9_vargottama: { args: ["graha"], context: "vedic_varga", label: (p) => `D9 Navamsa: ${g(p[0])} vargottama` },
  varga_graha_in_rashi: { args: ["division", "graha", "rashi"], context: "vedic_varga", label: (p) => `${p[0].toUpperCase()}: ${g(p[1])} ${r(p[2])} rashisinde` },
  dasha_mahadasha: { args: ["graha"], context: "vedic_dasha", label: (p) => `Mahadasha: ${g(p[0])}` },
  dasha_antardasha: { args: ["graha", "graha"], context: "vedic_dasha", label: (p) => `Antardasha: ${g(p[0])} / ${g(p[1])}` },
};
export const VEDIC_KINDS = Object.keys(VEDIC_SPECS);

function valid(t: ArgType, v: string): boolean {
  switch (t) {
    case "graha":
      return (VEDIC_GRAHAS as readonly string[]).includes(v);
    case "rashi":
      return (SIGN_IDS as readonly string[]).includes(v);
    case "bhava":
      return /^(?:[1-9]|1[0-2])$/.test(v);
    case "nakshatra":
      return (NAKSHATRAS as readonly string[]).includes(v);
    case "pada":
      return /^[1-4]$/.test(v);
    case "yoga":
      return /^[a-z0-9-]{2,40}$/.test(v);
    case "division":
      return VARGA_DIVISIONS.some((d) => d !== 9 && `d${d}` === v);
  }
}

/** Konu seçici: argüman türüne göre seçenekler (kimlik, Türkçe etiket). */
export function vedicArgOptions(t: VedicArgType): [string, string][] {
  switch (t) {
    case "graha":
      return VEDIC_GRAHAS.map((x): [string, string] => [x, g(x)]);
    case "rashi":
      return SIGN_IDS.map((x): [string, string] => [x, r(x)]);
    case "bhava":
      return Array.from({ length: 12 }, (_, i): [string, string] => [String(i + 1), `${i + 1}. bhava`]);
    case "nakshatra":
      return NAKSHATRAS.map((x, i): [string, string] => [x, `${i + 1}. ${n(x)}`]);
    case "pada":
      return ["1", "2", "3", "4"].map((x): [string, string] => [x, `${x}. pada`]);
    case "yoga":
      return Object.entries(VEDIC_YOGA_NAMES).map(([k, v]): [string, string] => [k, `${v} Yoga`]);
    case "division":
      return VARGA_DIVISIONS.filter((d) => d !== 9).map((d): [string, string] => [`d${d}`, `D${d}`]);
  }
}

export function vedicDefaultParts(kind: string): string[] {
  const spec = VEDIC_SPECS[kind];
  return spec.args.map((t, i) => (t === "graha" && i > 0 && spec.args[i - 1] === "graha" ? vedicArgOptions(t)[1][0] : vedicArgOptions(t)[0][0]));
}

export function vedicTopicKey(kind: string, parts: string[]): string {
  return [kind, ...parts].join(":");
}

export type ParsedVedicTopic = { kind: string; parts: string[]; context: VedicContext; label: string };

export function parseVedicTopicKey(key: unknown): ParsedVedicTopic | null {
  if (typeof key !== "string" || key.length > 160) return null;
  const [kind, ...parts] = key.split(":");
  const spec = VEDIC_SPECS[kind];
  if (!spec || parts.length !== spec.args.length) return null;
  if (!spec.args.every((t, i) => valid(t, parts[i]))) return null;
  return { kind, parts, context: spec.context, label: spec.label(parts) };
}

export type VedicTopic = { key: string; kind: string; label: string };

export function vedicCollect(items: [string, string[]][]): VedicTopic[] {
  const out = new Map<string, VedicTopic>();
  for (const [kind, parts] of items) {
    const key = [kind, ...parts].join(":");
    const p = parseVedicTopicKey(key);
    if (p && !out.has(key)) out.set(key, { key, kind, label: p.label });
  }
  return [...out.values()];
}

export function topicsFromVedicD1(t: VedicD1Technical): VedicTopic[] {
  const items: [string, string[]][] = [];
  for (const x of t.grahas) {
    items.push(["graha_in_rashi", [x.id, x.rashi]], ["graha_in_bhava", [x.id, String(x.house)]], ["graha_in_nakshatra", [x.id, x.nakshatra.id]], ["graha_nakshatra_pada", [x.id, x.nakshatra.id, String(x.nakshatra.pada)]]);
  }
  items.push(["lagna_rashi", [t.lagna.rashi]], ["lagna_nakshatra", [t.lagna.nakshatra.id]]);
  for (const y of t.yogas) if (y.present) items.push(["yoga", [y.id]]);
  return vedicCollect(items);
}

export type { SignId };
