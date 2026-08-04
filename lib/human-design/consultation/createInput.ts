/**
 * HD Danışmanlık Katmanı (F1.1) · Atomik Create Bundle — Input Sözleşmesi
 * ======================================================================
 *
 * rpc_hd_consultation_create'in NESTED payload sözleşmesi. İstemci DB section_id
 * GÖNDERMEZ; her section'da çağrı-içi benzersiz `clientRef` bulunur ve RPC
 * dönüşünde clientRef → gerçek section_id eşlemesi verilir. Question/condition/
 * evidence create input'ları section_id İÇERMEZ (nested; RPC bağlar).
 *
 * Bu tipler yalnız CREATE INPUT içindir; persisted satır tipleri (types.ts —
 * section_id taşır) ile KARIŞTIRILMAZ. Additif; mevcut F0B tipleri değişmez.
 */

import type {
  HdConditionKind,
  HdEvidenceRelationType,
  HdSectionKind,
  HdUsageScope,
} from "./types";

// ── Child create input'ları (section_id YOK — nested; RPC bağlar) ───────────

export type HdConsultationQuestionCreateInput = {
  questionText: string;
  topicScope?: string | null;
  sortOrder?: number;
};

export type HdConsultationConditionCreateInput = {
  conditionKind: HdConditionKind;
  /** Canonical anahtar (ör. "kanal_34_57"); RPC registry ile doğrular. */
  conditionValue: string;
  sortOrder?: number;
};

export type HdConsultationEvidenceCreateInput = {
  passageId: string;
  relationType: HdEvidenceRelationType;
  isPrimary?: boolean;
  isSingleSource?: boolean;
  editorialNote?: string | null;
  sortOrder?: number;
};

// ── Section create input (çağrı-içi benzersiz clientRef + nested children) ──

export type HdConsultationSectionCreateInput = {
  /** Çağrı-içi benzersiz, trim boş olamaz; RPC section_id ile eşler. */
  clientRef: string;
  sectionKind: HdSectionKind;
  bodyText: string;
  usageScope: HdUsageScope;
  topicScope?: string | null;
  sortOrder?: number;
  /** Başlangıçta genelde "draft" veya "published" (section düzeyi). */
  status?: "draft" | "published" | "archived";
  questions?: HdConsultationQuestionCreateInput[];
  conditions?: HdConsultationConditionCreateInput[];
  evidence?: HdConsultationEvidenceCreateInput[];
};

// ── Üst-seviye create input ─────────────────────────────────────────────────

export type HdConsultationCreateInput = {
  entityId: string;
  canonicalContentId?: string | null;
  isAiGenerated?: boolean;
  sections: HdConsultationSectionCreateInput[];
  /** section'sız (content düzeyi) çocuklar. */
  contentQuestions?: HdConsultationQuestionCreateInput[];
  contentConditions?: HdConsultationConditionCreateInput[];
};

// ── RPC dönüşü (deterministik; tam body/source metni YOK) ───────────────────

export type HdConsultationSectionMapEntry = {
  clientRef: string;
  sectionId: string;
};

export type HdConsultationCreateResult = {
  contentId: string;
  version: number;
  sectionMap: HdConsultationSectionMapEntry[];
  sectionCount: number;
  questionCount: number;
  conditionCount: number;
  evidenceCount: number;
};

// ── Saf input doğrulayıcı (SQL kapılarıyla parite; sessiz fallback YOK) ──────

/**
 * clientRef değişmezlerini (zorunlu/trim/benzersiz) ve temel section alanlarını
 * doğrular. SQL RPC ile aynı sözleşme; problem listesi döner (boş = geçerli).
 * Not: canonical/rights/registry doğrulaması DB-authoritative (RPC'de).
 */
export function validateConsultationCreateInput(input: HdConsultationCreateInput): string[] {
  const problems: string[] = [];
  if (typeof input.entityId !== "string" || input.entityId.trim() === "") {
    problems.push("entityId zorunlu.");
  }
  if (!Array.isArray(input.sections)) {
    problems.push("sections dizi olmalı.");
    return problems;
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
