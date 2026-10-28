/**
 * Oracle birim harness'i — ağsız; elle hesaplanmış SENTETİK beklentiler (yalnız sayılar).
 * Beklentiler belgelenmiş algoritmadan elle türetildi; testleri geçirmek için gevşetilmez.
 *
 * Kullanım: npx tsx scripts/numeroloji-klasik/oracle/unit.harness.ts
 */
import * as P from "../../../lib/numeroloji-klasik/oracle/pythagorean";
import * as C from "../../../lib/numeroloji-klasik/oracle/chaldean";
import { foldName } from "../../../lib/numeroloji-klasik/oracle/text";
import { reducePath } from "../../../lib/numeroloji-klasik/oracle/reduce";

let pass = 0;
let fail = 0;
function t(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — beklenen=${JSON.stringify(expected)} gerçek=${JSON.stringify(actual)}`}`);
}
const v = (x: P.OracleNumber | P.OracleError) => (P.isOracleError(x) ? x : [x.value, x.karmicDebt]);
const ch = (x: C.ChaldeanNumber | P.OracleError) => (P.isOracleError(x) ? x : [x.total, x.compound, x.root]);

// ── Harf tabloları
t("Pisagor A J S = 1", ["A", "J", "S"].map(P.pythagoreanLetterValue), [1, 1, 1]);
t("Pisagor I R = 9, Z = 8, W = 5, Y = 7", ["I", "R", "Z", "W", "Y"].map(P.pythagoreanLetterValue), [9, 9, 8, 5, 7]);
t("Kalde A F O Z U = 1 8 7 7 6", ["A", "F", "O", "Z", "U"].map(C.chaldeanLetterValue), [1, 8, 7, 7, 6]);
t("Kalde tabloda 9 yok", Object.values(C.CHALDEAN_TABLE).includes(9), false);
t("Kalde tablo 26 harf", Object.keys(C.CHALDEAN_TABLE).length, 26);

// ── Katlama
t("Türkçe katlama ı ş ğ ç ö ü İ", foldName("Işıl Çağrı İĞÜÖŞÇ").letters.join(""), "ISILCAGRIIGUOSC");
t("küçük/büyük Türkçe aynı harfler", foldName("ışık").letters.join(""), foldName("IŞIK").letters.join(""));
t("Kiril ICAO: Иван Петров", foldName("Иван Петров").letters.join(""), "IVANPETROV");
t("rakam/noktalama sayılmaz", foldName("Ali 2 O'Kaya").words.map((w) => w.letters.join("")), ["ALI", "OKAYA"]);
t("kısa çizgi kelimeyi bölmez", foldName("Ayşe-Nur Kaya").words.length, 2);

// ── İndirgeme
t("19 → 10 → 1", reducePath(19), [19, 10, 1]);
t("29 → 11 (usta korunur)", reducePath(29), [29, 11]);
t("66 → 12 → 3", reducePath(66), [66, 12, 3]);

// ── Ad sayıları (John William Smith: 20→2, 34→7, 24→6 ⇒ 15→6)
t("İfade John William Smith = 6", v(P.expression("John William Smith")), [6, null]);
t("Ruh John William Smith = 16 → 7 (karmik 16)", v(P.soulUrge("John William Smith")), [7, 16]);
t("Kişilik John William Smith = 17 → 8", v(P.personality("John William Smith")), [8, null]);
t("İfade kelime ustası korunur: Kaya = 11 ⇒ 4+11+5 = 20 → 2", v(P.expression("Deniz Kaya Yilmaz")), [2, null]);
t("Kişilik kelime 22 korunur ⇒ 8+9+22 = 39 → 3", v(P.personality("Deniz Kaya Yilmaz")), [3, null]);
t("İfade Cem = 12 → 3", v(P.expression("Cem")), [3, null]);
t("Ruh: sesli yok → hata", P.soulUrge("Brynn Wyck"), { error: "no_letters" });
t("Kişilik: sessiz yok → hata", P.personality("Aia Eu"), { error: "no_letters" });
t("Ruh: Y/W sessiz (Lynn Wyatt Fly → yalnız A=1)", v(P.soulUrge("Lynn Wyatt Fly")), [1, null]);

// ── Yaşam Yolu
t("LP 1990-07-15 = 7+6+1 = 14 → 5 (karmik 14)", v(P.lifePath({ year: 1990, month: 7, day: 15 })), [5, 14]);
t("LP 1987-02-14 = 2+5+7 = 14 → 5 (karmik 14)", v(P.lifePath({ year: 1987, month: 2, day: 14 })), [5, 14]);
t("LP 1966-05-06 = 5+6+22 = 33", v(P.lifePath({ year: 1966, month: 5, day: 6 })), [33, null]);
t("LP 2009-01-01 = 1+1+11 = 13 → 4 (karmik 13)", v(P.lifePath({ year: 2009, month: 1, day: 1 })), [4, 13]);
t("LP 1960-11-01 = 11+1+7 = 19 → 1 (karmik 19)", v(P.lifePath({ year: 1960, month: 11, day: 1 })), [1, 19]);
t("LP 1990-01-02 yıl yolu 19 borç sayılmaz = 4", v(P.lifePath({ year: 1990, month: 1, day: 2 })), [4, null]);
t("LP 1960-01-19 gün 19 LP borcu değil = 9", v(P.lifePath({ year: 1960, month: 1, day: 19 })), [9, null]);
t("LP 1960-02-02 = 2+2+7 = 11", v(P.lifePath({ year: 1960, month: 2, day: 2 })), [11, null]);
t("tarih geçerliliği 29.02.2001 yok", P.isValidDate({ year: 2001, month: 2, day: 29 }), false);
t("tarih geçerliliği 29.02.2000 var", P.isValidDate({ year: 2000, month: 2, day: 29 }), true);

