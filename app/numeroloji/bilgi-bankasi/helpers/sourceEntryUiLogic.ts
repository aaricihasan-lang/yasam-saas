/**
 * NKB-V2 — Kaynak Notları UI saf mantığı (React/DB yok; harness bunu test eder).
 *
 * Kaynak notu = numerology_knowledge_source_entries satırı. source_id NULL ise
 * "Uzmanın Kendi Notu". Aynı knowledge_record + source için birden fazla not serbesttir;
 * kullanıcı ikinci notu kaydetmek isterse otomatik engelleme YOK → 3 seçenekli karar.
 */

export const EXPERT_OWN_NOTE_LABEL = "Uzmanın Kendi Notu";
export const EXPERT_OWN_NOTE_VALUE = "__expert_own__"; // dropdown'da NULL source_id temsili

export const MSG_SE_NEEDS_SAVED_RECORD =
  "Kaynak notu eklemek için önce kanonik kaydı seçin veya kaydedin.";
export const MSG_SE_NEEDS_RECORD = "Kanonik kayıt seçin.";
export const MSG_SE_EMPTY_BODY = "Not metni boş olamaz.";
export const MSG_SE_DEMO = "Demo hesabında yazma işlemi yapılamaz.";

export type SourceEntryRow = {
  id: string;
  tenant_id: string;
  knowledge_record_id: string;
  source_id: string | null;
  body: string;
  display_order: number;
  include_in_analysis: boolean;
  created_at: string;
  updated_at: string;
};

/** "Uzmanın Kendi Notu" veya kaynağın display_label'ı. */
export function sourceEntryLabel(
  entry: Pick<SourceEntryRow, "source_id">,
  sourceLabelById: Map<string, string>,
): string {
  if (entry.source_id === null) return EXPERT_OWN_NOTE_LABEL;
  return sourceLabelById.get(entry.source_id) ?? "Bilinmeyen Kaynak";
}

/** Deterministik sıralama: display_order, created_at, id. */
export function sortSourceEntries<T extends Pick<SourceEntryRow, "display_order" | "created_at" | "id">>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      a.display_order - b.display_order ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
}

/** Belirli bir kaynak (source_id | null) altında bu kayda ait mevcut notlar. */
export function existingNotesForSource(
  rows: SourceEntryRow[],
  knowledgeRecordId: string,
  sourceId: string | null,
): SourceEntryRow[] {
  return sortSourceEntries(
    rows.filter((r) => r.knowledge_record_id === knowledgeRecordId && r.source_id === sourceId),
  );
}

export type SecondNoteDecision =
  | { kind: "create" } // aynı kaynakta hiç not yok → doğrudan oluştur
  | { kind: "prompt-single"; existing: SourceEntryRow } // 1 mevcut → 3 seçenek (update hedefi belli)
  | { kind: "prompt-multi"; existing: SourceEntryRow[] }; // >1 mevcut → kullanıcı hangi notu güncelleyeceğini seçer

/**
 * Kaydet'e basıldığında karar:
 *  - editingId varsa (kullanıcı zaten bir notu düzenliyor) → doğrudan güncelleme, prompt yok.
 *  - aynı kaynakta mevcut not yoksa → create.
 *  - 1 mevcut not → prompt-single (Yeni Not Ekle / Mevcut Notu Güncelle / Vazgeç).
 *  - >1 mevcut → prompt-multi (güncelleme hedefini kullanıcı açıkça seçer; rastgele seçim YOK).
 */
export function decideSecondNoteAction(
  rows: SourceEntryRow[],
  knowledgeRecordId: string,
  sourceId: string | null,
  editingId: string | null,
): SecondNoteDecision | { kind: "update"; id: string } {
  if (editingId) return { kind: "update", id: editingId };
  const existing = existingNotesForSource(rows, knowledgeRecordId, sourceId);
  if (existing.length === 0) return { kind: "create" };
  if (existing.length === 1) return { kind: "prompt-single", existing: existing[0]! };
  return { kind: "prompt-multi", existing };
}

/** Dropdown source_id (string | EXPERT_OWN_NOTE_VALUE) → API source_id (string | null). */
export function sourceSelectionToApi(selection: string): string | null {
  return selection === EXPERT_OWN_NOTE_VALUE || selection === "" ? null : selection;
}

/** API source_id (string | null) → dropdown değeri. */
export function apiSourceToSelection(sourceId: string | null): string {
  return sourceId === null ? EXPERT_OWN_NOTE_VALUE : sourceId;
}

export type WriteOutcome = "demo" | "error" | "success";

/** Server yazma sonucunu sınıflar (demo > error > success). */
export function classifyEntryWrite(res: { error: string | null; demo: boolean }): WriteOutcome {
  if (res.demo) return "demo";
  if (res.error) return "error";
  return "success";
}
