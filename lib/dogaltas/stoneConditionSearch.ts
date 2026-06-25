/**
 * "Kombinasyon Oluştur" — çok türlü arama koşulu motoru (saf/test edilebilir).
 *
 * Mineral aramasının MEVCUT davranışı (mineralCombination.ts) AYNEN korunur;
 * bu modül onun üzerine Çakra / Astroloji / Etkili Organ / Taş İsmi türlerini ekler.
 * Tüm koşullar VE (AND) mantığıyla birleşir. Karşılaştırmalar Türkçe-normalize.
 *
 * Alan eşleşmeleri (mevcut veri yapısı tespit edilerek):
 *   - Mineral  → stones.assignments "Mineraller" bölümü   (+ opsiyonel yüzde eşiği)
 *   - Çakra    → stones.chakras kolonu  +  assignments "Çakra Atama" bölümü
 *   - Astroloji→ assignments "Astrolojik Atama" / "Burçlar" / "Gezegen" bölümleri
 *   - Organ    → assignments "Etkili Organlar" bölümü
 *   - Taş İsmi → stones.stone_name (kısmi eşleşme)
 */

import {
  containsTr,
  normalizeTr,
  getAssignmentSection,
} from "@/lib/dogaltas/stoneSearchUtils";
import {
  extractStoneMinerals,
  evaluateCondition,
  type MineralCondition,
} from "@/lib/dogaltas/mineralCombination";

export type SearchType = "mineral" | "chakra" | "astrology" | "organ" | "stone_name";

export type SearchCondition = {
  id: string;
  type: SearchType;
  value: string;
  /** Yalnızca mineral türünde anlamlı; diğer türlerde null. */
  minPercent: number | null;
};

/** Arama koşulunda değerlendirilen taş için gereken minimum alanlar. */
export type ConditionStone = {
  stone_name: string;
  chakras: string[] | null;
  assignments: unknown;
};

export const SEARCH_TYPES: SearchType[] = [
  "mineral",
  "chakra",
  "astrology",
  "organ",
  "stone_name",
];

export const SEARCH_TYPE_META: Record<
  SearchType,
  { label: string; icon: string; placeholder: string }
> = {
  mineral: { label: "Mineral", icon: "🧪", placeholder: "örn. Demir, Lityum, Kalsiyum" },
  chakra: { label: "Çakra", icon: "🔵", placeholder: "örn. Kök, Kalp, Boğaz" },
  astrology: { label: "Astroloji", icon: "♈", placeholder: "örn. Koç, Venüs, Mars" },
  organ: { label: "Etkili Organ", icon: "🫀", placeholder: "örn. Böbrek, Karaciğer" },
  stone_name: { label: "Taş İsmi", icon: "💎", placeholder: "örn. Kuvars, Akik" },
};

/** Bir taşın belirli arama türü için ham (görünür) değerleri. */
function rawValues(stone: ConditionStone, type: SearchType): string[] {
  switch (type) {
    case "mineral":
      return extractStoneMinerals(stone.assignments).map((m) => m.name);
    case "chakra": {
      const col = Array.isArray(stone.chakras) ? stone.chakras.map((c) => String(c)) : [];
      const asg = getAssignmentSection(stone.assignments, "cakra", "çakra", "chakra");
      return [...col, ...asg];
    }
    case "astrology":
      return getAssignmentSection(
        stone.assignments,
        "burc",
        "burç",
        "astroloj",
        "gezegen",
        "planet",
        "zodiac",
      );
    case "organ":
      return getAssignmentSection(stone.assignments, "organ");
    case "stone_name":
      return stone.stone_name ? [stone.stone_name] : [];
  }
}

