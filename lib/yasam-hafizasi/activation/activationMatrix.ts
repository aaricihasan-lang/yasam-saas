/**
 * YAŞAM HAFIZASI™ — BF-11E KONTROLLÜ KAYNAK AKTİVASYON MATRİSİ (TEK MACHINE-READABLE
 * SOURCE OF TRUTH).
 * =========================================================================
 *
 * Her kaynağın (professional + client) production'da NASIL aktive edileceğinin exact,
 * kod-olarak-yaşayan sınıflandırmasıdır. moduleSourceMatrix (kaynak katmanı) ve
 * deferredSourceClosure (ertelenmiş alanlar) matrislerini TAMAMLAR; onlarla çelişmez.
 *
 * BAĞLAYICI:
 *   - Uydurma kaynak YOK. Her `sourceKey` GERÇEK registry üyesidir: professional ∈
 *     YH_INDEX_SOURCES, client ∈ YH_CLIENT_INDEX_SOURCES (import-zamanı + harness doğrular).
 *   - Her registry kaynağı TAM BİR KEZ kapsanır (eksik/tekrar YOK).
 *   - `registryEnabled` alanı registry `enabled` ile BİREBİR eşleşmelidir (drift YOK).
 *   - "hepsini aç" YOK: hiçbir kaynak kör aktive edilmez; backfill DEFAULT false.
 *   - Numeroloji CLIENT bilinçli olarak BURADA YOKTUR: güvenli client-owned entity
 *     bulunmadığından registry kaynağı da yoktur (DEFERRED_HARD_BLOCKER). Bu durum
 *     deferredSourceClosure('numeroloji_client_id') ile korunur ve harness zorlar.
 *
 * MERGE-SAFE: Bu dosya SALT BİLDİRİMDİR. Import edilmesi/merge edilmesi hiçbir kaynağı
 * aktive etmez, hiçbir trigger kurmaz, hiçbir olay üretmez. Gerçek aktivasyon
 * `evaluateProcessingGate` (activationState) + DB `yh_source_activation` flip'i +
 * (dormant için) kod `enabled:true` ister — hepsi AYRI production kapılarıdır.
 */

import { YH_INDEX_SOURCES, hasWorkerCapability } from "../indexer/sources";
import { YH_CLIENT_INDEX_SOURCES } from "../client/clientSources";
import {
  ACTIVATION_CLASS_POLICY,
  evaluateProcessingGate,
  isActivationClass,
  type ActivationClass,
  type ActivationScope,
  type SourceActivationDesired,
  type SourceActivationRuntime,
} from "./activationState";

/** Tenant çözümleme modu (registry TenantResolution ile hizalı; client = column). */
export type ActivationTenantMode = "column" | "join" | "global-canonical";

/** Kaynağın row-seviyesi güvenlik/eligibility kapısı türü. */
export type ActivationRowGate =
  | "none" // row-seviyesi kapı yok (kaynak-seviyesi classification/enabled yeterli)
  | "source-classification" // yalnız kaynak-seviyesi classification (safe-non-pii)
  | "status-eligibility" // statusColumn + eligibleStatuses (ör. YEBS published-only)
  | "row-classification" // rowClassificationColumn (ör. belge_video safe-non-pii passage)
  | "row-classification-hash" // classification + current reviewed hash (Kişisel Arşiv)
  | "pii-denylist"; // client PII denylist (yalnız PII'siz kod/etiket/tarih)

/** Mevcut production verisinin aktivasyon açısından taşıdığı risk. */
export type CurrentDataRisk =
  | "none" // canlı/güvenli; ek risk yok
  | "test-data" // satış-öncesi test tenant verisi riski → kör backfill YASAK
  | "pii-freeform" // serbest-form PII riski → row-gate olmadan indexlenmez
  | "empty-foundation"; // foundation tablosu şu an BOŞ → mevcut veri yok

/** Backfill uygunluğu (aktivasyondan AYRI; default davranış her zaman false). */
export type BackfillEligibility =
  | "not-applicable" // zaten canlı; backfill kavramı geçerli değil
  | "blocked-test-data" // mevcut veri test riski → backfill YASAK (temiz reset sonrası)
  | "blocked-pii" // PII/row-gate riski → backfill YASAK
  | "blocked-worker-unsupported" // worker v1 kaynağı hiç işleyemez (shared/global tenant VEYA non-record unit) → backfill YASAK
  | "candidate-with-approval"; // yalnız güvenli canonical veri; ayrı onay + preflight ile

export interface ActivationMatrixEntry {
  /** GERÇEK registry sourceKey (professional/client). */
  readonly sourceKey: string;
  /** İnsan-okur modül etiketi. */
  readonly module: string;
  /** Katman: professional | client. */
  readonly scope: ActivationScope;
  /** Nihai aktivasyon sınıfı (activationState.ACTIVATION_CLASSES). */
  readonly activationClass: ActivationClass;
  /** Kaynak tablo/entity. */
  readonly sourceTable: string;
  /** Tenant çözümleme modu. */
  readonly tenantMode: ActivationTenantMode;
  /** Row-seviyesi güvenlik kapısı türü. */
  readonly rowGate: ActivationRowGate;
  /** Kod registry'sindeki `enabled` (BİREBİR eşleşmeli). */
  readonly registryEnabled: boolean;
  /** Mevcut production verisi riski. */
  readonly currentDataRisk: CurrentDataRisk;
  /** Gelecek olay (INSERT/UPDATE/DELETE CDC) izleme güvenli mi. */
  readonly futureEventEligible: boolean;
  /** Backfill uygunluğu (default davranış her zaman false). */
  readonly backfillEligibility: BackfillEligibility;
  /** CDC trigger kurulumu bu kaynak için teknik olarak fizibl mi (worker v1 kapsamı dahil). */
  readonly triggerFeasibleNow: boolean;
  /** Aktivasyon önkoşulu (bu paket DIŞINDA; production kapısı). */
  readonly activationPrerequisite: string;
  /** Aktivasyon kohortu (birlikte değerlendirilecek grup). */
  readonly activationCohort: string;
  /** Rollback davranışı (kill-switch; index satırları KORUNUR). */
  readonly rollbackBehavior: string;
  /** Exact nihai öneri/gerekçe. */
  readonly recommendation: string;
}

