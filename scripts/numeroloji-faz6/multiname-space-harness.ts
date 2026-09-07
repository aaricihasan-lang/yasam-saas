/**
 * NUMEROLOJİ FAZ 6 / FINAL UAT ISSUE #2+#3+#4 — çoklu-isim + boşluk + özel-sayı display.
 *
 * KAPSAM:
 *   • ISSUE #3: çoklu isim/soyisim kelime-sınırı tokenizasyonu + per-part hesap (motor).
 *   • ISSUE #4: Ad/Soyad giriş formatter'ının boşluğu KORUMASI (yazım simülasyonu) —
 *               "Hasan Ali" / "ARICI YILMAZ" birleşmemeli.
 *   • ISSUE #2: özel-sayı parantez display'i — anlamsız "11/11 (11/11)" tekrarı SUSTURULUR,
 *               gerçek alternatif okuma (ör. "22/11 (11/22)") KORUNUR. Yeni formül YOK.
 *
 * Çalıştır:  npx tsx scripts/numeroloji-faz6/multiname-space-harness.ts
 */
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { splitNameParts } from "@/lib/numeroloji/ortak";
import { formatFirstNameTurkish, formatLastNameTurkish } from "@/app/numeroloji/helpers/nameInputFormat";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass += 1;
  else { fail += 1; failures.push(`  ✗ ${label}${detail ? `  → ${detail}` : ""}`); }
}
function eq<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  assert(a === e, label, a === e ? undefined : `beklenen ${e}, gelen ${a}`);
}

/**
 * Kontrollü input (React controlled component) yazım simülasyonu:
 * her karakter, formatter'ın DÖNDÜĞÜ mevcut değerin sonuna eklenir.
 * Boşluk anında siliniyorsa bir sonraki kelime birleşir — bu bug'ı yakalar.
 */
function simulateTyping(formatter: (v: string) => string, text: string): string {
  let state = "";
  for (const ch of Array.from(text)) {
    state = formatter(state + ch);
  }
  return state;
}

// ── ISSUE #3: TOKENIZASYON (kelime sınırı) ───────────────────────────────────────
eq(splitNameParts("Hasan", ""), ["Hasan"], "NAME-01 tek isim");
eq(splitNameParts("Hasan Ali", ""), ["Hasan", "Ali"], "NAME-02 iki isim ayrı token");
eq(splitNameParts("Hasan Ali Kemal", ""), ["Hasan", "Ali", "Kemal"], "NAME-03 üç isim ayrı token");
eq(splitNameParts(" Hasan Ali ", ""), ["Hasan", "Ali"], "NAME-04 baş/son boşluk trimlenir, kelimeler korunur");
eq(splitNameParts("Hasan   Ali", ""), ["Hasan", "Ali"], "NAME-05 çoklu iç boşluk → iki token (birleşmez)");
eq(splitNameParts("", "Arıcı"), ["Arıcı"], "SURNAME-01 tek soyisim");
eq(splitNameParts("", "Arıcı Yılmaz"), ["Arıcı", "Yılmaz"], "SURNAME-02 iki soyisim ayrı token");
eq(splitNameParts("", "Arıcı Yılmaz Demir"), ["Arıcı", "Yılmaz", "Demir"], "SURNAME-03 üç soyisim ayrı token");
eq(splitNameParts("Hasan Ali", "Arıcı Yılmaz"), ["Hasan", "Ali", "Arıcı", "Yılmaz"], "FULL-01 2 isim + 2 soyisim = 4 token");
eq(splitNameParts("Hasan Ali Kemal", "Arıcı Yılmaz Demir"),
  ["Hasan", "Ali", "Kemal", "Arıcı", "Yılmaz", "Demir"], "FULL-02 3+3 = 6 token");

// SPACE-03: birleşme YOK (token yapısı)
assert(JSON.stringify(splitNameParts("Hasan Ali", "")) !== JSON.stringify(["HasanAli"]),
  "SPACE-03 'Hasan Ali' token yapısı 'HasanAli' DEĞİLDİR");

