#!/usr/bin/env node
/**
 * scripts/cosmic-validation/calendar_grid.mjs
 *
 * Pazartesi-başlangıçlı takvim grid doğrulaması (sunum katmanı; hesaplama motoru DEĞİL).
 *
 * app/cosmic-calendar/page.tsx içindeki buildCalendarCells + DAY_HEADERS mantığının
 * birebir eşdeğerini bağımsız doğrular. Motor/DB'ye dokunmaz; yalnız takvim ızgarası
 * offset ve gün başlıkları için deterministik regresyon.
 *
 * Çalıştırma:  node scripts/cosmic-validation/calendar_grid.mjs
 * Sapmada exit 1 (CI-dostu).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── page.tsx ile BİREBİR aynı mantık ──────────────────────────────────────────
// Pazartesi tabanı: JS getDay() Pazar=0 → (getDay()+6)%7 ile Pzt=0 … Paz=6.
const DAY_HEADERS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function buildCalendarCells(year, month) {
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ── Test yardımcıları ─────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra = "") {
  if (cond) { pass++; }
  else { fail++; failures.push(`${name}${extra ? ` — ${extra}` : ""}`); }
}
function leadingBlanks(cells) {
  let n = 0;
  while (n < cells.length && cells[n] === null) n++;
  return n;
}

// ── 0. GERÇEK ÜRETİM KODU SÖZLEŞMESİ (app/cosmic-calendar/page.tsx) ────────────
// Harness yalnız bağımsız kopyayı değil, GERÇEK kaynak dosyasının Pazartesi-başlangıç
// sözleşmesini de doğrular. Kırılgan satır numarasına güvenmez; sözleşmeyi (DAY_HEADERS
// içeriği + buildCalendarCells offset ifadesi) metinden çıkarır.
const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = join(__dirname, "..", "..", "app", "cosmic-calendar", "page.tsx");
let pageSrc = "";
try { pageSrc = readFileSync(PAGE_PATH, "utf8"); } catch { /* aşağıda FAIL */ }
check("Gerçek page.tsx okunabildi", pageSrc.length > 0, PAGE_PATH);

// DAY_HEADERS sözleşmesi: gerçek dizi literalini çıkar ve Pazartesi-başlangıçlı doğrula.
{
  const m = pageSrc.match(/const\s+DAY_HEADERS\s*=\s*\[([^\]]*)\]/);
  const arr = m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : null;
  check(
    "GERÇEK DAY_HEADERS sözleşmesi Pazartesi-başlangıçlı (Pzt…Paz)",
    arr && JSON.stringify(arr) === JSON.stringify(["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]),
    arr ? arr.join(",") : "eşleşme yok",
  );
}

// buildCalendarCells sözleşmesi: Pazartesi tabanlı offset ifadesi (getDay()+6)%7 mevcut mu.
{
  const fnIdx = pageSrc.indexOf("function buildCalendarCells");
  const fnBody = fnIdx >= 0 ? pageSrc.slice(fnIdx, fnIdx + 600) : "";
  const hasMondayOffset = /getDay\(\)\s*\+\s*6\s*\)\s*%\s*7/.test(fnBody);
  const hasRawSundayOffset = /const\s+firstDayOfWeek\s*=\s*new\s+Date\([^)]*\)\.getDay\(\)\s*;/.test(fnBody);
  check("GERÇEK buildCalendarCells Pazartesi offset (getDay()+6)%7 içeriyor", hasMondayOffset, fnIdx < 0 ? "fonksiyon bulunamadı" : "");
  check("GERÇEK buildCalendarCells ham Pazar(0) offset İÇERMİYOR", !hasRawSundayOffset);
}

// Yerel kopya, gerçek sözleşmeyle tutarlı mı (drift koruması).
{
  const m = pageSrc.match(/const\s+DAY_HEADERS\s*=\s*\[([^\]]*)\]/);
  const realArr = m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : null;
  check("Harness yerel DAY_HEADERS kopyası gerçek koda eşit (drift yok)", realArr && JSON.stringify(realArr) === JSON.stringify(DAY_HEADERS), realArr ? realArr.join(",") : "yok");
}