// Kısaltmalar (tekrarları azaltmak için).
const KEEP_LIVE_ROLLBACK =
  "Mevcut canlı kaynak; yeni aktivasyon kapısına tabi değil. Deaktivasyon gerekirse trigger drop + processing off; index satırları KORUNUR.";
const DORMANT_ROLLBACK =
  "yh_source_activation.is_active=false (kill-switch) → yeni olay işlenmez; trigger drop güvenli; mevcut index satırları OTOMATİK SİLİNMEZ (ayrı explicit cleanup kararı).";
const SEP_APPROVAL = "AYRI production onayı (kod enabled:true + DB is_active flip + preflight PASS).";

export const YH_ACTIVATION_MATRIX = [
  // ── A) COHORT A PROFESSIONAL — worker-v1-supported (record + column/join, non-shared) kaynaklar.
  //   dogaltas:stones + refleksoloji:notes KEEP_LIVE (grandfathered CANLI; davranış DEĞİŞMEZ).
  //   11 worker-v1-supported kaynak FUTURE_ONLY_READY (controlled): CDC trigger WIRED
  //   (migration 20261004000000; 11 generic) ama production'da is_active=true olmadan NO-OP
  //   (default OFF; CODE ENABLED ≠ TRIGGER INSTALLED ≠ DB ACTIVATED).
  //   PRE-MERGE REVIEW DÜZELTMESİ: 5 kaynak worker v1 (eventProcessor) tarafından İŞLENEMEZ ve
  //   Cohort A'dan ÇIKARILDI → DEFERRED_SHARED_WORKER_V2 (aşağıda F bölümü):
  //     - dogaltas:knowledge, aromaterapi:oils/reference-sheets/reference-rows (allowSharedNull=true
  //       → Kapı 6 permanent 'shared-source-unsupported')
  //     - sifa_rehberi:guide-sections (unit=section → Kapı 7 permanent 'non-record-unit-unsupported').
  //   Bu 5 kaynağa CDC trigger BAĞLANMAZ; registry `enabled:true` KORUNUR (arama semantiği bozulmaz). ──
  controlled("refleksoloji:protocols", "Refleksoloji", "reflexology_protocols", "column", "source-classification"),
  {
    // refleksoloji:notes registry'de enabled:true ANCAK classification=pii → guard fail-closed
    // (index no-op). "KEEP_LIVE" = mevcut davranışı KORU (pii no-op) demektir; değiştirilmez.
    sourceKey: "refleksoloji:notes",
    module: "Refleksoloji",
    scope: "professional",
    activationClass: "KEEP_LIVE",
    sourceTable: "reflexology_notes",
    tenantMode: "column",
    rowGate: "source-classification",
    registryEnabled: true,
    currentDataRisk: "pii-freeform",
    futureEventEligible: false,
    backfillEligibility: "blocked-pii",
    triggerFeasibleNow: false,
    activationPrerequisite: "F5/PII index katmanı (bu faz dışında); ana index'e ASLA girmez.",
    activationCohort: "keep-live-professional",
    rollbackBehavior: KEEP_LIVE_ROLLBACK,
    recommendation:
      "KEEP_LIVE: classification=pii → source-guard fail-closed (index no-op). Mevcut davranış KORUNUR; PII ana index'e girmez.",
  },
  controlled("sifa_rehberi:guides", "Şifa Rehberi", "healing_guides", "column", "source-classification"),
  // guide-sections unit=section → Worker-v2 'section-unit' + 'parent-derived-scope' capability ile READY.
  controlledV2("sifa_rehberi:guide-sections", "Şifa Rehberi", "healing_guide_sections", "join", "source-classification"),
  controlled("biyoenerji:subconscious-causes", "Biyoenerji", "bioenergy_subconscious_causes", "column", "source-classification"),
  controlled("biyoenerji:symbols", "Biyoenerji", "bioenergy_symbols", "column", "source-classification"),
  controlled("biyoenerji:chakras", "Biyoenerji", "bioenergy_chakras", "column", "source-classification"),
  controlled("biyoenerji:imaginations", "Biyoenerji", "bioenergy_imaginations", "column", "source-classification"),
  // BF-CohortA yeni Biyoenerji professional kaynakları (migration 20261004000000 ile trigger WIRED).
  controlled("biyoenerji:sessions", "Biyoenerji", "bioenergy_sessions", "column", "source-classification"),
  controlled("biyoenerji:energy-bodies", "Biyoenerji", "bioenergy_energy_bodies", "column", "source-classification"),
  // dogaltas:stones KEEP_LIVE (grandfathered CANLI; mevcut koşulsuz outbox trigger — DEĞİŞMEZ).
  keepLive("dogaltas:stones", "Doğaltaş", "stones", "column", "source-classification"),
  controlled("dogaltas:minerals", "Doğaltaş / Mineral Bankası", "minerals", "column", "source-classification"),
  // dogaltas:knowledge allowSharedNull=true → Worker-v2 'shared-optional-professional' capability ile READY.
  controlledV2("dogaltas:knowledge", "Doğaltaş", "stone_knowledge_articles", "column", "source-classification"),
  controlled("dogaltas:combinations", "Doğaltaş", "combinations", "column", "source-classification"),
  // aromaterapi:oils/reference-sheets shared-optional; reference-rows shared + parent-derived → Worker-v2 READY.
  controlledV2("aromaterapi:oils", "Aromaterapi", "aromatherapy_oils", "column", "source-classification"),
  controlledV2("aromaterapi:reference-sheets", "Aromaterapi", "aromatherapy_reference_sheets", "column", "source-classification"),
  controlledV2("aromaterapi:reference-rows", "Aromaterapi", "aromatherapy_reference_rows", "join", "source-classification"),
  controlled("aromaterapi:blends", "Aromaterapi", "aromatherapy_blends", "column", "source-classification"),

  // ── PROFESSIONAL COHORT (Aromaterapi Canonical V2 katalog + verified-method) ──
  //   Hepsi tenant-scoped (column, NOT NULL) + record → worker-v1 kapsamında (capability YOK).
  //   CDC trigger YENİ migration ile WIRED (generic yh_cdc_enqueue: plant_taxa/preparations;
  //   yh_cdc_enqueue_method_series_v2: method — revizyon status değişimi → series-keyed coalesce).
  //   Katalog current/publishable = status ∈ {verified, approved} (row-gate). Method current =
  //   status='verified' TEK revizyon (seri identity; worker işleme anında çözer). Backfill false.
  professionalCohort("aromaterapi:plant-taxa", "Aromaterapi", "aromatherapy_plant_taxa"),
  professionalCohort("aromaterapi:preparations", "Aromaterapi", "aromatherapy_preparations"),
  professionalCohort("aromaterapi:method", "Aromaterapi", "aromatherapy_preparation_method_series"),

  // ── E) KİŞİSEL ARŞİV (ROW_GATED_CONTROLLED) — row-gate WIRED + controlled (default OFF) ──
  {
    sourceKey: "kisisel_arsiv:archives",
    module: "Kişisel Arşiv",
    scope: "professional",
    activationClass: "ROW_GATED_CONTROLLED",
    sourceTable: "personal_archives",
    tenantMode: "column",
    rowGate: "row-classification-hash",
    registryEnabled: true,
    currentDataRisk: "pii-freeform",
    futureEventEligible: true,
    backfillEligibility: "blocked-pii",
    // Row-gate runtime'a bağlı + column-tenant + record → CDC trigger + worker exact-write teknik fizibl.
    triggerFeasibleNow: true,
    activationPrerequisite:
      "AYRI production kapısı: (1) migration apply (composite UNIQUE(tenant_id,id) + classification FK + archive & classification CDC trigger), (2) yh_source_activation_set('kisisel_arsiv:archives', true) — CODE ENABLED ≠ TRIGGER INSTALLED ≠ DB ACTIVATED. Row-gate indexer'a WIRED; kör backfill YASAK; mevcut kayıtlar OTOMATİK SAFE DEĞİL (yalnız yetkili review + hash eşleşmesi).",
    activationCohort: "row-gated-archive",
    rollbackBehavior:
      "yh_source_deactivate('kisisel_arsiv:archives') (kill-switch) → yeni olay işlenmez; existing index KORUNUR. Trigger drop güvenli. Row classification safe→unsafe/edit → sonraki event tombstone.",
    recommendation:
      "ROW_GATED_CONTROLLED: kaynak kod-enabled + row-gate WIRED ama production'da DB is_active=true olmadan NO-OP. YALNIZ safe-non-pii + server-türetimli current-hash geçen satır indexlenir; kör tenant backfill FAIL-CLOSED. Aktivasyon ayrı onay.",
  },

  // ── D) NUMEROLOJİ PROFESSIONAL (WAIT_FOR_CLEAN_RESET) — tenant test-data riski ──
  dormantPro(
    "numeroloji:sources",
    "Numeroloji",
    "numerology_sources",
    "column",
    "source-classification",
    "WAIT_FOR_CLEAN_RESET",
    "test-data",
    "blocked-test-data",
    "numerology-professional",
    "Tenant kaynakları büyük ölçüde satış-öncesi test verisidir → temiz reset (sistem-genel test-data temizliği) SONRASI FUTURE_ONLY_READY'ye yükseltilebilir; bu fazda aktive edilmez.",
    "WAIT_FOR_CLEAN_RESET: numerology_sources tenant-scoped bibliyografik kaynak; mevcut tenant verisi test riski taşır. Professional Cohort: CDC trigger + migration + harness HAZIR ANCAK registry enabled:false KORUNUR (ÇİFT KAPI: registry disabled + DB is_active=false). Yanlış DB flip'te bile enabled:false → işlenmez. Aktivasyon (enabled:true + is_active flip) temiz reset SONRASI AYRI ONAY. Kör future-event/backfill YASAK.",
    // triggerFeasibleNow: column + record + safe-non-pii → worker v1 kapsamında; teknik fizibl.
    true,
    // registryEnabled: DORMANT (enabled:false) KORUNUR — çift fail-closed kapı; runtime processing gate kapalı.
    false,
  ),
  dormantPro(
    "numeroloji:knowledge-entries",
    "Numeroloji",
    "numerology_knowledge_source_entries",
    "column",
    "source-classification",
    "WAIT_FOR_CLEAN_RESET",
    "test-data",
    "blocked-test-data",
    "numerology-professional",
    "Temiz reset sonrası FUTURE_ONLY_READY; bu fazda aktive edilmez.",
    "WAIT_FOR_CLEAN_RESET: uzman bilgi-kaydı notu (professional overlay) tenant-scoped; mevcut veri test riski. Professional Cohort: CDC trigger + migration + harness HAZIR ANCAK registry enabled:false KORUNUR (ÇİFT KAPI: registry disabled + DB is_active=false); aktivasyon temiz reset SONRASI AYRI ONAY. Backfill YASAK.",
    true,
    // registryEnabled: DORMANT (enabled:false) KORUNUR — çift fail-closed kapı; runtime processing gate kapalı.
    false,
  ),

  // ── C) YEBS (CANONICAL_BACKFILL_CANDIDATE) — global-canonical, published-only, TEST DEĞİL ──
  yebs("yebs:traditions", "yebs_traditions"),
  yebs("yebs:schools", "yebs_schools"),
  yebs("yebs:concepts", "yebs_concepts"),
  yebs("yebs:sources", "yebs_sources"),
  yebs("yebs:claims", "yebs_claims"),
  yebs("yebs:concept-relations", "yebs_concept_relations"),

  // ── BELGE / VİDEO: EMEKLİYE AYRILDI (ÜRÜN KARARI — NON_SOURCE) ──────────────────
  // belge_video:passages source registry'den (YH_INDEX_SOURCES) çıkarıldığından aktivasyon
  // matrisinde de YER ALMAZ (Yaşam Hafızası source DOMAIN'İ değil; Dijital İçerik işleme alanı
  // transient workspace). moduleSourceMatrix NOT_MEMORY_SOURCE + deferredSourceClosure
  // NOT_APPLICABLE ile tutarlı. Query/search/filter/CDC/backfill/reconcile source path YOK.

  // ── B) CLIENT SOURCES (FUTURE_ONLY_READY) — ayrı client index/RPC; test-data riski → kör backfill YASAK ──
  client("danisan:stones", "Danışan Taşı", "client_stones"),
  client("danisan:combinations", "Kombinasyon", "client_combinations"),
  client("danisan:sessions", "Seans", "client_sessions"),
  client("danisan:homeworks", "Ödev", "client_homeworks"),
  client("danisan:appointments", "Randevu", "appointments"),
  client("danisan:notes", "Not", "client_notes"),
] as const satisfies readonly ActivationMatrixEntry[];

