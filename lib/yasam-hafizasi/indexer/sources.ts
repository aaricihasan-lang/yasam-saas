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
      readonly allowSharedNull?: boolean;
    }
  /**
   * BF-14 Ertelenmiş Kaynaklar: global/canonical kaynak (tenant kolonu YOK; merkezî).
   * Sahiplik DAİMA shared (tenant_id NULL). Yalnız YEBS gibi tenant-siz global bilgi için;
   * synthetic tenant/tenant-başına-kopya YOK. (allowSharedNull tip uyumu için opsiyonel.)
   */
  | { readonly mode: "global-canonical"; readonly allowSharedNull?: boolean };

/**
 * Kaynak PII sınıflandırması (S2.19-BF / BF-0). Ana index yalnız PII-DIŞI içindir
 * (CHECK is_client_pii=false). İndeksleme YALNIZ `safe-non-pii` + `enabled=true`
 * kaynağa izin verir; `pii` / `unclassified` / `deferred` fail-closed reddedilir.
 * Guard mantığı `sourceGuard.ts`'te (bu dosya bildirimsel; mantık İÇERMEZ).
 *   - safe-non-pii  → danışan-bağımsız bilgi/kütüphane/katalog; ana index'e girebilir.
 *   - pii           → danışan/serbest-form PII riski; ana index'e ASLA girmez (F5/PII index).
 *   - unclassified  → henüz sınıflandırılmadı; fail-closed reddedilir.
 *   - deferred      → bilinçli ertelendi; fail-closed reddedilir.
 */
export type SourceClassification =
  | "safe-non-pii"
  | "pii"
  | "unclassified"
  | "deferred";

/** Tek bir kaynak tablonun bildirimsel indeks konfigürasyonu. */
export interface SourceConfig {
  /**
   * PII sınıflandırması (ZORUNLU; varsayılan/optional YOK). Yalnız `safe-non-pii`
   * indekslenebilir (bkz. `sourceGuard.ts`). Yeni kaynak eklemek için açıkça sınıflandırılmalı.
   */
  readonly classification: SourceClassification;
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
  /**
   * BF-14: yayın/status kolonu (ör. YEBS 'status'). Verilirse row-eligibility yalnız
   * `eligibleStatuses` içindeki değerlere izin verir (fail-closed). Yoksa status kapısı yok.
   */
  readonly statusColumn?: string | null;
  /** BF-14: statusColumn için izinli değerler (ör. ['published']). statusColumn ile birlikte. */
  readonly eligibleStatuses?: readonly string[];
  /**
   * BF-14: satır-seviyesi classification kolonu (ör. yh_document_passages 'classification').
   * Verilirse yalnız 'safe-non-pii' satırlar indexlenebilir (unclassified/pii/restricted → skip).
   */
  readonly rowClassificationColumn?: string | null;
  /**
   * BF-11E Kişisel Arşiv (ROW-GATED CONTROLLED): bu kaynak YALNIZ satır-seviyesi eligibility
   * kapısından (ayrı classification tablosu + server-türetimli current content hash eşleşmesi;
   * `archiveEligibility.ts`) geçen kayıtları indexler. true ise:
   *   (a) `supportsTenantScopedPage` FALSE döner → kör tenant-scoped backfill KAPALI;
   *   (b) `runExactRecord` yazma öncesi zorunlu row-gate uygular (port yok/erişilemez → fail-closed).
   * Source-level classification 'safe-non-pii' olsa dahi güvenlik row-gate'e dayanır (kaynak
   * güvenliği source-level flip'e DEĞİL, satır-bazlı reviewed+hash kapısına bağlıdır).
   */
  readonly requiresRowEligibilityGate?: boolean;
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
    classification: "safe-non-pii", // uzman protokol kütüphanesi; client_id yok

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
    classification: "pii", // serbest-metin seans notu (config-flagged); ana index'e GİRMEZ

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
    classification: "safe-non-pii", // hastalık bilgi kataloğu; danışan-bağımsız

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
    classification: "safe-non-pii", // bilgi alt-tablosu; danışan-bağımsız

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
    classification: "safe-non-pii", // bilinçaltı sebep kataloğu; danışan-bağımsız

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
    classification: "safe-non-pii", // sembol sözlüğü; danışan-bağımsız

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
    classification: "safe-non-pii", // çakra kataloğu; danışan-bağımsız

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
    classification: "safe-non-pii", // imgeleme kataloğu; danışan-bağımsız

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
    classification: "safe-non-pii", // taş kataloğu; danışan-bağımsız

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
    classification: "safe-non-pii", // mineral kataloğu; danışan-bağımsız

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
    classification: "safe-non-pii", // taş bilgi makaleleri; danışan-bağımsız

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
    classification: "safe-non-pii", // kombinasyon kütüphanesi; danışan-bağımsız

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
    classification: "safe-non-pii", // yağ kataloğu; danışan-bağımsız (BF-1 pilot)

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
    classification: "safe-non-pii", // referans meta; danışan-bağımsız

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
    classification: "safe-non-pii", // referans satırlar (cells); danışan-bağımsız