// ── ISSUE #4: BOŞLUK KORUNUMU (yazım simülasyonu) ─────────────────────────────────
eq(simulateTyping(formatFirstNameTurkish, "Hasan Ali"), "Hasan Ali", "SPACE-01 Ad: 'Hasan Ali' yazımı boşluğu korur");
eq(simulateTyping(formatFirstNameTurkish, "Hasan Ali Kemal"), "Hasan Ali Kemal", "SPACE-01b Ad: üçlü isim boşlukları korur");
eq(simulateTyping(formatLastNameTurkish, "ARICI YILMAZ"), "ARICI YILMAZ", "SPACE-02 Soyad: 'ARICI YILMAZ' yazımı boşluğu korur (birleşmez)");
eq(simulateTyping(formatLastNameTurkish, "ARICI YILMAZ DEMIR"), "ARICI YILMAZ DEMIR", "SPACE-02b Soyad: üçlü soyisim boşlukları korur");
// SPACE-04: normalize edilmiş tek boşluk (çoklu boşluk / baş-son) — kayıt öncesi normalizasyon
eq(formatFirstNameTurkish("  Hasan   Ali  ".trim()), "Hasan Ali", "SPACE-04a Ad: çoklu/baş-son boşluk → tek boşluk");
eq(formatLastNameTurkish("  Arıcı   Yılmaz  ".trim()), "ARICI YILMAZ", "SPACE-04b Soyad: çoklu/baş-son boşluk → tek boşluk");
// Birleşme regresyon guard: sonuçta boşluk mevcut olmalı
assert(simulateTyping(formatLastNameTurkish, "ARICI YILMAZ").includes(" "), "SPACE-02c Soyad birleşmedi (boşluk var)");

// ── ISSUE #3: PER-TOKEN HESAP (motor step izleri) ─────────────────────────────────
{
  const ana = calcAnaKulvar("Hasan Ali Kemal", "Arıcı Yılmaz");
  const blob = ana.steps.join("\n").toLocaleLowerCase("tr-TR");
  for (const tok of ["hasan", "ali", "kemal", "arıcı", "yılmaz"]) {
    assert(blob.includes(tok), `MULTI-CALC per-token step içerir: ${tok}`, blob.slice(0, 120));
  }
}
// Determinizm (aynı input → aynı sonuç)
{
  const a1 = calcAnaKulvar("Hasan Ali", "Arıcı Yılmaz");
  const a2 = calcAnaKulvar("Hasan Ali", "Arıcı Yılmaz");
  eq(a1.display, a2.display, "MULTI-CALC determinizm (Ana display kararlı)");
}

// ── ISSUE #2: ÖZEL-SAYI DISPLAY GOLDEN ────────────────────────────────────────────
// Sesli harf değerleri: A=1 E=5 I/İ=9 O/Ö=6 U/Ü=3 (per-part vowel toplamı).
// SPECIAL-DISPLAY-01: part1 "AEE"=11 (özel), part2 "E"=5, part3 "O"=6 → 5+6=11.
//   Eski: "11/11 (11/11)" (anlamsız tekrar) → Yeni: "11/11" (parantez susturulur).
eq(calcAnaKulvar("AEE E O", "").display, "11/11", "SPECIAL-DISPLAY-01 anlamsız '11/11 (11/11)' → '11/11'");
assert(!calcAnaKulvar("AEE E O", "").display.includes("("), "SPECIAL-DISPLAY-01b redundant parantez YOK");

// SPECIAL-DISPLAY-02: part1 "IIAU"=9+9+1+3=22 (özel), part2 "E"=5, part3 "O"=6.
//   main "22/11", alternatif pair 5+6=11 / kalan 22 → "(11/22)" ≠ main → KORUNUR.
eq(calcAnaKulvar("IIAU E O", "").display, "22/11 (11/22)", "SPECIAL-DISPLAY-02 gerçek alternatif okuma KORUNUR");

// SPECIAL-DISPLAY-03: iki özel component (non-special YOK) → OWNER combined-reading kuralı.
//   part1 "AEE"=11, part2 "AEE"=11 → main "11/11", combined 22 → "11/11 (22)".
//   (Detaylı combined-reading matrisi combined-reading-harness.ts'de.)
eq(calcAnaKulvar("AEE AEE", "").display, "11/11 (22)", "SPECIAL-DISPLAY-03 çift-özel → OWNER '11/11 (22)'");

// Tek 11 → otomatik "(22)" EKLENMEZ (kaynak-dışı format uydurulmadı).
{
  const d = calcAnaKulvar("AEE", "").display;
  assert(!d.includes("(22)"), "SPECIAL-DISPLAY-04 tek 11 → otomatik '(22)' YOK", d);
}

// Yan Kulvar (ünsüz) degenerate suppression paralel doğrulaması.
// Ünsüz değerleri: H=8 C=3 (→11 özel), N=5, F=6 (→11). part1 "HC", part2 "N", part3 "F".
eq(calcYanKulvar("HC N F", "").display, "11/11", "SPECIAL-DISPLAY-05 Yan Kulvar redundant parantez susturulur");

console.log(`\nNUMEROLOJİ FAZ 6 / MULTI-NAME + SPACE + SPECIAL-DISPLAY: ${pass} PASS · ${fail} FAIL`);
if (fail > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("Kelime sınırları korunuyor; boşluk yazımda kaybolmuyor; özel-sayı parantezi anlamlı olduğunda gösteriliyor.");
