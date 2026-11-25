/**
 * GİRİŞ GÜVENLİĞİ F3 (Görev F) — GERÇEK GÖNDERİM ÖNCESİ SMTP KABUL PROVASI. Tamamen sentetik: embedded PostgreSQL (en güncel F2
 * zinciri, 001300 dahil), sentetik Owner / uzman, yerel SAHTE SMTP sunucusu (TLS, test CA). Production / Turhost / gerçek hesap YOK.
 *
 * Production yolu aynen kullanılır: EMAIL_PROVIDER=smtp + SMTP_* ortam değişkenleri → getEmailProvider() → smtpProvider
 * (465 doğrudan TLS, sertifika + ad doğrulaması açık) + veritabanı saatlik kota kapısı (auth_rate_limit_hit). Yalnız AĞ katmanı
 * test sürecinde yönlendirilir: sahte ad (smtp.ornek-alan.test) 127.0.0.1'e çözülür, 465 bağlantısı sahte sunucunun portuna gider
 * ve test CA'sı güvenilir kabul edilir. Sertifika ADI doğrulaması yine SMTP_HOST'a göre yapılır (servername değişmez).
 *
 * Akış (Owner talimatı Görev F, 16 adım): giriş → e-posta doğrulama isteği → SMTP iletiyi kabul eder → kod yalnız Owner'a →
 * doğru kod → doğrulandı → MFA yönetiminde yöntem kullanılabilir → kitsiz zorunluluk REDDEDİLİR → sentetik kit → zorunluluk açılır
 * → MFA'sız oturum kapanır → parola tek başına yetmez → e-posta koduyla doğrulama → güvenli (HttpOnly) oturum → yanlış kod / süre
 * aşımı / servis kesintisi / kimlik hatası / TLS hatası reddedilir → uzmanın parola girişi aynen çalışır.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f3-smtp-kabul-provasi.harness.ts
 */
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import dns from "node:dns";
import tls from "node:tls";
import { NextRequest } from "next/server";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const out: string[] = [];
function log(s: string) { out.push(s); console.log(s); }
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; log(`  PASS ${label}`); }
  else { fail++; log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (t: string) => log(`\n${t}`);
type J = Record<string, unknown>;
const ORIGIN = "https://www.yasamsistemi.com";
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const SMTP_PASSWORD = "Sahte-Turhost-Parola-F3!kabul-9f2";
const PEPPER = "f3-kabul-pepper-".padEnd(48, "z");
const SENDER = "info@ornek-alan.test";

/** Sahte sunucunun aldığı iletinin text/plain (base64) gövdesinden 6 haneli kod. */
function codeFrom(raw: string): string {
  const m = raw.match(/Content-Type: text\/plain; charset="UTF-8"\r?\nContent-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+?)\r?\n--/);
  if (!m) return "";
  return Buffer.from(m[1].replace(/\s+/g, ""), "base64").toString("utf8").match(/\b([0-9]{6})\b/)?.[1] ?? "";
}

