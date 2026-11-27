/**
 * GİRİŞ GÜVENLİĞİ F4 — MFA ATLATMA DENETİMİ (bütün oturum oluşturan yollar). Gerçek route'lar + gerçek PostgreSQL (en güncel F2
 * zinciri) + sentetik e-posta. Production YOK.
 *
 * İki kural kanıtlanır:
 *   (1) Parola doğrulanmadan MFA isteği (challenge) oluşmaz; challenge üzerinden yetkisiz erişim olmaz.
 *   (2) MFA zorunlu hesapta ikinci doğrulama tamamlanmadan TAM YETKİLİ oturum oluşmaz — hiçbir yoldan:
 *       web parola girişi, Android (header) parola girişi, doğrulanmamış / başka tarayıcıya bağlı / başka kullanıcıya ait /
 *       tekrar kullanılan challenge ile tamamlama, doğrudan create_session_v2 / create_session_admin_web / auth_finalize_login
 *       RPC'leri (service_role), oturum sabitleme (önceden yerleştirilmiş çerez), eski (MFA öncesi) oturumun sürmesi.
 * Ayrıca: zorunlu OLMAYAN hesabın normal parola girişi değişmez (regresyon yok); oturum doğru kullanıcıya / tenant'a bağlı.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f4-mfa-atlatma.harness.ts
 */
