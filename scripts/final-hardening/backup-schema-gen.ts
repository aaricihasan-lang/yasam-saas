/**
 * PAKET BACKUP — `lib/backup/schema.generated.ts` üretici.
 * Çalıştırma: npx tsx scripts/final-hardening/backup-schema-gen.ts
 * backup.harness.ts üretilen dosyanın migration'larla senkron olduğunu doğrular (drift → FAIL).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseMigrationsWithDynamic } from "./backup-schema-parse";

export function renderSchemaModule(root: string): string {
  const tables = parseMigrationsWithDynamic(join(root, "supabase/migrations"));
  const names = [...tables.keys()].sort();
  const lines: string[] = [];
  lines.push("/**");
  lines.push(" * OTOMATİK ÜRETİLDİ — elle düzenleme. Kaynak: supabase/migrations/*.sql");
  lines.push(" * Üretici: scripts/final-hardening/backup-schema-gen.ts (npx tsx …)");
  lines.push(" * Saf veri: client + server import edebilir. Legacy (repo dışı şemalı) tablolar burada YOK.");
  lines.push(" */");
  lines.push("export type MigrationTableSchema = {");
  lines.push("  readonly columns: readonly string[];");
  lines.push("  readonly generated: readonly string[];");
  lines.push("  readonly primaryKey: readonly string[];");
  lines.push("};");
  lines.push("");
  lines.push("export const MIGRATION_SCHEMA: Readonly<Record<string, MigrationTableSchema>> = {");
  for (const n of names) {
    const t = tables.get(n)!;
    const q = (a: string[]) => `[${a.map((x) => JSON.stringify(x)).join(", ")}]`;
    lines.push(`  ${n}: { columns: ${q(t.columns)}, generated: ${q([...t.generated, ...t.identity])}, primaryKey: ${q(t.primaryKey)} },`);
  }
  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

if (process.argv.some((a) => a.endsWith("backup-schema-gen.ts"))) {
  const root = process.cwd();
  const out = join(root, "lib/backup/schema.generated.ts");
  writeFileSync(out, renderSchemaModule(root), "utf8");
  console.log("yazıldı:", out);
}
