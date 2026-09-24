/**
 * KUPA & HACAMAT — yazılabilir kolon allowlist'leri (server-side).
 *
 * INSERT/UPDATE payload'u YALNIZ bu alanlardan kurulur; client'ın gönderdiği
 * tenant_id / id / created_at / provenance / başka kolonlar ASLA kabul edilmez
 * (server tenant_id'yi kendisi yazar). Doğaltaş/refleksoloji desenleriyle aynı.
 */
import {
  CUPPING_LATERALITIES,
  CUPPING_SOURCE_TYPES,
  CUPPING_TECHNIQUE_TYPES,
  CUPPING_MOVEMENT_STYLES,
  CUPPING_CONTRAINDICATION_CLASSES,
  CUPPING_RELATION_STRENGTHS,
  CUPPING_SEVERITIES,
  CUPPING_EVIDENCE_CLASSES,
} from "@/lib/cupping/vocab";

export const CUPPING_TABLES = {
  points: "cupping_points",
  placements: "cupping_point_placements",
  topics: "cupping_topics",
  pointTopics: "cupping_point_topics",
  techniques: "cupping_techniques",
  knowledge: "cupping_knowledge_records",
  sources: "cupping_sources",
  safety: "cupping_safety_notes",
  // ── FAZ 4 — technique ↔ master safety note (protocol_safety'den AYRI) ──
  techniqueSafety: "cupping_technique_safety",
  // ── FAZ 1.5 — tipli citation junction tabloları ──
  pointSources: "cupping_point_sources",
  topicSources: "cupping_topic_sources",
  pointTopicSources: "cupping_point_topic_sources",
  techniqueSources: "cupping_technique_sources",
  knowledgeSources: "cupping_knowledge_sources",
  safetySources: "cupping_safety_sources",
  // ── Kullanıcı/uzman notları (formal citation'dan AYRI, tenant-local) ──
  topicNotes: "cupping_topic_notes",
  topicNotePoints: "cupping_topic_note_points",
  // ── V2 CLEAN CORE — Hacamat Protokolleri (legacy topics ağacından TAMAMEN AYRI) ──
  protocols: "cupping_protocols",
  protocolPoints: "cupping_protocol_points",
  protocolTechniques: "cupping_protocol_techniques",
  protocolSafety: "cupping_protocol_safety",
  protocolSteps: "cupping_protocol_steps",
  protocolEntries: "cupping_protocol_entries",
  protocolEntryPoints: "cupping_protocol_entry_points",
  protocolSources: "cupping_protocol_sources",
  // ── FAZ 5 — Hacamat Takvimi + Bilgilendirme (Kozmik Hacamat'tan TAMAMEN AYRI) ──
  adviceTemplates: "cupping_advice_templates",
  calendarPlans: "cupping_calendar_plans",
  calendarPlanDays: "cupping_calendar_plan_days",
  clientAdvice: "cupping_client_advice",
} as const;

/**
 * cupping_topic_notes yazılabilir alanları (server-side). tenant_id/id/topic_id/created_at
 * ASLA client'tan alınmaz (topic_id path/param'dan gelir, server assertOwnedRef eder).
 * point_id listesi ayrı body alanı olarak (point_ids) ele alınır — junction'a server yazar.
 */
export const TOPIC_NOTE_WRITABLE = ["note", "source_label", "sort_order", "is_active"] as const;

export const POINT_WRITABLE = [
  "name",
  "alt_name",
  "code",
  "anatomical_region",
  "description",
  "traditional_use",
  "application_info",
  "related_points",
  "safety_note",
  "source_note",
  "professional_note",
  "synonyms",
  "laterality",
  "sort_order",
  "is_active",
] as const;

export const PLACEMENT_WRITABLE = [
  "point_id",
  "map_key",
  "shape",
  "cx",
  "cy",
  "rx",
  "ry",
  "angle",
  "color",
  "placement_no",
] as const;

export const TOPIC_WRITABLE = [
  "title",
  "description",
  "category",
  "notes",
  "source_note",
  "sort_order",
  "is_active",
] as const;

export const POINT_TOPIC_WRITABLE = [
  "point_id",
  "topic_id",
  "note",
  "source_note",
  "relation_strength",
] as const;

export const TECHNIQUE_WRITABLE = [
  "name",
  "kind",
  "technique_type",
  "movement_style",
  "description",
  "application_info",
  "safety_note",
  "source_note",
  // ── FAZ 4 — "Uzman Notum" (kişisel not; source_note/safety_note'tan AYRI) ──
  "practitioner_note",
  "sort_order",
  "is_active",
] as const;

