/**
 * HD Danışmanlık Katmanı (F2.1) · Draft Gövde Düzenleme — Input Sözleşmesi
 * ========================================================================
 *
 * rpc_hd_consultation_edit_draft'ın NESTED payload sözleşmesi. F1.1 create ile
 * BİREBİR aynı nested section şeklini (client_ref + nested children) yeniden
 * kullanır; istemci DB section_id GÖNDERMEZ. Fark: create entity/canonical pin
 * bağlar; edit yalnız MEVCUT bir draft content'in gövdesini (sections + children)
 * yeniden kurar → entityId/canonicalContentId/isAiGenerated YOK, expectedVersion
 * ZORUNLU (optimistic concurrency). Canonical pin edit ile DEĞİŞMEZ.
 *
 * Additif; mevcut createInput.ts / F0B tipleri DEĞİŞMEZ.
 */

import type {
  HdConsultationSectionCreateInput,
  HdConsultationQuestionCreateInput,
  HdConsultationConditionCreateInput,
} from "./createInput";

// ── Üst-seviye edit input ─────────────────────────────────────────────────────

export type HdConsultationEditDraftInput = {
  /** Optimistic concurrency token; content.version ile eşleşmeli (yoksa stale). */
  expectedVersion: number;
  /** Draft gövdesinin YENİ tam hali (delete+reinsert). F1.1 create ile aynı şekil. */
  sections: HdConsultationSectionCreateInput[];
  /** section'sız (content düzeyi) çocuklar. */
  contentQuestions?: HdConsultationQuestionCreateInput[];
  contentConditions?: HdConsultationConditionCreateInput[];
};

// ── RPC dönüşü (create bundle ile aynı deterministik şekil) ──────────────────

export type HdConsultationEditDraftResult = {
  contentId: string;
  version: number;
  sectionMap: { clientRef: string; sectionId: string }[];
  sectionCount: number;
  questionCount: number;
  conditionCount: number;
  evidenceCount: number;
};

// ── Saf input doğrulayıcı (create ile aynı sözleşme; sessiz fallback YOK) ─────

/**
 * expectedVersion (pozitif int) + section client_ref (zorunlu/trim/benzersiz) +
 * bodyText non-blank doğrular. Canonical/rights/registry doğrulaması DB-authoritative
 * (RPC'de). Problem listesi döner (boş = geçerli).
 */
export function validateConsultationEditDraftInput(input: HdConsultationEditDraftInput): string[] {
  const problems: string[] = [];
  if (
    typeof input.expectedVersion !== "number" ||
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 1
  ) {
    problems.push("expectedVersion (pozitif tam sayı) zorunlu.");
  }
  if (!Array.isArray(input.sections)) {
    problems.push("sections dizi olmalı.");
    return problems;
  }
  if (input.sections.length === 0) {
    problems.push("En az bir bölüm gerekir.");
  }
  const seen = new Set<string>();
  input.sections.forEach((s, i) => {
    const ref = typeof s.clientRef === "string" ? s.clientRef.trim() : "";
    if (ref === "") problems.push(`sections[${i}].clientRef zorunlu (trim boş olamaz).`);
    else if (seen.has(ref)) problems.push(`çağrı içinde duplicate clientRef: ${ref}`);
    else seen.add(ref);
    if (typeof s.bodyText !== "string" || s.bodyText.trim() === "") {
      problems.push(`sections[${i}].bodyText boş olamaz.`);
    }
  });
  return problems;
}
