/**
 * Bioenergy RLS Migration — Uygulama Script'i
 *
 * KULLANIM:
 *   1. Supabase Dashboard → Settings → Database → Connection String (Direct) al
 *   2. .env.local dosyasına ekle: DATABASE_URL=postgresql://postgres:PASSWORD@...
 *   3. npx tsx scripts/apply-bioenergy-rls.ts
 *
 * ALTERNATIF — Supabase Dashboard SQL Editor:
 *   supabase/migrations/20260623200000_bioenergy_rls_tenant_isolation.sql
 *   dosyasını Dashboard SQL Editor'e yapıştırıp çalıştır.
 *
 * ALTERNATIF — Supabase CLI:
 *   npx supabase login
 *   npx supabase link --project-ref ylasompuxavjvimbbfgd
 *   npx supabase db execute -f supabase/migrations/20260623200000_bioenergy_rls_tenant_isolation.sql
 */

import pg from "pg";
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.SUPABASE_DB_URL;

if (!DATABASE_URL) {
  console.error(`
❌ DATABASE_URL bulunamadı.

Şu adımlardan birini izleyin:

SEÇENEK 1 — .env.local'a ekle:
  1. Supabase Dashboard → Settings → Database → Connection String (Direct)
  2. .env.local dosyasına ekle:
     DATABASE_URL=postgresql://postgres:PASSWORD@db.ylasompuxavjvimbbfgd.supabase.co:5432/postgres

SEÇENEK 2 — Supabase Dashboard SQL Editor:
  1. https://supabase.com/dashboard/project/ylasompuxavjvimbbfgd/editor
  2. supabase/migrations/20260623200000_bioenergy_rls_tenant_isolation.sql içeriğini yapıştır
  3. Çalıştır

SEÇENEK 3 — Supabase CLI:
  npx supabase login
  npx supabase link --project-ref ylasompuxavjvimbbfgd
  npx supabase db execute -f supabase/migrations/20260623200000_bioenergy_rls_tenant_isolation.sql
`);
  process.exit(1);
}

const DEMO_UUID = "40f842a0-e3e8-448c-8971-9a938e1faccb";

const TABLES = [
  "bioenergy_sessions",
  "bioenergy_energy_bodies",
  "bioenergy_subconscious_causes",
  "bioenergy_imaginations",
  "bioenergy_symbols",
  "bioenergy_chakras",
];

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log("🔌 PostgreSQL bağlantısı kuruluyor...");
  await client.connect();
  console.log("✅ Bağlandı\n");

  for (const tbl of TABLES) {
    console.log(`📋 ${tbl} için RLS ayarlanıyor...`);

    // Enable RLS
    await client.query(`ALTER TABLE public."${tbl}" ENABLE ROW LEVEL SECURITY`);

    // Drop existing policies
    const { rows: existing } = await client.query(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = $1`,
      [tbl]
    );
    for (const { policyname } of existing) {
      await client.query(`DROP POLICY IF EXISTS "${policyname}" ON public."${tbl}"`);
      console.log(`  🗑  Silindi: ${policyname}`);
    }

    // Grant
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON public."${tbl}" TO anon, authenticated`);

    // Policies
    await client.query(`
      CREATE POLICY "${tbl}_select_open" ON public."${tbl}"
      FOR SELECT USING (true)
    `);
    console.log(`  ✅ SELECT policy: herkese açık`);

    await client.query(`
      CREATE POLICY "${tbl}_insert_no_demo" ON public."${tbl}"
      FOR INSERT WITH CHECK (
        tenant_id != '${DEMO_UUID}'::uuid
        AND tenant_id IN (
          SELECT DISTINCT u.tenant_id
          FROM public.users u
          WHERE u.active = true
        )
      )
    `);
    console.log(`  ✅ INSERT policy: demo tenant yasak + geçerli tenant zorunlu`);

    await client.query(`
      CREATE POLICY "${tbl}_update_no_demo" ON public."${tbl}"
      FOR UPDATE USING (tenant_id != '${DEMO_UUID}'::uuid)
    `);
    console.log(`  ✅ UPDATE policy: demo tenant satırları yasak`);

    await client.query(`
      CREATE POLICY "${tbl}_delete_no_demo" ON public."${tbl}"
      FOR DELETE USING (tenant_id != '${DEMO_UUID}'::uuid)
    `);
    console.log(`  ✅ DELETE policy: demo tenant satırları yasak`);

    console.log();
  }

  // Doğrulama
  const { rows: verify } = await client.query(`
    SELECT tablename, rowsecurity, policyname, cmd
    FROM pg_tables t
    LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
    WHERE t.schemaname = 'public' AND t.tablename LIKE 'bioenergy%'
    ORDER BY t.tablename, p.cmd
  `);

  console.log("📊 Oluşturulan policy'ler:");
  let currentTable = "";
  for (const row of verify) {
    if (row.tablename !== currentTable) {
      currentTable = row.tablename;
      console.log(`\n[${row.tablename}] RLS: ${row.rowsecurity ? "✅ etkin" : "❌ kapalı"}`);
    }
    if (row.policyname) {
      console.log(`  ${row.cmd}: ${row.policyname}`);
    }
  }

  await client.end();
  console.log("\n✅ Migration başarıyla tamamlandı!");
  console.log("🔍 Doğrulama için: npx tsx scripts/verify-bioenergy-rls.ts");
}

main().catch(async (err) => {
  console.error("❌ Hata:", err.message);
  await client.end().catch(() => {});
  process.exit(1);
});
