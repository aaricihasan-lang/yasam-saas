/**
 * YAŞAM HAFIZASI™ — BF-11E KİŞİSEL ARŞİV CONTROLLED SOURCE HAZIRLIK DEĞERLENDİRMESİ
 * (MACHINE-READABLE; MERGE-SAFE; SALT BİLDİRİM + CANLI-KOD KİLİDİ).
 * =============================================================================
 *
 * `kisisel_arsiv:archives` kaynağının Yaşam Hafızası için controlled-source olarak
 * durumu. NİHAİ SONUÇ: DISPOSITION = "READY" (kod/config graduation TAMAM), PRODUCT_FIT =
 * "PASS". Dört güvenlik ön-koşulu çözüldü:
 *   A. row-gated source capability (requiresRowEligibilityGate) → kör backfill FAIL-CLOSED,
 *   B. row-gate runExactRecord chokepoint'ine WIRED (tek otorite; event + reconcile bypass yok),
 *   C. server-türetimli canonical hash = buildIndexUnit().contentHash (client hash authoritative DEĞİL),
 *   D. classification/archive CDC → archive source identity event.
 *
 * PRODUCTION'DA HÂLÂ OFF: ROW_GATED_CONTROLLED (requiresRuntimeActivation=true) → DB is_active
 * olmadan hiçbir olay indexlemez (CODE ENABLED ≠ TRIGGER INSTALLED ≠ DB ACTIVATED ≠ BACKFILL).
 *
 * MERGE-SAFE: Bu dosya SALT BİLDİRİMDİR. Import/merge edilmesi hiçbir kaynağı aktive etmez,
 * hiçbir trigger kurmaz, hiçbir olay üretmez, production'a dokunmaz.
 *
 * NEDEN KOD (CANLI-KOD GÜVENLİK KİLİDİ): `validatePersonalArchiveReadiness()`, READY iken
 * kaynağın güvenlik-eşleşmesini (safety coupling) CANLI kodda ZORLAR: source-level 'safe-non-pii'
 * YALNIZ requiresRowEligibilityGate=true + supportsTenantScopedPage=false + ROW_GATED_CONTROLLED
 * (controlled activation) ile BİRLİKTE bulunabilir. Biri ileride row-gate'i kaldırır ya da
 * backfill'i açarsa (safe-non-pii'yi gate'siz bırakırsa) bu kilit harness/CI'da PATLAR → sessiz
 * PII/backfill regresyonu imkânsızlaşır.
 */

import { YH_INDEX_SOURCES, type SourceConfig } from "../indexer/sources";
import { evaluateSourceGuard } from "../indexer/sourceGuard";
import { supportsTenantScopedPage } from "../indexer/tenantScopeGate";
import { isArchiveRowIndexable } from "../archive/archiveClassificationRequest";
import { activationEntryOf, assessCohort } from "./activationMatrix";
import { ACTIVATION_CLASS_POLICY, isActivationClass } from "./activationState";
import { YH_DEFERRED_SOURCE_CLOSURE } from "../deferredSourceClosure";

/** Değerlendirilen tek kaynak. */
export const PERSONAL_ARCHIVE_SOURCE_KEY = "kisisel_arsiv:archives" as const;

/** Nihai hazırlık dispozisyonu. */
export type ReadinessDisposition = "BLOCKED" | "READY";

/** Ürün-uygunluğu sonucu (§24). */
export type ProductFit = "PASS" | "PASS_IN_PRINCIPLE" | "BLOCKED";

/** Çözülen güvenlik ön-koşulu (READY: hepsi satisfied). */
export interface ReadinessPrecondition {
  readonly id: string;
  readonly title: string;
  /** Nasıl çözüldüğü (exact kod kanıtı). */
  readonly resolution: string;
  /** READY iken true. */
  readonly satisfied: boolean;
}

export interface PersonalArchiveReadiness {
  readonly sourceKey: string;
  readonly disposition: ReadinessDisposition;
  readonly productFit: ProductFit;
  readonly productDecision: string;
  readonly preconditions: readonly ReadinessPrecondition[];
  /** DISPOSITION=READY iken CANLI kodda tutulması ZORUNLU güvenlik-eşleşme invaryantları. */
  readonly lockedInvariants: readonly string[];
  /** Bu turda KESİN yapılmayanlar (production/risk kapıları). */
  readonly notDoneThisTurn: readonly string[];
  /** Aktivasyona giden bir sonraki gerçek risk kapısı (bu paket dışında). */
  readonly nextRiskGate: string;
}