export type ActivationMatrixSourceKey = (typeof YH_ACTIVATION_MATRIX)[number]["sourceKey"];

// ─── Fabrika yardımcıları (deklarasyon tekrarını azaltır; tip güvenli) ────────

function keepLive(
  sourceKey: string,
  module: string,
  sourceTable: string,
  tenantMode: ActivationTenantMode,
  rowGate: ActivationRowGate,
): ActivationMatrixEntry {
  return {
    sourceKey,
    module,
    scope: "professional",
    activationClass: "KEEP_LIVE",
    sourceTable,
    tenantMode,
    rowGate,
    registryEnabled: true,
    currentDataRisk: "none",
    futureEventEligible: true,
    backfillEligibility: "not-applicable",
    triggerFeasibleNow: tenantMode === "column",
    activationPrerequisite: "Yok (zaten CANLI). Mevcut aktivasyon davranışı DEĞİŞTİRİLMEZ.",
    activationCohort: "keep-live-professional",
    rollbackBehavior: KEEP_LIVE_ROLLBACK,
    recommendation:
      "KEEP_LIVE: Mevcut canlı professional bilgi/katalog kaynağı. Yeni aktivasyon kapısı bu kaynağı DEĞİŞTİRMEZ; regresyonla korunur.",
  };
}

