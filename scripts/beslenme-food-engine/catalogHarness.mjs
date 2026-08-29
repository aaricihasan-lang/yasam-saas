// ============================================================
// Beslenme FAZ 6 — Katalog pipeline STATİK harness'i (env-siz, deps-siz, DB-siz).
// Doğrular:
//   1. v2 manifest parse edilir.
//   2. validateCatalog.mjs GEÇER (alt-süreç exit 0).
//   3. §7 regresyon: hashFood name_tr/aliases DEĞİŞİNCE değişir; alias SIRASI değişince AYNI kalır.
//   4. importCatalog dry-run plan sayacı deterministik (iki koşu → aynı).
//   5. dedup güvenliği: aynı fdc_id çift SAYILMAZ.
// Sonuç: `N PASS / M FAIL`; FAIL'de nonzero exit.
// ============================================================
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { hashFood, readManifest, computePlan } from "./importCatalog.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MANIFEST = resolve(ROOT, "data", "nutrition", "usda-curated-v2.json");
const VALIDATOR = resolve(HERE, "validateCatalog.mjs");

let pass = 0, fail = 0;
const fails = [];
const t = (name, cond) => { if (cond) { pass++; } else { fail++; fails.push(name); } };

// ── 1. v2 manifest parse ──
let doc;
try {
  doc = JSON.parse(readFileSync(MANIFEST, "utf8"));
  t("1. v2 manifest parse edilir", true);
  t("1b. manifest_version = usda-curated-v2", doc.manifest_version === "usda-curated-v2");
  t("1c. foods dizi", Array.isArray(doc.foods));
} catch (e) {
  t(`1. v2 manifest parse edilir (${e.message})`, false);
}

// ── 2. validateCatalog GEÇER ──
const vres = spawnSync(process.execPath, [VALIDATOR], { encoding: "utf8" });
t("2. validateCatalog.mjs exit 0", vres.status === 0);

// ── 3. §7 regresyon: hashFood ──
const baseFood = {
  name_tr: "Elma", name_en: "Apples, raw, with skin", aliases: ["elma", "apple"],
  food_group: "fruits", prep_state: "raw", fdc_id: "171688",
  nutrients: { energy: { amount: 52, unit: "kcal" } }, portions: [],
};
const hBase = hashFood(baseFood);
const hNameChanged = hashFood({ ...baseFood, name_tr: "Yeşil Elma" });
t("3a. name_tr değişince hash DEĞİŞİR (§7 fix)", hBase !== hNameChanged);

const hAliasContentChanged = hashFood({ ...baseFood, aliases: ["elma", "apple", "yesil elma"] });
t("3b. aliases içeriği değişince hash DEĞİŞİR", hBase !== hAliasContentChanged);

const hAliasReordered = hashFood({ ...baseFood, aliases: ["apple", "elma"] });
t("3c. aliases SIRASI değişince hash AYNI (kanonik sıralama)", hBase === hAliasReordered);

// name_en değişince de değişir (regresyonun tamlığı).
const hEnChanged = hashFood({ ...baseFood, name_en: "Apple" });
t("3d. name_en değişince hash DEĞİŞİR", hBase !== hEnChanged);

// aliases orijinal dizi mutasyona uğramadı (sort KOPYA üzerinde).
const aliasRef = ["banana", "apple", "elma"];
hashFood({ ...baseFood, aliases: aliasRef });
t("3e. hashFood orijinal aliases dizisini mutasyona uğratmaz", JSON.stringify(aliasRef) === JSON.stringify(["banana", "apple", "elma"]));

// ── 4. dry-run plan deterministik ──
let planA, planB;
try {
  const d1 = readManifest(MANIFEST);
  planA = computePlan(d1);
  const d2 = readManifest(MANIFEST);
  planB = computePlan(d2);
  t("4. computePlan iki koşuda deterministik", JSON.stringify(planA) === JSON.stringify(planB));
} catch (e) {
  t(`4. computePlan deterministik (${e.message})`, false);
}

// ── 5. dedup güvenliği: aynı fdc_id çift sayılmaz ──
if (doc && Array.isArray(doc.foods) && doc.foods.length > 0) {
  const dupDoc = { ...doc, foods: [...doc.foods, { ...doc.foods[0] }] }; // ilk food'u fdc_id ile tekrar ekle
  const planOrig = computePlan(doc);
  const planDup = computePlan(dupDoc);
  t("5a. duplicate fdc_id food sayısını artırmaz", planOrig.foods === planDup.foods);
  t("5b. duplicate fdc_id external_ref sayısını artırmaz", planOrig.externalRefs === planDup.externalRefs);
  t("5c. duplicate fdc_id nutrient/porsiyon sayısını artırmaz",
    planOrig.nutrients === planDup.nutrients && planOrig.portions === planDup.portions);
  // tekil food sayısı == tekil fdc_id sayısı.
  const uniqFdc = new Set(doc.foods.map((f) => f.fdc_id)).size;
  t("5d. plan.foods == tekil fdc_id sayısı", planOrig.foods === uniqFdc);
} else {
  // Boş foods: dedup mantığı sıfır satırla da güvenli olmalı.
  const planEmpty = computePlan(doc ?? { foods: [] });
  t("5. boş foods planı 0 (dedup güvenli)", planEmpty.foods === 0 && planEmpty.externalRefs === 0);
}

// ── rapor ──
console.log(`\n${"=".repeat(52)}`);
console.log(`  CATALOG HARNESS: ${pass} PASS / ${fail} FAIL`);
if (fail) {
  console.log(`  FAILURES:\n   - ${fails.join("\n   - ")}`);
  console.log("=".repeat(52));
  process.exit(1);
}
console.log("  ✅ Tüm katalog pipeline kontrolleri GEÇTİ");
console.log("=".repeat(52));
process.exit(0);