export const PERSONAL_ARCHIVE_READINESS: PersonalArchiveReadiness = {
  sourceKey: PERSONAL_ARCHIVE_SOURCE_KEY,
  disposition: "READY",
  productFit: "PASS",
  productDecision:
    "Kişisel Arşiv KALICI kişisel/profesyonel depodur → meşru controlled Yaşam Hafızası source'u. " +
    "Otomatik safe YAPILMAZ: yalnız yetkili review ile safe-non-pii + server-türetimli current-hash " +
    "geçen kayıt indexlenir. Güvenlik source-level flip'e DEĞİL, satır-bazlı row-gate'e dayanır; " +
    "production'da controlled activation (DB is_active) olmadan NO-OP.",
  preconditions: [
    {
      id: "A-source-classification-coupling",
      title: "Source-classification flip artık kör backfill açmıyor",
      resolution:
        "requiresRowEligibilityGate=true source capability eklendi; supportsTenantScopedPage bu " +
        "bayrağı taşıyan kaynağı source-level 'safe-non-pii' olsa DAHİ FAIL-CLOSED reddeder → kör " +
        "tenant-scoped backfill KAPALI. safe-non-pii ile gate atomik olarak birlikte geldi.",
      satisfied: true,
    },
    {
      id: "B-runtime-row-gate-wired",
      title: "row-classification-hash gate runExactRecord'a WIRED (tek otorite)",
      resolution:
        "archiveEligibility portu + decideArchiveEligibility runExactRecord chokepoint'ine bağlandı; " +
        "event + reconcile-apply aynı worker exact yolundan geçer (bypass yok). Port yok/DB hatası → " +
        "fail-closed transient (iyi veri tombstone EDİLMEZ); missing/unsafe/stale → row-ineligible → tombstone.",
      satisfied: true,
    },
    {
      id: "C-server-hash-contract",
      title: "Server-türetimli canonical hash uygulandı; client hash authoritative değil",
      resolution:
        "reviewed_content_hash artık classification route'ta SERVER tarafından buildIndexUnit().contentHash " +
        "ile türetilir (index'lenen canonical yüzey: title/note/category/tags). Request'ten client hash " +
        "KALDIRILDI; gönderilse IGNORE. İçerik değişince hash değişir → sonraki review şart (stale tombstone).",
      satisfied: true,
    },
    {
      id: "D-classification-mutation-cdc",
      title: "Classification/archive CDC → archive source identity event",
      resolution:
        "Migration: personal_archives'a generic yh_cdc_enqueue('kisisel_arsiv:archives','personal_archives') " +
        "trigger + yh_archive_classifications'a source-özel yh_cdc_enqueue_archive_classification() " +
        "(source_id=archive_id, tenant_id=classification.tenant_id, op=upsert reevaluate). Aynı outbox " +
        "identity (source_key, archive_id) idempotent; ham içerik/PII payload YOK. Activation-gated.",
      satisfied: true,
    },
  ],
  lockedInvariants: [
    "kisisel_arsiv:archives classification === 'safe-non-pii' ⟹ requiresRowEligibilityGate === true (güvenlik-eşleşme).",
    "supportsTenantScopedPage(kisisel_arsiv:archives) === false (kör tenant-scoped backfill FAIL-CLOSED).",
    "evaluateSourceGuard(kisisel_arsiv:archives).indexable === true (safe-non-pii + enabled; kaynak erişilebilir, satır row-gate'e tabi).",
    "activation class === 'ROW_GATED_CONTROLLED' ve requiresRuntimeActivation === true (default OFF; DB is_active ZORUNLU).",
    "cohort === 'COHORT_1_READY' (kod-ready; production trigger apply + activation ayrı kapı).",
    "deferred closure (kisisel_arsiv_classification) === 'FOUNDATION_READY'.",
    "isArchiveRowIndexable yalnız safe-non-pii + eşleşen current hash → true; aksi hepsi false.",
  ],
  notDoneThisTurn: [
    "production migration apply YOK (UNIQUE(tenant_id,id) + classification FK + 2 CDC trigger).",
    "production trigger attach YOK; is_active=true YOK; backfill YOK; reconcile YOK.",
    "production connection/mutation YOK; test verisi indexlenmedi.",
    "mevcut archive kayıtları OTOMATİK safe YAPILMADI (yalnız yetkili review + hash).",
  ],
  nextRiskGate:
    "AYRI production kapıları (sırayla): (1) migration apply (composite UNIQUE + classification FK NOT VALID + " +
    "archive & classification CDC trigger), (2) yh_source_activation_set('kisisel_arsiv:archives', true) — CODE " +
    "ENABLED ≠ TRIGGER INSTALLED ≠ DB ACTIVATED. Backfill DEFAULT false (ayrı kapı).",
} as const;

