/**
 * HD Danışmanlık F2 · Admin API DTO sözleşmeleri (client-safe; server-only DEĞİL).
 * ================================================================================
 * Bu dosya yalnız TİP taşır: hem admin API route/service hem admin UI import eder.
 * Supabase/DB import YOK → client bundle güvenli. Değerler F0B contracts'tan gelir.
 */
import type {
  HdConsultationStatus,
  HdSectionKind,
  HdUsageScope,
  HdConditionKind,
  HdRightsStatus,
  RightsDecision,
} from "@/lib/human-design/consultation/types";
import type { HdEvidenceRelationType } from "@/lib/human-design/knowledge-system/contracts";
import type { HdCanonicalEntityKind } from "@/lib/human-design/knowledge-system/canonicalKeys";

/** Liste satırı: canonical entity + (varsa) aktif danışmanlık içeriği özeti. */
export type ConsultationListEntry = {
  entityId: string;
  entityKind: HdCanonicalEntityKind;
  canonicalKey: string;
  nameTr: string;
  /** null → henüz danışmanlık içeriği yok (oluşturulabilir). */
  consultation: ConsultationListSummary | null;
};

export type ConsultationListSummary = {
  id: string;
  status: HdConsultationStatus;
  version: number;
  isAiGenerated: boolean;
  humanApprovedAt: string | null;
  canonicalContentId: string | null;
  canonicalContentVersion: number | null;
  canonicalContentHash: string | null;
  sectionCount: number;
  updatedAt: string;
};

/** Detay: ana içerik + sıralı sections (nested q/c/e) + evidence rights projeksiyonu. */
export type ConsultationDetail = {
  id: string;
  entityId: string;
  entityKind: HdCanonicalEntityKind;
  canonicalKey: string;
  nameTr: string;
  status: HdConsultationStatus;
  version: number;
  isAiGenerated: boolean;
  humanApprovedAt: string | null;
  archivedAt: string | null;
  canonicalContentId: string | null;
  canonicalContentVersion: number | null;
  canonicalContentHash: string | null;
  /** Canonical ana içeriğin GÜNCEL durumu (pin karşılaştırması için, read-only). */
  canonicalLive: {
    status: string;
    version: number;
    humanApprovedAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
  sections: ConsultationSectionDetail[];
  /** section_id = null olan içerik-düzeyi kayıtlar. */
  contentQuestions: ConsultationQuestionDetail[];
  contentConditions: ConsultationConditionDetail[];
};

export type ConsultationSectionDetail = {
  id: string;
  sectionKind: HdSectionKind;
  bodyText: string;
  topicScope: string | null;
  usageScope: HdUsageScope;
  status: HdConsultationStatus;
  version: number;
  sortOrder: number;
  questions: ConsultationQuestionDetail[];
  conditions: ConsultationConditionDetail[];
  evidence: ConsultationEvidenceDetail[];
};

export type ConsultationQuestionDetail = {
  id: string;
  questionText: string;
  topicScope: string | null;
  sortOrder: number;
};

export type ConsultationConditionDetail = {
  id: string;
  conditionKind: HdConditionKind;
  conditionValue: string;
  sortOrder: number;
};

export type ConsultationEvidenceDetail = {
  id: string;
  passageId: string;
  relationType: HdEvidenceRelationType;
  isPrimary: boolean;
  isSingleSource: boolean;
  editorialNote: string | null;
  sortOrder: number;
  /** Provenance/rights projeksiyonu (tam kaynak metni TAŞINMAZ). */
  passage: {
    id: string;
    locatorLabel: string;
    locatorValue: string;
    sourceId: string;
    sourceTitle: string;
    sourceAuthors: string[];
    sourceOrganization: string | null;
    /** Effective (override-else-source) hak alanları — görüntüleme amaçlı. */
    rightsStatus: HdRightsStatus;
    effective: {
      internalUseAllowed: boolean;
      expertDeliveryAllowed: boolean;
      privateReportUseAllowed: boolean;
      translationAllowed: boolean;
      quotationAllowed: boolean;
      quotationWordLimit: number | null;
    };
    hasOverride: boolean;
    /** F0B rights resolver kararları (default-deny). */
    expertGuide: RightsDecision;
    clientReport: RightsDecision;
  } | null;
};

/** update RPC yalnız is_ai_generated patch + explicit repin destekler. */
export type ConsultationUpdateInput = {
  expectedVersion: number;
  isAiGenerated?: boolean;
  repin?: boolean;
};

/** Stabil hata kodları (route → HTTP + Türkçe mesaj map'ler). */
export type ConsultationErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "STALE_VERSION"
  | "CANONICAL_STALE"
  | "PIN_PATCH_BLOCKED"
  | "RIGHTS_DENIED"
  | "EVIDENCE_MISSING"
  | "CANONICAL_NOT_APPROVED"
  | "NO_ACTIVE_SECTION"
  | "ARCHIVED"
  | "SERVER_ERROR";

export type ConsultationServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ConsultationErrorCode; message: string };
