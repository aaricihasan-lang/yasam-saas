/**
 * BF-12B — Tablo coverage politikası + hassas alan taraması + sahiplik.
 *
 * Kritik: production'da satırı olan HİÇBİR tablo coverage'sız kalamaz → FAIL-CLOSED
 * (silent skip yok). Beklenmeyen dolu hassas kolon → FAIL-CLOSED.
 */
import type {
  SensitiveScanResult,
  TablePolicyDecision,
  TableSchema,
} from "./types";
import type { RestorePolicy } from "./constants";
import {
  KNOWN_CANONICAL_TABLES,
  OWNER_SHARED_READ_TABLES,
  SENSITIVE_ALLOWLIST,
  SENSITIVE_COLUMN_PATTERNS,
  SENSITIVE_FAIL_IF_NONNULL,
  TABLE_POLICY_OVERRIDES,
} from "./constants";

const SYSTEM_TABLES = new Set([
  "schema_migrations",
  "supabase_migrations",
  "_prisma_migrations",
]);

/** tenant_id kolonu varsa döndürür (per-tenant footprint için). */
export function deriveTenantColumn(schema: TableSchema): string | null {
  return schema.columns.some((c) => c.name === "tenant_id") ? "tenant_id" : null;
}

function hasCol(schema: TableSchema, name: string): boolean {
  return schema.columns.some((c) => c.name === name);
}

/** Şemadaki hassas-desenli kolon adları. */
export function discoverSensitiveColumns(schema: TableSchema): string[] {
  return schema.columns
    .filter((c) => SENSITIVE_COLUMN_PATTERNS.some((re) => re.test(c.name)))
    .map((c) => c.name);
}

/** Tek tablo için restore politikası kararı (schema-only). */
export function decideTablePolicy(schema: TableSchema): TablePolicyDecision {
  const table = schema.name;
  const tenantColumn = deriveTenantColumn(schema);
  const sensitiveColumns = discoverSensitiveColumns(schema);
  const sensitiveAllowed = sensitiveColumns
    .map((c) => `${table}.${c}`)
    .filter((k) => SENSITIVE_ALLOWLIST.includes(k));

  let restorePolicy: RestorePolicy;
  let reason: string;
  let resolved = true;

  const override = TABLE_POLICY_OVERRIDES[table];
  if (override) {
    restorePolicy = override;
    reason = "explicit-override";
  } else if (SYSTEM_TABLES.has(table)) {
    restorePolicy = "SYSTEM_SCHEMA_ONLY";
    reason = "system-bookkeeping";
  } else if (tenantColumn || hasCol(schema, "user_id") || hasCol(schema, "client_id")) {
    restorePolicy = "RESTORE";
    reason = "tenant/user/client-owned business data";
  } else if (KNOWN_CANONICAL_TABLES.has(table)) {
    restorePolicy = "RESTORE";
    reason = "global/canonical reference";
  } else {
    // Sahiplik kolonu yok VE bilinen canonical değil → UNRESOLVED (fail-closed).
    restorePolicy = "RESTORE";
    reason = "UNRESOLVED: sahiplik kolonu yok ve bilinen canonical değil";
    resolved = false;
  }

  return {
    table,
    restorePolicy,
    reason,
    hasTenantColumn: tenantColumn !== null,
    tenantColumn,
    ownerSharedRead: OWNER_SHARED_READ_TABLES.includes(table),
    sensitiveColumns,
    sensitiveAllowed,
    resolved,
  };
}

/**
 * Coverage bütünlüğü: production'da DOLU her tablo bir karara sahip olmalı.
 * `nonEmptyTables` → snapshot'ta satırı olan tablolar. `decidedTables` → karar üretilenler.
 * Eksik varsa FAIL-CLOSED (throw).
 */
export function assertCoverage(
  nonEmptyTables: string[],
  decisions: Map<string, TablePolicyDecision>,
): void {
  const missing = nonEmptyTables.filter((t) => !decisions.has(t));
  if (missing.length > 0) {
    throw new Error(
      `Coverage FAIL-CLOSED: policy'siz dolu tablo(lar): ${missing.join(", ")}`,
    );
  }
  const unresolved = nonEmptyTables.filter((t) => decisions.get(t)?.resolved === false);
  if (unresolved.length > 0) {
    throw new Error(
      `Coverage FAIL-CLOSED: UNRESOLVED dolu tablo(lar): ${unresolved.join(", ")}`,
    );
  }
}

/**
 * Hassas alan kapısı. `nonNull` → tarama sırasında sayılan (table, column, nonNullCount).
 * - allowlist (users.password_hash) → izinli (encrypted arşive).
 * - users.password non-null → FAIL-CLOSED (plaintext parola).
 * - diğer dolu hassas kolon → FAIL-CLOSED (explicit policy yok).
 */
export function evaluateSensitiveGate(
  nonNull: { table: string; column: string; nonNullCount: number }[],
): SensitiveScanResult {
  const discovered = nonNull.slice();
  const allowed: string[] = [];
  const failClosed: { table: string; column: string; reason: string }[] = [];

  for (const item of nonNull) {
    const key = `${item.table}.${item.column}`;
    if (item.nonNullCount === 0) continue;
    if (SENSITIVE_ALLOWLIST.includes(key)) {
      allowed.push(key);
    } else if (SENSITIVE_FAIL_IF_NONNULL.includes(key)) {
      failClosed.push({ table: item.table, column: item.column, reason: "plaintext-password-nonnull" });
    } else {
      failClosed.push({ table: item.table, column: item.column, reason: "unexpected-populated-sensitive-column" });
    }
  }

  return { discovered, allowed, failClosed };
}
