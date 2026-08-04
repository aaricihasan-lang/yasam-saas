/**
 * Yaşam Hafızası™ — Tenant Resolver (Sprint 2 / S2.04).
 *
 * SAF (pure) FONKSİYON. Bir kaynak satırının indeks'e yazılacak tenant sahipliğini
 * (tenant_id veya NULL=shared) deterministik + fail-closed çözer.
 *
 * SAFLIK SINIRI — bu dosyada BULUNMAZ:
 *   Supabase / getServerDb / verifyUserRequest / verifyAdminRequest / fetch /
 *   process.env / DB sorgusu / API / runner-backfill / retrieval filtresi /
 *   demo kontrolü / PII kontrolü / normalize / evidence / scoring.
 *
 * Join mode'da parent tenant'ı çözmek için gereken gerçek DB/batch-map erişimi
 * BU DOSYADA DEĞİLDİR; çağıran (S2.08 runner) `ParentTenantLookup` enjekte eder.
 *
 * KURALLAR:
 *   - Görünürlük (session + shared birlikte) kararı RETRIEVAL'a aittir (S2.13), burada YOK.
 *   - Demo tenant atlama/kabul politikası runner'a aittir; resolver yalnız sahiplik çözer.
 *   - Hiçbir runtime değeri String()/number/trim ile "geçerli hale" getirilmez.
 *   - Başarılı her sonuçta değişmez: isShared === (tenantId === null).
 */

import type { SourceConfig } from "./sources";

// ─── Parent lookup sözleşmesi (join mode; DB erişimi çağırana ait) ───────────

/** Join çözümü için parent kayıt tenant'ının aranacağı girdi (üç alan zorunlu). */
export type ParentTenantLookupInput = {
  readonly parentTable: string;
  readonly parentId: string;
  readonly parentTenantColumn: string;
};

/** Parent lookup sonucu: kayıt bulundu (tenantId null=shared olabilir) veya bulunamadı. */
export type ParentTenantLookupResult =
  | { readonly found: true; readonly tenantId: string | null }
  | { readonly found: false };

/** Enjekte edilen parent tenant arama fonksiyonu (DB/batch-map implementasyonu S2.08'de). */
export type ParentTenantLookup = (input: ParentTenantLookupInput) => ParentTenantLookupResult;

// ─── Sonuç tipleri (discriminated union; exception YOK) ──────────────────────

/** Fail-closed hata nedenleri. */
export type TenantResolveFailureReason =
  | "missing-tenant"
  | "invalid-tenant"
  | "shared-not-allowed"
  | "missing-fk"
  | "invalid-fk"
  | "missing-parent-lookup"
  | "parent-not-found";

/** Tenant çözümleme sonucu. */
export type TenantResolveResult =
  | { readonly ok: true; readonly tenantId: string | null; readonly isShared: boolean }
  | { readonly ok: false; readonly reason: TenantResolveFailureReason };

// ─── Yardımcılar (dahili; coercion YOK) ──────────────────────────────────────

/** UUID biçim doğrulaması. Yalnız gerçek string + kanonik 8-4-4-4-12 hex kabul eder. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Başarılı sonuç üreticisi — isShared değişmezini tek yerde garanti eder. */
function ownership(tenantId: string | null): TenantResolveResult {
  return { ok: true, tenantId, isShared: tenantId === null };
}

function fail(reason: TenantResolveFailureReason): TenantResolveResult {
  return { ok: false, reason };
}

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Bir kaynak satırının tenant sahipliğini çözer.
 *
 * @param config       Kaynağın declarative konfigürasyonu (mode: column | join).
 * @param row          Ham kaynak satırı (değerleri unknown; coercion yapılmaz).
 * @param parentLookup Yalnız join mode'da gerekli; verilmezse join → missing-parent-lookup.
 */
export function resolveTenant(
  config: SourceConfig,
  row: Readonly<Record<string, unknown>>,
  parentLookup?: ParentTenantLookup,
): TenantResolveResult {
  const tenant = config.tenant;

  // ── GLOBAL-CANONICAL MODE (BF-14) ──────────────────────────────────────────
  // Tenant kolonu YOK; merkezî/global bilgi (ör. YEBS). Sahiplik DAİMA shared (NULL).
  // Synthetic tenant / tenant-başına-kopya YOK. isShared === (tenantId === null) korunur.
  if (tenant.mode === "global-canonical") {
    return ownership(null);
  }

  // ── COLUMN MODE ────────────────────────────────────────────────────────────
  if (tenant.mode === "column") {
    const raw = row[tenant.column];

    // Kolon satırda hiç yok → satır bozuk (fail-closed).
    if (raw === undefined) {
      return fail("missing-tenant");
    }
    // SQL NULL → shared adayı (yalnız açık izinle).
    if (raw === null) {
      return tenant.allowSharedNull === true ? ownership(null) : fail("shared-not-allowed");
    }
    // Geçerli UUID → sahiplik. Diğer her şey (boş/whitespace/non-uuid/non-string) reddedilir.
    if (isUuid(raw)) {
      return ownership(raw);
    }
    return fail("invalid-tenant");
  }

  // ── JOIN MODE ──────────────────────────────────────────────────────────────
  // Aşama 1: FK okuma (row'dan).
  const fk = row[tenant.fkColumn];
  if (fk === undefined || fk === null) {
    return fail("missing-fk");
  }
  if (!isUuid(fk)) {
    return fail("invalid-fk"); // boş/whitespace/non-uuid/non-string
  }

  // Aşama 2: parent tenant lookup (üç zorunlu alan eksiksiz aktarılır).
  if (!parentLookup) {
    return fail("missing-parent-lookup");
  }
  const lookup = parentLookup({
    parentTable: tenant.parentTable,
    parentId: fk,
    parentTenantColumn: tenant.parentTenantColumn,
  });

  if (!lookup.found) {
    return fail("parent-not-found");
  }

  const parentTenant = lookup.tenantId;
  // Parent tenant NULL → shared (yalnız join'de açık izinle).
  if (parentTenant === null) {
    return tenant.allowSharedNull === true ? ownership(null) : fail("shared-not-allowed");
  }
  // Parent tenant geçerli UUID → sahiplik; aksi (runtime bozuk değer) → invalid-tenant.
  if (isUuid(parentTenant)) {
    return ownership(parentTenant);
  }
  return fail("invalid-tenant");
}
