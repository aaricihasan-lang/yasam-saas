// ============================================================
// Beslenme — Porsiyon GÖSTERİM + Export GÖRÜNÜRLÜK harness (SAF, DB-siz, deterministik).
//
// Kapsam:
//   1) formatPortionLabel: "su bardağı" ithal ölçü → gram fallback (null); doğal porsiyon
//      normalizasyonu (2 × 1 dilim → "2 dilim"); duplicate/NaN/null savunması.
//      Web compact ve Word "—" davranışı aynı SAF çekirdekten türetilir (drift yok).
//   2) isExportVisibleAtWidth: mobil/tablet gizli (375/390/768/1024) · masaüstü görünür (1280).
//      CSS sınıfı (EXPORT_DESKTOP_ONLY_CLASS) xl eşiğini kodlar; predicate ile aynı kaynağı paylaşır.
//
// Çalıştır:  npx tsx scripts/beslenme-word/portionDisplayHarness.mjs
// FAIL → exit 1.
// ============================================================
import { formatPortionLabel } from "../../lib/beslenme/portionDisplay.ts";
import {
  isExportVisibleAtWidth,
  EXPORT_DESKTOP_ONLY_CLASS,
  XL_BREAKPOINT_PX,
} from "../../lib/beslenme/exportVisibility.ts";

let pass = 0,
  fail = 0;
const failures = [];
const eq = (name, got, want) => {
  const ok = got === want;
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name} — got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  }
};

// Web compact simülasyonu (MealCard mantığı): doğal porsiyon + gram, yoksa gram fallback.
const webCompact = (quantity, portionLabel, gramsText) => {
  const nat = formatPortionLabel({ quantity, portionLabel });
  return nat ? `${nat} · ${gramsText}` : gramsText;
};
// Word Miktar hücresi simülasyonu (planDocxBuilder mantığı): doğal porsiyon veya "—".
const wordCell = (quantity, portionLabel) =>
  formatPortionLabel({ quantity, portionLabel }) ?? "—";

console.log("── formatPortionLabel (çekirdek) ──");
// A. su bardağı → gram
eq("A label", formatPortionLabel({ quantity: 1, portionLabel: "1 su bardağı" }), null);
eq("A web", webCompact(1, "1 su bardağı", "140 g"), "140 g");
eq("A word", wordCell(1, "1 su bardağı"), "—");
// B. su bardağı → gram (182)
eq("B web", webCompact(1, "1 su bardağı", "182 g"), "182 g");
eq("B word", wordCell(1, "1 su bardağı"), "—");
// C. qty=2 + 0.5 su bardağı → gram
eq("C label", formatPortionLabel({ quantity: 2, portionLabel: "0.5 su bardağı" }), null);
eq("C web", webCompact(2, "0.5 su bardağı", "156 g"), "156 g");
eq("C word", wordCell(2, "0.5 su bardağı"), "—");
// D. qty=2 + "1 dilim" → "2 dilim"
eq("D label", formatPortionLabel({ quantity: 2, portionLabel: "1 dilim" }), "2 dilim");
eq("D web", webCompact(2, "1 dilim", "64 g"), "2 dilim · 64 g");
eq("D word", wordCell(2, "1 dilim"), "2 dilim");
// E. qty=2 + "1 büyük boy" → "2 büyük boy"
eq("E label", formatPortionLabel({ quantity: 2, portionLabel: "1 büyük boy" }), "2 büyük boy");
eq("E web", webCompact(2, "1 büyük boy", "100 g"), "2 büyük boy · 100 g");
// F. qty=1 + "1 orta muz"
eq("F label", formatPortionLabel({ quantity: 1, portionLabel: "1 orta muz" }), "1 orta muz");
eq("F web", webCompact(1, "1 orta muz", "118 g"), "1 orta muz · 118 g");
// G. qty=1 + "1 porsiyon (28 g)" → duplicate yok
eq("G label", formatPortionLabel({ quantity: 1, portionLabel: "1 porsiyon (28 g)" }), "1 porsiyon (28 g)");
eq("G word", wordCell(1, "1 porsiyon (28 g)"), "1 porsiyon (28 g)");
// H. portion=null → gram
eq("H label", formatPortionLabel({ quantity: 1, portionLabel: null }), null);
eq("H web", webCompact(1, null, "28 g"), "28 g");
eq("H word", wordCell(1, null), "—");
// I. quantity=null + portion=null → gram
eq("I web", webCompact(null, null, "28 g"), "28 g");
// J. NaN/undefined/boş savunma
eq("J nan-qty label", formatPortionLabel({ quantity: NaN, portionLabel: "1 dilim" }), "1 dilim");
eq("J undef", formatPortionLabel({ quantity: undefined, portionLabel: undefined }), null);
eq("J blank", formatPortionLabel({ quantity: 1, portionLabel: "   " }), null);
eq("J case-insensitive cup", formatPortionLabel({ quantity: 1, portionLabel: "1 SU BARDAĞI" }), null);
// Ekstra: qty=1 + sayısız etiket olduğu gibi; qty≠1 + normalize edilemez → null
eq("K plain-label q1", formatPortionLabel({ quantity: 1, portionLabel: "orta boy" }), "orta boy");
eq("K plain-label q2 → null", formatPortionLabel({ quantity: 2, portionLabel: "orta boy" }), null);

console.log("\n── isExportVisibleAtWidth (mobil/tablet gizli · masaüstü görünür) ──");
eq("375 hidden", isExportVisibleAtWidth(375), false);
eq("390 hidden", isExportVisibleAtWidth(390), false);
eq("768 hidden", isExportVisibleAtWidth(768), false);
eq("1024 hidden", isExportVisibleAtWidth(1024), false);
eq("1279 hidden", isExportVisibleAtWidth(1279), false);
eq("1280 visible", isExportVisibleAtWidth(1280), true);
eq("1440 visible", isExportVisibleAtWidth(1440), true);
eq("NaN defensive", isExportVisibleAtWidth(NaN), false);
// CSS sınıfı ile predicate aynı eşiği paylaşır (drift guard)
eq("class encodes xl", /(^|\s)xl:/.test(EXPORT_DESKTOP_ONLY_CLASS), true);
eq("class hides by default", /(^|\s)hidden(\s|$)/.test(EXPORT_DESKTOP_ONLY_CLASS), true);
eq("xl breakpoint = 1280", XL_BREAKPOINT_PX, 1280);

console.log(`\n${fail === 0 ? "✅" : "❌"} portion+export harness: ${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.log("FAILURES:", failures.join(", "));
  process.exit(1);
}
