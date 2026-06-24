/**
 * "Kombinasyon Oluştur" — mineral tabanlı eşleştirme yardımcıları (saf/test edilebilir).
 *
 * Veri kaynağı: stones.assignments JSON → "Mineraller" bölümü.
 *   Her satır: [mineralAdı, "Oran %"]  (string[][]).
 *   Gerçek veride oran (2. sütun) çoğunlukla BOŞ; ad alanı serbest metindir
 *   (örn. "Kalsiyum (güven, denge)", "...Demir: Yüzleşme Sodyum: Anlayış").
 *
 * Hibrit kural (MVP):
 *   - Mineral varlığı: ad hücresi seçilen mineral adını içeriyorsa eşleşir.
 *   - Yüzde opsiyonel: eşik girilmişse VE taşta o mineral için sayısal oran VARSA
 *     eşik uygulanır; oran yoksa taş varlık üzerinden eşleşir (dışlanmaz).
 *
 * Tüm metin karşılaştırmaları Türkçe-normalize (stoneSearchUtils.containsTr).
 */

import { containsTr, normalizeTr } from "@/lib/dogaltas/stoneSearchUtils";

export type StoneMineral = {
  /** assignments.Mineraller satırının ham ad alanı (row[0]). */
  name: string;
  /** Ayrıştırılmış oran (row[1]); veri yoksa null. */
  percent: number | null;
};

export type MineralCondition = {
  id: string;
  mineral: string;
  /** Opsiyonel minimum yüzde eşiği; boşsa null. */
  minPercent: number | null;
};

export type ConditionMatch = {
  satisfied: boolean;
  /** Eşleşen ham mineral hücreleri (kullanıcıya göstermek için). */
  matchedNames: string[];
  /** Bu koşulda sayısal eşik gerçekten uygulandı mı? */
  appliedThreshold: boolean;
};

export type StoneEvaluation = {
  matches: boolean;
  perCondition: ConditionMatch[];
};

/** assignments JSON'undan "Mineraller" bölümünün ham satırlarını döndürür. */
function getMineralRows(assignments: unknown): unknown[] {
  if (!assignments || typeof assignments !== "object" || Array.isArray(assignments)) {
    return [];
  }
  const obj = assignments as Record<string, unknown>;
  for (const [key, rows] of Object.entries(obj)) {
    if (normalizeTr(key).includes("mineral") && Array.isArray(rows)) {
      return rows;
    }
  }
  return [];
}

/** "10", "%10", "10 %", "10,5", " 12.0 " → 10 / 10.5 / 12 ; boş/geçersiz → null. */
export function parsePercent(raw: unknown): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).trim().replace(",", ".").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Bir taşın mineral satırlarını {name, percent} listesine çevirir. */
export function extractStoneMinerals(assignments: unknown): StoneMineral[] {
  const out: StoneMineral[] = [];
  for (const row of getMineralRows(assignments)) {
    if (!Array.isArray(row) || row.length === 0) continue;
    const name = String(row[0] ?? "").trim();
    if (!name) continue;
    out.push({ name, percent: parsePercent(row[1]) });
  }
  return out;
}

/** Tek bir koşulun (mineral + opsiyonel eşik) taş mineralleriyle eşleşmesi. */
export function evaluateCondition(
  minerals: StoneMineral[],
  cond: MineralCondition,
): ConditionMatch {
  const term = cond.mineral.trim();
  if (!term) {
    return { satisfied: false, matchedNames: [], appliedThreshold: false };
  }

  const matched = minerals.filter((m) => containsTr(m.name, term));
  if (matched.length === 0) {
    return { satisfied: false, matchedNames: [], appliedThreshold: false };
  }

  const matchedNames = matched.map((m) => m.name);

  // Eşik yok → varlık eşleşmesi yeterli.
  if (cond.minPercent == null) {
    return { satisfied: true, matchedNames, appliedThreshold: false };
  }

  // Eşik var. Yalnızca sayısal oranı OLAN eşleşmelerde eşik uygulanır.
  const withPercent = matched.filter((m) => m.percent != null);
  if (withPercent.length === 0) {
    // Oran verisi yok → dışlama; varlık üzerinden eşleş.
    return { satisfied: true, matchedNames, appliedThreshold: false };
  }

  const pass = withPercent.some((m) => (m.percent as number) >= cond.minPercent!);
  return { satisfied: pass, matchedNames, appliedThreshold: true };
}

/** Taş, TÜM aktif koşulları (AND) sağlıyor mu? */
export function evaluateStone(
  assignments: unknown,
  conditions: MineralCondition[],
): StoneEvaluation {
  const active = conditions.filter((c) => c.mineral.trim());
  if (active.length === 0) return { matches: false, perCondition: [] };

  const minerals = extractStoneMinerals(assignments);
  const perCondition = active.map((c) => evaluateCondition(minerals, c));
  return { matches: perCondition.every((r) => r.satisfied), perCondition };
}

/**
 * Stok eşleştirici — isim bazlı (taş ↔ dogaltas_inventory FK yoktur).
 * Türkçe-normalize tam eşitlik veya güvenli substring eşleşmesi.
 */
export function makeStockMatcher(
  inStockNames: string[],
): (stoneName: string) => boolean {
  const norm = inStockNames.map((n) => normalizeTr(n)).filter(Boolean);
  const set = new Set(norm);
  return (stoneName: string): boolean => {
    const s = normalizeTr(stoneName);
    if (!s) return false;
    if (set.has(s)) return true;
    return norm.some(
      (inv) =>
        (s.length >= 3 && inv.includes(s)) ||
        (inv.length >= 3 && s.includes(inv)),
    );
  };
}
