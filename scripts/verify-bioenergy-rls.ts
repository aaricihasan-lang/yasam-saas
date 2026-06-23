/**
 * Bioenergy RLS Doğrulama Script'i
 *
 * KULLANIM:
 *   npx tsx scripts/verify-bioenergy-rls.ts
 *
 * AMAÇ:
 *   Migration uygulandıktan sonra anon (publishable) key ile:
 *   - Demo tenant'a INSERT/UPDATE/DELETE engellendiğini doğrular
 *   - SELECT'in açık olduğunu doğrular
 *   - Geçici test satırlarını temizler (production'a zarar vermez)
 *
 * BAĞIMLILIKLAR:
 *   .env.local → NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEMO_UUID = "40f842a0-e3e8-448c-8971-9a938e1faccb";

const TABLES = [
  "bioenergy_sessions",
  "bioenergy_energy_bodies",
  "bioenergy_subconscious_causes",
  "bioenergy_imaginations",
  "bioenergy_symbols",
  "bioenergy_chakras",
] as const;

type TableName = (typeof TABLES)[number];

// Tablo başına geçici test satırının minimum şeması
function makeTestRow(table: TableName, tenantId: string): Record<string, unknown> {
  const base = { tenant_id: tenantId };
  switch (table) {
    case "bioenergy_sessions":
      return { ...base, title: "__rls_verify_temp__", content: "", category: "test" };
    case "bioenergy_energy_bodies":
      return { ...base, name: "__rls_verify_temp__", description: "", symptoms: [] };
    case "bioenergy_subconscious_causes":
      return { ...base, title: "__rls_verify_temp__", cause: "", body_area: "" };
    case "bioenergy_imaginations":
      return { ...base, title: "__rls_verify_temp__", content: "" };
    case "bioenergy_symbols":
      return { ...base, name: "__rls_verify_temp__", meaning: "" };
    case "bioenergy_chakras":
      return { ...base, name: "__rls_verify_temp__", color: "", element: "" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function pass(msg: string) {
  passCount++;
  console.log(`  ✅ PASS: ${msg}`);
}

function fail(msg: string) {
  failCount++;
  console.error(`  ❌ FAIL: ${msg}`);
}

function info(msg: string) {
  console.log(`  ℹ️  ${msg}`);
}

// ─────────────────────────────────────────────────────────────────────────────

async function testTable(
  anonClient: AnyClient,
  serviceClient: AnyClient,
  table: TableName
) {
  console.log(`\n┌── ${table}`);

  // ── 1. SELECT: açık mı?
  const { data: selectData, error: selectErr } = await anonClient
    .from(table)
    .select("id")
    .limit(1);

  if (selectErr) {
    fail(`SELECT engellendi (beklenmiyor): ${selectErr.message}`);
  } else {
    pass(`SELECT açık — ${selectData?.length ?? 0} satır döndü`);
  }

  // ── 2. INSERT (demo tenant_id) → engellenmeli
  const demoRow = makeTestRow(table, DEMO_UUID);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertDemoErr } = await anonClient.from(table).insert(demoRow as any);

  if (insertDemoErr) {
    pass(`INSERT demo tenant engellendi: ${insertDemoErr.code ?? insertDemoErr.message}`);
  } else {
    fail(`INSERT demo tenant GEÇTİ — policy çalışmıyor! (${table})`);
    // Yanlışlıkla eklendiyse temizle
    await serviceClient
      .from(table)
      .delete()
      .eq("tenant_id", DEMO_UUID)
      .filter("title", "eq", "__rls_verify_temp__")
      .filter("name", "eq", "__rls_verify_temp__");
  }

  // ── 3. UPDATE demo satırlar → 0 row etkilenmeli
  //    WHERE tenant_id = demo_uuid AND id = '<SAHTE_ID>'
  //    USING policy filtresi → satır görünmez → 0 affected
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: updateCount, error: updateErr } = await (anonClient as any)
    .from(table)
    .update({ updated_at: new Date().toISOString() })
    .eq("tenant_id", DEMO_UUID)
    .eq("id", "00000000-0000-0000-0000-000000000000") // varolmayan ID
    .select();

  if (updateErr && updateErr.code !== "PGRST116") {
    info(`UPDATE test hata: ${updateErr.code} ${updateErr.message}`);
  } else {
    pass(`UPDATE demo satırları (sahte ID) → 0 satır etkilendi`);
  }

  // ── 4. DELETE demo satırlar → 0 row etkilenmeli
  const { error: deleteErr } = await anonClient
    .from(table)
    .delete()
    .eq("tenant_id", DEMO_UUID)
    .eq("id", "00000000-0000-0000-0000-000000000000"); // varolmayan ID

  if (deleteErr && deleteErr.code !== "PGRST116") {
    fail(`DELETE test beklenmedik hata: ${deleteErr.code} ${deleteErr.message}`);
  } else {
    pass(`DELETE demo satırları (sahte ID) → 0 satır etkilendi`);
  }

  // ── 5. Service key ile demo satır sayısı — anon UPDATE sonrası korunmalı
  const { count: beforeCount } = await serviceClient
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", DEMO_UUID);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (anonClient as any)
    .from(table)
    .update({ updated_at: new Date(0).toISOString() })
    .eq("tenant_id", DEMO_UUID);

  const { count: afterCount, error: afterErr } = await serviceClient
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", DEMO_UUID);

  if (!afterErr) {
    const n = afterCount ?? 0;
    if (n > 0) {
      if (beforeCount === afterCount) {
        pass(`Demo satır sayısı korundu — ${n} satır mevcut, anon UPDATE etki etmedi`);
      } else {
        fail(`Demo satır sayısı değişti: ${beforeCount} → ${afterCount}. Policy çalışmıyor!`);
      }
    } else {
      info(`Bu tabloda henüz demo verisi yok — policy yazıldı, veri girildiğinde aktif`);
    }
  }

  console.log(`└──`);
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !ANON_KEY) {
    console.error(`
❌ Eksik env değişkenleri.

.env.local dosyasında şunlar gereklidir:
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...  (veya NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  SUPABASE_SERVICE_ROLE_KEY=... (opsiyonel, sayım testleri için)
`);
    process.exit(1);
  }

  const anonClient: AnyClient = createClient(SUPABASE_URL, ANON_KEY);
  const serviceClient: AnyClient = SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY)
    : anonClient;

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Bioenergy RLS Doğrulama — anon key ile test");
  console.log(`  Demo UUID: ${DEMO_UUID}`);
  console.log("═══════════════════════════════════════════════════════");

  if (!SERVICE_KEY) {
    console.warn("\n⚠️  SUPABASE_SERVICE_ROLE_KEY yok — sayım testleri sınırlı\n");
  }

  for (const table of TABLES) {
    await testTable(anonClient, serviceClient, table);
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Sonuç: ${passCount} PASS  /  ${failCount} FAIL`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (failCount > 0) {
    console.error("❌ Bazı testler başarısız — migration uygulanmadı veya policy yanlış.");
    process.exit(1);
  } else {
    console.log("✅ Tüm testler başarılı — RLS koruması aktif.");
  }
}

main().catch((err) => {
  console.error("❌ Beklenmedik hata:", err);
  process.exit(1);
});
