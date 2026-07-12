/**
 * Yaşam Hafızası™ — İndeks Kaynak Config (Sprint 2 / S2.03).
 *
 * YALNIZ BİLDİRİMSEL (declarative) KAYNAK + KOLON KONFİGÜRASYONU.
 * Bu dosyada MANTIK YOKTUR:
 *   - DB sorgusu / Supabase client / IO YOK.
 *   - normalize / evidence çıkarımı / scoring / API / UI YOK.
 *   - JSONB alanlardan metin/tag/relation çıkarımı YOK (jsonPath tanımlanmaz);
 *     JSONB kolonları yalnız GERÇEK KOLON ADIYLA listelenir, ayrıştırma S2.05/S2.07'ye aittir.
 *   - title fallback (ör. "content ilk cümlesi") YOK; yalnız gerçek kolon adları.
 *
 * PII NOTU: Bu config PII sınıflandırması İÇERMEZ. `reflexology_notes` kilitli 17
 * kaynak içinde ve enabled=true'dur; ancak PII riski taşıdığı için gerçek indeksleme
 * başlamadan ÖNCE ayrı bir analiz + mimari kararla sınıflandırılacaktır. Diğer 16
 * kaynak da bu aşamada "safe" ilan edilmiş SAYILMAZ. S2.03 veri okumaz/indekslemez.
 *
 * Kolon adları yalnızca DDL / mevcut tip / API-helper kodundan KESİN doğrulanmıştır.
 * Belirsiz alanlar: topicTagsColumns=[], relationColumns=[], updatedAtColumn=null, activeColumn=null.
 */

import type { YhSourceModule } from "../config";

/** İndekslenebilir birim türü (index tablosu unit_type ile aynı). */
export type IndexUnit = "record" | "section" | "row";

/**
 * Tenant çözümleme:
 *   - column: tenant_id doğrudan kolonda (bazıları NULL=shared referans).
 *   - join:   tenant_id yok → parent tablodan FK ile çözülür.
 */
export type TenantResolution =
  | { readonly mode: "column"; readonly column: string; readonly allowSharedNull?: boolean }
  | {
      readonly mode: "join";
      readonly fkColumn: string;
      readonly parentTable: string;
      readonly parentTenantColumn: string;
    };

/** Tek bir kaynak tablonun bildirimsel indeks konfigürasyonu. */
export interface SourceConfig {
  /** Benzersiz kaynak anahtarı (ör. 'refleksoloji:protocols'). */
  readonly sourceKey: string;
  /** Kaynak modül ailesi (config.YH_SOURCE_MODULES üyesi). */
  readonly sourceFamily: YhSourceModule;
  /** Gerçek tablo adı. */
  readonly tableName: string;
  /** Primary key kolonu. */
  readonly primaryKey: string;
  /** İndekslenebilir birim. */
  readonly unit: IndexUnit;
  /** Tenant izolasyon çözümü. */
  readonly tenant: TenantResolution;
  /** Kart başlığı için gerçek kolon(lar). */
  readonly titleColumns: readonly string[];
  /** Lexical korpus için gerçek kolonlar. */
  readonly searchTextColumns: readonly string[];
  /** Gösterilecek paragraf için gerçek kolonlar. */
  readonly snippetColumns: readonly string[];
  /** Etiket kanıtı kolonları (yoksa []). */
  readonly topicTagsColumns: readonly string[];
  /** Uzman-ilişki kolonları (yoksa []; JSONB kolonları yalnız isimle). */
  readonly relationColumns: readonly string[];
  /** Değişiklik izleme kolonu (yoksa null → content_hash'e dayanılır). */
  readonly updatedAtColumn: string | null;
  /** Aktiflik/soft-delete kolonu (yoksa null). */
  readonly activeColumn: string | null;
  /** Kaynak indekslemeye açık mı. */
  readonly enabled: boolean;
}

/**
 * Kilitli 17 kaynak (Sprint 2 başlangıç kapsamı).
 * Kapsam dışı 5 tablo (refleksoloji atlası, enerji bedenleri, arşiv dosyaları,
 * aromaterapi bilgi makaleleri ve taş dışlama filtresi) bu listede YER ALMAZ.
 */
