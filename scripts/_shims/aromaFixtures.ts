// ============================================================
// Interlinked in-memory fixtures for two tenants (T1, T2).
// Feeds the mock Supabase client (aromaMockSupabase.ts) so batch vs single
// report readers can be compared for parity + tenant isolation.
// All ids are valid UUIDs (readers filter link ids through UUID_RE).
// ============================================================
import { randomUUID } from "node:crypto";
import type { Tables } from "./aromaMockSupabase";

export const T1 = randomUUID();
export const T2 = randomUUID();

const id = () => randomUUID();

// ---- Tenant 1 ids ----
export const taxaA = id();
export const taxaB = id();
export const prepA = id();
export const prepB = id();
export const srcA = id();
export const srcB = id();
export const passA1 = id();
export const passA2 = id();
export const passB1 = id();
export const c1 = id();
export const c2 = id();
export const c3 = id();
export const c4 = id();
export const c5 = id();
export const rel1 = id();
export const ms1 = id();
export const ms2 = id();
export const rev1a = id();
export const rev1b = id();
export const rev2a = id();

// ---- Tenant 2 ids (cross-tenant) ----
export const taxaX = id();
export const prepX = id();
export const srcX = id();
export const passX = id();
export const cX = id();
export const msX = id();
export const revX = id();

