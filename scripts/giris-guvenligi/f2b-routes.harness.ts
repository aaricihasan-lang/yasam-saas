/**
 * GİRİŞ GÜVENLİĞİ F2-B — UÇTAN UCA route harness'ı (GERÇEK PostgreSQL + GERÇEK route handler'ları).
 *
 * Production'a SIFIR temas: geçici embedded-postgres (127.0.0.1) + repo migration zinciri (oturum modeli
 * v2 → F2-A → F2-B A/B) + PostgREST uyumlu shim (her istek SET ROLE service_role → GRANT/REVOKE gerçekten
 * sınanır). Sentetik kullanıcılar; gerçek e-posta / ağ YOK.
 *
 * Test-only taklitler (prod kodu DEĞİL; yalnız bu harness'ın veritabanında):
 *   - auth_login_guarded: parola doğrulama (crypt) — throttle ayrıca pg:auth-lockout-dos'ta sınanır.
 *   - trial_activate_on_login: çağrı ZAMANINI kaydeder (deneme yalnız MFA'lı ilk oturumda mı başlıyor?).
 *   - İkinci doğrulama yöntemi YOK (F2-B): challenge, test süper kullanıcısıyla auth_mfa_mark_verified
 *     ile doğrulanmış işaretlenir — hiçbir route bunu yapamaz (service_role'e EXECUTE yok).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2b-routes.harness.ts
 */
import Module from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { NextRequest } from "next/server";
import { startEmbedShim } from "../dogal-destek-p2/beslenme/pgrestEmbedShim";

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

const ROOT = process.cwd();
const FILES = [
  "scripts/final-hardening/fixtures/session-model-fixture.sql",
  "scripts/final-hardening/fixtures/session-f2a-fixture.sql",
  "scripts/final-hardening/fixtures/session-f2b-fixture.sql",
  "supabase/migrations/20270129000200_user_sessions_expiry_touch.sql",
  "supabase/migrations/20271003200000_session_model_v2.sql",
  "supabase/migrations/20271003200100_admin_audit_session_actions.sql",
  "supabase/migrations/20280103000000_auth_session_hardening_f2a.sql",
  "supabase/migrations/20280103000100_auth_mfa_core_f2b.sql",
  "supabase/migrations/20280103000200_auth_session_insert_lock_f2b.sql",
];
const BOOT = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`;

// Test-only DB eki (prod yetkileriyle uyumlu: service_role users/security_events okur-yazar).
const HARNESS_SQL = `
GRANT SELECT, UPDATE ON public.users TO service_role;
GRANT SELECT, INSERT ON public.security_events TO service_role;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_demo_account boolean NOT NULL DEFAULT false;
UPDATE public.users SET password_hash = extensions.crypt('parola-' || split_part(email, '@', 1), extensions.gen_salt('bf', 4));

CREATE FUNCTION public.auth_login_guarded(p_email text, p_password text, p_ip_hash text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('status', 'ok', 'user', jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name,
       'role', u.role, 'status', u.status, 'tenant_id', u.tenant_id, 'active', u.active, 'approval_status', u.approval_status))
       FROM public.users u
      WHERE lower(btrim(u.email)) = lower(btrim(p_email))
        AND u.password_hash = extensions.crypt(p_password, u.password_hash)
      LIMIT 1),
    jsonb_build_object('status', 'invalid'));
$$;
GRANT EXECUTE ON FUNCTION public.auth_login_guarded(text, text, text) TO service_role;

