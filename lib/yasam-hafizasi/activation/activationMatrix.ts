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

import { YH_INDEX_SOURCES } from "../indexer/sources";
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
  // ── A) EXISTING LIVE PROFESSIONAL (KEEP_LIVE) — mevcut 16 canlı; davranış DEĞİŞMEZ ──
  keepLive("refleksoloji:protocols", "Refleksoloji", "reflexology_protocols", "column", "source-classification"),
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
  keepLive("sifa_rehberi:guides", "Şifa Rehberi", "healing_guides", "column", "source-classification"),
  keepLive("sifa_rehberi:guide-sections", "Şifa Rehberi", "healing_guide_sections", "join", "source-classification"),
  keepLive("biyoenerji:subconscious-causes", "Biyoenerji", "bioenergy_subconscious_causes", "column", "source-classification"),
  keepLive("biyoenerji:symbols", "Biyoenerji", "bioenergy_symbols", "column", "source-classification"),
  keepLive("biyoenerji:chakras", "Biyoenerji", "bioenergy_chakras", "column", "source-classification"),
  keepLive("biyoenerji:imaginations", "Biyoenerji", "bioenergy_imaginations", "column", "source-classification"),
  keepLive("dogaltas:stones", "Doğaltaş", "stones", "column", "source-classification"),
  keepLive("dogaltas:minerals", "Doğaltaş / Mineral Bankası", "minerals", "column", "source-classification"),
  keepLive("dogaltas:knowledge", "Doğaltaş", "stone_knowledge_articles", "column", "source-classification"),
  keepLive("dogaltas:combinations", "Doğaltaş", "combinations", "column", "source-classification"),
  keepLive("aromaterapi:oils", "Aromaterapi", "aromatherapy_oils", "column", "source-classification"),
  keepLive("aromaterapi:reference-sheets", "Aromaterapi", "aromatherapy_reference_sheets", "column", "source-classification"),
  keepLive("aromaterapi:reference-rows", "Aromaterapi", "aromatherapy_reference_rows", "join", "source-classification"),
  keepLive("aromaterapi:blends", "Aromaterapi", "aromatherapy_blends", "column", "source-classification"),

  // ── E) KİŞİSEL ARŞİV (ROW_GATED_READY) — enabled:true ama unclassified → fail-closed ──
  {
    sourceKey: "kisisel_arsiv:archives",
    module: "Kişisel Arşiv",
    scope: "professional",
    activationClass: "ROW_GATED_READY",
    sourceTable: "personal_archives",
    tenantMode: "column",
    rowGate: "row-classification-hash",
    registryEnabled: true,
    currentDataRisk: "pii-freeform",
    futureEventEligible: true,
    backfillEligibility: "blocked-pii",
    triggerFeasibleNow: false,
    activationPrerequisite:
      "Row-level classification gate'inin indexer'a bağlanması (safe-non-pii + current reviewed hash). Production yh_archive_classifications şu an 0 satır → mevcut kayıtlar OTOMATİK SAFE DEĞİL.",
    activationCohort: "row-gated-archive",
    rollbackBehavior:
      "Mevcut kaynak (enabled:true) fail-closed KORUNUR: classification=unclassified → index no-op. Rollback = classification satırlarını safe-non-pii yapmayı durdurmak; index satırları korunur.",
    recommendation:
      "ROW_GATED_READY: Kaynak canlı ama YALNIZ safe-non-pii + current-hash geçen satır indexlenebilir. Mevcut unclassified kayıtlar (0 classification satırı) index ÜRETMEZ; kör backfill YASAK.",
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
    "WAIT_FOR_CLEAN_RESET: numerology_sources tenant-scoped bibliyografik kaynak; mevcut tenant verisi test riski taşır. Trigger fizibl ama kör future-event bile test-tenant kayıtlarını indexler → temiz reset beklenir. Backfill YASAK.",
    // triggerFeasibleNow: column + record + safe-non-pii → worker v1 kapsamında; teknik fizibl.
    true,
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
    "WAIT_FOR_CLEAN_RESET: uzman bilgi-kaydı notu (professional overlay) tenant-scoped; mevcut veri test riski. Backfill YASAK; kör future-event bile temiz reset öncesi açılmaz.",
    true,
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
  client("danisan:hd-charts", "Human Design", "human_design_charts"),
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
): ActivationMatrixEntry {
  return {
    sourceKey,
    module,
    scope: "professional",
    activationClass,
    sourceTable,
    tenantMode,
    rowGate,
    registryEnabled: false,
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
    registryEnabled: false,
    currentDataRisk: "test-data",
    futureEventEligible: true,
    backfillEligibility: "blocked-test-data",
    triggerFeasibleNow: false,
    activationPrerequisite:
      "BF-11E: enabled:true + client index (yasam_hafizasi_client_index) worker/CDC kapsamı + PII denylist enforcement + kontrollü index. Mevcut client verisi test-data riski → kör backfill YASAK. " + SEP_APPROVAL,
    activationCohort: "client-memory",
    rollbackBehavior: DORMANT_ROLLBACK,
    recommendation:
      "FUTURE_ONLY_READY (client): AYRI client index/RPC (professional havuzuna GİRMEZ). Yalnız PII'siz kod/etiket/tarih; serbest metin/isim denylist. Foundation hazırlanabilir ama merge production'da OTOMATİK index üretmez; mevcut test-tenant verisi backfill EDİLMEZ; production aktivasyonu ayrı onay.",
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
  | "WAIT_FOR_CLEAN_RESET" // mevcut production verisi test-data riski → temiz reset öncesi aktive edilmez
  | "COHORT_2" // canonical/client; ayrı worker/CDC genişletmesi gerektiren sonraki faz
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
    case "CANONICAL_BACKFILL_CANDIDATE":
      return {
        cohort: "COHORT_2",
        readyGap:
          "global-canonical worker/exact-write desteği (outbox tenant_id NOT NULL + runExactRecord " +
          "column-only) + published→ineligible tombstone; ayrı kohort.",
      };
    case "WAIT_FOR_CLEAN_RESET":
      return { cohort: "WAIT_FOR_CLEAN_RESET", readyGap: "sistem-genel test-data temiz reset (mevcut tenant verisi risk)." };
    case "FUTURE_ONLY_READY":
      // NOT: belge_video:passages (tek professional FUTURE_ONLY_READY adayı) ÜRÜN KARARIYLA
      //   source registry/matrix'ten çıkarıldı (NON_SOURCE) → geriye yalnız client kaynaklar kalır.
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
