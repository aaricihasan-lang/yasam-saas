/**
 * GİRİŞ GÜVENLİĞİ F2-J — Android yönetici oturumu taklidi ve kriptografik cihaz kanıtı: GERÇEK route'lar + GERÇEK
 * PostgreSQL ile uçtan uca. Production'a SIFIR temas; sentetik kullanıcılar; sentetik e-posta sağlayıcısı;
 * "telefon" = testte üretilen P-256 anahtarı (Android Keystore'un test temsili; fiziksel cihaz DEĞİL).
 *
 * Tehdit modeli: saldırgan Owner parolası + bir MFA onayını (ör. gerçek zamanlı oltalama vekili) ele geçirdi ve girişi
 * curl ile, Android uygulamasını TAKLİT eden başlıklarla yapıyor. Telefon (güvenilir cihaz anahtarı) saldırganda YOK.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2j-routes.harness.ts
 *   F2J_WITHOUT_FIX=1 → 001000 uygulanmaz: taklit edilen oturumun uzun yaşadığı yeniden üretilir (beklenen: FAIL).
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
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
type J = Record<string, unknown>;
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
/** Taklit: resmi uygulamanın WebView başlıkları (iki sinyal birden — resolveClientChannel 'android_app' der). */
const SPOOF = {
  "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36",
  "x-requested-with": "com.yasamsistemi.app",
};
const WITHOUT_FIX = process.env.F2J_WITHOUT_FIX === "1";

