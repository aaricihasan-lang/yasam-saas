/**
 * Vaka üreticisi 02 — 20 ucun tamamı için dengeli kapsam matrisi (yalnız SENTETİK ad/tarih).
 * Kullanım: npx tsx scripts/numeroloji-klasik/live/cases/gen-02-matrix.ts
 */
import { writeCases, type GenCase } from "./common";

const cases: GenCase[] = [];
const P = (id: string, path: string, body: Record<string, unknown>, purpose: string, lang?: string) =>
  cases.push({ id: `m02-${id}`, method: "POST", path: `/numerology/${path}`, body, purpose, ...(lang ? { lang } : {}) });
const G = (id: string, path: string, purpose: string, lang?: string) =>
  cases.push({ id: `m02-${id}`, method: "GET", path: `/numerology/${path}`, purpose, ...(lang ? { lang } : {}) });

// ── A. Chart ↔ tekil uç tutarlılığı (5 kişi × 12 çağrı)
const PERSONS = [
  { k: "c1", fullName: "Ayşe Can Öztürk", year: 1988, month: 2, day: 29, note: "artık gün 29 Şubat; ruh 16, kişilik 19 karmik" },
  { k: "c2", fullName: "Ayşe Can Aydın", year: 1979, month: 11, day: 29, note: "ay 11 + gün 29 usta; ifade 22" },
  { k: "c3", fullName: "Ayşe Barış Şahin", year: 1999, month: 12, day: 31, note: "31 Aralık; ifade 33" },
  { k: "c4", fullName: "Ayşe Ece Demir", year: 1985, month: 6, day: 13, note: "ifade 13 karmik; doğum günü 13" },
  { k: "c5", fullName: "Ayşe Işık Doğan", year: 1960, month: 4, day: 5, note: "LP 16 karmik; ruh 22" },
];
for (const p of PERSONS) {
  const nd = { fullName: p.fullName, year: p.year, month: p.month, day: p.day };
  const d = { year: p.year, month: p.month, day: p.day };
  const pur = (x: string) => `tutarlılık ${p.k} (${p.note}) — ${x}`;
  P(`${p.k}-chart`, "chart", { ...nd, targetDate: "2026-10-29" }, pur("chart"));
  P(`${p.k}-life-path`, "life-path", d, pur("life-path"));
  P(`${p.k}-expression`, "expression", { fullName: p.fullName }, pur("expression"));
  P(`${p.k}-soul-urge`, "soul-urge", { fullName: p.fullName }, pur("soul-urge"));
  P(`${p.k}-personality`, "personality", { fullName: p.fullName }, pur("personality"));
  P(`${p.k}-birth-day`, "birth-day", { day: p.day }, pur("birth-day"));
  P(`${p.k}-maturity`, "maturity", nd, pur("maturity"));
  P(`${p.k}-karmic-lessons`, "karmic-lessons", { fullName: p.fullName }, pur("karmic-lessons"));
  P(`${p.k}-karmic-debt`, "karmic-debt", nd, pur("karmic-debt"));
  P(`${p.k}-personal-year`, "personal-year", { month: p.month, day: p.day, year: 2026 }, pur("personal-year 2026"));
  P(`${p.k}-personal-month`, "personal-month", { month: p.month, day: p.day, year: 2026, targetMonth: 10 }, pur("personal-month 2026-10"));
  P(`${p.k}-bridge`, "bridge", nd, pur("bridge"));
}

