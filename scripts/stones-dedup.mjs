/**
 * stones-dedup.mjs
 * Duplike temizleme scripti: aynı stone_name'in eski kopyalarını siler.
 *
 * Kural:
 *  - updated_at >= CUTOFF_DATE → güncel/keeper (upsert'ten gelen) → DOKUNMA
 *  - updated_at <  CUTOFF_DATE → eski kopya adayı
 *    → sadece aynı stone_name'in keeper'ı varsa sil
 *    → stone_name tekil ise ASLA silme
 *
 * Çalıştırma: node scripts/stones-dedup.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Upsert tarihi eşiği — bu tarihten eski updated_at'lar "eski kopya" adayı
const CUTOFF_DATE = "2026-06-09T00:00:00Z";

// ─── Env ──────────────────────────────────────────────────────────────────────
function readEnv() {
  const content = readFileSync(join(ROOT, ".env.local"), "utf8");
  const get = (k) => content.match(new RegExp(`^${k}=(.+)`, "m"))?.[1]?.trim() ?? null;
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), serviceKey: get("SUPABASE_SERVICE_ROLE_KEY") };
}

// ─── Ana akış ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("════════════════════════════════════════════════");
  console.log("  Doğaltaş Duplike Temizleme Scripti");
  console.log("════════════════════════════════════════════════\n");

  const { url, serviceKey } = readEnv();
  if (!url || !serviceKey) {
    console.error("❌ Credentials eksik."); process.exit(1);
  }
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  console.log("✅ Supabase bağlantısı hazır\n");

  // ── 1. Tüm taşları çek ────────────────────────────────────────────────────
  console.log("⬇️  Tüm stones tablosu okunuyor...");
  const { data: all, error: fetchErr } = await sb
    .from("stones")
    .select("id, stone_name, general_info, assignments, warning_text, chakras, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (fetchErr) { console.error("❌ DB okuma hatası:", fetchErr.message); process.exit(1); }
  console.log(`   Toplam ${all.length} taş okundu\n`);

  // ── 2. Keeper set: updated_at >= CUTOFF ───────────────────────────────────
  const keepers = all.filter(s => s.updated_at >= CUTOFF_DATE);
  const keeperNames = new Set(keepers.map(s => (s.stone_name ?? "").toUpperCase().trim()));
  console.log(`🟢 Keeper (güncel, upsert edilen): ${keepers.length} taş`);

  // ── 3. Eski kopyalar: updated_at < CUTOFF VE aynı isimli keeper var ───────
  const oldCandidates = all.filter(s => s.updated_at < CUTOFF_DATE);
  console.log(`🟡 Eski kopya adayları (updated_at < ${CUTOFF_DATE}): ${oldCandidates.length}\n`);

  const toDelete = [];
  const toKeepOld = []; // tekil taş — silinmeyecek

  for (const stone of oldCandidates) {
    const nameKey = (stone.stone_name ?? "").toUpperCase().trim();
    if (keeperNames.has(nameKey)) {
      toDelete.push(stone); // keeper mevcut, bu eski kopya silinebilir
    } else {
      toKeepOld.push(stone); // tekil taş, asla silme
    }
  }

  console.log(`🔴 Silinecek eski kopya sayısı : ${toDelete.length}`);
  console.log(`🟢 Korunacak tekil eski taş    : ${toKeepOld.length}`);
  console.log(`   (Korunacaklar: adlarının keeper kopyası yok)\n`);

  if (toDelete.length === 0) {
    console.log("✅ Silinecek duplike bulunamadı. İşlem tamamlandı.\n");
    return;
  }

  // ── 4. Silinecek kayıtları listele ───────────────────────────────────────
  console.log("════════════════════════════════════════════════");
  console.log("  SİLİNECEK KAYITLAR (DETAYLI LİSTE)");
  console.log("════════════════════════════════════════════════");

  // Assignments format helper
  function assignFmt(assignments) {
    if (!assignments) return "null";
    const keys = Object.keys(assignments);
    if (keys.length === 0) return "{}(boş)";
    const isTurkish = keys.some(k => /[İÇĞÜŞÖıçğüşö]/.test(k) || k === "Mineraller" || k === "Etkili Organlar");
    return (isTurkish ? "Yeni-TR:" : "Eski-EN:") + keys.slice(0, 3).join(",") + (keys.length > 3 ? "..." : "");
  }

  // Gruplama: stone_name bazında göster
  const grouped = {};
  for (const s of toDelete) {
    const key = (s.stone_name ?? "").toUpperCase().trim();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  let idx = 1;
  for (const [name, stones] of Object.entries(grouped)) {
    const keeper = keepers.find(k => (k.stone_name ?? "").toUpperCase().trim() === name);
    console.log(`\n[${idx++}] ${name}`);
    console.log(`     KEEPER:  id=${keeper?.id?.substring(0,8)}... | updated=${keeper?.updated_at?.substring(0,10)} | general_info=${keeper?.general_info ? keeper.general_info.length + "kar" : "BOŞ"} | assignments=${assignFmt(keeper?.assignments)}`);
    stones.forEach((s, i) => {
      const genInfo = s.general_info ? s.general_info.length + "kar" : "BOŞ";
      const warnTxt = s.warning_text ? s.warning_text.length + "kar" : "yok";
      const chakra  = Array.isArray(s.chakras) && s.chakras.length > 0 ? s.chakras.join(";") : "yok";
      console.log(`     DEL-${i+1}: id=${s.id.substring(0,8)}... | updated=${s.updated_at?.substring(0,10)} | general_info=${genInfo} | assign=${assignFmt(s.assignments)} | warning=${warnTxt} | chakras=${chakra}`);
    });
  }

  const deleteIds = toDelete.map(s => s.id);
  console.log(`\n════════════════════════════════════════════════`);
  console.log(`  Toplam silinecek: ${deleteIds.length} kayıt`);
  console.log(`  Toplam grup (taş adı) sayısı: ${Object.keys(grouped).length}`);
  console.log(`════════════════════════════════════════════════\n`);

  // ── 5. Güvenlik kontrolü: hiçbir tekil taş silinmeyecek ─────────────────
  // Tüm silme ID'lerinin keepers ile çakışmadığını doğrula
  const keeperIds = new Set(keepers.map(s => s.id));
  const dangerIds = deleteIds.filter(id => keeperIds.has(id));
  if (dangerIds.length > 0) {
    console.error("❌ GÜVENLİK HATASI: Silinecek listede keeper ID tespit edildi!", dangerIds);
    process.exit(1);
  }
  console.log("✅ Güvenlik kontrolü geçti: keeper kayıtlardan hiçbiri silinecek listede yok\n");

  // ── 6. Silme işlemi (batch 20) ────────────────────────────────────────────
  console.log(`⬆️  Silme başlıyor (${deleteIds.length} kayıt, 20'lik batch)...\n`);
  const BATCH = 20;
  let deleted = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < deleteIds.length; i += BATCH) {
    const batch = deleteIds.slice(i, i + BATCH);
    const { error } = await sb.from("stones").delete().in("id", batch);

    if (error) {
      failed += batch.length;
      errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
      console.error(`  ❌ Batch ${Math.floor(i / BATCH) + 1} hatası: ${error.message}`);
    } else {
      deleted += batch.length;
      const pct = Math.round(((i + batch.length) / deleteIds.length) * 100);
      process.stdout.write(`\r  ✅ ${deleted}/${deleteIds.length} silindi (${pct}%)  `);
    }
  }
  console.log("\n");

  // ── 7. Son kontrol ────────────────────────────────────────────────────────
  const { count: finalCount } = await sb.from("stones").select("id", { count: "exact", head: true });

  // Kalan duplike kontrolü
  const { data: remaining } = await sb.from("stones").select("stone_name").order("stone_name");
  const nameCounts = {};
  remaining.forEach(r => {
    const k = (r.stone_name ?? "").toUpperCase().trim();
    nameCounts[k] = (nameCounts[k] || 0) + 1;
  });
  const remainingDupes = Object.entries(nameCounts).filter(([, c]) => c > 1);

  console.log("════════════════════════════════════════════════");
  console.log("  TEMİZLEME SONUCU");
  console.log("════════════════════════════════════════════════");
  console.log(`  Önceki toplam kayıt : ${all.length}`);
  console.log(`  Silinen kayıt       : ${deleted}`);
  console.log(`  Hata ile başarısız  : ${failed}`);
  console.log(`  Son toplam kayıt    : ${finalCount}`);
  console.log(`  Kalan duplike adı   : ${remainingDupes.length}`);
  if (remainingDupes.length > 0) {
    console.log("  Kalan duplikeler   :", remainingDupes.slice(0, 5).map(([n, c]) => `${n}(${c}x)`).join(", "));
  }
  if (errors.length > 0) {
    console.log("  Hatalar:");
    errors.forEach(e => console.log("    -", e));
  }
  console.log("════════════════════════════════════════════════\n");

  // ── 8. Örnek 5 taş alan kontrolü ─────────────────────────────────────────
  console.log("📋 Örnek 5 taş alan kontrolü (keeper'lar):\n");
  const samples = ["AMETİST", "AKİK", "LABRADORİT", "MALAKİT", "APATİT"];
  for (const name of samples) {
    const { data: rows } = await sb
      .from("stones")
      .select("stone_name, general_info, physical_effects, spiritual_effects, warning_text, chakras, assignments")
      .ilike("stone_name", name);

    if (!rows || rows.length === 0) {
      console.log(`  ${name}: bulunamadı`);
      continue;
    }
    if (rows.length > 1) {
      console.log(`  ${name}: ⚠️ Hâlâ ${rows.length} kopya!`);
      continue;
    }
    const r = rows[0];
    const assignKeys = r.assignments ? Object.keys(r.assignments) : [];
    console.log(`  ── ${r.stone_name} ──`);
    console.log(`     general_info     : ${r.general_info ? r.general_info.length + " kar. ✅" : "BOŞ"}`);
    console.log(`     physical_effects : ${r.physical_effects ? r.physical_effects.length + " kar. ✅" : "BOŞ (JSON'da da yok)"}`);
    console.log(`     spiritual_effects: ${r.spiritual_effects ? r.spiritual_effects.length + " kar. ✅" : "BOŞ (JSON'da da yok)"}`);
    console.log(`     warning_text     : ${r.warning_text ? r.warning_text.length + " kar. ✅" : "yok"}`);
    console.log(`     chakras          : ${Array.isArray(r.chakras) && r.chakras.length > 0 ? r.chakras.join(", ") + " ✅" : "yok"}`);
    console.log(`     assignments keys : ${assignKeys.length > 0 ? assignKeys.join(", ") + " ✅" : "boş"}`);
    console.log();
  }
}

main().catch((e) => { console.error("❌ Beklenmedik hata:", e); process.exit(1); });
