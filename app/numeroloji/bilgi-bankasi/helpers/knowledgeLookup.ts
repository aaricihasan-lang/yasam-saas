import type { NumerolojiResult } from "@/lib/numeroloji";
import { numApi, numApiError } from "../../helpers/numApiClient";
import type { NumerolojiMotorOut } from "../../utils/numerolojiPlainMetin";
import type { KnowledgeRecordRow } from "./bilgiBankaKayit";
import type { KnowledgeSection } from "./knowledgeSections";

const KNOWLEDGE_API = "/api/numeroloji/knowledge";

const NUMERO_ANALYSIS_TYPES = {
  anaKulvar: "ana-kulvar",
  yanKulvar: "yan-kulvar",
  ifadeSayisi: "ifade-sayisi",
  hayatYolu: "hayat-yolu",
  cakraOmurga: "cakra-omurga",
  element: "element",
} as const;

// NKB-V2-H: Danışan analiz yorumu için GÜVENLİ alanlar. source/display_label/bibliyografik
// alanlar/internal_note DANIŞAN notuna GİRMEZ. content_sections canonical yorum kaynağıdır.
export type KnowledgeNote = {
  id: string;
  analysisType: string;
  value: string;
  description: string | null;
  content_sections: KnowledgeSection[] | null;
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

/**
 * Display string'inden knowledge lookup için aday değerler üretir.
 *
 * Desteklenen formatlar:
 *   "7"                  → ["7"]
 *   "19/2"               → ["19/2", "19", "2"]          (eski slash formatı)
 *   "22-19-4"            → ["22-19-4", "22", "19", "4"] (yeni path formatı)
 *   "22-3 (11-11-3)"     → ["22-3", "22", "3", "11"]    (yeni path + parantez)
 *   "33/6 (22/11/6)"     → ["33/6", "33", "6", "22", "11"] (eski format + parantez)
 */
export function valueCandidatesFromDisplay(display: string): string[] {
  const text = (display || "").trim();
  if (!text) return [];

  // Parantez bloğunu ayır
  const parenMatch = text.match(/\(([^)]+)\)/);
  const core = text.replace(/\s*\([^)]+\)/, "").trim();

  const ordered: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    ordered.push(v);
  };

  // Core'u tam string olarak ekle (eski "/" formatı için compat)
  add(core);

  if (core.includes("-")) {
    for (const part of core.split("-")) add(part);
  } else if (core.includes("/")) {
    for (const part of core.split("/")) add(part);
  }
  // else: tek sayı, zaten eklendi

  // Parantez içindeki sayıları ekle
  if (parenMatch) {
    const inner = parenMatch[1].trim();
    const sep = inner.includes("-") ? "-" : "/";
    for (const part of inner.split(sep)) add(part);
  }

  return ordered;
}

export function valueCandidatesFromResult(r: NumerolojiResult): string[] {
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

/**
 * NKB-V2-K1: Hayat Yolu için EXACT-only lookup adayı — yalnız hesaplanan tam değer.
 * Bileşik sonuç (ör. "32/5") ASLA parçalanmaz ("32"/"5" adayı üretilmez) ve exact
 * kayıt yoksa indirgenmiş sayıya fallback yapılmaz. Tek aday döner.
 * key öncelikli (calcHayatYolu: key=display=tam değer); boş veya "-" ise [].
 */
export function exactValueFromResult(r: NumerolojiResult): string[] {
  const v = ((r.key || r.display) || "").trim();
  return v && v !== "-" ? [v] : [];
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
  // Yalnız güvenli alanlar taşınır: source ASLA taşınmaz (danışan gizlilik sınırı).
  return {
    id: row.id,
    analysisType: row.analysis_type,
    value: row.value,
    description: row.description,
    content_sections: Array.isArray(row.content_sections) ? row.content_sections : null,
  };
}

export function pickNotesForType(
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
      // NKB-V2-K1: Hayat Yolu EXACT-only — bileşik değer parçalanmaz, indirgenmiş sayı fallback'i yok.
      analysisType: NUMERO_ANALYSIS_TYPES.hayatYolu,
      values: exactValueFromResult(out.hayatYolu),
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
  _tenantId?: string,
): Promise<KnowledgeNotesForAnalysis> {
  void _tenantId;
  const plan = buildKnowledgeLookupPlan(out);
  const hasAnyValue = plan.some((p) => p.values.length > 0);
  if (!hasAnyValue) return { ...EMPTY_NOTES };

  try {
    const res = await numApi(KNOWLEDGE_API);
    const err = numApiError(res);
    if (err) {
      console.error("Bilgi Bankası notları okunamadı:", err);
      return { ...EMPTY_NOTES };
    }

    const rows = (Array.isArray(res.json.rows) ? res.json.rows : []) as KnowledgeRecordRow[];
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
