/**
 * HD Danışmanlık F2 · Admin UI Türkçe etiketler (whitelist ile birebir).
 * Değerler F0B contracts whitelist'leriyle aynı; UI serbest metin üretmez.
 */
import type {
  HdSectionKind,
  HdUsageScope,
  HdConditionKind,
  HdConsultationStatus,
} from "@/lib/human-design/consultation/types";
import type { HdEvidenceRelationType } from "@/lib/human-design/knowledge-system/contracts";
import type { HdCanonicalEntityKind } from "@/lib/human-design/knowledge-system/canonicalKeys";

/** 9 section_kind — sabit sıra (UAT'ta Manifestör 9 bölüm bu sırayla). */
export const SECTION_KIND_ORDER: readonly HdSectionKind[] = [
  "quick_reference", "client_explanation", "consultation_flow", "relationship_guidance",
  "career_guidance", "childhood_guidance", "energy_rest_guidance", "practical_actions", "report_ready_text",
] as const;

export const SECTION_KIND_LABEL: Record<HdSectionKind, string> = {
  quick_reference: "Hızlı Bakış",
  client_explanation: "Danışana Nasıl Anlatılır?",
  consultation_flow: "Görüşme Akışı",
  relationship_guidance: "İlişkiler",
  career_guidance: "Kariyer / İş",
  childhood_guidance: "Çocukluk",
  energy_rest_guidance: "Enerji / Dinlenme",
  practical_actions: "Pratik Öneriler",
  report_ready_text: "Rapora Hazır Metin",
};

export const USAGE_SCOPE_LABEL: Record<HdUsageScope, string> = {
  expert_guide: "Uzman Rehberi",
  client_report: "Danışan Raporu",
  both: "Her İkisi",
};

export const CONDITION_KIND_LABEL: Record<HdConditionKind, string> = {
  type_is: "Tip",
  authority_is: "Otorite",
  has_channel: "Kanal",
  has_gate: "Kapı",
};

/** condition_kind → canonical entity_kind (canonical selector kaynağı). */
export const CONDITION_KIND_TO_ENTITY_KIND: Record<HdConditionKind, HdCanonicalEntityKind> = {
  type_is: "tip",
  authority_is: "otorite",
  has_channel: "kanal",
  has_gate: "kapi",
};

export const RELATION_TYPE_LABEL: Record<HdEvidenceRelationType, string> = {
  supports: "Destekler",
  contradicts: "Çelişir",
  school_specific: "Ekole Özgü",
  background: "Arka Plan",
};

export const STATUS_LABEL: Record<HdConsultationStatus, string> = {
  draft: "Taslak",
  published: "Yayınlandı",
  archived: "Arşivlendi",
};

export const ENTITY_KIND_LABEL: Record<HdCanonicalEntityKind, string> = {
  tip: "Tip",
  otorite: "Otorite",
  kapi: "Kapı",
  kanal: "Kanal",
};