// ── B. Yaşam Yolu sınırları
const LP: Array<[string, number, number, number, string]> = [
  ["lp-k13", 1960, 3, 3, "toplam 13 → 4 karmik"],
  ["lp-k19", 1960, 5, 7, "toplam 19 → 10 → 1 karmik"],
  ["lp-k14", 1960, 3, 4, "toplam 14 → 5 karmik"],
  ["lp-day19", 1960, 1, 19, "gün 19 bileşeni; son toplam 9 (LP borç işaretlenir mi?)"],
  ["lp-year19", 1990, 1, 2, "yıl yolu 1990 → 19 → 10 → 1; son 4"],
  ["lp-month11", 1960, 11, 1, "ay 11 korunursa 11+1+7=19 karmik; indirgenirse 10"],
  ["lp-y2009", 2009, 1, 1, "yıl 2009 → 11 korunursa 1+1+11=13 karmik"],
  ["lp-y1966-33", 1966, 5, 6, "yıl 22 korunur → 33"],
  ["lp-29sum", 1960, 9, 13, "9+4+7=20 (gün 13 bileşen)"],
  ["lp-leap2000", 2000, 2, 29, "2000 artık yıl 29 Şubat"],
  ["lp-1900", 1900, 1, 1, "1900 sınırı"],
  ["lp-2099", 2099, 12, 31, "2099 sınırı"],
  ["lp-y100", 100, 1, 1, "belgelenen alt sınır yıl 100"],
  ["lp-y2100", 2100, 12, 31, "belgelenen üst sınır yıl 2100"],
];
for (const [id, y, m, d, note] of LP) P(id, "life-path", { year: y, month: m, day: d }, `life-path ${note}`);
// geçersiz girdiler (400 beklenir)
P("err-lp-y99", "life-path", { year: 99, month: 1, day: 1 }, "geçersiz: yıl 99");
P("err-lp-y2101", "life-path", { year: 2101, month: 1, day: 1 }, "geçersiz: yıl 2101");
P("err-lp-m13", "life-path", { year: 1990, month: 13, day: 1 }, "geçersiz: ay 13");
P("err-lp-feb30", "life-path", { year: 1990, month: 2, day: 30 }, "takvim dışı: 30 Şubat (kabul ediliyor mu?)");
P("err-lp-feb29-2001", "life-path", { year: 2001, month: 2, day: 29 }, "takvim dışı: 29 Şubat 2001 (artık değil)");
P("err-lp-string", "life-path", { year: "1990", month: 1, day: 1 }, "geçersiz tip: yıl metin");

// ── C. Doğum günü
for (const d of [1, 10, 11, 13, 14, 16, 19, 22, 29, 30, 31]) P(`bd-${d}`, "birth-day", { day: d }, `birth-day ${d}`);
P("err-bd-32", "birth-day", { day: 32 }, "geçersiz: gün 32");

// ── D. İfade (ad) sınırları
const EXPR: Array<[string, string, string]> = [
  ["ex-single", "Cem", "tek kelime"],
  ["ex-4word", "Ayşe Gül Nur Çağlar", "4 kelime"],
  ["ex-e22", "Ayşe Can Aydın", "ifade 22 (yineleme değil: c2 ile aynı ad, farklı kimlik — determinizm)"],
  ["ex-e11", "Ayşe Ece Arslan", "ifade 11"],
  ["ex-ek16", "Ayşe Can Arslan", "ifade 16 karmik"],
  ["ex-ek19", "Ayşe Can Doğan", "ifade 19 karmik"],
  ["ex-ek14", "Ayşe Ece Doğan", "ifade 14 karmik"],
  ["ex-upper-tr", "IŞIK ÇAĞAN ÖZDEMİR", "büyük harf Türkçe I/İ/Ş/Ç/Ğ/Ö"],
  ["ex-lower-tr", "ışık çağan özdemir", "küçük harf Türkçe ı/ş/ç/ğ/ö"],
  ["ex-dotted", "İlkiz Ünal Gülşen", "İ ve i, Ü, ş"],
  ["ex-hyphen", "Ayşe-Nur Kaya", "kısa çizgili ad (tek kelime mi iki mi?)"],
  ["ex-apos", "Deniz O'Kaya", "kesme işaretli"],
  ["ex-digits", "Ali 2 Kaya", "ad içinde rakam"],
  ["ex-html", "<b>Ali</b> Kaya", "HTML benzeri girdi (yankılanıyor mu?)"],
  ["ex-cyr", "Иван Петров", "Kiril (pasaport çevirisi)"],
  ["ex-accents", "José Müller Ñúñez", "Latin aksanlar"],
];
for (const [id, n, note] of EXPR) P(id, "expression", { fullName: n }, `expression ${note}`);
P("err-ex-empty", "expression", { fullName: "" }, "geçersiz: boş ad");
P("err-ex-spaces", "expression", { fullName: "   " }, "geçersiz: yalnız boşluk");
P("err-ex-digits", "expression", { fullName: "12345" }, "harf yok: yalnız rakam");
P("err-ex-201", "expression", { fullName: "A".repeat(201) }, "geçersiz: 201 karakter");

