/**
 * YAŞAM HAFIZASI™ — BF-11E KONTROLLÜ KAYNAK AKTİVASYON KONTROL DÜZLEMİ (SAF).
 * =========================================================================
 *
 * Bu modül, dormant kaynakların production'da GÜVENLİ ve KONTROLLÜ aktive edilmesi
 * için MERGE-SAFE / APPLY-SAFE aktivasyon kapısının TEK, SAF (pure), DETERMİNİSTİK
 * TypeScript sözleşmesidir. `yh_source_activation` DB tablosunun (migration
 * 20260927000000) semantiğini birebir yansıtır; harness bu sözleşmeyle DB migration'ını
 * çapraz doğrular.
 *
 * SAFLIK SINIRI — bu dosyada BULUNMAZ:
 *   Supabase / getServerDb / DB sorgusu / fetch / process.env / IO / API / UI /
 *   network / filesystem / log / Date.now / rastgele / global mutable state.
 *   Aynı girdi → aynı sonuç; side-effect yok.
 *
 * BAĞLAYICI İNVARYANTLAR (KİLİTLİ):
 *   INV-1  CODE MERGED ≠ SOURCE ACTIVATED. Bir kaynağın olay işlemesi YALNIZ
 *          (registryEnabled === true) VE (runtime.isActive === true) iken başlar
 *          (grandfathered KEEP_LIVE/ROW_GATED_READY hariç — aşağıya bakınız).
 *   INV-2  APPLY SAFE. Migration uygulanınca hiçbir kaynak aktive olmaz: aktivasyon
 *          satırı yoksa (runtime === null) veya isActive !== true → inactive.
 *   INV-3  BACKFILL ≠ ACTIVATION. Backfill YALNIZ explicit allowlist + isActive +
 *          backfillAllowed + backfill-eligible sınıf iken izinlidir; DEFAULT false.
 *   INV-4  FAIL-CLOSED. Tanınmayan sınıf / bozuk runtime / eksik alan → inactive + backfill=false.
 *   INV-5  KEEP_LIVE / ROW_GATED_READY grandfathered CANLI kaynaklardır: yeni aktivasyon
 *          kapısı onları DEĞİŞTİRMEZ (mevcut davranış korunur; yanlışlıkla deaktive edilmez).
 */

// ─── Aktivasyon sınıfları (rapor + registry + harness tek kaynak) ────────────
export const ACTIVATION_CLASSES = [
  "KEEP_LIVE", // Mevcut canlı professional kaynak; davranışı değişmez.
  "FUTURE_ONLY_READY", // Yeni kayıt/değişiklik güvenle izlenebilir; mevcut kayıt backfill EDİLMEZ.
  "CANONICAL_BACKFILL_CANDIDATE", // Yalnız güvenli canonical/global veri; ayrı onay + preflight ile backfill.
  "WAIT_FOR_CLEAN_RESET", // Mevcut production kayıtları test-verisi riski taşır; aktivasyon şimdilik YOK.
  "ROW_GATED_READY", // Kaynak aktif olabilir ama YALNIZ safe row eligibility geçen kayıtlar indexlenir.
  "DEFERRED_HARD_BLOCKER", // Güvenli ownership/PII ilişkisi kurulamaz; aktive EDİLMEZ.
] as const;

export type ActivationClass = (typeof ACTIVATION_CLASSES)[number];

/** Kaynak katmanı (professional index vs client index — mimariler AYRI). */
export type ActivationScope = "professional" | "client";

/**
 * Sınıf-seviyesi aktivasyon politikası (SAF sabit tablo). Her sınıf için:
 *   - requiresRuntimeActivation: yeni DB aktivasyon kapısına tabi mi (dormant kaynaklar).
 *       false → grandfathered CANLI (KEEP_LIVE / ROW_GATED_READY); mevcut model geçerli.
 *   - backfillEligible: bu sınıf backfill'e ADAY mı (default davranış YİNE false; ayrı onay).
 *   - neverActivatable: sınıf hiçbir koşulda aktive olamaz (DEFERRED_HARD_BLOCKER).
 */
export interface ActivationClassPolicy {
  readonly requiresRuntimeActivation: boolean;
  readonly backfillEligible: boolean;
  readonly neverActivatable: boolean;
}

export const ACTIVATION_CLASS_POLICY: Readonly<Record<ActivationClass, ActivationClassPolicy>> = {
  KEEP_LIVE: { requiresRuntimeActivation: false, backfillEligible: false, neverActivatable: false },
  ROW_GATED_READY: { requiresRuntimeActivation: false, backfillEligible: false, neverActivatable: false },
  FUTURE_ONLY_READY: { requiresRuntimeActivation: true, backfillEligible: false, neverActivatable: false },
  CANONICAL_BACKFILL_CANDIDATE: { requiresRuntimeActivation: true, backfillEligible: true, neverActivatable: false },
  WAIT_FOR_CLEAN_RESET: { requiresRuntimeActivation: true, backfillEligible: false, neverActivatable: false },
  DEFERRED_HARD_BLOCKER: { requiresRuntimeActivation: true, backfillEligible: false, neverActivatable: true },
};