async function main() {
  const { startF2cDb, U, EMAIL, newPhone, signWith } = await import("./testDb");
  const db = await startF2cDb(WITHOUT_FIX ? { withF2i: true } : { withF2j: true });
  const { admin } = db;
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f2j-harness", SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "f2j-rate", LOGIN_IP_PEPPER: "f2j-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all", AUTH_MFA_EMAIL_ROLES: "expert,admin",
      EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1", AUTH_OTP_PEPPER: "f2j-harness-pepper-0123456789abcdefghijklmnop",
    });
    const { syntheticOutbox } = await import("@/lib/email/syntheticProvider");
    const { sessionBindMessage } = await import("@/lib/auth/deviceSignature");
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    let bindBegin: { POST: unknown } | null = null;
    let bindRoute: { POST: unknown } | null = null;
    if (!WITHOUT_FIX) {
      bindBegin = await import("@/app/api/auth/session/device-bind/begin/route");
      bindRoute = await import("@/app/api/auth/session/device-bind/route");
    }
    let ip = 10;
    type Handler = (r: NextRequest, ctx?: unknown) => Promise<Response>;
    const call = async (h: unknown, url: string, method: "GET" | "POST", body: unknown, headers: Record<string, string> = {}) => {
      const res = await (h as Handler)(new NextRequest(url, { method,
        headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${ip++ % 250}`, "user-agent": WEB_UA, ...headers },
        ...(method !== "GET" ? { body: JSON.stringify(body) } : {}) }));
      return { res, json: (await res.clone().json().catch(() => ({}))) as J };
    };
    const L = "http://localhost";
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    const lastCode = (to: string) => /^([0-9]{6}) — /.exec([...syntheticOutbox()].reverse().find((m) => m.to === to)?.subject ?? "")?.[1] ?? "";

    // Kurulum: Owner MFA zorunlu, doğrulanmış e-posta, gerçek P-256 anahtarlı etkin telefon.
    await q(`UPDATE public.users SET email_verified_at = now() - interval '1 day' WHERE id = $1`, [U.owner]);
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id = '${U.owner}'; SELECT set_config('yasam.mfa_policy','off',false);`);
    const phone = newPhone();
    phone.deviceId = (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
      VALUES ($1, $2, encode(sha256(convert_to($2::text, 'UTF8')),'hex'), 'JJJJ-OOOO', 'active', now()) RETURNING id`, [U.owner, phone.spki])).rows[0].id as string;

    /** Android başlıklarıyla (taklit) parola + e-posta kodu girişi → gövdedeki oturum anahtarı. */
    const androidLogin = async (headers: Record<string, string> = SPOOF, completeHeaders: Record<string, string> = SPOOF) => {
      const l = await call(sessionRoute.POST, `${L}/api/auth/session`, "POST", { email: EMAIL.owner, password: `parola-${EMAIL.owner.split("@")[0]}` }, headers);
      const ch = String(l.json.challengeId);
      const bind = String(l.json.mfaBinding ?? "");
      const bh: Record<string, string> = bind ? { "x-yasam-mfa-binding": bind } : {};
      await call(sendRoute.POST, `${L}/api/auth/mfa/email/send`, "POST", { challengeId: ch }, { ...headers, ...bh });
      await call(verifyRoute.POST, `${L}/api/auth/mfa/email/verify`, "POST", { challengeId: ch, code: lastCode(EMAIL.owner) }, { ...headers, ...bh });
      const c = await call(completeRoute.POST, `${L}/api/auth/mfa/complete`, "POST", { challengeId: ch }, { ...completeHeaders, ...bh });
      return { status: c.res.status, token: String(c.json.sessionToken ?? ""), json: c.json, login: l };
    };
    const valid = async (token: string) =>
      (await call(sessionRoute.GET, `${L}/api/auth/session`, "GET", null, { ...SPOOF, "x-session-token": token })).json.valid === true;
    const age = (token: string, created: string, last: string) =>
      q(`UPDATE public.user_sessions SET created_at = now() - $2::interval, last_seen_at = now() - $3::interval WHERE session_token = $1`, [token, created, last]);
    const channelOf = async (token: string) => (await q(`SELECT client_channel FROM public.user_sessions WHERE session_token = $1`, [token])).rows[0]?.client_channel;

    // ══ A1: taklit edilmiş Android girişi, cihaz kanıtı YOK ══
    const a = await androidLogin();
    ok(a.status === 200 && a.token.length > 0, "kurulum: taklit Android başlıklarıyla MFA'lı giriş (gövdede anahtar)", { status: a.status, j: a.json });
    ok((await channelOf(a.token)) === "android_app", "kurulum: oturum kanalı android_app (başlıklar kanıt değil — sınırlar kanıta bağlı olmalı)");
    await age(a.token, "1 hour", "3 hours");
    const v3h = await valid(a.token);
    ok(!v3h, "A1a kanıtsız Android yönetici oturumu 3 saat boşta → GEÇERSİZ (web: 2 saat)", { valid: v3h });
    // Yalıtım: yöneticinin tek etkin mobil oturumu kuralı (ADMIN_MOBILE_ACTIVE) A1b ölçümünü etkilemesin.
    await q(`UPDATE public.user_sessions SET is_active = false, ended_at = now(), end_reason = 'logout' WHERE session_token = $1 AND is_active`, [a.token]);
    const b = await androidLogin();
    ok(b.status === 200 && b.token.length > 0 && (await channelOf(b.token)) === "android_app", "kurulum: ikinci taklit Android girişi", { status: b.status, j: b.json });
    await age(b.token, "25 hours", "5 minutes");
    const v25 = await valid(b.token);
    ok(!v25, "A1b kanıtsız Android yönetici oturumu 25 saat → GEÇERSİZ (web: 24 saat)", { valid: v25 });

    if (!WITHOUT_FIX && bindBegin && bindRoute) {
      // ══ A2: saldırgan cihaz kanıtı üretemez ══
      const c = await androidLogin();
      const bg = await call(bindBegin.POST, `${L}/api/auth/session/device-bind/begin`, "POST", {}, { ...SPOOF, "x-session-token": c.token });
      ok(bg.res.status === 200 && bg.json.required === true && typeof bg.json.nonce === "string", "A2a kanıt nonce'u alındı (oturum sahibi isteyebilir)", bg.json);
      const attacker = newPhone();
      const ts = () => Math.floor(Date.now() / 1000);
      const forged = await call(bindRoute.POST, `${L}/api/auth/session/device-bind`, "POST", {
        deviceId: phone.deviceId, sessionId: bg.json.sessionId, nonce: bg.json.nonce, ts: ts(),
        signature: signWith(attacker, sessionBindMessage(phone.deviceId!, String(bg.json.nonce), String(bg.json.sessionId), ts())),
      });
      ok(forged.res.status === 400 && forged.json.code === "BAD_SIGNATURE", "A2b Owner'ın cihaz kimliğiyle saldırgan anahtarı → BAD_SIGNATURE", forged.json);
      await age(c.token, "1 hour", "3 hours");
      ok(!(await valid(c.token)), "A2c sahte kanıt denemesinden sonra oturum hâlâ web sınırlarında (3 sa boşta → geçersiz)");

      // ══ A3: meşru telefon kanıtı → Android sınırları ══
      const d = await androidLogin();
      const bg2 = await call(bindBegin.POST, `${L}/api/auth/session/device-bind/begin`, "POST", {}, { ...SPOOF, "x-session-token": d.token });
      const t2 = ts();
      const msg = sessionBindMessage(phone.deviceId!, String(bg2.json.nonce), String(bg2.json.sessionId), t2);
      const good = await call(bindRoute.POST, `${L}/api/auth/session/device-bind`, "POST", {
        deviceId: phone.deviceId, sessionId: bg2.json.sessionId, nonce: bg2.json.nonce, ts: t2, signature: signWith(phone, msg),
      });
      ok(good.res.status === 200 && good.json.ok === true, "A3a gerçek cihaz anahtarıyla oturum bağlandı", good.json);
      const replay = await call(bindRoute.POST, `${L}/api/auth/session/device-bind`, "POST", {
        deviceId: phone.deviceId, sessionId: bg2.json.sessionId, nonce: bg2.json.nonce, ts: t2, signature: signWith(phone, msg),
      });
      ok(replay.res.status === 401, "A3b aynı kanıt (nonce) ikinci kez → reddedildi", replay.json);
      await age(d.token, "2 days", "3 hours");
      ok(await valid(d.token), "A3c cihaza bağlı yönetici oturumu 2 gün / 3 saat boşta → GEÇERLİ (kanıt taze)");
      // Kanıt bayatlayınca (25 sa) oturum kullanılamaz ama yeniden kanıtla döner; token çalan telefon olmadan dönemez.
      await q(`SELECT set_config('yasam.session_bind','on',false)`);
      await q(`UPDATE public.user_sessions SET device_proof_at = now() - interval '25 hours' WHERE session_token = $1`, [d.token]);
      await q(`SELECT set_config('yasam.session_bind','off',false)`);
      ok(!(await valid(d.token)), "A3d kanıt 25 saatlik → oturum kullanılamaz (çalınan anahtarın değeri ≤ 24 saat)");
      const bg3 = await call(bindBegin.POST, `${L}/api/auth/session/device-bind/begin`, "POST", {}, { ...SPOOF, "x-session-token": d.token });
      const t3 = ts();
      const re = await call(bindRoute.POST, `${L}/api/auth/session/device-bind`, "POST", {
        deviceId: phone.deviceId, sessionId: bg3.json.sessionId, nonce: bg3.json.nonce, ts: t3,
        signature: signWith(phone, sessionBindMessage(phone.deviceId!, String(bg3.json.nonce), String(bg3.json.sessionId), t3)),
      });
      ok(re.res.status === 200 && (await valid(d.token)), "A3e telefonla yeniden kanıt → oturum yeniden geçerli", re.json);
      // Eski zaman damgası.
      const bg4 = await call(bindBegin.POST, `${L}/api/auth/session/device-bind/begin`, "POST", {}, { ...SPOOF, "x-session-token": d.token });
      const old = ts() - 600;
      const st = await call(bindRoute.POST, `${L}/api/auth/session/device-bind`, "POST", {
        deviceId: phone.deviceId, sessionId: bg4.json.sessionId, nonce: bg4.json.nonce, ts: old,
        signature: signWith(phone, sessionBindMessage(phone.deviceId!, String(bg4.json.nonce), String(bg4.json.sessionId), old)),
      });
      ok(st.res.status === 400 && st.json.code === "BAD_TIMESTAMP", "A3f 10 dk eski imza → BAD_TIMESTAMP", st.json);
      // Cihaz iptal → oturum biter.
      await q(`UPDATE public.auth_trusted_devices SET state = 'revoked', revoked_at = now() WHERE id = $1`, [phone.deviceId]);
      ok(!(await valid(d.token)), "A3g bağlı cihaz iptal edilince oturum hemen geçersiz");
      const ended = (await q(`SELECT is_active, end_reason FROM public.user_sessions WHERE session_token = $1`, [d.token])).rows[0];
      ok(ended.is_active === false && ended.end_reason === "device_revoked", "A3h oturum 'device_revoked' ile sonlandı", ended);
      await q(`UPDATE public.auth_trusted_devices SET state = 'active', revoked_at = NULL WHERE id = $1`, [phone.deviceId]);

      // ══ A4: kanal tamamlama adımında değiştirilemez (web'de başlayan giriş Android başlıklarıyla bitirilemez) ══
      const l = await call(sessionRoute.POST, `${L}/api/auth/session`, "POST", { email: EMAIL.owner, password: `parola-${EMAIL.owner.split("@")[0]}` }, { "sec-fetch-site": "same-origin" });
      const setc = (l.res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      const bindCookie = (setc.find((x) => x.startsWith("__Host-yasam_mfa=")) ?? "").split(";")[0].split("=").slice(1).join("=");
      const chw = String(l.json.challengeId);
      const webH = { "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bindCookie}` };
      await call(sendRoute.POST, `${L}/api/auth/mfa/email/send`, "POST", { challengeId: chw }, webH);
      await call(verifyRoute.POST, `${L}/api/auth/mfa/email/verify`, "POST", { challengeId: chw, code: lastCode(EMAIL.owner) }, webH);
      const sw = await call(completeRoute.POST, `${L}/api/auth/mfa/complete`, "POST", { challengeId: chw }, { ...SPOOF, "x-yasam-mfa-binding": bindCookie });
      const swTok = String(sw.json.sessionToken ?? "");
      const swCh = swTok ? await channelOf(swTok) : null;
      ok(swCh !== "android_app", "A4a web'de başlayan giriş Android başlıklarıyla tamamlanınca android_app oturumu AÇILMAZ", { status: sw.res.status, swCh });
      const leg = await call(completeRoute.POST, `${L}/api/auth/mfa/complete`, "POST", { challengeId: chw }, webH);
      ok(leg.res.status === 200 && (await channelOf(String(leg.json.sessionToken ?? ""))) !== "android_app" || leg.json.sessionCookie === true,
        "A4b aynı challenge kendi (web) kanalıyla meşru tamamlanır", { status: leg.res.status, j: leg.json });
    }
  } finally {
    await db.close();
  }
  console.log(`\nf2j-routes${WITHOUT_FIX ? " (DÜZELTMESİZ)" : ""}: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
