// ============================================================
// Beslenme FAZ 6 — Plan Word (DOCX) harness (DB-siz, deterministik).
//
// Saf belge kurucusunu (buildPlanDocxFromTree) bellek-içi plan ağacıyla test eder:
//   ZIP geçerliliği, document.xml içeriği (başlık/tarih/kcal), traversal-safe dosya adı,
//   GÖRSEL YOK (word/media + r:embed), V1≠V2 bağımsızlığı, oversize → PLAN_TOO_LARGE.
// Ayrıca STATİK SSRF taraması: planDocx.ts + planDocxBuilder.ts kaynaklarında uzak-görsel
//   kod-yolu (fetch/axios/http.get/ImageRun/embedImageParagraph/fetchImageBuffer) OLMADIĞINI doğrular.
//
// Çalıştır:  npx tsx scripts/beslenme-word/wordHarness.mjs
// FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { unzipSync } from "fflate";
import {
  buildPlanDocxFromTree,
  planDocxFilename,
  slugifyPlanTitle,
} from "../../lib/beslenme/word/planDocxBuilder.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

const td = new TextDecoder();

// ── Fixture kurucular ──────────────────────────────────────────────────────────
function nutr(code, amount, unit = code === "energy" ? "kcal" : "g") {
  return { nutrient_code: code, amount, unit_code: unit };
}
function item(id, name, grams, energyPer100, extra = []) {
  return {
    id, food_name_snapshot: name, quantity: null, portion_label_snapshot: null,
    grams, sort_order: 0,
    nutrients: [nutr("energy", energyPer100), ...extra],
  };
}

// 2 günlük plan; bilinen değerler. Gün1 enerji = 155 + 265 = 420 kcal.
function twoDayTree({ title = "Ozel Test Plani", revision = 1, egg = 155 } = {}) {
  return {
    plan: {
      id: "p1", title, note: "Test notu.",
      start_date: "2026-03-03", end_date: "2026-03-04",
      daily_energy_target: 2000, status: "active", revision_number: revision,
    },
    days: [
      {
        id: "d1", plan_date: "2026-03-03", energy_target_override: null, note: null,
        meals: [{
          id: "m1", meal_type: "breakfast", label: "Kahvaltı", sort_order: 0,
          items: [
            item("i1", "Yumurta", 100, egg, [nutr("protein", 13), nutr("carbohydrate", 1), nutr("total_fat", 11), nutr("fiber", 0)]),
            item("i2", "Ekmek", 100, 265, [nutr("protein", 9), nutr("carbohydrate", 49), nutr("total_fat", 3), nutr("fiber", 3)]),
          ],
        }],
      },
      {
        id: "d2", plan_date: "2026-03-04", energy_target_override: 1800, note: "İkinci gün",
        meals: [{
          id: "m2", meal_type: "lunch", label: "Öğle", sort_order: 0,
          items: [item("i3", "Pilav", 200, 130, [nutr("protein", 2), nutr("carbohydrate", 28), nutr("total_fat", 0), nutr("fiber", 0)])],
        }],
      },
    ],
  };
}

function oversizeSpanTree() {
  const t = twoDayTree();
  t.plan.start_date = "2026-01-01";
  t.plan.end_date = "2027-06-01"; // ~516 gün > 366
  return t;
}
function oversizeItemsTree() {
  const items = Array.from({ length: 3001 }, (_, i) => item(`x${i}`, `Besin ${i}`, 100, 100));
  return {
    plan: {
      id: "p2", title: "Cok Buyuk", note: null,
      start_date: "2026-03-03", end_date: "2026-03-04",
      daily_energy_target: null, status: "draft", revision_number: 1,
    },
    days: [{
      id: "d1", plan_date: "2026-03-03", energy_target_override: null, note: null,
      meals: [{ id: "m1", meal_type: null, label: "Öğün", sort_order: 0, items }],
    }],
  };
}

// ── Testler ──────────────────────────────────────────────────────────────────
console.log("Beslenme FAZ 6 — Plan Word (DOCX) harness\n");

const r1 = await buildPlanDocxFromTree(twoDayTree());
check("(build) V1 → ok:true", r1.ok, r1.ok ? "" : JSON.stringify(r1.error));

