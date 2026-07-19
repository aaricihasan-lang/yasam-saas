/**
 * Yaşam Hafızası™ — Retrieval Görünürlük Kararı (Sprint 2 / S2.13).
 *
 * Bir retrieval adayının, güvenilir SERVER-SIDE session scope altında görünür
 * olup olmadığını SAF + DETERMİNİSTİK + FAIL-CLOSED biçimde belirler.
 *
 * Kaynak: docs/yasam-hafizasi/04-phase-2-fast-search.md §9 "Tenant / Shared Değişmezi":
 *   WHERE ( tenant_id = :session OR (tenant_id IS NULL AND :allow_shared) )
 *     AND is_client_pii = false
 *     AND source_module NOT skipped(demo)
 *     AND NOT excludedStone(stones, source_id ∈ stone_exclusions[tenant])
 *
 * DEĞİŞMEZ (INV-TENANT / INV-PII):
 *   - session tenant YALNIZ güvenilir server-side katmandan gelir; bu birim HTTP /
 *     request / body / query / cookie / header / session OKUMAZ (yalnız kendisine
 *     verilen context'i değerlendirir).
 *   - Belirsiz / eksik / geçersiz girdi ASLA görünür kabul edilmez (fail-closed).
 *   - allowShared yalnız KESİN `true` iken shared (tenant_id null) görünür.
 *   - isClientPii yalnız KESİN `false` iken aday ilerleyebilir.
 *   - Stone exclusion DB'siz; SAF enjekte port ile; yalnız doğal taş adayları için.
 *
 * Bu dosya SAFTIR: DB / Supabase / Next / React / fetch / env / cookie / header /
 * logger / console / global mutable state / dosya sistemi / tarih / rastgelelik /
 * SQL / search_tsv / write İÇERMEZ. Aynı girdi + aynı port davranışı → aynı sonuç.
 * Girdi mutate EDİLMEZ.
 */

import type { YhSourceModule } from "../config";

/** Doğal taş kaynağı — stone_exclusions yalnız bu modül için sorgulanır (§9). */
const STONE_SOURCE_MODULE: YhSourceModule = "dogaltas";

/** Görünürlüğü değerlendirilecek aday (indeks satırının güvenlik alt kümesi). */
export interface VisibilityCandidate {
  /** Kayıt tenant'ı; `null` YALNIZ shared (kütüphane) referans anlamına gelir. */
  readonly tenantId: string | null;
  /** Danışan PII kaydı mı? Yalnız KESİN `false` ilerleyebilir (PII fiziksel ayrı). */
  readonly isClientPii: boolean;
  /** Kayıt demo tenant'a mı ait? (üst katman enjekte eder; env okunmaz). */
  readonly isDemoTenant: boolean;
  /** Kaynak yalnız demo mu? (üst katman enjekte eder; env okunmaz). */
  readonly isDemoSource: boolean;
  /** Kaynak modülü; stone exclusion YALNIZ `dogaltas` için uygulanır. */
  readonly sourceModule: YhSourceModule;
  /** Stone exclusion kontrolü için stabil kaynak kimliği (source_id). */
  readonly sourceId: string;
}

/** Güvenilir server-side session'dan çözülmüş görünürlük bağlamı. */
export interface VisibilityContext {
  /** Oturumdan çözülmüş tenant kimliği (ASLA body/query'den). */
  readonly sessionTenantId: string;
  /** `true` ise shared (tenant_id IS NULL) referanslar da görünür. */
  readonly allowShared: boolean;
}

/**
 * Doğal taş exclusion portu — SAF enjekte bağımlılık (gerçek Supabase impl AYRI,
 * bu aşamada YOK). `true` → aday hariç (görünmez). YALNIZ doğal taş adayları için,
 * yalnız tenant/PII/demo kurallarını geçmiş adayda ÇAĞRILIR. Hata / geçersiz cevap
 * → çağıran tarafından fail-closed (görünmez) değerlendirilir.
 */
export type StoneExclusionPort = (input: {
  readonly sessionTenantId: string;
  readonly stoneSourceId: string;
}) => boolean | Promise<boolean>;

/** Kapalı, deterministik görünürlük gerekçe kodu (YALNIZ test/güvenlik izi). */
export type VisibilityReasonCode =
  | "visible-tenant"
  | "visible-shared"
  | "hidden-session-tenant"
  | "hidden-candidate-tenant"
  | "hidden-tenant"
  | "hidden-shared-disabled"
  | "hidden-pii"
  | "hidden-demo"
  | "hidden-stone-id-missing"
  | "hidden-stone-exclusion"
  | "hidden-exclusion-error";