export const YH_INDEX_SOURCES = [
  // ── Refleksoloji ──────────────────────────────────────────────────────────
  {
    sourceKey: "refleksoloji:protocols",
    sourceFamily: "refleksoloji",
    tableName: "reflexology_protocols",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["title"],
    searchTextColumns: ["target_problem", "application_notes"],
    snippetColumns: ["application_notes"],
    topicTagsColumns: ["organs"],
    relationColumns: [],
    updatedAtColumn: null, // yalnız created_at var → content_hash
    activeColumn: null,
    enabled: true,
  },
  {
    sourceKey: "refleksoloji:notes",
    sourceFamily: "refleksoloji",
    tableName: "reflexology_notes",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["title"],
    searchTextColumns: ["content"],
    snippetColumns: ["content"],
    topicTagsColumns: [], // kategori/etiket kolonu yok
    relationColumns: [], // yapısal ilişki yok (raw_json builder'a ait)
    updatedAtColumn: "updated_at",
    activeColumn: null,
    enabled: true,
  },

  // ── Şifa Rehberi ──────────────────────────────────────────────────────────
  {
    sourceKey: "sifa_rehberi:guides",
    sourceFamily: "sifa_rehberi",
    tableName: "healing_guides",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["name"],
    searchTextColumns: [
      "general_summary",
      "symptoms",
      "medical_causes",
      "subconscious_causes",
      "temperament_causes",
      "other_causes",
      "diet_recommendations",
      "herbal_methods",
      "stone_recommendations",
      "aromatherapy",
      "meditation",
      "breathwork",
      "bioenergy",
      "massage",
      "daily_routine",
      "sleep_routine",
      "supportive_alternative_methods",
      "islamic_recommendations",
      "iridology_match",
      "hand_analysis_match",
      "cupping_leech",
      "reflexology",
    ],
    snippetColumns: ["symptoms", "general_summary"],
    topicTagsColumns: ["category"],
    relationColumns: ["related_stones", "related_reflexology"], // jsonb; çıkarım builder'da
    updatedAtColumn: "updated_at",
    activeColumn: null,
    enabled: true,
  },
  {
    sourceKey: "sifa_rehberi:guide-sections",
    sourceFamily: "sifa_rehberi",
    tableName: "healing_guide_sections",
    primaryKey: "id",
    unit: "section",
    tenant: {
      mode: "join",
      fkColumn: "guide_id",
      parentTable: "healing_guides",
      parentTenantColumn: "tenant_id",
    },
    titleColumns: ["title"],
    searchTextColumns: ["note", "mode", "source"],
    snippetColumns: ["note"],
    topicTagsColumns: ["section_type", "mode"],
    relationColumns: [],
    updatedAtColumn: null, // yalnız created_at var → content_hash
    activeColumn: null,
    enabled: true,
  },

  // ── Biyoenerji (hepsi tenant_id; updated_at/active yok → null) ─────────────
  {
    sourceKey: "biyoenerji:subconscious-causes",
    sourceFamily: "biyoenerji",
    tableName: "bioenergy_subconscious_causes",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["title"],
    searchTextColumns: ["content", "note_text"],
    snippetColumns: ["content"],
    topicTagsColumns: ["category"],
    relationColumns: [],
    updatedAtColumn: null,
    activeColumn: null,
    enabled: true,
  },
  {
    sourceKey: "biyoenerji:symbols",
    sourceFamily: "biyoenerji",
    tableName: "bioenergy_symbols",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["title"],
    searchTextColumns: ["symbol", "meaning", "source"],
    snippetColumns: ["meaning"],
    topicTagsColumns: ["category"],
    relationColumns: [],
    updatedAtColumn: null,
    activeColumn: null,
    enabled: true,
  },
  {
    sourceKey: "biyoenerji:chakras",
    sourceFamily: "biyoenerji",
    tableName: "bioenergy_chakras",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["name"],
    searchTextColumns: ["causes", "physical", "mental", "notes"],
    snippetColumns: ["causes"],
    topicTagsColumns: ["color", "organs", "glands"],
    relationColumns: ["stones"],
    updatedAtColumn: null,
    activeColumn: null,
    enabled: true,
  },
  {
    sourceKey: "biyoenerji:imaginations",
    sourceFamily: "biyoenerji",
    tableName: "bioenergy_imaginations",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["title"],
    searchTextColumns: ["text", "notes", "source"],
    snippetColumns: ["text"],
    topicTagsColumns: ["category"],
    relationColumns: [],
    updatedAtColumn: null,
    activeColumn: null,
    enabled: true,
  },

  // ── Doğaltaş ──────────────────────────────────────────────────────────────
  {
    sourceKey: "dogaltas:stones",
    sourceFamily: "dogaltas",
    tableName: "stones",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["stone_name"],
    searchTextColumns: [
      "short_description",
      "general_info",
      "physical_effects",
      "spiritual_effects",
      "other_effects",
      "application",
      "meditation",
      "care",
      "feng_shui",
      "source_note",
      "warning_text",
    ],
    snippetColumns: ["short_description", "warning_text"],
    topicTagsColumns: ["chakras", "warning_tags"],
    relationColumns: ["assignments"], // mineral atamaları (jsonb; çıkarım builder'da)
    updatedAtColumn: "updated_at",
    activeColumn: null,
    enabled: true,
  },
  {
    sourceKey: "dogaltas:minerals",
    sourceFamily: "dogaltas",
    tableName: "minerals",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["name"],
    searchTextColumns: [
      "aciklama",
      "fiziksel",
      "zihinsel",
      "fizyoloji",
      "eksiklik_belirtileri",
      "fazlalik_belirtileri",
      "doz_asimi",
    ],
    snippetColumns: ["aciklama", "fizyoloji"],
    topicTagsColumns: ["cakralar", "kategori"],
    relationColumns: ["iceren_taslar", "organ_etkileri"],
    updatedAtColumn: null, // yalnız created_at var → content_hash
    activeColumn: null,
    enabled: true,
  },
  {
    sourceKey: "dogaltas:knowledge",
    sourceFamily: "dogaltas",
    tableName: "stone_knowledge_articles",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id", allowSharedNull: true },
    titleColumns: ["title"],
    searchTextColumns: ["content", "keyword", "notes", "source", "source_section"],
    snippetColumns: ["content", "keyword"],
    topicTagsColumns: ["tags", "category", "sub_category"],
    relationColumns: ["related_stones", "related_minerals"],
    updatedAtColumn: "updated_at",
    activeColumn: "is_active",
    enabled: true,
  },
  {
    sourceKey: "dogaltas:combinations",
    sourceFamily: "dogaltas",
    tableName: "combinations",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["issue"],
    searchTextColumns: ["description", "notes_text", "notes_text_2", "notes_text_3"],
    snippetColumns: ["description", "stones_text"],
    topicTagsColumns: ["source"],
    relationColumns: ["stones_text"],
    updatedAtColumn: null, // yalnız created_at var → content_hash
    activeColumn: null,
    enabled: true,
  },

  // ── Aromaterapi ───────────────────────────────────────────────────────────
  {
    sourceKey: "aromaterapi:oils",
    sourceFamily: "aromaterapi",
    tableName: "aromatherapy_oils",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id", allowSharedNull: true },
    titleColumns: ["name"],
    searchTextColumns: [
      "latin_name",
      "english_name",
      "benefits",
      "physical_benefits",
      "emotional_benefits",
      "spiritual_benefits",
      "skin_benefits",
      "aroma_profile",
      "main_components",
      "usage_methods",
      "safety_notes",
      "contraindications",
    ],
    snippetColumns: ["benefits", "aroma_profile"],
    topicTagsColumns: [
      "oil_type",
      "category",
      "therapeutic_properties",
      "target_systems",
      "chakra_connection",
    ],
    relationColumns: ["blends_well_with"],
    updatedAtColumn: "updated_at",
    activeColumn: "is_active",
    enabled: true,
  },
  {
    sourceKey: "aromaterapi:reference-sheets",
    sourceFamily: "aromaterapi",
    tableName: "aromatherapy_reference_sheets",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id", allowSharedNull: true },
    titleColumns: ["display_title"],
    searchTextColumns: ["sheet_name", "display_title"],
    snippetColumns: ["display_title"],
    topicTagsColumns: ["headers"],
    relationColumns: [],
    updatedAtColumn: "updated_at",
    activeColumn: "is_active",
    enabled: true,
  },
  {
    sourceKey: "aromaterapi:reference-rows",
    sourceFamily: "aromaterapi",
    tableName: "aromatherapy_reference_rows",
    primaryKey: "id",
    unit: "row",
    tenant: {
      mode: "join",
      fkColumn: "sheet_id",
      parentTable: "aromatherapy_reference_sheets",
      parentTenantColumn: "tenant_id",
    },
    titleColumns: [], // başlık cells JSONB'den türetilir → builder
    searchTextColumns: ["cells"], // jsonb; hücre metni çıkarımı builder'da
    snippetColumns: [], // snippet cells JSONB'den türetilir → builder
    topicTagsColumns: [],
    relationColumns: [],
    updatedAtColumn: null, // yalnız created_at var → content_hash
    activeColumn: null,
    enabled: true,
  },
  {
    sourceKey: "aromaterapi:blends",
    sourceFamily: "aromaterapi",
    tableName: "aromatherapy_blends",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["name"],
    searchTextColumns: ["notes"],
    snippetColumns: ["notes"],
    topicTagsColumns: [],
    relationColumns: ["carrier_oil_name", "items"], // items jsonb snapshot; çıkarım builder'da
    updatedAtColumn: "updated_at",
    activeColumn: "is_active",
    enabled: true,
  },

  // ── Kişisel Arşiv ─────────────────────────────────────────────────────────
  {
    sourceKey: "kisisel_arsiv:archives",
    sourceFamily: "kisisel_arsiv",
    tableName: "personal_archives",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["title"],
    searchTextColumns: ["note"],
    snippetColumns: ["note"],
    topicTagsColumns: ["category", "tags"],
    relationColumns: [],
    updatedAtColumn: "updated_at",
    activeColumn: null,
    enabled: true,
  },
] as const satisfies readonly SourceConfig[];

/** 17 kaynağın sourceKey birleşimi (tip güvenliği için). */
export type YhSourceKey = (typeof YH_INDEX_SOURCES)[number]["sourceKey"];
