/**
 * Yaşam Hafızası™ — Tenant-Scoped Backfill Kapısı (Model C, BF-4B, SAF).
 *
 * Bir tenant-scoped indeksleme sayfasının çalışmaya UYGUN olup olmadığına SAF +
 * DETERMİNİSTİK + FAIL-CLOSED biçimde karar verir. İki bağımsız güvence sağlar:
 *
 *   1) `ValidatedTenantScope` — TAŞINAMAZ kanıt (unexported symbol brand). Yalnız
 *      `evaluateTenantScope` üretebilir; ham UUID / düz nesne / taklit symbol kabul
 *      edilmez (`isValidatedTenantScope` runtime kontrolü). Object.freeze ile mutasyona
 *      kapalı → tenantId sonradan değiştirilemez.
 *   2) `supportsTenantScopedPage` — yalnız column-mode, non-shared, safe-non-pii,
 *      enabled kaynak tenant-scoped backfill'e uygundur (join/shared/pii/disabled red).
 *
 * SAFLIK SINIRI — bu dosyada BULUNMAZ: DB / Supabase / getServerDb / fetch / env /
 * IO / logger / global mutable state. Aynı girdi → aynı sonuç; side-effect yok.
 */

import {
  evaluateRawRowTenantReady,
  normalizeApprovalStatus,
} from "../../auth/approvalGate";
import { ADMIN_LIBRARY_TENANT_ID } from "../../tenancy/syntheticTenants";
import { YH_DEMO_TENANT_ID } from "../config";
import type { SourceConfig } from "./sources";

// ─── Taşınamaz kanıt (branded symbol; DIŞARI EXPORT EDİLMEZ) ──────────────────
const VALIDATED_TENANT_SCOPE = Symbol("yh.validatedTenantScope");

/** Yalnız `evaluateTenantScope` başarısıyla üretilebilen kanıt (brand). */
export interface ValidatedTenantScope {
  readonly tenantId: string;
  readonly [VALIDATED_TENANT_SCOPE]: true;
}

/** Kanıt üreticisi (module-private; dondurulmuş → mutasyona kapalı). */
function makeValidatedTenantScope(tenantId: string): ValidatedTenantScope {
  return Object.freeze({ tenantId, [VALIDATED_TENANT_SCOPE]: true } as ValidatedTenantScope);
}

/** Runtime kanıt kontrolü: symbol brand + non-empty string tenantId. */
export function isValidatedTenantScope(v: unknown): v is ValidatedTenantScope {
  if (v === null || typeof v !== "object") return false;
  const rec = v as Record<PropertyKey, unknown>;
  if (rec[VALIDATED_TENANT_SCOPE] !== true) return false;
  return typeof rec.tenantId === "string" && rec.tenantId.length > 0;
}

// ─── Kaynak uygunluğu (SAF) ───────────────────────────────────────────────────

/**
 * Kaynak tenant-scoped backfill'e uygun mu? YALNIZ:
 *   enabled===true && classification==='safe-non-pii' && tenant.mode==='column' &&
 *   tenant.allowSharedNull!==true && non-empty tenant.column && non-empty primaryKey.
 * join / shared / pii / unclassified / disabled → false (fail-closed).
 */
export function supportsTenantScopedPage(config: SourceConfig): boolean {
  if (config.enabled !== true) return false;
  if (config.classification !== "safe-non-pii") return false;
  if (config.tenant.mode !== "column") return false;
  if (config.tenant.allowSharedNull === true) return false;
  if (typeof config.tenant.column !== "string" || config.tenant.column.trim().length === 0) {
    return false;
  }
  if (typeof config.primaryKey !== "string" || config.primaryKey.trim().length === 0) {
    return false;
  }
  return true;
}

// ─── Değerlendirme (SAF) ──────────────────────────────────────────────────────

export type TenantScopeGateCode =
  | "tenant-not-found"
  | "tenant-inactive"
  | "tenant-not-ready"
  | "tenant-demo"
  | "tenant-mixed-demo"
  | "tenant-synthetic";

/**
 * Kanonik (sentetik / demo) tenant reddi. Bu kimlikler gerçek uzman tenant'ı DEĞİLDİR
 * ve tenant-scoped backfill hedefi OLAMAZ (okuma öncesi fail-closed).
 */
export function canonicalTenantRejection(
  tenantId: string,
): "tenant-synthetic" | "tenant-demo" | null {
  if (tenantId === ADMIN_LIBRARY_TENANT_ID) return "tenant-synthetic";
  if (tenantId === YH_DEMO_TENANT_ID) return "tenant-demo";
  return null;
}

/** IO adapter'ından gelen ham (PII-dışı) tenant + users satırları. */
export interface TenantScopeRows {
  readonly tenant: { readonly id: string; readonly status: unknown } | null;
  readonly users: ReadonlyArray<Record<string, unknown>>;
}

export type TenantScopeEvaluation =
  | { readonly ok: true; readonly scope: ValidatedTenantScope }
  | { readonly ok: false; readonly code: TenantScopeGateCode };

/**
 * Tenant scope değerlendirmesi (FAIL-CLOSED sıra):
 *   1) canonicalTenantRejection (sentetik/demo) → red,
 *   2) tenant === null → tenant-not-found,
 *   3) lower(trim(status)) !== 'active' → tenant-inactive,
 *   4) users boş → tenant-not-ready,
 *   5) HERHANGİ bir user is_demo_account===true → (tümü demo ? tenant-demo : tenant-mixed-demo)
 *      (BAĞLAYICI: hazır uzman demo user ile birlikte olsa bile tenant REDDEDİLİR),
 *   6) EN AZ bir non-demo hazır uzman → ok (tek kanıt),
 *   7) aksi (admin-only / hazır uzman yok) → tenant-not-ready.
 */
export function evaluateTenantScope(
  tenantId: string,
  rows: TenantScopeRows,
): TenantScopeEvaluation {
  const canonical = canonicalTenantRejection(tenantId);
  if (canonical !== null) return { ok: false, code: canonical };

  const tenant = rows.tenant;
  if (tenant === null) return { ok: false, code: "tenant-not-found" };

  if (normalizeApprovalStatus(tenant.status) !== "active") {
    return { ok: false, code: "tenant-inactive" };
  }

  const users = rows.users;
  if (users.length === 0) return { ok: false, code: "tenant-not-ready" };

  // Demo tespiti önce (bir hazır uzman bile olsa demo varsa tenant reddedilir).
  let hasDemo = false;
  let allDemo = true;
  for (const u of users) {
    if (evaluateRawRowTenantReady(u).isDemo) hasDemo = true;
    else allDemo = false;
  }
  if (hasDemo) {
    return { ok: false, code: allDemo ? "tenant-demo" : "tenant-mixed-demo" };
  }

  const someReady = users.some((u) => evaluateRawRowTenantReady(u).ready);
  if (someReady) return { ok: true, scope: makeValidatedTenantScope(tenantId) };
  return { ok: false, code: "tenant-not-ready" };
}
