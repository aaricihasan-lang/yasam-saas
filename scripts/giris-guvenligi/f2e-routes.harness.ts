/**
 * GİRİŞ GÜVENLİĞİ F2-E — UÇTAN UCA hesap kurtarma harness'ı (GERÇEK PostgreSQL + GERÇEK route'lar + gerçek
 * özet/pepper). Production'a SIFIR temas; sentetik kullanıcılar. E-posta sağlayıcısı SENTETİK (bellek içi
 * outbox) — GERÇEK GMAIL GÖNDERİMİ DEĞİLDİR. "SQL konsolu" = test DB'sindeki postgres bağlantısı.
 *
 * A) kurtarma kodu üretimi (MFA'lı oturum + parola) · B) parola → 202 → kurtarma kodu → tamamla; yanlış /
 * biçimsiz / tekrar / başka kullanıcı / 5 yanlış kilit · C) e-posta değişikliği (zayıf oturum reddi, yeni
 * adrese kod, eski adrese bildirim) + Owner panelinden değişiklikte doğrulama düşer · D) cihaz iptali ve
 * telefon değişimi (QR kanıtı, Owner listesinde değişim, iptal cihaz onay veremez) · E) Owner aracılı kurtarma
 * (MFA'lı Owner, 72 saat, kullanıcı iptali, parola + teyit, bilet tek kullanım) · F) Owner çevrimdışı kiti
 * (diğer oturumlar kapanır, eşleştirme kodu bir kez) · G) sızıntı taraması (DB, outbox, yanıtlar).
 *
 * Zincir: varsayılan izole koşu 000600'e kadardır (F2-E/F sözleşmesi, değişmedi). F2_TEST_DB_LATEST=1 ile EN GÜNCEL zincirde
 * koşar: F2-G step-up (yürütme ek doğrulama ister) ve F2-I (MFA zorunluluğu MFA'sız oturumu kapatır) kurallarına uyar ve
 * 72 saat kuralını geçerli step-up kanıtıyla AYRICA kanıtlar. F2E_NEGATIF_72S=1: 72 saat denetimi geçici test DB'sinden
 * kaldırılır → FAIL VERMEK ZORUNDA (negatif kontrol).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2e-routes.harness.ts   (tam zincir: F2_TEST_DB_LATEST=1 npx tsx ...)
 */
