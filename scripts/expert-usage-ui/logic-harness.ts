/**
 * FAZ 2 — UI SAF MANTIK harness (yan-etkisiz). Byte/tarih biçimleme, göreli zaman,
 * MetricValue → görünüm sınıflandırması, arşiv⊆pasif tutarlılığı. DB gerektirmez.
 * Çalıştır: npx tsx scripts/expert-usage-ui/logic-harness.ts
 */
import {
  formatBytes, formatRelativeTr, formatDateTimeTr,
  metricDisplayKind, metricPlaceholder, isConsistentCounts, trCalendarDate,
} from "../../lib/admin/stats/uiFormat";
import { makeMetric, unavailableMetric } from "../../lib/admin/stats/contract";

let passed = 0, failed = 0;
const ok = (c: boolean, l: string) => { if (c) { passed++; console.log(`  ✓ ${l}`); } else { failed++; console.error(`  ✗ ${l}`); } };

console.log("\n[1] formatBytes");
ok(formatBytes(0) === "0 B", "0 → 0 B");
ok(formatBytes(1023) === "1023 B", "1023 → 1023 B");
ok(formatBytes(1024) === "1.0 KB", "1024 → 1.0 KB");
ok(formatBytes(1536) === "1.5 KB", "1536 → 1.5 KB");
ok(formatBytes(1048576) === "1.0 MB", "1MB");
ok(formatBytes(5 * 1073741824) === "5.0 GB", "5GB");
ok(formatBytes(-5) === "—", "negatif → —");
ok(formatBytes(null) === "—", "null → —");

console.log("\n[2] formatRelativeTr (TR, sabit now)");
const NOW = Date.parse("2027-02-01T12:00:00Z");
ok(formatRelativeTr(new Date(NOW - 30000).toISOString(), NOW) === "az önce", "30sn → az önce");
ok(formatRelativeTr(new Date(NOW - 5 * 60000).toISOString(), NOW) === "5 dk önce", "5dk");
ok(formatRelativeTr(new Date(NOW - 2 * 3600000).toISOString(), NOW) === "2 saat önce", "2 saat");
ok(formatRelativeTr(new Date(NOW - 2 * 86400000).toISOString(), NOW) === "2 gün önce", "2 gün");
ok(/\d{2}\.\d{2}\.\d{4}/.test(formatRelativeTr(new Date(NOW - 40 * 86400000).toISOString(), NOW)), "40 gün → tam tarih");
ok(formatRelativeTr(null, NOW) === "—", "null → —");
ok(formatDateTimeTr("not-a-date") === "—", "geçersiz tarih → —");

console.log("\n[3] metricDisplayKind (measured/approximate/unavailable/zero/empty)");
ok(metricDisplayKind(makeMetric(5, "user", "measured", "count")) === "value", "measured>0 → value");
ok(metricDisplayKind(makeMetric(0, "user", "measured", "count")) === "zero", "measured 0 → zero (gerçek sıfır)");
ok(metricDisplayKind(makeMetric(3, "user", "approximate", "day")) === "approximate", "approximate → approximate");
ok(metricDisplayKind(unavailableMetric<number>("user", "count")) === "unavailable", "unavailable → unavailable");
ok(metricDisplayKind(makeMetric<number>(null, "user", "measured", "count")) === "empty", "value null (measured) → empty");
ok(metricDisplayKind(makeMetric(7, "user", "derived", "count")) === "value", "derived değer → value");
ok(metricPlaceholder("unavailable") === "Ölçülemiyor" && metricPlaceholder("empty") === "Veri yok", "placeholder etiketleri");

console.log("\n[4] isConsistentCounts (arşiv ⊆ pasif; toplam = aktif + pasif)");
ok(isConsistentCounts(30, 8, 4, 38) === true, "30+8=38, arşiv 4<=8 → tutarlı");
ok(isConsistentCounts(30, 8, 10, 38) === false, "arşiv>pasif → tutarsız");
ok(isConsistentCounts(30, 8, 4, 40) === false, "toplam≠aktif+pasif → tutarsız");

console.log("\n[5] trCalendarDate (TR takvim günü; +03 sınır)");
ok(trCalendarDate("2027-02-01T20:00:00Z") === "2027-02-01", "UTC 20:00 → TR aynı gün (23:00)");
ok(trCalendarDate("2027-02-01T21:30:00Z") === "2027-02-02", "UTC 21:30 → TR ertesi gün (00:30)");
// Yarı-açık üst sınır: (bitiş+1) 00:00 TR = bitiş 21:00 UTC; -1ms → bitiş günü (kaymaz).
ok(trCalendarDate(new Date(Date.parse("2027-02-10T00:00:00+03:00") - 1).toISOString()) === "2027-02-09", "yarı-açık üst sınır -1ms → önceki takvim günü (bitiş kaymaz)");
ok(trCalendarDate("2027-02-05T00:00:00+03:00") === "2027-02-05", "TR gece yarısı → o gün (from tarafı kaymaz)");
ok(trCalendarDate(null) === null && trCalendarDate("bad") === null, "geçersiz → null");

console.log(`\n──────────\nUI LOGIC: PASS ${passed} · FAIL ${failed}`);
if (failed > 0) process.exit(1);
