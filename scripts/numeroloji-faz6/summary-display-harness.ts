/**
 * NUMEROLOJİ — SONUÇ ÖZETİ DISPLAY SADELEŞTİRME (OWNER FINAL).
 *
 * OWNER KARARI (presentation-only; canonical result/key/lookup/combinedReading DEĞİŞMEZ):
 *   SONUÇ ÖZETİ'nde Ana/Yan Kulvar için:
 *     - combinedReading VAR (owner "22"/"33" hatırlatması)  → display AYNEN korunur.
 *         "11/11 (22)"     -> "11/11 (22)"
 *         "11/11/11 (33)"  -> "11/11/11 (33)"
 *     - combinedReading YOK → sondaki LEGACY decomposition parantezi gizlenir.
 *         "22/19 (11/3)"   -> "22/19"
 *         "33/6 (22/11/6)" -> "33/6"
 *         "22 (11-11)"     -> "22"
 *         "19/9"           -> "19/9"   (parantez yoksa değişmez)
 *
 *   Analiz (Hesap Özetli) tam display'i (nrDisplay) KULLANMAYA DEVAM EDER — bu helper
 *   YALNIZ Sonuç Özeti içindir. Engine/key/lookup byte-identical kalır.
 *
 * Çalıştır:  npx tsx scripts/numeroloji-faz6/summary-display-harness.ts
 */
import type { NumerolojiResult } from "@/lib/numeroloji";
import { hesaplaNumeroloji } from "@/lib/numeroloji";
import { formatKulvarSummaryDisplay, nrDisplay } from "@/app/numeroloji/utils/numerolojiPlainMetin";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(`  x ${label}${detail ? `  -> ${detail}` : ""}`); }
}
function eq<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  assert(a === e, label, a === e ? undefined : `beklenen ${e}, gelen ${a}`);
}
function mk(display: string, combinedReading?: string): NumerolojiResult {
  return { display, key: "X", steps: ["step-a", "step-b"], ...(combinedReading ? { combinedReading } : {}) };
}

// ── SUMMARY-01..07: birim formatlama kuralları ──────────────────────────────────
eq(formatKulvarSummaryDisplay(mk("22/19 (11/3)")), "22/19", "SUMMARY-01 legacy pair/kalan soyulur");
eq(formatKulvarSummaryDisplay(mk("33/6 (22/11/6)")), "33/6", "SUMMARY-02 çok-parçalı legacy soyulur");
eq(formatKulvarSummaryDisplay(mk("11/11 (22)", "22")), "11/11 (22)", "SUMMARY-03 combined (22) KORUNUR");
eq(formatKulvarSummaryDisplay(mk("11/11/11 (33)", "33")), "11/11/11 (33)", "SUMMARY-04 combined (33) KORUNUR");
eq(formatKulvarSummaryDisplay(mk("11/22 (33)", "33")), "11/22 (33)", "SUMMARY-05 combined (33) KORUNUR");
eq(formatKulvarSummaryDisplay(mk("19/9")), "19/9", "SUMMARY-06 düz (parantez yok) değişmez");
eq(formatKulvarSummaryDisplay(mk("22/22")), "22/22", "SUMMARY-07 düz (parantez yok) değişmez");

// ── Ek kenar durumları ──────────────────────────────────────────────────────────
eq(formatKulvarSummaryDisplay(mk("22 (11-11)")), "22", "EDGE legacy '-' ayraç soyulur");
eq(formatKulvarSummaryDisplay(null), "—", "EDGE null -> —");
eq(formatKulvarSummaryDisplay(mk("")), "—", "EDGE boş display -> —");
// Sadece tek trailing grup soyulur (iç içe/çoklu paren beklenmiyor, ama güvenli olmalı):
eq(formatKulvarSummaryDisplay(mk("11/11")), "11/11", "EDGE combined-yok, paren-yok değişmez");

// ── SUMMARY-08: canonical result MUTATE EDİLMEZ ─────────────────────────────────
{
  const r = mk("22/19 (11/3)");
  const snapshot = JSON.stringify(r);
  const out = formatKulvarSummaryDisplay(r);
  eq(out, "22/19", "SUMMARY-08a çıktı doğru");
  eq(JSON.stringify(r), snapshot, "SUMMARY-08b result objesi DEĞİŞMEDİ (mutation yok)");
  eq(nrDisplay(r), "22/19 (11/3)", "SUMMARY-08c nrDisplay (Hesap Özetli) tam display'i korur");
}

// ── OWNER GERÇEK UAT: Hasan ALİ / ARICI YILMAZ DEMİR / 14.02.1982 ────────────────
{
  const out = hesaplaNumeroloji({ firstName: "Hasan ALİ", lastName: "ARICI YILMAZ DEMİR", birthDate: "14.02.1982" });
  const ana = out.anaKulvar;
  const yan = out.yanKulvar;

  // Canonical (engine) DEĞİŞMEZ:
  eq(nrDisplay(ana), "19/9", "UAT canonical ANA display 19/9");
  eq(ana.key, "9", "UAT canonical ANA key 9");
  eq(nrDisplay(yan), "22/19 (11/3)", "UAT canonical YAN display 22/19 (11/3)");
  eq(yan.key, "19", "UAT canonical YAN key 19");
  assert(ana.combinedReading === undefined, "UAT ANA combinedReading yok");
  assert(yan.combinedReading === undefined, "UAT YAN combinedReading yok");

  // SONUÇ ÖZETİ render:
  eq(formatKulvarSummaryDisplay(ana), "19/9", "UAT SONUÇ ÖZETİ ANA -> 19/9");
  eq(formatKulvarSummaryDisplay(yan), "22/19", "UAT SONUÇ ÖZETİ YAN -> 22/19");

  // Hesap Özetli izleri korunur (decomposition steps mevcut):
  assert(yan.steps.some((s) => s.includes("11") && s.includes("özel")) || yan.steps.some((s) => s.includes("11 →")), "UAT YAN steps 11 pair izi korunur", yan.steps.join(" | "));
  assert(yan.steps.some((s) => s.includes("22")), "UAT YAN steps 22 izi korunur");
}

// ── COMBINED OWNER UAT: gerçek isimle 11/11 (22) korunur ────────────────────────
{
  // Ünlü token'ları: AEE -> 1+5+5=11 (ÖZEL). İki parça => [11,11], raw sum 22 => (22).
  const out = hesaplaNumeroloji({ firstName: "AEE AEE", lastName: "", birthDate: "01.01.2000" });
  const ana = out.anaKulvar;
  eq(nrDisplay(ana), "11/11 (22)", "COMBINED-UAT canonical ANA 11/11 (22)");
  eq(ana.combinedReading, "22", "COMBINED-UAT combinedReading=22");
  eq(formatKulvarSummaryDisplay(ana), "11/11 (22)", "COMBINED-UAT SONUÇ ÖZETİ 11/11 (22) KORUNUR");
  assert(formatKulvarSummaryDisplay(ana) !== "11/11", "COMBINED-UAT yanlışlıkla 11/11'e düşürülmedi");
}

console.log(`\nNUMEROLOJI — SONUÇ ÖZETİ DISPLAY: ${pass} PASS - ${fail} FAIL`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("Legacy parantez Sonuç Özeti'nde gizli; combined (22)/(33) korunur; engine/key/lookup byte-identical.");