// ── 1. Gün başlıkları PZT→PAZ ─────────────────────────────────────────────────
check(
  "DAY_HEADERS sırası PZT–SAL–ÇAR–PER–CUM–CMT–PAZ",
  JSON.stringify(DAY_HEADERS) === JSON.stringify(["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]),
  DAY_HEADERS.join(","),
);

// ── 2. Kabul: 1 Temmuz 2026 Çarşamba → 2 ön boşluk, 3. sütun (indeks 2) ────────
{
  const cells = buildCalendarCells(2026, 6); // month 6 = Temmuz (0-index)
  const blanks = leadingBlanks(cells);
  check("1 Tem 2026: 2 ön boş hücre", blanks === 2, `beklenen 2, bulunan ${blanks}`);
  check("1 Tem 2026: gün 1, indeks 2 (3. sütun)", cells[2] === 1, `cells[2]=${cells[2]}`);
  check("1 Tem 2026: 3. sütun başlığı ÇAR", DAY_HEADERS[2] === "Çar");
  check("1 Tem 2026: indeks 2 sütunu = 2 % 7 = 2", 2 % 7 === 2);
}

// ── 3. Ayın ilk günü haftanın farklı günlerine geldiğinde ön boşluk ───────────
// (year, month0, açıklama, beklenen ön boşluk) — getDay bağımsız, gerçek takvimden.
const OFFSET_CASES = [
  // Ayın 1'i Pazartesi → 0 ön boşluk
  { y: 2026, m: 5,  label: "1 Haz 2026 (Pzt)",  firstDow: 1, expect: 0 },
  // Ayın 1'i Perşembe
  { y: 2026, m: 0,  label: "1 Oca 2026 (Per)",  firstDow: 4, expect: 3 },
  // Ayın 1'i Cumartesi → 5 ön boşluk
  { y: 2026, m: 7,  label: "1 Ağu 2026 (Cmt)",  firstDow: 6, expect: 5 },
  // Ayın 1'i Pazar → 6 ön boşluk
  { y: 2026, m: 2,  label: "1 Mar 2026 (Paz)",  firstDow: 0, expect: 6 },
  // Ayın 1'i Salı
  { y: 2026, m: 8,  label: "1 Eyl 2026 (Sal)",  firstDow: 2, expect: 1 },
];
for (const c of OFFSET_CASES) {
  const actualFirstDow = new Date(c.y, c.m, 1).getDay();
  check(`${c.label}: gerçek getDay()==${c.firstDow}`, actualFirstDow === c.firstDow, `getDay()=${actualFirstDow}`);
  const cells = buildCalendarCells(c.y, c.m);
  const blanks = leadingBlanks(cells);
  check(`${c.label}: ${c.expect} ön boşluk`, blanks === c.expect, `beklenen ${c.expect}, bulunan ${blanks}`);
  check(`${c.label}: gün 1 doğru sütunda (${c.expect} % 7)`, cells[c.expect] === 1, `cells[${c.expect}]=${cells[c.expect]}`);
}

// ── 4. Bütünlük: gün numaraları kaybolmaz/tekrarlanmaz; hafta hücre sayısı = 7 ─
for (let m = 0; m < 12; m++) {
  const cells = buildCalendarCells(2026, m);
  const daysInMonth = new Date(2026, m + 1, 0).getDate();
  const nums = cells.filter(x => x !== null);
  const expected = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  check(`2026-${m + 1}: tüm günler tam & sıralı (kayıp/tekrar yok)`, JSON.stringify(nums) === JSON.stringify(expected), `n=${nums.length}/${daysInMonth}`);
  check(`2026-${m + 1}: toplam hücre 7'nin katı`, cells.length % 7 === 0, `len=${cells.length}`);
  check(`2026-${m + 1}: ilk hafta 7 hücre`, cells.slice(0, 7).length === 7);
  check(`2026-${m + 1}: son hafta 7 hücre`, cells.slice(-7).length === 7);
}

// ── 5. Marker eşlemesi gün-numarasına bağlı (offset'ten bağımsız) ─────────────
// Takvim marker'ları (ay fazı/retro/hicri) gün-NUMARASINA göre map'lenir; Pazartesi
// offset'i yalnız baştaki boş hücreleri kaydırır, gün→hücre eşlemesini bozmaz.
{
  const cells = buildCalendarCells(2026, 6); // Temmuz
  // 15 Temmuz gün numarası 15, ön boşluk 2 → indeks 2 + (15-1) = 16
  const idxOf15 = cells.indexOf(15);
  check("Marker gün-eşleme: 15 Tem indeks 16 (2 ön boşluk + 14)", idxOf15 === 16, `indexOf(15)=${idxOf15}`);
  check("Marker gün-eşleme: cells[16] === 15", cells[16] === 15);
}

// ── Sonuç ─────────────────────────────────────────────────────────────────────
console.log(`\nPazartesi grid harness: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.error("\nBaşarısız kontroller:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("✓ Tüm Pazartesi-başlangıç takvim doğrulamaları geçti.");