// ── E. Ruh güdüsü / Kişilik
P("su-s11", "soul-urge", { fullName: "Ayşe Can Uçar" }, "soul-urge 11");
P("su-sk13", "soul-urge", { fullName: "Ayşe Mert Kaya" }, "soul-urge 13 karmik");
P("su-y", "soul-urge", { fullName: "Lynn Wyatt Fly" }, "Y/W sessiz: yalnız A sesli");
P("err-su-novowel", "soul-urge", { fullName: "Brynn Wyck" }, "sesli yok → 400 beklenir");
P("pe-p33", "personality", { fullName: "Ayşe Ece Yıldız" }, "personality 33");
P("pe-pk13", "personality", { fullName: "Ayşe Gül Güneş" }, "personality 13 karmik");
P("err-pe-nocons", "personality", { fullName: "Aia Eu" }, "sessiz yok → 400 beklenir");

// ── F. Olgunluk
P("mat-nums-11-22", "maturity", { lifePath: 11, expression: 22 }, "maturity 11+22=33");
P("mat-nums-4-9", "maturity", { lifePath: 4, expression: 9 }, "maturity 4+9=13 (karmik işaret?)");
P("mat-nums-33-33", "maturity", { lifePath: 33, expression: 33 }, "maturity 33+33=66 → 12 → 3");
P("mat-lp-name", "maturity", { lifePath: 7, fullName: "Ayşe Can Kaya" }, "lifePath + fullName");
P("mat-ex-date", "maturity", { expression: 5, year: 1990, month: 7, day: 15 }, "expression + tarih");
P("err-mat-only-lp", "maturity", { lifePath: 5 }, "eksik: yalnız lifePath → 400");
P("err-mat-lp10", "maturity", { lifePath: 10, expression: 3 }, "lifePath 10 (1-33 aralığında ama geçersiz sayı)");

// ── G. Karmik ders / borç
P("kl-turkish", "karmic-lessons", { fullName: "Çağrı Gül Öz" }, "karmic-lessons kısa Türkçe (çok eksik)");
P("kl-full", "karmic-lessons", { fullName: "Abdurrahman Yiğitcan Kuşçuoğlu" }, "karmic-lessons uzun ad");
P("kd-day13", "karmic-debt", { day: 13 }, "yalnız gün 13");
P("kd-day19", "karmic-debt", { day: 19 }, "yalnız gün 19");
P("kd-name", "karmic-debt", { fullName: "Ayşe Can Doğan" }, "yalnız ad (ifade 19, ruh 14)");
P("kd-none", "karmic-debt", { fullName: "Ayşe Can Kaya", year: 1960, month: 4, day: 18 }, "borç yok beklenir");
P("err-kd-empty", "karmic-debt", {}, "boş gövde → 400");

// ── H. Köprü (usta)
P("br-masters", "bridge", { fullName: "Ayşe Ece Arslan", year: 1960, month: 2, day: 2 }, "bridge LP 11, ifade 11");
P("br-e33", "bridge", { fullName: "Ayşe Barış Şahin", year: 2002, month: 9, day: 9 }, "bridge LP 22, ifade 33");

// ── I. Kişisel yıl / ay / gün sınırları
P("py-2026", "personal-year", { month: 12, day: 31, year: 2026 }, "31 Aralık doğumlu 2026");
P("py-2027", "personal-year", { month: 12, day: 31, year: 2027 }, "31 Aralık doğumlu 2027 (yıl geçişi)");
P("py-default", "personal-year", { month: 1, day: 1 }, "yıl verilmedi → güncel UTC yıl");
P("py-2100", "personal-year", { month: 7, day: 15, year: 2100 }, "üst sınır 2100");
P("err-py-2101", "personal-year", { month: 7, day: 15, year: 2101 }, "geçersiz 2101");
P("pm-dec", "personal-month", { month: 12, day: 31, year: 2026, targetMonth: 12 }, "Aralık");
P("pm-jan", "personal-month", { month: 12, day: 31, year: 2027, targetMonth: 1 }, "Ocak (yıl geçişi)");
P("pm-default", "personal-month", { month: 5, day: 20 }, "varsayılan yıl+ay");
P("err-pm-m13", "personal-month", { month: 5, day: 20, targetMonth: 13 }, "geçersiz targetMonth 13");
P("pd-1231", "personal-day", { month: 12, day: 31, targetDate: "2026-12-31" }, "31.12.2026");
P("pd-0101", "personal-day", { month: 12, day: 31, targetDate: "2027-01-01" }, "01.01.2027 (yıl geçişi)");
P("pd-leap", "personal-day", { month: 2, day: 29, targetDate: "2028-02-29" }, "artık gün hedef");
P("pd-default", "personal-day", { month: 3, day: 8 }, "hedef tarih yok → bugün UTC");
P("pd-2100", "personal-day", { month: 3, day: 8, targetDate: "2100-12-31" }, "üst sınır");
P("err-pd-feb29", "personal-day", { month: 3, day: 8, targetDate: "2027-02-29" }, "takvim dışı hedef 29.02.2027");
P("err-pd-format", "personal-day", { month: 3, day: 8, targetDate: "31.12.2026" }, "biçim dışı tarih");