import Module from "node:module";
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
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n── ${s} ──`);

type J = Record<string, unknown>;
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const PEPPER = "f2e-harness-pepper-0123456789abcdefghijklmnop";
function cookieFrom(res: Response, name: string): string {
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const raw of all) if (raw.startsWith(`${name}=`)) return raw.slice(name.length + 1).split(";")[0];
  return "";
}

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2e: true });
  const { admin } = db;
  // Zincir düzeyi (testDb iki bağımsız kaynaktan ölçer). İzole koşu: 600 (F2-E/F) — davranış ve beklentiler DEĞİŞMEDİ.
  // Tam zincir (F2_TEST_DB_LATEST=1 / F2_TEST_DB_WITH_F2x=1) sonraki fazların DAHA SIKI kurallarını içerir; test bunları
  // gevşetmez, akışı onlara uydurur ve ayrıca kanıtlar:
  //   ≥700 (F2-G): Owner'ın kurtarma YÜRÜTMESİ işleme özel ek doğrulama (step-up) ister.
  //   ≥900 (F2-I): MFA zorunluluğu açılınca kullanıcının MFA'sız oturumları kapanır (Owner'ın ilk normal oturumu dahil).
  const LV = db.level.catalog;
  const STEP_UP = LV >= 700;
  const MFA_ENDS_PLAIN = LV >= 900;
  if (process.env.F2E_NEGATIF_72S === "1") {
    // NEGATİF KONTROL (YALNIZ bu geçici test DB'sinde; repo migration'ı değişmez): 72 saat denetimi yürütme çekirdeğinden
    // çıkarılır → "72 saat dolmadan yürütme yok" maddeleri FAIL VERMEK ZORUNDA (vermiyorsa test kördür).
    const def = String((await admin.query(`SELECT pg_get_functiondef('public.auth_recovery_case_execute_core(text,uuid,text,boolean)'::regprocedure) AS d`)).rows[0].d);
    const mut = def.replace("IF v_now < v.not_before THEN", "IF false THEN");
    if (mut === def) throw new Error("negatif kontrol: 72 saat denetimi fonksiyon gövdesinde bulunamadı");
    await admin.query(mut);
    console.log("NEGATİF KONTROL: 72 saat denetimi test DB'sinden kaldırıldı (FAIL beklenir)");
  }
  console.log(`f2e-routes: test DB F2 düzeyi ${LV} (kayıt ${db.level.registry ?? "yok"}) · Owner step-up ${STEP_UP ? "VAR" : "yok"} · MFA zorunluluğu MFA'sız oturumu kapatır: ${MFA_ENDS_PLAIN ? "EVET" : "hayır"}`);
  const VE = { id: "00000000-0000-0000-0000-00000000e0d1", email: "f2d-ve@test.local" };
  const VE2 = { id: "00000000-0000-0000-0000-00000000e0d2", email: "f2d-ve2@test.local" };
  const ADM2 = { id: "00000000-0000-0000-0000-00000000a002", email: "admin2@test.local" };
  const secrets: string[] = [];   // üretilen bütün düz kodlar (sızıntı taraması)
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl,
      SUPABASE_SERVICE_ROLE_KEY: "f2e-harness-service-key",
      SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "f2e-harness-rate-secret",
      LOGIN_IP_PEPPER: "f2e-harness-ip-pepper",
      REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      AUTH_MFA_METHODS: "qr_device,email_otp",
      AUTH_MFA_METHOD_SCOPE: "all",
      AUTH_MFA_EMAIL_ROLES: "expert,admin",
      EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1",
      AUTH_OTP_PEPPER: PEPPER,
    });
    delete process.env.SESSION_EXPIRY_ENFORCE;
    delete process.env.EMAIL_SYNTHETIC_FAIL;

    const { syntheticOutbox } = await import("@/lib/email/syntheticProvider");
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const recoveryRoute = await import("@/app/api/auth/mfa/recovery/verify/route");
    const meEmailRoute = await import("@/app/api/me/email-verification/route");
    const meRecovery = await import("@/app/api/me/account-recovery/route");
    const meEmailChange = await import("@/app/api/me/email-change/route");
    const meReplace = await import("@/app/api/me/devices/replace/route");
    const meDevice = await import("@/app/api/me/devices/[id]/route");
    const adminDevice = await import("@/app/api/admin/devices/[id]/route");
    const adminDevices = await import("@/app/api/admin/devices/route");
    const adminCases = await import("@/app/api/admin/recovery-cases/route");
    const adminCase = await import("@/app/api/admin/recovery-cases/[id]/route");
    const stepUpRoute = await import("@/app/api/admin/step-up/route");

    let ipSeq = 10;
    const nextIp = () => `198.51.100.${ipSeq++ % 250}`;
    type Handler = (r: NextRequest, ctx?: never) => Promise<Response>;
    const call = async (handler: Handler, url: string, method: "GET" | "POST" | "DELETE", body: unknown, headers: Record<string, string> = {}, ctx?: unknown) => {
      const res = await (handler as (r: NextRequest, c?: unknown) => Promise<Response>)(new NextRequest(url, {
        method, headers: { "content-type": "application/json", "x-real-ip": nextIp(), "user-agent": WEB_UA, ...headers },
        ...(method !== "GET" && body !== undefined ? { body: JSON.stringify(body) } : {}),
      }), ctx);
      const text = await res.clone().text();
      let json: J = {};
      try { json = JSON.parse(text) as J; } catch { /* boş */ }
      return { res, json, text };
    };
    const L = "http://localhost";
    const count = async (sql: string, args: unknown[] = []) => Number((await admin.query(sql, args)).rows[0].n);
    const lastMailTo = (to: string) => [...syntheticOutbox()].reverse().find((x) => x.to === to);
    const lastCode = (to: string): string => /\b([0-9]{6})\b/.exec(lastMailTo(to)?.text ?? "")?.[1] ?? "";
    const ageOtps = (userId: string) =>
      admin.query(`UPDATE public.auth_email_otps SET created_at = created_at - interval '61 seconds', expires_at = expires_at - interval '61 seconds' WHERE user_id = $1`, [userId]);
    const expireOpen = (userId: string) =>
      admin.query(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending', 'verified')`, [userId]);
    const webLogin = async (email: string, password = pw(email)) => {
      const r = await call(sessionRoute.POST as unknown as Handler, `${L}/api/auth/session`, "POST", { email, password });
      return { ...r, bind: cookieFrom(r.res, "__Host-yasam_mfa"), sid: cookieFrom(r.res, "__Host-yasam_sid") };
    };
    const web = (bind: string) => ({ "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bind}` });
    const self = (userId: string, sid: string) => ({ "x-user-id": userId, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" });
    const adminH = (adminId: string, sid: string) => ({ "x-admin-id": adminId, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" });
    const recover = (ch: string, code: string, h: Record<string, string>) => call(recoveryRoute.POST as unknown as Handler, `${L}/api/auth/mfa/recovery/verify`, "POST", { challengeId: ch, code }, h);
    const complete = async (ch: string, bind: string) => {
      const r = await call(completeRoute.POST as unknown as Handler, `${L}/api/auth/mfa/complete`, "POST", { challengeId: ch }, web(bind));
      return { ...r, sid: cookieFrom(r.res, "__Host-yasam_sid") };
    };
    /** Parola → 202 → e-posta kodu → tamamla. MFA'lı (email_otp) oturum döner. */
    const loginEmailOtp = async (user: { id: string; email: string }, loginEmail = user.email, password = pw(user.email)) => {
      await ageOtps(user.id);
      const l = await webLogin(loginEmail, password);
      const ch = String(l.json.challengeId ?? "");
      await call(sendRoute.POST as unknown as Handler, `${L}/api/auth/mfa/email/send`, "POST", { challengeId: ch }, web(l.bind));
      await call(verifyRoute.POST as unknown as Handler, `${L}/api/auth/mfa/email/verify`, "POST", { challengeId: ch, code: lastCode(loginEmail.toLowerCase()) }, web(l.bind));
      const c = await complete(ch, l.bind);
      return c.sid;
    };
    /** Parola → 202 → kurtarma kodu → tamamla. */
    const loginRecovery = async (user: { id: string; email: string }, code: string, loginEmail = user.email) => {
      const l = await webLogin(loginEmail, pw(user.email));
      const ch = String(l.json.challengeId ?? "");
      const v = await recover(ch, code, web(l.bind));
      const c = await complete(ch, l.bind);
      return { l, v, c, sid: c.sid, ch };
    };
    /** F2-G (yalnız tam zincir): Owner'ın işleme özel e-posta kanıtı — begin → kod YALNIZ Owner'ın kutusuna → doğrula. */
    const ownerStepUp = async (sid: string, action: string, targetId: string) => {
      await admin.query(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [U.owner]);
      const su = (body: unknown) => call(stepUpRoute.POST as unknown as Handler, `${L}/api/admin/step-up`, "POST", body, adminH(U.owner, sid));
      const b = await su({ op: "begin", action, targetId });
      const ch = String(b.json.challengeId ?? "");
      const s = await su({ op: "email_send", challengeId: ch });
      const v = await su({ op: "email_verify", challengeId: ch, code: lastCode(EMAIL.owner) });
      return { ch, ok: b.res.status === 200 && s.res.status === 200 && v.res.status === 200, detail: { begin: b.res.status, send: s.json, verify: v.json } };
    };
    const challengeState = async (id: string) => String((await admin.query(`SELECT state FROM public.auth_mfa_challenges WHERE id = $1`, [id])).rows[0]?.state ?? "");
    const verifyEmailFor = async (user: { id: string; email: string }) => {
      const s = await webLogin(user.email);
      await ageOtps(user.id);
      await call(meEmailRoute.POST as unknown as Handler, `${L}/api/me/email-verification`, "POST", { action: "send" }, self(user.id, s.sid));
      const v = await call(meEmailRoute.POST as unknown as Handler, `${L}/api/me/email-verification`, "POST", { action: "confirm", code: lastCode(user.email) }, self(user.id, s.sid));
      return v.json.verified === true;
    };

    // ═══════════════════════════════════════════════════════════════════════
    section("0) Kurulum: Owner + VE + VE2 e-posta doğrulanmış ve MFA zorunlu");
    const ownerPlain = await webLogin(EMAIL.owner);
    ok(ownerPlain.res.status === 200 && !!ownerPlain.sid, "Owner normal giriş (henüz zorunlu değil)");
    for (const u of [VE, VE2, { id: U.owner, email: EMAIL.owner }]) ok(await verifyEmailFor(u), `${u.email} e-postası doğrulandı`);
    for (const id of [VE.id, VE2.id, U.owner]) {
      const r = (await admin.query(`SELECT public.auth_mfa_set_required($1, $2, true, 'f2e harness') AS r`, [ownerPlain.sid, id])).rows[0].r;
      ok(r.ok === true, `zorunluluk açıldı ${id.slice(-4)}`, r);
    }
    const ownerSid = await loginEmailOtp({ id: U.owner, email: EMAIL.owner });
    ok(!!ownerSid && await count(`SELECT count(*)::int n FROM public.user_sessions WHERE session_token = $1 AND mfa_method = 'email_otp'`, [ownerSid]) === 1,
      "Owner MFA'lı (e-posta) oturum");

    section("A) Kurtarma kodu üretimi");
    let veCodes: string[] = [];
    {
      const plainVe2 = await call(meRecovery.POST as unknown as Handler, `${L}/api/me/account-recovery`, "POST", { action: "generate", password: pw(ADM2.email) }, self(ADM2.id, (await webLogin(ADM2.email)).sid));
      ok(plainVe2.res.status === 403 && plainVe2.json.code === "MFA_SESSION_REQUIRED", "MFA'sız oturum kod üretemez", plainVe2.json);
      const sid = await loginEmailOtp(VE);
      const noPw = await call(meRecovery.POST as unknown as Handler, `${L}/api/me/account-recovery`, "POST", { action: "generate" }, self(VE.id, sid));
      ok(noPw.res.status === 400 && noPw.json.code === "PASSWORD_REQUIRED", "parola şart", noPw.json);
      const badPw = await call(meRecovery.POST as unknown as Handler, `${L}/api/me/account-recovery`, "POST", { action: "generate", password: "yanlis-parola" }, self(VE.id, sid));
      ok(badPw.res.status === 400 && badPw.json.code === "PASSWORD_WRONG", "yanlış parola", badPw.json);
      const cross = await call(meRecovery.POST as unknown as Handler, `${L}/api/me/account-recovery`, "POST", { action: "generate", password: pw(VE.email) }, self(VE2.id, sid));
      ok(cross.res.status === 403, "başka kullanıcının kimliğiyle istek reddedilir");
      const outBefore = syntheticOutbox().length;
      const g = await call(meRecovery.POST as unknown as Handler, `${L}/api/me/account-recovery`, "POST", { action: "generate", password: pw(VE.email) }, self(VE.id, sid));
      veCodes = Array.isArray(g.json.codes) ? (g.json.codes as string[]) : [];
      secrets.push(...veCodes);
      ok(g.res.status === 200 && veCodes.length === 10 && veCodes.every((c) => /^[A-Z2-7]{4}(-[A-Z2-7]{4}){6}$/.test(c)) && new Set(veCodes).size === 10,
        "10 farklı kod, 28 karakter base32 (140 bit), 4'lü gruplar", g.json);
      ok(/no-store/.test(g.res.headers.get("cache-control") ?? ""), "yanıt önbelleğe alınmaz (no-store)");
      const notice = syntheticOutbox().slice(outBefore).find((m) => m.to === VE.email);
      ok(!!notice && /kurtarma kodlarınız yenilendi/i.test(notice.subject) && !veCodes.some((c) => notice.text.includes(c) || notice.html.includes(c)),
        "kod İÇERMEYEN güvenlik bildirimi gitti");
      const st = await call(meRecovery.GET as unknown as Handler, `${L}/api/me/account-recovery`, "GET", undefined, self(VE.id, sid));
      ok(st.res.status === 200 && st.json.codesActive === 10 && st.json.sessionMethod === "email_otp" && !veCodes.some((c) => st.text.includes(c)),
        "durum: 10 aktif kod; kodlar bir daha GÖSTERİLMEZ", st.json);
      ok(await count(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1 AND state = 'active' AND code_hash ~ '^[0-9a-f]{64}$'`, [VE.id]) === 10,
        "DB'de yalnız 64 haneli özet");
    }

    section("B) Girişte kurtarma kodu");
    {
      await expireOpen(VE.id);
      const sessBefore = await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1`, [VE.id]);
      const l = await webLogin(VE.email);
      const ch = String(l.json.challengeId ?? "");
      ok(l.res.status === 202 && Array.isArray(l.json.methods) && (l.json.methods as string[]).includes("recovery_code") && (l.json.methods as string[]).includes("email_otp"),
        "202: yöntemler e-posta + kurtarma kodu", l.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1`, [VE.id]) === sessBefore,
        "parola tek başına oturum açmadı");
      const noBind = await recover(ch, veCodes[0], { "sec-fetch-site": "same-origin" });
      ok(noBind.res.status === 401 && noBind.json.code === "MFA_INVALID", "bağlama çerezi olmadan kod denenemez", noBind.json);
      const crossSite = await recover(ch, veCodes[0], { ...web(l.bind), "sec-fetch-site": "cross-site" });
      ok(crossSite.res.status === 403, "başka siteden istek reddedilir");
      const wrong = await recover(ch, "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA", web(l.bind));
      ok(wrong.res.status === 401 && wrong.json.code === "RECOVERY_WRONG" && wrong.json.attemptsLeft === 4, "yanlış kod → kalan 4", wrong.json);
      const junk = await recover(ch, "kısa", web(l.bind));
      ok(junk.res.status === 401 && junk.json.code === "RECOVERY_WRONG" && junk.json.attemptsLeft === 3, "biçimsiz giriş de deneme sayılır", junk.json);
      const early = await complete(ch, l.bind);
      ok(early.res.status === 401, "doğrulanmadan tamamlama YOK");
      const outBefore = syntheticOutbox().length;
      const messy = ` ${veCodes[0].toLowerCase().replace(/-/g, " ")} `;
      const v = await recover(ch, messy, web(l.bind));
      ok(v.res.status === 200 && v.json.result === "verified" && v.json.remaining === 9 && v.json.kind === "code", "küçük harf / boşluklu doğru kod kabul, kalan 9", v.json);
      const c = await complete(ch, l.bind);
      ok(c.res.status === 200 && !!c.sid, "tamamlandı → oturum", c.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE session_token = $1 AND mfa_method = 'recovery_code'`, [c.sid]) === 1, "oturum kanıtı recovery_code");
      const n = syntheticOutbox().slice(outBefore).find((m) => m.to === VE.email);
      ok(!!n && /kurtarma koduyla giriş/i.test(n.subject) && !n.text.includes(veCodes[0]), "kurtarma girişi bildirimi (kodsuz)");
      const st = await call(meRecovery.GET as unknown as Handler, `${L}/api/me/account-recovery`, "GET", undefined, self(VE.id, c.sid));
      ok(st.json.sessionMethod === "recovery_code" && st.json.sessionRecoveryKind === "user" && st.json.codesActive === 9, "durum: kurtarma oturumu, 9 kod", st.json);
      const again = await webLogin(VE.email);
      const reuse = await recover(String(again.json.challengeId), veCodes[0], web(again.bind));
      ok(reuse.res.status === 401 && reuse.json.code === "RECOVERY_WRONG", "kullanılmış kod ikinci kez geçmez", reuse.json);
      const l2 = await webLogin(VE2.email);
      const other = await recover(String(l2.json.challengeId), veCodes[1], web(l2.bind));
      ok(other.res.status === 401 && other.json.code === "RECOVERY_WRONG", "VE'nin kodu VE2 hesabında geçmez", other.json);
      // 5 yanlış → kilit; aynı istekte doğru kod artık işe yaramaz.
      await expireOpen(VE.id);
      await admin.query(`DELETE FROM public.auth_recovery_attempts WHERE user_id = $1`, [VE.id]);
      const lk = await webLogin(VE.email);
      let last: { res: Response; json: J } | null = null;
      for (let i = 0; i < 5; i++) last = await recover(String(lk.json.challengeId), `BBBB-BBBB-BBBB-BBBB-BBBB-BBBB-BBB${"ABCDE"[i]}`, web(lk.bind));
      ok(last?.res.status === 401 && last?.json.code === "RECOVERY_LOCKED", "5 yanlış → kilit", last?.json);
      const after = await recover(String(lk.json.challengeId), veCodes[2], web(lk.bind));
      ok(after.res.status === 401 && after.json.code === "MFA_INVALID", "kilitli istekte doğru kod da reddedilir", after.json);
      ok(await count(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1 AND state = 'active'`, [VE.id]) === 9, "kilit kod harcamaz (9)");
    }

    section("C) E-posta değişikliği");
    let veEmail = VE.email;
    {
      await expireOpen(VE.id);
      const emailSid = await loginEmailOtp(VE);
      const weak = await call(meEmailChange.POST as unknown as Handler, `${L}/api/me/email-change`, "POST", { action: "start", newEmail: "ve-yeni@test.local", password: pw(VE.email) }, self(VE.id, emailSid));
      ok(weak.res.status === 403 && weak.json.code === "STRONG_MFA_REQUIRED", "e-posta koduyla açılmış oturum adresi değiştiremez", weak.json);
      await expireOpen(VE.id);
      const rec = await loginRecovery(VE, veCodes[3]);
      ok(rec.c.res.status === 200, "kurtarma koduyla giriş");
      const badPw = await call(meEmailChange.POST as unknown as Handler, `${L}/api/me/email-change`, "POST", { action: "start", newEmail: "ve-yeni@test.local", password: "yanlis" }, self(VE.id, rec.sid));
      ok(badPw.res.status === 400 && badPw.json.code === "PASSWORD_WRONG", "parola şart", badPw.json);
      const taken = await call(meEmailChange.POST as unknown as Handler, `${L}/api/me/email-change`, "POST", { action: "start", newEmail: VE2.email, password: pw(VE.email) }, self(VE.id, rec.sid));
      ok(taken.res.status === 409, "başka hesabın adresi kullanılamaz", taken.json);
      const start = await call(meEmailChange.POST as unknown as Handler, `${L}/api/me/email-change`, "POST", { action: "start", newEmail: "VE-Yeni@Test.local", password: pw(VE.email) }, self(VE.id, rec.sid));
      ok(start.res.status === 200 && typeof start.json.requestId === "string" && start.json.sentTo === "v***@t***.local", "yeni adrese kod", start.json);
      const code = lastCode("ve-yeni@test.local");
      ok(/^[0-9]{6}$/.test(code) && /e-posta adresini bu adresle değiştirme/.test(lastMailTo("ve-yeni@test.local")?.text ?? ""), "kod YENİ adrese gitti (Türkçe şablon)");
      const wrong = await call(meEmailChange.POST as unknown as Handler, `${L}/api/me/email-change`, "POST", { action: "confirm", requestId: start.json.requestId, code: code === "000000" ? "111111" : "000000" }, self(VE.id, rec.sid));
      ok(wrong.res.status === 400 && /Kalan deneme: 4/.test(String(wrong.json.error)), "yanlış kod", wrong.json);
      const outBefore = syntheticOutbox().length;
      const conf = await call(meEmailChange.POST as unknown as Handler, `${L}/api/me/email-change`, "POST", { action: "confirm", requestId: start.json.requestId, code }, self(VE.id, rec.sid));
      ok(conf.res.status === 200 && conf.json.ok === true, "adres değişti", conf.json);
      const old = syntheticOutbox().slice(outBefore).find((m) => m.to === VE.email);
      ok(!!old && /e-posta adresi değiştirildi/i.test(old.subject), "ESKİ adrese güvenlik bildirimi");
      ok(await count(`SELECT count(*)::int n FROM public.users WHERE id = $1 AND email = 've-yeni@test.local' AND email_verified_at IS NOT NULL AND tenant_id = '10000000-0000-0000-0000-000000000031'`, [VE.id]) === 1,
        "DB: yeni adres doğrulanmış; hesap kimliği / tenant aynı");
      veEmail = "ve-yeni@test.local";
      await expireOpen(VE.id);
      const newLogin = await webLogin(veEmail, pw(VE.email));
      ok(newLogin.res.status === 202 && newLogin.json.emailHint === "v***@t***.local", "yeni adresle giriş; e-posta kodu yeni adrese", newLogin.json);
      const oldLogin = await webLogin(VE.email, pw(VE.email));
      ok(oldLogin.res.status === 401, "eski adresle giriş yok");
      // Owner panelinden (veya herhangi bir yoldan) değişiklik → doğrulama düşer → e-posta yöntemi sunulmaz.
      await admin.query(`UPDATE public.users SET email = 'f2d-ve2-panel@test.local' WHERE id = $1`, [VE2.id]);
      await expireOpen(VE2.id);
      const p = await webLogin("f2d-ve2-panel@test.local", pw(VE2.email));
      ok(p.res.status === 202 && !(p.json.methods as string[]).includes("email_otp"), "panel değişikliğinden sonra doğrulanmamış adrese kod GİTMEZ", p.json);
      await admin.query(`UPDATE public.users SET email = $2 WHERE id = $1`, [VE2.id, VE2.email]);
      ok(await verifyEmailFor(VE2) === false, "MFA zorunlu kullanıcı parolayla oturum açamaz (doğrulama için MFA'lı giriş gerekir)");
      await admin.query(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [VE2.id]);   // test geri yükleme
    }

    section("D) Cihaz iptali ve telefon değişimi");
    {
      const dev = (await admin.query(
        `INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, device_model, state, activated_at)
         VALUES ($1, repeat('A', 120), encode(sha256('old-phone'::bytea), 'hex'), 'OLDP-HONE', 'Eski Pixel', 'active', now()) RETURNING id`, [VE2.id])).rows[0].id as string;
      await expireOpen(VE2.id);
      const l = await webLogin(VE2.email);
      ok((l.json.methods as string[]).includes("qr_device") && !!(l.json.qr as J)?.url, "aktif cihaz → QR yöntemi", l.json);
      const url = new URL(String((l.json.qr as J).url));
      const qrNonce = new URLSearchParams(url.hash.replace(/^#/, "")).get("n") ?? "";
      const chId = String(l.json.challengeId);
      // Telefon (cihaz imzası F2-C route'unda doğrulanır; burada imza sonrası DB adımı).
      const dec = (await admin.query(`SELECT public.auth_qr_decide($1, $2, $3, 'approve', $4) AS r`, [chId, qrNonce, dev, (l.json.qr as J).matchCode])).rows[0].r;
      ok(dec.ok === true && dec.result === "approved", "eski telefon QR onayı", { dec, url: String((l.json.qr as J).url).replace(/n=[^&]+/, "n=…") });
      const c = await complete(chId, l.bind);
      ok(c.res.status === 200, "QR ile giriş");
      const st = await call(meReplace.GET as unknown as Handler, `${L}/api/me/devices/replace`, "GET", undefined, self(VE2.id, c.sid));
      ok(st.json.proofDeviceId === dev && st.json.waiting === null, "bu oturumun kanıt cihazı = eski telefon", st.json);
      const emailSid = await loginEmailOtp(VE2);
      const weak = await call(meReplace.POST as unknown as Handler, `${L}/api/me/devices/replace`, "POST", { oldDeviceId: dev }, self(VE2.id, emailSid));
      ok(weak.res.status === 403 && weak.json.code === "OLD_DEVICE_PROOF_REQUIRED", "e-posta oturumu eski cihaz kanıtı değildir", weak.json);
      const b = await call(meReplace.POST as unknown as Handler, `${L}/api/me/devices/replace`, "POST", { oldDeviceId: dev }, self(VE2.id, c.sid));
      ok(b.res.status === 200, "telefon değişimi başladı", b.json);
      await admin.query(
        `INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, device_model, state)
         VALUES ($1, repeat('B', 120), encode(sha256('new-phone'::bytea), 'hex'), 'NEWP-HONE', 'Yeni Pixel', 'pending_owner')`, [VE2.id]);
      const pend = await call(adminDevices.GET as unknown as Handler, `${L}/api/admin/devices`, "GET", undefined, adminH(U.owner, ownerSid));
      const row = ((pend.json.devices ?? []) as J[]).find((d) => d.user_id === VE2.id);
      ok(pend.res.status === 200 && !!row && (row.replaces as J)?.display_code === "OLDP-HONE", "Owner bekleyen listesinde telefon değişimi görünür", pend.json);
      // Kayıp senaryosu: eski cihaz iptal → onunla açılmış oturum kapanır, bir daha onay veremez.
      const rv = await call(meDevice.DELETE as unknown as Handler, `${L}/api/me/devices/${dev}`, "DELETE", { reason: "Kayıp" }, self(VE2.id, emailSid), { params: Promise.resolve({ id: dev }) });
      ok(rv.res.status === 200 && Number(rv.json.sessionsClosed) >= 1, "cihaz iptali + onunla açılan oturum kapandı", rv.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE session_token = $1 AND is_active`, [c.sid]) === 0, "QR oturumu kapalı");
      await expireOpen(VE2.id);
      const l2 = await webLogin(VE2.email);
      ok(!(l2.json.methods as string[]).includes("qr_device"), "iptal sonrası QR sunulmaz", l2.json);
      const dec2 = (await admin.query(`SELECT public.auth_qr_decide($1, 'x', $2, 'approve', '00') AS r`, [String(l2.json.challengeId), dev])).rows[0].r;
      ok(dec2.ok === false, "iptal edilmiş cihaz onay veremez", dec2);
      await admin.query(`DELETE FROM public.auth_trusted_devices WHERE user_id = $1 AND state = 'pending_owner'`, [VE2.id]);
    }

    section("E) Owner aracılı kurtarma (72 saat)");
    let ticket = "";
    {
      const adm2 = await webLogin(ADM2.email);
      const noOwner = await call(adminCases.GET as unknown as Handler, `${L}/api/admin/recovery-cases`, "GET", undefined, adminH(ADM2.id, adm2.sid));
      ok(noOwner.res.status === 403, "Owner olmayan yönetici talepleri göremez", noOwner.json);
      const plain = await call(adminCases.POST as unknown as Handler, `${L}/api/admin/recovery-cases`, "POST", { email: VE2.email, verificationMethod: "telefon", note: "kayıtlı numaradan arandı" }, adminH(U.owner, ownerPlain.sid));
      if (!MFA_ENDS_PLAIN) ok(plain.res.status === 403, "Owner'ın MFA'sız oturumu talep açamaz", plain.json);
      else {
        // F2-I: zorunluluk açılınca bu oturum KAPATILDI → istek kimliksiz (401); talep AÇILMADI.
        const endRow = (await admin.query(`SELECT is_active, end_reason FROM public.user_sessions WHERE session_token = $1`, [ownerPlain.sid])).rows[0] as J | undefined;
        ok(plain.res.status === 401 && endRow?.is_active === false && endRow?.end_reason === "mfa_enforced",
          "Owner'ın MFA'sız oturumu talep açamaz (F2-I: oturum MFA zorunluluğuyla kapatıldı → 401)", { status: plain.res.status, json: plain.json, endRow });
        ok(await count(`SELECT count(*)::int n FROM public.auth_recovery_cases WHERE user_id = $1`, [VE2.id]) === 0, "kapatılmış MFA'sız oturumla hiçbir talep oluşmadı");
      }
      const outBefore = syntheticOutbox().length;
      const o = await call(adminCases.POST as unknown as Handler, `${L}/api/admin/recovery-cases`, "POST", { email: VE2.email.toUpperCase(), verificationMethod: "telefon", note: "kayıtlı numaradan arandı, kimlik teyit" }, adminH(U.owner, ownerSid));
      ok(o.res.status === 200 && typeof o.json.caseId === "string", "talep açıldı", o.json);
      const cid = String(o.json.caseId);
      ok(!!syntheticOutbox().slice(outBefore).find((m) => m.to === VE2.email && /kurtarma talebi açıldı/i.test(m.subject)), "kullanıcıya bildirim");
      const execCase = (id: string) => call(adminCase.POST as unknown as Handler, `${L}/api/admin/recovery-cases/${id}`, "POST", { action: "execute", identityReconfirmed: true, password: pw(EMAIL.owner) }, adminH(U.owner, ownerSid), { params: Promise.resolve({ id }) });
      let earlyProof = "";
      if (STEP_UP) {
        // F2-G: ek doğrulama olmadan yürütme kapısı 72 saat denetiminden ÖNCE durur — 72 saat kuralını kanıtlamak için
        // geçerli step-up kanıtı alınır; ret yine TOO_EARLY olmalı (step-up 72 saati KISALTMAZ).
        const noProof = await execCase(cid);
        ok(noProof.res.status === 403 && noProof.json.code === "STEP_UP_REQUIRED", "ek doğrulama (step-up) olmadan yürütme yok", noProof.json);
        const su = await ownerStepUp(ownerSid, "recovery_execute", cid);
        earlyProof = su.ch;
        ok(su.ok && await challengeState(su.ch) === "verified", "Owner e-posta step-up kanıtı alındı (talep 1)", su.detail);
      }
      const early = await execCase(cid);
      ok(early.res.status === 409 && early.json.code === "TOO_EARLY", "72 saat dolmadan yürütme yok", early.json);
      if (STEP_UP) {
        ok(typeof early.json.notBefore === "string" && !("ticket" in early.json), "TAM ZİNCİR: geçerli step-up kanıtına rağmen 72 saat dolmadan RED (bilet yok, bekleme zamanı döner)", early.json);
        ok(await count(`SELECT count(*)::int n FROM public.auth_recovery_cases WHERE id = $1 AND state = 'waiting' AND not_before > now() AND not_before >= opened_at + interval '72 hours'`, [cid]) === 1,
          "TAM ZİNCİR: talep beklemede; 72 saat sınırı DB'de değişmedi");
        ok(await challengeState(earlyProof) === "verified", "TAM ZİNCİR: reddedilen yürütme step-up kanıtını TÜKETMEDİ");
      }
      // Kullanıcı (hâlâ erişimi var) kendi talebini iptal eder.
      await expireOpen(VE2.id);
      const v2Sid = await loginEmailOtp(VE2);
      const mine = await call(meRecovery.GET as unknown as Handler, `${L}/api/me/account-recovery`, "GET", undefined, self(VE2.id, v2Sid));
      ok((mine.json.openCase as J)?.id === cid, "kullanıcı açık talebi görür", mine.json);
      const cancel = await call(meRecovery.POST as unknown as Handler, `${L}/api/me/account-recovery`, "POST", { action: "cancel_case", caseId: cid }, self(VE2.id, v2Sid));
      ok(cancel.res.status === 200, "kullanıcı talebi iptal etti", cancel.json);
      // Yeni talep → 72 saat geçmiş say → yürüt.
      const o2 = await call(adminCases.POST as unknown as Handler, `${L}/api/admin/recovery-cases`, "POST", { email: VE2.email, verificationMethod: "yuz_yuze", note: "yüz yüze kimlik kartı görüldü" }, adminH(U.owner, ownerSid));
      const cid2 = String(o2.json.caseId);
      await admin.query(`UPDATE public.auth_recovery_cases SET opened_at = opened_at - interval '73 hours', not_before = not_before - interval '73 hours', expires_at = expires_at - interval '73 hours' WHERE id = $1`, [cid2]);
      await admin.query(`UPDATE public.user_sessions SET created_at = created_at - interval '74 hours' WHERE user_id = $1`, [VE2.id]);
      const noConf = await call(adminCase.POST as unknown as Handler, `${L}/api/admin/recovery-cases/${cid2}`, "POST", { action: "execute", password: pw(EMAIL.owner) }, adminH(U.owner, ownerSid), { params: Promise.resolve({ id: cid2 }) });
      ok(noConf.res.status === 400 && noConf.json.code === "VERIFICATION_REQUIRED", "yeniden kimlik teyidi şart", noConf.json);
      const badPw = await call(adminCase.POST as unknown as Handler, `${L}/api/admin/recovery-cases/${cid2}`, "POST", { action: "execute", identityReconfirmed: true, password: "yanlis" }, adminH(U.owner, ownerSid), { params: Promise.resolve({ id: cid2 }) });
      ok(badPw.res.status === 400 && badPw.json.code === "PASSWORD_WRONG", "Owner parolası şart", badPw.json);
      if (STEP_UP) {
        // F2-G hedef bağlılığı: talep 1'in (hâlâ geçerli) kanıtı talep 2'de GEÇMEZ.
        const cross = await execCase(cid2);
        ok(cross.res.status === 403 && cross.json.code === "STEP_UP_REQUIRED", "talep 1'in step-up kanıtı talep 2'yi yürütemez", cross.json);
        const su2 = await ownerStepUp(ownerSid, "recovery_execute", cid2);
        ok(su2.ok, "Owner e-posta step-up kanıtı alındı (talep 2)", su2.detail);
      }
      const ex = await call(adminCase.POST as unknown as Handler, `${L}/api/admin/recovery-cases/${cid2}`, "POST", { action: "execute", identityReconfirmed: true, password: pw(EMAIL.owner) }, adminH(U.owner, ownerSid), { params: Promise.resolve({ id: cid2 }) });
      ticket = String(ex.json.ticket ?? "");
      secrets.push(ticket);
      ok(ex.res.status === 200 && /^[A-Z2-7]{4}(-[A-Z2-7]{4}){6}$/.test(ticket), "yürütüldü; bilet bir kez döndü", ex.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [VE2.id]) === 0, "kullanıcının bütün oturumları kapandı");
      ok(await count(`SELECT count(*)::int n FROM public.users WHERE id = $1 AND mfa_required AND email_verified_at IS NULL`, [VE2.id]) === 1, "MFA zorunlu kaldı; e-posta doğrulaması düştü");
      const list = await call(adminCases.GET as unknown as Handler, `${L}/api/admin/recovery-cases`, "GET", undefined, adminH(U.owner, ownerSid));
      ok(list.res.status === 200 && !list.text.includes(ticket), "liste bileti içermez");
      // Kullanıcı: parola + bilet.
      await expireOpen(VE2.id);
      const l = await webLogin(VE2.email);
      ok(l.res.status === 202 && JSON.stringify(l.json.methods) === JSON.stringify(["recovery_code"]), "yalnız kurtarma (bilet) yöntemi sunulur", l.json);
      const v = await recover(String(l.json.challengeId), ticket, web(l.bind));
      ok(v.res.status === 200 && v.json.kind === "ticket", "bilet kabul", v.json);
      const c = await complete(String(l.json.challengeId), l.bind);
      ok(c.res.status === 200, "bilet ile giriş");
      const st = await call(meRecovery.GET as unknown as Handler, `${L}/api/me/account-recovery`, "GET", undefined, self(VE2.id, c.sid));
      ok(st.json.sessionRecoveryKind === "case_ticket" && st.json.codesActive === 0, "kurtarma oturumu (bilet); yeni kod oluşturması gerekir", st.json);
      const l3 = await webLogin(VE2.email);
      const reuse = await recover(String(l3.json.challengeId ?? ""), ticket, web(l3.bind));
      ok(reuse.res.status === 401, "bilet tek kullanımlık", reuse.json);
    }

    section("F) Owner çevrimdışı kurtarma kiti");
    {
      const kit = (await admin.query(`SELECT k FROM public.auth_owner_offline_kit_issue() k`)).rows.map((r) => String(r.k));
      secrets.push(...kit);
      ok(kit.length === 5, "SQL konsolu: 5 kod");
      const svc = await admin.query(`SELECT has_function_privilege('service_role', 'public.auth_owner_offline_kit_issue()', 'EXECUTE') AS x`);
      ok(svc.rows[0].x === false, "kit üretimi service_role'e (uygulama) KAPALI");
      if (MFA_ENDS_PLAIN) {
        // F2-I: Owner'ın ilk (MFA'sız) oturumu zorunlulukla kapandı → "diğer oturumlar kapanır" kanıtı için ikinci
        // GEÇERLİ (MFA'lı) oturum açılır; aksi hâlde kapatılacak "diğer" oturum kalmaz ve kontrol anlamsızlaşır.
        ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE session_token = $1 AND is_active`, [ownerPlain.sid]) === 0, "Owner'ın MFA'sız ilk oturumu kapalı (F2-I)");
        ok(!!(await loginEmailOtp({ id: U.owner, email: EMAIL.owner })), "Owner ikinci MFA'lı oturum");
      }
      const openBefore = await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [U.owner]);
      ok(openBefore >= 2, `Owner'ın açık oturumları (${openBefore})`);
      await expireOpen(U.owner);
      const l = await webLogin(EMAIL.owner);
      const v = await recover(String(l.json.challengeId), kit[0], web(l.bind));
      ok(v.res.status === 200 && v.json.kind === "owner_offline", "çevrimdışı kod kabul", v.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [U.owner]) === 0, "Owner'ın diğer bütün oturumları kapandı");
      const c = await complete(String(l.json.challengeId), l.bind);
      ok(c.res.status === 200, "Owner girişi");
      const st = await call(meRecovery.GET as unknown as Handler, `${L}/api/me/account-recovery`, "GET", undefined, self(U.owner, c.sid));
      ok(st.json.isOwner === true && st.json.ownerBootstrapAvailable === true && st.json.ownerOfflineActive === 4, "eşleştirme kodu alınabilir; 4 kod kaldı", st.json);
      const noPw = await call(meRecovery.POST as unknown as Handler, `${L}/api/me/account-recovery`, "POST", { action: "owner_bootstrap" }, self(U.owner, c.sid));
      ok(noPw.res.status === 400, "parola şart");
      const bs = await call(meRecovery.POST as unknown as Handler, `${L}/api/me/account-recovery`, "POST", { action: "owner_bootstrap", password: pw(EMAIL.owner) }, self(U.owner, c.sid));
      const code = String(bs.json.code ?? "");
      secrets.push(code);
      ok(bs.res.status === 200 && /^[A-Z2-7]{4}(-[A-Z2-7]{4}){4}$/.test(code), "yeni telefon için 20 karakter eşleştirme kodu", bs.json);
      const again = await call(meRecovery.POST as unknown as Handler, `${L}/api/me/account-recovery`, "POST", { action: "owner_bootstrap", password: pw(EMAIL.owner) }, self(U.owner, c.sid));
      ok(again.res.status === 403 && again.json.code === "ALREADY_ISSUED", "oturum başına bir kez", again.json);
      const { hashBootstrapCode } = await import("@/lib/auth/deviceSignature");
      const en = (await admin.query(`SELECT public.auth_device_enroll_begin($1, repeat('Q', 120), encode(sha256('owner-new'::bytea), 'hex'), 'OWNR-NEWP', 'Pixel 9', 34, '2.0.0', 'iph', $2, NULL) AS r`,
        [U.owner, hashBootstrapCode(code)])).rows[0].r;
      ok(en.ok === true && en.state === "owner_approved", "F2-C eşleştirmesi bu kodla Owner cihazını onaylı başlatır", en);
      const offlineOther = await loginRecovery(VE, kit[1].replace(/-/g, ""), veEmail);
      ok(offlineOther.v.res.status === 401, "Owner kodu başka hesapta geçmez", offlineOther.v.json);
      const selfDisable = (await admin.query(`SELECT public.auth_mfa_set_required($1, $2, false, 'kapat') AS r`, [c.sid, U.owner])).rows[0].r;
      ok(selfDisable.code === "self_disable_forbidden", "ele geçirilmiş Owner oturumu kendi MFA'sını kapatamaz", selfDisable);
    }

    section("H) F2-F: Owner yüksek riskli işlemleri taze ikinci doğrulama ister");
    {
      // Yeni MFA'lı Owner oturumu (F bölümünde çevrimdışı kod diğerlerini kapattı).
      await expireOpen(U.owner);
      await admin.query(`UPDATE public.auth_recovery_attempts SET created_at = created_at - interval '2 days' WHERE user_id = $1`, [U.owner]);
      const fresh = await loginEmailOtp({ id: U.owner, email: EMAIL.owner });
      ok(!!fresh, "Owner yeni MFA'lı oturum");
      const pendDev = (await admin.query(
        `INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, device_model, state)
         VALUES ($1, repeat('H', 120), encode(sha256('h-phone'::bytea), 'hex'), 'HHHH-PHON', 'Pixel H', 'pending_owner') RETURNING id`, [VE.id])).rows[0].id as string;
      await admin.query(`UPDATE public.user_sessions SET created_at = now() - interval '31 minutes' WHERE session_token = $1`, [fresh]);
      const staleApprove = await call(adminDevice.POST as unknown as Handler, `${L}/api/admin/devices/${pendDev}`, "POST",
        { action: "approve", fingerprintConfirmed: true, verificationMethod: "telefon" }, adminH(U.owner, fresh), { params: Promise.resolve({ id: pendDev }) });
      ok(staleApprove.res.status === 403 && staleApprove.json.code === "fresh_mfa_required" && /yeniden giriş/.test(String(staleApprove.json.error)),
        "30 dk'dan eski Owner oturumu cihaz ONAYLAYAMAZ (Türkçe yönlendirme)", staleApprove.json);
      const staleCase = await call(adminCases.POST as unknown as Handler, `${L}/api/admin/recovery-cases`, "POST",
        { email: veEmail, verificationMethod: "telefon", note: "kayıtlı numaradan arandı" }, adminH(U.owner, fresh));
      ok(staleCase.res.status === 403 && staleCase.json.code === "FRESH_MFA_REQUIRED", "bayat oturum kurtarma talebi AÇAMAZ", staleCase.json);
      const staleReject = await call(adminDevice.POST as unknown as Handler, `${L}/api/admin/devices/${pendDev}`, "POST",
        { action: "reject" }, adminH(U.owner, fresh), { params: Promise.resolve({ id: pendDev }) });
      ok(staleReject.res.status === 200, "RET bayat oturumla da yapılabilir (yalnız yetki azaltır)", staleReject.json);
      const disable = (await admin.query(`SELECT public.auth_mfa_set_required($1, $2, false, 'kapat') AS r`, [fresh, VE.id])).rows[0].r;
      ok(disable.code === "fresh_mfa_required", "bayat oturum başka kullanıcının MFA'sını KAPATAMAZ", disable);
      ok(await count(`SELECT count(*)::int n FROM public.users WHERE id = $1 AND mfa_required`, [VE.id]) === 1, "zorunluluk yerinde");
    }

    section("G) Sızıntı taraması");
    {
      const norm = secrets.filter(Boolean).map((s) => s.replace(/-/g, ""));
      const tables = ["users", "user_sessions", "security_events", "auth_recovery_codes", "auth_recovery_events", "auth_recovery_cases",
        "auth_recovery_attempts", "auth_email_deliveries", "auth_email_otps", "auth_email_change_requests", "auth_mfa_challenges",
        "auth_owner_bootstrap_codes", "auth_trusted_devices", "auth_device_decisions", "admin_notifications"];
      let hits = 0;
      for (const t of tables) {
        const rows = (await admin.query(`SELECT row_to_json(x)::text AS j FROM public.${t} x`)).rows as { j: string }[];
        for (const r of rows) for (const s of norm) if (r.j.toUpperCase().includes(s) || r.j.includes(s.match(/.{1,4}/g)!.join("-"))) hits++;
      }
      ok(norm.length >= 17 && hits === 0, `DB'nin hiçbir tablosunda düz kod / bilet / Owner kodu yok (${norm.length} sır tarandı)`);
      const mailHits = syntheticOutbox().filter((m) => norm.some((s) => (m.text + m.html + m.subject).toUpperCase().replace(/-/g, "").includes(s))).length;
      ok(mailHits === 0, "hiçbir e-postada kurtarma kodu / bilet yok");
    }
  } finally {
    await db.close();
  }
  console.log(`\nf2e-routes harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
