/**
 * Yaşam Hafızası™ — BF-14 satır-seviyesi eligibility kapısı (SAF; fail-closed).
 *
 * Kaynak satırının, tenant çözümlemesinden ÖNCE, declarative status/classification kapılarından
 * geçip geçmediğini belirler. Mevcut kaynaklar bu alanları TAŞIMADIĞI için no-op (eligible) → 17
 * canlı + 6 client + 2 numeroloji kaynağının davranışı BYTE-DEĞİŞMEZ.
 *
 * Kapılar (varsa) fail-closed:
 *   - statusColumn + eligibleStatuses: satır status değeri izinli listede DEĞİLSE → skip
 *     (YEBS: yalnız 'published'; draft/verified/approved/review/pending/rejected/archived → skip).
 *   - rowClassificationColumn: satır classification 'safe-non-pii' DEĞİLSE → skip
 *     (Belge/Video passage: unclassified/pii/restricted/eksik → skip).
 *
 * SAF: DB/IO/normalize YOK. Ham değer coercion YOK (yalnız string eşitlik).
 */
import type { SourceConfig } from "./sources";

export type RowEligibilityReason = "status-ineligible" | "row-classification-ineligible";

export type RowEligibilityResult =
  | { readonly eligible: true }
  | { readonly eligible: false; readonly reason: RowEligibilityReason };

const ELIGIBLE: RowEligibilityResult = { eligible: true };

/** Satırın declarative status + classification kapılarından geçip geçmediği (fail-closed). */
export function evaluateRowEligibility(
  config: SourceConfig,
  row: Readonly<Record<string, unknown>>,
): RowEligibilityResult {
  // 1) Status eligibility (yalnız statusColumn + eligibleStatuses birlikte tanımlıysa).
  const statusColumn = config.statusColumn;
  if (typeof statusColumn === "string" && statusColumn.length > 0) {
    const allowed = config.eligibleStatuses;
    // eligibleStatuses tanımsız/boşsa → hiçbir status geçemez (fail-closed).
    if (!allowed || allowed.length === 0) {
      return { eligible: false, reason: "status-ineligible" };
    }
    const value = row[statusColumn];
    if (typeof value !== "string" || !allowed.includes(value)) {
      return { eligible: false, reason: "status-ineligible" };
    }
  }

  // 2) Row-level classification (yalnız rowClassificationColumn tanımlıysa).
  const classColumn = config.rowClassificationColumn;
  if (typeof classColumn === "string" && classColumn.length > 0) {
    const value = row[classColumn];
    if (value !== "safe-non-pii") {
      return { eligible: false, reason: "row-classification-ineligible" };
    }
  }

  return ELIGIBLE;
}

/** Kaynağın row-eligibility kapısı taşıyıp taşımadığı (harness/gözlem için). */
export function hasRowEligibilityGate(config: SourceConfig): boolean {
  return (
    (typeof config.statusColumn === "string" && config.statusColumn.length > 0) ||
    (typeof config.rowClassificationColumn === "string" && config.rowClassificationColumn.length > 0)
  );
}
