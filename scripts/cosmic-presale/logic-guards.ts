/**
 * scripts/cosmic-presale/logic-guards.ts
 *
 * Saf (DB'siz) mantık testleri:
 *   §18F — Merkezî tarih aralığı guard'ı (MIN±1, MAX±1, clamp, navigasyon, geçersiz)
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

console.log("\n=== §18F Tarih Aralığı Guard'ı ===");
// SUPPORT_START = 2026-06-20 00:00 yerel ; SUPPORT_END = 2050-12-31 23:59:59.999 yerel
check(!isWithinSupportedRange(new Date(2026, 5, 19, 12)), "MIN−1 (2026-06-19) kapsam DIŞI");
check(isWithinSupportedRange(SUPPORT_START), "MIN (2026-06-20 00:00) kapsam İÇİ");
check(isWithinSupportedRange(new Date(2026, 5, 21)), "MIN+1 (2026-06-21) kapsam İÇİ");
check(isWithinSupportedRange(new Date(2050, 11, 30)), "MAX−1 (2050-12-30) kapsam İÇİ");
check(isWithinSupportedRange(SUPPORT_END), "MAX (2050-12-31 23:59) kapsam İÇİ");
check(isWithinSupportedRange(new Date(2050, 11, 31, 12)), "2050-12-31 12:00 kapsam İÇİ (2050 tam kapsanır)");
check(!isWithinSupportedRange(new Date(2051, 0, 1)), "MAX+1 (2051-01-01) kapsam DIŞI");
check(!isWithinSupportedRange(new Date("invalid")), "Geçersiz Date kapsam DIŞI");
check(checkSupportedRange(new Date("invalid")).ok === false && (checkSupportedRange(new Date("invalid")) as { reason: string }).reason === "invalid", "Geçersiz → reason 'invalid'");
check((checkSupportedRange(new Date(2020, 0, 1)) as { reason: string }).reason === "before", "2020 → reason 'before'");
check((checkSupportedRange(new Date(2099, 0, 1)) as { reason: string }).reason === "after", "2099 → reason 'after'");

// clamp
check(clampToSupported(new Date(1600, 0, 1)).getTime() === SUPPORT_START.getTime(), "clamp(1600) → SUPPORT_START");
check(clampToSupported(new Date(2300, 0, 1)).getTime() === SUPPORT_END.getTime(), "clamp(2300) → SUPPORT_END");
check(clampToSupported(new Date(2030, 5, 15)).getFullYear() === 2030, "clamp(içerideki) değişmez");

// navigasyon: başlangıç ayından geri, bitiş ayından ileri gidilemez
check(canNavigateMonth(2026, 6, -1) === true, "Tem 2026'dan geri → izin (Haz 2026 içeride)");
check(canNavigateMonth(2026, 5, -1) === false, "Haz 2026'dan geri → YASAK (Mayıs 2026 dışarıda)");
check(canNavigateMonth(2050, 10, 1) === true, "Kas 2050'den ileri → izin (Ara 2050 içeride)");
check(canNavigateMonth(2050, 11, 1) === false, "Ara 2050'den ileri → YASAK (Oca 2051 dışarıda)");
check(SUPPORT_START_YEAR === 2026 && SUPPORT_END_YEAR === 2050, "SUPPORT yıl sabitleri 2026-2050");

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
check(validateHacamatReportPayload({ year: 2099, month: 5 }).ok === false, "yıl 2099 → red");
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
