/**
 * YAŞAM HAFIZASI™ — BF-11E KİŞİSEL ARŞİV CONTROLLED SOURCE HAZIRLIK DEĞERLENDİRMESİ
 * (MACHINE-READABLE; MERGE-SAFE; SALT BİLDİRİM + CANLI-KOD KİLİDİ).
 * =============================================================================
 *
 * `kisisel_arsiv:archives` kaynağının Yaşam Hafızası için controlled-source olarak
 * AKTİVASYONA HAZIR OLUP OLMADIĞININ exact, kod-olarak-yaşayan sonucudur. activationMatrix
 * (ROW_GATED_READY / COHORT_1_BLOCKED) ve deferredSourceClosure (EXISTING_FAIL_CLOSED)
 * dispozisyonlarını TAMAMLAR; onlarla çelişmez.
 *
 * NİHAİ SONUÇ: DISPOSITION = "BLOCKED".
 *   PRODUCT_FIT = PASS-in-principle (Belge/Video'nun aksine Kişisel Arşiv KALICI bir
 *   depodur → ilkesel olarak meşru bir source olabilir), fakat GÜVENLİ aktivasyon
 *   dört bağımsız ön-koşulun çözülmesini ister ve bunların toplamı MİNİMAL güvenli
 *   wiring DEĞİL, INV-PII sınırında güvenlik-hassas bir yeniden-mimaridir (§16/§29
 *   gereği: `enabled:true`/source-classification ZORLA çevrilmez → BLOCKED).
 *
 * MERGE-SAFE: Bu dosya SALT BİLDİRİMDİR. Import/merge edilmesi hiçbir kaynağı aktive
 * etmez, hiçbir classification çevirmez, hiçbir trigger kurmaz, hiçbir olay üretmez,
 * production'a dokunmaz. `validatePersonalArchiveReadiness()` yalnız SAF kod
 * invaryantlarını doğrular (DB/IO YOK).
 *
 * NEDEN KOD (yalnız doküman değil): `validate` fonksiyonu, dispozisyon BLOCKED iken
 * kaynağın CANLI kodda fail-closed KALDIĞINI zorlar. Biri ileride ön-koşulları çözmeden
 * source-level classification'ı 'safe-non-pii'ye çevirirse (ki bu `supportsTenantScopedPage`
 * üzerinden ANINDA kör tenant-scoped backfill açar), bu kilit CI/harness'te PATLAR →
 * sessiz PII regresyonu imkânsızlaşır.
 */

import { YH_INDEX_SOURCES, type SourceConfig } from "../indexer/sources";
import { evaluateSourceGuard } from "../indexer/sourceGuard";
import { supportsTenantScopedPage } from "../indexer/tenantScopeGate";
import { isArchiveRowIndexable } from "../archive/archiveClassificationRequest";
import { activationEntryOf, assessCohort } from "./activationMatrix";
import { YH_DEFERRED_SOURCE_CLOSURE } from "../deferredSourceClosure";

/** Değerlendirilen tek kaynak. */
export const PERSONAL_ARCHIVE_SOURCE_KEY = "kisisel_arsiv:archives" as const;

/** Nihai hazırlık dispozisyonu. */
export type ReadinessDisposition = "BLOCKED" | "READY";

/** Ürün-uygunluğu sonucu (§24). */
export type ProductFit = "PASS" | "PASS_IN_PRINCIPLE" | "BLOCKED";

/**
 * Aktivasyon için çözülmesi gereken exact ön-koşul. Her biri CANLI koddan kanıtlıdır;
 * hiçbiri "sadece config" değildir. Toplamı §16/§29 anlamında büyük/riskli rewrite'tır.
 */
export interface ReadinessPrecondition {
  /** Kısa kararlı kimlik. */
  readonly id: string;
  /** İnsan-okur başlık. */
  readonly title: string;
  /** Neden minimal wiring DEĞİL — exact kod kanıtı. */
  readonly evidence: string;
  /** Bu ön-koşul çözülmeden aktivasyon güvenli mi (daima false; BLOCKED). */
  readonly satisfied: false;
}

export interface PersonalArchiveReadiness {
  readonly sourceKey: string;
  readonly disposition: ReadinessDisposition;
  readonly productFit: ProductFit;
  /** Kilitli ürün kararı (kısa). */
  readonly productDecision: string;
  /** Çözülmesi gereken exact ön-koşullar (hepsi açık). */
  readonly preconditions: readonly ReadinessPrecondition[];
  /** DISPOSITION=BLOCKED iken CANLI kodda tutulması ZORUNLU fail-closed invaryantlar. */
  readonly lockedInvariants: readonly string[];
  /** Bu turda KESİN yapılmayanlar (production/risk kapıları). */
  readonly notDoneThisTurn: readonly string[];
  /** Aktivasyona giden bir sonraki gerçek risk kapısı (bu paket dışında). */
  readonly nextRiskGate: string;
}

