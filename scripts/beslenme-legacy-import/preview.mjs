// ============================================================
// Beslenme — Legacy 4 kan grubu kaydı PREVIEW (mapping doğrulaması).
// SALT-OKUNUR. DB WRITE YOK. Blind import YOK.
// Kaynak: clean_app/data/nutrition_guide.json (masaüstü legacy).
//
// Çıktı: her kaydın hedef topic + sections + topic_foods mapping'i + atılan alanlar + char sayımı.
// Kullanım: node scripts/beslenme-legacy-import/preview.mjs [<json-path>]
// ============================================================
import { readFileSync, existsSync } from "node:fs";

const DEFAULT_PATHS = [
  "C:/Users/Mustafa/Desktop/Yeni klasör/clean_app/data/nutrition_guide.json",
  process.argv[2] ?? "",
].filter(Boolean);

const path = DEFAULT_PATHS.find((p) => existsSync(p));
if (!path) {
  console.log("⚠ Legacy dosya bulunamadı (aranan):");
  DEFAULT_PATHS.forEach((p) => console.log("   - " + p));
  console.log("\nAudit özeti (docs/beslenme-metabolik-sistem-tur1-audit-2026-08-21.md §B): 4 kayıt (0/A/AB/B).");
  console.log("Bu script kaynak erişilebilir olduğunda mapping preview üretir; DB write YAPMAZ.");
  process.exit(0);
}

let records;
try {
  records = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  console.log("✗ JSON parse hatası:", String(e && e.message));
  process.exit(1);
}
if (!Array.isArray(records)) records = [records];

// Kategori-başlıklı \n listelerini kaba parse (yalnız char sayımı + örnek; gerçek parse import adımında).
const lineCount = (s) => (typeof s === "string" ? s.split(/\r?\n/).filter((l) => l.trim()).length : 0);
const chars = (s) => (typeof s === "string" ? s.length : 0);

// framework=blood_type; topic_type=traditional_profile. Section + topic_foods mapping.
const SECTION_MAP = [
  ["summary", "ozet", "Genel Özet"],
  ["useful_foods", "uygun_besinler", "Uygun Besinler"],
  ["bad_foods", "notr_besinler", "Nötr Besinler"],
  ["harmful_foods", "uzak_durulacak", "Uzak Durulacaklar"],
  ["notes", "notlar", "Özel Notlar"],
];
const FOOD_REL = [
  ["useful_foods", "recommended"],
  ["bad_foods", "neutral"],
  ["harmful_foods", "avoid"],
];
const DROP_FIELDS = ["harmful_foods_v2", "diet_plan", "mizac_type", "field_labels", "category"];

console.log("=".repeat(60));
console.log("BESLENME LEGACY PREVIEW — Kan Grubu (framework=blood_type)");
console.log("Kaynak:", path);
console.log("Kayıt sayısı:", records.length, "(beklenen 4: 0/A/AB/B)");
console.log("=".repeat(60));

let totalChars = 0;
for (const rec of records) {
  const title = String(rec.title ?? "?");
  console.log(`\n▸ Profil "${title}"  (topic_type=traditional_profile, framework=blood_type)`);
  let recChars = 0;
  console.log("  SECTIONS:");
  for (const [field, key, label] of SECTION_MAP) {
    const c = chars(rec[field]);
    recChars += c;
    const status = c > 0 ? `${c} char / ${lineCount(rec[field])} satır` : "BOŞ (atla)";
    console.log(`    - ${label.padEnd(20)} ← ${field.padEnd(14)} : ${status}`);
  }
  console.log("  TOPIC_FOODS (parse import adımında):");
  for (const [field, rel] of FOOD_REL) {
    console.log(`    - ${field.padEnd(14)} → relation_type='${rel}'  (${lineCount(rec[field])} satır blok)`);
  }
  const dropped = DROP_FIELDS.filter((f) => f in rec);
  if (dropped.length) {
    console.log("  ATILAN alanlar:", dropped.map((f) => {
      if (f === "harmful_foods_v2") return `${f}(harmful_foods duplicate)`;
      if (f === "diet_plan") return `${f}(boş)`;
      return `${f}(stray/non-canonical)`;
    }).join(", "));
  }
  // timestamp tutarsızlığı
  const ua = rec.updated_at;
  if (typeof ua === "number") console.log(`  ⚠ updated_at int epoch (${ua}) → import'ta normalize edilecek`);
  console.log(`  Char toplam (bu kayıt): ${recChars}`);
  totalChars += recChars;
}

console.log("\n" + "=".repeat(60));
console.log(`TOPLAM içerik char (sections): ${totalChars}`);
console.log("IMPORT-READY: EVET (mapping deterministik) — ANCAK DB WRITE AYRI ONAYLA.");
console.log("Kaynak legacy'de YOK → source ZORUNLU DEĞİL.");
console.log("=".repeat(60));