/**
 * COHORT A CONTROLLED (FUTURE_ONLY_READY): keepLive'in eşi ancak grandfathered DEĞİL — CDC
 * trigger migration 20261004000000 ile WIRED, fakat production'da yh_source_activation.is_active=true
 * olmadan NO-OP (default OFF). registryEnabled:true TEK BAŞINA aktive etmez (çift kapı). Backfill
 * YASAK (blind bulk); yalnız INSERT/UPDATE/DELETE future-event current-state indexlenir.
 */
function controlled(
  sourceKey: string,
  module: string,
  sourceTable: string,
  tenantMode: ActivationTenantMode,
  rowGate: ActivationRowGate,
): ActivationMatrixEntry {
  return {
    sourceKey,
    module,
    scope: "professional",
    activationClass: "FUTURE_ONLY_READY",
    sourceTable,
    tenantMode,
    rowGate,
    registryEnabled: true,
    currentDataRisk: "none",
    futureEventEligible: true,
    backfillEligibility: "not-applicable",
    triggerFeasibleNow: true,
    activationPrerequisite:
      "AYRI production kapıları: (1) CDC trigger WIRED (migration 20261004000000; enqueue AKTİVASYON-KAPILI — is_active YOKSA sessiz NO-OP), (2) yh_source_activation_set(<sourceKey>, true) — CODE ENABLED ≠ TRIGGER INSTALLED ≠ DB ACTIVATED. Kaynak default OFF; kör backfill YASAK (yalnız future-event current-state).",
    activationCohort: "cohort-a-professional",
    rollbackBehavior: DORMANT_ROLLBACK,
    recommendation:
      "FUTURE_ONLY_READY (controlled): CDC trigger migration 20261004000000 ile WIRED ama production'da yh_source_activation.is_active=true olmadan NO-OP (default OFF). registryEnabled:true TEK BAŞINA aktive etmez (çift kapı: kod + DB flip). Backfill DEFAULT false (blind bulk YASAK); yalnız INSERT→upsert / UPDATE→refresh / DELETE→deindex future-event indexlenir. Aktivasyon ayrı production onayı.",
  };
}

/**
 * WORKER-V2 CONTROLLED (FUTURE_ONLY_READY): controlled()'un eşi ama worker-v2 capability kaynakları için
 * (shared-optional / section / parent-derived). CDC trigger migration 20261210000000 ile WIRED
 * (shared-aware + parent-side capture); production'da is_active=true olmadan NO-OP (default OFF).
 * Worker-v1 tarafından İŞLENEMEZ ama açık capability ile worker-v2 tarafından işlenir (eventProcessor
 * kapıları capability-gated). Backfill YASAK. capability kanıtı: sources.ts workerCapabilities + harness.
 */
function controlledV2(
  sourceKey: string,
  module: string,
  sourceTable: string,
  tenantMode: ActivationTenantMode,
  rowGate: ActivationRowGate,
): ActivationMatrixEntry {
  return {
    sourceKey,
    module,
    scope: "professional",
    activationClass: "FUTURE_ONLY_READY",
    sourceTable,
    tenantMode,
    rowGate,
    registryEnabled: true,
    currentDataRisk: "none",
    futureEventEligible: true,
    backfillEligibility: "not-applicable",
    triggerFeasibleNow: true,
    activationPrerequisite:
      "AYRI production kapıları: (1) Worker-v2 CDC trigger WIRED (migration 20261210000000; shared-aware + parent-side capture; enqueue AKTİVASYON-KAPILI — is_active YOKSA sessiz NO-OP), (2) yh_source_activation_set(<sourceKey>, true). Kaynak default OFF; kör backfill YASAK. Cascade/trigger-order EXACT doğrulaması production apply öncesi preflight gate'te (scripts/yh-worker-v2/preflight.sql).",
    activationCohort: "worker-v2-shared-section",
    rollbackBehavior: DORMANT_ROLLBACK,
    recommendation:
      "FUTURE_ONLY_READY (worker-v2 controlled): shared-optional / section / parent-derived kaynak; worker-v2 capability ile işlenir (eventProcessor capability-gated; worker-v1 GLOBAL gevşetmesi YOK). CDC trigger migration 20261210000000 ile WIRED ama production'da is_active=true olmadan NO-OP (default OFF). Backfill DEFAULT false; INSERT→upsert / UPDATE→refresh / DELETE→deindex (parent-side capture cascade-safe). Aktivasyon ayrı production onayı.",
  };
}

