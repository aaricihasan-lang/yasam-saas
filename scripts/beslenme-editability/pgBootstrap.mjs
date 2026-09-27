// ============================================================
// Beslenme — PGlite bootstrap: TÜM nutrition migration'larını sırayla uygular.
// Prereq (baseline dışı) nesneler minimal kurulur. Harness'ler DB-gerçek test için kullanır.
// ============================================================
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG_DIR = join(ROOT, "supabase", "migrations");

export function nutritionMigrations() {
  return readdirSync(MIG_DIR).filter((f) => /_nutrition_.*\.sql$/.test(f)).sort();
}

export async function bootstrapNutritionDb() {
  const db = new PGlite();
  for (const r of ["anon", "authenticated", "service_role"]) {
    try { await db.exec(`CREATE ROLE ${r};`); } catch { /* exists */ }
  }
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
    -- unaccent sözlüğü PGlite'ta yok: test için IMMUTABLE lower-case stub (arama semantiği harness'te test edilmez).
    CREATE OR REPLACE FUNCTION public.yh_immutable_unaccent(text) RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT $1 $$;
    CREATE TABLE IF NOT EXISTS public.clients (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      ad text, soyad text, kan text, mizac text,
      UNIQUE (tenant_id, id)
    );
  `);
  const applied = [];
  for (const f of nutritionMigrations()) {
    try {
      await db.exec(readFileSync(join(MIG_DIR, f), "utf8"));
      applied.push(f);
    } catch (e) {
      throw new Error(`migration ${f} failed: ${e.message}`);
    }
  }
  return { db, applied };
}
