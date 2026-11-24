/**
 * GİRİŞ GÜVENLİĞİ F2-M — SMTP sağlayıcısı: SAHTE SMTP sunucusuna (smtp-server + ham TLS soketleri; yalnız 127.0.0.1)
 * gerçek nodemailer bağlantılarıyla. Gerçek posta sunucusuna / gerçek kimlik bilgisine / internete istek ATILMAZ.
 * Test sertifikaları her koşuda openssl ile geçici klasörde üretilir (depoda özel anahtar YOK).
 *
 * Senaryolar: 465 TLS + 587 STARTTLS başarılı gönderim · STARTTLS sunmayan sunucu · kimlik reddi · güvenilmeyen sertifika ·
 * ad uyuşmazlığı · NODE_TLS_REJECT_UNAUTHORIZED=0 etkisiz · bağlantı reddi · karşılama zaman aşımı · toplam süre sınırı ·
 * DATA sonrası kopma (otomatik tekrar YOK) · kota (saatlik / oran) · kalıcı / geçici ret · başlık enjeksiyonu ·
 * yapılandırma doğrulaması ve sağlayıcı seçimi · günlük sınır varsayılanı · gizli bilgi sızıntısı.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/smtp-provider.check.ts
 */
import fs from "node:fs";
import net from "node:net";
import { HOST, makeCerts, startRaw, startSmtp } from "./smtpTestServer";
import { classifySmtpError, createSmtpProvider, smtpConfigIssue, type SmtpTestHooks } from "@/lib/email/smtpProvider";
import { getEmailProvider, resetEmailProviderCache, type EmailSendResult } from "@/lib/email/provider";
import { buildMimeMessage } from "@/lib/email/mime";
import { emailLimits, emailOtpConfigured } from "@/lib/auth/emailOtp";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

// ── Gizli bilgi sızıntısı yakalayıcı ─────────────────────────────────────────────────────────────────────────────────
const PASSWORD = "Sahte-Parola-7Qx!z9-ASLA-GORUNMEMELI";
const captured: string[] = [];
const origOut = process.stdout.write.bind(process.stdout);
const origErr = process.stderr.write.bind(process.stderr);
const origConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
function captureOn() {
  process.stdout.write = ((c: unknown, ...a: unknown[]) => { captured.push(String(c)); return (origOut as (...x: unknown[]) => boolean)(c, ...a); }) as typeof process.stdout.write;
  process.stderr.write = ((c: unknown, ...a: unknown[]) => { captured.push(String(c)); return (origErr as (...x: unknown[]) => boolean)(c, ...a); }) as typeof process.stderr.write;
  for (const k of ["warn", "error", "info", "debug"] as const) console[k] = (...a: unknown[]) => { captured.push(a.map(String).join(" ")); origConsole[k](...a); };
}

const ENV = (port: "465" | "587", over: Record<string, string | undefined> = {}) => ({
  EMAIL_PROVIDER: "smtp", SMTP_HOST: HOST, SMTP_PORT: port, SMTP_USER: "dogrulama@ornek-alan.test", SMTP_PASSWORD: PASSWORD,
  SMTP_SENDER: "dogrulama@ornek-alan.test", ...over,
});
const MSG = { to: "uzman@ornek.test", subject: "123456 — Yaşam Sistemi doğrulama kodunuz", text: "Kodunuz: 123456", html: "<p>Kodunuz: <b>123456</b></p>", category: "login" as const };
const FAST = { dns: 2000, connection: 1500, greeting: 1500, socket: 2000, total: 6000 };

async function sendWith(env: Record<string, string | undefined>, hooks: SmtpTestHooks, msg = MSG): Promise<{ r: EmailSendResult; ms: number }> {
  const p = createSmtpProvider(env, hooks);
  if (!p) throw new Error("sağlayıcı oluşmadı");
  const t0 = Date.now();
  const r = await p.send(msg);
  return { r, ms: Date.now() - t0 };
}
const results: unknown[] = [];