// DEFERRED_SHARED_WORKER_V2 sınıfı KORUNUR (ACTIVATION_CLASSES + policy + assessCohort) ancak Worker-v2
// (migration 20261210000000) 5 kaynağa capability verdiğinden ARTIK ÜYESİ YOKTUR (0 kaynak). Sınıf,
// gelecekte worker tarafından işlenemeyen yeni bir kaynak çıkarsa fail-closed disposition için rezerve.
// (Eski `deferredWorkerV2()` factory'si kaldırıldı; 5 kaynak controlledV2() ile READY.)

/**
 * PROFESSIONAL COHORT CONTROLLED (FUTURE_ONLY_READY): Aromaterapi Canonical V2 katalog + verified-method
 * için controlled()'un eşi; CDC trigger YENİ Professional Cohort migration'ı ile WIRED (generic
 * yh_cdc_enqueue: plant_taxa/preparations; yh_cdc_enqueue_method_series_v2: method — revizyon status
 * değişimi → series-keyed coalesce). Row-gate = status-eligibility (katalog verified|approved;
 * method verified). Tenant column + record → worker-v1 kapsamı; capability YOK. Backfill DEFAULT false.
 */
function professionalCohort(
  sourceKey: string,
  module: string,
  sourceTable: string,
): ActivationMatrixEntry {
  return {
    sourceKey,
    module,
    scope: "professional",
    activationClass: "FUTURE_ONLY_READY",
    sourceTable,
    tenantMode: "column",
    rowGate: "status-eligibility",
    registryEnabled: true,
    currentDataRisk: "none",
    futureEventEligible: true,
    backfillEligibility: "not-applicable",
    triggerFeasibleNow: true,
    activationPrerequisite:
      "AYRI production kapıları: (1) Professional Cohort CDC trigger WIRED (yeni migration; enqueue AKTİVASYON-KAPILI — is_active YOKSA sessiz NO-OP; method = revizyon status→series-keyed coalesce), (2) yh_source_activation_set(<sourceKey>, true). Kaynak default OFF; kör backfill YASAK (yalnız future-event current-state).",
    activationCohort: "professional-cohort",
    rollbackBehavior: DORMANT_ROLLBACK,
    recommendation:
      "FUTURE_ONLY_READY (professional cohort): tenant-scoped katalog/method kaynağı; worker-v1 kapsamında. Katalog current = status ∈ {verified, approved}; method current = seri için status='verified' TEK revizyon (worker işleme anında source-of-truth'tan çözer; series identity → duplicate yok, verified yoksa deindex). CDC trigger WIRED ama production'da is_active=true olmadan NO-OP (default OFF). Backfill DEFAULT false. Aktivasyon ayrı production onayı.",
  };
}

function dormantPro(
  sourceKey: string,
  module: string,
  sourceTable: string,
  tenantMode: ActivationTenantMode,
  rowGate: ActivationRowGate,
  activationClass: ActivationClass,
  currentDataRisk: CurrentDataRisk,
  backfillEligibility: BackfillEligibility,
  activationCohort: string,
  activationPrerequisite: string,
  recommendation: string,
  triggerFeasibleNow: boolean,
  // Professional Cohort: kod-enabled olabilir (registry enabled:true) FAKAT disposition
  // WAIT_FOR_CLEAN_RESET korunur + DB is_active=false → production OFF. registryEnabled matris ↔
  // registry `enabled` BİREBİR eşleşmeli (validateActivationMatrix drift kapısı).
  registryEnabled: boolean,
): ActivationMatrixEntry {
  return {
    sourceKey,
    module,
    scope: "professional",
    activationClass,
    sourceTable,
    tenantMode,
    rowGate,
    registryEnabled,
    currentDataRisk,
    futureEventEligible: true,
    backfillEligibility,
    triggerFeasibleNow,
    activationPrerequisite,
    activationCohort,
    rollbackBehavior: DORMANT_ROLLBACK,
    recommendation,
  };
}

function yebs(sourceKey: string, sourceTable: string): ActivationMatrixEntry {
  return {
    sourceKey,
    module: "YEBS",
    scope: "professional",
    activationClass: "CANONICAL_BACKFILL_CANDIDATE",
    sourceTable,
    tenantMode: "global-canonical",
    rowGate: "status-eligibility",
    registryEnabled: false,
    currentDataRisk: "none",
    futureEventEligible: true,
    backfillEligibility: "candidate-with-approval",
    // Global-canonical + published-only; ancak outbox tenant_id NOT NULL + worker v1 (column-only)
    // kapsamı bu tenant modunu HENÜZ desteklemez → trigger/worker genişletmesi önkoşuldur.
    triggerFeasibleNow: false,
    activationPrerequisite:
      "BF-11E: enabled:true + reader global-canonical status filtresi + outbox/worker global-canonical (tenant NULL) kapsam genişletmesi + kontrollü index/reconcile. " + SEP_APPROVAL,
    activationCohort: "yebs-canonical",
    rollbackBehavior: DORMANT_ROLLBACK,
    recommendation:
      "CANONICAL_BACKFILL_CANDIDATE: YEBS global-canonical, published-only kaynak (tenant-siz; test-tenant verisi DEĞİL). Backfill YALNIZ published satırlar için, preflight + AYRI ONAY ile yapılabilir. published→archived/ineligible değişiminde tombstone/delete zorunlu. Synthetic tenant YOK. Bu turda backfill YAPILMAZ.",
  };
}

