/**
 * GİRİŞ GÜVENLİĞİ F2-D — UÇTAN UCA e-posta OTP harness'ı (GERÇEK PostgreSQL + GERÇEK route'lar + gerçek
 * HMAC/pepper). Production'a SIFIR temas; sentetik kullanıcılar. E-posta sağlayıcısı SENTETİK (bellek
 * içi outbox) — GERÇEK GMAIL GÖNDERİMİ DEĞİLDİR. Hata enjeksiyonu: EMAIL_SYNTHETIC_FAIL.
 *
 * Akış: e-posta doğrulama (Ayarlar uçları) → Owner zorunluluk açar → parola → 202 (yalnız email_otp) →
 * kod gönder / yanlış / paralel doğru / tamamla → sağlayıcı hatası + OAuth hatası + kota (MFA atlanmaz,
 * Owner uyarısı) → 5 yanlış kilit → süre dolumu → challenge bağlaması → Android kanalı → Owner durum/test.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2d-routes.harness.ts
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
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID_HEADERS = {
  "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
  "x-requested-with": "com.yasamsistemi.app",
};
const PEPPER = "f2d-harness-pepper-0123456789abcdefghijklmnop";
function cookieFrom(res: Response, name: string): string {
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const raw of all) if (raw.startsWith(`${name}=`)) return raw.slice(name.length + 1).split(";")[0];
  return "";
}

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2d: true });
  const { admin } = db;
  const VE = { id: "00000000-0000-0000-0000-00000000e0d1", email: "f2d-ve@test.local" };
  const VE2 = { id: "00000000-0000-0000-0000-00000000e0d2", email: "f2d-ve2@test.local" };
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl,
      SUPABASE_SERVICE_ROLE_KEY: "f2d-harness-service-key",
      SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "f2d-harness-rate-secret",
      LOGIN_IP_PEPPER: "f2d-harness-ip-pepper",
      REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      AUTH_MFA_METHODS: "qr_device,email_otp",
      AUTH_MFA_METHOD_SCOPE: "all",
      AUTH_MFA_EMAIL_ROLES: "expert",
      EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1",
      AUTH_OTP_PEPPER: PEPPER,
    });
    delete process.env.SESSION_EXPIRY_ENFORCE;
    delete process.env.EMAIL_SYNTHETIC_FAIL;
    delete process.env.EMAIL_DAILY_LIMIT;

    const { syntheticOutbox } = await import("@/lib/email/syntheticProvider");
    const sessionRoute = await import("@/app/api/auth/session/route");
    const statusRoute = await import("@/app/api/auth/mfa/status/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const meEmailRoute = await import("@/app/api/me/email-verification/route");
    const adminEmailRoute = await import("@/app/api/admin/email-status/route");

    let ipSeq = 10;
    const nextIp = () => `198.51.100.${ipSeq++ % 250}`;
    type Handler = (r: NextRequest) => Promise<Response>;
    const call = async (handler: Handler, url: string, method: "GET" | "POST", body: unknown, headers: Record<string, string> = {}) => {
      const res = await handler(new NextRequest(url, {
        method, headers: { "content-type": "application/json", "x-real-ip": nextIp(), "user-agent": WEB_UA, ...headers },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
      }));
      return { res, json: (await res.clone().json().catch(() => ({}))) as J };
    };
    const L = "http://localhost";
    const count = async (sql: string, args: unknown[] = []) => Number((await admin.query(sql, args)).rows[0].n);
    const lastCode = (to: string): string => {
      const m = [...syntheticOutbox()].reverse().find((x) => x.to === to);
      return /^([0-9]{6}) — /.exec(m?.subject ?? "")?.[1] ?? "";
    };
    const age = (userId: string, secs = 61) =>
      admin.query(`UPDATE public.auth_email_otps SET created_at = created_at - make_interval(secs => $2), expires_at = expires_at - make_interval(secs => $2) WHERE user_id = $1`, [userId, secs]);
    // Kullanıcı başına ≤5 açık giriş isteği (F2-B kuralı): bölümler arasında zaman geçişini taklit et.
    const expireOpen = (userId: string) =>
      admin.query(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending', 'verified')`, [userId]);
    const webLogin = async (email: string, ua = WEB_UA, extra: Record<string, string> = {}) => {
      const r = await call(sessionRoute.POST, `${L}/api/auth/session`, "POST", { email, password: pw(email) }, { "user-agent": ua, ...extra });
      return { ...r, bind: cookieFrom(r.res, "__Host-yasam_mfa"), sid: cookieFrom(r.res, "__Host-yasam_sid") };
    };
    const web = (bind: string, ua = WEB_UA) => ({ "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bind}`, "user-agent": ua });
    const send = (ch: string, h: Record<string, string>) => call(sendRoute.POST, `${L}/api/auth/mfa/email/send`, "POST", { challengeId: ch }, h);
    const verify = (ch: string, code: string, h: Record<string, string>) => call(verifyRoute.POST, `${L}/api/auth/mfa/email/verify`, "POST", { challengeId: ch, code }, h);
    const complete = (ch: string, h: Record<string, string>) => call(completeRoute.POST, `${L}/api/auth/mfa/complete`, "POST", { challengeId: ch }, h);
    const self = (userId: string, sid: string) => ({ "x-user-id": userId, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" });
    const adminH = (adminId: string, sid: string) => ({ "x-admin-id": adminId, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" });
    const codesSeen: string[] = [];

    // ═══════════════════════════════════════════════════════════════════════
    section("A) Ayarlar → e-posta doğrulama (kutu sahipliği)");
    let ownerSid = "";
    {
      const o = await webLogin(EMAIL.owner);
      ownerSid = o.sid;
      ok(o.res.status === 200 && !!ownerSid, "Owner normal web girişi (MFA zorunlu değil)");
      const pre = (await admin.query(`SELECT public.auth_mfa_set_required($1, $2, true, 'erken') AS r`, [ownerSid, VE.id])).rows[0].r;
      ok(pre.code === "no_method", "doğrulanmamış e-postalı hesap zorunlu YAPILAMAZ", pre);
      const l = await webLogin(VE.email);
      ok(l.res.status === 200 && !!l.sid, "VE (MFA zorunlu değil) normal giriş");
      const g = await call(meEmailRoute.GET, `${L}/api/me/email-verification`, "GET", null, self(VE.id, l.sid));
      ok(g.res.status === 200 && g.json.verified === false && g.json.available === true && g.json.email === "f***@t***.local",
        "durum: doğrulanmadı + yöntem kullanılabilir + maskeli adres", g.json);
      const other = await call(meEmailRoute.POST, `${L}/api/me/email-verification`, "POST", { action: "send" }, self(VE2.id, l.sid));
      ok(other.res.status === 403, "başka kullanıcının kimliğiyle istek reddedilir (token ↔ x-user-id)");
      const s = await call(meEmailRoute.POST, `${L}/api/me/email-verification`, "POST", { action: "send" }, self(VE.id, l.sid));
      const code = lastCode(VE.email);
      codesSeen.push(code);
      ok(s.res.status === 200 && s.json.sent === true && /^[0-9]{6}$/.test(code), "kod gönderildi (sentetik outbox)", s.json);
      const mail = syntheticOutbox()[syntheticOutbox().length - 1];
      ok(/Yaşam Sistemi/.test(mail.subject) && /kimseyle paylaşmayın/i.test(mail.text) && !/https?:\/\//.test(mail.text) && /3 dakika/.test(mail.text),
        "Türkçe şablon: konu + paylaşmayın uyarısı + 3 dk + bağlantı YOK");
      const again = await call(meEmailRoute.POST, `${L}/api/me/email-verification`, "POST", { action: "send" }, self(VE.id, l.sid));
      ok(again.res.status === 429 && again.json.code === "COOLDOWN", "60 sn içinde yeni kod istenemez", again.json);
      const wrong = await call(meEmailRoute.POST, `${L}/api/me/email-verification`, "POST", { action: "confirm", code: code === "000000" ? "111111" : "000000" }, self(VE.id, l.sid));
      ok(wrong.res.status === 400 && wrong.json.code === "OTP_WRONG" && /Kalan deneme: 4/.test(String(wrong.json.error)), "yanlış kod → kalan hak", wrong.json);
      const right = await call(meEmailRoute.POST, `${L}/api/me/email-verification`, "POST", { action: "confirm", code }, self(VE.id, l.sid));
      ok(right.res.status === 200 && right.json.verified === true, "doğru kod → e-posta doğrulandı", right.json);
      ok(await count(`SELECT count(*)::int n FROM public.users WHERE id = $1 AND email_verified_at IS NOT NULL`, [VE.id]) === 1, "DB: email_verified_at yazıldı");
      ok(await count(`SELECT count(*)::int n FROM public.users WHERE id <> $1 AND email_verified_at IS NOT NULL`, [VE.id]) === 0, "başka hesap etkilenmedi");
      await admin.query(`UPDATE public.users SET is_demo_account = true WHERE id = $1`, [VE2.id]);
      const l2 = await webLogin(VE2.email);
      const demo = await call(meEmailRoute.POST, `${L}/api/me/email-verification`, "POST", { action: "send" }, self(VE2.id, l2.sid));
      ok(demo.res.status === 403, "demo hesabında e-posta doğrulama KAPALI", demo.json);
      await admin.query(`UPDATE public.users SET is_demo_account = false WHERE id = $1`, [VE2.id]);
      const req = (await admin.query(`SELECT public.auth_mfa_set_required($1, $2, true, 'e-posta testi') AS r`, [ownerSid, VE.id])).rows[0].r;
      ok(req.ok === true, "Owner VE'nin MFA zorunluluğunu açar (doğrulanmış e-posta = yöntem)", req);
    }

    section("B) Giriş: parola → 202 (yalnız e-posta) → kod → yanlış → PARALEL doğru → tamamla");
    {
      const sessionsBefore = await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1`, [VE.id]);
      const l = await webLogin(VE.email);
      const ch = String(l.json.challengeId ?? "");
      ok(l.res.status === 202 && JSON.stringify(l.json.methods) === JSON.stringify(["email_otp"]) && !("qr" in l.json) && l.json.emailHint === "f***@t***.local",
        "202 MFA_REQUIRED, yöntem yalnız email_otp (cihaz yok → QR yok), maskeli adres", l.json);
      ok(!JSON.stringify(l.json).includes(VE.email), "yanıtta tam adres YOK");
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1`, [VE.id]) === sessionsBefore, "parola tek başına oturum açmadı");
      const noBind = await send(ch, { "sec-fetch-site": "same-origin" });
      ok(noBind.res.status === 401, "bağlama çerezi olmadan kod istenemez");
      const cross = await send(ch, { ...web(l.bind), "sec-fetch-site": "cross-site" });
      ok(cross.res.status === 403, "başka siteden istek reddedilir");
      const s = await send(ch, web(l.bind));
      const code = lastCode(VE.email);
      codesSeen.push(code);
      ok(s.res.status === 200 && s.json.sent === true && typeof s.json.expiresAt === "string", "kod gönderildi", s.json);
      const cd = await send(ch, web(l.bind));
      ok(cd.res.status === 429 && Number(cd.json.retryAfter) > 0 && cd.res.headers.get("retry-after") !== null, "hemen yeniden gönderim → 429 + Retry-After", cd.json);
      const early = await complete(ch, web(l.bind));
      ok(early.res.status !== 200, "kod doğrulanmadan tamamlama YOK", early.json);
      const w = await verify(ch, code === "000000" ? "111111" : "000000", web(l.bind));
      ok(w.res.status === 401 && w.json.code === "OTP_WRONG" && w.json.attemptsLeft === 4, "yanlış kod → 401 + 4 hak", w.json);
      const bad = await verify(ch, "12ab", web(l.bind));
      ok(bad.res.status === 401 && bad.json.code === "OTP_WRONG", "biçim dışı kod → yanlış sayılır (DB'ye gitmez)", bad.json);
      const par = await Promise.all(Array.from({ length: 6 }, () => verify(ch, code, web(l.bind))));
      const wins = par.filter((p) => p.res.status === 200 && p.json.result === "verified").length;
      ok(wins === 1, `aynı kod 6 paralel istekte YALNIZ BİR kez geçer (geçen: ${wins})`, par.map((p) => p.json.code ?? p.json.result));
      const st = await call(statusRoute.GET, `${L}/api/auth/mfa/status?challenge=${ch}`, "GET", null, web(l.bind));
      ok(st.json.state === "verified", "challenge durumu verified");
      const thief = await complete(ch, web("Z".repeat(43)));
      ok(thief.res.status !== 200, "başka tarayıcı (yanlış bağlama) tamamlayamaz");
      const c = await complete(ch, web(l.bind));
      const sid = cookieFrom(c.res, "__Host-yasam_sid");
      ok(c.res.status === 200 && !!sid, "tamamla → oturum (HttpOnly çerez)", c.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE session_token = $1 AND user_id = $2 AND mfa_method = 'email_otp'`, [sid, VE.id]) === 1,
        "oturum mfa_method=email_otp");
      const twice = await complete(ch, web(l.bind));
      ok(twice.res.status !== 200, "aynı challenge ikinci oturum açamaz");
      ok(await count(`SELECT count(*)::int n FROM public.harness_trial_log WHERE user_id = $1`, [VE.id]) === 1, "deneme kaydı tek (ilk başarılı giriş)");
    }

    section("C) Sağlayıcı / OAuth hatası: MFA ATLANMAZ, Owner uyarısı");
    {
      const l = await webLogin(VE.email);
      const ch = String(l.json.challengeId);
      await age(VE.id);
      process.env.EMAIL_SYNTHETIC_FAIL = "provider_down";
      const before = syntheticOutbox().length;
      const s = await send(ch, web(l.bind));
      ok(s.res.status === 503 && s.json.code === "SEND_FAILED" && /QR/.test(String(s.json.error)), "sağlayıcı kapalı → 503 + başka yönteme yönlendirme", s.json);
      ok(syntheticOutbox().length === before, "ileti gönderilmedi");
      ok(await count(`SELECT count(*)::int n FROM public.auth_email_otps WHERE challenge_id = $1 AND state = 'failed'`, [ch]) === 1, "kod 'failed' (doğrulanamaz)");
      for (const guess of ["000000", "123456", "999999"]) {
        const v = await verify(ch, guess, web(l.bind));
        if (v.res.status === 200) ok(false, "gönderilemeyen kodla doğrulama OLMAMALI", v.json);
      }
      ok((await verify(ch, "000000", web(l.bind))).json.code === "OTP_NONE", "gönderilemeyen kod hiçbir tahminle doğrulanmaz (OTP_NONE)");
      ok((await complete(ch, web(l.bind))).res.status !== 200, "e-posta hatası oturum AÇMAZ");
      ok(await count(`SELECT count(*)::int n FROM public.admin_notifications WHERE type = 'eposta_uyari' AND target_user_id = $1 AND resolved_at IS NULL AND payload->>'reason' = 'provider_down'`, [U.owner]) === 1,
        "Owner Bildirim Zili: eposta_uyari (provider_down)");
      await age(VE.id);
      process.env.EMAIL_SYNTHETIC_FAIL = "oauth_invalid_grant";
      const s2 = await send(ch, web(l.bind));
      ok(s2.res.status === 503, "OAuth yetkisi geçersiz → 503", s2.json);
      ok(await count(`SELECT count(*)::int n FROM public.admin_notifications WHERE type = 'eposta_uyari' AND resolved_at IS NULL`) === 1, "aynı anda tek açık e-posta uyarısı");
      delete process.env.EMAIL_SYNTHETIC_FAIL;
      await age(VE.id);
      const s3 = await send(ch, web(l.bind));
      const code = lastCode(VE.email);
      codesSeen.push(code);
      ok(s3.res.status === 200, "sağlayıcı düzelince aynı challenge için 3. kod gönderilir");
      await age(VE.id);
      const s4 = await send(ch, web(l.bind));
      ok(s4.res.status === 429 && s4.json.code === "TOO_MANY", "challenge başına en fazla 3 kod", s4.json);
      const v = await verify(ch, code, web(l.bind));
      ok(v.res.status === 200, "geçerli son kod doğrulanır");
    }

    section("D) Kota: sınır dolunca gönderim YOK, MFA atlanmaz, Owner uyarısı");
    {
      await expireOpen(VE.id);
      const ack = await call(adminEmailRoute.POST, `${L}/api/admin/email-status`, "POST", { action: "ack" }, adminH(U.owner, ownerSid));
      ok(ack.res.status === 200 && Number(ack.json.closed) === 1, "Owner açık uyarıyı kapatır", ack.json);
      const used = await count(`SELECT count(*)::int n FROM public.auth_email_deliveries WHERE created_at > now() - interval '24 hours' AND state IN ('reserved','sent')`);
      process.env.EMAIL_DAILY_LIMIT = String(used);
      const l = await webLogin(VE.email);
      await age(VE.id, 3700);
      const s = await send(String(l.json.challengeId), web(l.bind));
      ok(s.res.status === 503 && s.json.code === "QUOTA_EXHAUSTED", "kota dolu → 503 QUOTA_EXHAUSTED", s.json);
      ok(await count(`SELECT count(*)::int n FROM public.admin_notifications WHERE type = 'eposta_uyari' AND resolved_at IS NULL AND payload->>'reason' = 'kota_doldu' AND target_user_id = $1`, [U.owner]) === 1,
        "Owner uyarısı: kota_doldu");
      ok((await complete(String(l.json.challengeId), web(l.bind))).res.status !== 200, "kota doluyken oturum yok");
      delete process.env.EMAIL_DAILY_LIMIT;
    }

    section("E) 5 yanlış → kilit + giriş isteği kalıcı red");
    {
      await expireOpen(VE.id);
      await age(VE.id, 3700);
      const l = await webLogin(VE.email);
      const ch = String(l.json.challengeId);
      await send(ch, web(l.bind));
      const code = lastCode(VE.email);
      codesSeen.push(code);
      const wrong = code === "000000" ? "111111" : "000000";
      let last: J = {};
      for (let i = 0; i < 5; i++) last = (await verify(ch, wrong, web(l.bind))).json;
      ok(last.code === "OTP_LOCKED", "5. yanlış → OTP_LOCKED", last);
      const after = await verify(ch, code, web(l.bind));
      ok(after.res.status === 401 && after.json.code === "MFA_INVALID", "kilitten sonra doğru kod da geçmez", after.json);
      const st = await call(statusRoute.GET, `${L}/api/auth/mfa/status?challenge=${ch}`, "GET", null, web(l.bind));
      ok(st.json.state === "denied", "challenge denied");
      ok((await complete(ch, web(l.bind))).res.status !== 200, "kilitli istek oturum açmaz");
      ok(await count(`SELECT count(*)::int n FROM public.security_events WHERE user_id = $1 AND event_type = 'mfa_email_otp_locked'`, [VE.id]) === 1, "güvenlik olayı kaydı");
    }

    section("F) Süre dolumu + challenge bağlaması + yalıtım");
    {
      await expireOpen(VE.id);
      await age(VE.id, 3700);
      const a = await webLogin(VE.email);
      const b = await webLogin(VE.email);
      const chA = String(a.json.challengeId);
      const chB = String(b.json.challengeId);
      await send(chA, web(a.bind));
      const codeA = lastCode(VE.email);
      codesSeen.push(codeA);
      const cross = await verify(chB, codeA, web(b.bind));
      ok(cross.res.status === 401 && cross.json.code === "OTP_NONE", "A isteğinin kodu B isteğinde geçersiz", cross.json);
      const wrongBind = await verify(chA, codeA, web(b.bind));
      ok(wrongBind.res.status === 401 && wrongBind.json.code === "MFA_INVALID", "A isteği B tarayıcısından doğrulanamaz", wrongBind.json);
      await admin.query(`UPDATE public.auth_email_otps SET created_at = now() - interval '5 minutes', expires_at = now() - interval '1 second' WHERE challenge_id = $1`, [chA]);
      const exp = await verify(chA, codeA, web(a.bind));
      ok(exp.res.status === 401 && exp.json.code === "OTP_EXPIRED", "süresi dolan kod → OTP_EXPIRED", exp.json);
      const l2 = await webLogin(VE2.email);
      ok(l2.res.status === 200, "doğrulanmamış + zorunlu olmayan VE2 etkilenmez (normal giriş)");
    }

    section("G) Android uygulama kanalı + iPhone Safari (e-posta yeterli, uygulama gerekmez)");
    {
      await expireOpen(VE.id);
      await age(VE.id, 3700);
      const l = await webLogin(VE.email, ANDROID_HEADERS["user-agent"], ANDROID_HEADERS);
      const ch = String(l.json.challengeId);
      const bind = String(l.json.mfaBinding ?? "");
      ok(l.res.status === 202 && bind.length > 20, "Android: 202 + bağlama sırrı gövdede", l.json);
      const ah = { ...ANDROID_HEADERS, "x-yasam-mfa-binding": bind };
      ok((await send(ch, ah)).res.status === 200, "Android: kod gönder");
      const code = lastCode(VE.email);
      codesSeen.push(code);
      ok((await verify(ch, code, { ...ANDROID_HEADERS, "x-yasam-mfa-binding": "C".repeat(43) })).res.status === 401, "Android: yanlış bağlama reddedilir");
      ok((await verify(ch, code, ah)).res.status === 200, "Android: doğrula");
      const c = await complete(ch, ah);
      ok(c.res.status === 200 && typeof c.json.sessionToken === "string", "Android: oturum (gövdede token)", Object.keys(c.json));
      await age(VE.id, 3700);
      const i = await webLogin(VE.email, IPHONE_UA);
      const chI = String(i.json.challengeId);
      ok(i.res.status === 202 && (i.json.methods as string[]).includes("email_otp"), "iPhone Safari: e-posta yöntemi sunulur");
      await send(chI, web(i.bind, IPHONE_UA));
      const codeI = lastCode(VE.email);
      codesSeen.push(codeI);
      ok((await verify(chI, codeI, web(i.bind, IPHONE_UA))).res.status === 200, "iPhone Safari: doğrula");
      const ci = await complete(chI, web(i.bind, IPHONE_UA));
      ok(ci.res.status === 200 && !!cookieFrom(ci.res, "__Host-yasam_sid"), "iPhone Safari: oturum");
    }

    section("H) Yöntem bayrakları: kapalı yöntem sunulmaz, zorunlu hesap parolaya DÜŞMEZ");
    {
      await expireOpen(VE.id);
      await age(VE.id, 3700);
      process.env.AUTH_MFA_METHODS = "qr_device";
      const l = await webLogin(VE.email);
      ok(l.res.status === 202 && Array.isArray(l.json.methods) && (l.json.methods as string[]).length === 0 && !l.sid, "e-posta kapalı + cihaz yok → yöntem yok, oturum YOK", l.json);
      const s = await send(String(l.json.challengeId), web(l.bind));
      ok(s.res.status === 403 && s.json.code === "METHOD_UNAVAILABLE", "kapalı yönteme kod gönderilmez", s.json);
      process.env.AUTH_MFA_METHODS = "qr_device,email_otp";
      process.env.AUTH_MFA_EMAIL_ROLES = "admin";
      await expireOpen(VE.id);
      const l2 = await webLogin(VE.email);
      ok(l2.res.status === 202 && (l2.json.methods as string[]).length === 0, "rol izni yok (uzman) → e-posta sunulmaz", l2.json);
      process.env.AUTH_MFA_EMAIL_ROLES = "expert";
      const saved = process.env.AUTH_OTP_PEPPER;
      process.env.AUTH_OTP_PEPPER = "kisa";
      await expireOpen(VE.id);
      const l3 = await webLogin(VE.email);
      ok(l3.res.status === 202 && (l3.json.methods as string[]).length === 0, "pepper yetersiz (<32) → e-posta yöntemi KAPALI", l3.json);
      process.env.AUTH_OTP_PEPPER = saved;
    }

    section("H2) Açık istek sınırı mesajı + migration öncesi geri düşüş (MFA atlanmaz)");
    {
      await expireOpen(VE.id);
      for (let i = 0; i < 5; i++) await webLogin(VE.email);
      const sixth = await webLogin(VE.email);
      ok(sixth.res.status === 429 && sixth.json.code === "MFA_TOO_MANY_OPEN" && !/başarısız/i.test(String(sixth.json.error)) && /doğrulama isteği/.test(String(sixth.json.error)) && !sixth.sid,
        "6. açık istek: 429 MFA_TOO_MANY_OPEN, 'başarısız giriş' DENMEZ, oturum yok", sixth.json);
      await expireOpen(VE.id);
      // 000400'ün yöntem fonksiyonu yokmuş gibi (yalnız yerel test DB'si): erişimi geçici kaldır.
      await admin.query(`REVOKE EXECUTE ON FUNCTION public.auth_mfa_user_methods(uuid) FROM service_role`);
      try {
        const l = await webLogin(VE.email);
        const methods = (l.json.methods ?? []) as string[];
        ok(l.res.status === 202 && !methods.includes("email_otp") && !l.sid, "geri düşüş: 202, e-posta SUNULMAZ, parola tek başına oturum AÇMAZ", l.json);
        const s2 = await send(String(l.json.challengeId), web(l.bind));
        ok(s2.res.status === 403 && s2.json.code === "METHOD_UNAVAILABLE", "geri düşüşte e-posta kodu gönderilmez", s2.json);
        ok((await complete(String(l.json.challengeId), web(l.bind))).res.status !== 200, "geri düşüşte doğrulamasız tamamlama YOK");
      } finally {
        await admin.query(`GRANT EXECUTE ON FUNCTION public.auth_mfa_user_methods(uuid) TO service_role`);
      }
    }

    section("I) Owner e-posta durumu + test iletisi");
    {
      const exp = await webLogin(VE2.email);
      const denied = await call(adminEmailRoute.GET, `${L}/api/admin/email-status`, "GET", null, adminH(VE2.id, exp.sid));
      ok(denied.res.status === 401 || denied.res.status === 403, "uzman e-posta durumunu GÖREMEZ", denied.json);
      const st = await call(adminEmailRoute.GET, `${L}/api/admin/email-status`, "GET", null, adminH(U.owner, ownerSid));
      const body = JSON.stringify(st.json);
      ok(st.res.status === 200 && st.json.configured === true && st.json.provider === "synthetic" && st.json.pepperConfigured === true,
        "Owner: yapılandırma durumu (gizli değer YOK)", st.json);
      ok(!body.includes("@") && !body.includes(PEPPER) && !codesSeen.some((c) => c && body.includes(`"${c}"`)), "durum yanıtında adres / pepper / kod YOK");
      ok(((st.json.last24h ?? {}) as J).failed !== undefined && (st.json.lastFailure as J | null)?.code !== undefined, "son 24 saat + son hata kodu", st.json);
      const t = await call(adminEmailRoute.POST, `${L}/api/admin/email-status`, "POST", { action: "test" }, adminH(U.owner, ownerSid));
      const m = syntheticOutbox()[syntheticOutbox().length - 1];
      ok(t.res.status === 200 && m.to === EMAIL.owner && m.category === "owner_test" && !/[0-9]{6}/.test(m.subject), "Owner test iletisi kendi adresine (kod içermez)", t.json);
      for (let i = 0; i < 4; i++) await call(adminEmailRoute.POST, `${L}/api/admin/email-status`, "POST", { action: "test" }, adminH(U.owner, ownerSid));
      const lim = await call(adminEmailRoute.POST, `${L}/api/admin/email-status`, "POST", { action: "test" }, adminH(U.owner, ownerSid));
      ok(lim.res.status === 429, "saatte en fazla 5 test iletisi", lim.json);
    }

    section("J) DB'de düz kod / adres YOK");
    {
      const dump = JSON.stringify((await admin.query(`SELECT * FROM public.auth_email_otps`)).rows) + JSON.stringify((await admin.query(`SELECT * FROM public.auth_email_deliveries`)).rows)
        + JSON.stringify((await admin.query(`SELECT payload FROM public.admin_notifications`)).rows);
      // Ayrı bir değer olarak (özet / zaman damgası içindeki rastgele rakam dizileri hariç).
      const leaked = codesSeen.filter((c) => c && new RegExp(`(^|[^0-9a-f.])${c}([^0-9a-f]|$)`).test(dump));
      ok(codesSeen.length >= 7 && leaked.length === 0, `gönderilen ${codesSeen.length} kodun hiçbiri DB'de düz metin değil`, leaked);
      ok(!dump.includes("@test.local"), "gönderim kayıtlarında e-posta adresi yok (yalnız özet)");
    }
  } finally {
    await db.close();
  }
  console.log(`\nf2d-routes harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
  // Açık kalan keep-alive bağlantıları olay döngüsünü canlı tutabiliyor → başarıda da açıkça çık.
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