CREATE TABLE public.harness_trial_log (user_id uuid NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION public.trial_activate_on_login(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Gerçek fonksiyon gibi İDEMPOTENT: yalnız ilk çağrı pencereyi "başlatır" (log satırı = başlatma anı).
  IF NOT EXISTS (SELECT 1 FROM public.harness_trial_log WHERE user_id = p_user_id) THEN
    INSERT INTO public.harness_trial_log (user_id) VALUES (p_user_id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'activated', false, 'phase', 'none');
END $$;
GRANT EXECUTE ON FUNCTION public.trial_activate_on_login(uuid) TO service_role;
`;

const U = {
  owner: "00000000-0000-0000-0000-00000000a001",
  adm2: "00000000-0000-0000-0000-00000000a002",
  exp: "00000000-0000-0000-0000-00000000e0f2",
  free: "00000000-0000-0000-0000-00000000e001",
  and1: "00000000-0000-0000-0000-00000000e0b2",
};
const EMAIL = { owner: "admin@test.local", adm2: "admin2@test.local", exp: "f2a-exp@test.local", free: "free@test.local", and1: "f2b-and@test.local" };
const pw = (email: string) => `parola-${email.split("@")[0]}`;

const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const ANDROID_HEADERS = {
  "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
  "x-requested-with": "com.yasamsistemi.app",
};

type J = Record<string, unknown>;
function cookieFrom(res: Response, name: string): { value: string; raw: string } | null {
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const raw of all) {
    if (raw.startsWith(`${name}=`)) return { value: raw.slice(name.length + 1).split(";")[0], raw };
  }
  return null;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f2b-rt-"));
  const port = 57000 + Math.floor(Math.random() * 900);
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const server = new EmbeddedPostgres({
    databaseDir: dir, user: "postgres", password: "pw", port, persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {},
  });
  let shim: { url: string; close: () => Promise<void> } | null = null;
  let pool: pg.Pool | null = null;
  const admin = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  try {
    await server.initialise();
    await server.start();
    await admin.connect();
    await admin.query(BOOT);
    for (const f of FILES) await admin.query(fs.readFileSync(path.join(ROOT, f), "utf8"));
    await admin.query(HARNESS_SQL);
    // Sentetik MFA test hesapları: Owner (kendi), uzman, Android uzmanı. FREE / ADM2 zorunlu DEĞİL.
    // (Test kurulumu: F2-B'de yöntem olmadığından auth_mfa_set_required 'no_method' der — bu pg:session-f2b'de
    //  sınanır. Burada süper kullanıcı politika bayrağıyla doğrudan açar.)
    await admin.query(`SELECT set_config('yasam.mfa_policy', 'on', false)`);
    await admin.query(`UPDATE public.users SET mfa_required = true, mfa_required_at = now() WHERE id = ANY($1::uuid[])`, [[U.owner, U.exp, U.and1]]);
    await admin.query(`SELECT set_config('yasam.mfa_policy', 'off', false)`);

    pool = new pg.Pool({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres", max: 6 });
    shim = await startEmbedShim(pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "f2b-harness-service-key";
    process.env.SESSION_COOKIE_MODE = "primary";
    process.env.RATE_LIMIT_SECRET = "f2b-harness-rate-secret";
    process.env.LOGIN_IP_PEPPER = "f2b-harness-pepper";
    delete process.env.SESSION_EXPIRY_ENFORCE;
    delete process.env.AUTH_MFA_METHODS;

    const sessionRoute = await import("@/app/api/auth/session/route");
    const statusRoute = await import("@/app/api/auth/mfa/status/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");

    let ipSeq = 10;
    const nextIp = () => `198.51.100.${ipSeq++}`;
    const login = async (email: string, extra: Record<string, string> = {}) => {
      const req = new NextRequest("http://localhost/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": nextIp(), "user-agent": WEB_UA, ...extra },
        body: JSON.stringify({ email, password: pw(email) }),
      });
      const res = await sessionRoute.POST(req);
      return { res, json: (await res.clone().json()) as J };
    };
    const status = async (challengeId: string, headers: Record<string, string>) => {
      const res = await statusRoute.GET(new NextRequest(`http://localhost/api/auth/mfa/status?challenge=${challengeId}`, { headers }));
      return { res, json: (await res.clone().json()) as J };
    };
    const complete = async (challengeId: string, headers: Record<string, string>) => {
      const res = await completeRoute.POST(new NextRequest("http://localhost/api/auth/mfa/complete", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": nextIp(), ...headers },
        body: JSON.stringify({ challengeId }),
      }));
      return { res, json: (await res.clone().json()) as J };
    };
    const count = async (sql: string, args: unknown[] = []) => Number((await admin.query(sql, args)).rows[0].n);
    const sessionsOf = (id: string) => count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1`, [id]);
    const trialCalls = (id: string) => count(`SELECT count(*)::int n FROM public.harness_trial_log WHERE user_id = $1`, [id]);
    const verify = async (ch: string, method = "qr_device") =>
      (await admin.query(`SELECT public.auth_mfa_mark_verified($1, $2) AS v`, [ch, method])).rows[0].v === true;

    section("A) MFA zorunlu OLMAYAN hesaplar — mevcut giriş aynen (hazırlıksız kesinti yok)");
    {
      const r = await login(EMAIL.free);
      ok(r.res.status === 200 && (r.json.sessionCookie === true || typeof r.json.sessionToken === "string"), "uzman (MFA'sız) parola girişi 200 + oturum", r.json);
      ok(cookieFrom(r.res, "__Host-yasam_sid") !== null, "web oturum çerezi verildi");
      ok(await sessionsOf(U.free) >= 1, "uzman oturum satırı oluştu");
      ok(await trialCalls(U.free) === 1, "TRIAL7 çağrısı MFA'sız girişte eskisi gibi (oturumdan sonra) yapıldı");
      const a = await login(EMAIL.adm2);
      ok(a.res.status === 200, "admin (MFA'sız) web girişi 200 — doğrudan INSERT kilidi altında RPC ile (D-04)", a.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND session_role = 'admin' AND is_active AND expires_at IS NOT NULL`, [U.adm2]) === 1,
        "admin web oturumu aktif + süreli");
    }

    section("B) MFA zorunlu uzman — parola TEK BAŞINA oturum açmaz");
    let chWeb = "";
    let bindWeb = "";
    {
      const before = await sessionsOf(U.exp);
      const r = await login(EMAIL.exp);
      ok(r.res.status === 202 && r.json.code === "MFA_REQUIRED", "doğru parola → 202 MFA_REQUIRED", r.json);
      ok(!("sessionToken" in r.json) && !("sessionCookie" in r.json) && !("user" in r.json), "yanıtta token / oturum / kullanıcı satırı YOK");
      ok(Array.isArray(r.json.methods) && (r.json.methods as unknown[]).length === 0, "F2-B'de sunulan yöntem yok (methods=[]) — parolaya DÜŞÜLMEZ");
      ok(cookieFrom(r.res, "__Host-yasam_sid") === null, "web oturum çerezi VERİLMEDİ");
      const mc = cookieFrom(r.res, "__Host-yasam_mfa");
      ok(!!mc && /HttpOnly/i.test(mc.raw) && /Secure/i.test(mc.raw) && /SameSite=Strict/i.test(mc.raw) && /Path=\//i.test(mc.raw),
        "bağlama çerezi HttpOnly + Secure + SameSite=Strict + Path=/", mc?.raw);
      ok(!("mfaBinding" in r.json), "web yanıtında bağlama sırrı gövdede YOK (yalnız HttpOnly çerez)");
      ok(await sessionsOf(U.exp) === before, "user_sessions'a satır YAZILMADI");
      ok(await trialCalls(U.exp) === 0, "deneme süresi parola adımında BAŞLAMADI");
      chWeb = String(r.json.challengeId ?? "");
      bindWeb = mc?.value ?? "";
      const dbHash = (await admin.query(`SELECT browser_secret_hash h FROM public.auth_mfa_challenges WHERE id = $1`, [chWeb])).rows[0]?.h;
      ok(typeof dbHash === "string" && dbHash.length === 64 && dbHash !== bindWeb, "DB'de bağlama sırrının yalnız özeti var");
      const upper = await sessionRoute.POST(new NextRequest("http://localhost/api/auth/session", {
        method: "POST", headers: { "content-type": "application/json", "x-real-ip": nextIp(), "user-agent": WEB_UA },
        body: JSON.stringify({ email: ` ${EMAIL.exp.toUpperCase()} `, password: pw(EMAIL.exp) }),
      }));
      ok(upper.status === 202, "e-posta büyük/küçük harf + boşluk paritesi korunur (yine MFA_REQUIRED, oturum yok)");
      const bad = await sessionRoute.POST(new NextRequest("http://localhost/api/auth/session", {
        method: "POST", headers: { "content-type": "application/json", "x-real-ip": nextIp(), "user-agent": WEB_UA },
        body: JSON.stringify({ email: EMAIL.exp, password: "yanlis-parola" }),
      }));
      ok(bad.status === 401, "yanlış parola → 401 (challenge açılmaz)");
    }

    section("C) Challenge durumu yalnız bağlama sahibine");
    {
      const noBind = await status(chWeb, { "user-agent": WEB_UA });
      ok(noBind.json.state === "invalid", "çerez yok → invalid");
      const otherBind = await status(chWeb, { "user-agent": WEB_UA, cookie: `__Host-yasam_mfa=${"A".repeat(43)}` });
      ok(otherBind.json.state === "invalid", "başka tarayıcının bağlaması → invalid");
      const mine = await status(chWeb, { "user-agent": WEB_UA, cookie: `__Host-yasam_mfa=${bindWeb}` });
      ok(mine.json.state === "pending" && !("user_id" in mine.json) && !("userId" in mine.json), "doğru bağlama → pending; kullanıcı kimliği SIZMAZ", mine.json);
    }

    section("D) Tamamlama — doğrulanmadan / CSRF / başka tarayıcı / tekrar");
    {
      const before = await sessionsOf(U.exp);
      const csrf = await complete(chWeb, { "user-agent": WEB_UA, cookie: `__Host-yasam_mfa=${bindWeb}` });
      ok(csrf.res.status === 403, "Origin / Sec-Fetch-Site yok → 403 (CSRF)");
      const early = await complete(chWeb, { "user-agent": WEB_UA, "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bindWeb}` });
      ok(early.res.status === 401 && early.json.code === "MFA_NOT_VERIFIED", "doğrulanmamış challenge → 401 MFA_NOT_VERIFIED", early.json);
      ok(await verify(chWeb), "(test) challenge ikinci yöntemle doğrulanmış işaretlendi");
      const thief = await complete(chWeb, { "user-agent": WEB_UA, "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${"B".repeat(43)}` });
      ok(thief.res.status === 401 && thief.json.code === "MFA_INVALID", "QR/challenge kimliğini kopyalayan başka tarayıcı → 401 MFA_INVALID", thief.json);
      const noCookie = await complete(chWeb, { "user-agent": WEB_UA, "sec-fetch-site": "same-origin" });
      ok(noCookie.res.status === 401, "bağlama çerezi olmadan → 401");
      ok(await sessionsOf(U.exp) === before && await trialCalls(U.exp) === 0, "reddedilen tamamlamalar oturum / deneme başlatmadı");

      const done = await complete(chWeb, { "user-agent": WEB_UA, "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bindWeb}` });
      ok(done.res.status === 200 && (done.json.user as J | undefined)?.id === U.exp, "doğru tarayıcı + doğrulanmış challenge → 200 + kullanıcı satırı", done.json);
      ok(done.json.sessionCookie === true || typeof done.json.sessionToken === "string", "oturum taşıma login ile aynı sözleşme");
      const sid = cookieFrom(done.res, "__Host-yasam_sid");
      ok(!!sid && /HttpOnly/i.test(sid.raw), "web oturum çerezi verildi (HttpOnly)");
      const cleared = cookieFrom(done.res, "__Host-yasam_mfa");
      ok(!!cleared && /Max-Age=0/i.test(cleared.raw), "bağlama çerezi temizlendi");
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active AND mfa_method = 'qr_device' AND mfa_challenge_id = $2`, [U.exp, chWeb]) === 1,
        "oturumda MFA kanıtı (yöntem + challenge)");
      ok(await trialCalls(U.exp) === 1, "deneme süresi İLK MFA'lı oturumda (tam 1 kez) başlatıldı");

      const again = await complete(chWeb, { "user-agent": WEB_UA, "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bindWeb}` });
      ok(again.res.status === 401 && again.json.code === "MFA_CONSUMED", "aynı challenge ikinci kez → 401 MFA_CONSUMED", again.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [U.exp]) === 1, "tekrar kullanım yeni oturum açmadı");
      ok(await trialCalls(U.exp) === 1, "tekrar kullanım denemeyi yeniden tetiklemedi");

      // Yeni oturum mevcut doğrulama yolundan geçer (modül guard'ları aynı token'ı kullanır).
      const v = await sessionRoute.GET(new NextRequest("http://localhost/api/auth/session", { headers: { "user-agent": WEB_UA, cookie: `__Host-yasam_sid=${sid?.value ?? ""}` } }));
      ok((await v.json() as J).valid === true, "MFA'lı oturum GET /api/auth/session ile geçerli");
    }

    section("E) Süresi dolmuş challenge");
    {
      const r = await login(EMAIL.exp);
      const ch = String(r.json.challengeId ?? "");
      const bind = cookieFrom(r.res, "__Host-yasam_mfa")?.value ?? "";
      await verify(ch);
      await admin.query(`UPDATE public.auth_mfa_challenges SET created_at = now() - interval '10 minutes', expires_at = now() - interval '1 second' WHERE id = $1`, [ch]);
      const c = await complete(ch, { "user-agent": WEB_UA, "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bind}` });
      ok(c.res.status === 401 && c.json.code === "MFA_EXPIRED", "süresi dolmuş challenge → 401 MFA_EXPIRED", c.json);
    }

    section("F) Resmî Android — bağlama gövde + başlık; çerez yok");
    {
      const r = await login(EMAIL.and1, ANDROID_HEADERS);
      ok(r.res.status === 202 && typeof r.json.mfaBinding === "string", "Android: 202 + bağlama sırrı gövdede", r.json);
      ok(cookieFrom(r.res, "__Host-yasam_mfa") === null, "Android: bağlama çerezi YOK (sunucu Android'de çerez kullanmaz)");
      const ch = String(r.json.challengeId ?? "");
      await verify(ch);
      const wrong = await complete(ch, { ...ANDROID_HEADERS, "x-yasam-mfa-binding": "C".repeat(43) });
      ok(wrong.res.status === 401, "Android: yanlış bağlama başlığı → 401");
      const c = await complete(ch, { ...ANDROID_HEADERS, "x-yasam-mfa-binding": String(r.json.mfaBinding) });
      ok(c.res.status === 200 && typeof c.json.sessionToken === "string" && !c.json.sessionCookie, "Android: 200 + token gövdede (mevcut sözleşme)", c.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND client_channel = 'android_app' AND expires_at IS NOT NULL AND mfa_method IS NOT NULL`, [U.and1]) === 1,
        "Android MFA oturumu: android_app + süreli (F2-A) + kanıtlı");
    }

    section("G) Owner (admin) — MFA'lı web girişi");
    {
      const r = await login(EMAIL.owner);
      ok(r.res.status === 202 && r.json.code === "MFA_REQUIRED", "Owner doğru parola → 202 MFA_REQUIRED");
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1`, [U.owner]) === 0, "Owner için oturum satırı yok");
      const ch = String(r.json.challengeId ?? "");
      const bind = cookieFrom(r.res, "__Host-yasam_mfa")?.value ?? "";
      await verify(ch);
      const c = await complete(ch, { "user-agent": WEB_UA, "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bind}` });
      ok(c.res.status === 200 && (c.json.user as J | undefined)?.role === "admin", "Owner tamamlama → 200 admin", c.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND session_role = 'admin' AND is_active AND mfa_method = 'qr_device'`, [U.owner]) === 1,
        "Owner oturumu admin + kanıtlı");
    }

    section("H) Statik sözleşmeler");
    {
      const src = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
      const sec = src("lib/auth/sessionSecurity.ts");
      ok(!/from\("user_sessions"\)\s*\.insert\(/.test(sec), "sessionSecurity: user_sessions'a doğrudan INSERT YOK (D-04)");
      ok(/create_session_admin_web/.test(sec) && /auth_finalize_login/.test(sec), "sessionSecurity: admin web RPC + finalize RPC");
      const appCode = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))].filter((f) => /\.(ts|tsx)$/.test(f));
      const markers = appCode.filter((f) => /rpc\(\s*["'`]auth_mfa_mark_verified/.test(fs.readFileSync(f, "utf8")));
      ok(markers.length === 0, "uygulama kodu challenge'ı doğrulanmış işaretleyemez (auth_mfa_mark_verified RPC çağrısı yok)", markers);
      const inserts = appCode.filter((f) => /from\(["']user_sessions["']\)\s*\.insert/.test(fs.readFileSync(f, "utf8")));
      ok(inserts.length === 0, "app/ + lib/ içinde user_sessions doğrudan INSERT yok", inserts);
    }
  } finally {
    await admin.end().catch(() => {});
    await shim?.close().catch(() => {});
    await pool?.end().catch(() => {});
    await server.stop().catch(() => {});
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM: geçici klasör kalabilir */ }
  }
  console.log(`\nf2b routes harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
  process.exit(0);   // açık keep-alive bağlantıları süreci canlı tutmasın
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
