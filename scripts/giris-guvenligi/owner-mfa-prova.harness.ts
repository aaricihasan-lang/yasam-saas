/**
 * OWNER / ADMIN MFA ETKİNLEŞTİRME PROVASI — SENTETİK Owner, gerçek route'lar + gerçek PostgreSQL (F2-A…F2-K tam zincir).
 * Production'a SIFIR temas. "SQL konsolu" adımları (ilk cihaz kodu, çevrimdışı kit, MFA zorunluluğu) canlıda Owner'ın
 * Supabase SQL konsolundan yapacağı çağrıların AYNISIDIR (yalnız sentetik veritabanında).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/owner-mfa-prova.harness.ts
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

    section("0) Başlangıç: Owner MFA'sız; yöntem yokken MFA açılamaz (kilitlenme koruması)");
    const p0 = await login(EMAIL.owner);
    const sid0 = p0.sid;
    ok(p0.status === 200 && sid0 !== "", "Owner parola ile giriş (bugünkü canlı durum)");
    const noMethod = (await q(`SELECT public.auth_mfa_set_required($1, $2, true, 'prova') AS r`, [sid0, U.owner])).rows[0].r as J;
    ok(noMethod.ok === false && noMethod.code === "no_method", "yöntem (doğrulanmış e-posta / aktif cihaz) yokken MFA zorunluluğu REDDEDİLİR", noMethod);

    section("1) E-posta doğrulama (Ayarlar › doğrulama kodu)");
    {
      const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(U.owner, sid0));
      ok(s.status === 200, "doğrulama kodu gönderildi (sentetik sağlayıcı)", s.json);
      const code = lastCode(EMAIL.owner);
      const wrong = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code: code === "000000" ? "111111" : "000000" }, self(U.owner, sid0));
      ok(wrong.status >= 400, "yanlış kod reddedilir", wrong.status);
      const c = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code }, self(U.owner, sid0));
      const v = (await q(`SELECT email_verified_at FROM public.users WHERE id = $1`, [U.owner])).rows[0].email_verified_at;
      ok(c.status === 200 && v != null, "doğru kod → e-posta doğrulandı", c.json);
    }

    section("2) İlk güvenilir Android cihazı — SQL konsolu kodu (Owner kendi cihazını panelden onaylayamaz)");
    const phone = newPhone();
    {
      const boot = String((await q(`SELECT public.auth_owner_bootstrap_issue() AS c`)).rows[0].c);
      const bad = await enroll(phone, EMAIL.owner, { bootstrapCode: "AAAAAAAAAAAAAAAAAAAA" });
      ok(bad.status === 400, "yanlış ilk cihaz kodu reddedilir", bad.json);
      const e = await enroll(phone, EMAIL.owner, { bootstrapCode: boot });
      phone.deviceId = String(e.json.deviceId ?? "");
      ok(e.status === 200 && e.json.state === "owner_approved", "ilk cihaz kodu → owner_approved (oturum AÇMAZ)", e.json);
      const a = await activate(phone);
      ok(a.status === 200 && a.json.state === "active", "telefon KENDİ imzasıyla etkinleşti", a.json);
      const reuse = await enroll(newPhone(), EMAIL.owner, { bootstrapCode: boot });
      ok(reuse.status === 400, "ilk cihaz kodu TEK kullanımlık", reuse.json);
    }

    section("3) Çevrimdışı kurtarma kiti (SQL konsolu; kâğıtta saklanır)");
    {
      const kit = (await q(`SELECT * FROM public.auth_owner_offline_kit_issue()`)).rows;
      ok(kit.length > 0, `çevrimdışı kit üretildi (${kit.length} satır; değerler loglanmaz)`);
    }

    section("4) MFA zorunluluğu açılır → MFA'sız eski oturumlar kapanır");
    {
      const p1 = await login(EMAIL.owner); // ikinci MFA'sız oturum (ör. başka tarayıcı)
      const r = (await q(`SELECT public.auth_mfa_set_required($1, $2, true, 'Owner MFA provası') AS r`, [sid0, U.owner])).rows[0].r as J;
      ok(r.ok === true && r.changed === true, "Owner kendi MFA zorunluluğunu açtı", r);
      ok((await profile(U.owner, sid0)).status === 401 && (await profile(U.owner, p1.sid)).status === 401, "MFA'sız TÜM Owner oturumları geçersiz (aktör oturumu dahil)");
      ok(await activeSessions(U.owner) === 0, "aktif Owner oturumu kalmadı (yeniden giriş gerekir)");
      const pwOnly = await login(EMAIL.owner);
      ok(pwOnly.status === 202 && pwOnly.sid === "", "parola tek başına artık oturum AÇMAZ (202 MFA_REQUIRED)", { s: pwOnly.status, code: pwOnly.json.code });
      const methods = (pwOnly.json.methods ?? []) as string[];
      ok(methods.includes("qr_device") && methods.includes("email_otp"), `sunulan yöntemler: ${methods.join(",")}`);
    }

    section("5) Gizli pencerede e-posta koduyla giriş");
    let sidEmail = "";
    {
      const wrong = await emailLogin(EMAIL.owner, "000001");
      ok(wrong.v.status >= 400, "yanlış e-posta kodu reddedilir", wrong.v.status);
      const g = await emailLogin(EMAIL.owner);
      const c = await complete(g.ch, g.l.bind);
      sidEmail = c.sid;
      ok(g.v.status === 200 && c.status === 200 && sidEmail !== "" && !("sessionToken" in c.json), "e-posta kodu → HttpOnly oturum (gövdede anahtar yok)", { v: g.v.json, c: c.status });
      const m = (await q(`SELECT mfa_method FROM public.user_sessions WHERE session_token = $1`, [sidEmail])).rows[0]?.mfa_method;
      ok(m === "email_otp", `oturum MFA kanıtı: ${m}`);
      const reuse = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: g.ch, code: g.code }, { cookie: `__Host-yasam_mfa=${g.l.bind}` });
      ok(reuse.status >= 400, "aynı e-posta kodu / bilet ikinci kez kullanılamaz", reuse.status);
    }

    section("6) Kurtarma kodları — e-posta oturumuyla ÜRETİLEMEZ (telefon kayıtlıysa yalnız QR oturumu)");
    let codes: string[] = [];
    {
      const g = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "generate", password: pw(EMAIL.owner) }, self(U.owner, sidEmail));
      ok(g.status === 403 && g.json.code === "STRONG_MFA_REQUIRED", "e-posta koduyla açılmış oturum kurtarma kodu üretemez (güçlü MFA kuralı)", g.json.code);
    }

    section("7) Ayrı girişte QR onayı (6 haneli yazılan kod + telefon imzası) → kurtarma kodları");
    {
      const l = await login(EMAIL.owner);
      const a = await qrApprove(phone, l);
      const c = await complete(a.ch, l.bind);
      ok(a.hasQr && a.d.status === 200 && c.status === 200 && c.sid !== "", "QR onayı → oturum", { d: a.d.json, c: c.status });
      const m = (await q(`SELECT mfa_method FROM public.user_sessions WHERE session_token = $1`, [c.sid])).rows[0]?.mfa_method;
      ok(m === "qr_device", `oturum MFA kanıtı: ${m}`);
      const noPw = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "generate" }, self(U.owner, c.sid));
      ok(noPw.status >= 400, "parolasız kurtarma kodu üretimi reddedilir", noPw.status);
      const g = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "generate", password: pw(EMAIL.owner) }, self(U.owner, c.sid));
      codes = (g.json.codes ?? []) as string[];
      ok(g.status === 200 && codes.length === 10, "QR oturumunda 10 kurtarma kodu üretildi (yalnız bu yanıtta; değerler loglanmaz)", { s: g.status, code: g.json.code });
    }

    section("8) Kurtarma kodu tek kullanımlık");
    {
      const l = await login(EMAIL.owner);
      const r1 = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: l.json.challengeId, code: codes[0] }, { cookie: `__Host-yasam_mfa=${l.bind}` });
      const c1 = await complete(String(l.json.challengeId), l.bind);
      ok(r1.status === 200 && c1.status === 200, "kurtarma kodu ile giriş (kayıp telefon senaryosu)", { r1: r1.json });
      const l2 = await login(EMAIL.owner);
      const r2 = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: l2.json.challengeId, code: codes[0] }, { cookie: `__Host-yasam_mfa=${l2.bind}` });
      ok(r2.status >= 400, "AYNI kurtarma kodu ikinci kez reddedilir", r2.status);
    }

    section("9) Owner kritik işlem — işleme özel doğrulama (step-up)");
    {
      // Uzmanın bekleyen cihaz eşleştirmesi (Owner onayı gerektirir)
      const expPhone = newPhone();
      const e = await enroll(expPhone, EMAIL.exp);
      const devId = String(e.json.deviceId ?? "");
      ok(e.status === 200 && devId !== "", "uzman cihaz eşleştirmesi beklemede", e.json);
      const body = { action: "approve", fingerprintConfirmed: true, verificationMethod: "telefon" };
      const noStep = await call(adminDevice.POST, `/api/admin/devices/${devId}`, "POST", body, adm(sidEmail), { params: Promise.resolve({ id: devId }) });
      ok(noStep.status === 403 && noStep.json.error !== undefined, "step-up olmadan onay REDDEDİLİR", noStep.json);
      const b = await call(stepUp.POST, "/api/admin/step-up", "POST", { op: "begin", action: "device_approve", targetId: devId }, adm(sidEmail));
      const ch = String(b.json.challengeId ?? "");
      await call(stepUp.POST, "/api/admin/step-up", "POST", { op: "email_send", challengeId: ch }, adm(sidEmail));
      const wrongS = await call(stepUp.POST, "/api/admin/step-up", "POST", { op: "email_verify", challengeId: ch, code: "000002" }, adm(sidEmail));
      ok(wrongS.status >= 400 || wrongS.json.ok === false, "step-up yanlış kod reddedilir", wrongS.status);
      const v = await call(stepUp.POST, "/api/admin/step-up", "POST", { op: "email_verify", challengeId: ch, code: lastCode(EMAIL.owner) }, adm(sidEmail));
      ok(v.status === 200, "step-up e-posta kodu doğrulandı", v.json);
      const yes = await call(adminDevice.POST, `/api/admin/devices/${devId}`, "POST", body, adm(sidEmail), { params: Promise.resolve({ id: devId }) });
      ok(yes.status === 200, "step-up sonrası kritik işlem (cihaz onayı) başarılı", yes.json);
      const replay = await call(adminDevice.POST, `/api/admin/devices/${devId}`, "POST", { action: "reject", fingerprintConfirmed: true, verificationMethod: "telefon" }, adm(sidEmail), { params: Promise.resolve({ id: devId }) });
      ok(replay.status !== 200, "kanıt TEK kullanımlık (aynı kanıtla ikinci kritik işlem yok)", replay.status);
    }

    section("10) Kayıp cihaz: telefon devre dışı → QR sunulmaz, e-posta / kurtarma çalışır");
    {
      // Prova kısa sürede çok sayıda açık istek biriktirdi → hesap başına sınır (MFA_TOO_MANY_OPEN, 5 dk). Gerçek zamanda
      // 5 dk beklemenin eşdeğeri: açık istekler süresi dolmuş sayılır (yalnız sentetik DB).
      const lim = await login(EMAIL.owner);
      console.log(`  bilgi: art arda yarım bırakılan girişlerden sonra yanıt: ${lim.status} ${String(lim.json.code ?? "")}`);
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [U.owner]);
      await q(`UPDATE public.auth_trusted_devices SET state = 'revoked', revoked_at = now() WHERE id = $1`, [phone.deviceId]).catch(async () => {
        await q(`UPDATE public.auth_trusted_devices SET state = 'revoked' WHERE id = $1`, [phone.deviceId]);
      });
      const l = await login(EMAIL.owner);
      const methods = (l.json.methods ?? []) as string[];
      ok(!methods.includes("qr_device") && methods.includes("email_otp"), `QR yöntemi kalktı, e-posta kaldı (${methods.join(",")})`);
      const a = await qrApprove(phone, l);
      ok(a.d.status !== 200, "iptal edilmiş telefonun imzası onay VEREMEZ", a.d.status);
      const g = await emailLogin(EMAIL.owner);
      const c = await complete(g.ch, g.l.bind);
      ok(c.status === 200 && c.sid !== "", "kayıp cihazla bile e-posta koduyla giriş mümkün (kilitlenme yok)", { login: g.l.status, loginCode: g.l.json.code, loginErr: g.l.json.error, bind: g.l.bind !== "", send: g.s.status, sendJ: g.s.json.code ?? g.s.json.error, v: g.v.status, vJ: g.v.json.code ?? g.v.json.error, c: c.status, cJ: c.json.code });
    }

    section("11) Yanlış hesap: başka kullanıcının bileti / kodu Owner oturumu üretmez");
    {
      await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true, email_verified_at = coalesce(email_verified_at, now()) WHERE id = '${U.exp}'; SELECT set_config('yasam.mfa_policy','off',false);`);
      const lo = await login(EMAIL.owner);
      const le = await login(EMAIL.exp);
      await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: le.json.challengeId }, { cookie: `__Host-yasam_mfa=${le.bind}` });
      const codeExp = lastCode(EMAIL.exp);
      const cross = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: lo.json.challengeId, code: codeExp }, { cookie: `__Host-yasam_mfa=${lo.bind}` });
      ok(cross.status >= 400, "uzmanın kodu Owner biletini doğrulamaz", cross.status);
      const crossBind = await complete(String(le.json.challengeId), lo.bind);
      ok(crossBind.status === 401 && crossBind.sid === "", "Owner tarayıcısının bağlamasıyla uzman bileti tamamlanamaz", crossBind.status);
    }

    section("12) Kilitlenme analizi: AUTH_MFA_EMAIL_ROLES Owner'ı kapsamazsa");
    {
      process.env.AUTH_MFA_EMAIL_ROLES = "expert";
      const l = await login(EMAIL.owner);
      const methods = (l.json.methods ?? []) as string[];
      ok(!methods.includes("email_otp"), `AUTH_MFA_EMAIL_ROLES=expert iken Owner'a e-posta yöntemi SUNULMAZ (${methods.join(",") || "yok"}) → telefon kaybında yalnız kurtarma kodu / çevrimdışı kit`);
      process.env.AUTH_MFA_EMAIL_ROLES = "expert,owner";
    }
  } finally {
    await db.close();
  }
  console.log(`\nowner-mfa-prova: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
