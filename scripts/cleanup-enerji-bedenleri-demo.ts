/**
 * Demo hesap — enerji bedenleri duplikat temizleme scripti
 *
 * bioenergy_energy_bodies tablosunda demo hesaba ait aynı source_uid'e sahip
 * tekrarlı kayıtları bulur, her source_uid için yalnızca en eski kaydı korur,
 * diğerlerini siler.
 *
 * İdempotent: tekrar çalıştırılınca zaten tek kayıt var ise hiçbir şey silmez.
 *
 * Kullanım:
 *   npx tsx scripts/cleanup-enerji-bedenleri-demo.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, "..", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log("🔍 Demo hesap aranıyor...");

  const { data: demoUser, error: userError } = await supabase
    .from("users")
    .select("tenant_id, email")
    .eq("is_demo_account", true)
    .single();

  if (userError || !demoUser?.tenant_id) {
    console.error("❌ Demo hesap bulunamadı:", userError?.message ?? "tenant_id yok");
    process.exit(1);
  }

  const tenantId = demoUser.tenant_id as string;
  console.log(`✓ Demo hesap: ${demoUser.email as string} (tenant: ${tenantId})`);

  // Tüm kayıtları al
  const { data: records, error: listError } = await supabase
    .from("bioenergy_energy_bodies")
    .select("id, source_uid, created_at, genel_tanim")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true }); // En eski önce → korunacak

  if (listError || !records) {
    console.error("❌ Kayıtlar okunamadı:", listError?.message);
    process.exit(1);
  }

  console.log(`\n📋 Toplam kayıt: ${records.length}`);

  // source_uid'e göre grupla
  const groups = new Map<string, Array<{ id: string; created_at: string }>>();
  for (const r of records) {
    const key = (r.source_uid ?? "").trim().toLocaleLowerCase("tr-TR");
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ id: r.id as string, created_at: r.created_at as string });
  }

  const toDelete: string[] = [];

  for (const [uid, group] of groups) {
    if (group.length <= 1) {
      console.log(`  ✓ [${uid}] — tek kayıt, atlanıyor`);
      continue;
    }
    // En eski (index 0, ascending order) korunur, diğerleri silinir
    const [keep, ...rest] = group;
    console.log(`  ⚠️  [${uid}] — ${group.length} kayıt | korunan: ${keep.id} (${keep.created_at.slice(0, 10)})`);
    for (const r of rest) {
      console.log(`       silinecek: ${r.id} (${r.created_at.slice(0, 10)})`);
      toDelete.push(r.id);
    }
  }

  if (toDelete.length === 0) {
    console.log("\n✅ Duplikat bulunamadı, temizleme gerekmez.");
    return;
  }

  console.log(`\n🗑  ${toDelete.length} duplikat kayıt siliniyor...`);

  const { error: deleteError } = await supabase
    .from("bioenergy_energy_bodies")
    .delete()
    .eq("tenant_id", tenantId)
    .in("id", toDelete);

  if (deleteError) {
    console.error("❌ Silme başarısız:", deleteError.message);
    process.exit(1);
  }

  console.log(`✅ ${toDelete.length} duplikat kayıt silindi.`);
  console.log(`✅ Kalan kayıt sayısı: ${records.length - toDelete.length}`);
}

main().catch((err: unknown) => {
  console.error("Beklenmeyen hata:", err);
  process.exit(1);
});
