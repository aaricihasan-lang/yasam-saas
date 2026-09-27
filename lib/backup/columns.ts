/**
 * lib/backup/columns.ts — Restore kolon izin listesi (sunucu tarafı; Ayarlar sayfası import ETMEZ).
 *
 * İki yol:
 *  - "explicit": tablo şeması migration'larda → `schema.generated.ts` kolonları − generated/trigger kolonları.
 *  - "probe"   : şeması repo DIŞINDA olan legacy tablolar (clients, stones, …) → yedekteki anahtarlar
 *                güvenli ad kontrolünden geçer, generated/deny listesi çıkarılır ve çalışma anında
 *                canlı tabloya karşı doğrulanır (bilinmeyen kolon → düşürülür + raporlanır).
 */
import { MIGRATION_SCHEMA } from "./schema.generated";
import type { RegistryEntry } from "./types";

/**
 * Prod'da doğrulanmış generated kolonlar (COMMON_BRIEF, 2026-09-27). Migration ayrıştırmasına ek
 * güvenlik ağı — bu kolonlar HİÇBİR koşulda restore payload'ına giremez.
 */
export const PROD_GENERATED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  aromatherapy_claims: ["search_norm"],
  aromatherapy_glossary_terms: ["search_norm"],
  aromatherapy_oils: ["identity_norm", "search_norm"],
  aromatherapy_plant_taxa: ["canonical_name", "search_norm"],
  aromatherapy_preparations: ["search_norm"],
  aromatherapy_source_passages: ["search_norm"],
  aromatherapy_sources: ["search_norm"],
  yasam_hafizasi_index: ["is_shared"],
};

/** Her tabloda trigger ile yönetilen / yazılmaması gereken kolonlar. */
const ALWAYS_DENY = ["search_tsv"] as const;

/** PostgREST select/insert'e girebilecek güvenli kolon adı. */
export const SAFE_COLUMN_RE = /^[a-z_][a-z0-9_]{0,62}$/;

export type ColumnPolicy =
  | { mode: "explicit"; allowed: ReadonlySet<string>; deny: ReadonlySet<string> }
  | { mode: "probe"; deny: ReadonlySet<string> };

export function denyColumnsFor(e: RegistryEntry): Set<string> {
  const deny = new Set<string>(ALWAYS_DENY);
  for (const c of e.generatedColumns ?? []) deny.add(c);
  for (const c of PROD_GENERATED_COLUMNS[e.table] ?? []) deny.add(c);
  for (const c of MIGRATION_SCHEMA[e.table]?.generated ?? []) deny.add(c);
  if (/^hd_canonical_/.test(e.table)) {
    deny.add("canonical_key");
    deny.add("entity_kind");
  }
  return deny;
}

export function columnPolicyFor(e: RegistryEntry): ColumnPolicy {
  const deny = denyColumnsFor(e);
  const schema = MIGRATION_SCHEMA[e.table];
  if (!schema) return { mode: "probe", deny };
  const allowed = new Set(schema.columns.filter((c) => !deny.has(c)));
  return { mode: "explicit", allowed, deny };
}

/** Restore izin listesi (explicit tablolar) — harness "generated kolon izin listesinde mi" kontrolü için. */
export function restoreAllowlist(e: RegistryEntry): string[] | null {
  const p = columnPolicyFor(e);
  return p.mode === "explicit" ? [...p.allowed] : null;
}

/** Tabloda tenant_id kolonu var mı (explicit şemadan; legacy direct tablolar prod envanterine göre var). */
export function hasTenantColumn(e: RegistryEntry): boolean {
  if (e.tenantScope !== "direct") return false;
  const schema = MIGRATION_SCHEMA[e.table];
  return schema ? schema.columns.includes("tenant_id") : true;
}