/** Kişisel Arşiv registry config'i (bulunamazsa fail-closed throw). */
function archiveConfig(): SourceConfig {
  const cfg = YH_INDEX_SOURCES.find((s) => s.sourceKey === PERSONAL_ARCHIVE_SOURCE_KEY);
  if (!cfg) {
    throw new Error(`Kişisel Arşiv registry kaydı bulunamadı: ${PERSONAL_ARCHIVE_SOURCE_KEY}`);
  }
  return cfg;
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

/**
 * SAF bütünlük + CANLI-KOD GÜVENLİK KİLİDİ (import-zamanı güvenlik + harness). READY iken
 * kaynağın güvenlik-eşleşmesini (safety coupling) zorlar; herhangi biri ihlal edilirse THROW
 * eder (deploy/harness öncesi yakalanır). DB/IO YOK.
 */
export function validatePersonalArchiveReadiness(): void {
  const R = PERSONAL_ARCHIVE_READINESS;

  // 0) Şekil bütünlüğü.
  if (R.sourceKey !== PERSONAL_ARCHIVE_SOURCE_KEY) {
    throw new Error("Readiness sourceKey uyuşmazlığı.");
  }
  if (R.preconditions.length === 0) throw new Error("En az bir ön-koşul kaydı gerekir.");
  const ids = new Set(R.preconditions.map((p) => p.id));
  if (ids.size !== R.preconditions.length) throw new Error("Ön-koşul id tekrarı.");

  // 1) DISPOSITION=READY ⇒ CANLI kodda GÜVENLİK-EŞLEŞME invaryantları ZORUNLU.
  if (R.disposition === "READY") {
    if (R.preconditions.some((p) => p.satisfied !== true)) {
      throw new Error("READY iken tüm ön-koşullar satisfied olmalı.");
    }
    const cfg = archiveConfig();

    // 1a) GÜVENLİK-EŞLEŞME: source-level safe-non-pii YALNIZ row-gate ile bir arada olabilir.
    if (cfg.classification === "safe-non-pii" && cfg.requiresRowEligibilityGate !== true) {
      throw new Error(
        "KİLİT İHLALİ: kisisel_arsiv:archives 'safe-non-pii' ama requiresRowEligibilityGate!=true → " +
          "row-gate'siz safe-non-pii = kör PII/backfill yüzeyi. Gate'i geri ekle ya da classification'ı düşür.",
      );
    }
    if (cfg.classification !== "safe-non-pii") {
      throw new Error("KİLİT İHLALİ: READY iken classification 'safe-non-pii' beklenir.");
    }
    if (cfg.requiresRowEligibilityGate !== true) {
      throw new Error("KİLİT İHLALİ: READY iken requiresRowEligibilityGate true beklenir.");
    }

    // 1b) Kör tenant-scoped backfill KAPALI.
    if (supportsTenantScopedPage(cfg) !== false) {
      throw new Error("KİLİT İHLALİ: supportsTenantScopedPage READY iken false OLMALI (kör backfill açılmış).");
    }

    // 1c) Source guard kaynağı erişilebilir buluyor (satır güvenliği row-gate'te).
    if (evaluateSourceGuard(cfg).indexable !== true) {
      throw new Error("KİLİT İHLALİ: source-guard safe-non-pii + enabled kaynağı indexable bulmalı.");
    }

    // 1d) Controlled activation: ROW_GATED_CONTROLLED + requiresRuntimeActivation=true (default OFF).
    const entry = activationEntryOf(PERSONAL_ARCHIVE_SOURCE_KEY);
    if (!entry) throw new Error("Aktivasyon matrisinde Kişisel Arşiv entry yok.");
    if (entry.activationClass !== "ROW_GATED_CONTROLLED") {
      throw new Error("KİLİT İHLALİ: activation class ROW_GATED_CONTROLLED beklenir.");
    }
    if (!isActivationClass(entry.activationClass) ||
        ACTIVATION_CLASS_POLICY[entry.activationClass].requiresRuntimeActivation !== true) {
      throw new Error("KİLİT İHLALİ: ROW_GATED_CONTROLLED requiresRuntimeActivation=true olmalı (default OFF).");
    }
    if (assessCohort(entry).cohort !== "COHORT_1_READY") {
      throw new Error("KİLİT İHLALİ: Kişisel Arşiv kohortu COHORT_1_READY beklenir.");
    }

    // 1e) Deferred closure FOUNDATION_READY.
    const closure = YH_DEFERRED_SOURCE_CLOSURE.find((d) => d.domain === "kisisel_arsiv_classification");
    if (!closure || closure.result !== "FOUNDATION_READY") {
      throw new Error("KİLİT İHLALİ: kisisel_arsiv_classification closure FOUNDATION_READY beklenir.");
    }
  }

  // 2) Row-gate helper semantiği (safe+eşleşen hash → true; aksi hepsi false).
  if (isArchiveRowIndexable({ classification: "safe-non-pii", reviewedContentHash: HASH_A }, HASH_A) !== true) {
    throw new Error("isArchiveRowIndexable: safe-non-pii + eşleşen hash true OLMALI.");
  }
  const mustBeFalse: Array<[{ classification: string; reviewedContentHash: string | null }, string]> = [
    [{ classification: "safe-non-pii", reviewedContentHash: HASH_A }, HASH_B], // stale hash
    [{ classification: "safe-non-pii", reviewedContentHash: null }, HASH_A], // hash yok
    [{ classification: "unclassified", reviewedContentHash: HASH_A }, HASH_A], // sınıflandırılmamış
    [{ classification: "pii", reviewedContentHash: HASH_A }, HASH_A], // pii
    [{ classification: "restricted", reviewedContentHash: HASH_A }, HASH_A], // kısıtlı
  ];
  for (const [row, cur] of mustBeFalse) {
    if (isArchiveRowIndexable(row, cur) !== false) {
      throw new Error(`isArchiveRowIndexable: (${row.classification}) fail-closed false OLMALI.`);
    }
  }
}