export const KNOWLEDGE_WRITABLE = [
  "title",
  "content",
  "category",
  "tags",
  "source",
  "source_section",
  "keyword",
  "notes",
  "sort_order",
  "is_active",
] as const;

export const SOURCE_WRITABLE = [
  "source_name",
  "source_type",
  "author_or_organization",
  "title",
  "page_or_section",
  "source_url",
  "accessed_on",
  "note",
  "year",
  "identifier",
  "publication",
  "language",
  "sort_order",
] as const;

export const SAFETY_WRITABLE = [
  "title",
  "content",
  "severity",
  "contraindication_class",
  "scope_tags",
  "source_note",
  "sort_order",
  "is_active",
] as const;

// ─── FAZ 1.5 — citation junction yazılabilir alanları ────────────────────────
/** Citation POST allowlist: source_id + entity FK + meta. Entity FK per-tablo değişir. */
export const CITATION_META_WRITABLE = ["locator", "evidence_class", "note", "sort_order"] as const;

/**
 * 6 citation junction'ın entity FK kolonu + parent tablosu (route factory + transfer +
 * harness tek kaynağı). source_id her zaman cupping_sources'a bakar.
 */
export const CITATION_SPECS = {
  point: { table: CUPPING_TABLES.pointSources, entityFk: "point_id", entityTable: CUPPING_TABLES.points },
  topic: { table: CUPPING_TABLES.topicSources, entityFk: "topic_id", entityTable: CUPPING_TABLES.topics },
  "point-topic": { table: CUPPING_TABLES.pointTopicSources, entityFk: "point_topic_id", entityTable: CUPPING_TABLES.pointTopics },
  technique: { table: CUPPING_TABLES.techniqueSources, entityFk: "technique_id", entityTable: CUPPING_TABLES.techniques },
  knowledge: { table: CUPPING_TABLES.knowledgeSources, entityFk: "knowledge_id", entityTable: CUPPING_TABLES.knowledge },
  safety: { table: CUPPING_TABLES.safetySources, entityFk: "safety_id", entityTable: CUPPING_TABLES.safety },
} as const;

export type CitationEntity = keyof typeof CITATION_SPECS;

export function isCitationEntity(v: unknown): v is CitationEntity {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CITATION_SPECS, v);
}

// ═══════════════════════════════════════════════════════════════════════════
// V2 CLEAN CORE — Hacamat Protokolleri yazılabilir alanları (server-side)
//
// LEGACY (cupping_topics / cupping_point_topics / cupping_topic_notes) ağacından
// TAMAMEN AYRI. tenant_id / id / created_at / provenance ASLA client'tan alınmaz.
// Junction PATCH'lerinde FK kolonları (protocol_id/point_id/technique_id/...) META
// allowlist'ten HARİÇ (immutable) — yalnız protocol_note/sort_order düzenlenir.
// ═══════════════════════════════════════════════════════════════════════════

/** cupping_protocols — protokol dosyası temel bilgisi. */
export const PROTOCOL_WRITABLE = [
  "title",
  "category",
  "summary",
  "tags",
  "preparation_note",
  "aftercare_note",
  "follow_up_note",
  "sort_order",
  "is_active",
] as const;

/** cupping_protocol_points — POST (FK dahil) / PATCH (yalnız META). */
export const PROTOCOL_POINT_WRITABLE = ["protocol_id", "point_id", "protocol_note", "sort_order"] as const;
export const PROTOCOL_POINT_META_WRITABLE = ["protocol_note", "sort_order"] as const;

/** cupping_protocol_techniques — POST (FK dahil) / PATCH (yalnız META). */
export const PROTOCOL_TECHNIQUE_WRITABLE = ["protocol_id", "technique_id", "protocol_note", "sort_order"] as const;
export const PROTOCOL_TECHNIQUE_META_WRITABLE = ["protocol_note", "sort_order"] as const;

/** cupping_protocol_safety — POST (FK dahil) / PATCH (yalnız META). */
export const PROTOCOL_SAFETY_WRITABLE = ["protocol_id", "safety_id", "protocol_note", "sort_order"] as const;
export const PROTOCOL_SAFETY_META_WRITABLE = ["protocol_note", "sort_order"] as const;

