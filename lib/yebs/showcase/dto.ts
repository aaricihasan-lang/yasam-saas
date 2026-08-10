import "server-only";

import { yebsLabel } from "./labels";
import { isUnpublished } from "./visibility";
import type { YebsTraditionRow } from "@/lib/yebs/service/traditions";
import type { YebsConceptRow, YebsConceptLabelRow } from "@/lib/yebs/service/concepts";
import type { YebsClaimRow } from "@/lib/yebs/service/claims";
import type { YebsSourceRow } from "@/lib/yebs/service/sources";
import type { YebsConceptRelationRow } from "@/lib/yebs/service/conceptRelations";
import type { YebsClaimSourceRow } from "@/lib/yebs/service/claimSources";
import type { YebsConceptRelationSourceRow } from "@/lib/yebs/service/conceptRelationSources";
import type { YebsSchoolRow } from "@/lib/yebs/service/schools";

/**
 * YEBS vitrini STRIPPED READ DTO'ları.
 *
 * Kural: response yalnız vitrinin ihtiyacı kadar alan taşır. Şunlar DTO'ya
 * ÇIKMAZ: expected_updated_at/updated_at (optimistic-lock alanı), created_at,
 * audit reason, raw blocker/RPC kodu, request_id, operation_id, service-only
 * alanlar, ham teknik kolonlar. `id` yalnız navigasyon için taşınır (UI ham
 * göstermez). `status` ham enum olarak DEĞİL; `preview` bayrağı + `statusLabel`
 * (kullanıcı-dostu) olarak sunulur.
 */

/** Yayın durumunun güvenli görünüm metaverisi (ham enum sızmaz). */
type PreviewMeta = { preview: boolean; statusLabel: string };
function previewMeta(status: string): PreviewMeta {
  return { preview: isUnpublished(status), statusLabel: yebsLabel.status(status) };
}

export type TraditionDTO = {
  id: string;
  nameTr: string;
  nativeName: string | null;
  nativeLanguageTag: string | null;
  nativeScriptCode: string | null;
  traditionTypeLabel: string;
} & PreviewMeta;

export function toTraditionDTO(r: YebsTraditionRow): TraditionDTO {
  return {
    id: r.id,
    nameTr: r.name_tr,
    nativeName: r.native_name,
    nativeLanguageTag: r.native_language_tag,
    nativeScriptCode: r.native_script_code,
    traditionTypeLabel: yebsLabel.traditionType(r.tradition_type),
    ...previewMeta(r.status),
  };
}

export type ConceptLabelDTO = {
  id: string;
  label: string;
  languageTag: string;
  scriptCode: string;
  labelKind: string;
  labelKindLabel: string;
  transliterationScheme: string | null;
  isPrimary: boolean;
};

export function toConceptLabelDTO(r: YebsConceptLabelRow): ConceptLabelDTO {
  return {
    id: r.id,
    label: r.label,
    languageTag: r.language_tag,
    scriptCode: r.script_code,
    labelKind: r.label_kind,
    labelKindLabel: yebsLabel.labelKind(r.label_kind),
    transliterationScheme: r.transliteration_scheme,
    isPrimary: r.is_primary,
  };
}

/** Etiket listesinden vitrin başlığı seçer: tr yaygın/çeviri primary → herhangi
 *  primary → herhangi etiket → slug fallback. */
export function pickDisplayTitle(labels: YebsConceptLabelRow[], slug: string): string {
  const trPrimary = labels.find(
    (l) =>
      l.is_primary &&
      l.language_tag.toLowerCase().startsWith("tr") &&
      (l.label_kind === "common_name" || l.label_kind === "faithful_translation"),
  );
  if (trPrimary) return trPrimary.label;
  const anyPrimary = labels.find((l) => l.is_primary);
  if (anyPrimary) return anyPrimary.label;
  if (labels.length > 0) return labels[0].label;
  return slug;
}

export type ConceptDTO = {
  id: string;
  title: string;
  slug: string;
  conceptTypeLabel: string;
  traditionId: string;
  schoolId: string | null;
} & PreviewMeta;

export function toConceptDTO(
  r: YebsConceptRow,
  title: string,
): ConceptDTO {
  return {
    id: r.id,
    title,
    slug: r.slug,
    conceptTypeLabel: yebsLabel.conceptType(r.concept_type),
    traditionId: r.tradition_id,
    schoolId: r.school_id,
    ...previewMeta(r.status),
  };
}

export type ClaimDTO = {
  id: string;
  claimText: string;
  claimTypeLabel: string;
  evidenceLayerLabel: string;
  provenanceLabel: string;
  conceptId: string;
  safetyTopic: string | null;
} & PreviewMeta;

export function toClaimDTO(r: YebsClaimRow): ClaimDTO {
  return {
    id: r.id,
    claimText: r.claim_text,
    claimTypeLabel: yebsLabel.claimType(r.claim_type),
    evidenceLayerLabel: yebsLabel.evidenceLayer(r.evidence_layer),
    provenanceLabel: yebsLabel.provenanceKind(r.provenance_kind),
    conceptId: r.concept_id,
    safetyTopic: r.safety_topic,
    ...previewMeta(r.status),
  };
}