/** Sayım/hızlı eşleşme için normalize birleşik metin. */
function searchText(stone: ConditionStone, type: SearchType): string {
  return rawValues(stone, type).map(normalizeTr).join(" | ");
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    const k = normalizeTr(v);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export type ConditionMatchResult = {
  id: string;
  type: SearchType;
  satisfied: boolean;
  /** Görüntülemeye hazır eşleşen değerler (mineralde yüzde dahil). */
  matchedNames: string[];
};

/** "Demir ≥ %10" / "Kök" gibi kısa etiket (chip + özet). */
export function conditionShortLabel(cond: SearchCondition): string {
  const v = cond.value.trim();
  if (cond.type === "mineral" && cond.minPercent != null) return `${v} ≥ %${cond.minPercent}`;
  return v;
}

/** "Mineral: Demir ≥ %10" gibi tür önekli etiket (sepet + kayıt özeti). */
export function describeCondition(cond: SearchCondition): string {
  return `${SEARCH_TYPE_META[cond.type].label}: ${conditionShortLabel(cond)}`;
}

/** Tek koşulun tek taşa karşı değerlendirmesi. */
export function evaluateOne(
  stone: ConditionStone,
  cond: SearchCondition,
): ConditionMatchResult {
  const v = cond.value.trim();
  const base = { id: cond.id, type: cond.type };
  if (!v) return { ...base, satisfied: false, matchedNames: [] };

  // Mineral: MEVCUT mantığı (yüzde eşiği + varlık) aynen kullan.
  if (cond.type === "mineral") {
    const minerals = extractStoneMinerals(stone.assignments);
    const mc: MineralCondition = { id: cond.id, mineral: v, minPercent: cond.minPercent };
    const r = evaluateCondition(minerals, mc);
    const display = r.matchedNames.map((name) => {
      const m = minerals.find((x) => x.name === name);
      return m && m.percent != null ? `${name} %${m.percent}` : name;
    });
    return { ...base, satisfied: r.satisfied, matchedNames: dedupe(display) };
  }

  const matched = rawValues(stone, cond.type).filter((x) => containsTr(x, v));
  return { ...base, satisfied: matched.length > 0, matchedNames: dedupe(matched) };
}

export type MultiEvaluation = {
  matches: boolean;
  perCondition: ConditionMatchResult[];
};

/** Taş TÜM aktif koşulları (AND) sağlıyor mu? */
export function evaluateStoneConditions(
  stone: ConditionStone,
  conditions: SearchCondition[],
): MultiEvaluation {
  const active = conditions.filter((c) => c.value.trim());
  if (active.length === 0) return { matches: false, perCondition: [] };
  const perCondition = active.map((c) => evaluateOne(stone, c));
  return { matches: perCondition.every((r) => r.satisfied), perCondition };
}

/** Arama türü için kayıtlardan benzersiz öneri listesi (TR-sıralı). */
export function collectSuggestions(
  stones: ConditionStone[],
  type: SearchType,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of stones) {
    for (const v of rawValues(s, type)) {
      const t = v.trim();
      if (!t) continue;
      const k = normalizeTr(t);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  out.sort((a, b) => a.localeCompare(b, "tr-TR", { sensitivity: "base" }));
  return out;
}

/** Her seçenek için onu içeren taş sayısı (dropdown rozeti). */
export function buildTypeCounts(
  stones: ConditionStone[],
  type: SearchType,
  options: string[],
): Map<string, number> {
  const texts = stones.map((s) => searchText(s, type));
  const counts = new Map<string, number>();
  for (const name of options) {
    const needle = normalizeTr(name);
    if (!needle) {
      counts.set(name, 0);
      continue;
    }
    let c = 0;
    for (const t of texts) if (t.includes(needle)) c += 1;
    counts.set(name, c);
  }
  return counts;
}

/** Kayıt özeti (notes_text) — tüm arama koşulları madde madde. */
export function buildConditionsSummary(conditions: SearchCondition[]): string {
  const active = conditions.filter((c) => c.value.trim());
  if (active.length === 0) return "";
  const lines = active.map((c) => `- ${describeCondition(c)}`);
  return ["Arama Koşulları:", ...lines].join("\n");
}