    sourceFamily: "aromaterapi",
    tableName: "aromatherapy_reference_rows",
    primaryKey: "id",
    unit: "row",
    tenant: {
      mode: "join",
      fkColumn: "sheet_id",
      parentTable: "aromatherapy_reference_sheets",
      parentTenantColumn: "tenant_id",
      allowSharedNull: true, // parent sheet tenant NULL ise shared miras alınır
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
    classification: "safe-non-pii", // uzman blend reçetesi; client_id yok

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

  // ── Numeroloji (BF-14 Birleşik Modül Kaynak Genişletme; DORMANT enabled:false) ──
  // Professional bilgi/kaynak katalogu; danışan-bağımsız (client_id YOK, ad/doğum YOK).
  // Yalnız repository migration'ında TAM CREATE TABLE ile doğrulanmış tablolar bağlandı
  // (numerology_knowledge_records CREATE TABLE repo'da YOK → bilinçli olarak bağlanmadı).
  {
    sourceKey: "numeroloji:sources",
    classification: "safe-non-pii", // bibliyografik kaynak katalogu; danışan-bağımsız

    sourceFamily: "numeroloji",
    tableName: "numerology_sources",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: ["display_label", "title"],
    searchTextColumns: ["title", "authors", "organization", "source_type", "notes"],
    snippetColumns: ["notes", "title"],
    topicTagsColumns: ["source_type", "language"],
    relationColumns: [],
    updatedAtColumn: "updated_at",
    activeColumn: null,
    enabled: false, // DORMANT — aktivasyon BF-11E
  },
  {
    sourceKey: "numeroloji:knowledge-entries",
    classification: "safe-non-pii", // uzmanın bilgi-kaydı notu (professional overlay); danışan-bağımsız

    sourceFamily: "numeroloji",
    tableName: "numerology_knowledge_source_entries",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "column", column: "tenant_id" },
    titleColumns: [], // başlık yok; kart başlığı body snippet'inden türetilir (builder)
    searchTextColumns: ["body"],
    snippetColumns: ["body"],
    topicTagsColumns: [],
    relationColumns: [],
    updatedAtColumn: "updated_at",
    activeColumn: null,
    enabled: false, // DORMANT — aktivasyon BF-11E
  },

