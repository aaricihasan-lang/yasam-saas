/**
 * NKB-V2 — Kişi/analiz Word raporu (/api/numeroloji/word-report) bölüm seçimi (saf; client+server).
 *
 * word-report generator'ının GERÇEKTEN ürettiği bölümler:
 *   - identity   : "Kimlik Bilgileri"
 *   - values     : "Temel Numeroloji Değerleri"
 *   - pin        : "PIN Kodu"
 *   - summary    : "Analiz Özeti"
 *   - sourceNotes: "Kaynak Notları" (kişinin hesaplanan değerlerine eşleşen, include_in_analysis=true uzman notları)
 *
 * Kurallar:
 *   - En az bir bölüm seçilmeli.
 *   - `sections` gönderilmezse (eski istemci) TÜM bölümler açık (geri-uyumlu).
 *   - sourceNotes kişinin numaralarına bağlı bağımsız içeriktir; tek başına seçilebilir.
 */

import {
  EXPERT_OWN_NOTE_LABEL,
  sortSourceEntries,
  type SourceEntryRow,
} from "./sourceEntryUiLogic";

export type WordPersonSectionKey = "identity" | "values" | "pin" | "summary" | "sourceNotes";

export type WordPersonSections = Record<WordPersonSectionKey, boolean>;

export const WORD_PERSON_SECTION_ORDER: WordPersonSectionKey[] = [
  "identity",
  "values",
  "pin",
  "summary",
  "sourceNotes",
];

export const WORD_PERSON_SECTION_LABELS: Record<WordPersonSectionKey, string> = {
  identity: "Kimlik Bilgileri",
  values: "Temel Numeroloji Değerleri",
  pin: "PIN Kodu",
  summary: "Analiz Özeti",
  sourceNotes: "Kaynak Notları (Analizde kullanılan)",
};

export function defaultWordPersonSections(): WordPersonSections {
  return { identity: true, values: true, pin: true, summary: true, sourceNotes: true };
}

/** En az bir bölüm seçili mi? */
export function atLeastOneWordPersonSection(s: WordPersonSections): boolean {
  return WORD_PERSON_SECTION_ORDER.some((k) => s[k]);
}

/**
 * Server normalizasyonu: `sections` verilmezse tüm bölümler açık (eski istemci uyumu).
 * Verilmişse bilinen anahtarlar boolean'a indirgenir; hiçbiri seçili değilse fail-safe tam çıktı.
 */
export function normalizeWordPersonSections(input: unknown): WordPersonSections {
  if (input === undefined || input === null || typeof input !== "object") {
    return defaultWordPersonSections();
  }
  const o = input as Record<string, unknown>;
  const out: WordPersonSections = {
    identity: false,
    values: false,
    pin: false,
    summary: false,
    sourceNotes: false,
  };
  for (const k of WORD_PERSON_SECTION_ORDER) out[k] = o[k] === true;
  if (!atLeastOneWordPersonSection(out)) return defaultWordPersonSections();
  return out;
}

export type MatchedNoteRef = { id: string; analysisType: string; value: string };

export type PersonSourceNoteGroup = {
  ref: MatchedNoteRef;
  notes: { label: string; body: string }[];
};

/**
 * Kişinin eşleşen kanonik kayıtlarına (matched) bağlı include_in_analysis kaynak notlarını
 * gruplar. Deterministik sıra (display_order, created_at, id). Etiket: source_id NULL →
 * "Uzmanın Kendi Notu"; aksi halde display_label. Notu olmayan eşleşme atlanır.
 * Not: entries YALNIZ include_in_analysis=true satırları içermelidir (server-side filtrelenir).
 */
export function personSourceNotesForRecords(
  matched: MatchedNoteRef[],
  entries: SourceEntryRow[],
  sourceLabelById: Map<string, string>,
): PersonSourceNoteGroup[] {
  const byRecord = new Map<string, SourceEntryRow[]>();
  for (const e of sortSourceEntries(entries)) {
    if (!e.include_in_analysis) continue; // güvenlik: yalnız true
    const arr = byRecord.get(e.knowledge_record_id) ?? [];
    arr.push(e);
    byRecord.set(e.knowledge_record_id, arr);
  }
  const out: PersonSourceNoteGroup[] = [];
  const seen = new Set<string>();
  for (const ref of matched) {
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    const es = byRecord.get(ref.id);
    if (!es || es.length === 0) continue;
    out.push({
      ref,
      notes: es.map((e) => ({
        label: e.source_id === null ? EXPERT_OWN_NOTE_LABEL : sourceLabelById.get(e.source_id) ?? "Bilinmeyen Kaynak",
        body: e.body,
      })),
    });
  }
  return out;
}
