/**
 * Seed: stone_knowledge_articles
 *
 * tas_bilgi_kutuphanesi.json → Supabase stone_knowledge_articles tablosu
 *
 * Kullanım (proje kökünde):
 *   node scripts/seed-stone-knowledge.mjs
 *
 * Gereklilik: @supabase/supabase-js (zaten proje bağımlılığında mevcut)
 *
 * Tüm makaleler tenant_id = ADMIN_LIBRARY_TENANT_ID olarak kaydedilir
 * → paylaşımlı kütüphane, tüm kullanıcılar okuyabilir.
 *
 * İdempotent: title + source_section çifti zaten varsa günceller (upsert).
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// .env.local otomatik yükle (proje kökünden çalıştırıldığı varsayılır)
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local") });

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Ortam değişkenleri ──────────────────────────────────────────────────────
const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Service role key — .env.local'dan okunur, ASLA kaynak koduna gömme
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ADMIN_TENANT_ID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY env değişkenleri gerekli.");
  console.error("   Çalıştırma: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/seed-stone-knowledge.mjs");
  process.exit(1);
}
const BATCH_SIZE      = 20; // Supabase 2MB payload limiti aşılmasın

// ── Supabase client ─────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── JSON okuma ───────────────────────────────────────────────────────────────
const jsonPath = join(__dirname, "..", "public", "data", "tas_bilgi_kutuphanesi.json");
const rawData  = JSON.parse(readFileSync(jsonPath, "utf-8"));

console.log(`📚 ${rawData.length} makale okundu.`);

// ── Alan dönüşümü ─────────────────────────────────────────────────────────────
function mapRecord(item) {
  return {
    tenant_id:       ADMIN_TENANT_ID,
    title:           (item.baslik ?? "").trim(),
    content:         (item.icerik ?? "").trim(),
    category:        (item.kategori ?? "").trim(),
    sub_category:    (item.alt_kategori ?? "").trim(),
    tags:            Array.isArray(item.etiketler) ? item.etiketler : [],
    related_stones:  Array.isArray(item.ilgili_taslar) ? item.ilgili_taslar : [],
    related_minerals:Array.isArray(item.ilgili_mineraller) ? item.ilgili_mineraller : [],
    source:          (item.kaynak ?? "").trim(),
    source_section:  (item.kaynak_bolum ?? "").trim(),
    keyword:         (item.anahtar_kelime ?? "").trim(),
    notes:           (item.notlar ?? "").trim(),
    is_active:       true,
  };
}

const rows = rawData.map(mapRecord).filter(r => r.title.length > 0);
console.log(`✅ ${rows.length} geçerli kayıt hazırlandı.`);

// ── Batch upsert ─────────────────────────────────────────────────────────────
let inserted = 0;
let updated  = 0;
let errors   = 0;

for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);

  const { data, error } = await supabase
    .from("stone_knowledge_articles")
    .upsert(batch, {
      onConflict:        "tenant_id,title",
      ignoreDuplicates:  false,
    })
    .select("id, title");

  if (error) {
    console.error(`  ❌ Batch ${i / BATCH_SIZE + 1} hatası:`, error.message);
    errors += batch.length;
    // conflict index yoksa INSERT moduna geç
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      console.log("     → INSERT moduna geçiliyor (duplicate skip)");
      const { error: insertErr } = await supabase
        .from("stone_knowledge_articles")
        .insert(batch)
        .select("id");
      if (!insertErr) { inserted += batch.length; errors -= batch.length; }
    }
    continue;
  }

  inserted += data?.length ?? 0;
  process.stdout.write(`  ✓ ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}\r`);
}

console.log(`\n\n📊 Sonuç:`);
console.log(`   Eklenen/Güncellenen : ${inserted}`);
console.log(`   Hatalı              : ${errors}`);
console.log(`   Toplam              : ${rows.length}`);

// ── Doğrulama sorgusu ─────────────────────────────────────────────────────────
const { count } = await supabase
  .from("stone_knowledge_articles")
  .select("id", { count: "exact", head: true })
  .eq("tenant_id", ADMIN_TENANT_ID);

console.log(`\n🔍 Tablodaki toplam kayıt: ${count}`);