  // ── YEBS (BF-14 Ertelenmiş Kaynaklar; GLOBAL-CANONICAL, published-only, DORMANT) ──
  // Tenant-siz merkezî bilgi → tenant: global-canonical (index tenant_id NULL/shared). Yalnız
  // published görünür (statusColumn+eligibleStatuses; row-eligibility fail-closed). client YOK.
  {
    sourceKey: "yebs:traditions",
    classification: "safe-non-pii",

    sourceFamily: "yebs",
    tableName: "yebs_traditions",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "global-canonical" },
    titleColumns: ["name_tr"],
    searchTextColumns: ["name_tr", "tradition_type", "native_name"],
    snippetColumns: ["native_name"],
    topicTagsColumns: ["tradition_type"],
    relationColumns: [],
    updatedAtColumn: "updated_at",
    activeColumn: null,
    statusColumn: "status",
    eligibleStatuses: ["published"],
    enabled: false,
  },
  {
    sourceKey: "yebs:schools",
    classification: "safe-non-pii",

    sourceFamily: "yebs",
    tableName: "yebs_schools",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "global-canonical" },
    titleColumns: ["name_tr"],
    searchTextColumns: ["name_tr", "native_name"],
    snippetColumns: ["native_name"],
    topicTagsColumns: [],
    relationColumns: [],
    updatedAtColumn: "updated_at",
    activeColumn: null,
    statusColumn: "status",
    eligibleStatuses: ["published"],
    enabled: false,
  },
  {
    sourceKey: "yebs:concepts",
    classification: "safe-non-pii",

    sourceFamily: "yebs",
    tableName: "yebs_concepts",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "global-canonical" },
    titleColumns: ["slug"],
    searchTextColumns: ["slug", "concept_type"],
    snippetColumns: [],
    topicTagsColumns: ["concept_type"],
    relationColumns: [],
    updatedAtColumn: "updated_at",
    activeColumn: null,
    statusColumn: "status",
    eligibleStatuses: ["published"],
    enabled: false,
  },
  {
    sourceKey: "yebs:sources",
    classification: "safe-non-pii",

    sourceFamily: "yebs",
    tableName: "yebs_sources",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "global-canonical" },
    titleColumns: ["title"],
    searchTextColumns: ["title", "authors", "organization", "publisher"],
    snippetColumns: ["title"],
    topicTagsColumns: ["source_type"],
    relationColumns: [],
    updatedAtColumn: "updated_at",
    activeColumn: null,
    statusColumn: "status",
    eligibleStatuses: ["published"],
    enabled: false,
  },
  {
    sourceKey: "yebs:claims",
    classification: "safe-non-pii",

    sourceFamily: "yebs",
    tableName: "yebs_claims",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "global-canonical" },
    // claim metni + katman/tür KORUNUR (karşıt claim birleştirme YOK; düz metne ezilmez).
    titleColumns: ["claim_type"],
    searchTextColumns: ["claim_text", "claim_type", "evidence_layer", "provenance_kind"],
    snippetColumns: ["claim_text"],
    topicTagsColumns: ["claim_type", "evidence_layer"],
    relationColumns: [],
    updatedAtColumn: "updated_at",
    activeColumn: null,
    statusColumn: "status",
    eligibleStatuses: ["published"],
    enabled: false,
  },
  {
    sourceKey: "yebs:concept-relations",
    classification: "safe-non-pii",

    sourceFamily: "yebs",
    tableName: "yebs_concept_relations",
    primaryKey: "id",
    unit: "record",
    tenant: { mode: "global-canonical" },
    // subject/predicate/object ilişki yapısı KORUNUR (relation_type + concept id'ler).
    titleColumns: ["relation_type"],
    searchTextColumns: ["relation_type"],
    snippetColumns: [],
    topicTagsColumns: ["relation_type"],
    relationColumns: [],
    updatedAtColumn: "updated_at",
    activeColumn: null,
    statusColumn: "status",
    eligibleStatuses: ["published"],
    enabled: false,
  },

  // ── Belge/Video: EMEKLİYE AYRILDI (ÜRÜN KARARI — NON_SOURCE) ────────────────────
  // Dijital İçerik Merkezi'nin belge/video/ders-notu işleme alanı TRANSIENT PROCESSING /
  // EXPORT WORKSPACE'tir; Yaşam Hafızası SOURCE DOMAIN'İ DEĞİLDİR. Nihai bilgi geçici işleme
  // merkezinden DEĞİL, uzmanın aktardığı nihai profesyonel modülden öğrenilir (çift ingestion
  // engeli). Bu nedenle belge_video:passages source registry'den ÇIKARILDI (activationMatrix +
  // moduleSourceMatrix NOT_MEMORY_SOURCE + deferredSourceClosure NOT_APPLICABLE ile tutarlı).
  // yh_document_passages join+row REUSABLE indexer/worker yeteneği (PR#128) korunur; yalnız bu
  // kaynak-özel kayıt emekliye ayrılmıştır. Foundation tabloları (yh_document_sources/passages)
  // DROP EDİLMEZ (cleanup-candidate; ayrı sistem-genel risk kapısı).

  // ── Kişisel Arşiv (ROW-GATED CONTROLLED; BF-11E) ──────────────────────────
  // Source-level 'safe-non-pii' YALNIZ requiresRowEligibilityGate + backfill-deny + controlled
  // activation (ROW_GATED_CONTROLLED) ile BİRLİKTE anlamlıdır: her satır ayrı classification
  // tablosunda safe-non-pii + server-türetimli current content hash eşleşmesi ister (fail-closed).
  // Kör backfill KAPALI (supportsTenantScopedPage=false); production'da DB is_active=true olmadan
  // hiçbir olay indexlemez. Serbest-form kişisel içerik row-gate'siz index ÜRETMEZ.
  {
    sourceKey: "kisisel_arsiv:archives",
    classification: "safe-non-pii", // güvenlik row-gate'e dayanır (bkz. requiresRowEligibilityGate)

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
    requiresRowEligibilityGate: true, // per-row classification + current-hash gate ZORUNLU
    enabled: true,
  },
] as const satisfies readonly SourceConfig[];

/** 17 kaynağın sourceKey birleşimi (tip güvenliği için). */
export type YhSourceKey = (typeof YH_INDEX_SOURCES)[number]["sourceKey"];
