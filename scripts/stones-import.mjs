/**
 * stones-import.mjs
 * Bir kerelik upsert scripti: stones.json → Supabase stones tablosu
 *
 * Çalıştırma: node scripts/stones-import.mjs
 *
 * Güvenlik:
 *   - Hiçbir kayıt silinmez (DELETE/TRUNCATE yok)
 *   - 88 extra/manual taş dokunulmaz
 *   - Upsert: id üzerinden — yalnızca eşleşen 260 taş güncellenir
 *   - Çift kayıt oluşmaz
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── Env ──────────────────────────────────────────────────────────────────────
function readEnv() {
  const content = readFileSync(join(ROOT, ".env.local"), "utf8");
  const get = (key) => {
    const m = content.match(new RegExp(`^${key}=(.+)`, "m"));
    return m?.[1]?.trim() ?? null;
  };
  return {
    url: get("NEXT_PUBLIC_SUPABASE_URL"),
    serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

// ─── Dönüşüm fonksiyonları ────────────────────────────────────────────────────
function joinNotes(arr) {
  if (!arr || arr.length === 0) return null;
  const notes = arr.map((n) => (n?.note ?? "").trim()).filter(Boolean);
  return notes.length > 0 ? notes.join("\n\n---\n\n") : null;
}

function toDbAssignments(a) {
  if (!a) return {};
  const result = {};

  if (Array.isArray(a.minerals) && a.minerals.length > 0) {
    result["Mineraller"] = a.minerals.map((m) => [m.name ?? "", m.percent ?? ""]);
  }
  if (typeof a.organs_text === "string" && a.organs_text.trim()) {
    result["Etkili Organlar"] = [[a.organs_text.trim()]];
  }
  if (Array.isArray(a.astrology) && a.astrology.length > 0) {
    result["Astrolojik Atama"] = a.astrology.map((item) => [item]);
  }
  if (Array.isArray(a.elements) && a.elements.length > 0) {
    result["Elementler"] = a.elements.map((item) => [item]);
  }
  return result;
}

function buildRow(jsonStone, dbId, tenantId) {
  const e = jsonStone.effects ?? {};
  return {
    id: dbId,                           // upsert anahtarı
    tenant_id: tenantId,
    stone_name: jsonStone.name?.trim() ?? "",
    general_info: joinNotes(e.general),
    source_note: e.general?.[0]?.source ?? null,
    physical_effects: joinNotes(e.physical),
    spiritual_effects: joinNotes(e.spiritual),
    other_effects: joinNotes(e.other),
    warning_text: joinNotes(e.warnings),
    feng_shui: joinNotes(e.feng_shui),
    meditation: joinNotes(e.meditasyon),
    care: joinNotes(e.bakim),
    application: joinNotes(e.uygulama),
    chakras: Array.isArray(jsonStone.assignments?.chakras)
      ? jsonStone.assignments.chakras
      : [],
    assignments: toDbAssignments(jsonStone.assignments),
    updated_at: new Date().toISOString(),
  };
}

// ─── Ana akış ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("════════════════════════════════════════");
  console.log("  Doğaltaş Upsert Scripti");
  console.log("════════════════════════════════════════\n");

  // 1. Bağlantı
  const { url, serviceKey } = readEnv();
  if (!url || !serviceKey) {
    console.error("❌ SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY bulunamadı.");
    process.exit(1);
  }
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  console.log("✅ Supabase bağlantısı hazır\n");

  // 2. JSON oku
  const json = JSON.parse(readFileSync(join(ROOT, "stones.json"), "utf8"));
  console.log(`📄 stones.json: ${json.length} kayıt\n`);

  // 3. DB'den mevcut taşların id + stone_name + tenant_id listesini çek
  console.log("⬇️  Mevcut DB kayıtları okunuyor...");
  const { data: existing, error: fetchErr } = await sb
    .from("stones")
    .select("id, stone_name, tenant_id");

  if (fetchErr) {
    console.error("❌ DB okuma hatası:", fetchErr.message);
    process.exit(1);
  }
  console.log(`   DB'de toplam ${existing.length} taş bulundu`);

  // Eşleme: üst-case ad → {id, tenant_id}
  const dbMap = new Map();
  for (const row of existing) {
    dbMap.set((row.stone_name ?? "").toUpperCase().trim(), {
      id: row.id,
      tenantId: row.tenant_id,
    });
  }

  // tenant_id al (tek tenant olduğu doğrulandı)
  const tenantId = existing[0]?.tenant_id ?? null;
  if (!tenantId) {
    console.error("❌ tenant_id alınamadı.");
    process.exit(1);
  }
  console.log(`   Tenant ID: ${tenantId.substring(0, 8)}...\n`);

  // 4. Her JSON taşı için DB kaydını eşle
  const rows = [];
  const skipped = [];

  for (const stone of json) {
    const key = (stone.name ?? "").toUpperCase().trim();
    const match = dbMap.get(key);

    if (!match) {
      skipped.push(stone.name);
      continue;
    }

    rows.push(buildRow(stone, match.id, match.tenantId));
  }

  console.log(`🔗 Eşleşen: ${rows.length}  |  Atlanacak (DB'de yok): ${skipped.length}`);
  if (skipped.length > 0) {
    console.log("   Atlananlar:", skipped.slice(0, 5).join(", "));
  }

  // 5. Upsert (batch 20'lik)
  const BATCH = 20;
  let updated = 0;
  let failed = 0;
  const errors = [];

  console.log(`\n⬆️  Upsert başlıyor (${rows.length} kayıt, ${BATCH}'lik batch)...\n`);

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await sb
      .from("stones")
      .upsert(batch, { onConflict: "id" });

    if (error) {
      failed += batch.length;
      errors.push(`Batch ${i / BATCH + 1}: ${error.message}`);
      console.error(`  ❌ Batch ${i / BATCH + 1} hatası: ${error.message}`);
    } else {
      updated += batch.length;
      const pct = Math.round(((i + batch.length) / rows.length) * 100);
      process.stdout.write(`\r  ✅ ${updated}/${rows.length} (${pct}%)   `);
    }
  }
  console.log("\n");

  // 6. Sonuç raporu
  console.log("════════════════════════════════════════");
  console.log("  AKTARIM SONUCU");
  console.log("════════════════════════════════════════");
  console.log(`  JSON kayıt sayısı   : ${json.length}`);
  console.log(`  Eşleşen ve güncellenen : ${updated}`);
  console.log(`  Atlanılan (DB'de yok)  : ${skipped.length}`);
  console.log(`  Hata                   : ${failed}`);
  if (errors.length > 0) {
    console.log("  Hata detayları:");
    errors.forEach((e) => console.log("    -", e));
  }

  // 7. Toplam DB sayısını kontrol et
  const { count } = await sb
    .from("stones")
    .select("id", { count: "exact", head: true });
  console.log(`\n  DB toplam kayıt (aktarım sonrası): ${count}`);
  console.log("════════════════════════════════════════\n");

  // 8. 5 örnek taşın alan doluluk kontrolü
  console.log("📋 Örnek 5 taş alan kontrolü:\n");
  const sampleNames = ["AMETİST", "AKİK", "LABRADORİT", "MALAKİT", "KUVARS"];
  for (const name of sampleNames) {
    const { data: row, error: rErr } = await sb
      .from("stones")
      .select(
        "stone_name,general_info,physical_effects,spiritual_effects,other_effects,warning_text,chakras,assignments"
      )
      .ilike("stone_name", name)
      .limit(1)
      .single();

    if (rErr || !row) {
      console.log(`  ${name}: DB'de bulunamadı`);
      continue;
    }

    console.log(`  ── ${row.stone_name} ──`);
    console.log(`     general_info     : ${row.general_info ? row.general_info.length + " karakter ✅" : "BOŞ ❌"}`);
    console.log(`     physical_effects : ${row.physical_effects ? row.physical_effects.length + " karakter ✅" : "BOŞ (JSON'da da yok)"}`);
    console.log(`     spiritual_effects: ${row.spiritual_effects ? row.spiritual_effects.length + " karakter ✅" : "BOŞ (JSON'da da yok)"}`);
    console.log(`     other_effects    : ${row.other_effects ? row.other_effects.length + " karakter ✅" : "BOŞ (JSON'da da yok)"}`);
    console.log(`     warning_text     : ${row.warning_text ? row.warning_text.length + " karakter ✅" : "yok"}`);
    console.log(`     chakras          : ${Array.isArray(row.chakras) && row.chakras.length > 0 ? row.chakras.join(", ") + " ✅" : "yok (JSON'da da boş)"}`);
    console.log(`     assignments bölümleri: ${row.assignments ? Object.keys(row.assignments).join(", ") + " ✅" : "BOŞ ❌"}`);
    console.log();
  }
}

main().catch((e) => {
  console.error("❌ Beklenmedik hata:", e);
  process.exit(1);
});
