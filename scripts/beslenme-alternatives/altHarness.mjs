// ============================================================
// Beslenme FAZ 6 — Yaklaşık Besin Alternatifleri SAF-FONKSİYON HARNESS'İ.
// DB/ağ YOK. Gerçek lib/beslenme/alternativeEngine.ts import edilir
// (server-only stub + Node 24 native TS type-stripping; altLoader.mjs).
//   node scripts/beslenme-alternatives/altHarness.mjs
// FAIL → exit 1.
// ============================================================
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
register("./altLoader.mjs", pathToFileURL(join(HERE, "/")).href);

const ENGINE = pathToFileURL(join(HERE, "..", "..", "lib", "beslenme", "alternativeEngine.ts")).href;
const { scoreAlternatives, altGramsForEnergyMatch, ALT_TOP_N } = await import(ENGINE);

let pass = 0;
let fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++;
  else fail++;
}

// Yardımcı: aday üret.
const cand = (food_id, name_tr, energyPer100, macros = {}, food_group_id = null, ownership = "system") => ({
  food_id,
  name_tr,
  food_group_id,
  ownership,
  energyPer100,
  macrosPer100: macros,
});

const M = { protein: 5, carbohydrate: 20, total_fat: 1, fiber: 2 };
const target = { energyPer100: 100, macrosPer100: M };

// ── [1] Enerji bandı ±10% (≥5 aday) ──────────────────────────────────────────
{
  const cands = [
    cand("a1", "A", 95, M),
    cand("a2", "B", 100, M),
    cand("a3", "C", 105, M),
    cand("a4", "D", 108, M),
    cand("a5", "E", 92, M),
    cand("out", "Z-Uzak", 130, M), // ±10% dışı → dışlanmalı
  ];
  const r = scoreAlternatives(target, cands, { sameGroupOnly: false, targetGroupId: null });
  check("[1] band ±10% seçildi (≥5 dar-bant aday)", r.length === 5 && r.every((x) => x.band === "±10%"));
  check("[1] ±10% dışı aday (130) dışlandı", !r.some((x) => x.food_id === "out"));
}

// ── [2] Bant genişleme ±20% (dar bantta <5 aday) ─────────────────────────────
{
  const cands = [
    cand("b1", "A", 95, M),
    cand("b2", "B", 100, M),
    cand("b3", "C", 105, M), // dar bant = 3 (<5)
    cand("b4", "D", 85, M), // ±20% içi
    cand("b5", "E", 118, M), // ±20% içi
    cand("far", "Z", 150, M), // ±20% dışı
  ];
  const r = scoreAlternatives(target, cands, { sameGroupOnly: false, targetGroupId: null });
  check("[2] band ±20%'e genişledi", r.length === 5 && r.every((x) => x.band === "±20%"));
  check("[2] ±20% dışı aday (150) dışlandı", !r.some((x) => x.food_id === "far"));
}

// ── [3] Aynı-grup filtresi ────────────────────────────────────────────────────
{
  const cands = [
    cand("g1", "A", 98, M, "G1"),
    cand("g2", "B", 101, M, "G1"),
    cand("g3", "C", 103, M, "G2"),
    cand("g4", "D", 97, M, "G2"),
  ];
  const r = scoreAlternatives(target, cands, { sameGroupOnly: true, targetGroupId: "G1" });
  check("[3] yalnız hedef grup (G1) döndü", r.length === 2 && r.every((x) => x.food_id === "g1" || x.food_id === "g2"));
  const r2 = scoreAlternatives(target, cands, { sameGroupOnly: false, targetGroupId: "G1" });
  check("[3] sameGroupOnly=false → grup filtresi uygulanmaz", r2.length === 4);
}

// ── [4] Amount-match gram formülü (Elma 182g=94.64kcal, Muz 89/100 → 106g) ────
{
  const energyTotal = (52 * 182) / 100; // Elma 52 kcal/100g × 182g = 94.64
  const grams = altGramsForEnergyMatch(energyTotal, 89); // Muz 89 kcal/100g
  check("[4] energyTotal ≈ 94.64", Math.abs(energyTotal - 94.64) < 1e-9);
  check("[4] Muz gram = 106", grams === 106);
  check("[4] candEnergy ≤ 0 → 0 (divide-by-zero güvenliği)", altGramsForEnergyMatch(94.64, 0) === 0);
}

// ── [5] Sıfır/eksik enerjili aday dışlanır ───────────────────────────────────
{
  const cands = [
    cand("ok", "A", 100, M),
    cand("zero", "B", 0, M), // energy 0 → dışla
    cand("neg", "C", -10, M), // negatif → dışla
  ];
  const r = scoreAlternatives(target, cands, { sameGroupOnly: false, targetGroupId: null });
  check("[5] energy≤0 adaylar dışlandı", r.length === 1 && r[0].food_id === "ok");
}

// ── [6] Deterministik eşitlik sırası (distance → name_tr 'tr' → food_id) ─────
{
  // İki özdeş-metrik aday: name_tr farklı → localeCompare('tr') Elma < Muz.
  const cands = [
    cand("z", "Muz", 100, M),
    cand("a", "Elma", 100, M),
  ];
  const r = scoreAlternatives(target, cands, { sameGroupOnly: false, targetGroupId: null });
  check("[6] eşit distance → name_tr 'tr' sırası (Elma önce)", r[0].name_tr === "Elma" && r[1].name_tr === "Muz");

  // Özdeş name_tr → food_id ASC tiebreak.
  const cands2 = [
    cand("f-2", "Bal", 100, M),
    cand("f-1", "Bal", 100, M),
  ];
  const r2 = scoreAlternatives(target, cands2, { sameGroupOnly: false, targetGroupId: null });
  check("[6] eşit name_tr → food_id ASC (f-1 önce)", r2[0].food_id === "f-1" && r2[1].food_id === "f-2");
}

// ── [7] Eksik makro güvenli (NaN yok) ────────────────────────────────────────
{
  const cands = [
    cand("m1", "A", 100, { protein: 5, carbohydrate: 20 }), // total_fat/fiber eksik → 0
    cand("m2", "B", 100, {}), // tüm makro eksik → 0
  ];
  const r = scoreAlternatives(target, cands, { sameGroupOnly: false, targetGroupId: null });
  check("[7] eksik makro → distance sonlu (NaN yok)", r.length === 2 && r.every((x) => Number.isFinite(x.distance)));
}

// ── [8] Hedef besinin kendisi dışlanır ───────────────────────────────────────
{
  const cands = [
    cand("self", "Kendisi", 100, M),
    cand("other", "Diğer", 100, M),
  ];
  const r = scoreAlternatives(target, cands, { sameGroupOnly: false, targetGroupId: null, targetFoodId: "self" });
  check("[8] targetFoodId havuzdan dışlandı", r.length === 1 && r[0].food_id === "other");
}

// ── [9] Top-N sınırı (≤20) + distance ASC monoton ────────────────────────────
{
  const cands = [];
  for (let i = 0; i < 30; i++) cands.push(cand(`c${i}`, `Aday ${i}`, 95 + (i % 11), M));
  const r = scoreAlternatives(target, cands, { sameGroupOnly: false, targetGroupId: null });
  check(`[9] top-N ≤ ${ALT_TOP_N}`, r.length <= ALT_TOP_N);
  let mono = true;
  for (let i = 1; i < r.length; i++) if (r[i].distance < r[i - 1].distance) mono = false;
  check("[9] distance ASC monoton", mono);
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
