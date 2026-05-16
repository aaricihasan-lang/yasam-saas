import { supabase } from "@/lib/supabase";
import type { NumerolojiResult } from "@/lib/numeroloji";
import { getTenantIdFromStorage } from "../../helpers/numerolojiKayit";
import type { NumerolojiMotorOut } from "../../utils/numerolojiPlainMetin";
import type { KnowledgeRecordRow } from "./bilgiBankaKayit";

const KNOWLEDGE_TABLE = "numerology_knowledge_records";

const NUMERO_ANALYSIS_TYPES = {
  anaKulvar: "ana-kulvar",
  yanKulvar: "yan-kulvar",
  ifadeSayisi: "ifade-sayisi",
  hayatYolu: "hayat-yolu",
  cakraOmurga: "cakra-omurga",
  element: "element",
} as const;

const LOOKUP_ANALYSIS_TYPES = Object.values(NUMERO_ANALYSIS_TYPES);

export type KnowledgeNote = {
  id: string;
  analysisType: string;
  value: string;
  source: string | null;
  description: string | null;
};

export type KnowledgeNotesForAnalysis = {
  anaKulvar: KnowledgeNote[];
  yanKulvar: KnowledgeNote[];
  ifadeSayisi: KnowledgeNote[];
  hayatYolu: KnowledgeNote[];
  cakraOmurga: KnowledgeNote[];
  element: KnowledgeNote[];
};

const EMPTY_NOTES: KnowledgeNotesForAnalysis = {
  anaKulvar: [],
  yanKulvar: [],
  ifadeSayisi: [],
  hayatYolu: [],
  cakraOmurga: [],
  element: [],
};

/** "19/2" → ["19/2", "19", "2"] sırasıyla, tekrarsız */
export function valueCandidatesFromDisplay(display: string): string[] {
  const text = (display || "").trim();
  if (!text) return [];

  const ordered: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    ordered.push(v);
  };

  add(text);

  if (text.includes("/")) {
    for (const part of text.split("/")) {
      add(part);
    }
  }

  return ordered;
}

function valueCandidatesFromResult(r: NumerolojiResult): string[] {
  const fromDisplay = valueCandidatesFromDisplay(r.display);
  const seen = new Set(fromDisplay);
  const ordered = [...fromDisplay];

  const key = (r.key || "").trim();
  if (key && !seen.has(key)) {
    seen.add(key);
    ordered.push(key);
  }

  return ordered;
}

/** Sağ sütun (destek) X sayısı: 0–1 AZ, 2–3 ideal (not yok), 4+ FAZLA */
export function chakraLookupValue(chakraNo: number, sagDestekXCount: number): string | null {
  if (sagDestekXCount === 2 || sagDestekXCount === 3) return null;
  if (sagDestekXCount <= 1) return `${chakraNo}. Çakra | AZ Destek`;
  return `${chakraNo}. Çakra | FAZLA Destek`;
}

/** Sadece sağ sütun (harfler); sol (sayilar) fazlalık — yorumda kullanılmaz */
export function cakraSagDestekCount(out: NumerolojiMotorOut, chakraNo: number): number {
  return out.cakraOmurgasi?.harfler?.[chakraNo] ?? 0;
}

export function buildChakraLookupValues(out: NumerolojiMotorOut): string[] {
  const values: string[] = [];
  const seen = new Set<string>();

  for (let cNo = 1; cNo <= 10; cNo += 1) {
    const sagX = cakraSagDestekCount(out, cNo);
    const lookup = chakraLookupValue(cNo, sagX);
    if (!lookup || seen.has(lookup)) continue;
    seen.add(lookup);
    values.push(lookup);
  }

  return values;
}

/** Element motorunda AZ/FAZLA yok; güvenli boş dizi */
export function buildElementLookupValues(_out: NumerolojiMotorOut): string[] {
  void _out;
  return [];
}

function rowToNote(row: KnowledgeRecordRow): KnowledgeNote {
  return {
    id: row.id,
    analysisType: row.analysis_type,
    value: row.value,
    source: row.source,
    description: row.description,
  };
}

function pickNotesForType(
  rows: KnowledgeRecordRow[],
  analysisType: string,
  valuesInOrder: string[],
  globalSeenIds: Set<string>,
): KnowledgeNote[] {
  const notes: KnowledgeNote[] = [];

  for (const value of valuesInOrder) {
    const row = rows.find((r) => r.analysis_type === analysisType && r.value === value);
    if (!row || globalSeenIds.has(row.id)) continue;
    globalSeenIds.add(row.id);
    notes.push(rowToNote(row));
  }

  return notes;
}

export function buildKnowledgeLookupPlan(out: NumerolojiMotorOut): {
  analysisType: string;
  values: string[];
}[] {
  return [
    {
      analysisType: NUMERO_ANALYSIS_TYPES.anaKulvar,
      values: valueCandidatesFromResult(out.anaKulvar),
    },
    {
      analysisType: NUMERO_ANALYSIS_TYPES.yanKulvar,
      values: valueCandidatesFromResult(out.yanKulvar),
    },
    {
      analysisType: NUMERO_ANALYSIS_TYPES.ifadeSayisi,
      values: valueCandidatesFromResult(out.ifadeSayisi),
    },
    {
      analysisType: NUMERO_ANALYSIS_TYPES.hayatYolu,
      values: valueCandidatesFromResult(out.hayatYolu),
    },
    {
      analysisType: NUMERO_ANALYSIS_TYPES.cakraOmurga,
      values: buildChakraLookupValues(out),
    },
    {
      analysisType: NUMERO_ANALYSIS_TYPES.element,
      values: buildElementLookupValues(out),
    },
  ];
}

export async function getKnowledgeNotesForAnalysis(
  out: NumerolojiMotorOut,
  tenantId?: string,
): Promise<KnowledgeNotesForAnalysis> {
  const tid = tenantId ?? getTenantIdFromStorage();
  const plan = buildKnowledgeLookupPlan(out);
  const hasAnyValue = plan.some((p) => p.values.length > 0);
  if (!hasAnyValue) return { ...EMPTY_NOTES };

  try {
    const { data, error } = await supabase
      .from(KNOWLEDGE_TABLE)
      .select("*")
      .eq("tenant_id", tid)
      .in("analysis_type", LOOKUP_ANALYSIS_TYPES);

    if (error) {
      console.error("Bilgi Bankası notları okunamadı:", error.message);
      return { ...EMPTY_NOTES };
    }

    const rows = (data ?? []) as KnowledgeRecordRow[];
    const seenIds = new Set<string>();

    return {
      anaKulvar: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.anaKulvar, plan[0].values, seenIds),
      yanKulvar: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.yanKulvar, plan[1].values, seenIds),
      ifadeSayisi: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.ifadeSayisi, plan[2].values, seenIds),
      hayatYolu: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.hayatYolu, plan[3].values, seenIds),
      cakraOmurga: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.cakraOmurga, plan[4].values, seenIds),
      element: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.element, plan[5].values, seenIds),
    };
  } catch (err) {
    console.error("Bilgi Bankası notları beklenmeyen hata:", err);
    return { ...EMPTY_NOTES };
  }
}
