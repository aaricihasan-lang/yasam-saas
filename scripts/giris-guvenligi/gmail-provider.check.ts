/**
 * GİRİŞ GÜVENLİĞİ F2-D — Gmail API sağlayıcısı + MIME + şablon birim kontrolü (SAHTE fetch; ağ YOK).
 * Gerçek Google'a istek ATILMAZ; gerçek gönderim testi DEĞİLDİR (bkz. kurulum belgesi §8).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/gmail-provider.check.ts
 */
import { createGmailProvider, GMAIL_SEND_SCOPE } from "@/lib/email/gmailProvider";
import { buildMimeMessage, encodeHeaderWord, isSafeEmailAddress } from "@/lib/email/mime";
import { renderOtpEmail } from "@/lib/email/templates/otpEmail";
import { getEmailProvider, resetEmailProviderCache } from "@/lib/email/provider";
import { emailOtpConfigured, generateOtpCode, hashOtp, maskEmail } from "@/lib/auth/emailOtp";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

type Call = { url: string; init: RequestInit };
type Step = { status: number; body: unknown } | "throw";
function fakeFetch(steps: Step[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const s = steps.shift();
    if (!s || s === "throw") throw new Error("ağ hatası (sahte)");
    return new Response(JSON.stringify(s.body), { status: s.status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const ENV = {
  GMAIL_OAUTH_CLIENT_ID: "cid.apps.googleusercontent.com",
  GMAIL_OAUTH_CLIENT_SECRET: "sahte-gizli",
  GMAIL_OAUTH_REFRESH_TOKEN: "sahte-yenileme",
  GMAIL_SENDER: "dogrulama@ornek-alan.test",
};
const MSG = { to: "uzman@ornek.test", subject: "123456 — Yaşam Sistemi doğrulama kodunuz", text: "metin", html: "<p>html</p>", category: "login" as const };
const TOKEN = { status: 200, body: { access_token: "ya29.sahte", expires_in: 3599, scope: GMAIL_SEND_SCOPE } };

async function main() {
  console.log("── Yapılandırma ──");
  ok(GMAIL_SEND_SCOPE === "https://www.googleapis.com/auth/gmail.send", "kapsam yalnız gmail.send");
  ok(createGmailProvider({ ...ENV, GMAIL_OAUTH_REFRESH_TOKEN: "" }) === null, "eksik yenileme token'ı → sağlayıcı YOK");
  ok(createGmailProvider({ ...ENV, GMAIL_SENDER: "kotu\r\nBcc: x@y.z" }) === null, "geçersiz gönderen adresi → sağlayıcı YOK");
  resetEmailProviderCache();
  ok(getEmailProvider({ EMAIL_PROVIDER: "synthetic", VERCEL_ENV: "production" }) === null, "production'da sentetik sağlayıcı REDDEDİLİR");
  ok(getEmailProvider({ EMAIL_PROVIDER: "disabled" }) === null && getEmailProvider({}) === null, "varsayılan: kapalı");
  // F2-J (L3): sentetik sağlayıcı yalnız açık izin + yerel veritabanı + üretim/önizleme dışı.
  const LOCAL = { EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" };
  ok(getEmailProvider(LOCAL)?.name === "synthetic", "L3 izinli yerel test ortamı → sentetik sağlayıcı");
  ok(getEmailProvider({ ...LOCAL, EMAIL_SYNTHETIC_ALLOW: undefined }) === null, "L3 açık izin (EMAIL_SYNTHETIC_ALLOW=1) yok → REDDEDİLİR");
  ok(getEmailProvider({ ...LOCAL, VERCEL_ENV: "preview" }) === null, "L3 Vercel önizleme → REDDEDİLİR");
  ok(getEmailProvider({ ...LOCAL, VERCEL_ENV: "production" }) === null, "L3 Vercel üretim (izin bayrağı olsa bile) → REDDEDİLİR");
  ok(getEmailProvider({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" }) === null,
    "L3 uzak (ör. üretim) veritabanına bağlı ortam → REDDEDİLİR");
  ok(getEmailProvider({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1.evil.example" }) === null, "L3 yerel adres taklidi (alt alan) → REDDEDİLİR");
  ok(getEmailProvider({ ...LOCAL, NEXT_PUBLIC_SUPABASE_URL: undefined }) === null, "L3 veritabanı adresi yok → REDDEDİLİR");
  ok(getEmailProvider({ ...LOCAL, NODE_ENV: "production" })?.name === "synthetic", "L3 next start (NODE_ENV=production) yerel testleri bozmaz");
  ok(getEmailProvider({ EMAIL_PROVIDER: "gmail", ...ENV })?.name === "gmail", "EMAIL_PROVIDER=gmail → Gmail sağlayıcısı");
  ok(!emailOtpConfigured({ EMAIL_PROVIDER: "gmail", ...ENV, AUTH_OTP_PEPPER: "kisa" }), "pepper < 32 karakter → yöntem kapalı");
  ok(emailOtpConfigured({ EMAIL_PROVIDER: "gmail", ...ENV, AUTH_OTP_PEPPER: "x".repeat(32) }), "sağlayıcı + pepper → yöntem açık");

  console.log("── Başarılı gönderim ──");
  {
    const { f, calls } = fakeFetch([TOKEN, { status: 200, body: { id: "msg-1" } }, { status: 200, body: { id: "msg-2" } }]);
    const p = createGmailProvider(ENV, f)!;
    const r = await p.send(MSG);
    ok(r.ok && r.providerMessageId === "msg-1", "token + gönderim → ok", r);
    ok(calls[0].url === "https://oauth2.googleapis.com/token" && String(calls[0].init.body).includes("grant_type=refresh_token"), "token yenileme isteği");
    ok(calls[1].url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", "Gmail send uç noktası");
    const auth = (calls[1].init.headers as Record<string, string>).Authorization;
    ok(auth === "Bearer ya29.sahte", "erişim token'ı başlıkta");
    const raw = Buffer.from(JSON.parse(String(calls[1].init.body)).raw, "base64url").toString("utf8");
    ok(/^From: =\?UTF-8\?B\?.+\?= <dogrulama@ornek-alan\.test>\r\n/m.test(raw) && /\r\nTo: <uzman@ornek\.test>\r\n/.test(raw), "MIME From/To", raw.slice(0, 200));
    ok(/Subject: =\?UTF-8\?B\?/.test(raw) && /multipart\/alternative/.test(raw), "UTF-8 konu + multipart/alternative");
    const r2 = await p.send(MSG);
    ok(r2.ok && calls.length === 3, "token önbellekte (ikinci gönderimde yenileme YOK)");
  }

  console.log("── Hata yolları ──");
  {
    const { f } = fakeFetch([{ status: 400, body: { error: "invalid_grant" } }]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(!r.ok && r.code === "oauth_invalid_grant" && !r.retryable, "invalid_grant → oauth_invalid_grant (Owner yeniden yetkilendirir)", r);
  }
  {
    const { f, calls } = fakeFetch([{ status: 200, body: { access_token: "ya29.genis", expires_in: 3599, scope: `${GMAIL_SEND_SCOPE} https://mail.google.com/` } }]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(!r.ok && r.code === "oauth_error" && calls.length === 1, "F2-I: gmail.send dışında kapsamlı token KULLANILMAZ (gönderim yok)", r);
  }
  {
    const { f } = fakeFetch([{ status: 401, body: { error: "invalid_client" } }]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(!r.ok && r.code === "oauth_error", "token uç noktası başka hata → oauth_error", r);
  }
  {
    const { f, calls } = fakeFetch([TOKEN, { status: 401, body: {} }, TOKEN, { status: 200, body: { id: "m" } }]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(r.ok && calls.length === 4, "401 → token zorla yenilenir + 1 tekrar", calls.map((c) => c.url));
  }
  {
    const { f, calls } = fakeFetch([TOKEN, { status: 429, body: { error: { errors: [{ reason: "rateLimitExceeded" }] } } }]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(!r.ok && r.code === "quota" && calls.length === 2, "429 → quota, tekrar YOK", r);
  }
  {
    const { f } = fakeFetch([TOKEN, { status: 403, body: { error: { errors: [{ reason: "dailyLimitExceeded" }] } } }]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(!r.ok && r.code === "quota", "403 dailyLimitExceeded → quota", r);
  }
  {
    // Yenilenmiş token da 401 alırsa (ör. yetki geri alındı): ikinci yenileme / sonsuz döngü YOK → oauth_error.
    const { f, calls } = fakeFetch([TOKEN, { status: 401, body: {} }, TOKEN, { status: 401, body: {} }]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(!r.ok && r.code === "oauth_error" && !r.retryable && calls.length === 4, "iki kez 401 → oauth_error, tek yenileme (döngü yok)", { r, n: calls.length });
  }
  {
    // Kota dışı 403 (ör. gönderici izni / politika): tekrar YOK → oauth_error (Owner yapılandırmayı düzeltir).
    const { f, calls } = fakeFetch([TOKEN, { status: 403, body: { error: { errors: [{ reason: "insufficientPermissions" }] } } }]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(!r.ok && r.code === "oauth_error" && !r.retryable && calls.length === 2, "403 insufficientPermissions → oauth_error, tekrar YOK", { r, n: calls.length });
  }
  {
    const { f, calls } = fakeFetch([TOKEN, { status: 503, body: {} }, { status: 200, body: { id: "m" } }]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(r.ok && calls.length === 3, "5xx → 1 tekrar → ok");
  }
  {
    const { f } = fakeFetch([TOKEN, { status: 500, body: {} }, { status: 502, body: {} }]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(!r.ok && r.code === "provider_down" && r.retryable, "iki kez 5xx → provider_down", r);
  }
  {
    // F2-K (L5): gönderimde zaman aşımı / bağlantı kopması → ileti ulaşmış olabilir; İKİNCİ GÖNDERİM YOK.
    const { f, calls } = fakeFetch([TOKEN, "throw", { status: 200, body: { id: "kopya" } }]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(!r.ok && r.code === "network" && calls.length === 2, "L5 gönderim belirsiz (zaman aşımı) → tek deneme, kopya e-posta yok", { r, calls: calls.length });
  }
  {
    const { f } = fakeFetch(["throw"]);
    const r = await createGmailProvider(ENV, f)!.send(MSG);
    ok(!r.ok && r.code === "network", "token uç noktasına ulaşılamaz → network", r);
  }
  {
    const { f, calls } = fakeFetch([TOKEN]);
    const r = await createGmailProvider(ENV, f)!.send({ ...MSG, to: "kurban@x.test\r\nBcc: hepsi@x.test" });
    ok(!r.ok && r.code === "rejected" && calls.length === 0, "alıcıda CR/LF (başlık enjeksiyonu) → gönderilmez", r);
  }

  console.log("── MIME / şablon / kod ──");
  ok(!isSafeEmailAddress("a@b") && isSafeEmailAddress("a.b+c@d.co") && !isSafeEmailAddress("a@b.co>"), "adres doğrulayıcı");
  let threw = false;
  try { buildMimeMessage({ fromName: "x", fromAddress: "a@b.co", to: "c@d.co", subject: "s\r\nBcc: e@f.co", text: "t", html: "h" }); } catch { threw = true; }
  ok(threw, "konuda CR/LF → MIME kurulmaz");
  ok(encodeHeaderWord("Yaşam") === `=?UTF-8?B?${Buffer.from("Yaşam").toString("base64")}?=`, "RFC 2047 başlık kodlaması");
  {
    const long = "Güvenlik bildirimi — hesabınızın kurtarma kodları yenilendi; eski kodlar artık geçersiz (Yaşam Sistemi)";
    const enc = encodeHeaderWord(long);
    const words = enc.split("\r\n ");
    const dec = words.map((w) => Buffer.from(/^=\?UTF-8\?B\?(.*)\?=$/.exec(w)?.[1] ?? "", "base64").toString("utf8")).join("");
    ok(words.length > 1 && words.every((w) => w.length <= 75) && dec === long, "F2-I: uzun Türkçe konu — her kodlanmış kelime ≤ 75 karakter, içerik birebir", words.map((w) => w.length));
    const mm = buildMimeMessage({ fromName: "Yaşam Sistemi", fromAddress: "a@b.co", to: "c@d.co", subject: long, text: "t", html: "h" });
    ok(/\r\nSubject: =\?UTF-8\?B\?[^\r\n]+\?=\r\n =\?UTF-8/.test(mm), "F2-I: katlanmış Subject başlığı (devam satırı boşlukla)");
  }
  const m = renderOtpEmail({ purpose: "login", code: "042917", name: "Ayşe", minutes: 3 });
  // Kod konu satırında YOK (bildirim önizlemesi / günlük); yalnız gövdede.
  ok(!m.subject.includes("042917") && m.text.includes("042917") && /giriş/i.test(m.text) && /3 dakika/.test(m.text) && /kimseyle paylaşmayın/i.test(m.text), "giriş şablonu (TR): kod gövdede, konuda değil", m.subject);
  ok(!/https?:\/\//.test(m.text + m.html) && !/<script|<img/i.test(m.html), "şablonda bağlantı / görsel / betik YOK");
  const v = renderOtpEmail({ purpose: "verify_email", code: "000001", name: null });
  ok(/doğrula/i.test(v.text) && v.text.includes("000001"), "e-posta doğrulama şablonu");
  const t = renderOtpEmail({ purpose: "owner_test" });
  ok(!/[0-9]{6}/.test(t.subject + t.text), "Owner test iletisi kod içermez");
  const xss = renderOtpEmail({ purpose: "login", code: "123456", name: "<script>alert(1)</script>" });
  ok(!xss.html.includes("<script>"), "ad alanı HTML'de kaçışlı");
  const codes = new Set(Array.from({ length: 2000 }, () => generateOtpCode()));
  ok([...codes].every((c) => /^[0-9]{6}$/.test(c)) && codes.size > 1990, "6 haneli, baştaki sıfır korunur, tekrar yok denecek kadar az");
  const P = "p".repeat(40);
  ok(hashOtp("login:a", "123456", P) !== hashOtp("login:b", "123456", P) && /^[0-9a-f]{64}$/.test(hashOtp("verify:u", "1", P)), "HMAC kapsama bağlı (challenge/kullanıcı)");
  ok(hashOtp("login:a", "123456", P) !== hashOtp("login:a", "123456", "q".repeat(40)), "HMAC pepper'a bağlı");
  ok(maskEmail("ayse.yilmaz@ornek.com") === "a***@o***.com" && maskEmail("x@y.z") === "x*@y*.z" && maskEmail("bozuk") === "***", "adres maskesi", maskEmail("x@y.z"));

  console.log(`\ngmail-provider check: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