export function isActivationClass(value: unknown): value is ActivationClass {
  return typeof value === "string" && (ACTIVATION_CLASSES as readonly string[]).includes(value);
}

// ─── Desired (kod tarafı; activationMatrix'ten türetilir) ─────────────────────

/** Bir kaynağın kod-tarafı arzu edilen aktivasyon tanımı (registry + matris). */
export interface SourceActivationDesired {
  readonly sourceKey: string;
  readonly scope: ActivationScope;
  readonly activationClass: ActivationClass;
  /** Kod registry'sindeki `enabled` (YH_INDEX_SOURCES / YH_CLIENT_INDEX_SOURCES). */
  readonly registryEnabled: boolean;
}

// ─── Runtime (DB tarafı; yh_source_activation satırı) ─────────────────────────

/**
 * DB `yh_source_activation` satırının SAF görüntüsü. Satır YOKSA `null` geçilir
 * (fail-closed inactive). Alanlar DB CHECK'leri ile simetrik.
 */
export interface SourceActivationRuntime {
  readonly isActive: boolean;
  readonly backfillAllowed: boolean;
}

// ─── Processing gate (INV-1/INV-2/INV-4/INV-5) ────────────────────────────────

export type ProcessingInactiveReason =
  | "class-never-activatable" // DEFERRED_HARD_BLOCKER
  | "registry-disabled" // kod enabled:false → future enabled:true kod merge'i bile tek başına aktive etmez
  | "runtime-missing" // DB aktivasyon satırı yok (apply-safe default)
  | "runtime-inactive" // DB satırı var ama isActive !== true
  | "invalid-class"; // tanınmayan sınıf (fail-closed)

export type ProcessingGateResult =
  | { readonly active: true }
  | { readonly active: false; readonly reason: ProcessingInactiveReason };

/**
 * Bir kaynağın olay işlemesinin (event/reconcile) aktif olup olmadığını FAIL-CLOSED
 * değerlendirir.
 *
 *   - Grandfathered CANLI sınıflar (requiresRuntimeActivation === false):
 *       active ⟺ registryEnabled === true. (Mevcut model; yeni kapı onları değiştirmez.)
 *   - Dormant sınıflar (requiresRuntimeActivation === true):
 *       active ⟺ registryEnabled === true  VE  runtime?.isActive === true.
 *       → CODE MERGED (registryEnabled) TEK BAŞINA yetmez; DB flip de gerekir (INV-1).
 *       → DB flip TEK BAŞINA yetmez; kod enabled:true de gerekir (apply-safe INV-2).
 *   - DEFERRED_HARD_BLOCKER → asla aktif değil.
 */
export function evaluateProcessingGate(
  desired: SourceActivationDesired,
  runtime: SourceActivationRuntime | null,
): ProcessingGateResult {
  if (!isActivationClass(desired.activationClass)) {
    return { active: false, reason: "invalid-class" };
  }
  const policy = ACTIVATION_CLASS_POLICY[desired.activationClass];

  if (policy.neverActivatable) {
    return { active: false, reason: "class-never-activatable" };
  }

  // Kod kapısı her sınıf için birincildir (registry enabled:false → asla aktif).
  if (desired.registryEnabled !== true) {
    return { active: false, reason: "registry-disabled" };
  }

  // Grandfathered canlı sınıflar: mevcut model (runtime kapısına tabi değil).
  if (!policy.requiresRuntimeActivation) {
    return { active: true };
  }

  // Dormant sınıflar: DB aktivasyon satırı ZORUNLU + isActive === true.
  if (runtime === null) {
    return { active: false, reason: "runtime-missing" };
  }
  if (runtime.isActive !== true) {
    return { active: false, reason: "runtime-inactive" };
  }
  return { active: true };
}

// ─── Backfill gate (INV-3; DEFAULT false) ─────────────────────────────────────

export type BackfillBlockedReason =
  | "not-backfill-eligible-class" // yalnız CANONICAL_BACKFILL_CANDIDATE aday
  | "processing-inactive" // önce processing aktif olmalı
  | "backfill-not-allowed"; // explicit allowlist (backfillAllowed) yok → DEFAULT false

export type BackfillGateResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: BackfillBlockedReason };

/**
 * Historical backfill'in izinli olup olmadığını FAIL-CLOSED değerlendirir. DEFAULT false:
 * "activate source" komutu backfill BAŞLATMAZ.
 *
 *   allowed ⟺ sınıf backfill-eligible (CANONICAL_BACKFILL_CANDIDATE)
 *            VE processing aktif (evaluateProcessingGate)
 *            VE runtime.backfillAllowed === true (explicit allowlist).
 *
 * Aksi her durumda { allowed:false }. Backfill'in kendisi (tablo taraması/indexleme)
 * BU MODÜLDE DEĞİLDİR; bu yalnız kapı kararıdır.
 */