// ── J. Uyum
P("cp-names", "compatibility", { person1: { fullName: "Ayşe Can Kaya", year: 1990, month: 7, day: 15 }, person2: { fullName: "Mert Ozan Demir", year: 1988, month: 3, day: 22 } }, "iki ad+tarih");
P("cp-names2", "compatibility", { person1: { fullName: "Ece Nur Arslan", year: 1963, month: 1, day: 17 }, person2: { fullName: "Kaan Efe Polat", year: 1960, month: 2, day: 24 } }, "iki ad+tarih (2)");
P("cp-nums-same", "compatibility", { person1: { lifePath: 1, expression: 1, soulUrge: 1 }, person2: { lifePath: 1, expression: 1, soulUrge: 1 } }, "sayılarla: aynı");
P("cp-nums-masters", "compatibility", { person1: { lifePath: 11, expression: 22, soulUrge: 33 }, person2: { lifePath: 2, expression: 4, soulUrge: 6 } }, "sayılarla: usta ↔ kök");
P("cp-nums-far", "compatibility", { person1: { lifePath: 1, expression: 4, soulUrge: 8 }, person2: { lifePath: 2, expression: 5, soulUrge: 7 } }, "sayılarla: farklı");
P("cp-mixed", "compatibility", { person1: { lifePath: 5, expression: 7, soulUrge: 6 }, person2: { fullName: "Selin Ada Korkmaz", year: 1960, month: 8, day: 6 } }, "karışık mod");
P("err-cp-missing", "compatibility", { person1: { lifePath: 5 }, person2: { lifePath: 3, expression: 9, soulUrge: 1 } }, "eksik alan → 400");

// ── K. Sayı anlamları (katalog) — 12 tr + 1 en + geçersiz
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]) G(`mean-${n}-tr`, `meanings/${n}`, `meanings ${n} tr (katalog)`);
G("mean-5-en", "meanings/5", "meanings 5 en (TR karşılaştırma)", "en");
G("err-mean-10", "meanings/10", "geçersiz: 10");

// ── L. Bileşik sayılar 10..52 (katalog) + geçersiz
for (let n = 10; n <= 52; n++) G(`cmp-${n}-tr`, `compound-number/${n}`, `compound ${n} tr (katalog)`);
G("cmp-23-en", "compound-number/23", "compound 23 en (TR karşılaştırma)", "en");
G("err-cmp-9", "compound-number/9", "geçersiz: 9");
G("err-cmp-53", "compound-number/53", "geçersiz: 53");

// ── M. Kalde (≥15)
const CH: Array<[string, string, string]> = [
  ["ch-ford", "Ford", "tek kelime"],
  ["ch-tr1", "Ayşe Can Öztürk", "Türkçe 3 kelime"],
  ["ch-tr2", "Işık Çağan Özdemir", "Türkçe ı/ş/ç/ğ/ö"],
  ["ch-tr3", "Ümit Gülşen", "ü/ş"],
  ["ch-4word", "Ayşe Gül Nur Çağlar", "4 kelime"],
  ["ch-ynames", "Yiğit Yaman", "Y sessiz (Y=1)"],
  ["ch-long1", "Supercalifragilistico", "tek uzun kelime (toplam > 52?)"],
  ["ch-long2", "Muhammedmustafa", "tek uzun kelime (toplam > 52?)"],
  ["ch-short", "Al", "kısa (toplam < 10)"],
  ["ch-q", "Quixote Zeph", "Q/X/Z/P/F harfleri"],
  ["ch-w", "Wolfgang Vow", "W/V/U = 6"],
  ["ch-mehmet", "Mehmet", "tek kelime Türkçe"],
  ["ch-zeynep", "Zeynep Ela Kurt", "lucky kişi ile aynı ad"],
  ["ch-deniz2", "Deniz Umut Celik", "lucky kişi ile aynı ad"],
  ["ch-cyr", "Иван Петров", "Kiril"],
  ["ch-hyphen", "Ayşe-Nur Kaya", "kısa çizgi"],
];
for (const [id, n, note] of CH) P(id, "chaldean", { name: n }, `chaldean ${note}`);
P("err-ch-novowel", "chaldean", { name: "Brynn" }, "sesli yok → 400");
P("err-ch-nocons", "chaldean", { name: "Aia" }, "sessiz yok → 400");

