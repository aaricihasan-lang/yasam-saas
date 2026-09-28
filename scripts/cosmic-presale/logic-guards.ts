/**
 * scripts/cosmic-presale/logic-guards.ts
 *
 * Saf (DB'siz) mantık testleri:
 *   §18F — Merkezî tarih aralığı guard'ı (01.01.2026–31.12.2100; MIN±1, MAX±1, clamp, navigasyon, geçersiz)
 *   §18J — Hacamat rapor payload doğrulaması (malformed/oversized → güvenli red)
 *
 * Çalıştırma: npx tsx scripts/cosmic-presale/logic-guards.ts
 */
import {
  SUPPORT_START, SUPPORT_END, SUPPORT_START_YEAR, SUPPORT_END_YEAR,
  isWithinSupportedRange, checkSupportedRange, clampToSupported, canNavigateMonth,
} from "../../lib/cosmic/dateRange";
import { validateHacamatReportPayload, MAX_REPORT_RULES } from "../../lib/cosmic/hacamatReport";

let failures = 0;
const check = (cond: boolean, msg: string) => cond ? console.log("  ✓ " + msg) : (failures++, console.error("  ✗ " + msg));

console.log("\n=== §18F Tarih Aralığı Guard'ı (ürün kararı: 01.01.2026–31.12.2100) ===");
// SUPPORT_START = 2026-01-01 00:00 yerel ; SUPPORT_END = 2100-12-31 23:59:59.999 yerel (gün-anahtarı bazlı)
check(!isWithinSupportedRange(new Date(2025, 11, 31, 12)), "MIN−1 (2025-12-31) kapsam DIŞI");
check(isWithinSupportedRange(SUPPORT_START), "MIN (2026-01-01 00:00) kapsam İÇİ");
check(isWithinSupportedRange(new Date(2026, 0, 2)), "MIN+1 (2026-01-02) kapsam İÇİ");
check(isWithinSupportedRange(new Date(2100, 11, 30)), "MAX−1 (2100-12-30) kapsam İÇİ");
check(isWithinSupportedRange(SUPPORT_END), "MAX (2100-12-31 23:59) kapsam İÇİ");
check(isWithinSupportedRange(new Date(2100, 11, 31, 12)), "2100-12-31 12:00 kapsam İÇİ (2100 tam kapsanır)");
check(!isWithinSupportedRange(new Date(2101, 0, 1)), "MAX+1 (2101-01-01) kapsam DIŞI");
check(!isWithinSupportedRange(new Date("invalid")), "Geçersiz Date kapsam DIŞI");
check(checkSupportedRange(new Date("invalid")).ok === false && (checkSupportedRange(new Date("invalid")) as { reason: string }).reason === "invalid", "Geçersiz → reason 'invalid'");
check((checkSupportedRange(new Date(2020, 0, 1)) as { reason: string }).reason === "before", "2020 → reason 'before'");
check((checkSupportedRange(new Date(2101, 0, 1)) as { reason: string }).reason === "after", "2101 → reason 'after'");

// clamp — gün seçimi DAİMA yerel 00:00 (G8-C: gizli 23:59:59 referansı yok)
check(clampToSupported(new Date(1600, 0, 1)).getTime() === SUPPORT_START.getTime(), "clamp(1600) → 01.01.2026 00:00");
check(clampToSupported(new Date(2300, 0, 1)).getTime() === new Date(2100, 11, 31).getTime(), "clamp(2300) → 31.12.2100 00:00");
check(clampToSupported(new Date(2030, 5, 15)).getFullYear() === 2030, "clamp(içerideki) günü değişmez");

// navigasyon: başlangıç ayından geri, bitiş ayından ileri gidilemez
check(canNavigateMonth(2026, 1, -1) === true, "Şub 2026'dan geri → izin (Oca 2026 içeride)");
check(canNavigateMonth(2026, 0, -1) === false, "Oca 2026'dan geri → YASAK (Ara 2025 dışarıda)");
check(canNavigateMonth(2100, 10, 1) === true, "Kas 2100'den ileri → izin (Ara 2100 içeride)");
check(canNavigateMonth(2100, 11, 1) === false, "Ara 2100'den ileri → YASAK (Oca 2101 dışarıda)");
check(SUPPORT_START_YEAR === 2026 && SUPPORT_END_YEAR === 2100, "SUPPORT yıl sabitleri 2026-2100");

console.log("\n=== §18J Hacamat Rapor Payload Doğrulaması ===");
const okPayload = { year: 2027, month: 5, rules: [{ rule_text: "x", category: "before" }], expertNotes: "not", title: "T", expertName: "U", includeSections: {} };
check(validateHacamatReportPayload(okPayload).ok === true, "geçerli payload → ok");
check(validateHacamatReportPayload(null).ok === false, "null gövde → red");
check(validateHacamatReportPayload("string").ok === false, "string gövde → red");
check(validateHacamatReportPayload({ year: 2027, month: 5, rules: "x" }).ok === false, "rules dizi değil → red");
check(validateHacamatReportPayload({ year: 2027, month: 5, rules: {} }).ok === false, "rules obje → red");
check(validateHacamatReportPayload({ year: 2027, month: 13 }).ok === false, "ay 13 → red");
check(validateHacamatReportPayload({ year: 2027, month: -1 }).ok === false, "ay -1 → red");
check(validateHacamatReportPayload({ year: 1999, month: 5 }).ok === false, "yıl kapsam dışı → red");
check(validateHacamatReportPayload({ year: 2101, month: 5 }).ok === false, "yıl 2101 → red");
check(validateHacamatReportPayload({ year: 2100, month: 11 }).ok === true, "yıl 2100 → kabul");
check(validateHacamatReportPayload({ year: 2025, month: 11 }).ok === false, "yıl 2025 → red");
check(validateHacamatReportPayload({ year: 2027, month: 5, rules: [{ rule_text: null, category: "before" }] }).ok === false, "rule_text null → red");
check(validateHacamatReportPayload({ year: 2027, month: 5, rules: [{ rule_text: "x", category: "bad" }] }).ok === false, "kategori geçersiz → red");
check(validateHacamatReportPayload({ year: 2027, month: 5, rules: [{ rule_text: "  ", category: "before" }] }).ok === false, "boş rule_text → red");
check(validateHacamatReportPayload({ year: 2027, month: 5, rules: Array.from({ length: MAX_REPORT_RULES + 1 }, () => ({ rule_text: "x", category: "before" })) }).ok === false, `${MAX_REPORT_RULES}+ kural → red (abuse cap)`);
check(validateHacamatReportPayload({ year: 2027, month: 5, rules: [{ rule_text: "a".repeat(3000), category: "before" }] }).ok === false, "aşırı uzun rule_text → red");
check(validateHacamatReportPayload({ year: 2027, month: 5, expertNotes: 12345 }).ok === false, "expertNotes sayı → red");
check(validateHacamatReportPayload({ year: 2027, month: 5, expertNotes: "a".repeat(9000) }).ok === false, "aşırı uzun expertNotes → red");
// Boş rules varsayılanı geçerli (year/month yeterli)
check(validateHacamatReportPayload({ year: 2027, month: 5 }).ok === true, "yalnız year/month (rules default []) → ok");

console.log(`\n=== SONUÇ: ${failures === 0 ? "✅ TÜM MANTIK TESTLERİ GEÇTİ" : `❌ ${failures} HATA`} ===`);
process.exit(failures === 0 ? 0 : 1);