async function main() {
  captureOn();
  const C = makeCerts();
  const hooksFor = (port: number, extra: Partial<SmtpTestHooks> = {}): SmtpTestHooks => ({ connect: { host: "127.0.0.1", port }, ca: C.ca, timeoutsMs: FAST, ...extra });

  console.log("── 1) Başarılı gönderim: 465 doğrudan TLS ──");
  {
    const s = await startSmtp({ secure: true, tlsPair: C.srv });
    const { r } = await sendWith(ENV("465"), hooksFor(s.port)); results.push(r);
    ok(r.ok === true, "465: gönderim başarılı", r);
    ok(r.ok === true && /^<ys\.[0-9a-z]+\.[0-9a-f]{18}@ornek-alan\.test>$/.test(String(r.providerMessageId)), "sağlayıcı ileti kimliği = kendi Message-ID'miz (gönderen alanında)", r);
    ok(s.box.connects === 1 && s.box.mails.length === 1, "tek bağlantı, tek ileti", { c: s.box.connects, m: s.box.mails.length });
    const m = s.box.mails[0];
    ok(m?.from === "dogrulama@ornek-alan.test" && m?.to.join(",") === "uzman@ornek.test", "zarf: gönderen = SMTP_USER, alıcı tek adres");
    ok(s.box.auths.length === 1 && s.box.auths[0].user === "dogrulama@ornek-alan.test" && s.box.auths[0].pass === PASSWORD && s.box.auths[0].secure, "kimlik doğrulama TLS içinde yapıldı (sunucu doğru kullanıcıyı şifreli oturumda aldı)");
    ok(!!m && /^From: =\?UTF-8\?B\?[^\r\n]+ <dogrulama@ornek-alan\.test>\r?$/m.test(m.raw) && /^Message-ID: <ys\./m.test(m.raw) && /^Auto-Submitted: auto-generated/m.test(m.raw), "ileti başlıkları: From (UTF-8 ad), Message-ID, Auto-Submitted");
    ok(!!m && /^Subject: =\?UTF-8\?B\?/m.test(m.raw) && Buffer.from(String(m.raw.match(/^Subject: =\?UTF-8\?B\?([^?]+)\?=/m)?.[1]), "base64").toString("utf8").startsWith("123456"), "konu UTF-8 kodlu, kod konuda (mevcut şablon)");
    ok(!!m && !m.raw.includes(PASSWORD), "ileti içinde parola YOK");
    await s.close();
  }

  console.log("── 2) Başarılı gönderim: 587 ZORUNLU STARTTLS ──");
  {
    const s = await startSmtp({ secure: false, tlsPair: C.srv });
    const { r } = await sendWith(ENV("587"), hooksFor(s.port)); results.push(r);
    ok(r.ok === true && s.box.mails.length === 1 && s.box.auths.length === 1 && s.box.auths[0].secure, "587: STARTTLS sonrası (şifreli oturumda) kimlik + gönderim başarılı", { r, c: s.box.connects, m: s.box.mails.length, secure: s.box.auths[0]?.secure });
    await s.close();
  }

  console.log("── 3) STARTTLS sunmayan sunucu (587): düz metne düşüş YOK ──");
  {
    const s = await startSmtp({ secure: false, tlsPair: C.srv, noStartTls: true });
    const { r } = await sendWith(ENV("587"), hooksFor(s.port)); results.push(r);
    ok(!r.ok && r.code === "smtp_tls_error" && r.retryable === false, "STARTTLS yok → smtp_tls_error, tekrar yok", r);
    ok(s.box.auths.length === 0 && s.box.mails.length === 0, "kimlik bilgisi GÖNDERİLMEDİ, ileti yok", { auths: s.box.auths.length, mails: s.box.mails.length });
    await s.close();
  }

  console.log("── 4) Kimlik doğrulama hatası (535) ──");
  {
    const s = await startSmtp({ secure: true, tlsPair: C.srv, authFail: true });
    const { r } = await sendWith(ENV("465"), hooksFor(s.port)); results.push(r);
    ok(!r.ok && r.code === "smtp_auth_failed" && r.retryable === false, "535 → smtp_auth_failed (Owner bildirimi), tekrar yok", r);
    ok(s.box.connects === 1 && s.box.auths.length === 1 && s.box.mails.length === 0, "tek deneme, ileti yok (otomatik yeniden deneme YOK)", { c: s.box.connects, a: s.box.auths.length, m: s.box.mails.length });
    await s.close();
  }

  console.log("── 5) TLS: güvenilmeyen sertifika / ad uyuşmazlığı / NODE_TLS_REJECT_UNAUTHORIZED=0 ──");
  {
    const s = await startSmtp({ secure: true, tlsPair: C.self });
    const { r } = await sendWith(ENV("465"), hooksFor(s.port)); results.push(r);
    ok(!r.ok && r.code === "smtp_tls_error" && r.retryable === false, "kendinden imzalı (güvenilmeyen) sertifika → smtp_tls_error", r);
    ok(s.box.auths.length === 0 && s.box.mails.length === 0, "güvenilmeyen sunucuya parola GİTMEDİ", { a: s.box.auths.length, m: s.box.mails.length });
    const { r: rSys } = await sendWith(ENV("465"), { connect: { host: "127.0.0.1", port: s.port }, timeoutsMs: FAST }); results.push(rSys);
    ok(!rSys.ok && rSys.code === "smtp_tls_error", "test CA'sı verilmeden (sistem kökleri) → smtp_tls_error", rSys);
    const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const { r: r0 } = await sendWith(ENV("465"), { connect: { host: "127.0.0.1", port: s.port }, timeoutsMs: FAST }); results.push(r0);
    if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    ok(!r0.ok && r0.code === "smtp_tls_error" && s.box.auths.length === 0, "NODE_TLS_REJECT_UNAUTHORIZED=0 doğrulamayı KAPATAMAZ", { r0, auths: s.box.auths.length });
    await s.close();
    const s2 = await startSmtp({ secure: true, tlsPair: C.other });
    const { r: r2 } = await sendWith(ENV("465"), hooksFor(s2.port)); results.push(r2);
    ok(!r2.ok && r2.code === "smtp_tls_error" && s2.box.auths.length === 0, "aynı CA ama başka ad (baska.ornek-alan.test) → smtp_tls_error, parola gitmedi", { r2, auths: s2.box.auths.length });
    await s2.close();
    const s3 = await startSmtp({ secure: false, tlsPair: C.self });
    const { r: r3 } = await sendWith(ENV("587"), hooksFor(s3.port)); results.push(r3);
    ok(!r3.ok && r3.code === "smtp_tls_error" && s3.box.auths.length === 0, "587 STARTTLS'te güvenilmeyen sertifika → smtp_tls_error, parola gitmedi", { r3, auths: s3.box.auths.length });
    await s3.close();
  }

  console.log("── 6) Bağlantı reddi / karşılama zaman aşımı / toplam süre ──");
  {
    const tmp = net.createServer(); await new Promise<void>((r) => tmp.listen(0, "127.0.0.1", () => r()));
    const deadPort = (tmp.address() as net.AddressInfo).port; await new Promise<void>((r) => tmp.close(() => r()));
    const { r, ms } = await sendWith(ENV("465"), hooksFor(deadPort)); results.push(r);
    ok(!r.ok && r.code === "network" && r.retryable === true && ms < 4000, "kapalı port → network (hızlı)", { r, ms });
    const silent = await startRaw("silent", C.srv);
    const t = await sendWith(ENV("465"), hooksFor(silent.port)); results.push(t.r);
    ok(!t.r.ok && t.r.code === "network" && t.ms >= 1000 && t.ms < 4500, "karşılama gelmiyor → zaman aşımı sınırı içinde network", t);
    ok(silent.st.connects === 1, "zaman aşımında İKİNCİ bağlantı yok", silent.st);
    await silent.close();
    const stall = await startRaw("stall-after-data", C.srv);
    const t2 = await sendWith(ENV("465"), hooksFor(stall.port, { timeoutsMs: { ...FAST, socket: 20_000, total: 1500 } })); results.push(t2.r);
    ok(!t2.r.ok && t2.r.code === "network" && t2.ms >= 1400 && t2.ms < 3500, "DATA sonrası yanıt yok → TOPLAM süre sınırı (sunucusuz işlev asılı kalmaz)", t2);
    ok(stall.st.connects === 1 && stall.st.messages === 1, "ileti bir kez iletildi, ikinci deneme yok", stall.st);
    await stall.close();
  }

  console.log("── 7) DATA sonrası bağlantı kopması: teslim belirsiz → otomatik tekrar YOK ──");
  {
    const drop = await startRaw("drop-after-data", C.srv);
    const { r } = await sendWith(ENV("465"), hooksFor(drop.port)); results.push(r);
    ok(!r.ok && r.code === "network" && r.retryable === true, "kopma → network (kullanıcı bekleme sonrası yeniden ister)", r);
    await new Promise((res) => setTimeout(res, 300));
    ok(drop.st.connects === 1 && drop.st.messages === 1, "sunucu iletiyi TEK KEZ aldı (mükerrer doğrulama e-postası YOK)", drop.st);
    await drop.close();
  }

  console.log("── 8) Kota ve ret sınıflandırması (gerçek SMTP yanıtlarıyla) ──");
  {
    const cases: { name: string; o: Parameters<typeof startSmtp>[0]; code: string; retryable: boolean }[] = [
      { name: "550 saatlik sınır (cPanel/Exim biçimi)", o: { secure: true, tlsPair: C.srv, mailFrom: { code: 550, msg: "Your message to <x> was classified as SPAM. ... has exceeded the max emails per hour (250/250 (100%)) allowed" } }, code: "quota", retryable: false },
      { name: "451 oran sınırı", o: { secure: true, tlsPair: C.srv, rcpt: { code: 451, msg: "Ratelimit exceeded for sender, try again later" } }, code: "quota", retryable: false },
      { name: "550 alıcı yok", o: { secure: true, tlsPair: C.srv, rcpt: { code: 550, msg: "No such user here" } }, code: "rejected", retryable: false },
      { name: "554 ileti reddedildi (DATA)", o: { secure: true, tlsPair: C.srv, data: { code: 554, msg: "Message rejected" } }, code: "rejected", retryable: false },
      { name: "451 geçici yerel hata", o: { secure: true, tlsPair: C.srv, rcpt: { code: 451, msg: "Temporary local problem" } }, code: "provider_down", retryable: true },
    ];
    for (const c of cases) {
      const s = await startSmtp(c.o);
      const { r } = await sendWith(ENV("465"), hooksFor(s.port)); results.push(r);
      ok(!r.ok && r.code === c.code && r.retryable === c.retryable, `${c.name} → ${c.code}`, r);
      ok(s.box.connects === 1, `${c.name}: tek bağlantı (tekrar yok)`, s.box.connects);
      await s.close();
    }
    ok(classifySmtpError({ code: "EAUTH", responseCode: 535 }).code === "smtp_auth_failed", "sınıflandırma: EAUTH");
    ok(classifySmtpError({ code: "ESOCKET", cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID" } }).code === "smtp_tls_error", "sınıflandırma: TLS ad hatası (iç neden)");
    ok(classifySmtpError({ code: "ESOCKET", originalCode: "DEPTH_ZERO_SELF_SIGNED_CERT", command: "CONN" }).code === "smtp_tls_error", "sınıflandırma: nodemailer originalCode (kendinden imzalı)");
    ok(classifySmtpError({ code: "ESOCKET", originalCode: "ECONNRESET", command: "CONN" }).code === "network", "sınıflandırma: ESOCKET/ECONNRESET → network");
    ok(classifySmtpError({ responseCode: 530, response: "530 Must issue a STARTTLS command first" }).code === "smtp_tls_error", "sınıflandırma: 530 STARTTLS gerekli");
    ok(classifySmtpError(new Error("bilinmeyen")).code === "network", "sınıflandırma: bilinmeyen → network");
  }

  console.log("── 9) Başlık enjeksiyonu / geçersiz alıcı: bağlantı AÇILMADAN ret ──");
  {
    const s = await startSmtp({ secure: true, tlsPair: C.srv });
    const a = await sendWith(ENV("465"), hooksFor(s.port), { ...MSG, subject: "123456\r\nBcc: saldirgan@ornek.test" }); results.push(a.r);
    const b = await sendWith(ENV("465"), hooksFor(s.port), { ...MSG, to: "a@b.test\r\nRCPT TO:<x@y.test>" }); results.push(b.r);
    const c = await sendWith(ENV("465"), hooksFor(s.port), { ...MSG, to: "bozuk-adres" }); results.push(c.r);
    ok(!a.r.ok && a.r.code === "rejected" && !b.r.ok && b.r.code === "rejected" && !c.r.ok && c.r.code === "rejected", "CRLF konu / CRLF alıcı / bozuk adres → rejected");
    ok(s.box.connects === 0, "hiçbirinde sunucuya bağlanılmadı", s.box.connects);
    let threw = false; try { buildMimeMessage({ fromName: "a", fromAddress: "a@b.test", to: "c@d.test", subject: "s", text: "t", html: "h", messageId: "<x@y>\r\nBcc: z@z.test" }); } catch { threw = true; }
    ok(threw, "Message-ID'ye CRLF enjekte edilemez");
    await s.close();
  }

  console.log("── 10) Yapılandırma doğrulaması ve sağlayıcı seçimi (fail-closed) ──");
  {
    const base = ENV("465", { SMTP_HOST: "srvm06.trwww.com" });
    ok(createSmtpProvider(base)?.name === "smtp" && smtpConfigIssue(base) === null, "geçerli ayar (srvm06.trwww.com:465) → smtp sağlayıcısı");
    ok(createSmtpProvider({ ...base, SMTP_PORT: "587" })?.name === "smtp", "587 geçerli");
    const bad: [Record<string, string | undefined>, string][] = [
      [{ SMTP_HOST: "" }, "smtp_host_missing"],
      [{ SMTP_HOST: "127.0.0.1" }, "smtp_host_invalid"],
      [{ SMTP_HOST: "smtp://srvm06.trwww.com" }, "smtp_host_invalid"],
      [{ SMTP_HOST: "srvm06.trwww.com:465" }, "smtp_host_invalid"],
      [{ SMTP_HOST: "localhost" }, "smtp_host_invalid"],
      [{ SMTP_PORT: "25" }, "smtp_port_invalid"],
      [{ SMTP_PORT: "2525" }, "smtp_port_invalid"],
      [{ SMTP_PORT: "" }, "smtp_port_invalid"],
      [{ SMTP_PORT: "465abc" }, "smtp_port_invalid"],
      [{ SMTP_USER: "" }, "smtp_user_missing"],
      [{ SMTP_PASSWORD: "" }, "smtp_password_missing"],
      [{ SMTP_SENDER: "bozuk" }, "smtp_sender_invalid"],
      [{ SMTP_SENDER: "info@ornek-alan.test" }, "smtp_sender_mismatch"],
    ];
    for (const [over, code] of bad) {
      const env = { ...base, ...over };
      ok(createSmtpProvider(env) === null && smtpConfigIssue(env) === code, `${JSON.stringify(over)} → sağlayıcı YOK (${code})`, smtpConfigIssue(env));
      ok(getEmailProvider(env) === null && emailOtpConfigured({ ...env, AUTH_OTP_PEPPER: "p".repeat(40) }) === false, `${code}: e-posta yöntemi SUNULMAZ (MFA atlanmaz)`);
    }
    ok(createSmtpProvider({ ...base, SMTP_SENDER: "DOGRULAMA@ornek-alan.test" })?.name === "smtp", "gönderen = kullanıcı (büyük/küçük harf duyarsız)");
    ok(smtpConfigIssue({ EMAIL_PROVIDER: "gmail" }) === null, "smtp seçili değilse sorun kodu yok");
    ok(getEmailProvider({ ...base, EMAIL_PROVIDER: "SMTP" })?.name === "smtp", "EMAIL_PROVIDER büyük harf (mevcut davranış: küçük harfe çevrilir)");
    ok(getEmailProvider({ ...base, EMAIL_PROVIDER: "smtps" }) === null && getEmailProvider({ ...base, EMAIL_PROVIDER: undefined }) === null, "bilinmeyen / boş EMAIL_PROVIDER → sağlayıcı YOK (varsayılan disabled korunur)");
    const gm = { ...base, GMAIL_OAUTH_CLIENT_ID: "cid", GMAIL_OAUTH_CLIENT_SECRET: "s", GMAIL_OAUTH_REFRESH_TOKEN: "r", GMAIL_SENDER: "a@ornek.test" };
    ok(getEmailProvider({ ...gm, EMAIL_PROVIDER: "gmail" })?.name === "gmail", "geriye dönük: EMAIL_PROVIDER=gmail SMTP değişkenleri olsa da Gmail'i seçer");
    ok(getEmailProvider({ ...base, EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1" }) === null, "geriye dönük: sentetik production'da yine YOK");
    // Önbellek: parola değişince yeni sağlayıcı (eski kimlikle gönderim yok); parola anahtarda düz metin değil.
    const saved = { ...process.env };
    Object.assign(process.env, base); resetEmailProviderCache();
    const p1 = getEmailProvider(); const p1b = getEmailProvider();
    process.env.SMTP_PASSWORD = `${PASSWORD}-yeni`; const p2 = getEmailProvider();
    ok(!!p1 && p1 === p1b && p2 !== p1 && p2?.name === "smtp", "önbellek: aynı ayarda aynı nesne, parola değişince yeni nesne");
    process.env.SMTP_PORT = "25"; ok(getEmailProvider() === null, "önbellek: ayar bozulunca sağlayıcı hemen düşer");
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved); resetEmailProviderCache();
  }

  console.log("── 11) Günlük gönderim sınırı (Turhost saatlik 250 aşılamaz) ──");
  {
    const l = emailLimits({ EMAIL_PROVIDER: "smtp" });
    ok(l.dailyLimit === 200 && l.warnAt === 150 && l.dailyLimit <= 250, "smtp varsayılanı 200/gün (uyarı 150) → 24 saatin hiçbir saatinde 250 aşılamaz", l);
    ok(emailLimits({ EMAIL_PROVIDER: "smtp", EMAIL_DAILY_LIMIT: "500", EMAIL_WARN_AT: "400" }).dailyLimit === 500, "EMAIL_DAILY_LIMIT açıkça verilirse o kullanılır (Owner kararı)");
    const g = emailLimits({ EMAIL_PROVIDER: "gmail" });
    ok(g.dailyLimit === 1800 && g.warnAt === 1500, "geriye dönük: gmail varsayılanı 1800/1500 değişmedi", g);
    ok(emailLimits({}).dailyLimit === 1800, "geriye dönük: sağlayıcı seçili değilken 1800");
  }

  console.log("── 12) Gizli bilgi sızıntısı ──");
  {
    const p = createSmtpProvider(ENV("465"));
    const dump = JSON.stringify(p) + Object.keys(p ?? {}).join(",") + String(p?.send);
    ok(!dump.includes(PASSWORD), "sağlayıcı nesnesinde / serileştirmede parola YOK");
    ok(!JSON.stringify(results).includes(PASSWORD) && !JSON.stringify(results).includes("dogrulama@ornek-alan.test"), "hiçbir gönderim sonucunda parola / gönderen adresi YOK");
    ok(results.every((r) => Object.keys(r as object).every((k) => ["ok", "providerMessageId", "code", "retryable"].includes(k))), "sonuç yalnız { ok, providerMessageId | code, retryable } alanlarını taşır");
    const all = captured.join("\n");
    ok(!all.includes(PASSWORD), "süreç çıktısında (stdout/stderr/console) parola YOK", all.length);
    ok(!/AUTH PLAIN|AUTH LOGIN|\bU2Fo/.test(all), "SMTP oturum dökümü (AUTH satırı / base64 kimlik) çıktıya düşmedi");
  }

  console.log(`\nsmtp-provider check: ${pass} PASS / ${fail} FAIL`);
  fs.rmSync(C.dir, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { origConsole.error(e); process.exit(1); });