function client(sourceKey: string, module: string, sourceTable: string): ActivationMatrixEntry {
  return {
    sourceKey,
    module,
    scope: "client",
    activationClass: "FUTURE_ONLY_READY",
    sourceTable,
    tenantMode: "column",
    rowGate: "pii-denylist",
    registryEnabled: true,
    currentDataRisk: "test-data",
    futureEventEligible: true,
    backfillEligibility: "blocked-test-data",
    triggerFeasibleNow: false,
    activationPrerequisite:
      "BF-11E: enabled:true + client index (yasam_hafizasi_client_index) worker/CDC kapsamı + doğrudan-kimlik denylist enforcement + kontrollü index. Mevcut client verisi test-data riski → kör backfill YASAK. " + SEP_APPROVAL,
    activationCohort: "client-memory",
    rollbackBehavior: DORMANT_ROLLBACK,
    recommendation:
      "FUTURE_ONLY_READY (client): AYRI PRIVATE/SENSITIVE client index/RPC (professional havuzuna GİRMEZ). Private Memory Politika Kilidi: klinik serbest metin ARANABİLİR; yalnız doğrudan kimlik/iletişim kolonları (ad-soyad/telefon/adres/e-posta/doğum) denylist; güvenlik authorization'a dayanır (tenant+client fail-closed), danışan adı index'e kopyalanmaz. Foundation hazırlanabilir ama merge production'da OTOMATİK index üretmez; mevcut test-tenant verisi backfill EDİLMEZ; production aktivasyonu ayrı onay.",
  };
}

// ─── Türetimler (activationState köprüsü) ─────────────────────────────────────

/** Matris entry'sini processing/backfill gate'lerinin beklediği `desired` görünümüne indirger. */
export function toDesired(entry: ActivationMatrixEntry): SourceActivationDesired {
  return {
    sourceKey: entry.sourceKey,
    scope: entry.scope,
    activationClass: entry.activationClass,
    registryEnabled: entry.registryEnabled,
  };
}

/** Belirli bir sınıftaki tüm kaynak anahtarları. */
export function sourceKeysByClass(activationClass: ActivationClass): string[] {
  return YH_ACTIVATION_MATRIX.filter((e) => e.activationClass === activationClass).map((e) => e.sourceKey);
}

const MATRIX_BY_KEY: ReadonlyMap<string, ActivationMatrixEntry> = new Map(
  YH_ACTIVATION_MATRIX.map((e) => [e.sourceKey, e] as const),
);

/** sourceKey → matris entry (yoksa undefined). */
export function activationEntryOf(sourceKey: string): ActivationMatrixEntry | undefined {
  return MATRIX_BY_KEY.get(sourceKey);
}

/**
 * PURE processing kararı: matris entry + runtime DB görüntüsü → processing aktif mi
 * (evaluateProcessingGate). DB erişimi YOK (harness + server-only runtime gate ortak kullanır).
 * Bilinmeyen/matris-dışı key → FAIL-CLOSED false.
 */
export function resolveProcessingActive(
  sourceKey: string,
  runtime: SourceActivationRuntime | null,
): boolean {
  const entry = MATRIX_BY_KEY.get(sourceKey);
  if (entry === undefined) return false;
  return evaluateProcessingGate(toDesired(entry), runtime).active;
}

// ─── BF-11E COHORT DIZILIMI (kaynak-başına aktivasyon kohortu; türetilmiş) ─────
//
// Cohort-1 = "runtime activation gate wired sonrası, kod önkoşulları çözülünce ilk
// güvenli aktive edilebilecek kaynaklar". Kohort ataması matris alanlarından TÜRETİLİR
// (ayrı elle senkronlanan alan drift'i YOK). Bu turda HİÇBİR kaynak production'da
// aktive edilmez; kohort yalnız disposition + kalan exact kod önkoşuludur (readyGap).

export type CohortDisposition =
  | "KEEP_LIVE" // grandfathered CANLI; kohort kavramı dışı (davranış değişmez)
  | "COHORT_1_BLOCKED" // Cohort-1 adayı; aktivasyon için exact kod önkoşulu var
  | "COHORT_1_READY" // kod önkoşulları ÇÖZÜLDÜ (row-gate WIRED); yalnız production trigger apply + activation kaldı
  | "WAIT_FOR_CLEAN_RESET" // mevcut production verisi test-data riski → temiz reset öncesi aktive edilmez
  | "COHORT_2" // canonical/client; ayrı worker/CDC genişletmesi gerektiren sonraki faz
  | "DEFERRED_SHARED_WORKER_V2" // worker v1 kaynağı işleyemez (shared/global tenant VEYA non-record unit); worker v2 kohortu
  | "DEFERRED_HARD_BLOCKER"; // güvenli ownership yok (matriste registry kaydı da yok)

export interface CohortAssessment {
  readonly cohort: CohortDisposition;
  /** Aktivasyon için kalan exact kod/altyapı önkoşulu ("" = KEEP_LIVE, önkoşul yok). */
  readonly readyGap: string;
}

/**
 * Bir kaynağın kohort dispozisyonunu matris alanlarından FAIL-CLOSED türetir.
 * Bu turda hiçbir kaynak "hazır (gap yok)" değildir: worker CDC exact-write yolu YALNIZ
 * column-tenant + record destekler (indexer/indexSourcePage runExactRecord), dolayısıyla
 * join/row (belge_video), global-canonical (YEBS) ve client-index (danisan:*) kaynakları
 * ek indexer/worker genişletmesi ister; numeroloji professional test-data reset bekler.
 */