/**
 * FAZ 4 — cupping_technique_safety (technique ↔ master safety note).
 * POST FK'leri (technique_id, safety_id) içerir; PATCH yalnız META (note/sort_order) —
 * technique_id/safety_id/tenant_id PATCH ile DEĞİŞTİRİLEMEZ (immutable ilişki kimliği).
 */
export const TECHNIQUE_SAFETY_WRITABLE = ["technique_id", "safety_id", "note", "sort_order"] as const;
export const TECHNIQUE_SAFETY_META_WRITABLE = ["note", "sort_order"] as const;

/**
 * cupping_protocol_steps — POST (protocol_id dahil) / PATCH (protocol_id HARİÇ; ref'ler
 * düzenlenebilir ama step route'u protokol-üyeliğini doğrular + DB composite FK backstop).
 */
export const PROTOCOL_STEP_WRITABLE = [
  "protocol_id",
  "title",
  "body",
  "stage_label",
  "ref_point_id",
  "ref_technique_id",
  "sort_order",
] as const;
export const PROTOCOL_STEP_META_WRITABLE = [
  "title",
  "body",
  "stage_label",
  "ref_point_id",
  "ref_technique_id",
  "sort_order",
] as const;

/**
 * cupping_protocol_entries — UNIFIED "Bilgiler". source_id opsiyonel (nullable);
 * protocol_id body'den (POST) alınır, PATCH'te immutable. point_ids ayrı body alanı
 * (junction'a yalnız server yazar; atomik REPLACE).
 */
export const PROTOCOL_ENTRY_WRITABLE = [
  "title",
  "content",
  "source_id",
  "source_label",
  "locator",
  "sort_order",
  "is_active",
] as const;

/** cupping_protocol_sources — protokol-seviye künye. POST (FK dahil) / PATCH (META). */
export const PROTOCOL_SOURCE_WRITABLE = ["protocol_id", "source_id", "locator", "note", "sort_order"] as const;
export const PROTOCOL_SOURCE_META_WRITABLE = ["locator", "note", "sort_order"] as const;

// ═══════════════════════════════════════════════════════════════════════════
// FAZ 5 — HACAMAT TAKVİMİ + BİLGİLENDİRME yazılabilir alanları (server-side)
//
// id / tenant_id / created_at / updated_at ASLA client'tan alınmaz (server yazar).
// is_default GENEL allowlist DIŞINDADIR — yalnız atomik RPC (default-switch) ile
// yönetilir (partial-unique invariant korunur). gregorian_date / client_id /
// source_template_id / plan_id da allowlist DIŞIDIR — server-side KATI doğrulanır.
// ═══════════════════════════════════════════════════════════════════════════

/** cupping_advice_templates — genel bilgilendirme şablonu. is_default HARİÇ (RPC ile). */
export const ADVICE_TEMPLATE_WRITABLE = [
  "title",
  "before_text",
  "after_text",
  "general_note",
  "is_active",
] as const;

/** cupping_calendar_plans — yıllık plan temel bilgisi. advice_template_id ownership doğrulanır. */
export const CALENDAR_PLAN_WRITABLE = [
  "name",
  "year",
  "description",
  "advice_template_id",
  "is_active",
] as const;

/**
 * cupping_calendar_plan_days — seçili gün meta'sı. gregorian_date / plan_id / selection_source
 * allowlist DIŞINDADIR (server-side; köken sunucu-sahipli). color_key kontrollü palet anahtarı
 * (FAZ 5/5) — DB CHECK + route allowlist doğrular (bkz. CUPPING_DAY_COLOR_KEYS).
 */
export const CALENDAR_PLAN_DAY_WRITABLE = ["user_label", "note", "color_key"] as const;