if (r1.ok) {
  const buf = r1.buffer;
  // (a) geçerli ZIP (PK\x03\x04)
  check("(a) ZIP PK imzası", buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04);
  check("(a) Buffer üretildi (>1KB)", Buffer.isBuffer(buf) && buf.length > 1024, `len=${buf.length}`);

  // (b) unzip + word/document.xml + başlık + tarih + kcal toplamı
  const files = unzipSync(new Uint8Array(buf));
  const names = Object.keys(files);
  check("(b) word/document.xml mevcut", names.includes("word/document.xml"));
  const xml = files["word/document.xml"] ? td.decode(files["word/document.xml"]) : "";
  check("(b) başlık içerir (Ozel Test Plani)", xml.includes("Ozel Test Plani"));
  check("(b) tarih içerir (Mart 2026)", xml.includes("Mart") && xml.includes("2026"));
  check("(b) kcal toplam metni içerir", xml.includes("kcal"));
  check("(b) gün1 toplam enerji 420 kcal", xml.includes("420") && /420\s*kcal|420/.test(xml), "gün1=155+265");

  // (c) traversal-safe dosya adı
  const fn = r1.filename;
  check("(c) dosya adı .docx", /\.docx$/.test(fn));
  check("(c) dosya adı traversal-safe (/, \\, .. yok)", !fn.includes("/") && !fn.includes("\\") && !fn.includes(".."), fn);
  check("(c) dosya adı beklenen biçim", /^Beslenme-Plani_[a-z0-9-]+_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}_V\d+\.docx$/.test(fn), fn);

  // (d) GÖRSEL YOK: word/media/ girdisi yok; document.xml'de r:embed / a:blip yok
  check("(d) word/media/ girdisi YOK", !names.some((n) => n.startsWith("word/media/")), names.filter((n) => n.startsWith("word/media/")).join(","));
  check("(d) document.xml r:embed YOK", !xml.includes("r:embed"));
  check("(d) document.xml a:blip (görsel) YOK", !xml.includes("<a:blip") && !xml.includes("blipFill"));
}

// (e) V1 vs V2 bağımsız içerik
const rV1 = await buildPlanDocxFromTree(twoDayTree({ title: "Ozel Test Plani", revision: 1, egg: 155 }));
const rV2 = await buildPlanDocxFromTree(twoDayTree({ title: "Ozel Test Plani Rev2", revision: 2, egg: 300 }));
if (rV1.ok && rV2.ok) {
  const x1 = td.decode(unzipSync(new Uint8Array(rV1.buffer))["word/document.xml"]);
  const x2 = td.decode(unzipSync(new Uint8Array(rV2.buffer))["word/document.xml"]);
  check("(e) V1 vs V2 buffer farklı", Buffer.compare(rV1.buffer, rV2.buffer) !== 0);
  check("(e) V2 başlığı 'Rev2' içerir, V1 içermez", x2.includes("Rev2") && !x1.includes("Rev2"));
  check("(e) V1 vs V2 dosya adı farklı (V1 vs V2)", rV1.filename.includes("_V1.docx") && rV2.filename.includes("_V2.docx"));
} else {
  check("(e) V1/V2 build ok", false, "biri ok değil");
}

// (f) oversize → PLAN_TOO_LARGE (span + item sayısı)
const rSpan = await buildPlanDocxFromTree(oversizeSpanTree());
check("(f) oversize span → PLAN_TOO_LARGE(413)", !rSpan.ok && rSpan.error.code === "PLAN_TOO_LARGE" && rSpan.error.status === 413);
const rItems = await buildPlanDocxFromTree(oversizeItemsTree());
check("(f) oversize item sayısı → PLAN_TOO_LARGE(413)", !rItems.ok && rItems.error.code === "PLAN_TOO_LARGE" && rItems.error.status === 413);

// slugify traversal-safety birim testi
check("(slug) TR + traversal temiz", slugifyPlanTitle("../Ödem/Plan İçin\\x") === "odem-plan-icin-x", slugifyPlanTitle("../Ödem/Plan İçin\\x"));
check("(slug) boş → ''", slugifyPlanTitle("") === "");

// ── STATİK SSRF taraması (kaynak metin) ─────────────────────────────────────────
const FORBIDDEN = ["fetchImageBuffer", "fetch(", "axios", "http.get", "https.get", "ImageRun", "embedImageParagraph"];
for (const rel of ["lib/beslenme/word/planDocx.ts", "lib/beslenme/word/planDocxBuilder.ts"]) {
  const p = resolve(ROOT, rel);
  const src = existsSync(p) ? readFileSync(p, "utf8") : "";
  check(`(ssrf) ${rel} mevcut`, src.length > 0);
  for (const tok of FORBIDDEN) {
    check(`(ssrf) ${rel} → '${tok}' YOK`, !src.includes(tok));
  }
}

// ── Sonuç ──────────────────────────────────────────────────────────────────────
console.log(`\n${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.log("Başarısızlar: " + failures.join(", "));
  process.exit(1);
}