import Module from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A.240505.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36";

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2n: true });
  const { admin } = db;
  const sink = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "f4-atlatma-")), "eposta.jsonl");
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f4-atlatma", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "f4-atlatma-rate", LOGIN_IP_PEPPER: "f4-atlatma-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: sink, AUTH_OTP_PEPPER: "f4-atlatma-pepper-0123456789abcdefghijklm",
      AUTH_MFA_METHODS: "email_otp", AUTH_MFA_METHOD_SCOPE: "test_accounts",
    });
    for (const k of ["AUTH_EMAIL_SELF_SERVICE_ROLES", "AUTH_MFA_EMAIL_ROLES", "ANDROID_APP_SESSION_TRANSPORT"]) delete process.env[k];
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const profileRoute = await import("@/app/api/auth/profile/route");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 160;
    type H = (r: NextRequest) => Promise<Response>;
    const call = async (h: unknown, url: string, method: string, body: unknown, headers: Record<string, string> = {}) => {
      const res = await (h as H)(new NextRequest(`${ORIGIN}${url}`, { method,
        headers: { "content-type": "application/json", "x-real-ip": `203.0.113.${ip++ % 250}`, "user-agent": WEB_UA, origin: ORIGIN, "sec-fetch-site": "same-origin", ...headers },
        ...(method !== "GET" && body !== null ? { body: JSON.stringify(body) } : {}) }));
      const set = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
      const text = await res.clone().text();
      return { status: res.status, json: (() => { try { return JSON.parse(text) as J; } catch { return {} as J; } })(), text, set };
    };
    const cookieVal = (set: string[], name: string) => (set.find((c) => c.startsWith(`${name}=`)) ?? "").split(";")[0].split("=").slice(1).join("=");
    const mails = () => { try { return fs.readFileSync(sink, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; text?: string }); } catch { return []; } };
    const lastCode = (to: string, after = 0) => /\b([0-9]{6})\b/.exec(mails().slice(after).filter((x) => x.to === to).pop()?.text ?? "")?.[1] ?? "";
    const n = async (sql: string, a: unknown[] = []) => Number((await q(sql, a)).rows[0].n);
    const sessions = (id: string) => n(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [id]);
    const challenges = (id: string) => n(`SELECT count(*)::int n FROM public.auth_mfa_challenges WHERE user_id = $1`, [id]);
    const fresh = async (id: string) => {
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [id]);
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [id]);
    };
    const web = (bind: string, extra: Record<string, string> = {}) => ({ cookie: `__Host-yasam_mfa=${bind}`, ...extra });
    const login = async (email: string, password = pw(email), headers: Record<string, string> = {}) => {
      const r = await call(sessionRoute.POST, "/api/auth/session", "POST", { email, password }, headers);
      return { ...r, bind: cookieVal(r.set, "__Host-yasam_mfa"), sid: cookieVal(r.set, "__Host-yasam_sid") };
    };
    const verifyFor = async (email: string, l: { json: J; bind: string }) => {
      const b = mails().length;
      await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      return call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l.json.challengeId, code: lastCode(email, b) }, web(l.bind));
    };

    // Kurulum: pilot P zorunlu (test listesinde, e-posta doğrulanmış, kurtarma kodu var); O zorunlu değil.
    const P = U.exp, PE = EMAIL.exp, O = U.free, OE = EMAIL.free;
    const preP = await login(PE);
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [P]);
    await q(`INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at) VALUES ($1, 'F4 atlatma', $2, now(), now() + interval '14 days')`, [P, U.owner]);
    await q(`INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash) VALUES ($1, 'user', gen_random_uuid(), $2)`, [P, "b".repeat(64)]);
    await q(`BEGIN; SET LOCAL yasam.mfa_policy = 'on'; UPDATE public.users SET mfa_required = true, mfa_required_at = now() WHERE id = '${P}'; COMMIT;`);
    ok(!!preP.sid, "kurulum: pilot zorunluluktan ÖNCE parolayla oturum açmıştı");

    section("(1) Parola doğrulanmadan challenge YOK");
    {
      const c0 = await challenges(P);
      const bad = await login(PE, "yanlis-parola");
      const unknown = await login("yok-boyle-biri@test.local", "herhangi");
      ok(bad.status === 401 && unknown.status === 401 && !bad.bind && !unknown.bind && !bad.json.challengeId && (await challenges(P)) === c0,
        "yanlış parola / bilinmeyen hesap → 401; challenge OLUŞMADI, bağlama çerezi yok", { b: bad.status, u: unknown.status });
      ok(bad.json.code === unknown.json.code && bad.json.error === unknown.json.error, "yanlış parola ile bilinmeyen hesap AYNI yanıt (hesap keşfi yok)", [bad.json.code, unknown.json.code]);
      const fake = await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: randomUUID() }, web("A".repeat(43)));
      ok(fake.status === 401 && mails().length === 0, "uydurma challenge ile kod İSTENEMEZ (401), ileti yok", fake.status);
    }

    section("(2) MFA zorunlu hesapta ikinci doğrulama olmadan TAM oturum YOK");
    {
      const old = await call(profileRoute.GET, "/api/auth/profile", "GET", null, { "x-user-id": P, cookie: `__Host-yasam_sid=${preP.sid}` });
      ok(old.status === 401, "MFA öncesi açılmış eski oturum zorunlulukla GEÇERSİZ", old.status);
      const s0 = await sessions(P);
      const l = await login(PE);
      ok(l.status === 202 && !l.sid && (await sessions(P)) === s0 && !("sessionToken" in l.json), "web parola girişi → 202; oturum / anahtar YOK", { s: l.status });
      const andr = await login(PE, pw(PE), { "user-agent": ANDROID_UA, "x-requested-with": "com.yasamsistemi.app" });
      ok(andr.status === 202 && !andr.sid && !("sessionToken" in andr.json) && typeof andr.json.mfaBinding === "string" && (await sessions(P)) === s0,
        "Android (header) parola girişi → 202; oturum anahtarı YOK (yalnız challenge bağlaması)", { s: andr.status, keys: Object.keys(andr.json) });
      const c1 = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      ok(c1.status >= 400 && !cookieVal(c1.set, "__Host-yasam_sid") && (await sessions(P)) === s0, "doğrulanmamış challenge ile tamamlama → oturum YOK", c1.status);

      // Başka tarayıcı (bağlama) / başka kullanıcı / tekrar kullanım
      await fresh(P);
      const A = await login(PE);
      const v = await verifyFor(PE, A);
      ok(v.status === 200, "kurulum: tarayıcı A'da e-posta kodu doğrulandı");
      const B = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: A.json.challengeId }, web("B".repeat(43)));
      ok(B.status >= 400 && !cookieVal(B.set, "__Host-yasam_sid"), "doğrulanmış challenge BAŞKA tarayıcı bağlamasıyla tamamlanamaz", B.status);
      const lo = await login(OE);
      ok(lo.status === 200 && !!lo.sid, "zorunlu OLMAYAN uzmanın parola girişi aynen 200 (regresyon yok)");
      const cross = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: A.json.challengeId }, { cookie: `__Host-yasam_mfa=${A.bind}; __Host-yasam_sid=${lo.sid}`, "x-user-id": O });
      const crossSid = cookieVal(cross.set, "__Host-yasam_sid");
      const crossOwner = crossSid ? (await q(`SELECT user_id FROM public.user_sessions WHERE session_token = $1`, [crossSid])).rows[0]?.user_id : null;
      ok(!crossSid || crossOwner === P, "başka kullanıcının oturumu / kimliği eklenince oturum ASLA o kullanıcıya verilmez (yalnız challenge sahibine)", { crossOwner });
      // Oturum sabitleme: saldırganın yerleştirdiği çerez değeri oturum olmaz
      await fresh(P);
      const planted = randomUUID();
      const F = await login(PE, pw(PE), { cookie: `__Host-yasam_sid=${planted}` });
      await verifyFor(PE, F);
      const done = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: F.json.challengeId }, web(F.bind, { cookie: `__Host-yasam_mfa=${F.bind}; __Host-yasam_sid=${planted}` }));
      const newSid = cookieVal(done.set, "__Host-yasam_sid");
      const plantedValid = await n(`SELECT count(*)::int n FROM public.user_sessions WHERE session_token = $1 AND is_active`, [planted]);
      const owner = (await q(`SELECT user_id, mfa_method FROM public.user_sessions WHERE session_token = $1`, [newSid])).rows[0];
      ok(done.status === 200 && !!newSid && newSid !== planted && plantedValid === 0 && owner?.user_id === P && owner?.mfa_method === "email_otp",
        "oturum sabitleme YOK: yeni, sunucunun ürettiği anahtar; yerleştirilen değer geçersiz; oturum pilotun, mfa_method=email_otp", { st: done.status, same: newSid === planted, plantedValid });
      const replay = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: F.json.challengeId }, web(F.bind));
      ok(replay.status >= 400 && !cookieVal(replay.set, "__Host-yasam_sid"), "aynı challenge İKİNCİ kez tamamlanamaz (replay)", replay.status);
    }

    section("(2b) Doğrudan veritabanı yolları (service_role) MFA'yı atlatamaz");
    {
      const sb = createClient(db.shimUrl, "f4-atlatma", { auth: { persistSession: false } }) as SupabaseClient;
      const loc = { p_ip: "203.0.113.9", p_country: null, p_city: null, p_user_agent: WEB_UA, p_platform: "desktop", p_client_channel: "desktop_web", p_replace_token: null, p_expires_at: null };
      const lim = { p_high_risk: false, p_enforce: false, p_expert_idle_seconds: 3600, p_admin_idle_seconds: 3600, p_admin_absolute_seconds: 86400,
        p_expert_stale_seconds: 3600, p_admin_web_cap: 10, p_pending_ttl_seconds: 300 };
      const created = (r: { data: unknown; error: unknown }) => !r.error && ((r.data as J | null)?.inserted === true || typeof (r.data as J | null)?.session_id === "string");
      const why = (r: { data: unknown; error: { message?: string } | null }) => r.error ? `hata: ${String(r.error.message).slice(0, 70)}` : JSON.stringify(r.data).slice(0, 90);
      // POZİTİF KONTROL: aynı imzalar zorunlu OLMAYAN hesaplarda oturum açar → aşağıdaki ret imza hatası DEĞİL, MFA korumasıdır.
      const v2o = await sb.rpc("create_session_v2", { p_user_id: O, p_session_token: randomUUID(), ...loc, ...lim });
      const admo = await sb.rpc("create_session_admin_web", { p_user_id: U.owner, p_session_token: randomUUID(), ...loc });
      ok(created(v2o) && created(admo), "pozitif kontrol: create_session_v2 (uzman) ve create_session_admin_web (Owner) zorunlu OLMAYAN hesapta oturum açar", { v2o: why(v2o), admo: why(admo) });
      // Owner da zorunlu (kit sentetik DB'de hazır) → yönetici yolu da sınanır.
      await q(`BEGIN; SET LOCAL yasam.mfa_policy = 'on'; UPDATE public.users SET mfa_required = true, mfa_required_at = now() WHERE id = '${U.owner}'; COMMIT;`);
      const sP0 = await sessions(P);
      const sO0 = await sessions(U.owner);
      const v2 = await sb.rpc("create_session_v2", { p_user_id: P, p_session_token: randomUUID(), ...loc, ...lim });
      const adm = await sb.rpc("create_session_admin_web", { p_user_id: U.owner, p_session_token: randomUUID(), ...loc });
      const fin = await sb.rpc("auth_finalize_login", { p_challenge_id: randomUUID(), p_browser_secret_hash: "0".repeat(64), p_session_token: randomUUID(), ...loc, ...lim });
      ok(!created(v2) && (await sessions(P)) === sP0, "create_session_v2 ile ZORUNLU uzmana oturum AÇILAMAZ", why(v2));
      ok(!created(adm) && (await sessions(U.owner)) === sO0, "create_session_admin_web ile ZORUNLU Owner'a oturum AÇILAMAZ", why(adm));
      ok(!created(fin), "auth_finalize_login uydurma challenge ile oturum açmaz", why(fin));
      await q(`BEGIN; SET LOCAL yasam.mfa_policy = 'on'; UPDATE public.users SET mfa_required = false, mfa_required_at = NULL WHERE id = '${U.owner}'; COMMIT;`);
    }
  } finally {
    await db.close();
  }
  console.log(`\nf4-mfa-atlatma: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("f4-mfa-atlatma HATA:", e instanceof Error ? e.message : e);
  console.log(`\nf4-mfa-atlatma: ${pass} PASS / ${fail + 1} FAIL`);
  process.exit(1);
});