/** cupping_client_advice — danışana-özel snapshot. client_id/source_template_id server-side. */
export const CLIENT_ADVICE_WRITABLE = [
  "title",
  "before_text",
  "after_text",
  "general_note",
  "is_active",
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// SERVER-SIDE PAYLOAD SINIRLARI (HAC-UX-2/3/4) — alan-KATEGORİSİ bazlı.
//
// pickWritable yalnız alan ADLARINI allowlist'ler; boyut/enum doğrulaması YOKTU.
// Bu registry, insertEntity/updateEntity chokepoint'inde (bkz. api.ts validateWritable)
// uygulanır. Amaç: aşırı-büyük string / aşırı array / geçersiz enum'u KONTROLLÜ 400 ile
// reddetmek (ham DB hatası sızmadan). Tek bir max TÜM alanlara UYGULANMAZ — kategori bazlı.
//
// LİMİTLER KONSERVATİF/CÖMERT seçildi (mevcut kullanıcı verisini KIRMAMAK için). İzole
// worktree'de canlı DB read-only erişimi HAZIR DEĞİLDİ → MAX(length) doğrulanamadı; değerler
// şema + kullanım amacına göre geniş tutuldu (bkz. AŞAMA 2 raporu / geriye-uyumluluk notu).
// Boş string ("") ve null "değer yok" sayılır (skip) — mevcut UI davranışı korunur.
// ═══════════════════════════════════════════════════════════════════════════

/** Kategori bazlı string üst sınırları (karakter). */
export const CUPPING_TEXT_LIMITS = {
  code: 200, // kısa kod / kısa serbest (kind, language, accessed_on, map_key…)
  label: 400, // ad / etiket / kategori / kısa başlık
  title: 600, // başlık
  ident: 400, // tanımlayıcı / sayfa-bölüm / locator (DOI/PMID/ISBN/sayfa)
  url: 2000, // bağlantı
  desc: 8000, // orta serbest metin (açıklama / not)
  long: 40000, // uzun serbest metin (içerik / hazırlık / bakım / bilgilendirme metni)
} as const;

/** Array alanları için üst sınırlar (öğe sayısı + öğe uzunluğu). */
export const CUPPING_ARRAY_MAX_ITEMS = 200;
export const CUPPING_ARRAY_ITEM_MAX = 400;

/**
 * KUP-LIVE-1 — NULLABLE enum/select kolonları (kolon adı bazlı; server null-normalize kapsamı).
 *
 * Bu kolonların DB CHECK'i `(col IS NULL OR col IN (...))` biçimindedir → boş "" değeri ihlal eder
 * ama NULL kabul edilir. CrudManager opsiyonel select "—" bırakıldığında client boş string üretir;
 * hem client (fromFormValue) hem server (normalizeNullableEnums) bunu `null`'a çevirir → 500 engellenir.
 *
 * `severity` KASITLI HARİÇTİR: `cupping_safety_notes.severity` NOT NULL DEFAULT 'warning'
 * (CHECK IN(...) — NULL YASAK). Bu yüzden severity ASLA null'a çevrilmez; UI'da boş-seçenek
 * OLMADAN geçerli bir default ile render edilir (FieldDef.allowEmpty=false + defaultValue).
 */
export const CUPPING_NULLABLE_ENUMS: ReadonlySet<string> = new Set([
  "laterality", // cupping_points
  "source_type", // cupping_sources
  "contraindication_class", // cupping_safety_notes
  "relation_strength", // cupping_point_topics
  "technique_type", // cupping_techniques
  "movement_style", // cupping_techniques
  "evidence_class", // 6 citation junction
]);

export type CuppingFieldRule =
  | { t: "str"; max: number }
  | { t: "arr" }
  | { t: "enum"; values: readonly string[] };

const S = (max: number): CuppingFieldRule => ({ t: "str", max });
const ARR: CuppingFieldRule = { t: "arr" };
const EN = (values: readonly string[]): CuppingFieldRule => ({ t: "enum", values });
const L = CUPPING_TEXT_LIMITS;

/**
 * Tablo → alan → kural. Yalnız listelenen alanlar doğrulanır; numeric/boolean/FK alanları
 * (sort_order, year, cx…, *_id) KASITLI olarak sınırsızdır (mevcut davranış korunur, yeni
 * numeric reddi YOK). Enum değerleri vocab.ts + DB CHECK ile birebir.
 */
export const CUPPING_FIELD_RULES: Record<string, Record<string, CuppingFieldRule>> = {
  [CUPPING_TABLES.points]: {
    name: S(L.label), alt_name: S(L.label), code: S(L.code), anatomical_region: S(L.label),
    description: S(L.desc), traditional_use: S(L.desc), application_info: S(L.desc),
    safety_note: S(L.desc), source_note: S(L.desc), professional_note: S(L.desc),
    related_points: ARR, synonyms: ARR, laterality: EN(CUPPING_LATERALITIES),
  },
  [CUPPING_TABLES.placements]: { map_key: S(L.code), color: S(L.code) },
  [CUPPING_TABLES.topics]: {
    title: S(L.title), description: S(L.desc), category: S(L.label),
    notes: S(L.desc), source_note: S(L.desc),
  },
  [CUPPING_TABLES.pointTopics]: {
    note: S(L.desc), source_note: S(L.desc), relation_strength: EN(CUPPING_RELATION_STRENGTHS),
  },
  [CUPPING_TABLES.techniques]: {
    name: S(L.label), kind: S(L.code), technique_type: EN(CUPPING_TECHNIQUE_TYPES),
    movement_style: EN(CUPPING_MOVEMENT_STYLES), description: S(L.desc),
    application_info: S(L.desc), safety_note: S(L.desc), source_note: S(L.desc),
    practitioner_note: S(L.desc),
  },
  [CUPPING_TABLES.knowledge]: {
    title: S(L.title), content: S(L.long), category: S(L.label), tags: ARR,
    source: S(L.label), source_section: S(L.label), keyword: S(L.label), notes: S(L.desc),
  },
  [CUPPING_TABLES.sources]: {
    source_name: S(L.label), source_type: EN(CUPPING_SOURCE_TYPES),
    author_or_organization: S(L.label), title: S(L.title), page_or_section: S(L.ident),
    source_url: S(L.url), accessed_on: S(L.code), note: S(L.desc), identifier: S(L.ident),
    publication: S(L.label), language: S(L.code),
  },
  [CUPPING_TABLES.safety]: {
    title: S(L.title), content: S(L.long), severity: EN(CUPPING_SEVERITIES),
    contraindication_class: EN(CUPPING_CONTRAINDICATION_CLASSES), scope_tags: ARR,
    source_note: S(L.desc),
  },
  [CUPPING_TABLES.topicNotes]: { note: S(L.desc), source_label: S(L.label) },
  // 6 citation junction: locator/note/evidence_class (source_id/*_id FK skip).
  [CUPPING_TABLES.pointSources]: { locator: S(L.ident), note: S(L.desc), evidence_class: EN(CUPPING_EVIDENCE_CLASSES) },
  [CUPPING_TABLES.topicSources]: { locator: S(L.ident), note: S(L.desc), evidence_class: EN(CUPPING_EVIDENCE_CLASSES) },
  [CUPPING_TABLES.pointTopicSources]: { locator: S(L.ident), note: S(L.desc), evidence_class: EN(CUPPING_EVIDENCE_CLASSES) },
  [CUPPING_TABLES.techniqueSources]: { locator: S(L.ident), note: S(L.desc), evidence_class: EN(CUPPING_EVIDENCE_CLASSES) },
  [CUPPING_TABLES.knowledgeSources]: { locator: S(L.ident), note: S(L.desc), evidence_class: EN(CUPPING_EVIDENCE_CLASSES) },
  [CUPPING_TABLES.safetySources]: { locator: S(L.ident), note: S(L.desc), evidence_class: EN(CUPPING_EVIDENCE_CLASSES) },
  [CUPPING_TABLES.protocols]: {
    title: S(L.title), category: S(L.label), summary: S(L.desc), tags: ARR,
    preparation_note: S(L.long), aftercare_note: S(L.long), follow_up_note: S(L.long),
  },
  [CUPPING_TABLES.protocolPoints]: { protocol_note: S(L.desc) },
  [CUPPING_TABLES.protocolTechniques]: { protocol_note: S(L.desc) },
  [CUPPING_TABLES.protocolSafety]: { protocol_note: S(L.desc) },
  [CUPPING_TABLES.protocolSteps]: { title: S(L.title), body: S(L.long), stage_label: S(L.label) },
  [CUPPING_TABLES.protocolEntries]: { title: S(L.title), content: S(L.long), source_label: S(L.label), locator: S(L.ident) },
  [CUPPING_TABLES.protocolSources]: { locator: S(L.ident), note: S(L.desc) },
  [CUPPING_TABLES.techniqueSafety]: { note: S(L.desc) },
  [CUPPING_TABLES.adviceTemplates]: {
    title: S(L.title), before_text: S(L.long), after_text: S(L.long), general_note: S(L.desc),
  },
  [CUPPING_TABLES.calendarPlans]: { name: S(L.label), description: S(L.desc) },
  [CUPPING_TABLES.calendarPlanDays]: { user_label: S(L.label), note: S(L.desc) },
  [CUPPING_TABLES.clientAdvice]: {
    title: S(L.title), before_text: S(L.long), after_text: S(L.long), general_note: S(L.desc),
  },
};
