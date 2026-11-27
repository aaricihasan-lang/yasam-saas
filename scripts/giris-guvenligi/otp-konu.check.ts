/**
 * GİRİŞ GÜVENLİĞİ — OTP e-postasında kod KONU satırında YOK (yalnız gövdede). Saf; ağ / DB YOK.
 * Neden: kilit ekranı / bildirim önizlemeleri, posta istemcisi listeleri ve sağlayıcı günlükleri konuyu gösterir.
 * Çalıştır: npx tsx scripts/giris-guvenligi/otp-konu.check.ts
 */
import { renderOtpEmail, type OtpPurpose } from "@/lib/email/templates/otpEmail";
import { buildMimeMessage } from "@/lib/email/mime";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); } else { fail++; console.log(`  FAIL ${label}`); }
}
const CODE = "482915";
for (const p of ["login", "verify_email", "change_email", "step_up"] as OtpPurpose[]) {
  const m = renderOtpEmail({ purpose: p, code: CODE, name: "Ad Soyad" });
  ok(!/[0-9]{6}/.test(m.subject), `${p}: konu satırında 6 haneli kod YOK ("${m.subject}")`);
  ok(m.text.includes(CODE) && m.html.includes(CODE), `${p}: kod metin ve HTML gövdesinde VAR`);
  const raw = buildMimeMessage({ fromName: "Yaşam Sistemi", fromAddress: "info@ornek.test", to: "kisi@ornek.test", subject: m.subject, text: m.text, html: m.html, messageId: "<x@ornek.test>" });
  const subj = raw.split(/\r?\n/).find((l) => /^Subject:/i.test(l)) ?? "";
  ok(!subj.includes(CODE), `${p}: MIME Subject başlığında kod YOK`);
}
const t = renderOtpEmail({ purpose: "owner_test" });
ok(!/[0-9]{6}/.test(t.subject + t.text), "owner_test: kod içermez (değişmedi)");
let threw = false;
try { renderOtpEmail({ purpose: "login", code: "12345" }); } catch { threw = true; }
ok(threw, "6 hane olmayan kod reddedilir (değişmedi)");
console.log(`\notp-konu: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
