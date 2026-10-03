import type { NumerolojiResult } from "@/lib/numeroloji";
import { reduceKeepMaster, sumDigits } from "@/lib/numeroloji/ortak";
import { numApi, numApiError } from "../../helpers/numApiClient";
import type { NumerolojiMotorOut } from "../../utils/numerolojiPlainMetin";
import type { KnowledgeRecordRow } from "./bilgiBankaKayit";
import type { KnowledgeSection } from "./knowledgeSections";
import { listAnalysisSourceEntries } from "./sourceEntriesApi";
import { listSources } from "./sourcesApi";
import { EXPERT_OWN_NOTE_LABEL, sortSourceEntries, type SourceEntryRow } from "./sourceEntryUiLogic";

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
// NKB-V2: analiz için kaynak notu (Hesap Özetli'de kanonik metnin ALTINDA gösterilir).
export type AnalysisSourceEntry = {
  id: string;
  body: string;
  sourceLabel: string; // kaynak display_label veya "Uzmanın Kendi Notu"
  display_order: number;
};

export type KnowledgeNote = {
  id: string;
  analysisType: string;
  value: string;
  description: string | null;
  content_sections: KnowledgeSection[] | null;
  // Yalnız include_in_analysis=true notlar; yoksa alan atanmaz (eski davranış birebir korunur).
  sourceEntries?: AnalysisSourceEntry[];
  /**
   * NUM-F10: Hayat Yolu notu birebir kod yerine kodun SON SAYISI (nihai hedef çakrası,
   * kitap 1 PDF s.58) üzerinden eşleştiyse başlığa eklenecek açıklama.
   */
  headingSuffix?: string;
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
  // OWNER: combinedReading yalnız display assist'tir — canonical DEĞİL. Knowledge lookup
  // bu ALTERNATİF birleşik okumayı ASLA aday olarak kullanmamalı. display'in sonundaki
  // " (combinedReading)" ekini soyup öyle aday üret (canonical component'ler + key kalır).
  const cr = (r.combinedReading || "").trim();
  const suffix = cr ? ` (${cr})` : "";
  const displayForLookup =
    suffix && r.display.endsWith(suffix) ? r.display.slice(0, -suffix.length).trim() : r.display;
  const fromDisplay = valueCandidatesFromDisplay(displayForLookup);
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

/**
 * NUM-F10 — Hayat Yolu / DM bilgi bankası aday sırası (ilk eşleşen KULLANILIR):
 *   1) Birebir DM kodu ("25/7", "37/10") — kitap 1 PDF s.83–153 her bileşik kodu ayrı yorumlar.
 *   2) 2026-07…2026-10 arasında motorun ürettiği eski gösterim ("37/1", "39/3", "22", "33");
 *      o dönemde bu anahtarla yazılmış uzman notları kaybolmasın diye (aynı doğum tarihi).
 *   3) Kodun son sayısının tek-hane kökü ("7") — kitap 1 PDF s.58: "son sayı … nihai hedef
 *      çakrasını gösterir". Bu eşleşme ekranda "genel not" olarak AÇIKÇA etiketlenir.
 */
export function hayatYoluLookupCandidates(r: NumerolojiResult): { values: string[]; generalValues: Set<string> } {
  const exact = exactValueFromResult(r);
  if (!exact.length) return { values: [], generalValues: new Set() };
  const code = exact[0];
  const values = [code];
  const total = Number(code.split("/")[0]);
  if (Number.isFinite(total) && total > 0) {
    const legacyReduced = reduceKeepMaster(total);
    const legacy = legacyReduced === total ? String(total) : `${total}/${legacyReduced}`;
    if (!values.includes(legacy)) values.push(legacy);
  }
  const generalValues = new Set<string>();
  const last = Number(code.split("/").pop());
  if (Number.isFinite(last) && last > 0) {
    let root = last;
    while (root > 9) root = sumDigits(root);
    const rootStr = String(root);
    if (!values.includes(rootStr)) {
      values.push(rootStr);
      generalValues.add(rootStr);
    }
  }
  return { values, generalValues };
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

export type LookupPlanOptions = {
  /** true → aday sırasında İLK eşleşen kayıt kullanılır (Hayat Yolu). */
  firstMatchOnly?: boolean;
  /** Bu değerlerden eşleşen not "genel not" olarak etiketlenir. */
  generalValues?: Set<string>;
};

export function pickNotesForType(
  rows: KnowledgeRecordRow[],
  analysisType: string,
  valuesInOrder: string[],
  globalSeenIds: Set<string>,
  opts: LookupPlanOptions = {},
): KnowledgeNote[] {
  const notes: KnowledgeNote[] = [];

  for (const value of valuesInOrder) {
    const row = rows.find((r) => r.analysis_type === analysisType && r.value === value);
    if (!row || globalSeenIds.has(row.id)) continue;
    globalSeenIds.add(row.id);
    const note = rowToNote(row);
    if (opts.generalValues?.has(value)) note.headingSuffix = " · kodun son sayısı için genel not";
    notes.push(note);
    if (opts.firstMatchOnly) break;
  }

  return notes;
}

export function buildKnowledgeLookupPlan(out: NumerolojiMotorOut): ({
  analysisType: string;
  values: string[];
} & LookupPlanOptions)[] {
  const hy = hayatYoluLookupCandidates(out.hayatYolu);
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
      // NUM-F10: Hayat Yolu — birebir kod → eski gösterim → son sayı (genel not); ilk eşleşen.
      analysisType: NUMERO_ANALYSIS_TYPES.hayatYolu,
      values: hy.values,
      firstMatchOnly: true,
      generalValues: hy.generalValues,
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

/**
 * NKB-V2 (saf/testable): include_in_analysis=true kaynak notlarını knowledge_record_id üzerinden
 * ilgili notlara iliştirir. Deterministik sıra (display_order, created_at, id). Kaynak etiketi:
 * source_id NULL → "Uzmanın Kendi Notu"; aksi halde display_label. Not olmayan kayıt DEĞİŞMEZ
 * (sourceEntries alanı atanmaz → eski davranış birebir korunur).
 */
export function attachSourceEntriesToNotes(
  buckets: KnowledgeNotesForAnalysis,
  entries: SourceEntryRow[],
  sourceLabelById: Map<string, string>,
): KnowledgeNotesForAnalysis {
  const byRecord = new Map<string, AnalysisSourceEntry[]>();
  for (const e of sortSourceEntries(entries)) {
    if (!e.include_in_analysis) continue; // güvenlik: yalnız true
    const label =
      e.source_id === null ? EXPERT_OWN_NOTE_LABEL : sourceLabelById.get(e.source_id) ?? "Bilinmeyen Kaynak";
    const arr = byRecord.get(e.knowledge_record_id) ?? [];
    arr.push({ id: e.id, body: e.body, sourceLabel: label, display_order: e.display_order });
    byRecord.set(e.knowledge_record_id, arr);
  }
  const attach = (notes: KnowledgeNote[]): KnowledgeNote[] =>
    notes.map((n) => {
      const es = byRecord.get(n.id);
      return es && es.length ? { ...n, sourceEntries: es } : n;
    });
  return {
    anaKulvar: attach(buckets.anaKulvar),
    yanKulvar: attach(buckets.yanKulvar),
    ifadeSayisi: attach(buckets.ifadeSayisi),
    hayatYolu: attach(buckets.hayatYolu),
    cakraOmurga: attach(buckets.cakraOmurga),
    element: attach(buckets.element),
  };
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

    const buckets: KnowledgeNotesForAnalysis = {
      anaKulvar: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.anaKulvar, plan[0].values, seenIds),
      yanKulvar: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.yanKulvar, plan[1].values, seenIds),
      ifadeSayisi: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.ifadeSayisi, plan[2].values, seenIds),
      hayatYolu: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.hayatYolu, plan[3].values, seenIds, plan[3]),
      cakraOmurga: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.cakraOmurga, plan[4].values, seenIds),
      element: pickNotesForType(rows, NUMERO_ANALYSIS_TYPES.element, plan[5].values, seenIds),
    };

    // Kaynak notlarını TEK bounded sorgu (+ kaynak etiketleri) ile topla; N+1 yok.
    // Hata halinde kanonik notlar aynen döner (graceful).
    try {
      const [seRes, srcRes] = await Promise.all([listAnalysisSourceEntries(), listSources()]);
      if (!seRes.error && seRes.rows.length) {
        const labelById = new Map<string, string>();
        for (const s of srcRes.rows) labelById.set(s.id, s.display_label);
        return attachSourceEntriesToNotes(buckets, seRes.rows, labelById);
      }
    } catch (seErr) {
      console.error("Kaynak notları iliştirilemedi:", seErr);
    }
    return buckets;
  } catch (err) {
    console.error("Bilgi Bankası notları beklenmeyen hata:", err);
    return { ...EMPTY_NOTES };
  }
}
