/**
 * stones-dedup-pass2.mjs
 * İkinci geçiş: Her iki kopyası da eski tarihli (JSON dışı) duplikeleri temizler.
 *
 * Keeper seçim kriteri (öncelik sırasıyla):
 *  1. general_info dolu → tercih et
 *  2. assignments dolu → tercih et
 *  3. En yeni updated_at → tercih et
 *  4. Beraberse: ilk ID alfabetik sırayla
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function readEnv() {
  const content = readFileSync(join(ROOT, ".env.local"), "utf8");
  const get = (k) => content.match(new RegExp(`^${k}=(.+)`, "m"))?.[1]?.trim() ?? null;
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), serviceKey: get("SUPABASE_SERVICE_ROLE_KEY") };
}

function keeperScore(s) {
  // Yüksek puan → keeper seçilir
  let score = 0;
  if (s.general_info && s.general_info.length > 10) score += 100;
  if (s.assignments && Object.keys(s.assignments).length > 0) score += 50;
  if (s.warning_text) score += 10;
  if (Array.isArray(s.chakras) && s.chakras.length > 0) score += 5;
  return score;
}

async function main() {
  console.log("════════════════════════════════════════════════");
  console.log("  Doğaltaş Duplike Temizleme — 2. Geçiş");
  console.log("════════════════════════════════════════════════\n");

  const { url, serviceKey } = readEnv();
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  console.log("✅ Bağlantı hazır\n");

  // Tüm taşları çek
  const { data: all } = await sb
    .from("stones")
    .select("id, stone_name, general_info, assignments, warning_text, chakras, updated_at, created_at")
    .order("updated_at", { ascending: false });

  console.log(`⬇️  Toplam ${all.length} taş okundu\n`);

  // Grupla
  const byName = {};
  for (const s of all) {
    const key = (s.stone_name ?? "").toUpperCase().trim();
    if (!byName[key]) byName[key] = [];
    byName[key].push(s);
  }

  const toDelete = [];
  const dupNames = [];

  for (const [name, group] of Object.entries(byName)) {
    if (group.length === 1) continue; // Tekil, atla

    dupNames.push(name);

    // En yüksek puanlıyı keeper seç; eşit puanda en yeni updated_at
    const sorted = [...group].sort((a, b) => {
      const scoreDiff = keeperScore(b) - keeperScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
    });

    const keeper = sorted[0];
    sorted.slice(1).forEach(s => toDelete.push({ ...s, _keeper: keeper }));
  }

  console.log(`🔴 Silinecek kayıt sayısı: ${toDelete.length} (${dupNames.length} duplike grubu)\n`);

  if (toDelete.length === 0) {
    console.log("✅ Silinecek duplike kalmadı!\n");
    return;
  }

  // Listeyi göster
  console.log("════════════════════════════════════════════════");
  console.log("  SİLİNECEK KAYITLAR");
  console.log("════════════════════════════════════════════════");

  function fmt(s, label) {
    const gi = s.general_info ? s.general_info.length + "kar" : "BOŞ";
    const ak = s.assignments ? Object.keys(s.assignments).length + " key" : "null";
    return `${label}: id=${s.id.substring(0,8)}... | updated=${s.updated_at?.substring(0,10)} | gi=${gi} | assign=${ak}`;
  }

  for (const s of toDelete) {
    console.log(`  ${s.stone_name}`);
    console.log(`    ${fmt(s._keeper, "KEEPER")}`);
    console.log(`    ${fmt(s, "DELETE")}`);
  }

  const deleteIds = toDelete.map(s => s.id);

  // Güvenlik: keeper'ların ID'si silinecek listede olmamalı
  const keeperIds = new Set(toDelete.map(s => s._keeper.id));
  const danger = deleteIds.filter(id => keeperIds.has(id));
  if (danger.length > 0) {
    console.error("\n❌ GÜVENLİK HATASI: keeper ID'ler silinecek listede!", danger);
    process.exit(1);
  }
  console.log(`\n✅ Güvenlik kontrolü geçti\n`);

  // Sil
  console.log(`⬆️  Silme başlıyor (${deleteIds.length} kayıt)...\n`);
  const BATCH = 20;
  let deleted = 0, failed = 0;
  const errors = [];

  for (let i = 0; i < deleteIds.length; i += BATCH) {
    const batch = deleteIds.slice(i, i + BATCH);
    const { error } = await sb.from("stones").delete().in("id", batch);
    if (error) {
      failed += batch.length;
      errors.push(error.message);
      console.error(`  ❌ Batch ${Math.floor(i/BATCH)+1} hatası: ${error.message}`);
    } else {
      deleted += batch.length;
      process.stdout.write(`\r  ✅ ${deleted}/${deleteIds.length} silindi   `);
    }
  }
  console.log("\n");

  // Sonuç
  const { count: finalCount } = await sb.from("stones").select("id", { count: "exact", head: true });

  const { data: remaining } = await sb.from("stones").select("stone_name");
  const nameCounts = {};
  remaining.forEach(r => {
    const k = (r.stone_name ?? "").toUpperCase().trim();
    nameCounts[k] = (nameCounts[k] || 0) + 1;
  });
  const leftoverDupes = Object.entries(nameCounts).filter(([, c]) => c > 1);

  console.log("════════════════════════════════════════════════");
  console.log("  SONUÇ");
  console.log("════════════════════════════════════════════════");
  console.log(`  Önceki toplam  : ${all.length}`);
  console.log(`  Silinen        : ${deleted}`);
  console.log(`  Hata           : ${failed}`);
  console.log(`  Son toplam     : ${finalCount}`);
  console.log(`  Kalan duplike  : ${leftoverDupes.length}`);
  if (leftoverDupes.length > 0) {
    console.log("  Kalan          :", leftoverDupes.slice(0,5).map(([n,c]) => `${n}(${c}x)`).join(", "));
  }
  if (errors.length > 0) errors.forEach(e => console.log("  Hata:", e));
  console.log("════════════════════════════════════════════════\n");

  // Örnek kontrol
  console.log("📋 Örnek 5 taş alan kontrolü:\n");
  const samples = ["AMETİST", "LABRADORİT", "APATİT", "FLORİT", "YAKUT"];
  for (const name of samples) {
    const { data: rows } = await sb
      .from("stones")
      .select("stone_name, general_info, physical_effects, chakras, assignments, warning_text")
      .ilike("stone_name", name);

    if (!rows || rows.length === 0) { console.log(`  ${name}: bulunamadı`); continue; }
    if (rows.length > 1) { console.log(`  ${name}: ⚠️ hâlâ ${rows.length} kopya`); continue; }
    const r = rows[0];
    const ak = r.assignments ? Object.keys(r.assignments).join(", ") : "boş";
    console.log(`  ── ${r.stone_name} ──`);
    console.log(`     general_info : ${r.general_info ? r.general_info.length + " kar. ✅" : "BOŞ"}`);
    console.log(`     physical     : ${r.physical_effects ? r.physical_effects.length + " kar. ✅" : "BOŞ"}`);
    console.log(`     warning_text : ${r.warning_text ? r.warning_text.length + " kar. ✅" : "yok"}`);
    console.log(`     chakras      : ${Array.isArray(r.chakras) && r.chakras.length > 0 ? r.chakras.join(", ") : "yok"}`);
    console.log(`     assignments  : ${ak} ✅`);
    console.log();
  }
}

main().catch(e => { console.error("❌ Hata:", e); process.exit(1); });
