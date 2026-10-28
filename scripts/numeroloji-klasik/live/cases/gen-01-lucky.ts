/**
 * Vaka üreticisi 01 — uğurlu ilişkiler (luckyAssociations) toplama.
 * Her Yaşam Yolu (1–9, 11, 22, 33) için /chart, lang=tr VE lang=en.
 * Yalnız SENTETİK ad/tarih. Çıktı repo DIŞINA yazılır (QA klasörü).
 *
 * Kullanım: npx tsx scripts/numeroloji-klasik/live/cases/gen-01-lucky.ts
 */
import { writeCases, type GenCase } from "./common";

/** Tarihler, bileşenleri usta sayı olmayan (yorum belirsizliği olmayan) seçildi; 33 için usta bileşen kaçınılmaz. */
const LP_DATES: Array<{ lp: number; name: string; y: number; m: number; d: number }> = [
  { lp: 1, name: "Ece Nur Arslan", y: 1963, m: 1, d: 17 },
  { lp: 2, name: "Mert Can Yildiz", y: 1960, m: 4, d: 18 },
  { lp: 3, name: "Selin Ada Korkmaz", y: 1960, m: 8, d: 6 },
  { lp: 4, name: "Bora Emre Tekin", y: 1973, m: 1, d: 1 },
  { lp: 5, name: "Defne Su Aydin", y: 1960, m: 7, d: 9 },
  { lp: 6, name: "Kaan Efe Polat", y: 1960, m: 2, d: 24 },
  { lp: 7, name: "Zeynep Ela Kurt", y: 1960, m: 9, d: 9 },
  { lp: 8, name: "Arda Toprak Sahin", y: 1960, m: 1, d: 27 },
  { lp: 9, name: "Elif Naz Ozdemir", y: 1960, m: 4, d: 7 },
  { lp: 11, name: "Deniz Umut Celik", y: 1960, m: 2, d: 2 },
  { lp: 22, name: "Ilgaz Tuna Erdem", y: 2002, m: 9, d: 9 },
  { lp: 33, name: "Asya Mira Gunes", y: 1966, m: 5, d: 6 },
];

const cases: GenCase[] = [];
for (const lang of ["tr", "en"] as const) {
  for (const r of LP_DATES) {
    cases.push({
      id: `l01-chart-lp${r.lp}-${lang}`,
      method: "POST",
      path: "/numerology/chart",
      lang,
      body: { fullName: r.name, year: r.y, month: r.m, day: r.d, targetDate: "2026-10-29" },
      purpose: `uğurlu ilişkiler + chart LP${r.lp} (${lang})`,
    });
  }
}

// Erken öğrenme: Kalde / dual / işletme şekli
cases.push(
  { id: "l01-chaldean-helen", method: "POST", path: "/numerology/chaldean", body: { name: "Helen" }, purpose: "Kalde şekil (belge örneği)" },
  { id: "l01-chaldean-long", method: "POST", path: "/numerology/chaldean", body: { name: "Deniz Kaya Yilmaz" }, purpose: "Kalde çok kelimeli şekil" },
  { id: "l01-dual-deniz", method: "POST", path: "/numerology/dual", body: { name: "Deniz Kaya Yilmaz" }, purpose: "dual = chart.expression + chaldean.destiny ?" },
  { id: "l01-business-ford", method: "POST", path: "/numerology/business-name", body: { name: "Ford" }, purpose: "işletme şekil (belge örneği)" },
);

writeCases("01-lucky.json", cases);
