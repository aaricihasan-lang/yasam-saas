// Astroloji — NATAL ELEMENT / NİTELİK DAĞILIMI: iki yöntem (SAF; istemci güvenli; ağ / DB / sağlayıcı çağrısı YOK).
//
//   • "planets10" (varsayılan, mevcut): Güneş'ten Plüton'a 10 gezegen, her biri 1 puan (toplam 10). Sayılar sağlayıcının
//     kayıtlı `summary` alanından AYNEN gelir (değiştirilmez); sağlayıcının eşitlik kuralıyla seçtiği "baskın" değer de
//     yalnız ikincil bilgi olarak taşınır (Güneş → Ay → Yükselen → Merkür…Plüton — sağlayıcı OpenAPI 2.0.0 belgesi).
//   • "weighted15" (yeni): Güneş, Ay, Yükselen 3'er; MC, Merkür, Venüs, Mars, Jüpiter, Satürn 1'er puan (toplam 15).
//     Uranüs, Neptün, Plüton dahil değildir. Kayıtlı teknik veriden (gövde burçları + ASC/MC burcu) YEREL üretilir →
//     eski kayıtlar için de ek hesap / sağlayıcı isteği gerekmez. Yükselen/MC yoksa (doğum saati bilinmiyor) hesaplanmaz.
//
// Eşitlik: en yüksek değeri paylaşan bütün gruplar listelenir; hiçbir yöntem eşitlikte tek grubu "baskın" ilan etmez.

import { SIGN_IDS, type BodyId, type Element, type Modality, type NatalTechnical, type SignId } from "../model/western";

export const DIST_METHODS = ["planets10", "weighted15"] as const;
export type DistMethod = (typeof DIST_METHODS)[number];

export const DIST_METHOD_LABELS: Record<DistMethod, string> = { planets10: "10 Gezegen", weighted15: "15 Puanlık Analiz" };

/** Ekranda / raporda gösterim sırası (sabit; kayıtlı JSON anahtar sırasından bağımsız). */
export const ELEMENT_ORDER: readonly Element[] = ["fire", "earth", "air", "water"];
export const MODALITY_ORDER: readonly Modality[] = ["cardinal", "fixed", "mutable"];

const PLANETS10: readonly BodyId[] = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

type WeightedKey = "sun" | "moon" | "asc" | "mc" | "mercury" | "venus" | "mars" | "jupiter" | "saturn";
/** 15 puanlık analiz ağırlıkları (toplam 15). */
export const WEIGHTED15: readonly { key: WeightedKey; points: number }[] = [
  { key: "sun", points: 3 },
  { key: "moon", points: 3 },
  { key: "asc", points: 3 },
  { key: "mc", points: 1 },
  { key: "mercury", points: 1 },
  { key: "venus", points: 1 },
  { key: "mars", points: 1 },
  { key: "jupiter", points: 1 },
  { key: "saturn", points: 1 },
];

export const DIST_METHOD_NOTES: Record<DistMethod, string> = {
  planets10: "Güneş'ten Plüton'a 10 gezegen, her biri 1 puan (toplam 10). Yükselen ve MC sayılmaz.",
  weighted15:
    "Güneş, Ay ve Yükselen 3'er puan; MC, Merkür, Venüs, Mars, Jüpiter ve Satürn 1'er puan (toplam 15). Uranüs, Neptün ve Plüton sayılmaz.",
};

/** Burç → element / nitelik (geleneksel eşleşme; burç sırası Koç'tan başlar). */
export function signElement(s: SignId): Element {
  return ELEMENT_ORDER[SIGN_IDS.indexOf(s) % 4];
}
export function signModality(s: SignId): Modality {
  return MODALITY_ORDER[SIGN_IDS.indexOf(s) % 3];
}

export type DistributionOk = {
  method: DistMethod;
  available: true;
  /** "gezegen" (10 gezegen) | "puan" (15 puan) — eşitlik metni için. */
  unit: "gezegen" | "puan";
  total: number;
  elements: Record<Element, number>;
  modalities: Record<Modality, number>;
  /** En yüksek değeri paylaşan gruplar (sabit sırada); 1'den fazlaysa eşitlik. */
  topElements: Element[];
  topModalities: Modality[];
  /** Yalnız "planets10": sağlayıcının eşitlik kuralıyla seçtiği değer (ikincil bilgi; değiştirilmez). */
  providerDominant: { element: Element | null; modality: Modality | null } | null;
};
export type DistributionResult = DistributionOk | { method: DistMethod; available: false; reason: "no_angles" | "no_data" };