function taxon(over: Record<string, unknown>) {
  return {
    tenant_id: T1,
    canonical_name: "Lavandula angustifolia",
    genus: "Lavandula",
    species: "angustifolia",
    taxon_rank: "species",
    family: "Lamiaceae",
    author_citation: "Mill.",
    is_hybrid: false,
    status: "verified",
    updated_at: "2026-01-01T00:00:00Z",
    infraspecific_epithet: null,
    primary_common_name_tr: "Lavanta",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function prep(over: Record<string, unknown>) {
  return {
    tenant_id: T1,
    taxon_id: taxaA,
    preparation_type: "essential_oil",
    plant_part: "flower",
    chemotype: "linalool",
    status: "verified",
    updated_at: "2026-01-02T00:00:00Z",
    created_at: "2026-01-02T00:00:00Z",
    ...over,
  };
}

function source(over: Record<string, unknown>) {
  return {
    tenant_id: T1,
    title: "Kaynak Kitap",
    source_type: "book",
    status: "verified",
    authors: "Yazar A",
    organization: "Org",
    publication_year: 2020,
    updated_at: "2026-01-03T00:00:00Z",
    doi: null,
    pmid: null,
    isbn: "978-0",
    url: null,
    document_no: null,
    notes: "not",
    created_at: "2026-01-03T00:00:00Z",
    ...over,
  };
}

function passage(over: Record<string, unknown>) {
  return {
    tenant_id: T1,
    source_id: srcA,
    locator_label: "s. 10",
    passage_kind: "quote",
    original_lang: "en",
    rights_status: "public",
    rights_note: null,
    status: "verified",
    original_text: "Some original text.",
    created_at: "2026-01-04T00:00:00Z",
    updated_at: "2026-01-04T00:00:00Z",
    sort_key: 1,
    ...over,
  };
}

function claim(over: Record<string, unknown>) {
  return {
    tenant_id: T1,
    claim_type: "use",
    safety_topic: null,
    route: "topical",
    preparation_context: "diluted",
    conclusion: "Sonuç metni",
    conclusion_provenance: "from_source",
    outcome_type: "benefit",
    evidence_layer: "traditional",
    rationale: "Gerekçe",
    rationale_status: "from_source",
    status: "draft",
    preparation_id: prepA,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    ...over,
  };
}

export function buildTables(): Tables {
  return {
    aromatherapy_plant_taxa: [
      taxon({ id: taxaA, canonical_name: "Lavandula angustifolia" }),
      taxon({ id: taxaB, canonical_name: "Mentha piperita", genus: "Mentha", species: "piperita" }),
      taxon({ id: taxaX, tenant_id: T2, canonical_name: "T2 Gizli Takson" }),
    ],
    aromatherapy_preparations: [
      prep({ id: prepA, taxon_id: taxaA }),
      prep({ id: prepB, taxon_id: taxaB, preparation_type: "hydrosol" }),
      prep({ id: prepX, tenant_id: T2, taxon_id: taxaX }),
    ],
    aromatherapy_sources: [
      source({ id: srcA, title: "Kaynak A" }),
      source({ id: srcB, title: "Kaynak B" }),
      source({ id: srcX, tenant_id: T2, title: "T2 Kaynak" }),
    ],
    aromatherapy_source_passages: [
      passage({ id: passA1, source_id: srcA, locator_label: "A/1", sort_key: 1 }),
      passage({ id: passA2, source_id: srcA, locator_label: "A/2", sort_key: 2 }),
      passage({ id: passB1, source_id: srcB, locator_label: "B/1", sort_key: 1 }),
      passage({ id: passX, tenant_id: T2, source_id: srcX, locator_label: "X/1" }),
    ],
    aromatherapy_passage_translations: [
      {
        id: id(),
        tenant_id: T1,
        passage_id: passA1,
        target_lang: "tr",
        source_lang: "en",
        translated_text: "Çeviri TR rev2",
        fidelity: "faithful",
        translation_method: "human",
        translation_source: "expert",
        translator_name: "Çevirmen",
        status: "verified",
        review_status: "reviewed",
        revision: 2,
      },
      {
        id: id(),
        tenant_id: T1,
        passage_id: passA1,
        target_lang: "tr",
        source_lang: "en",
        translated_text: "Çeviri TR rev1",
        fidelity: "literal",
        translation_method: "human",
        translation_source: "expert",
        translator_name: "Çevirmen",
        status: "draft",
        review_status: "pending",
        revision: 1,
      },
      {
        id: id(),
        tenant_id: T1,
        passage_id: passA1,
        target_lang: "en",
        source_lang: "en",
        translated_text: "EN passthrough",
        fidelity: "faithful",
        translation_method: "human",
        translation_source: "expert",
        translator_name: null,
        status: "verified",
        review_status: "reviewed",
        revision: 1,
      },
    ],
    aromatherapy_passage_editorial_note_series: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        tenant_id: T1,
        passage_id: passA1,
        note_type: "explanation",
        editorial_class: "editorial_explanation",
        note_lang: "tr",
        created_at: "2026-01-05T00:00:00Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        tenant_id: T1,
        passage_id: passA1,
        note_type: "interpretation",
        editorial_class: "editorial_interpretation",
        note_lang: "tr",
        created_at: "2026-01-06T00:00:00Z",
      },
    ],
    aromatherapy_passage_editorial_notes: [
      {
        id: id(),
        tenant_id: T1,
        note_series_id: "11111111-1111-4111-8111-111111111111",
        revision: 2,
        note_text: "Açıklama rev2",
        author_name: "Editör",
        creation_method: "manual",
        status: "verified",
        review_status: "reviewed",
      },
      {
        id: id(),
        tenant_id: T1,
        note_series_id: "11111111-1111-4111-8111-111111111111",
        revision: 1,
        note_text: "Açıklama rev1",
        author_name: "Editör",
        creation_method: "manual",
        status: "draft",
        review_status: "pending",
      },
      {
        id: id(),
        tenant_id: T1,
        note_series_id: "22222222-2222-4222-8222-222222222222",
        revision: 1,
        note_text: "Yorum rev1",
        author_name: "Uzman",
        creation_method: "manual",
        status: "verified",
        review_status: "reviewed",
      },
    ],
    aromatherapy_claims: [
      claim({ id: c1, preparation_id: prepA, conclusion: "C1", created_at: "2026-02-01T00:00:00Z" }),
      claim({ id: c2, preparation_id: prepB, conclusion: "C2", created_at: "2026-02-02T00:00:00Z" }),
      claim({ id: c3, preparation_id: prepA, conclusion: "C3", created_at: "2026-02-03T00:00:00Z" }),
      claim({ id: c4, preparation_id: prepA, conclusion: "C4", created_at: "2026-02-04T00:00:00Z" }),
      claim({ id: c5, preparation_id: prepB, conclusion: "C5", created_at: "2026-02-05T00:00:00Z" }),
      claim({ id: cX, tenant_id: T2, preparation_id: prepX, conclusion: "T2 gizli claim" }),
    ],
    aromatherapy_claim_routes: [
      { id: id(), tenant_id: T1, claim_id: c1, route_code: "topical" },
      { id: id(), tenant_id: T1, claim_id: c1, route_code: "oral" },
      { id: id(), tenant_id: T1, claim_id: c2, route_code: "inhalation" },
      { id: id(), tenant_id: T2, claim_id: cX, route_code: "topical" },
    ],
    aromatherapy_claim_populations: [
      { id: id(), tenant_id: T1, claim_id: c1, population_code: "adult", age_min: 18, age_max: null },
      { id: id(), tenant_id: T2, claim_id: cX, population_code: "adult", age_min: 18, age_max: null },
    ],
    aromatherapy_claim_sources: [
      {
        id: id(),
        tenant_id: T1,
        claim_id: c1,
        source_id: srcA,
        source_role: "primary",
        verification_status: "verified",
        locator_text: "s.10",
        source_original_excerpt: "excerpt",
        faithful_translation: "çeviri",
      },
      {
        id: id(),
        tenant_id: T1,
        claim_id: c2,
        source_id: srcB,
        source_role: "supporting",
        verification_status: "pending",
        locator_text: "s.20",
        source_original_excerpt: null,
        faithful_translation: null,
      },
      {
        id: id(),
        tenant_id: T2,
        claim_id: cX,
        source_id: srcX,
        source_role: "primary",
        verification_status: "verified",
        locator_text: null,
        source_original_excerpt: null,
        faithful_translation: null,
      },
    ],
    aromatherapy_claim_passages: [
      {
        id: id(),
        tenant_id: T1,
        claim_id: c1,
        passage_id: passA1,
        passage_kind: "quote",
        evidence_relation: "supports",
        verification_status: "verified",
      },
      {
        id: id(),
        tenant_id: T2,
        claim_id: cX,
        passage_id: passX,
        passage_kind: "quote",
        evidence_relation: "supports",
        verification_status: "verified",
      },
    ],
    aromatherapy_claim_relations: [
      {
        id: rel1,
        tenant_id: T1,
        a_claim_id: c1,
        b_claim_id: c2,
        relation_type: "supports",
        explanation_tr: "İlişki açıklaması",
      },
    ],
    aromatherapy_preparation_method_series: [
      {
        id: ms1,
        tenant_id: T1,
        preparation_id: prepA,
        method_kind: "distillation",
        method_lang: "tr",
        source_id: srcA,
        passage_id: passA1,
        created_at: "2026-03-01T00:00:00Z",
      },
      {
        id: ms2,
        tenant_id: T1,
        preparation_id: prepB,
        method_kind: "expression",
        method_lang: "tr",
        source_id: null,
        passage_id: null,
        created_at: "2026-03-02T00:00:00Z",
      },
      {
        id: msX,
        tenant_id: T2,
        preparation_id: prepX,
        method_kind: "distillation",
        method_lang: "tr",
        source_id: srcX,
        passage_id: passX,
        created_at: "2026-03-03T00:00:00Z",
      },
    ],
    aromatherapy_preparation_method_revisions: [
      revRow({ id: rev1a, series_id: ms1, revision: 1, status: "draft", method_text: "MS1 rev1" }),
      revRow({ id: rev1b, series_id: ms1, revision: 2, status: "verified", method_text: "MS1 rev2" }),
      revRow({ id: rev2a, series_id: ms2, revision: 1, status: "draft", method_text: "MS2 rev1" }),
      revRow({ id: revX, series_id: msX, revision: 1, status: "verified", method_text: "MSX", tenant_id: T2 }),
    ],
  };
}

function revRow(over: Record<string, unknown>) {
  return {
    tenant_id: T1,
    series_id: ms1,
    revision: 1,
    status: "draft",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    plant_part_used: "flower",
    material_state: "fresh",
    method_text: "yöntem",
    equipment: "alambik",
    amount_ratio: "1:1",
    solvent_carrier: null,
    duration_text: "2 saat",
    temperature_text: "100C",
    steps: [
      { order: 2, text: "İkinci adım" },
      { order: 1, text: "Birinci adım" },
    ],
    filtration: "süzme",
    resting: "dinlendirme",
    storage: "koyu cam",
    quality_notes: "kalite",
    safety_notes: "güvenlik",
    note_hash: "hash123",
    ...over,
  };
}
