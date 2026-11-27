/**
 * OWNER MFA — YALNIZ E-POSTA (telefonsuz) ETKİNLEŞTİRME VE KURTARMA PROVASI — SENTETİK Owner, gerçek route'lar + gerçek
 * PostgreSQL (F2-A…F2-K tam zincir). Production'a SIFIR temas. owner-mfa-prova.harness.ts telefonu önce ekler; bu prova
 * telefonu OLMAYAN Owner'ın e-posta + uygulama kurtarma kodu + kâğıt kit yollarını ve her şey kaybolduğunda kurtarmayı
 * kanıtlar. "SQL konsolu" adımları canlıda Owner'ın Supabase SQL konsolundan yapacağı çağrıların AYNISIDIR (yalnız sentetik DB).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/owner-mfa-eposta.harness.ts
 */
import Module from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (t: string) => console.log(`\n${t}`);
type J = Record<string, unknown>;
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const ORIGIN = "https://www.yasamsistemi.com";

async function main() {
  const { startF2cDb, U, EMAIL, pw, newPhone, signWith } = await import("./testDb");
  type Phone = ReturnType<typeof newPhone>;
  const db = await startF2cDb({ withF2k: true });
  const { admin } = db;
  const sink = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "owner-mfa-")), "eposta.jsonl");
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "owner-mfa-prova", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "owner-mfa-rate", LOGIN_IP_PEPPER: "owner-mfa-ip",
      REQUIRE_DB_SUPER_ADMIN_MARKER: "true", AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all",
      AUTH_MFA_EMAIL_ROLES: "expert,owner", EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: sink,
      AUTH_OTP_PEPPER: "owner-mfa-prova-pepper-0123456789abcdefghij",
    });
    const sig = await import("@/lib/auth/deviceSignature");
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const recoveryVerify = await import("@/app/api/auth/mfa/recovery/verify/route");
    const qrFetchRoute = await import("@/app/api/auth/mfa/qr/fetch/route");
    const qrDecideRoute = await import("@/app/api/auth/mfa/qr/decide/route");
    const enrollRoute = await import("@/app/api/devices/enroll/route");
    const devStatusRoute = await import("@/app/api/devices/status/route");
    const activateRoute = await import("@/app/api/devices/activate/route");
    const meEmail = await import("@/app/api/me/email-verification/route");
    const meRecovery = await import("@/app/api/me/account-recovery/route");
    const profileRoute = await import("@/app/api/auth/profile/route");
    const adminDevice = await import("@/app/api/admin/devices/[id]/route");
    const stepUp = await import("@/app/api/admin/step-up/route");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 20;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- route handler imzaları farklı
    type H = (r: NextRequest, c?: any) => Promise<Response>;
    const call = async (h: unknown, url: string, method: string, body: unknown, headers: Record<string, string> = {}, ctx?: unknown) => {
      const res = await (h as H)(new NextRequest(`${ORIGIN}${url}`, { method,
        headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${ip++ % 250}`, "user-agent": WEB_UA, origin: ORIGIN, "sec-fetch-site": "same-origin", ...headers },
        ...(method !== "GET" && body !== null ? { body: JSON.stringify(body) } : {}) }), ctx);
      const set = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      return { status: res.status, json: (await res.clone().json().catch(() => ({}))) as J, set };
    };
    const cookieVal = (set: string[], name: string) => (set.find((c) => c.startsWith(`${name}=`)) ?? "").split(";")[0].split("=").slice(1).join("=");
    const self = (id: string, sid: string) => ({ "x-user-id": id, cookie: `__Host-yasam_sid=${sid}` });
    const adm = (sid: string) => ({ "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sid}` });
    const mails = () => { try { return fs.readFileSync(sink, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; subject: string; text?: string }); } catch { return []; } };
    const lastCode = (to: string) => { const m = mails().filter((x) => x.to.toLowerCase() === to.toLowerCase()); return /\b([0-9]{6})\b/.exec(m[m.length - 1]?.text ?? "")?.[1] ?? ""; };
    const nowTs = () => Math.floor(Date.now() / 1000);
    const login = async (email: string) => {
      const r = await call(sessionRoute.POST, "/api/auth/session", "POST", { email, password: pw(email) });
      return { ...r, bind: cookieVal(r.set, "__Host-yasam_mfa"), sid: cookieVal(r.set, "__Host-yasam_sid") };
    };
    const complete = async (ch: string, bind: string) => {
      const r = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: ch }, { cookie: `__Host-yasam_mfa=${bind}` });
      return { ...r, sid: cookieVal(r.set, "__Host-yasam_sid") };
    };
    const emailLogin = async (email: string, codeOverride?: string) => {
      const l = await login(email);
      const ch = String(l.json.challengeId ?? "");
      const before = mails().length;
      const s = await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: ch }, { cookie: `__Host-yasam_mfa=${l.bind}` });
      const code = mails().length > before ? lastCode(email) : "";
      const v = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: ch, code: codeOverride ?? code }, { cookie: `__Host-yasam_mfa=${l.bind}` });
      return { l, ch, s, v, code };
    };
    const profile = (id: string, sid: string) => call(profileRoute.GET, "/api/auth/profile", "GET", null, self(id, sid));
    const enroll = (p: Phone, email: string, extra: J = {}) => {
      const ts = nowTs();
      const code = sig.displayCodeForSpki(Buffer.from(p.spki, "base64"));
      return call(enrollRoute.POST, "/api/devices/enroll", "POST", { email, password: pw(email), publicKey: p.spki, model: "Pixel 8", androidApi: 34,
        appVersion: "2.0.0", ts, signature: signWith(p, sig.enrollMessage(email.toLowerCase(), code, ts)), ...extra });
    };
    const activate = async (p: Phone) => {
      const st = await call(devStatusRoute.GET, `/api/devices/status?deviceId=${p.deviceId}`, "GET", null);
      const nonce = String(st.json.activationNonce ?? "");
      const ts = nowTs();
      return call(activateRoute.POST, "/api/devices/activate", "POST", { deviceId: p.deviceId, nonce, ts, signature: signWith(p, sig.activateMessage(p.deviceId!, nonce, ts)) });
    };
    const qrApprove = async (p: Phone, l: { json: J }) => {
      const qr = (l.json.qr ?? {}) as J;
      const frag = new URLSearchParams(String(qr.url ?? "").split("#")[1] ?? "");
      const ch = String(l.json.challengeId ?? ""); const n = frag.get("n") ?? ""; const code = String(qr.matchCode ?? "");
      const t1 = nowTs();
      const f = await call(qrFetchRoute.POST, "/api/auth/mfa/qr/fetch", "POST", { challengeId: ch, qrNonce: n, deviceId: p.deviceId, ts: t1, signature: signWith(p, sig.qrFetchMessage(ch, n, p.deviceId!, t1)) });
      const t2 = nowTs();
      const d = await call(qrDecideRoute.POST, "/api/auth/mfa/qr/decide", "POST", { challengeId: ch, qrNonce: n, deviceId: p.deviceId, decision: "approve", matchCode: code, ts: t2,
        signature: signWith(p, sig.qrDecideMessage(ch, n, p.deviceId!, "approve", code, t2)) });
      return { f, d, ch, hasQr: !!qr.url };
    };
    const activeSessions = async (id: string) => Number((await q(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [id])).rows[0].n);
    await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = $1`, [U.owner]).catch(() => {});
    await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE user_id = $1 AND is_active`, [U.owner]);

    section("0) Hazırlık: telefonu OLMAYAN Owner, e-posta doğrulanır; MFA açılmadan kurtarma kodu ÜRETİLEMEZ");
    const p0 = await login(EMAIL.owner);
    const sid0 = p0.sid;
    ok(p0.status === 200 && sid0 !== "", "Owner parola ile giriş (bugünkü canlı durum)");
    ok(Number((await q(`SELECT count(*)::int n FROM public.auth_trusted_devices WHERE user_id = $1 AND state = 'active'`, [U.owner])).rows[0].n) === 0, "Owner'ın aktif telefonu YOK");
    {
      await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(U.owner, sid0));
      const c = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code: lastCode(EMAIL.owner) }, self(U.owner, sid0));
      ok(c.status === 200, "e-posta doğrulandı (Ayarlar › doğrulama kodu)", c.json);
      const g = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "generate", password: pw(EMAIL.owner) }, self(U.owner, sid0));
      ok(g.status === 403 && g.json.code === "MFA_SESSION_REQUIRED", `MFA'sız oturumda kurtarma kodu ÜRETİLEMEZ (${String(g.json.code)}) → kodlar MFA açıldıktan SONRA üretilir`, g.json);
    }

    section("1) Kâğıt kurtarma kiti (SQL konsolu) — MFA açılmadan ÖNCE; uygulamanın kurtarma kodlarından AYRI");
    const kit = (await q(`SELECT k FROM public.auth_owner_offline_kit_issue() k`)).rows.map((r) => String((r as J).k));
    ok(kit.length === 5, `kit: ${kit.length} kod (değerler loglanmaz)`);

    section("2) MFA zorunluluğu (SQL konsolu, Owner oturum anahtarıyla) — yalnız e-posta yöntemiyle");
    {
      const r = (await q(`SELECT public.auth_mfa_set_required($1, $2, true, 'yalnız e-posta provası') AS r`, [sid0, U.owner])).rows[0].r as J;
      ok(r.ok === true, "doğrulanmış e-posta yeterli: MFA açıldı (telefon şart değil)", r);
      ok((await profile(U.owner, sid0)).status === 401 && await activeSessions(U.owner) === 0, "MFA'sız bütün Owner oturumları kapandı (yeniden giriş gerekir)");
      const l = await login(EMAIL.owner);
      const m = (l.json.methods ?? []) as string[];
      ok(l.status === 202 && !m.includes("qr_device") && m.includes("email_otp") && m.includes("recovery_code"), `girişte sunulan yöntemler: ${m.join(",")} (QR yok; kit sayesinde kurtarma kodu var)`);
    }
    const clearOpen = () => q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [U.owner]);

    section("3) E-posta koduyla giriş → (telefon yokken) e-posta oturumunda 10 kurtarma kodu üretilir");
    let sidE = "";
    let codes: string[] = [];
    {
      await clearOpen();
      const g = await emailLogin(EMAIL.owner);
      const c = await complete(g.ch, g.l.bind);
      sidE = c.sid;
      ok(c.status === 200 && sidE !== "", "e-posta koduyla oturum", { v: g.v.status, c: c.status });
      const noPw = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "generate" }, self(U.owner, sidE));
      ok(noPw.status >= 400, "parolasız üretim reddedilir", noPw.status);
      const gen = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "generate", password: pw(EMAIL.owner) }, self(U.owner, sidE));
      codes = (gen.json.codes ?? []) as string[];
      ok(gen.status === 200 && codes.length === 10, `telefon YOKKEN e-posta oturumunda kurtarma kodları üretildi (${codes.length}; kilitlenme yok)`, { s: gen.status, code: gen.json.code });
    }

    section("4) Owner kritik işlem doğrulaması (step-up) — yalnız e-posta Owner'da çalışır; kurtarma kodu kanıt sayılmaz");
    {
      const expPhone = newPhone();
      const e = await enroll(expPhone, EMAIL.exp);
      const devId = String(e.json.deviceId ?? "");
      const body = { action: "approve", fingerprintConfirmed: true, verificationMethod: "telefon" };
      const b = await call(stepUp.POST, "/api/admin/step-up", "POST", { op: "begin", action: "device_approve", targetId: devId }, adm(sidE));
      const ch = String(b.json.challengeId ?? "");
      console.log(`  bilgi: step-up başlangıç yanıtı anahtarları: ${Object.keys(b.json).join(",")}`);
      ok(b.status === 200 && ch !== "", "step-up başladı", b.json);
      await call(stepUp.POST, "/api/admin/step-up", "POST", { op: "email_send", challengeId: ch }, adm(sidE));
      const v = await call(stepUp.POST, "/api/admin/step-up", "POST", { op: "email_verify", challengeId: ch, code: lastCode(EMAIL.owner) }, adm(sidE));
      const yes = await call(adminDevice.POST, `/api/admin/devices/${devId}`, "POST", body, adm(sidE), { params: Promise.resolve({ id: devId }) });
      ok(v.status === 200 && yes.status === 200, "e-posta kodlu step-up → kritik işlem başarılı", { v: v.status, yes: yes.status });
      const rc = await call(stepUp.POST, "/api/admin/step-up", "POST", { op: "begin", action: "device_approve", targetId: devId }, adm(sidE));
      const rcv = await call(stepUp.POST, "/api/admin/step-up", "POST", { op: "recovery_verify", challengeId: String(rc.json.challengeId ?? ""), code: codes[9] }, adm(sidE));
      ok(rcv.status !== 200, "kurtarma kodu step-up kanıtı olarak KABUL EDİLMEZ", rcv.status);
    }

    section("5) E-POSTA KAYBI: uygulamanın kurtarma koduyla giriş; tek kullanımlık; diğer oturumlar KAPANMAZ (uygulama kodu)");
    let sidR = "";
    {
      await clearOpen();
      const l = await login(EMAIL.owner);
      const r = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: l.json.challengeId, code: codes[0] }, { cookie: `__Host-yasam_mfa=${l.bind}` });
      const c = await complete(String(l.json.challengeId), l.bind);
      sidR = c.sid;
      ok(r.status === 200 && c.status === 200 && sidR !== "", "kurtarma koduyla giriş (e-postaya erişim yok)", { r: r.status, c: c.status });
      ok((await profile(U.owner, sidE)).status === 200, "uygulama kurtarma kodu diğer Owner oturumunu kapatmaz");
      await clearOpen();
      const l2 = await login(EMAIL.owner);
      const r2 = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: l2.json.challengeId, code: codes[0] }, { cookie: `__Host-yasam_mfa=${l2.bind}` });
      ok(r2.status >= 400, "aynı kurtarma kodu ikinci kez REDDEDİLİR", r2.status);
      const bs = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "owner_bootstrap", password: pw(EMAIL.owner) }, self(U.owner, sidR));
      ok(bs.status === 403, `uygulama kurtarma koduyla açılan oturum yeni telefon eşleştirme kodu ÜRETEMEZ — yalnız kâğıt kit (${String(bs.json.code)})`, bs.json);
      const regen = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "generate", password: pw(EMAIL.owner) }, self(U.owner, sidR));
      const newCodes = (regen.json.codes ?? []) as string[];
      ok(regen.status === 200 && newCodes.length === 10, "kurtarma oturumunda yeni 10 kod üretildi (kodlar kaybolduysa yenilenir)", regen.status);
      await clearOpen();
      const l3 = await login(EMAIL.owner);
      const old = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: l3.json.challengeId, code: codes[1] }, { cookie: `__Host-yasam_mfa=${l3.bind}` });
      ok(old.status >= 400, "yenilemeden sonra ESKİ kodlar geçersiz", old.status);
      codes = newCodes;
    }

    section("6) HER ŞEY KAYIP (telefon yok + e-posta yok + uygulama kodları yok): kâğıt kitle giriş → yeni telefon → QR");
    {
      await clearOpen();
      const before = await activeSessions(U.owner);
      const l = await login(EMAIL.owner);
      const r = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: l.json.challengeId, code: kit[0] }, { cookie: `__Host-yasam_mfa=${l.bind}` });
      const c = await complete(String(l.json.challengeId), l.bind);
      ok(r.status === 200 && c.status === 200 && c.sid !== "", "kâğıt kit koduyla giriş", { r: r.status, c: c.status });
      const after = await activeSessions(U.owner);
      ok(before >= 1 && after === 1 && (await profile(U.owner, sidE)).status === 401, `kit kullanımı diğer bütün Owner oturumlarını kapattı (${before} → ${after})`);
      const noPw = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "owner_bootstrap" }, self(U.owner, c.sid));
      ok(noPw.status >= 400, "eşleştirme kodu parolasız üretilemez", noPw.status);
      const bs = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "owner_bootstrap", password: pw(EMAIL.owner) }, self(U.owner, c.sid));
      const pair = String(bs.json.code ?? "");
      ok(bs.status === 200 && pair.replace(/-/g, "").length >= 20, "kit oturumunda yeni telefon eşleştirme kodu üretildi (15 dk; değer loglanmaz)", { s: bs.status });
      const again = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "owner_bootstrap", password: pw(EMAIL.owner) }, self(U.owner, c.sid));
      ok(again.status === 403, "oturum başına TEK eşleştirme kodu", again.json.code);
      const phone = newPhone();
      const e = await enroll(phone, EMAIL.owner, { bootstrapCode: pair });
      phone.deviceId = String(e.json.deviceId ?? "");
      const a = e.status === 200 ? await activate(phone) : { status: 0, json: {} as J };
      ok(e.status === 200 && a.status === 200 && a.json.state === "active", "yeni telefon eşleşti ve KENDİ imzasıyla etkinleşti", { e: e.json, a: a.json });
      await clearOpen();
      const lq = await login(EMAIL.owner);
      const qa = await qrApprove(phone, lq);
      const cq = await complete(qa.ch, lq.bind);
      ok(qa.hasQr && qa.d.status === 200 && cq.status === 200, "yeni telefonla QR girişi çalışıyor (hesap kurtarıldı)", { d: qa.d.status, c: cq.status });
      {
        // E-posta gönderilemezse (Gmail kesintisi): MFA atlanmaz, AYNI giriş isteği QR ile tamamlanabilir.
        await clearOpen();
        process.env.EMAIL_SYNTHETIC_FAIL = "provider_down";
        const lf = await login(EMAIL.owner);
        const sf = await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: lf.json.challengeId }, { cookie: `__Host-yasam_mfa=${lf.bind}` });
        delete process.env.EMAIL_SYNTHETIC_FAIL;
        const early = await complete(String(lf.json.challengeId), lf.bind);
        ok(sf.status === 503 && early.status !== 200 && early.sid === "", `e-posta gönderilemedi (${sf.status}) → oturum AÇILMADI (MFA atlanmadı)`, { s: sf.status, c: early.status });
        const qf = await qrApprove(phone, lf);
        const cf = await complete(qf.ch, lf.bind);
        const mf = cf.sid ? (await q(`SELECT mfa_method FROM public.user_sessions WHERE session_token = $1`, [cf.sid])).rows[0]?.mfa_method : null;
        ok(qf.d.status === 200 && cf.status === 200 && cf.sid !== "" && mf === "qr_device", `aynı giriş isteği QR ile tamamlandı (yedek yöntem; ${String(mf)})`, { d: qf.d.status, c: cf.status });
      }
      await clearOpen();
      const l2 = await login(EMAIL.owner);
      const reuse = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: l2.json.challengeId, code: kit[0] }, { cookie: `__Host-yasam_mfa=${l2.bind}` });
      ok(reuse.status >= 400, "aynı kit kodu ikinci kez REDDEDİLİR (kalan kit kodları ayrı ayrı geçerli)", reuse.status);
      await clearOpen();
      const eSess = await emailLogin(EMAIL.owner);
      const ce = await complete(eSess.ch, eSess.l.bind);
      const g = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "generate", password: pw(EMAIL.owner) }, self(U.owner, ce.sid));
      ok(g.status === 403 && g.json.code === "STRONG_MFA_REQUIRED", "telefon eklendikten sonra e-posta oturumu kod üretemez → kodlar QR / kurtarma oturumunda yenilenir", g.json.code);
      sidR = cq.sid;
    }

    section("7) Kilitlenme analizi (ortam ayarları): yöntem listesi daralırsa ne kalır?");
    {
      await clearOpen();
      await q(`UPDATE public.auth_trusted_devices SET state = 'revoked' WHERE user_id = $1`, [U.owner]).catch(() => undefined);
      const saved = { roles: process.env.AUTH_MFA_EMAIL_ROLES, methods: process.env.AUTH_MFA_METHODS, scope: process.env.AUTH_MFA_METHOD_SCOPE };
      process.env.AUTH_MFA_EMAIL_ROLES = "expert";
      const l1 = await login(EMAIL.owner);
      const m1 = (l1.json.methods ?? []) as string[];
      ok(!m1.includes("email_otp") && m1.includes("recovery_code"), `AUTH_MFA_EMAIL_ROLES Owner'ı kapsamazsa e-posta sunulmaz; kurtarma kodu / kit KALIR (${m1.join(",") || "yok"})`);
      await clearOpen();
      process.env.AUTH_MFA_METHOD_SCOPE = "test_accounts";
      const l2 = await login(EMAIL.owner);
      const m2 = (l2.json.methods ?? []) as string[];
      const rv = l2.json.challengeId ? await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: l2.json.challengeId, code: kit[1] }, { cookie: `__Host-yasam_mfa=${l2.bind}` }) : { status: 0, json: {} as J };
      console.log(`  bilgi: AUTH_MFA_METHOD_SCOPE=test_accounts → Owner yöntemleri [${m2.join(",") || "YOK"}] (giriş ${l2.status} ${String(l2.json.code ?? "")}); kit koduyla doğrulama → ${rv.status}`);
      Object.assign(process.env, { AUTH_MFA_EMAIL_ROLES: saved.roles, AUTH_MFA_METHODS: saved.methods, AUTH_MFA_METHOD_SCOPE: saved.scope });
      const sk = await q(`SELECT public.auth_mfa_set_required($1, $2, false, 'kendi MFA kapatma denemesi') AS r`, [sidR, U.owner]).then((x) => x.rows[0].r as J).catch((e) => ({ err: (e as Error).message }) as J);
      ok(sk.ok !== true, "Owner kendi MFA'sını KAPATAMAZ", sk);
    }
  } finally {
    await db.close();
  }
  console.log(`\nowner-mfa-eposta: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