// ── N. Dual (chart.expression + chaldean.destiny ile birebir mi?)
const DUAL: Array<[string, string]> = [
  ["du-ford", "Ford"],
  ["du-tr1", "Ayşe Can Öztürk"],
  ["du-tr2", "Işık Çağan Özdemir"],
  ["du-4word", "Ayşe Gül Nur Çağlar"],
  ["du-zeynep", "Zeynep Ela Kurt"],
  ["du-deniz2", "Deniz Umut Celik"],
  ["du-e11", "Ayşe Ece Arslan"],
  ["du-e22", "Ayşe Can Aydın"],
];
for (const [id, n] of DUAL) P(id, "dual", { name: n }, "dual tekrarı kontrol");

// ── O. İşletme adı
const BIZ: Array<[string, string, string]> = [
  ["biz-tr1", "Güneş Çiçekçilik", "Türkçe"],
  ["biz-tr2", "Öz Şifa Bitki", "Türkçe 3 kelime"],
  ["biz-tr3", "Yaşam Atölyesi", "Türkçe"],
  ["biz-short", "Ika", "kısa"],
  ["biz-long", "Anatolian Natural Stone Trading Company", "uzun çok kelime"],
  ["biz-digits", "Studio 54", "rakam içeren"],
  ["biz-amp", "Kaya & Demir", "ampersand"],
  ["biz-onew", "Microsofttt", "tek uzun kelime"],
];
for (const [id, n, note] of BIZ) P(id, "business-name", { name: n }, `business-name ${note}`);
P("err-biz-empty", "business-name", { name: "" }, "boş → 400");

// ── P. Günlük (tohum determinizmi)
P("daily-a-1", "daily", { seed: "synthetic-seed-a", date: "2026-11-01" }, "tohum A tarih D (1)");
P("daily-a-2", "daily", { seed: "synthetic-seed-a", date: "2026-11-01" }, "tohum A tarih D (2) — aynı sonuç beklenir");
P("daily-b-1", "daily", { seed: "synthetic-seed-b", date: "2026-11-01" }, "tohum B tarih D");
P("daily-a-d2", "daily", { seed: "synthetic-seed-a", date: "2026-11-02" }, "tohum A tarih D+1");
P("daily-noseed", "daily", { date: "2026-11-01" }, "tohumsuz ortak sayı");
P("daily-a-en", "daily", { seed: "synthetic-seed-a", date: "2026-11-01" }, "tohum A tarih D en — dil sayıyı değiştirmemeli", "en");

// ── Q. Chart sınırları
P("ch2-single", "chart", { fullName: "Cem", year: 1990, month: 7, day: 15, targetDate: "2026-10-29" }, "chart tek kelime ad");
P("ch2-currentyear", "chart", { fullName: "Ece Nur Arslan", year: 1963, month: 1, day: 17, targetDate: "2026-10-29", currentYear: 2030 }, "currentYear yalnız PY'yi değiştirir");
P("ch2-young", "chart", { fullName: "Ilgaz Tuna Erdem", year: 2002, month: 9, day: 9, targetDate: "2037-09-09" }, "35. yaş günü: olgunluk aktivasyonu sınırı");
P("ch2-old", "chart", { fullName: "Ali Veli Kaya", year: 1900, month: 1, day: 1, targetDate: "2026-10-29" }, "1900");
P("ch2-novowel", "chart", { fullName: "Brynn Wyck", year: 1990, month: 7, day: 15, targetDate: "2026-10-29" }, "sesli harfsiz ad chart'ta");
P("err-ch2-before", "chart", { fullName: "Cem", year: 1990, month: 7, day: 15, targetDate: "1980-01-01" }, "hedef tarih doğumdan önce → 400?");
P("ch2-master-mixed", "chart", { fullName: "Ayşe Ece Yıldız", year: 1979, month: 11, day: 22, targetDate: "2026-10-29" }, "pinnacle/challenge usta bileşenler (ay 11, gün 22)");

writeCases("02-matrix.json", cases);
