/**
 * Ayarlar > Admin ile İrtibat — doğrudan iletişim (WhatsApp click-to-chat + telefon) harness'ı.
 * Prod'a temas YOK. Çalıştır: npx tsx scripts/final-hardening/settings-contact.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CUSTOMER_SERVICE_DISPLAY, CUSTOMER_SERVICE_TEL, buildTelHref } from "../../lib/contact/info";
import {
  WHATSAPP_CANONICAL_NUMBER,
  WHATSAPP_DISPLAY_NUMBER,
  WHATSAPP_SUPPORT_MESSAGE,
  buildWhatsAppUrl,
} from "../../lib/contact/whatsapp";

const ROOT = join(__dirname, "..", "..");
let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  PASS ${name}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL ${name}: ${(e as Error).message}`);
  }
}

/** "0850 307 20 93" → "908503072093" (TR yurt içi 0 → ülke kodu 90). */
function trDisplayToCanonical(display: string): string {
  const digits = display.replace(/\D/g, "");
  return digits.startsWith("0") ? `90${digits.slice(1)}` : digits;
}

t("WhatsApp hedef URL tam olarak doğru numara + encode edilmiş Türkçe mesaj", () => {
  const url = buildWhatsAppUrl(WHATSAPP_SUPPORT_MESSAGE);
  assert.equal(
    url,
    "https://wa.me/908503072093?text=Merhaba%2C%20Ya%C5%9Fam%20Sistemi%20deste%C4%9Fi%20i%C3%A7in%20yaz%C4%B1yorum.",
  );
  const u = new URL(url);
  assert.equal(u.hostname, "wa.me");
  assert.equal(u.pathname, "/908503072093");
  assert.equal(u.searchParams.get("text"), "Merhaba, Yaşam Sistemi desteği için yazıyorum.");
});

t("görünen WhatsApp numarası ile hedef numara aynı (ülke kodu 90)", () => {
  assert.equal(WHATSAPP_DISPLAY_NUMBER, "0850 307 20 93");
  assert.equal(trDisplayToCanonical(WHATSAPP_DISPLAY_NUMBER), WHATSAPP_CANONICAL_NUMBER);
  assert.match(WHATSAPP_CANONICAL_NUMBER, /^90\d{10}$/);
});

t("telefon hedefi tel:+908503072093 ve görünen numarayla aynı", () => {
  assert.equal(buildTelHref(), "tel:+908503072093");
  assert.equal(CUSTOMER_SERVICE_DISPLAY, "0850 307 20 93");
  assert.equal(`+${trDisplayToCanonical(CUSTOMER_SERVICE_DISPLAY)}`, CUSTOMER_SERVICE_TEL);
});

const page = readFileSync(join(ROOT, "app/settings/page.tsx"), "utf8");

t("settings sayfasında numara hard-code edilmemiş; merkezî kaynaklardan import", () => {
  assert.ok(!/850\s*307|8503072093|wa\.me/.test(page), "numara/wa.me literal'i bulundu");
  assert.ok(page.includes('from "@/lib/contact/info"'));
  assert.ok(page.includes('from "@/lib/contact/whatsapp"'));
  assert.ok(page.includes("buildWhatsAppUrl(WHATSAPP_SUPPORT_MESSAGE)"));
  assert.ok(page.includes("buildTelHref()"));
});

t("WhatsApp kartı default-deny gate'e bağlı; yeni sekme güvenli rel", () => {
  assert.ok(/\{WHATSAPP_CONTACT_ENABLED && \(/.test(page));
  assert.ok(page.includes('target="_blank"') && page.includes('rel="noopener noreferrer"'));
});

t("CTA'lar erişilebilir ad + yeterli dokunma alanı taşır", () => {
  assert.ok(page.includes("aria-label={`WhatsApp’tan yaz: ${WHATSAPP_DISPLAY_NUMBER}"));
  assert.ok(page.includes("aria-label={`Telefonla ara: ${CUSTOMER_SERVICE_DISPLAY}`}"));
  assert.ok(page.includes("min-h-11"));
  assert.ok(page.includes("WhatsApp’tan Yaz") && page.includes("Telefonla Ara"));
});

t("sistem mesajı formu korunur (5000 sınırı, konu/mesaj alanları, gönder)", () => {
  assert.ok(page.includes('id="settings-contact-subject"') && page.includes('id="settings-contact-message"'));
  assert.ok(page.includes("maxLength={5000}") && page.includes('fetch("/api/settings/support"'));
  const route = readFileSync(join(ROOT, "app/api/settings/support/route.ts"), "utf8");
  assert.ok(route.includes("message.length > 5000") && route.includes("verifyUserRequest"));
  assert.ok(!/dangerouslySetInnerHTML/.test(page));
});

console.log(`\nsettings-contact harness: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
