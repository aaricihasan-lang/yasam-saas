// ============================================================
// Beslenme — Porsiyon GÖSTERİM + Export GÖRÜNÜRLÜK harness (SAF, DB-siz, deterministik).
//
// Kapsam:
//   1) formatPortionLabel: "su bardağı" ithal ölçü → gram fallback (null); doğal porsiyon
//      normalizasyonu (2 × 1 dilim → "2 dilim"); duplicate/NaN/null savunması.
//      Web compact ve Word "—" davranışı aynı SAF çekirdekten türetilir (drift yok).
//   2) isExportVisibleForInput: karar CİHAZ YETENEĞİYLE (hover+pointer), viewport GENİŞLİĞİYLE
//      DEĞİL. Masaüstü (hover+fine) her genişlikte görünür; dokunmatik (coarse/no-hover) gizli.
//      Width tek başına görünürlük kararı vermez. CSS sınıfı ile media query drift guard'ı
//      globals.css'in aynı koşulu (EXPORT_DESKTOP_MEDIA_QUERY) kodladığını doğrular.
//
// Çalıştır:  npx tsx scripts/beslenme-word/portionDisplayHarness.mjs
// FAIL → exit 1.
// ============================================================
import { readFileSync } from "node:fs";
import { formatPortionLabel } from "../../lib/beslenme/portionDisplay.ts";
import {
  isExportVisibleForInput,
  EXPORT_DESKTOP_ONLY_CLASS,
  EXPORT_DESKTOP_MEDIA_QUERY,
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

console.log("\n── isExportVisibleForInput (CİHAZ YETENEĞİ · genişlik karar vermez) ──");
const desktop = (widthPx) => ({ hover: "hover", pointer: "fine", widthPx });
const phone = (widthPx) => ({ hover: "none", pointer: "coarse", widthPx });
const tablet = (widthPx) => ({ hover: "none", pointer: "coarse", widthPx });

// Masaüstü (fare/trackpad): genişlik NE OLURSA OLSUN görünür — 1280 altı dahil.
eq("desktop 1024 visible", isExportVisibleForInput(desktop(1024)), true);
eq("desktop 1100 visible", isExportVisibleForInput(desktop(1100)), true);
eq("desktop 1200 visible", isExportVisibleForInput(desktop(1200)), true);
eq("desktop 1280 visible", isExportVisibleForInput(desktop(1280)), true);
eq("desktop 1600 visible", isExportVisibleForInput(desktop(1600)), true);
// Telefon (dokunmatik): gizli.
eq("phone 375 hidden", isExportVisibleForInput(phone(375)), false);
eq("phone 390 hidden", isExportVisibleForInput(phone(390)), false);
// Tablet (dokunmatik): 1024 geniş olsa da gizli.
eq("tablet 768 hidden", isExportVisibleForInput(tablet(768)), false);
eq("tablet 1024 hidden", isExportVisibleForInput(tablet(1024)), false);
// Android WebView / touch (hover:none + pointer:coarse) → gizli.
eq("android-webview hidden", isExportVisibleForInput({ hover: "none", pointer: "coarse", widthPx: 1280 }), false);
// Hibrit dokunmatik-öncelikli (hover yok ama fine pen) → gizli (hover ŞART).
eq("stylus no-hover hidden", isExportVisibleForInput({ hover: "none", pointer: "fine", widthPx: 1366 }), false);
// KRİTİK: WIDTH TEK BAŞINA KARAR VERMEZ — aynı 1024'te capability sonucu belirler.
eq("width-only removed (1024 desktop≠tablet)",
  isExportVisibleForInput(desktop(1024)) !== isExportVisibleForInput(tablet(1024)), true);
// Aynı masaüstü capability, farklı genişlik → AYNI sonuç (genişlik etkisiz).
eq("width-independent (desktop 1024==1600)",
  isExportVisibleForInput(desktop(1024)) === isExportVisibleForInput(desktop(1600)), true);

console.log("\n── CSS ↔ predicate drift guard (globals.css tek kaynak) ──");
const globalsCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
eq("class = beslenme-export-desktop-only", EXPORT_DESKTOP_ONLY_CLASS, "beslenme-export-desktop-only");
eq("class NOT width-based (no xl:)", /(^|\s)xl:/.test(EXPORT_DESKTOP_ONLY_CLASS), false);
eq("globals defines class", globalsCss.includes(`.${EXPORT_DESKTOP_ONLY_CLASS}`), true);
eq("globals hides class by default",
  new RegExp(`\\.${EXPORT_DESKTOP_ONLY_CLASS}\\s*\\{\\s*display:\\s*none`).test(globalsCss), true);
eq("globals encodes capability media query", globalsCss.includes(`@media ${EXPORT_DESKTOP_MEDIA_QUERY}`), true);
eq("globals has NO width breakpoint for export",
  /beslenme-export-desktop-only[\s\S]*?@media[^{]*min-width/.test(globalsCss), false);

console.log(`\n${fail === 0 ? "✅" : "❌"} portion+export harness: ${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.log("FAILURES:", failures.join(", "));
  process.exit(1);
}