export const PERSONAL_ARCHIVE_READINESS: PersonalArchiveReadiness = {
  sourceKey: PERSONAL_ARCHIVE_SOURCE_KEY,
  disposition: "BLOCKED",
  productFit: "PASS_IN_PRINCIPLE",
  productDecision:
    "Kişisel Arşiv'i otomatik safe YAPMA. Belge/Video'nun aksine KALICI kişisel/profesyonel " +
    "depodur → ilkesel olarak meşru bir Yaşam Hafızası source'u olabilir; ancak veri doğası " +
    "serbest-form PII'dir ve yalnız kayıt-bazlı explicit review (safe-non-pii + current reviewed " +
    "hash) ile indexlenebilir. Güvenli row-gate CANLI koda bağlanana kadar source fail-closed KALIR.",
  preconditions: [
    {
      id: "P1-source-classification-coupling",
      title: "Source-classification flip = sistem-genel PII regresyonu (yalnız local wiring değil)",
      evidence:
        "sourceGuard yalnız source-level classification==='safe-non-pii' geçirir → source'u indexe " +
        "sokmak için flip ZORUNLU. Ancak supportsTenantScopedPage() (tenantScopeGate.ts) SADECE " +
        "source-level 'safe-non-pii'ye bakar → flip ANINDA TÜM personal_archives satırlarının kör " +
        "tenant-scoped backfill'ini açar (row-gate YOK). Flip, backfill kapısıyla AYNI anda yeniden " +
        "mimarlanmadan yapılamaz.",
      satisfied: false,
    },
    {
      id: "P2-runtime-row-gate-not-wired",
      title: "row-classification-hash gate hiçbir write path'ine bağlı değil",
      evidence:
        "runExactRecord (worker exact-write) source-guard + demo/synthetic/tenant kapıları uygular " +
        "ama per-row classification/hash gate YOK. runIndexUnit SAF'tır ve evaluateRowEligibility " +
        "yalnız satırın KENDİ kolonlarını okur → ayrı yh_archive_classifications tablosunu veya " +
        "server-hash'i okuyamaz. Gate, 17 canlı kaynağın da aktığı çekirdek IO dosyasına (indexSourcePage) " +
        "DB-okuyan bir bağımlılık olarak enjekte edilmeyi ister.",
      satisfied: false,
    },
    {
      id: "P3-server-hash-contract-absent",
      title: "Server-türetimli kanonik içerik hash'i YOK; untracked tablo üzerinde güvenle kurulamaz",
      evidence:
        "isArchiveRowIndexable bir currentContentHash PARAMETRESİ alır fakat onu personal_archives " +
        "satırından üreten server tarafı YOK. Classification route CLIENT-supplied hash saklar " +
        "(reviewed_content_hash). §17/§19 client hash'e güveni yasaklar + server-türetimli kanonik " +
        "hash ister. Fakat personal_archives'in TRACKED CREATE TABLE'ı YOK (untracked app-layer; API " +
        "SELECT *) → kanonik kolon kümesi şema-doğrulanamaz (numeroloji-client'ı HARD_BLOCKER yapan " +
        "aynı koşul). Hash contract'ı sıfırdan icat + canlı production route retrofit ister.",
      satisfied: false,
    },
    {
      id: "P4-classification-mutation-cdc-bespoke",
      title: "Classification-mutation olayı (§14 en kritik) generic CDC ile üretilemez",
      evidence:
        "Generic yh_outbox_enqueue() NEW.id/NEW.tenant_id kullanır; yh_archive_classifications'a " +
        "bağlanırsa source_id=classification-row-id olur, archive_id DEĞİL → archive source kimliğine " +
        "eşlenemez. archive_id'yi source_id yapan source-özel bir enqueue varyantı gerekir. Ayrıca " +
        "içerik-değişim invalidasyonu için personal_archives (untracked tablo) üzerinde ikinci bir " +
        "trigger gerekir.",
      satisfied: false,
    },
  ],
  lockedInvariants: [
    "kisisel_arsiv:archives registry classification === 'unclassified' (fail-closed anchor).",
    "kisisel_arsiv:archives registry enabled === true (mevcut durum; guard yine de 'unclassified' ile reddeder).",
    "evaluateSourceGuard(kisisel_arsiv:archives).indexable === false (reason 'unclassified').",
    "supportsTenantScopedPage(kisisel_arsiv:archives) === false (kör tenant-scoped backfill KAPALI).",
    "isArchiveRowIndexable yalnız safe-non-pii + eşleşen current hash → true; aksi hepsi false.",
    "activation matrix cohort === COHORT_1_BLOCKED; deferredSourceClosure === EXISTING_FAIL_CLOSED.",
  ],
  notDoneThisTurn: [
    "source-level classification flip YOK (INV-PII invaryantı korunur).",
    "row-gate runtime wiring YOK.",
    "server-hash contract / route retrofit YOK.",
    "classification-mutation CDC trigger YOK; personal_archives trigger YOK.",
    "production migration/apply/activation/backfill/reconcile YOK; test verisi indexlenmedi.",
  ],
  nextRiskGate:
    "AYRI onay gerektiren bütünsel BF-11E Kişisel Arşiv tasarım turu: (1) untracked personal_archives " +
    "için tracked kanonik şema + server-türetimli hash contract, (2) DB-okuyan row-gate'in çekirdek " +
    "worker path'ine güvenli enjeksiyonu, (3) source-classification/backfill kapı çiftinin eşzamanlı " +
    "yeniden-mimarisi, (4) archive_id'ye eşlenen source-özel classification-mutation CDC. Ancak hepsi " +
    "PASS olduğunda graduation + ayrı production kapıları.",
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
 * SAF bütünlük + CANLI-KOD KİLİDİ (import-zamanı güvenlik + harness). Dispozisyon BLOCKED
 * iken kaynağın gerçekten fail-closed KALDIĞINI zorlar; herhangi biri ihlal edilirse
 * THROW eder (deploy/harness öncesi yakalanır). DB/IO YOK.
 */
export function validatePersonalArchiveReadiness(): void {
  const R = PERSONAL_ARCHIVE_READINESS;

  // 0) Şekil bütünlüğü.
  if (R.sourceKey !== PERSONAL_ARCHIVE_SOURCE_KEY) {
    throw new Error("Readiness sourceKey uyuşmazlığı.");
  }
  if (R.preconditions.length === 0) throw new Error("BLOCKED en az bir ön-koşul gerektirir.");
  if (R.preconditions.some((p) => p.satisfied !== false)) {
    throw new Error("BLOCKED iken hiçbir ön-koşul satisfied olamaz.");
  }
  const ids = new Set(R.preconditions.map((p) => p.id));
  if (ids.size !== R.preconditions.length) throw new Error("Ön-koşul id tekrarı.");

  // 1) BLOCKED ⇒ CANLI kodda fail-closed invaryantlar ZORUNLU (sessiz regresyon kilidi).
  if (R.disposition === "BLOCKED") {
    const cfg = archiveConfig();

    // 1a) Registry hâlâ unclassified (fail-closed anchor); flip edilmemiş.
    if (cfg.classification !== "unclassified") {
      throw new Error(
        "KİLİT İHLALİ: kisisel_arsiv:archives classification BLOCKED iken 'unclassified' OLMALI " +
          `(bulunan: '${cfg.classification}'). Source-classification flip = kör PII backfill riski; ` +
          "önce ön-koşulları çöz + bu değerlendirmeyi READY'ye yükselt.",
      );
    }

    // 1b) Source guard reddediyor.
    const guard = evaluateSourceGuard(cfg);
    if (guard.indexable !== false) {
      throw new Error("KİLİT İHLALİ: source-guard kisisel_arsiv:archives'i indexable buldu (fail-closed beklenir).");
    }

    // 1c) Kör tenant-scoped backfill KAPALI.
    if (supportsTenantScopedPage(cfg) !== false) {
      throw new Error(
        "KİLİT İHLALİ: supportsTenantScopedPage BLOCKED iken false OLMALI (kör PII backfill kapısı açılmış).",
      );
    }

    // 1d) Aktivasyon matrisi kohortu COHORT_1_BLOCKED.
    const entry = activationEntryOf(PERSONAL_ARCHIVE_SOURCE_KEY);
    if (!entry) throw new Error("Aktivasyon matrisinde Kişisel Arşiv entry yok.");
    if (assessCohort(entry).cohort !== "COHORT_1_BLOCKED") {
      throw new Error("KİLİT İHLALİ: Kişisel Arşiv kohortu COHORT_1_BLOCKED beklenir.");
    }

    // 1e) Deferred closure EXISTING_FAIL_CLOSED.
    const closure = YH_DEFERRED_SOURCE_CLOSURE.find((d) => d.domain === "kisisel_arsiv_classification");
    if (!closure || closure.result !== "EXISTING_FAIL_CLOSED") {
      throw new Error("KİLİT İHLALİ: kisisel_arsiv_classification closure EXISTING_FAIL_CLOSED beklenir.");
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
