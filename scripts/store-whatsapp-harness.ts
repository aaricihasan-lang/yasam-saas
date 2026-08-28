/* Geçici (disposable) — Doğal Pazar WhatsApp mantığı doğrulama harness'i. */
import {
  normalizeWhatsappNumber,
  buildWhatsappProductMessage,
  buildWhatsappLink,
} from "@/lib/store/whatsapp";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  got=${JSON.stringify(got)}`); }
}

// normalize
check("+90 boşluklu → 905551234567", normalizeWhatsappNumber("+90 555 123 45 67") === "905551234567", normalizeWhatsappNumber("+90 555 123 45 67"));
check("0555… yerel 0 düşer", normalizeWhatsappNumber("0555 123 45 67") === "5551234567", normalizeWhatsappNumber("0555 123 45 67"));
check("0090… → 90…", normalizeWhatsappNumber("00905551234567") === "905551234567", normalizeWhatsappNumber("00905551234567"));
check("harf → null", normalizeWhatsappNumber("abc") === null);
check("çok kısa → null", normalizeWhatsappNumber("12") === null);
check("null → null", normalizeWhatsappNumber(null) === null);

// message
const msgWithSku = buildWhatsappProductMessage({ name: "Ametist Kolye", sku: "AMT-1", price: 780, currency: "TRY" });
check("SKU varsa Ürün Kodu satırı var", msgWithSku.includes("Ürün Kodu: AMT-1"));
check("fiyat formatlı", /Fiyat: 780,00/.test(msgWithSku), msgWithSku);
const msgNoSku = buildWhatsappProductMessage({ name: "Lavanta Yağı", sku: null, price: 240, currency: "TRY" });
check("SKU yoksa Ürün Kodu satırı YOK", !msgNoSku.includes("Ürün Kodu"));
check("Türkçe ürün adı korunur", msgNoSku.includes("Lavanta Yağı"));

// link
const link = buildWhatsappLink("905551234567", msgNoSku);
check("geçerli link wa.me", !!link && link.startsWith("https://wa.me/905551234567?text="), link);
check("Türkçe karakter encode (Yaşam→Ya%C5%9Fam)", !!link && link.includes("Ya%C5%9Fam"), link);
check("boşluk %20 encode", !!link && link.includes("%20"));
check("numara yoksa link null", buildWhatsappLink(null, msgNoSku) === null);
check("geçersiz numara link null", buildWhatsappLink("abc", msgNoSku) === null);

console.log(`\nWhatsApp harness: ${pass} geçti, ${fail} kaldı`);
process.exit(fail === 0 ? 0 : 1);
