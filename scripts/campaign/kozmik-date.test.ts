/**
 * KZM-DATE-01 — Kampanya Kozmik tarih doğrulaması (Gezegen Saatleri + Transitler; aylık özellikler korunur).
 *
 * Kusur: lib/campaign/visitor/runners/kozmik.ts `isCalendarDaySupported(year, month - 1, day)` — fonksiyon ayı 1–12 bekler
 * (lib/cosmic/dateRange.ts). Sonuç: gerçek günler reddediliyor (Ocak'ın tamamı, 31'ler …), olmayan günler (29.02.2027,
 * 31.04.2026 …) kabul edilip normalize edilmiş BAŞKA bir günün sonucu üretiliyordu.
 *
 * Beklenen değerler ürün fonksiyonlarından BAĞIMSIZ: Gregoryen artık yıl kuralı + ay uzunluk tablosu + 2026-01-01…2100-12-31.
 * Ürünün GERÇEK parse ve run yolları sınanır.
 *
 *   npx tsx --tsconfig scripts/campaign/tsconfig.json scripts/campaign/kozmik-date.test.ts
 */
import { kozmikPaket } from "@/lib/campaign/visitor/runners/kozmik";

let pass = 0, fail = 0;
function check(cond: boolean, label: string, detail = ""): void {
  if (cond) pass++;
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const realDay = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= (m === 2 && leap(y) ? 29 : DAYS[m - 1]);
const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${p2(m)}-${p2(d)}`;
const inRange = (s: string) => s >= "2026-01-01" && s <= "2100-12-31";
const NOW = new Date(Date.UTC(2026, 10, 19, 9));
type Parsed = { ok: true; value: { year: number; month: number; day: number } } | { ok: false; errors: Record<string, string> };
const parse = (input: Record<string, unknown>) => kozmikPaket.parse(input as never, NOW) as unknown as Parsed;

async function main() {
  // 1) Tam matris: 2025–2101, ay 0–13, gün 0–32 — her iki tarih özelliği
  console.log("── 1. Tarih matrisi (Gezegen Saatleri + Transitler)");
  for (const feature of ["hours", "transits"]) {
    let n = 0, falseReject = 0, falseAccept = 0, wrongValue = 0, real = 0;
    const ex: string[] = [];
    for (let y = 2025; y <= 2101; y++) for (let m = 0; m <= 13; m++) for (let d = 0; d <= 32; d++) {
      const s = iso(y, m, d), want = realDay(y, m, d) && inRange(s);
      if (realDay(y, m, d) && inRange(s)) real++;
      const r = parse({ feature, date: s });
      n++;
      if (want && !r.ok) { falseReject++; if (ex.length < 3) ex.push(`ret ${s}`); }
      if (!want && r.ok) { falseAccept++; if (ex.length < 3) ex.push(`kabul ${s}`); }
      if (want && r.ok && (r.value.year !== y || r.value.month !== m || r.value.day !== d)) wrongValue++;
      if (!want && !r.ok && !r.errors.date) { falseAccept++; if (ex.length < 3) ex.push(`hata alanı yok ${s}`); }
    }
    check(real === 27393, `${feature}: desteklenen gerçek gün sayısı 27.393 (2026–2100)`, String(real));
    check(falseReject === 0, `${feature}: yanlış ret 0`, `${falseReject} ${ex.join(", ")}`);
    check(falseAccept === 0, `${feature}: yanlış kabul 0`, `${falseAccept} ${ex.join(", ")}`);
    check(wrongValue === 0, `${feature}: kabul edilen değer girilen gün`, String(wrongValue));
    console.log(`  · ${feature}: ${n} giriş, yanlış ret ${falseReject}, yanlış kabul ${falseAccept}`);
  }

  // 2) Owner listesi — adlandırılmış sınır günleri
  console.log("── 2. Sınır günleri");
  const named: [string, boolean][] = [
    ["2026-01-01", true], ["2026-01-31", true], ["2026-02-28", true], ["2027-02-29", false], ["2028-02-29", true],
    ["2100-02-29", false], ["2026-04-30", true], ["2026-04-31", false], ["2026-05-31", true], ["2026-06-31", false],
    ["2026-07-31", true], ["2026-10-31", true], ["2026-12-31", true], ["2100-12-31", true], ["2101-01-01", false],
    ["2025-12-31", false], ["2026-13-01", false], ["2026-00-10", false], ["2026-03-00", false],
  ];
  for (const [s, ok] of named) for (const feature of ["hours", "transits"]) check(parse({ feature, date: s }).ok === ok, `${feature} ${s} → ${ok ? "kabul" : "ret"}`);
  check(!parse({ feature: "hours", date: "2026-1-5" }).ok && !parse({ feature: "hours", date: "05.01.2026" }).ok, "biçim dışı tarih reddedilir");

  // 3) Gerçek run yolu — kabul edilen gün KENDİ gününün sonucunu üretir (normalize edilmiş başka gün değil)
  console.log("── 3. Gerçek run yolu");
  const trD = (s: string) => s.split("-").reverse().join(".");
  for (const s of ["2026-01-01", "2026-01-31", "2028-02-29", "2026-12-31", "2100-12-31"]) {
    for (const feature of ["hours", "transits"]) {
      const r = parse({ feature, date: s });
      if (!r.ok) { check(false, `${feature} ${s} parse`); continue; }
      const out = (await kozmikPaket.run({ now: NOW } as never, r.value as never)) as { ok: boolean; result?: { blocks: { type: string; title?: string; rows?: string[][] }[] } };
      const t = out.result?.blocks.find((b) => b.type === "table");
      check(out.ok === true && !!t?.title?.includes(trD(s)) && (t?.rows?.length ?? 0) > 0, `${feature} ${s} run → tablo başlığı ${trD(s)}`, t?.title ?? JSON.stringify(out).slice(0, 120));
    }
  }

  // 4) Aylık özellikler (isMonthSupported 0–11) DEĞİŞMEDİ
  console.log("── 4. Aylık özellikler");
  for (const feature of ["moon", "retro", "power", "hacamat"]) {
    check(parse({ feature, month: "2026-01" }).ok && parse({ feature, month: "2100-12" }).ok, `${feature}: 2026-01 ve 2100-12 kabul`);
    check(!parse({ feature, month: "2025-12" }).ok && !parse({ feature, month: "2101-01" }).ok, `${feature}: 2025-12 ve 2101-01 ret`);
  }

  console.log(`\nkozmik-date (KZM-DATE-01): ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); console.log(`kozmik-date (KZM-DATE-01): ${pass} PASS / ${fail + 1} FAIL`); process.exit(1); });