function top<K extends string>(order: readonly K[], d: Record<K, number>): K[] {
  const max = Math.max(...order.map((k) => d[k] ?? 0));
  return max > 0 ? order.filter((k) => d[k] === max) : [];
}

type TechnicalLike = Pick<NatalTechnical, "bodies" | "angles" | "summary">;

export function natalDistribution(t: TechnicalLike, method: DistMethod): DistributionResult {
  if (method === "planets10") {
    const sm = t.summary;
    let elements: Record<Element, number> | null = sm?.elementDistribution ? { ...sm.elementDistribution } : null;
    let modalities: Record<Modality, number> | null = sm?.modalityDistribution ? { ...sm.modalityDistribution } : null;
    if (!elements || !modalities) {
      // Kayıtlı özet yoksa aynı kuralla gövde burçlarından (10 gezegen hepsi varsa).
      const bodies = PLANETS10.map((id) => t.bodies.find((b) => b.id === id));
      if (bodies.some((b) => !b)) return { method, available: false, reason: "no_data" };
      elements = { fire: 0, earth: 0, air: 0, water: 0 };
      modalities = { cardinal: 0, fixed: 0, mutable: 0 };
      for (const b of bodies) {
        elements[signElement(b!.sign)] += 1;
        modalities[signModality(b!.sign)] += 1;
      }
    }
    return {
      method,
      available: true,
      unit: "gezegen",
      total: ELEMENT_ORDER.reduce((n, k) => n + (elements![k] ?? 0), 0),
      elements,
      modalities,
      topElements: top(ELEMENT_ORDER, elements),
      topModalities: top(MODALITY_ORDER, modalities),
      providerDominant: sm ? { element: sm.dominantElement ?? null, modality: sm.dominantModality ?? null } : null,
    };
  }

  if (!t.angles?.ascendant || !t.angles?.midheaven) return { method, available: false, reason: "no_angles" };
  const signOf = (k: WeightedKey): SignId | null => {
    if (k === "asc") return t.angles!.ascendant.sign;
    if (k === "mc") return t.angles!.midheaven.sign;
    return t.bodies.find((b) => b.id === k)?.sign ?? null;
  };
  const elements: Record<Element, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalities: Record<Modality, number> = { cardinal: 0, fixed: 0, mutable: 0 };
  for (const w of WEIGHTED15) {
    const s = signOf(w.key);
    if (!s) return { method, available: false, reason: "no_data" };
    elements[signElement(s)] += w.points;
    modalities[signModality(s)] += w.points;
  }
  return {
    method,
    available: true,
    unit: "puan",
    total: 15,
    elements,
    modalities,
    topElements: top(ELEMENT_ORDER, elements),
    topModalities: top(MODALITY_ORDER, modalities),
    providerDominant: null,
  };
}

// ─── Türkçe metin yardımcıları ───────────────────────────────────────────────

/** Üleştirme eki: 1'er, 2'şer, 3'er, 4'er, 5'er, 6'şar, 7'şer, 8'er, 9'ar, 10'ar … */
export function distributive(n: number): string {
  const r = Math.abs(n) % 100;
  const ones = r % 10;
  const tens = Math.floor(r / 10);
  const onesSuffix = ["", "er", "şer", "er", "er", "er", "şar", "şer", "er", "ar"];
  const tensSuffix = ["", "ar", "şer", "ar", "ar", "er", "ar", "er", "er", "ar"];
  const suffix = ones === 0 ? (tens === 0 ? "ar" : tensSuffix[tens]) : onesSuffix[ones];
  return `${n}'${suffix}`;
}

/** "Ateş", "Ateş ve Su", "Ateş, Toprak ve Su" */
export function joinTr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ve ${items[items.length - 1]}`;
}

/** Eşitlik cümlesi: "Toprak ve Hava eşit — 5'er puan." */
export function tieSentence(names: string[], value: number, unit: "gezegen" | "puan"): string {
  return `${joinTr(names)} eşit — ${distributive(value)} ${unit}.`;
}

/** Başlık özeti: tek grup → "baskın: Toprak"; eşitlik → "eşitlik: Ateş · Toprak · Su". */
export function dominantHeadline(names: string[]): string {
  if (names.length === 0) return "";
  return names.length === 1 ? `baskın: ${names[0]}` : `eşitlik: ${names.join(" · ")}`;
}

/** Sağlayıcının eşitlik kuralı — yalnız 10 gezegen yönteminde eşitlik varken ikincil bilgi olarak. */
export const PROVIDER_TIE_RULE_NOTE = "Eşitlikte hesaplama kaynağının kuralı sırasıyla Güneş, Ay, Yükselen, ardından Merkür'den Plüton'a gezegenlerin bulunduğu gruba bakar.";
