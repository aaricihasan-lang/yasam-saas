/**
 * GİRİŞ GÜVENLİĞİ F4 — GİRİŞTE E-POSTA OTP PİLOTU: kontrollü canlı kabulün SENTETİK provası (tek uzman hesabı).
 * Gerçek route'lar + gerçek PostgreSQL (en güncel F2 zinciri) + sentetik e-posta. Production / Turhost / gerçek hesap YOK.
 * F4 kilitlenme güvenliği sırası (taslak migration 20280129100100 sentetik DB'de): kurtarma kodları zorunluluktan ÖNCE
 * (parola + e-posta kodu), zorunluluk kodsuz AÇILMAZ, acil geri dönüş denetimli SQL fonksiyonuyla. Pilot yapılandırması —
 *   AUTH_MFA_METHODS=email_otp · AUTH_MFA_METHOD_SCOPE=test_accounts · AUTH_MFA_EMAIL_ROLES=expert (varsayılan)
 *   + auth_mfa_test_accounts'ta YALNIZ pilot hesap (SQL konsolu, ≤ 90 gün) + pilotun doğrulanmış e-postası
 *   + Owner MFA yönetim ekranından YALNIZ pilot için "zorunluluğu aç".
 *
 * Kanıtlananlar: diğer hesapların girişi / oturumları / MFA durumu DEĞİŞMEZ ve onlara MFA AÇILAMAZ · zorunluluk açılınca yalnız
 * pilotun MFA'sız oturumları kapanır · parola yanlışsa doğrulama isteği / oturum YOK · parola doğru + OTP yokken oturum YOK ·
 * yanlış / süresi dolmuş / tekrar kullanılan kod, 5 yanlışta kilit, 60 sn bekleme, başka tarayıcı bağlaması, CSRF reddi ·
 * doğru kod → HttpOnly oturum (mfa_method=email_otp) · kurtarma kodu üretimi (MFA oturumundan) ve e-posta kesintisinde kurtarma
 * koduyla giriş · Owner MFA'sızken başkasının zorunluluğunu KALDIRAMAZ (F2-G) → acil geri dönüş SQL konsolu yolu · QR yöntemi
 * eklendiğinde cihazsız pilota QR sunulmaz, e-posta yolu sürer · test listesi süresi dolunca yöntem kalmaz (kurtarma kodu sürer).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f4-otp-giris-provasi.harness.ts
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
const ORIGIN = "https://www.yasamsistemi.com";
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const PEPPER = "f4-pilot-pepper-0123456789abcdefghijklmnop";

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2n: true });
  const { admin } = db;
  // Production şemasıyla eşlik: arşiv (20280101000600) ve "Pasif" (20280126000000) kolonları — taslak migration ön koşulu.
  await admin.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS access_restricted_at timestamptz`);
  await admin.query(fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20280129100100_auth_mfa_pilot_safety_f4.sql"), "utf8"));
  const sink = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "f4-pilot-")), "eposta.jsonl");
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f4-pilot", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "f4-pilot-rate", LOGIN_IP_PEPPER: "f4-pilot-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: sink, AUTH_OTP_PEPPER: PEPPER,
      // Planlanan production pilot ayarı:
      AUTH_MFA_METHODS: "email_otp", AUTH_MFA_METHOD_SCOPE: "test_accounts",
    });
    for (const k of ["AUTH_EMAIL_SELF_SERVICE_ROLES", "AUTH_MFA_EMAIL_ROLES", "AUTH_EMAIL_VERIFY_PILOT_USER_ID", "ANDROID_APP_SESSION_TRANSPORT"]) delete process.env[k];
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const recoveryVerify = await import("@/app/api/auth/mfa/recovery/verify/route");
    const meRecovery = await import("@/app/api/me/account-recovery/route");
    const profileRoute = await import("@/app/api/auth/profile/route");
    const mfaRoute = await import("@/app/api/admin/users/[id]/mfa/route");
    const { resetEmailProviderCache } = await import("@/lib/email/provider");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 120;
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
    const web = (bind: string, extra: Record<string, string> = {}) => ({ cookie: `__Host-yasam_mfa=${bind}`, ...extra });
    const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
    const mails = () => { try { return fs.readFileSync(sink, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; subject: string; text?: string }); } catch { return []; } };
    // Kod ileti GÖVDESİNDEN okunur (konu satırında kod yok — otpEmail şablonu).
    const lastCode = (to: string, after = 0) => { const m = mails().slice(after).filter((x) => x.to === to); return /\b([0-9]{6})\b/.exec(m[m.length - 1]?.text ?? "")?.[1] ?? ""; };
    const n = async (sql: string, a: unknown[] = []) => Number((await q(sql, a)).rows[0].n);
    const login = async (email: string, password = pw(email)) => {
      const r = await call(sessionRoute.POST, "/api/auth/session", "POST", { email, password });
      return { ...r, bind: cookieVal(r.set, "__Host-yasam_mfa"), sid: cookieVal(r.set, "__Host-yasam_sid") };
    };
    const fresh = async (id: string) => {   // ardışık giriş denemeleri arasında zaman geçişi taklidi (YALNIZ sentetik DB)
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [id]);
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [id]);
    };
    const P = U.exp, PE = EMAIL.exp;
    const OTHERS = [[U.free, EMAIL.free], [U.and1, EMAIL.and1]] as const;

    // Hazırlık (canlıda F3 ile TAMAMLANDI): pilotun e-postası doğrulanmış; SQL konsolunda kontrollü test listesi (yalnız pilot).
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [P]);
    await q(`INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at) VALUES ($1, 'F4 giriş OTP pilotu (sentetik)', $2, now(), now() + interval '14 days')`, [P, U.owner]);
    const snapOthers = async () => (await q(`SELECT md5(string_agg(u.id::text || u.mfa_required::text || coalesce(u.email_verified_at::text,'-') || u.active::text, ',' ORDER BY u.id)) AS u,
        (SELECT md5(coalesce(string_agg(s.id::text || s.is_active::text, ',' ORDER BY s.id),'')) FROM public.user_sessions s WHERE s.user_id <> $1) AS s FROM public.users u WHERE u.id <> $1`, [P])).rows[0];

    section("0) Başlangıç: herkes parolayla girer; diğer hesaplar için MFA ayarı etkisiz");
    const oSid = (await login(EMAIL.owner)).sid;
    const preOther: string[] = [];
    for (const [, e] of OTHERS) { const l = await login(e); ok(l.status === 200 && !!l.sid, `${e}: parola girişi 200 (pilot ayarı açıkken de)`, l.status); preOther.push(l.sid); }
    const p0 = await login(PE);
    ok(p0.status === 200 && !!p0.sid, "pilot: zorunluluk açılmadan önce parola girişi 200 (yalnız ayar MFA açmaz)", p0.status);
    const others0 = await snapOthers();

    section("1) Owner MFA yönetimi: yalnız pilot hazır; diğerlerine AÇILAMAZ");
    {
      const st = await call(mfaRoute.GET, `/api/admin/users/${P}/mfa`, "GET", null, adm(oSid), ctxOf(P));
      const s = (st.json.status ?? {}) as { methods?: { email_otp?: { usable?: boolean } }; ready?: boolean };
      ok(st.status === 200 && s.methods?.email_otp?.usable === true && s.ready === true, "pilot: e-posta yöntemi kullanılabilir, hazır", { s: st.status, m: s.methods?.email_otp });
      for (const [id, e] of OTHERS) {
        await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [id]); // en kötü durum: diğer uzmanın da doğrulanmış e-postası var
        const en = await call(mfaRoute.POST, `/api/admin/users/${id}/mfa`, "POST", { action: "enable", reason: "deneme", confirm: true }, adm(oSid), ctxOf(id));
        const r = (await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [id])).rows[0].mfa_required;
        ok(en.status === 409 && en.json.code === "NO_USABLE_METHOD" && r === false, `${e}: test listesinde değil → zorunluluk AÇILAMAZ (409), değişmedi`, { s: en.status, c: en.json.code });
        await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = $1`, [id]);
      }
      const noCodes = await call(mfaRoute.POST, `/api/admin/users/${P}/mfa`, "POST", { action: "enable", reason: "F4 giriş OTP pilotu", confirm: true }, adm(oSid), ctxOf(P));
      ok(noCodes.status === 409 && noCodes.json.code === "RECOVERY_REQUIRED", "kurtarma kodu YOKKEN zorunluluk açılamaz (409 RECOVERY_REQUIRED)", noCodes.json.code);
      // ÖNCE kurtarma: pilot MFA'sız oturumunda parola + kayıtlı adrese giden kodla 10 kurtarma kodu kurar.
      const b0 = mails().length;
      const ss = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "setup_send", password: pw(PE) }, self(P, p0.sid));
      const sc = lastCode(PE, b0);
      const sg = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "setup_generate", code: sc }, self(P, p0.sid));
      ok(ss.status === 200 && sg.status === 200 && Array.isArray(sg.json.codes) && (sg.json.codes as unknown[]).length === 10, "MFA ÖNCESİ kurtarma kurulumu: 10 kod (parola + e-posta kodu)", { s: ss.status, g: sg.status });
      const en = await call(mfaRoute.POST, `/api/admin/users/${P}/mfa`, "POST", { action: "enable", reason: "F4 giriş OTP pilotu", confirm: true }, adm(oSid), ctxOf(P));
      ok(en.status === 200 && en.json.ok === true, "kurtarma kodu varken pilot için zorunluluk AÇILDI (Owner, MFA yönetim ekranı)", en.json);
      const old = await call(profileRoute.GET, "/api/auth/profile", "GET", null, self(P, p0.sid));
      ok(old.status === 401, "pilotun MFA'sız eski oturumu KAPANDI", old.status);
      for (let i = 0; i < OTHERS.length; i++) {
        const pr = await call(profileRoute.GET, "/api/auth/profile", "GET", null, self(OTHERS[i][0], preOther[i]));
        ok(pr.status === 200, `${OTHERS[i][1]}: mevcut oturumu SÜRÜYOR`, pr.status);
      }
      const others1 = await snapOthers();
      ok(JSON.stringify(others0) === JSON.stringify(others1), "pilot dışındaki hesapların MFA / doğrulama / etkinlik kayıtları ve oturumları DEĞİŞMEDİ");
    }

    section("2) Parola kuralları");
    {
      const bad = await login(PE, "yanlis-parola");
      ok(bad.status === 401 && !bad.bind && !bad.sid && !bad.json.challengeId, "yanlış parola → 401; doğrulama isteği / oturum YOK", bad.status);
      await fresh(P);
      const l = await login(PE);
      const methods = (l.json.methods ?? []) as string[];
      ok(l.status === 202 && !l.sid && !!l.bind && JSON.stringify(methods) === '["email_otp","recovery_code"]' && typeof l.json.emailHint === "string" && !l.text.includes(PE),
        "doğru parola → 202 MFA_REQUIRED, oturum YOK, yöntemler e-posta + kurtarma kodu (önceden kuruldu), adres maskeli", { s: l.status, methods, hint: l.json.emailHint });
      const early = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      ok(early.status >= 400 && !cookieVal(early.set, "__Host-yasam_sid"), "OTP doğrulanmadan oturum TAMAMLANAMAZ", early.status);
    }

    section("3) OTP hataları");
    {
      await fresh(P);
      const l = await login(PE);
      const before = mails().length;
      const s = await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      const code = lastCode(PE, before);
      ok(s.status === 200 && /^[0-9]{6}$/.test(code) && mails().slice(before).every((m) => m.to === PE) && !s.text.includes(code), "kod yalnız pilotun kayıtlı adresine; yanıtta kod yok", s.status);
      const again = await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      ok(again.status === 429, "60 sn dolmadan yeniden gönderim → 429", again.status);
      const csrf = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l.json.challengeId, code }, web(l.bind, { origin: "https://kotu.example", "sec-fetch-site": "cross-site" }));
      const nobind = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l.json.challengeId, code }, { cookie: "__Host-yasam_mfa=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" });
      ok(csrf.status === 403 && nobind.status >= 400, "başka site (CSRF) 403; başka tarayıcı bağlaması reddedildi", [csrf.status, nobind.status]);
      const other = await login(EMAIL.free);
      const imp = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l.json.challengeId, code }, { cookie: `__Host-yasam_sid=${other.sid}`, "x-user-id": P });
      ok(imp.status >= 400, "başka kullanıcının oturumu + pilot kimliği → doğrulama yapılamaz", imp.status);
      const wrong = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l.json.challengeId, code: code === "000000" ? "111111" : "000000" }, web(l.bind));
      ok(wrong.status >= 400, "yanlış kod reddedildi", wrong.json.code);
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '4 minutes', expires_at = expires_at - interval '4 minutes' WHERE user_id = $1 AND state = 'active'`, [P]);
      const exp = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l.json.challengeId, code }, web(l.bind));
      ok(exp.status >= 400, "süresi dolmuş kod reddedildi", exp.json.code);

      await fresh(P);
      await q(`UPDATE public.auth_email_otps SET attempts = 0 WHERE user_id = $1`, [P]);
      const l2 = await login(PE);
      const b2 = mails().length;
      await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: l2.json.challengeId }, web(l2.bind));
      const good = lastCode(PE, b2);
      const bad = good === "222222" ? "333333" : "222222";
      const outs: number[] = [];
      for (let i = 0; i < 5; i++) outs.push((await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l2.json.challengeId, code: bad }, web(l2.bind))).status);
      const after = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l2.json.challengeId, code: good }, web(l2.bind));
      const ch = (await q(`SELECT state FROM public.auth_mfa_challenges WHERE id = $1`, [l2.json.challengeId])).rows[0]?.state;
      ok(outs.every((x) => x >= 400) && after.status >= 400 && ch === "denied", "5 yanlışta kilit; doğru kod da geçmez; giriş isteği kapandı", { outs, after: after.status, ch });
      ok(await n(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [P]) === 0, "bu hatalı denemelerin hiçbiri oturum AÇMADI");
    }

    section("4) Başarılı giriş + tek kullanım + HttpOnly");
    let sidP = "";
    {
      await fresh(P);
      await q(`UPDATE public.auth_email_otps SET attempts = 0 WHERE user_id = $1`, [P]);
      const l = await login(PE);
      const b = mails().length;
      await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      const code = lastCode(PE, b);
      const v = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l.json.challengeId, code }, web(l.bind));
      const c = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      sidP = cookieVal(c.set, "__Host-yasam_sid");
      const line = c.set.find((x) => x.startsWith("__Host-yasam_sid=")) ?? "";
      const m = (await q(`SELECT mfa_method FROM public.user_sessions WHERE session_token = $1`, [sidP])).rows[0]?.mfa_method;
      ok(v.status === 200 && c.status === 200 && !!sidP && m === "email_otp" && !("sessionToken" in c.json), "doğru kod → oturum (mfa_method=email_otp), gövdede anahtar yok", { v: v.status, c: c.status, m });
      ok(/HttpOnly/i.test(line) && /Secure/i.test(line) && /SameSite=strict/i.test(line) && !/Domain=/i.test(line), "çerez HttpOnly + Secure + SameSite=Strict, Domain yok");
      const reuse = await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l.json.challengeId, code }, web(l.bind));
      const c2 = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      ok(reuse.status >= 400 && c2.status >= 400 && !cookieVal(c2.set, "__Host-yasam_sid"), "aynı kod / aynı giriş isteği ikinci kez KULLANILAMAZ");
    }

    section("5) Kilitlenmeye karşı: kurtarma kodu + e-posta kesintisi");
    let rc: string[] = [];
    {
      const g = await call(meRecovery.POST, "/api/me/account-recovery", "POST", { action: "generate", password: pw(PE) }, self(P, sidP));
      rc = Array.isArray(g.json.codes) ? (g.json.codes as string[]) : [];
      ok(g.status === 200 && rc.length === 10, "pilot e-posta MFA oturumundan kodları YENİLEDİ (10 yeni kod, eskiler geçersiz)", { s: g.status, n: rc.length });
      const saved = process.env.EMAIL_PROVIDER;
      delete process.env.EMAIL_PROVIDER; resetEmailProviderCache();
      await fresh(P);
      const l = await login(PE);
      const methods = (l.json.methods ?? []) as string[];
      ok(l.status === 202 && !l.sid && !methods.includes("email_otp") && methods.includes("recovery_code"), "e-posta servisi kapalı: e-posta yöntemi yok, KURTARMA KODU var, parola tek başına yetmez", methods);
      const v = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: l.json.challengeId, code: rc[0] }, web(l.bind));
      const c = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      ok(v.status === 200 && c.status === 200 && !!cookieVal(c.set, "__Host-yasam_sid"), "kurtarma koduyla giriş tamamlandı (kilitlenme yok)", { v: v.status, c: c.status });
      await fresh(P);
      const l2 = await login(PE);
      const r2 = await call(recoveryVerify.POST, "/api/auth/mfa/recovery/verify", "POST", { challengeId: l2.json.challengeId, code: rc[0] }, web(l2.bind));
      ok(r2.status === 401, "aynı kurtarma kodu ikinci kez kabul EDİLMEZ", r2.json.code);
      process.env.EMAIL_PROVIDER = saved; resetEmailProviderCache();
    }

    section("6) Test listesi süresi dolarsa (F4 Risk B): e-posta yöntemi KALIR, kurtarma kodu sürer; parola yetmez");
    {
      await q(`UPDATE public.auth_mfa_test_accounts SET created_at = now() - interval '20 days', expires_at = now() - interval '1 minute' WHERE user_id = $1`, [P]);
      await fresh(P);
      const l = await login(PE);
      const methods = (l.json.methods ?? []) as string[];
      ok(l.status === 202 && !l.sid && JSON.stringify(methods) === '["email_otp","recovery_code"]', "liste süresi doldu: e-posta + kurtarma kodu sürüyor (kilitlenme yok); parola tek başına yetmez", methods);
      await q(`UPDATE public.auth_mfa_test_accounts SET created_at = now(), expires_at = now() + interval '14 days' WHERE user_id = $1`, [P]);
    }

    section("7) QR sonraki aşama: AUTH_MFA_METHODS=qr_device,email_otp → cihazsız pilota QR sunulmaz, e-posta sürer");
    {
      process.env.AUTH_MFA_METHODS = "qr_device,email_otp";
      await fresh(P);
      const l = await login(PE);
      const methods = (l.json.methods ?? []) as string[];
      ok(l.status === 202 && methods.includes("email_otp") && !methods.includes("qr_device") && !("qr" in l.json), "cihaz yok → QR sunulmaz; e-posta yolu korunur", methods);
      process.env.AUTH_MFA_METHODS = "email_otp";
    }

    section("8) Geri dönüş");
    {
      const d = await call(mfaRoute.POST, `/api/admin/users/${P}/mfa`, "POST", { action: "disable", reason: "pilot bitti", confirm: true }, adm(oSid), ctxOf(P));
      ok(d.status === 403 && (d.json.code === "fresh_mfa_required" || d.json.code === "STEP_UP_REQUIRED"), "MFA'sız Owner başkasının zorunluluğunu panelden KALDIRAMAZ (F2-G, beklenen)", d.json.code);
      const direct = await q(`UPDATE public.users SET mfa_required = false WHERE id = $1`, [P]).then(() => "geçti", (e: { code?: string }) => e.code ?? "hata");
      ok(direct === "42501", "doğrudan UPDATE (koruma ayarı olmadan) REDDEDİLİR", direct);
      const em = (await q(`SELECT public.auth_mfa_emergency_disable($1, 'F4 pilot acil geri dönüş provası') AS r`, [P])).rows[0].r as J;
      ok(em.ok === true && em.changed === true && em.others_unchanged === true && Number(em.mfa_required_after) === 0, "ACİL GERİ DÖNÜŞ (denetimli SQL fonksiyonu): yalnız pilot, diğerleri değişmedi", em);
      await fresh(P);
      const l = await login(PE);
      ok(l.status === 200 && !!l.sid, "pilot yeniden parolayla girer", l.status);
      ok(await n(`SELECT count(*)::int n FROM public.users WHERE mfa_required`) === 0, "MFA zorunlu hesap kalmadı");
      const others2 = await snapOthers();
      ok(others2.u === others0.u, "pilot dışındaki hesapların kayıtları baştan sona DEĞİŞMEDİ");
    }
  } finally {
    await db.close();
  }
  console.log(`\nf4-otp-giris-provasi: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("f4-otp-giris-provasi HATA:", e instanceof Error ? e.message : e);
  console.log(`\nf4-otp-giris-provasi: ${pass} PASS / ${fail + 1} FAIL`);
  process.exit(1);
});