export function assessCohort(entry: ActivationMatrixEntry): CohortAssessment {
  switch (entry.activationClass) {
    case "KEEP_LIVE":
      return { cohort: "KEEP_LIVE", readyGap: "" };
    case "ROW_GATED_READY":
      return {
        cohort: "COHORT_1_BLOCKED",
        readyGap:
          "row-level classification gate (isArchiveRowIndexable) runtime indexer'a bağlı DEĞİL + " +
          "personal_archives mevcut PII verisi → source-level safe-non-pii + row-gate wiring önkoşulu.",
      };
    case "ROW_GATED_CONTROLLED":
      // Kod önkoşulları çözüldü: row-gate runExactRecord'a WIRED (requiresRowEligibilityGate),
      // server-türetimli hash (unit.contentHash), backfill-deny, classification/archive CDC.
      // Kalan yalnız AYRI production kapıları: migration apply + trigger + is_active flip.
      return { cohort: "COHORT_1_READY", readyGap: "" };
    case "CANONICAL_BACKFILL_CANDIDATE":
      return {
        cohort: "COHORT_2",
        readyGap:
          "global-canonical worker/exact-write desteği (outbox tenant_id NOT NULL + runExactRecord " +
          "column-only) + published→ineligible tombstone; ayrı kohort.",
      };
    case "WAIT_FOR_CLEAN_RESET":
      return { cohort: "WAIT_FOR_CLEAN_RESET", readyGap: "sistem-genel test-data temiz reset (mevcut tenant verisi risk)." };
    case "DEFERRED_SHARED_WORKER_V2":
      // Worker v1 (eventProcessor) bu kaynağı hiç işleyemez (shared/global tenant VEYA non-record unit).
      // Cohort A'da trigger BAĞLANMAZ; aktivasyona hazır DEĞİL → ayrı worker v2 kohortu (readyGap dolu).
      return {
        cohort: "DEFERRED_SHARED_WORKER_V2",
        readyGap:
          "worker v2: shared/global tenant (outbox tenant_id NULL + allowShared) VEYA non-record (section) unit " +
          "desteği + doğru CDC/update/delete/deindex; ayrı kohort.",
      };
    case "FUTURE_ONLY_READY":
      // COHORT A PROFESSIONAL: kod önkoşulları ÇÖZÜLDÜ (registry + matris + CDC trigger WIRED
      // migration 20261004000000). Kalan yalnız AYRI production kapıları: trigger apply + is_active
      // flip → COHORT_1_READY (readyGap boş; belge_video ÜRÜN KARARIYLA NON_SOURCE, matriste yok).
      if (entry.scope === "professional") {
        return { cohort: "COHORT_1_READY", readyGap: "" };
      }
      // CLIENT: ayrı client index (yasam_hafizasi_client_index) worker/CDC pipeline gerektirir.
      return {
        cohort: "COHORT_2",
        readyGap:
          "client index (yasam_hafizasi_client_index) worker/CDC pipeline: outbox client_id taşımıyor + " +
          "runExactUpsert client-index hedefi yok → ayrı kohort.",
      };
    case "DEFERRED_HARD_BLOCKER":
      return { cohort: "DEFERRED_HARD_BLOCKER", readyGap: "güvenli client-owned entity yok (registry kaydı da yok)." };
    default:
      return { cohort: "COHORT_2", readyGap: "bilinmeyen sınıf → fail-closed." };
  }
}

/** Belirli kohort dispozisyonundaki kaynak anahtarları. */
export function sourceKeysByCohort(cohort: CohortDisposition): string[] {
  return YH_ACTIVATION_MATRIX.filter((e) => assessCohort(e).cohort === cohort).map((e) => e.sourceKey);
}

// ─── Bütünlük doğrulaması (import-zamanı güvenlik + harness) ──────────────────

/**
 * eventProcessor (worker v1) Kapı 5/6/7'nin SAF aynası: bir registry kaynağı worker v1 tarafından
 * exact-record CDC ile işlenebilir mi. (Kapı 5) tenant modeli column|join, (Kapı 6) allowSharedNull
 * DEĞİL, (Kapı 7) unit record|row. Herhangi biri sağlanmazsa worker v1 permanent reject → DEFERRED.
 * Bu SAF ayna import-zamanı invariant içindir; harness ayrıca GERÇEK processOutboxEvent ile kanıtlar.
 */
function isWorkerV1ProcessableConfig(src: (typeof YH_INDEX_SOURCES)[number]): boolean {
  const t = src.tenant;
  const allowShared = (t as { allowSharedNull?: boolean }).allowSharedNull === true;
  const tenantOk = (t.mode === "column" || t.mode === "join") && !allowShared;
  const unitOk = src.unit === "record" || src.unit === "row";
  return tenantOk && unitOk;
}

/**
 * WORKER-V2 kapsamı: shared-optional / section / parent-derived kaynak, açık capability ile worker-v2
 * (capability-gated eventProcessor) tarafından işlenir. Worker-v2-processable = column|join tenant modeli
 * VE en az bir worker capability (shared-optional-professional / section-unit / parent-derived-scope).
 * global-canonical worker-v2 kapsamında DEĞİL (YEBS ayrı kohort).
 */
function isWorkerV2ProcessableConfig(src: (typeof YH_INDEX_SOURCES)[number]): boolean {
  if (src.tenant.mode !== "column" && src.tenant.mode !== "join") return false;
  return (
    hasWorkerCapability(src, "shared-optional-professional") ||
    hasWorkerCapability(src, "section-unit") ||
    hasWorkerCapability(src, "parent-derived-scope")
  );
}

/** Worker (v1 VEYA v2 capability) tarafından işlenebilir mi (readiness invariant çekirdeği). */
function isWorkerProcessableConfig(src: (typeof YH_INDEX_SOURCES)[number]): boolean {
  return isWorkerV1ProcessableConfig(src) || isWorkerV2ProcessableConfig(src);
}

const KNOWN_TENANT_MODES: readonly ActivationTenantMode[] = ["column", "join", "global-canonical"];
const KNOWN_ROW_GATES: readonly ActivationRowGate[] = [
  "none", "source-classification", "status-eligibility", "row-classification", "row-classification-hash", "pii-denylist",
];

/**
 * Aktivasyon matrisini registry'lere karşı FAIL-CLOSED doğrular. Fırlatırsa deploy'dan
 * ÖNCE (harness/compile) yakalanır. Kapsam:
 *   - Her sourceKey GERÇEK registry üyesi (professional/client); uydurma YOK.
 *   - Her registry kaynağı TAM BİR KEZ kapsanır (eksik/tekrar YOK).
 *   - registryEnabled ↔ registry.enabled BİREBİR (drift YOK).
 *   - scope ↔ hangi registry'de bulunduğu tutarlı.
 *   - Geçerli sınıf/tenant-mode/row-gate.
 *   - Sınıf-seviyesi invaryantlar (KEEP_LIVE enabled:true, DEFERRED_HARD_BLOCKER matriste YOK,
 *     backfill yalnız candidate-with-approval + CANONICAL_BACKFILL_CANDIDATE).
 */
