import { ELEMENT_ORDER, type ElementName } from "@/lib/numeroloji";
import { numApi, numApiError } from "../../helpers/numApiClient";
import type { NumerolojiMotorOut } from "../../utils/numerolojiPlainMetin";
import { analizTuruLabel } from "./bilgiBankaLabels";
import { buildChakraLookupValues, valueCandidatesFromResult } from "./knowledgeLookup";
import type { StoneAssignmentRow } from "./bilgiBankaKayit";

const STONE_API = "/api/numeroloji/stones";

// Taş ataması TÜM analiz türlerini destekler (Doğaltaş Ata formundaki dropdown ile bire bir).
const STONE_ANALYSIS_TYPES = {
  anaKulvar: "ana-kulvar",
  yanKulvar: "yan-kulvar",
  ifadeSayisi: "ifade-sayisi",
  hayatYolu: "hayat-yolu",
  cakraOmurga: "cakra-omurga",
  element: "element",
} as const;

export type StoneAssignmentForAnalysis = {
  type: string;
  typeKey: string;
  value: string;
  reason: string | null;
  stones: string[];
};

function parseStones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s)).filter(Boolean);
}

/** Element X sayısı: 0–1 AZ, 2–3 ideal, 4+ FAZLA */
export function elementDestekLookupValue(elementName: ElementName, count: number): string | null {
  if (count === 2 || count === 3) return null;
  if (count <= 1) return `${elementName} | AZ Destek`;
  return `${elementName} | FAZLA Destek`;
}

export function buildElementStoneLookupValues(out: NumerolojiMotorOut): string[] {
  const counts = out.elementler?.counts;
  if (!counts) return [];

  const values: string[] = [];
  const seen = new Set<string>();

  for (const name of ELEMENT_ORDER) {
    const lookup = elementDestekLookupValue(name, counts[name] ?? 0);
    if (!lookup || seen.has(lookup)) continue;
    seen.add(lookup);
    values.push(lookup);
  }

  return values;
}

export function buildStoneLookupPlan(out: NumerolojiMotorOut): { analysisType: string; values: string[] }[] {
  return [
    { analysisType: STONE_ANALYSIS_TYPES.anaKulvar, values: valueCandidatesFromResult(out.anaKulvar) },
    { analysisType: STONE_ANALYSIS_TYPES.yanKulvar, values: valueCandidatesFromResult(out.yanKulvar) },
    { analysisType: STONE_ANALYSIS_TYPES.ifadeSayisi, values: valueCandidatesFromResult(out.ifadeSayisi) },
    { analysisType: STONE_ANALYSIS_TYPES.hayatYolu, values: valueCandidatesFromResult(out.hayatYolu) },
    { analysisType: STONE_ANALYSIS_TYPES.cakraOmurga, values: buildChakraLookupValues(out) },
    { analysisType: STONE_ANALYSIS_TYPES.element, values: buildElementStoneLookupValues(out) },
  ];
}

/** Eski Bilgi Bankası element değerleri (Ateş | AZ) ile uyumluluk */
function stoneValueLookupCandidates(analysisType: string, value: string): string[] {
  const candidates = [value];
  if (analysisType === STONE_ANALYSIS_TYPES.element) {
    if (value.endsWith(" | AZ Destek")) candidates.push(value.replace(" | AZ Destek", " | AZ"));
    if (value.endsWith(" | FAZLA Destek")) candidates.push(value.replace(" | FAZLA Destek", " | FAZLA"));
  }
  return candidates;
}

function findStoneRow(
  rows: StoneAssignmentRow[],
  analysisType: string,
  value: string,
): StoneAssignmentRow | undefined {
  for (const candidate of stoneValueLookupCandidates(analysisType, value)) {
    const row = rows.find((r) => r.analysis_type === analysisType && r.value === candidate);
    if (row) return row;
  }
  return undefined;
}

function pickStoneAssignments(
  rows: StoneAssignmentRow[],
  analysisType: string,
  valuesInOrder: string[],
  globalSeenIds: Set<string>,
): StoneAssignmentForAnalysis[] {
  const items: StoneAssignmentForAnalysis[] = [];

  for (const value of valuesInOrder) {
    const row = findStoneRow(rows, analysisType, value);
    if (!row || globalSeenIds.has(row.id)) continue;

    const stones = parseStones(row.stones);
    if (!stones.length && !(row.reason ?? "").trim()) continue;

    globalSeenIds.add(row.id);
    items.push({
      type: analizTuruLabel(analysisType),
      typeKey: analysisType,
      value: row.value,
      reason: row.reason?.trim() ? row.reason.trim() : null,
      stones,
    });
  }

  return items;
}

export async function getStoneAssignmentsForAnalysis(
  out: NumerolojiMotorOut,
  _tenantId?: string,
): Promise<StoneAssignmentForAnalysis[]> {
  void _tenantId;
  const plan = buildStoneLookupPlan(out);
  const hasAnyValue = plan.some((p) => p.values.length > 0);
  if (!hasAnyValue) return [];

  try {
    const res = await numApi(STONE_API);
    const err = numApiError(res);
    if (err) {
      console.error("Doğaltaş atamaları okunamadı:", err);
      return [];
    }

    const rows = (Array.isArray(res.json.rows) ? res.json.rows : []) as StoneAssignmentRow[];
    const seenIds = new Set<string>();

    const result: StoneAssignmentForAnalysis[] = [];
    for (const p of plan) {
      result.push(...pickStoneAssignments(rows, p.analysisType, p.values, seenIds));
    }
    return result;
  } catch (err) {
    console.error("Doğaltaş atamaları beklenmeyen hata:", err);
    return [];
  }
}