// ── Doğum günü / Olgunluk
t("Doğum günü 29 = 11", v(P.birthDay(29)), [11, null]);
t("Doğum günü 22 = 22", v(P.birthDay(22)), [22, null]);
t("Doğum günü 19 = 1 (karmik 19)", v(P.birthDay(19)), [1, 19]);
t("Doğum günü 31 = 4", v(P.birthDay(31)), [4, null]);
t("Olgunluk 11+22 = 33", v(P.maturity(11, 22)), [33, null]);
t("Olgunluk 33+33 = 66 → 3", v(P.maturity(33, 33)), [3, null]);
t("Olgunluk 4+9 = 13 → 4 (karmik 13)", v(P.maturity(4, 9)), [4, 13]);

// ── Kişisel döngüler
t("PY 31.12 @2026 = 3+4+1 = 8", P.personalYear(12, 31, 2026).value, 8);
t("PY 31.12 @2027 = 9", P.personalYear(12, 31, 2027).value, 9);
t("PM PY8 + Aralık = 20 → 2", P.personalMonth(8, 12).value, 2);
t("PD PM2 + 31 = 33 → 6", P.personalDay(2, 31).value, 6);

// ── Zirveler / zorluklar (1987-02-14, LP 5 → ilk dönem 36−5 = 31)
const d = { year: 1987, month: 2, day: 14 };
t("Zirveler 7,3,1,9", P.pinnacles(d, 5).map((p) => p.number), [7, 3, 1, 9]);
t("Zirve yaşları", P.pinnacles(d, 5).map((p) => [p.startAge, p.endAge]), [[0, 31], [32, 40], [41, 49], [50, null]]);
t("Zorluklar 3,2,1,5", P.challenges(d, 5).map((p) => p.number), [3, 2, 1, 5]);
t("Zorluk yaşları (3. ana zorluk ömür boyu)", P.challenges(d, 5).map((p) => [p.startAge, p.endAge]), [[0, 31], [32, 40], [0, null], [50, null]]);
t("LP 11 → ilk dönem sonu 36−2 = 34", P.firstPeriodEnd(11), 34);
t("LP 33 → ilk dönem sonu 36−6 = 30", P.firstPeriodEnd(33), 30);

// ── Harf dağılımı türevleri (Deniz Kaya Yilmaz)
t("Karmik dersler eksik [6]", P.karmicLessons("Deniz Kaya Yilmaz").missingNumbers, [6]);
t("Gizli tutku 1 (3 kez)", P.hiddenPassion("Deniz Kaya Yilmaz"), { number: 1, count: 3, allPassions: [1] });
t("Bilinçaltı benlik 8", P.subconsciousSelf("Deniz Kaya Yilmaz").number, 8);
t("Köşe/tepe/ilk sesli D4 Z8 E", (() => {
  const n = P.nameLetters("Deniz Kaya Yilmaz");
  return [n.cornerstone?.letter, n.cornerstone?.number, n.capstone?.letter, n.capstone?.number, n.firstVowel?.letter];
})(), ["D", 4, "Z", 8, "E"]);
t("Köprü 11 ↔ 22 = |2−4| = 2", P.bridge(11, 22), 2);
t("Yaş 2002-09-09 → 2037-09-08 = 34", P.ageOn({ year: 2002, month: 9, day: 9 }, { year: 2037, month: 9, day: 8 }), 34);

// ── Kalde
t("Kalde Helen = 23 / 23 / 5", ch(C.chaldeanDestiny("Helen")), [23, 23, 5]);
t("Kalde David = 16 / 16 / 7", ch(C.chaldeanDestiny("David")), [16, 16, 7]);
t("Kalde Ford = 21 / 21 / 3", ch(C.chaldeanDestiny("Ford")), [21, 21, 3]);
t("Kalde çok kelime: 22→4, 5, 17→8 ⇒ 17", ch(C.chaldeanDestiny("Deniz Kaya Yilmaz")), [17, 17, 8]);
t("Kalde Al = 4 / null / 4", ch(C.chaldeanDestiny("Al")), [4, null, 4]);
t("Kalde ruh Helen E+E = 10", ch(C.chaldeanSoulUrge("Helen")), [10, 10, 1]);
t("Kalde kişilik Helen H+L+N = 13", ch(C.chaldeanPersonality("Helen")), [13, 13, 4]);
t("Kalde kelime ustası korunmaz: Ali Kemal 5+6 = 11 → 2", ch(C.chaldeanDestiny("Ali Kemal")), [11, 11, 2]);
t("bileşik 69 → 15", C.compoundOf(69), 15);
t("bileşik 60 → yok", C.compoundOf(60), null);
t("bileşik 52 → 52", C.compoundOf(52), 52);
t("bileşik 9 → yok", C.compoundOf(9), null);
t("uyarı kök 4 ve 8", [1, 4, 8, 9].map(C.chaldeanCaution), [false, true, true, false]);
t("işletme puanı 1..9", [1, 2, 3, 4, 5, 6, 7, 8, 9].map(C.businessRating), ["excellent", "good", "excellent", "avoid", "excellent", "excellent", "caution", "caution", "good"]);

console.log(`\nUNIT: ✓ ${pass}  ✗ ${fail}`);
process.exit(fail ? 1 : 0);