async function main() {
  const { HOST, makeCerts, startSmtp } = await import("./smtpTestServer");
  const C = makeCerts();

  // ── Ağ yönlendirmesi (yalnız bu test süreci): HOST → 127.0.0.1, 465 → aktif sahte sunucu portu, test CA güvenilir. ──
  let target: { port: number } | null = null;
  const d = dns as unknown as Record<string, (...a: unknown[]) => unknown>;
  const [r4, r6, lk] = [d.resolve4, d.resolve6, d.lookup];
  d.resolve4 = (host: unknown, ...a: unknown[]) => { const cb = a[a.length - 1] as (e: unknown, x?: unknown) => void; return host === HOST ? process.nextTick(() => cb(null, ["127.0.0.1"])) : r4.call(dns, host, ...a); };
  d.resolve6 = (host: unknown, ...a: unknown[]) => { const cb = a[a.length - 1] as (e: unknown, x?: unknown) => void; return host === HOST ? process.nextTick(() => cb(Object.assign(new Error("yok"), { code: "ENODATA" }))) : r6.call(dns, host, ...a); };
  d.lookup = (host: unknown, ...a: unknown[]) => { const cb = a[a.length - 1] as (e: unknown, ...x: unknown[]) => void; const all = typeof a[0] === "object" && (a[0] as { all?: boolean }).all;
    return host === HOST ? process.nextTick(() => (all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4))) : lk.call(dns, host, ...a); };
  const t = tls as unknown as { connect: (...a: unknown[]) => unknown };
  const tlsConnect = t.connect;
  const tlsSeen: { servername?: string; rejectUnauthorized?: boolean; minVersion?: string }[] = [];
  t.connect = (...a: unknown[]) => {
    const o = (a[0] && typeof a[0] === "object" ? a[0] : {}) as Record<string, unknown>;
    if (o.servername === HOST && Number(o.port) === 465) {
      tlsSeen.push({ servername: String(o.servername), rejectUnauthorized: o.rejectUnauthorized as boolean, minVersion: o.minVersion as string });
      if (!target) return tlsConnect.call(tls, { ...o, host: "127.0.0.1", port: 9 }, ...a.slice(1)); // sunucu kapalı → bağlantı reddi
      return tlsConnect.call(tls, { ...o, host: "127.0.0.1", port: target.port, ca: C.ca }, ...a.slice(1));
    }
    return tlsConnect.apply(tls, a);
  };

  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2n: true, ownerKit: false });
  const { admin } = db;
  try {
    // Saatlik kota fonksiyonu + tablosu: production migration 20270130000000'den AYNEN (smtp-saatlik-kota ile aynı yöntem).
    const mig = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20270130000000_admin_member_phase2.sql"), "utf8").replace(/\r\n/g, "\n");
    const a0 = mig.indexOf("CREATE TABLE IF NOT EXISTS public.auth_rate_limit_events");
    const f0 = mig.indexOf("CREATE OR REPLACE FUNCTION public.auth_rate_limit_hit(");
    const b0 = mig.indexOf("$$;", f0);
    if (a0 < 0 || f0 < 0 || b0 < 0) throw new Error("auth_rate_limit_hit tanımı bulunamadı");
    await admin.query(`${mig.slice(a0, b0 + 3)}\nREVOKE ALL ON FUNCTION public.auth_rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_rate_limit_hit(text, integer, integer) TO service_role;`);

    // Sabah planındaki İLK AŞAMA ayarlarının sentetik karşılığı (değerler sahte; kapsam yalnız Owner).
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f3-kabul", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "f3-kabul-rate", LOGIN_IP_PEPPER: "f3-kabul-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      EMAIL_PROVIDER: "smtp", SMTP_HOST: HOST, SMTP_PORT: "465", SMTP_USER: SENDER, SMTP_SENDER: SENDER, SMTP_SENDER_NAME: "Yaşam Sistemi",
      SMTP_PASSWORD, AUTH_OTP_PEPPER: PEPPER,
      AUTH_MFA_METHODS: "email_otp", AUTH_MFA_METHOD_SCOPE: "test_accounts", AUTH_MFA_EMAIL_ROLES: "owner",
    });
    delete process.env.AUTH_EMAIL_SELF_SERVICE_ROLES;
    delete process.env.SMTP_HOURLY_LIMIT;
    delete process.env.EMAIL_DAILY_LIMIT;

    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const recoveryVerify = await import("@/app/api/auth/mfa/recovery/verify/route");
    const meEmail = await import("@/app/api/me/email-verification/route");
    const profileRoute = await import("@/app/api/auth/profile/route");
    const mfaRoute = await import("@/app/api/admin/users/[id]/mfa/route");
    const emailStatus = await import("@/app/api/admin/email-status/route");
    const { resetEmailProviderCache } = await import("@/lib/email/provider");
    const { SMTP_HOURLY_BUCKET } = await import("@/lib/email/smtpQuota");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 40;
    type H = (r: NextRequest, c?: unknown) => Promise<Response>;
    const call = async (h: unknown, url: string, method: string, body: unknown, headers: Record<string, string> = {}, ctx?: unknown) => {
      const res = await (h as H)(new NextRequest(`${ORIGIN}${url}`, { method,
        headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${ip++ % 250}`, "user-agent": WEB_UA, origin: ORIGIN, "sec-fetch-site": "same-origin", ...headers },
        ...(method !== "GET" && body !== null ? { body: JSON.stringify(body) } : {}) }), ctx);
      const set = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      const text = await res.clone().text();
      return { status: res.status, json: (() => { try { return JSON.parse(text) as J; } catch { return {} as J; } })(), text, set };
    };
    const cookieVal = (set: string[], name: string) => (set.find((c) => c.startsWith(`${name}=`)) ?? "").split(";")[0].split("=").slice(1).join("=");
    const self = (id: string, sid: string) => ({ "x-user-id": id, cookie: `__Host-yasam_sid=${sid}` });
    const adm = (sid: string) => ({ "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sid}` });
    const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
    const login = async (email: string) => {
      const r = await call(sessionRoute.POST, "/api/auth/session", "POST", { email, password: pw(email) });
      return { ...r, bind: cookieVal(r.set, "__Host-yasam_mfa"), sid: cookieVal(r.set, "__Host-yasam_sid") };
    };
    const web = (bind: string) => ({ cookie: `__Host-yasam_mfa=${bind}` });
    const skipCooldown = (id: string) => q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [id]);
    const quotaRows = async () => Number((await q(`SELECT count(*)::int n FROM public.auth_rate_limit_events WHERE bucket = $1`, [SMTP_HOURLY_BUCKET])).rows[0].n);
    let smtp = await startSmtp({ secure: true, tlsPair: C.srv });
    target = { port: smtp.port };
    const swap = async (o: Parameters<typeof startSmtp>[0] | null) => {
      await smtp.close();
      if (!o) { target = null; return; }
      smtp = await startSmtp(o);
      target = { port: smtp.port };
    };
    resetEmailProviderCache();

    // Sabahki SQL konsolu adımının sentetik karşılığı: Owner kontrollü test hesabı listesinde (kapsam test_accounts).
    await q(`INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at) VALUES ($1, 'F3 ilk SMTP kabulü (sentetik)', $1, now(), now() + interval '30 days')`, [U.owner]);
    await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = ANY($1::uuid[])`, [[U.owner, U.exp]]);

    section("1) Owner parola ile giriş (bugünkü canlı durum: MFA yok)");
    const p0 = await login(EMAIL.owner);
    ok(p0.status === 200 && !!p0.sid && !("sessionToken" in p0.json), "Owner girişi 200, oturum yalnız HttpOnly çerezde", p0.status);
    const sid0 = p0.sid;

    section("2–6) E-posta doğrulama: istek → SMTP kabul → kod yalnız Owner'a → doğru kod → doğrulandı");
    {
      const g = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(U.owner, sid0));
      ok(g.json.available === true, "Ayarlar: Owner için e-posta doğrulama açık", g.json);
      const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(U.owner, sid0));
      const mail = smtp.box.mails[0];
      const code = codeFrom(mail?.raw ?? "");
      ok(s.status === 200 && smtp.box.mails.length === 1, "SMTP sunucusu iletiyi kabul etti (tek ileti)", { s: s.status, n: smtp.box.mails.length });
      ok(mail?.from === SENDER && mail?.to.join() === EMAIL.owner, "zarf: gönderen = SMTP kullanıcısı, alıcı YALNIZ Owner'ın kayıtlı adresi", { from: mail?.from, to: mail?.to });
      ok(smtp.box.auths.length === 1 && smtp.box.auths[0].secure === true && smtp.box.auths[0].user === SENDER, "kimlik bilgisi yalnız TLS kanalında gönderildi");
      ok(tlsSeen.length > 0 && tlsSeen.every((x) => x.servername === HOST && x.rejectUnauthorized === true && x.minVersion === "TLSv1.2"), "TLS: ad doğrulaması SMTP_HOST, sertifika doğrulaması açık, en az TLS 1.2", tlsSeen[0]);
      ok(/^[0-9]{6}$/.test(code) && !s.text.includes(code), "iletide 6 haneli kod var; API yanıtında YOK");
      const raw = mail?.raw ?? "";
      ok(/^Message-ID: <ys\.[^>]+@ornek-alan\.test>/mi.test(raw) && !/\r\nBcc:/i.test(raw) && raw.split(/\r?\n/).filter((l) => /^To:/i.test(l)).length === 1, "başlıklar: tek To, Bcc yok, Message-ID gönderen alan adında");
      const wrong = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code: code === "000000" ? "111111" : "000000" }, self(U.owner, sid0));
      ok(wrong.status === 400, "yanlış kod reddedildi", wrong.json);
      const c = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code }, self(U.owner, sid0));
      const v = (await q(`SELECT email_verified_at FROM public.users WHERE id = $1`, [U.owner])).rows[0].email_verified_at;
      ok(c.status === 200 && v !== null, "doğru kod → Owner e-postası doğrulandı", c.json);
      const dl = (await q(`SELECT provider, state, purpose FROM public.auth_email_deliveries WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [U.owner])).rows[0];
      ok(dl?.provider === "smtp" && dl?.state === "sent" && dl?.purpose === "verify_email", "teslim kaydı: provider=smtp, state=sent", dl);
      ok((await quotaRows()) === 1, "saatlik kota sayacı 1 (gönderim girişimi sayıldı)");
    }

    section("7–8) MFA yönetimi: yöntem kullanılabilir; kitsiz Owner zorunluluğu REDDEDİLİR");
    {
      const st = await call(mfaRoute.GET, `/api/admin/users/${U.owner}/mfa`, "GET", null, adm(sid0), ctxOf(U.owner));
      const s = (st.json.status ?? {}) as { methods?: { email_otp?: { usable?: boolean } }; ready?: boolean; ownerSelfRecoveryReady?: boolean };
      ok(st.status === 200 && s.methods?.email_otp?.usable === true && s.ready === true, "e-posta yöntemi kullanılabilir, hesap teknik olarak hazır", { st: st.status, m: s.methods?.email_otp, ready: s.ready });
      ok(s.ownerSelfRecoveryReady === false, "kurtarma kiti YOK olarak gösteriliyor", s.ownerSelfRecoveryReady);
      const en = await call(mfaRoute.POST, `/api/admin/users/${U.owner}/mfa`, "POST", { action: "enable", reason: "F3 sentetik kabul", confirm: true }, adm(sid0), ctxOf(U.owner));
      const req0 = (await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [U.owner])).rows[0].mfa_required;
      ok(en.status === 409 && en.json.code === "OWNER_RECOVERY_REQUIRED" && req0 === false, "kitsiz zorunluluk → 409 OWNER_RECOVERY_REQUIRED, değişiklik yok", { s: en.status, c: en.json.code });
      const dbTry = await q(`SELECT public.auth_mfa_set_required($1, $2, true, 'konsol denemesi') AS r`, [sid0, U.owner]).then(() => "geçti", (e: { code?: string }) => e.code ?? "hata");
      ok(dbTry === "YF401", "API atlanıp doğrudan DB çağrısı da reddedilir (YF401)", dbTry);
    }

    section("9–11) Sentetik kurtarma kiti → zorunluluk açılır → MFA'sız oturumlar kapanır");
    let kitCodes: string[] = [];
    let sidRec = "";
    {
      const kit = (await q(`SELECT * FROM public.auth_owner_offline_kit_issue() AS c`)).rows;
      kitCodes = kit.map((r: { c: string }) => r.c); // yalnız bellekte; loglanmaz / yazılmaz
      ok(kit.length > 0, `sentetik çevrimdışı kit üretildi (${kit.length} satır; değerler loglanmaz / saklanmaz)`);
      const p1 = await login(EMAIL.owner);
      const en = await call(mfaRoute.POST, `/api/admin/users/${U.owner}/mfa`, "POST", { action: "enable", reason: "F3 sentetik kabul", confirm: true }, adm(sid0), ctxOf(U.owner));
      ok(en.status === 200 && en.json.ok === true, "Owner kendi MFA zorunluluğunu açtı", en.json);
      const prof0 = await call(profileRoute.GET, "/api/auth/profile", "GET", null, self(U.owner, sid0));
      const prof1 = await call(profileRoute.GET, "/api/auth/profile", "GET", null, self(U.owner, p1.sid));
      const act = Number((await q(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [U.owner])).rows[0].n);
      ok(prof0.status === 401 && prof1.status === 401 && act === 0, "MFA'sız bütün Owner oturumları kapandı (aktör dahil)", { p0: prof0.status, p1: prof1.status, act });
    }

    section("12–14) Parola tek başına yetmez → e-posta kodu (SMTP) → güvenli oturum");
    let ch = "";
    let bind = "";
    let sidMfa = "";
    {
      const l = await login(EMAIL.owner);
      ch = String(l.json.challengeId ?? "");
      bind = l.bind;
      const methods = (l.json.methods ?? []) as string[];
      ok(l.status === 202 && !l.sid && methods.includes("email_otp") && methods.includes("recovery_code") && !methods.includes("qr_device"),
        "parola → 202 MFA gerekli, oturum YOK; yöntemler e-posta + kurtarma kodu", { s: l.status, methods });
      const before = smtp.box.mails.length;
      const s = await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: ch }, web(bind));
      const code = codeFrom(smtp.box.mails[before]?.raw ?? "");
      ok(s.status === 200 && smtp.box.mails.length === before + 1 && smtp.box.mails[before].to.join() === EMAIL.owner && /^[0-9]{6}$/.test(code), "giriş kodu SMTP ile yalnız Owner'a gitti", s.json);
      const noComplete = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, web(bind));
      ok(noComplete.status >= 400 && !cookieVal(noComplete.set, "__Host-yasam_sid"), "kod doğrulanmadan oturum TAMAMLANAMAZ", noComplete.status);
      const wrong = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: ch, code: code === "000000" ? "111111" : "000000" }, web(bind));
      ok(wrong.status >= 400, "yanlış kod reddedildi", wrong.status);
      const other = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: ch, code }, { cookie: "__Host-yasam_mfa=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
      ok(other.status >= 400, "doğru kod başka tarayıcı bağlamasıyla (çerez) kullanılamaz", other.status);
      // Başka bir giriş isteği (ikinci tarayıcı): bu isteğin kodu ilk isteğe bağlı değildir → ilk isteğin kodu burada geçmez.
      const other2 = await login(EMAIL.owner);
      const cross = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: other2.json.challengeId, code }, web(other2.bind));
      ok(cross.status >= 400, "bir giriş isteğinin kodu BAŞKA giriş isteğinde kabul edilmez (kapsam: challenge)", cross.status);
      // Aynı doğru kodla paralel iki doğrulama → yalnız biri başarılı.
      const [v, v2] = await Promise.all([
        call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: ch, code }, web(bind)),
        call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: ch, code }, web(bind)),
      ]);
      ok([v, v2].filter((x) => x.status === 200).length === 1, "aynı doğru kodla PARALEL iki doğrulama: yalnız BİRİ başarılı", { a: v.status, b: v2.status });
      const c = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, web(bind));
      const sid = cookieVal(c.set, "__Host-yasam_sid");
      sidMfa = sid;
      const cookieLine = c.set.find((x) => x.startsWith("__Host-yasam_sid=")) ?? "";
      ok(c.status === 200 && !!sid && !("sessionToken" in c.json), "doğru kod → oturum açıldı (gövdede anahtar YOK)", { c: c.status });
      ok(/HttpOnly/i.test(cookieLine) && /Secure/i.test(cookieLine) && /SameSite=strict/i.test(cookieLine) && /Path=\//i.test(cookieLine) && !/Domain=/i.test(cookieLine), "çerez: HttpOnly + Secure + SameSite=Strict + Path=/ + Domain yok");
      const m = (await q(`SELECT mfa_method FROM public.user_sessions WHERE session_token = $1`, [sid])).rows[0]?.mfa_method;
      ok(m === "email_otp", `oturumun MFA kanıtı: ${m}`);
      const reuse = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: ch, code }, web(bind));
      ok(reuse.status >= 400, "aynı kod ikinci kez kullanılamaz", reuse.status);
      const prof = await call(profileRoute.GET, "/api/auth/profile", "GET", null, self(U.owner, sid));
      ok(prof.status === 200, "yeni oturum geçerli", prof.status);
    }

    section("15) Süre aşımı, servis kesintisi, kimlik hatası, TLS hatası → MFA atlanmaz");
    {
      // Süre aşımı
      await skipCooldown(U.owner);
      const l = await login(EMAIL.owner);
      const before = smtp.box.mails.length;
      await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      const code = codeFrom(smtp.box.mails[before]?.raw ?? "");
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '4 minutes', expires_at = expires_at - interval '4 minutes' WHERE user_id = $1 AND state = 'active'`, [U.owner]);
      const v = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l.json.challengeId, code }, web(l.bind));
      const c = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      ok(v.status >= 400 && c.status >= 400 && !cookieVal(c.set, "__Host-yasam_sid"), "3 dakikası dolmuş kod reddedildi, oturum yok", { v: v.json, c: c.status });

      const scenario = async (name: string, o: Parameters<typeof startSmtp>[0] | null, expectAlert: string | null) => {
        await swap(o);
        await skipCooldown(U.owner);
        await q(`DELETE FROM public.admin_notifications WHERE event_key LIKE 'eposta_uyari:%'`);
        const authsBefore = smtp.box.auths.length;
        const l2 = await login(EMAIL.owner);
        const s = await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: l2.json.challengeId }, web(l2.bind));
        const v2 = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l2.json.challengeId, code: "123456" }, web(l2.bind));
        const c2 = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: l2.json.challengeId }, web(l2.bind));
        ok(l2.status === 202 && s.status >= 500 && v2.status >= 400 && c2.status >= 400 && !cookieVal(c2.set, "__Host-yasam_sid"),
          `${name}: gönderim başarısız → giriş TAMAMLANAMAZ (parola tek başına yetmez)`, { l: l2.status, s: s.status, v: v2.status, c: c2.status });
        const dl = (await q(`SELECT state, error_code FROM public.auth_email_deliveries WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [U.owner])).rows[0];
        const alert = (await q(`SELECT payload::text AS p, event_key FROM public.admin_notifications WHERE event_key LIKE 'eposta_uyari:%' ORDER BY id DESC LIMIT 1`)).rows[0];
        if (expectAlert) ok(dl?.state === "failed" && dl?.error_code === expectAlert && !!alert && String(alert.event_key).includes(expectAlert), `${name}: teslim kaydı ${expectAlert} + Owner bildirim zili uyarısı`, { dl, alert: alert?.event_key });
        else ok(dl?.state === "failed" && dl?.error_code === "network", `${name}: teslim kaydı network (otomatik tekrar YOK)`, dl);
        if (alert) ok(!String(alert.p).includes(SMTP_PASSWORD) && !String(alert.p).includes(EMAIL.owner) && !String(alert.p).includes(SENDER), `${name}: uyarı yükünde parola / adres YOK`);
        return { authsNew: smtp.box.auths.length - authsBefore };
      };
      await scenario("servis kapalı (bağlantı reddi)", null, null);
      await scenario("SMTP kimlik reddi (535)", { secure: true, tlsPair: C.srv, authFail: true }, "smtp_auth_failed");
      const tlsR = await scenario("sertifika adı/zinciri geçersiz", { secure: true, tlsPair: C.self }, "smtp_tls_error");
      ok(tlsR.authsNew === 0, "TLS hatasında kimlik bilgisi sunucuya HİÇ gönderilmedi", tlsR);
      await swap({ secure: true, tlsPair: C.srv });

      // Sağlayıcı tamamen kapatılırsa (EMAIL_PROVIDER silindi): e-posta yöntemi sunulmaz, kurtarma kodu kalır, parola yetmez.
      // Fikstür (zaman geçişi taklidi): önceki girişlerin oran sayaçları (SMTP kotası HARİÇ) ve bekleyen istekler temizlenir;
      // aksi hâlde hesap bazlı giriş sınırı (beklenen koruma) 429 verir.
      await q(`DELETE FROM public.auth_rate_limit_events WHERE bucket <> $1`, [SMTP_HOURLY_BUCKET]);
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [U.owner]);
      const saved = process.env.EMAIL_PROVIDER;
      delete process.env.EMAIL_PROVIDER;
      resetEmailProviderCache();
      const l3 = await login(EMAIL.owner);
      const m3 = (l3.json.methods ?? []) as string[];
      ok(l3.status === 202 && !l3.sid && !m3.includes("email_otp") && m3.includes("recovery_code"), "sağlayıcı kapalı: e-posta yöntemi yok, kurtarma kodu var, oturum YOK (fail-closed, kilitlenme yok)", { s: l3.status, m3 });
      process.env.EMAIL_PROVIDER = saved;
      resetEmailProviderCache();
    }

    section("Görev D) Çevrimdışı kit ile kurtarma: tek kullanım, paralel kullanım, sızıntı");
    {
      // Test fikstürü: önceki bölümlerdeki çok sayıdaki girişin oran sayaçları (SMTP kotası HARİÇ) ve bekleyen istekler temizlenir.
      await q(`DELETE FROM public.auth_rate_limit_events WHERE bucket <> $1`, [SMTP_HOURLY_BUCKET]);
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [U.owner]);
      const before = Number((await q(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1 AND kind = 'owner_offline' AND state = 'active'`, [U.owner])).rows[0].n);
      const bad = await login(EMAIL.owner);
      const w = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: bad.json.challengeId, code: "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-2222" }, web(bad.bind));
      ok(w.status === 401 && w.json.code === "RECOVERY_WRONG", "geçersiz kit kodu reddedildi", w.json.code);
      const A = await login(EMAIL.owner);
      const B = await login(EMAIL.owner);
      const code = kitCodes[0] ?? "";
      const [ra, rb] = await Promise.all([
        call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: A.json.challengeId, code }, web(A.bind)),
        call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: B.json.challengeId, code: code.toLowerCase().replace(/-/g, " ") }, web(B.bind)),
      ]);
      const wins = [ra, rb].filter((r) => r.status === 200);
      ok(wins.length === 1 && wins[0].json.kind === "owner_offline", "AYNI kit kodu iki paralel girişte: yalnız BİRİ geçer", { a: ra.status, b: rb.status });
      ok(!ra.text.includes(code) && !rb.text.includes(code), "yanıtlarda kit kodu YOK");
      const winner = ra.status === 200 ? A : B;
      const c = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: winner.json.challengeId }, web(winner.bind));
      const sidR = cookieVal(c.set, "__Host-yasam_sid");
      const m = (await q(`SELECT mfa_method FROM public.user_sessions WHERE session_token = $1`, [sidR])).rows[0]?.mfa_method;
      ok(c.status === 200 && !!sidR && m === "recovery_code", "kit koduyla oturum açıldı (mfa_method=recovery_code)", { c: c.status, m });
      sidRec = sidR;
      const oldS = await call(profileRoute.GET, "/api/auth/profile", "GET", null, self(U.owner, sidMfa));
      ok(oldS.status === 401, "kit ile kurtarma, Owner'ın önceki (kayıp cihaz olabilecek) oturumlarını kapattı", oldS.status);
      const after = Number((await q(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1 AND kind = 'owner_offline' AND state = 'active'`, [U.owner])).rows[0].n);
      ok(after === before - 1, `kullanılan kod tüketildi (aktif kit kodu ${before} → ${after})`);
      const C2 = await login(EMAIL.owner);
      const again = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: C2.json.challengeId, code }, web(C2.bind));
      ok(again.status === 401, "kullanılmış kit kodu yeniden kabul EDİLMEZ", again.json.code);
      const codesDump = (await q(`SELECT coalesce(string_agg(t::text, '|'), '') AS d FROM public.auth_recovery_codes t`)).rows[0].d as string;
      const evDump = (await q(`SELECT (SELECT coalesce(string_agg(t::text, '|'), '') FROM public.auth_recovery_events t) || (SELECT coalesce(string_agg(t::text, '|'), '') FROM public.security_events t) AS d`)).rows[0].d as string;
      const plain = kitCodes.map((k) => k.replace(/-/g, ""));
      ok(plain.every((k) => !codesDump.includes(k) && !evDump.includes(k)), "DB'de düz kit kodu YOK (yalnız SHA-256 özeti; olay kayıtlarında da yok)");
      const last = await q(`SELECT public.auth_mfa_set_required($1, $2, false, 'kendi kaldırma denemesi') AS r`, [sidR, U.owner]).then((r) => (r.rows[0].r as J).code ?? "ok", (e: { code?: string }) => e.code ?? "hata");
      ok(last !== "ok", "Owner kendi MFA zorunluluğunu kaldıramaz (DB)", last);
    }

    section("16) Uzmanın mevcut parola girişi ve e-posta durumu korunur");
    {
      const before = smtp.box.mails.length;
      const e = await login(EMAIL.exp);
      ok(e.status === 200 && !!e.sid, "uzman parola ile giriş 200 (MFA istenmez)", e.status);
      const g = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(U.exp, e.sid));
      const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(U.exp, e.sid));
      ok(g.json.available === false && s.status === 403 && smtp.box.mails.length === before, "uzmana e-posta işlemi kapalı, ileti GİTMEDİ", { g: g.json, s: s.status });
      const u = (await q(`SELECT email, mfa_required, email_verified_at FROM public.users WHERE id = $1`, [U.exp])).rows[0];
      ok(u.email === EMAIL.exp && u.mfa_required === false && u.email_verified_at === null, "uzman hesap kaydı değişmedi", u);
    }

    section("Durum ekranı + kota + sızıntı denetimi");
    {
      // Görev D'de kit koduyla açılan Owner oturumu (kit kurtarması önceki oturumları kapatır — beklenen davranış).
      const st = await call(emailStatus.GET, "/api/admin/email-status", "GET", null, adm(sidRec));
      ok(st.status === 200 && st.json.provider === "smtp" && st.json.configured === true && st.json.configIssue === null && st.json.hourlyLimit === 50,
        "Owner e-posta durumu: SMTP hazır, sorun yok, saatlik tavan 50", { s: st.status, p: st.json.provider, i: st.json.configIssue, h: st.json.hourlyLimit });
      ok(!st.text.includes(SMTP_PASSWORD) && !st.text.includes(PEPPER) && !st.text.includes(SENDER), "durum yanıtında parola / pepper / gönderen adresi YOK");
      const attempts = Number((await q(`SELECT count(*)::int n FROM public.auth_email_deliveries`)).rows[0].n);
      ok((await quotaRows()) === attempts, `saatlik kota sayacı = SMTP gönderim girişimi sayısı (${attempts}; başarısızlar da sayılır)`);
      const dump = (await q(`SELECT (SELECT coalesce(string_agg(t::text, '|'), '') FROM public.auth_email_deliveries t) || (SELECT coalesce(string_agg(t::text, '|'), '') FROM public.security_events t) || (SELECT coalesce(string_agg(t::text, '|'), '') FROM public.admin_notifications t) AS d`)).rows[0].d as string;
      const codes = smtp.box.mails.map((m) => codeFrom(m.raw)).filter(Boolean);
      ok(!dump.includes(SMTP_PASSWORD) && !dump.includes(EMAIL.owner) && codes.every((k) => !dump.includes(k)), "DB denetim tablolarında parola / alıcı adresi / düz kod YOK");
      ok(!out.join("\n").includes(SMTP_PASSWORD), "test çıktısında SMTP parolası YOK");
    }
    await smtp.close();
  } finally {
    t.connect = tlsConnect;
    d.resolve4 = r4; d.resolve6 = r6; d.lookup = lk;
    await db.close();
  }
  console.log(`\nf3-smtp-kabul-provasi: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("f3-smtp-kabul-provasi HATA:", e instanceof Error ? e.message : e);
  console.log(`\nf3-smtp-kabul-provasi: ${pass} PASS / ${fail + 1} FAIL`);
  process.exit(1);
});
