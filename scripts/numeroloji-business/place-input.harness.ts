/**
 * D4 (06.11.2026) — Ev / Ofis Sayısı ve İşyeri adı GİRİŞ doğrulaması harness'i.
 *
 * Kaynak yöntem (kitap 1. seviye) DEĞİŞMEZ: Apartman No + Daire No → toplam → sadeleştirme (4 + 11 = 15 → 6).
 * Bu harness: girişin sessizce değiştirilmediğini, dönüşümün açıkça gösterildiğini, çok uzun girişin NaN /
 * hassasiyet kaybı üretmediğini ve ekran dosyasının artık rakam dışı karakteri silmediğini doğrular.
 * Çalıştır: npx tsx scripts/numeroloji-business/place-input.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { calcPlaceNumber } from "@/lib/numeroloji/place";
import { analyzeBusinessCompatibility } from "@/lib/numeroloji/business";
import {
  PLACE_NUMBER_MAX_DIGITS,
  businessNameDigitGroups,
  parsePlaceNumberInput,
  placeInputMessage,
} from "@/app/numeroloji/utils/placeInput";

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
const val = (s: string) => {
  const p = parsePlaceNumberInput(s);
  return p.status === "ok" ? p.value : p.status;
};
const root = (n: number) => (n === 0 ? 0 : 1 + ((n - 1) % 9));

console.log("— kaynak örneği korunur");
{
  const r = calcPlaceNumber(val("4") as number, val("11") as number)!;
  ok(r.rawTotal === 15 && r.reducedNumber === 6 && JSON.stringify(r.steps) === JSON.stringify(["1 + 5 = 6"]), "4 + 11 = 15 → 6 (kitap 1)");
  const p = parsePlaceNumberInput("4");
  ok(p.status === "ok" && !p.altered && placeInputMessage("Kapı", p) === null, "düz rakam girişi: uyarı yok");
}

console.log("— owner listesindeki girişler (yöntem aynı, dönüşüm görünür)");
const cases: Array<[string, number, string]> = [
  ["12/3", 123, "“/”"],
  ["5-7", 57, "“-”"],
  ["27B", 27, "“B”"],
  ["12B", 12, "“B”"],
  ["A-302", 302, "“A”, “-”"],
];
for (const [raw, expected, ign] of cases) {
  const p = parsePlaceNumberInput(raw);
  const m = placeInputMessage("Kapı / Apartman No", p);
  ok(p.status === "ok" && p.value === expected && p.altered, `“${raw}” → ${expected} (önceki hesapla aynı sayı)`, p);
  ok(!!m && m.tone === "info" && m.text.includes(`“${raw}” → ${expected}`) && m.text.includes(`${ign} hesaba katılmaz`), `“${raw}”: dönüşüm + yok sayılan karakter AÇIKÇA yazılır`, m);
}
ok(root(123 + 11) === root(12 + 3 + 11) && root(57 + 1) === root(5 + 7 + 1), "aynı son kök: rakam birleştirme ile ayrı toplama aynı sonucu verir (yazım farkı hesap hatası değil)");

console.log("— hatalı girişler hesap üretmez");
ok(placeInputMessage("Kapı", parsePlaceNumberInput("12 3"))?.text === "“12 3” → 123: boşluklar hesaba katılmaz, yalnız rakamlar kullanılır.", "iç boşluk: anlaşılır mesaj");
ok(parsePlaceNumberInput("").status === "empty" && parsePlaceNumberInput("   ").status === "empty", "boş → bekleme");
ok(parsePlaceNumberInput("B").status === "noDigits" && placeInputMessage("Daire No", parsePlaceNumberInput("B"))?.tone === "error", "rakamsız → hata mesajı");
ok(parsePlaceNumberInput("0").status === "zero" && parsePlaceNumberInput("00").status === "zero", "0 → hata (önceden sessizce boş ekran)");
ok(val("007") === 7, "baştaki sıfırlar: 007 → 7 (önceki parseInt davranışı)");
ok(val("99999") === 99999 && parsePlaceNumberInput("100000").status === "tooLong", `en çok ${PLACE_NUMBER_MAX_DIGITS} hane (kampanya ucuyla aynı 1–99999)`);
ok(parsePlaceNumberInput("1234567890123456789012").status === "tooLong", "22 hane → hata (önceden sonuç NaN gösteriliyordu)");
{
  const old = calcPlaceNumber(parseInt("1234567890123456789012", 10), 5);
  ok(!!old && Number.isNaN(old.reducedNumber), "kanıt: motor aşırı uzun sayıda NaN üretir → ekranda engellenmeli");
}

console.log("— işyeri adındaki rakamlar");
ok(JSON.stringify(businessNameDigitGroups("A101 MARKET 24")) === JSON.stringify(["101", "24"]) && businessNameDigitGroups("CANTAŞ").length === 0, "rakam grupları bulunur");
{
  const a = analyzeBusinessCompatibility({ name: "Ahmet", birthDate: "01.01.1990", businessName: "A101 MARKET" });
  const b = analyzeBusinessCompatibility({ name: "Ahmet", birthDate: "01.01.1990", businessName: "A MARKET" });
  ok(a?.variants[0]?.businessNameValue === b?.variants[0]?.businessNameValue && (a?.unsupportedCharacters.length ?? -1) === 0, "kanıt: motor rakamı sessizce yok sayar ve uyarıya düşürmez → ekranda not gösterilmeli");
}

console.log("— ekran dosyası (statik)");
{
  const src = readFileSync(path.join(__dirname, "../../app/numeroloji/components/NumerolojiEvIsYeriSayisiTab.tsx"), "utf8");
  ok(!/replace\(\/\\D\/g, ""\)/.test(src), "giriş alanları rakam dışı karakteri artık SESSİZCE silmez");
  ok(/parsePlaceNumberInput\(kapiNoRaw\)/.test(src) && /parsePlaceNumberInput\(daireNoRaw\)/.test(src), "iki alan da ortak doğrulayıcıdan geçer");
  ok(/calcPlaceNumber\(kapiIn\.value, daireIn\.value\)/.test(src), "hesap yine kaynak motoru (calcPlaceNumber) ile");
  ok(/data-testid="noj-business-digits"/.test(src), "işyeri adı rakam notu ekranda");
}

console.log(`\nplace-input harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
