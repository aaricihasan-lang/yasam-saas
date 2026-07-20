/**
 * Yaşam Hafızası™ — İndeks-Birimi Runner / Orkestrasyon (Sprint 2 / S2.08).
 *
 * SAF (pure) ORKESTRASYON. TEK bir kaynak satırı için S2.04 → S2.05 → S2.07
 * zincirini birleştirir ve yapılandırılmış bir sonuç döner:
 *   runIndexUnit({ config, row, parentLookup }) → RunIndexUnitResult
 *
 * SAFLIK SINIRI — bu dosyada BULUNMAZ:
 *   Supabase / DB sorgusu / fetch / process.env / IO / API / UI / network /
 *   pagination / cursor / batch / upsert / delete-tombstone / index yazımı /
 *   migration / concurrency / kaynak satırı OKUMA.
 *   Bunların tümü S2.09+ runner IO katmanına aittir; S2.08 yalnız
 *   `(config, row, lookup)` alıp yazma-yanı birimi kompoze eder.
 *
 * KANONİK KURALLAR (S2.08):
 *   - Parçalar (resolveTenant/extractFields/buildIndexUnit) YENİDEN YAZILMAZ;
 *     GERÇEK fonksiyonlar çağrılır. `ParentTenantLookup` çağırana enjekte edilir.
 *   - Tenant fail-closed: `resolveTenant` `ok:false` verirse birim üretilmez;
 *     kesin `TenantResolveFailureReason` skip'e taşınır (gözlemlenebilirlik).
 *   - buildIndexUnit `null` verirse neden OPAK'tır (`build-null`): builder'ın iç
 *     null koşulları (sourceId/groupKey/sıfır-kanıt) onun sözleşmesidir; burada
 *     YENİDEN TÜRETİLMEZ (buildCandidate.ts değişmez → AD-004).
 *   - Exception FIRLATMAZ; her durum discriminated union sonuç olarak döner.
 *     Enjekte edilen `parentLookup`'ın kendisi saf/atmayan olmalıdır (S2.08'de
 *     `makeParentTenantLookup` böyledir); gerçek DB lookup'ın hataları S2.09 IO
 *     sınırında yakalanır — orkestrasyon o sınırın ALTINDADIR.
 *   - Girdi `row`/`config` MUTATE EDİLMEZ; `extracted` dizileri buildIndexUnit
 *     tarafından shallow-copy'lenir (S2.07 sözleşmesi).
 */

import { buildIndexUnit } from "./buildCandidate";
import type { BuiltIndexUnit } from "./buildCandidate";
import { extractFields } from "./extractFields";
import type { SourceConfig } from "./sources";
import { resolveTenant } from "./tenantResolve";
import type { ParentTenantLookup, TenantResolveFailureReason } from "./tenantResolve";

// ─── Girdi / sonuç sözleşmeleri (discriminated union; exception YOK) ──────────

/** runIndexUnit girdisi (nesne biçimi; parentLookup yalnız join mode gerekli). */
export interface RunIndexUnitInput {
  readonly config: SourceConfig;
  readonly row: Readonly<Record<string, unknown>>;
  readonly parentLookup?: ParentTenantLookup;
}

/**
 * Birim üretilememe nedeni (yapılandırılmış; sessiz düşürme değil):
 *   - stage "tenant": `resolveTenant`'ın kesin fail-closed nedeni.
 *   - stage "build":  buildIndexUnit `null` döndü (neden OPAK: build-null).
 */
export type RunSkipReason =
  | { readonly stage: "tenant"; readonly reason: TenantResolveFailureReason }
  | { readonly stage: "build"; readonly reason: "build-null" };

/** Tek satır orkestrasyon sonucu. */
export type RunIndexUnitResult =
  | { readonly status: "unit"; readonly unit: BuiltIndexUnit }
  | { readonly status: "skipped"; readonly skip: RunSkipReason };

// ─── Orkestrasyon ─────────────────────────────────────────────────────────────

/**
 * Tek bir kaynak satırından yazma-yanı indeks birimini kompoze eder.
 *
 * Akış: resolveTenant → (ok değilse skip) → extractFields → buildIndexUnit →
 * (null ise skip) → unit. Saf; IO yok; exception yok; mutation yok.
 *
 * @param input `{ config, row, parentLookup? }`.
 * @returns Üretilen birim veya yapılandırılmış skip nedeni.
 */
export function runIndexUnit(input: RunIndexUnitInput): RunIndexUnitResult {
  const { config, row, parentLookup } = input;

  // 1) Tenant sahipliği (fail-closed). Join mode'da parentLookup enjekte edilir.
  const tenant = resolveTenant(config, row, parentLookup);
  if (!tenant.ok) {
    return { status: "skipped", skip: { stage: "tenant", reason: tenant.reason } };
  }

  // 2) Kanıt alanları (S2.05; fail-safe, mutation yok).
  const extracted = extractFields(config, row);

  // 3) Yazma-yanı birim (S2.07; sıfır-kanıt/sourceId/groupKey → null).
  const unit = buildIndexUnit(config, row, tenant, extracted);
  if (unit === null) {
    return { status: "skipped", skip: { stage: "build", reason: "build-null" } };
  }

  return { status: "unit", unit };
}

// ─── Sonuç özeti (saf; S2.09 döngüsünün gözlemlenebilirliği için) ─────────────

/** runIndexUnit sonuç kümesinin toplu özeti (sayaçlar; içerik/PII taşımaz). */
export interface RunSummary {
  readonly units: number;
  readonly skipped: number;
  /** `"<stage>:<reason>"` → adet (ör. "tenant:missing-fk"). */
  readonly byReason: Readonly<Record<string, number>>;
}

/**
 * Sonuç dizisini saf biçimde özetler; sırf sayar (row içeriği/PII taşımaz).
 * Bir sonucun skip olması diğerlerini etkilemez (hata izolasyonu gözlemi).
 */
export function summarizeRunResults(
  results: readonly RunIndexUnitResult[],
): RunSummary {
  let units = 0;
  let skipped = 0;
  const byReason: Record<string, number> = {};

  for (const r of results) {
    if (r.status === "unit") {
      units += 1;
      continue;
    }
    skipped += 1;
    const key = `${r.skip.stage}:${r.skip.reason}`;
    byReason[key] = (byReason[key] ?? 0) + 1;
  }

  return { units, skipped, byReason };
}
