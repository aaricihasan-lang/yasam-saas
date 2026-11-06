/**
 * Klasik Numeroloji — mükerrer kişi analizi tespiti (SAF) harness'i.
 * Çalıştır: npx tsx scripts/numeroloji-klasik/duplicate/duplicate.harness.ts
 */
import {
  CLASSIC_DUPLICATE_MAX,
  findClassicDuplicates,
  formatBirthTr,
  normalizeClassicFullName,
  validateDuplicateCheck,
  type ClassicDuplicateRow,
} from "../../../lib/numeroloji-klasik/duplicate";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`);
  }
}

const B = { year: 1950, month: 1, day: 1 };
const row = (id: string, fullName: unknown, birth: unknown, created: string, title = "T"): ClassicDuplicateRow => ({ id, title, input: { fullName, birth }, created_at: created });
const ids = (r: { id: string }[]) => r.map((x) => x.id).join(",");

console.log("— normalizasyon");
ok(normalizeClassicFullName("  Çağrı   GÜLŞEN  ") === "çağrı gülşen", "boşluk + Türkçe küçük harf");
ok(normalizeClassicFullName("IŞIK") === normalizeClassicFullName("Işık"), "IŞIK = Işık (tr-TR)");
ok(normalizeClassicFullName("İLKER") === normalizeClassicFullName("ilker"), "İLKER = ilker (tr-TR)");
ok(normalizeClassicFullName("ILGIN") !== normalizeClassicFullName("İlgin"), "I ≠ İ (ayrı harf)");
ok(normalizeClassicFullName("Cagri") !== normalizeClassicFullName("Çağrı"), "C/Ç, g/ğ, i/ı eşitlenmez");
ok(normalizeClassicFullName("Şule") !== normalizeClassicFullName("Sule") && normalizeClassicFullName("Ömer") !== normalizeClassicFullName("Omer") && normalizeClassicFullName("Ünal") !== normalizeClassicFullName("Unal"), "Ş/S, Ö/O, Ü/U eşitlenmez");
ok(normalizeClassicFullName("İlker") === normalizeClassicFullName("İlker"), "ayrık İ (I + U+0307) NFC ile aynı");
ok(normalizeClassicFullName("O’Neil") === normalizeClassicFullName("O'Neil"), "’ = ' (canonicalName ile aynı)");
ok(normalizeClassicFullName("Ali-Veli") !== normalizeClassicFullName("Ali Veli"), "tire korunur");
ok(normalizeClassicFullName(42) === "" && normalizeClassicFullName(null) === "", "metin değil → boş");

console.log("— eşleştirme");
const rows = [
  row("a1", "Çağrı Gülşen ŞÜKRÜOĞLU", B, "2026-11-01T10:00:00Z"),
  row("a2", "çağrı  gülşen şükrüoğlu", { ...B }, "2026-11-03T10:00:00Z"),
  row("a3", "Çağrı Gülşen ŞÜKRÜOĞLU", { year: 1950, month: 1, day: 2 }, "2026-11-04T10:00:00Z"),
  row("a4", "Cagri Gulsen SUKRUOGLU", B, "2026-11-05T10:00:00Z"),
  row("a5", "Çağrı Gülşen ŞÜKRÜOĞLU", null, "2026-11-05T11:00:00Z"),
  row("a6", null, B, "2026-11-05T12:00:00Z"),
  row("a7", "Çağrı Gülşen ŞÜKRÜOĞLU", { year: "1950", month: 1, day: 1 }, "2026-11-05T13:00:00Z"),
];
const m = findClassicDuplicates(rows, { fullName: "ÇAĞRI GÜLŞEN ŞÜKRÜOĞLU", birth: B, excludeId: null });
ok(ids(m) === "a2,a1", "aynı ad + tam doğum → a2,a1 (en yeni önce)", ids(m));
ok(!m.some((x) => x.id === "a3"), "farklı gün eşleşmez");
ok(!m.some((x) => x.id === "a4"), "Türkçe harfsiz yazım eşleşmez (yanlış pozitif yok)");
ok(!m.some((x) => ["a5", "a6", "a7"].includes(x.id)), "eksik / bozuk girdi eşleşme üretmez");
ok(m[0].fullName === "çağrı  gülşen şükrüoğlu" && m[0].birth.day === 1, "kayıttaki ad + doğum aynen döner");
ok(ids(findClassicDuplicates(rows, { fullName: "Çağrı Gülşen Şükrüoğlu", birth: B, excludeId: "A2" })) === "a1", "excludeId (büyük/küçük harf farksız) düzenlenen kaynağı çıkarır");
ok(findClassicDuplicates(rows, { fullName: "  ", birth: B, excludeId: null }).length === 0, "boş ad → eşleşme yok");
ok(findClassicDuplicates(null, { fullName: "Ali", birth: B, excludeId: null }).length === 0, "liste yok → boş");
const many = Array.from({ length: 30 }, (_, i) => row(`m${String(i).padStart(2, "0")}`, "Ali Veli", B, `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
const mm = findClassicDuplicates(many, { fullName: "ali veli", birth: B, excludeId: null });
ok(mm.length === 30 && mm[0].id === "m29" && mm[29].id === "m00", "çoklu eşleşme: hepsi, en yeni önce");
ok(CLASSIC_DUPLICATE_MAX === 20, "gösterim üst sınırı 20 (route toplamı ayrıca bildirir)");

console.log("— gövde doğrulama");
const v1 = validateDuplicateCheck({ fullName: "  Ayşe   Can ", birth: { year: 1988, month: 2, day: 29 } });
ok(v1.ok && v1.value.fullName === "Ayşe Can" && v1.value.excludeId === null, "geçerli gövde (ad kanonik)", v1);
ok(!validateDuplicateCheck({ fullName: "Ayşe", birth: { year: 1987, month: 2, day: 29 } }).ok, "olmayan gün (29.02.1987) → red");
ok(!validateDuplicateCheck({ fullName: "Ayşe", birth: B, title: "x" }).ok, "bilinmeyen alan → red");
ok(!validateDuplicateCheck({ fullName: "", birth: B }).ok, "boş ad → red");
ok(!validateDuplicateCheck({ fullName: "Ayşe", birth: B, excludeId: "1 or 1=1" }).ok, "uuid olmayan excludeId → red");
const v2 = validateDuplicateCheck({ fullName: "Ayşe", birth: B, excludeId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" });
ok(v2.ok && v2.value.excludeId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "excludeId küçük harfe iner");
ok(!validateDuplicateCheck(null).ok && !validateDuplicateCheck([]).ok, "nesne olmayan gövde → red");
ok(formatBirthTr({ year: 1950, month: 1, day: 1 }) === "01.01.1950", "GG.AA.YYYY gösterimi");

console.log(`\nmükerrer harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