export function validateActivationMatrix(): void {
  const proByKey = new Map<string, (typeof YH_INDEX_SOURCES)[number]>(YH_INDEX_SOURCES.map((s) => [s.sourceKey, s]));
  const cliByKey = new Map<string, (typeof YH_CLIENT_INDEX_SOURCES)[number]>(YH_CLIENT_INDEX_SOURCES.map((s) => [s.sourceKey, s]));
  const seen = new Set<string>();

  for (const e of YH_ACTIVATION_MATRIX) {
    if (seen.has(e.sourceKey)) throw new Error(`Aktivasyon matrisi kaynak tekrarı: ${e.sourceKey}`);
    seen.add(e.sourceKey);

    if (!isActivationClass(e.activationClass)) {
      throw new Error(`Geçersiz aktivasyon sınıfı: ${e.sourceKey} → ${e.activationClass}`);
    }
    if (e.activationClass === "DEFERRED_HARD_BLOCKER") {
      // DEFERRED_HARD_BLOCKER kaynağın registry'de KAYDI OLMAMALI → matriste de yer almaz.
      throw new Error(`DEFERRED_HARD_BLOCKER matriste kaynak taşıyamaz: ${e.sourceKey}`);
    }
    if (e.activationClass === "DEFERRED_SHARED_WORKER_V2" && e.scope !== "professional") {
      // Worker v1 shared/non-record deferral yalnız professional index kaynaklarına aittir.
      throw new Error(`DEFERRED_SHARED_WORKER_V2 yalnız professional olabilir: ${e.sourceKey}`);
    }
    if (!KNOWN_TENANT_MODES.includes(e.tenantMode)) {
      throw new Error(`Geçersiz tenant modu: ${e.sourceKey} → ${e.tenantMode}`);
    }
    if (!KNOWN_ROW_GATES.includes(e.rowGate)) {
      throw new Error(`Geçersiz row-gate: ${e.sourceKey} → ${e.rowGate}`);
    }

    // Scope ↔ registry tutarlılığı + registryEnabled drift kontrolü.
    if (e.scope === "professional") {
      const src = proByKey.get(e.sourceKey);
      if (!src) throw new Error(`Bilinmeyen professional sourceKey: ${e.sourceKey}`);
      if (src.tableName !== e.sourceTable) {
        throw new Error(`Tablo uyuşmazlığı: ${e.sourceKey} (${e.sourceTable} ≠ ${src.tableName})`);
      }
      if (src.enabled !== e.registryEnabled) {
        throw new Error(`registryEnabled drift: ${e.sourceKey} (matris ${e.registryEnabled} ≠ registry ${src.enabled})`);
      }
      // WORKER-V1 PARİTE İNVARYANTI (code=runtime): FUTURE_ONLY_READY professional kaynak worker v1
      // tarafından GERÇEKTEN işlenebilir olmalı; DEFERRED_SHARED_WORKER_V2 kaynak GERÇEKTEN işlenemez
      // olmalı (aksi = yanlış readiness/defer iddiası). eventProcessor Kapı 5/6/7 aynası.
      // WORKER PARİTE İNVARYANTI (code=runtime): FUTURE_ONLY_READY professional kaynak worker (v1 VEYA
      // v2 capability) tarafından GERÇEKTEN işlenebilir olmalı; DEFERRED_SHARED_WORKER_V2 kaynak hâlâ
      // işlenemez olmalı (worker-v2 capability atanmışsa READY'ye taşınmalıydı).
      if (e.activationClass === "FUTURE_ONLY_READY" && !isWorkerProcessableConfig(src)) {
        throw new Error(`FUTURE_ONLY_READY ama worker (v1/v2) işleyemez: ${e.sourceKey}`);
      }
      if (e.activationClass === "DEFERRED_SHARED_WORKER_V2" && isWorkerProcessableConfig(src)) {
        throw new Error(`DEFERRED_SHARED_WORKER_V2 ama worker işleyebilir (capability ile READY olmalı): ${e.sourceKey}`);
      }
    } else {
      const src = cliByKey.get(e.sourceKey);
      if (!src) throw new Error(`Bilinmeyen client sourceKey: ${e.sourceKey}`);
      if (src.tableName !== e.sourceTable) {
        throw new Error(`Tablo uyuşmazlığı: ${e.sourceKey} (${e.sourceTable} ≠ ${src.tableName})`);
      }
      if (src.enabled !== e.registryEnabled) {
        throw new Error(`registryEnabled drift (client): ${e.sourceKey} (matris ${e.registryEnabled} ≠ registry ${src.enabled})`);
      }
    }

    // Sınıf-seviyesi invaryantlar.
    const policy = ACTIVATION_CLASS_POLICY[e.activationClass];
    if (e.activationClass === "KEEP_LIVE" && e.registryEnabled !== true) {
      throw new Error(`KEEP_LIVE registry enabled:true olmalı: ${e.sourceKey}`);
    }
    // Backfill: yalnız backfill-eligible sınıf 'candidate-with-approval' olabilir; aksi YASAK.
    if (e.backfillEligibility === "candidate-with-approval" && !policy.backfillEligible) {
      throw new Error(`Backfill aday sınıfı değil: ${e.sourceKey} → ${e.activationClass}`);
    }
    if (policy.backfillEligible && e.backfillEligibility !== "candidate-with-approval") {
      throw new Error(`Backfill-eligible sınıf 'candidate-with-approval' beklenir: ${e.sourceKey}`);
    }
  }

  // Kapsama bütünlüğü: HER registry kaynağı TAM BİR KEZ kapsanmalı (sessiz atlama YOK).
  for (const s of YH_INDEX_SOURCES) {
    if (!seen.has(s.sourceKey)) throw new Error(`Kapsanmayan professional kaynak: ${s.sourceKey}`);
  }
  for (const s of YH_CLIENT_INDEX_SOURCES) {
    if (!seen.has(s.sourceKey)) throw new Error(`Kapsanmayan client kaynak: ${s.sourceKey}`);
  }
}