export type SourceDTO = {
  id: string;
  title: string;
  sourceTypeLabel: string;
  authors: string | null;
  organization: string | null;
  publisher: string | null;
  publicationYear: number | null;
  edition: string | null;
  doi: string | null;
  pmid: string | null;
  isbn: string | null;
  url: string | null;
  languageTag: string;
  datingNote: string | null;
  documentNo: string | null;
  accessedOn: string | null;
  notes: string | null;
} & PreviewMeta;

export function toSourceDTO(r: YebsSourceRow): SourceDTO {
  return {
    id: r.id,
    title: r.title,
    sourceTypeLabel: yebsLabel.sourceType(r.source_type),
    authors: r.authors,
    organization: r.organization,
    publisher: r.publisher,
    publicationYear: r.publication_year,
    edition: r.edition,
    doi: r.doi,
    pmid: r.pmid,
    isbn: r.isbn,
    url: r.url,
    languageTag: r.language_tag,
    datingNote: r.dating_note,
    documentNo: r.document_no,
    accessedOn: r.accessed_on,
    notes: r.notes,
    ...previewMeta(r.status),
  };
}

export type RelationDTO = {
  id: string;
  relationType: string;
  relationTypeLabel: string;
  sourceConceptId: string;
  targetConceptId: string;
  sourceConceptTitle: string;
  targetConceptTitle: string;
} & PreviewMeta;

export function toRelationDTO(
  r: YebsConceptRelationRow,
  sourceConceptTitle: string,
  targetConceptTitle: string,
): RelationDTO {
  return {
    id: r.id,
    relationType: r.relation_type,
    relationTypeLabel: yebsLabel.relationType(r.relation_type),
    sourceConceptId: r.source_concept_id,
    targetConceptId: r.target_concept_id,
    sourceConceptTitle,
    targetConceptTitle,
    ...previewMeta(r.status),
  };
}

/**
 * Evidence DTO — claim_source ve relation_source ortak vitrin şekli.
 * `verification_status` HAM olarak DTO'ya ÇIKMAZ (yalnız 'rejected' zaten route
 * katmanında filtrelenir). `isContradiction` source_role='contradiction'.
 * `evidenceLayerLabel` yalnız relation_source için doludur (claim_source'ta
 * evidence_layer claim gövdesindedir).
 */
export type EvidenceDTO = {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceRoleLabel: string;
  isContradiction: boolean;
  evidenceLayerLabel: string | null;
  locatorText: string | null;
  urlFragment: string | null;
  sourceOriginalExcerpt: string | null;
  originalLanguageTag: string | null;
  transliteration: string | null;
  transliterationScheme: string | null;
  faithfulTranslation: string | null;
  translationLanguageTag: string | null;
  rationale: string | null;
};

export function toClaimEvidenceDTO(
  r: YebsClaimSourceRow,
  sourceTitle: string,
): EvidenceDTO {
  return {
    id: r.id,
    sourceId: r.source_id,
    sourceTitle,
    sourceRoleLabel: yebsLabel.sourceRole(r.source_role),
    isContradiction: r.source_role === "contradiction",
    evidenceLayerLabel: null,
    locatorText: r.locator_text,
    urlFragment: r.url_fragment,
    sourceOriginalExcerpt: r.source_original_excerpt,
    originalLanguageTag: r.source_original_language_tag,
    transliteration: r.transliteration,
    transliterationScheme: r.transliteration_scheme,
    faithfulTranslation: r.faithful_translation,
    translationLanguageTag: r.translation_language_tag,
    rationale: r.rationale,
  };
}

export function toRelationEvidenceDTO(
  r: YebsConceptRelationSourceRow,
  sourceTitle: string,
): EvidenceDTO {
  return {
    id: r.id,
    sourceId: r.source_id,
    sourceTitle,
    sourceRoleLabel: yebsLabel.sourceRole(r.source_role),
    isContradiction: r.source_role === "contradiction",
    evidenceLayerLabel: yebsLabel.evidenceLayer(r.evidence_layer),
    locatorText: r.locator_text,
    urlFragment: r.url_fragment,
    sourceOriginalExcerpt: r.source_original_excerpt,
    originalLanguageTag: r.source_original_language_tag,
    transliteration: r.transliteration,
    transliterationScheme: r.transliteration_scheme,
    faithfulTranslation: r.faithful_translation,
    translationLanguageTag: r.translation_language_tag,
    rationale: r.rationale,
  };
}

export type SchoolDTO = {
  id: string;
  nameTr: string;
  nativeName: string | null;
} & PreviewMeta;

export function toSchoolDTO(r: YebsSchoolRow): SchoolDTO {
  return {
    id: r.id,
    nameTr: r.name_tr,
    nativeName: r.native_name,
    ...previewMeta(r.status),
  };
}
