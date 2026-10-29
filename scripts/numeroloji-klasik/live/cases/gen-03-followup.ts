/**
 * Vaka üreticisi 03 — 02 matrisinden çıkan soruların takibi (yalnız SENTETİK ad/tarih).
 * Kullanım: npx tsx scripts/numeroloji-klasik/live/cases/gen-03-followup.ts
 */
import { writeCases, type GenCase } from "./common";

const cases: GenCase[] = [];
const P = (id: string, path: string, body: Record<string, unknown>, purpose: string, lang?: string) =>
  cases.push({ id: `f03-${id}`, method: "POST", path: `/numerology/${path}`, body, purpose, ...(lang ? { lang } : {}) });

P("chart-cy2028", "chart", { fullName: "Mert Can Yildiz", year: 1960, month: 4, day: 18, targetDate: "2026-10-29", currentYear: 2028 }, "NK: currentYear iç içe kişisel ayı da değiştiriyor mu? (2. örnek)");
P("pm-2030-oct", "personal-month", { month: 1, day: 17, year: 2030, targetMonth: 10 }, "m02-ch2-currentyear PM=6 kaynağı: 2030 PY ile mi?");
P("chart-notarget", "chart", { fullName: "Selin Ada Korkmaz", year: 1960, month: 8, day: 6 }, "targetDate yok → bugün UTC");
P("chart-age34", "chart", { fullName: "Ilgaz Tuna Erdem", year: 2002, month: 9, day: 9, targetDate: "2037-09-08" }, "34 yaş (35'ten bir gün önce) → isActive false beklenir");
P("chart-firstword-novowel", "chart", { fullName: "Brynn Ada Kaya", year: 1990, month: 7, day: 15, targetDate: "2026-10-29" }, "ilk adda sesli yok: firstVowel ne olur?");
P("chart-tr-corner", "chart", { fullName: "Ömer Şükrü Ilıcak", year: 1975, month: 5, day: 5, targetDate: "2026-10-29" }, "Türkçe köşe taşı Ö, tepe taşı R, ilk sesli O/Ö");
P("su-word-novowel", "soul-urge", { fullName: "Brynn Ada" }, "seslisiz kelime atlanır mı?");
P("ex-greek", "expression", { fullName: "Νίκος Παπαδόπουλος" }, "Yunan (pasaport çevirisi) davranışı");
P("cp-mixed-swap", "compatibility", { person1: { fullName: "Selin Ada Korkmaz", year: 1960, month: 8, day: 6 }, person2: { lifePath: 5, expression: 7, soulUrge: 6 } }, "m02-cp-mixed kişiler yer değiştirdi: puan simetrik mi?");
P("biz-7word", "business-name", { name: "Anatolian Natural Stone Trading Company Istanbul Ankara" }, "kelime kök toplamı büyük (çok kelime)");
P("ch-master-word", "chaldean", { name: "Ali Kemal" }, "Kalde kelime toplamı 11/22 korunmaz mı?");

writeCases("03-followup.json", cases);