export function evaluateBackfillGate(
  desired: SourceActivationDesired,
  runtime: SourceActivationRuntime | null,
): BackfillGateResult {
  if (!isActivationClass(desired.activationClass)) {
    return { allowed: false, reason: "not-backfill-eligible-class" };
  }
  const policy = ACTIVATION_CLASS_POLICY[desired.activationClass];
  if (!policy.backfillEligible) {
    return { allowed: false, reason: "not-backfill-eligible-class" };
  }
  if (!evaluateProcessingGate(desired, runtime).active) {
    return { allowed: false, reason: "processing-inactive" };
  }
  if (runtime === null || runtime.backfillAllowed !== true) {
    return { allowed: false, reason: "backfill-not-allowed" };
  }
  return { allowed: true };
}

// ─── Drift/uyumsuzluk tespiti (harness invaryantları §14) ─────────────────────

/**
 * Bir kaynağın gözlemlenmiş birleşik durumu (kod + DB + trigger). Harness ve (ileride)
 * preflight, bu görüntü üzerinden tehlikeli drift'leri yakalar.
 */
export interface SourceActivationObservation {
  readonly desired: SourceActivationDesired;
  readonly runtime: SourceActivationRuntime | null;
  /** Kaynak tablosunda CDC enqueue trigger'ı fiilen kurulu mu (DB gözlemi). */
  readonly triggerInstalled: boolean;
  /**
   * Kaynağın row-seviyesi classification/eligibility kapısı VAR mı (ROW_GATED_READY /
   * status-eligibility / rowClassification). Aktif kaynakta güvenlik kapısının varlığı.
   */
  readonly hasRowLevelGate: boolean;
}

export type ActivationDriftKind =
  | "code-enabled-trigger-absent" // registry enabled ama trigger yok (canlı akış kopuk)
  | "trigger-active-source-disabled" // trigger kurulu ama processing inactive (beklenmeyen olay üretimi)
  | "source-active-classification-gate-absent" // aktif kaynak ama güvenlik/eligibility kapısı yok
  | "backfill-allowed-by-default" // processing inactive iken backfill allow (INV-3 ihlali)
  | "client-source-active-without-client-scope" // client kaynak processing aktif ama scope client değil
  | "global-source-synthetic-tenant"; // global-canonical kaynak tenant scope'unda (synthetic tenant riski)

export interface ActivationDriftFinding {
  readonly sourceKey: string;
  readonly kind: ActivationDriftKind;
}

/**
 * Tek bir gözlem için tehlikeli drift bulgularını üretir (SAF; boş dizi = temiz).
 * Bu fonksiyon KARAR vermez, yalnız TUTARSIZLIĞI raporlar (harness fail-closed kullanır).
 */
export function detectActivationDrift(
  obs: SourceActivationObservation,
): readonly ActivationDriftFinding[] {
  const out: ActivationDriftFinding[] = [];
  const { desired, runtime, triggerInstalled, hasRowLevelGate } = obs;
  const key = desired.sourceKey;
  const processing = evaluateProcessingGate(desired, runtime);
  const policy = isActivationClass(desired.activationClass)
    ? ACTIVATION_CLASS_POLICY[desired.activationClass]
    : null;

  // code-enabled-trigger-absent: grandfathered CANLI sınıf registry-enabled ama trigger yok.
  // (Dormant sınıflar için trigger'ın olmaması NORMALDİR — merge-safe; drift değil.)
  if (policy && !policy.requiresRuntimeActivation && desired.registryEnabled && !triggerInstalled) {
    out.push({ sourceKey: key, kind: "code-enabled-trigger-absent" });
  }

  // trigger-active-source-disabled: trigger kurulu ama processing inactive.
  if (triggerInstalled && !processing.active) {
    out.push({ sourceKey: key, kind: "trigger-active-source-disabled" });
  }

  // source-active-classification-gate-absent: aktif kaynak güvenlik kapısı olmadan.
  if (processing.active && !hasRowLevelGate) {
    out.push({ sourceKey: key, kind: "source-active-classification-gate-absent" });
  }

  // backfill-allowed-by-default: processing inactive iken backfillAllowed true (INV-3).
  if (runtime !== null && runtime.backfillAllowed === true && !processing.active) {
    out.push({ sourceKey: key, kind: "backfill-allowed-by-default" });
  }

  // client-source-active-without-client-scope: client kaynak aktif ama scope client değil.
  if (processing.active && key.startsWith("danisan:") && desired.scope !== "client") {
    out.push({ sourceKey: key, kind: "client-source-active-without-client-scope" });
  }

  return out;
}