/** Görünürlük kararı — minimal ve test edilebilir. */
export interface VisibilityDecision {
  readonly visible: boolean;
  /** Kapalı union; ham tenant/stone kimliği veya hata mesajı İÇERMEZ. */
  readonly reasonCode: VisibilityReasonCode;
}

/** Geçerli, boş-olmayan trim'li kimlik mi? Değilse `null` (fail-closed işareti). */
function normalizedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hidden(reasonCode: VisibilityReasonCode): VisibilityDecision {
  return { visible: false, reasonCode };
}

function shown(reasonCode: "visible-tenant" | "visible-shared"): VisibilityDecision {
  return { visible: true, reasonCode };
}

/**
 * Adayın görünür olup olmadığına karar verir. Karar önceliği (fail-closed):
 *   1) session tenant geçerliliği
 *   2) candidate tenant biçim geçerliliği
 *   3) PII dışlama
 *   4) demo dışlama
 *   5) tenant / shared görünürlüğü (farklı tenant → port ÇAĞRILMAZ)
 *   6) doğal taş exclusion (YALNIZ taş adayları; port YALNIZ burada çağrılır)
 *   7) görünür
 *
 * Girdiler mutate edilmez; global durum kullanılmaz; sonuç deterministiktir.
 */
export async function evaluateVisibility(
  candidate: VisibilityCandidate,
  context: VisibilityContext,
  stoneExclusionPort: StoneExclusionPort,
): Promise<VisibilityDecision> {
  // 1) Session tenant — YALNIZ güvenilir server-side; boş/whitespace/geçersiz → fail-closed.
  const sessionTenantId = normalizedId(context.sessionTenantId);
  if (sessionTenantId === null) return hidden("hidden-session-tenant");

  // 2) Candidate tenant biçimi — `null` (shared) VEYA geçerli string; aksi → fail-closed.
  //    Boş/whitespace string shared'a ÇEVRİLMEZ (belirsiz kimlik görünmez).
  const candidateTenantIsNull = candidate.tenantId === null;
  const candidateTenantId = candidateTenantIsNull
    ? null
    : normalizedId(candidate.tenantId);
  if (!candidateTenantIsNull && candidateTenantId === null) {
    return hidden("hidden-candidate-tenant");
  }

  // 3) PII — YALNIZ kesin `false` ilerler (true/undefined/non-bool → fail-closed).
  if (candidate.isClientPii !== false) return hidden("hidden-pii");

  // 4) Demo — tenant/source YALNIZ kesin `false` olmalı (aksi → fail-closed).
  if (candidate.isDemoTenant !== false || candidate.isDemoSource !== false) {
    return hidden("hidden-demo");
  }

  // 5) Tenant / shared görünürlüğü.
  let grantedBy: "tenant" | "shared";
  if (candidateTenantIsNull) {
    if (context.allowShared !== true) return hidden("hidden-shared-disabled");
    grantedBy = "shared";
  } else if (candidateTenantId === sessionTenantId) {
    grantedBy = "tenant";
  } else {
    // Farklı tenant → tenant kararı burada verilir; exclusion port ÇAĞRILMAZ.
    return hidden("hidden-tenant");
  }

  // 6) Doğal taş exclusion — YALNIZ taş adayları; port YALNIZ buraya ulaşan adayda çağrılır.
  if (candidate.sourceModule === STONE_SOURCE_MODULE) {
    const stoneSourceId = normalizedId(candidate.sourceId);
    if (stoneSourceId === null) return hidden("hidden-stone-id-missing");

    let excludedResult: unknown;
    try {
      excludedResult = await stoneExclusionPort({ sessionTenantId, stoneSourceId });
    } catch {
      // Ham hata dışarı taşınmaz; fail-closed.
      return hidden("hidden-exclusion-error");
    }
    // Kesin boolean olmayan cevap → fail-closed.
    if (typeof excludedResult !== "boolean") return hidden("hidden-exclusion-error");
    if (excludedResult) return hidden("hidden-stone-exclusion");
  }

  // 7) Görünür.
  return shown(grantedBy === "tenant" ? "visible-tenant" : "visible-shared");
}
