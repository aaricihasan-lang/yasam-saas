/**
 * GİRİŞ GÜVENLİĞİ F2-C — UÇTAN UCA QR + güvenilir cihaz harness'ı (GERÇEK PostgreSQL + GERÇEK route'lar +
 * GERÇEK ECDSA P-256 imzaları). Production'a SIFIR temas; sentetik kullanıcılar.
 *
 * "Telefon" = Node'da üretilen P-256 anahtarı (Android Keystore'un yerine; aynı SPKI/DER/SHA256withECDSA
 * sözleşmesi — docs/giris-guvenligi/f2c-qr-protokol.md). Gerçek cihaz testi DEĞİLDİR.
 *
 * Akış: Owner bootstrap (SQL) → Owner telefonu aktivasyon → Owner MFA zorunlu → Owner QR girişi →
 * uzman telefonu eşleştirme isteği (zil) → Owner onayı (MFA'lı oturum) → uzman aktivasyonu →
 * uzman QR girişi + saldırılar (başka uzmanın telefonu, sahte imza, kopyalanan QR, tekrar, ret, iptal).
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2c-routes.harness.ts
 */
import Module from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from "node:crypto";
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
  "scripts/final-hardening/fixtures/session-f2c-fixture.sql",
  "supabase/migrations/20270129000200_user_sessions_expiry_touch.sql",
  "supabase/migrations/20271003200000_session_model_v2.sql",
  "supabase/migrations/20271003200100_admin_audit_session_actions.sql",
  "supabase/migrations/20280103000000_auth_session_hardening_f2a.sql",
  "supabase/migrations/20280103000100_auth_mfa_core_f2b.sql",
  "supabase/migrations/20280103000200_auth_session_insert_lock_f2b.sql",
  "supabase/migrations/20280103000300_auth_trusted_devices_qr_f2c.sql",
];
const BOOT = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`;

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
       FROM public.users u WHERE lower(btrim(u.email)) = lower(btrim(p_email))
        AND u.password_hash = extensions.crypt(p_password, u.password_hash) LIMIT 1),
    jsonb_build_object('status', 'invalid'));
$$;
GRANT EXECUTE ON FUNCTION public.auth_login_guarded(text, text, text) TO service_role;
CREATE TABLE public.harness_trial_log (user_id uuid NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION public.trial_activate_on_login(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.harness_trial_log WHERE user_id = p_user_id) THEN
    INSERT INTO public.harness_trial_log (user_id) VALUES (p_user_id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'activated', false, 'phase', 'none');
END $$;
GRANT EXECUTE ON FUNCTION public.trial_activate_on_login(uuid) TO service_role;
`;

const U = {
  owner: "00000000-0000-0000-0000-00000000a001",
  exp: "00000000-0000-0000-0000-00000000e0f2",
  and1: "00000000-0000-0000-0000-00000000e0b2",
  free: "00000000-0000-0000-0000-00000000e001",
};
const EMAIL = { owner: "admin@test.local", exp: "f2a-exp@test.local", and1: "f2b-and@test.local", free: "free@test.local" };
const pw = (email: string) => `parola-${email.split("@")[0]}`;
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const EDGE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0";

type J = Record<string, unknown>;
type Phone = { priv: KeyObject; spki: string; deviceId?: string };
const nowTs = () => Math.floor(Date.now() / 1000);
function newPhone(): Phone {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return { priv: privateKey, spki: (publicKey.export({ type: "spki", format: "der" }) as Buffer).toString("base64") };
}
const signWith = (p: Phone, msg: string) => cryptoSign("sha256", Buffer.from(msg, "utf8"), { key: p.priv, dsaEncoding: "der" }).toString("base64");
function cookieFrom(res: Response, name: string): { value: string; raw: string } | null {
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const raw of all) if (raw.startsWith(`${name}=`)) return { value: raw.slice(name.length + 1).split(";")[0], raw };
  return null;
}
function parseQr(url: string): { c: string; n: string } | null {
  const m = /^https:\/\/www\.yasamsistemi\.com\/m\/onay#c=([0-9a-f-]{36})&n=([A-Za-z0-9_-]{32})$/.exec(url);
  return m ? { c: m[1], n: m[2] } : null;
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "f2c-rt-"));
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

    pool = new pg.Pool({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres", max: 6 });
    shim = await startEmbedShim(pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "f2c-harness-service-key";
    process.env.SESSION_COOKIE_MODE = "primary";
    process.env.RATE_LIMIT_SECRET = "f2c-harness-rate-secret";
    process.env.LOGIN_IP_PEPPER = "f2c-harness-pepper";
    process.env.REQUIRE_DB_SUPER_ADMIN_MARKER = "true";
    process.env.AUTH_MFA_METHODS = "qr_device";
    process.env.AUTH_MFA_METHOD_SCOPE = "all";
    delete process.env.SESSION_EXPIRY_ENFORCE;

    const { displayCodeForSpki, enrollMessage, activateMessage, qrFetchMessage, qrDecideMessage } = await import("@/lib/auth/deviceSignature");
    const sessionRoute = await import("@/app/api/auth/session/route");
    const statusRoute = await import("@/app/api/auth/mfa/status/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const enrollRoute = await import("@/app/api/devices/enroll/route");
    const devStatusRoute = await import("@/app/api/devices/status/route");
    const activateRoute = await import("@/app/api/devices/activate/route");
    const qrFetchRoute = await import("@/app/api/auth/mfa/qr/fetch/route");
    const qrDecideRoute = await import("@/app/api/auth/mfa/qr/decide/route");
    const adminDevicesRoute = await import("@/app/api/admin/devices/route");
    const adminDeviceRoute = await import("@/app/api/admin/devices/[id]/route");
    const meDevicesRoute = await import("@/app/api/me/devices/route");
    const meDeviceRoute = await import("@/app/api/me/devices/[id]/route");

    let ipSeq = 10;
    const nextIp = () => `198.51.100.${ipSeq++}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- route handler'ları farklı bağlam imzaları taşır
    type Handler = (r: NextRequest, c: any) => Promise<Response>;
    const post = async (handler: Handler, url: string, body: unknown, headers: Record<string, string> = {}, ctx?: unknown) => {
      const res = await handler(new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", "x-real-ip": nextIp(), ...headers }, body: JSON.stringify(body) }), ctx);
      return { res, json: (await res.clone().json()) as J };
    };
    const get = async (handler: Handler, url: string, headers: Record<string, string> = {}) => {
      const res = await handler(new NextRequest(url, { headers: { "x-real-ip": nextIp(), ...headers } }), undefined);
      return { res, json: (await res.clone().json()) as J };
    };
    const count = async (sql: string, args: unknown[] = []) => Number((await admin.query(sql, args)).rows[0].n);
    const L = "http://localhost";

    const webLogin = async (email: string, ua = WEB_UA) => {
      const r = await post(sessionRoute.POST, `${L}/api/auth/session`, { email, password: pw(email) }, { "user-agent": ua });
      return { ...r, bind: cookieFrom(r.res, "__Host-yasam_mfa")?.value ?? "", sid: cookieFrom(r.res, "__Host-yasam_sid")?.value ?? "" };
    };
    const enroll = (p: Phone, email: string, extra: J = {}) => {
      const ts = nowTs();
      const code = displayCodeForSpki(Buffer.from(p.spki, "base64"));
      return post(enrollRoute.POST, `${L}/api/devices/enroll`, {
        email, password: pw(email), publicKey: p.spki, model: "Pixel 8", androidApi: 34, appVersion: "2.0.0", ts,
        signature: signWith(p, enrollMessage(email.toLowerCase(), code, ts)), ...extra,
      });
    };
    const activate = async (p: Phone) => {
      const st = await get(devStatusRoute.GET, `${L}/api/devices/status?deviceId=${p.deviceId}`);
      const nonce = String(st.json.activationNonce ?? "");
      const ts = nowTs();
      return post(activateRoute.POST, `${L}/api/devices/activate`, { deviceId: p.deviceId, nonce, ts, signature: signWith(p, activateMessage(p.deviceId!, nonce, ts)) });
    };
    const qrFetch = (p: Phone, c: string, n: string, signer: Phone = p) => {
      const ts = nowTs();
      return post(qrFetchRoute.POST, `${L}/api/auth/mfa/qr/fetch`, { challengeId: c, qrNonce: n, deviceId: p.deviceId, ts, signature: signWith(signer, qrFetchMessage(c, n, p.deviceId!, ts)) });
    };
    const qrDecide = (p: Phone, c: string, n: string, decision: "approve" | "deny", matchCode: string, signer: Phone = p) => {
      const ts = nowTs();
      return post(qrDecideRoute.POST, `${L}/api/auth/mfa/qr/decide`, { challengeId: c, qrNonce: n, deviceId: p.deviceId, decision, matchCode, ts, signature: signWith(signer, qrDecideMessage(c, n, p.deviceId!, decision, matchCode, ts)) });
    };
    const complete = (c: string, bind: string, ua = WEB_UA) =>
      post(completeRoute.POST, `${L}/api/auth/mfa/complete`, { challengeId: c }, { "user-agent": ua, "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bind}` });
    const adminHeaders = (adminId: string, sid: string) => ({ "x-admin-id": adminId, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin", "user-agent": WEB_UA });

    // ═══════════════════════════════════════════════════════════════════════
    section("A) Owner İLK cihaz — SQL konsolu bootstrap (panelden kendi onayı YOK)");
    const ownerPhone = newPhone();
    let ownerPlainSid = "";
    {
      const plain = await webLogin(EMAIL.owner);
      ok(plain.res.status === 200 && !!plain.sid, "Owner (henüz MFA zorunlu değil) normal web girişi");
      ownerPlainSid = plain.sid;
      const panel = await get(adminDevicesRoute.GET, `${L}/api/admin/devices`, adminHeaders(U.owner, ownerPlainSid));
      ok(panel.res.status === 403, "MFA'sız Owner oturumu cihaz onay listesini GÖREMEZ (önce kendi cihazı)");
      const boot = String((await admin.query(`SELECT public.auth_owner_bootstrap_issue() AS c`)).rows[0].c);
      const badBoot = await enroll(ownerPhone, EMAIL.owner, { bootstrapCode: "AAAAAAAAAAAAAAAAAAAA" });
      ok(badBoot.res.status === 400 && badBoot.json.code === "BOOTSTRAP_INVALID", "yanlış bootstrap kodu reddedilir", badBoot.json);
      const e = await enroll(ownerPhone, EMAIL.owner, { bootstrapCode: boot.toLowerCase().replace(/(.{5})/g, "$1-") });
      ok(e.res.status === 200 && e.json.state === "owner_approved", "bootstrap kodu (küçük harf + tireli girilse de) → owner_approved", e.json);
      ownerPhone.deviceId = String(e.json.deviceId);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [U.owner]) === 1, "bootstrap oturum AÇMAZ");
      const forged = { ...newPhone(), deviceId: ownerPhone.deviceId };
      const st = await get(devStatusRoute.GET, `${L}/api/devices/status?deviceId=${ownerPhone.deviceId}`);
      const ts = nowTs();
      const bad = await post(activateRoute.POST, `${L}/api/devices/activate`, { deviceId: ownerPhone.deviceId, nonce: st.json.activationNonce, ts, signature: signWith(forged, activateMessage(ownerPhone.deviceId!, String(st.json.activationNonce), ts)) });
      ok(bad.res.status === 400 && bad.json.code === "BAD_SIGNATURE", "başka anahtarla aktivasyon imzası reddedilir", bad.json);
      const a = await activate(ownerPhone);
      ok(a.res.status === 200 && a.json.state === "active", "Owner telefonu KENDİ imzasıyla aktif", a.json);
      const r = (await admin.query(`SELECT public.auth_mfa_set_required($1, $2, true, 'Owner kendi MFA') AS r`, [ownerPlainSid, U.owner])).rows[0].r;
      ok(r.ok === true, "Owner (cihazı aktif) kendi MFA zorunluluğunu açar", r);
    }

    section("B) Owner QR girişi (Chrome) → MFA'lı Owner oturumu");
    let ownerMfaSid = "";
    {
      const l = await webLogin(EMAIL.owner);
      const qr = (l.json.qr ?? {}) as J;
      const parsed = parseQr(String(qr.url ?? ""));
      ok(l.res.status === 202 && Array.isArray(l.json.methods) && (l.json.methods as string[]).includes("qr_device") && !!parsed && /^[0-9]{2}$/.test(String(qr.matchCode)),
        "202 MFA_REQUIRED + QR (App Link URL) + 2 haneli eşleştirme kodu", l.json);
      ok(parsed?.c === l.json.challengeId, "QR challenge kimliği yanıttaki ile aynı");
      const f = await qrFetch(ownerPhone, parsed!.c, parsed!.n);
      ok(f.res.status === 200 && Array.isArray(f.json.options) && (f.json.options as string[]).includes(String(qr.matchCode)) && f.json.browser === "Windows · Chrome",
        "telefon isteği okur: 3 seçenek içinde doğru kod + tarayıcı özeti (ham UA YOK)", f.json);
      const d = await qrDecide(ownerPhone, parsed!.c, parsed!.n, "approve", String(qr.matchCode));
      ok(d.res.status === 200 && d.json.result === "approved", "telefonda doğru sayı + onay → approved", d.json);
      const st = await get(statusRoute.GET, `${L}/api/auth/mfa/status?challenge=${parsed!.c}`, { cookie: `__Host-yasam_mfa=${l.bind}`, "user-agent": WEB_UA });
      ok(st.json.state === "verified", "bilgisayar yoklaması → verified");
      const c = await complete(parsed!.c, l.bind);
      ownerMfaSid = cookieFrom(c.res, "__Host-yasam_sid")?.value ?? "";
      ok(c.res.status === 200 && !!ownerMfaSid, "bilgisayar tamamlar → Owner MFA'lı oturum", c.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE session_token = $1 AND mfa_method = 'qr_device'`, [ownerMfaSid]) === 1, "Owner oturumu qr_device kanıtlı");
    }

    section("C) Uzman telefonu eşleştirme → Owner Zili → Owner onayı (oturum AÇMAZ) → cihaz imzasıyla aktivasyon");
    const expPhone = newPhone();
    const otherPhone = newPhone();
    {
      const wrongPw = await post(enrollRoute.POST, `${L}/api/devices/enroll`, { email: EMAIL.exp, password: "yanlis", publicKey: expPhone.spki, ts: nowTs(), signature: "x".repeat(80) });
      ok(wrongPw.res.status === 400, "imzasız/yanlış imzalı eşleştirme reddedilir (parola denenmeden)", wrongPw.json);
      const ts = nowTs();
      const code = displayCodeForSpki(Buffer.from(expPhone.spki, "base64"));
      const badPw = await post(enrollRoute.POST, `${L}/api/devices/enroll`, { email: EMAIL.exp, password: "yanlis-parola", publicKey: expPhone.spki, ts, signature: signWith(expPhone, enrollMessage(EMAIL.exp, code, ts)) });
      ok(badPw.res.status === 401, "doğru imza + yanlış parola → 401");
      const e = await enroll(expPhone, EMAIL.exp);
      ok(e.res.status === 200 && e.json.state === "pending_owner" && e.json.fingerprint === code, "uzman eşleştirmesi pending_owner + parmak izi kodu", e.json);
      expPhone.deviceId = String(e.json.deviceId);
      ok(await count(`SELECT count(*)::int n FROM public.admin_notifications WHERE type = 'cihaz_eslesme' AND target_user_id = $1 AND resolved_at IS NULL`, [U.exp]) === 1,
        "Owner Bildirim Zili'ne cihaz_eslesme düştü");
      const again = await enroll(newPhone(), EMAIL.exp);
      ok(again.res.status === 409 && again.json.code === "PENDING_EXISTS", "ikinci bekleyen eşleştirme reddedilir");
      const early = await activate(expPhone);
      ok(early.res.status !== 200 && await count(`SELECT count(*)::int n FROM public.auth_trusted_devices WHERE id = $1 AND state = 'pending_owner'`, [expPhone.deviceId]) === 1,
        "Owner onayı olmadan aktivasyon YOK (nonce verilmez; cihaz pending_owner kalır)", early.json);

      const listPlain = await get(adminDevicesRoute.GET, `${L}/api/admin/devices`, adminHeaders(U.owner, ownerPlainSid));
      ok(listPlain.res.status === 403, "Owner'ın eski MFA'sız oturumu hâlâ listeyi göremez");
      const list = await get(adminDevicesRoute.GET, `${L}/api/admin/devices`, adminHeaders(U.owner, ownerMfaSid));
      const item = ((list.json.devices ?? []) as J[]).find((x) => x.id === expPhone.deviceId);
      ok(list.res.status === 200 && !!item && item.display_code === code && !("public_key_spki" in item), "MFA'lı Owner bekleyen isteği görür (kod var, açık anahtar YOK)", list.json);
      const ctx = { params: Promise.resolve({ id: expPhone.deviceId! }) };
      const noConfirm = await post(adminDeviceRoute.POST, `${L}/api/admin/devices/${expPhone.deviceId}`, { action: "approve", fingerprintConfirmed: false, verificationMethod: "telefon" }, adminHeaders(U.owner, ownerMfaSid), ctx);
      ok(noConfirm.res.status === 400, "parmak izi teyidi işaretlenmeden onay YOK");
      const appr = await post(adminDeviceRoute.POST, `${L}/api/admin/devices/${expPhone.deviceId}`, { action: "approve", fingerprintConfirmed: true, verificationMethod: "telefon", note: "kayıtlı numaradan arandı" }, adminHeaders(U.owner, ownerMfaSid), ctx);
      ok(appr.res.status === 200 && appr.json.state === "owner_approved", "Owner onayı → owner_approved", appr.json);
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1`, [U.exp]) === 0, "Owner onayı uzman için OTURUM AÇMADI");
      ok(await count(`SELECT count(*)::int n FROM public.harness_trial_log WHERE user_id = $1`, [U.exp]) === 0, "Owner onayı denemeyi BAŞLATMADI");
      const a = await activate(expPhone);
      ok(a.res.status === 200, "uzman telefonu kendi imzasıyla aktif");
      // Başka uzmanın telefonu (AND1): Owner onaylı + aktif.
      const eo = await enroll(otherPhone, EMAIL.and1);
      otherPhone.deviceId = String(eo.json.deviceId);
      await post(adminDeviceRoute.POST, `${L}/api/admin/devices/${otherPhone.deviceId}`, { action: "approve", fingerprintConfirmed: true, verificationMethod: "yuz_yuze" }, adminHeaders(U.owner, ownerMfaSid), { params: Promise.resolve({ id: otherPhone.deviceId! }) });
      await activate(otherPhone);
      const r = (await admin.query(`SELECT public.auth_mfa_set_required($1, $2, true, 'uzman QR testi') AS r`, [ownerMfaSid, U.exp])).rows[0].r;
      ok(r.ok === true, "Owner uzmanın MFA zorunluluğunu açar (aktif cihazı var)", r);
    }

    section("D) Uzman QR girişi (Edge) + saldırılar");
    {
      const l = await webLogin(EMAIL.exp, EDGE_UA);
      const qr = (l.json.qr ?? {}) as J;
      const p = parseQr(String(qr.url ?? ""))!;
      const match = String(qr.matchCode);
      ok(l.res.status === 202 && !!p, "uzman doğru parola → 202 + QR (oturum yok)");
      ok(await count(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1`, [U.exp]) === 0, "parola tek başına oturum açmadı");
      const otherFetch = await qrFetch(otherPhone, p.c, p.n);
      ok(otherFetch.res.status === 404 && otherFetch.json.code === "QR_INVALID", "BAŞKA uzmanın telefonu isteği okuyamaz", otherFetch.json);
      const otherDecide = await qrDecide(otherPhone, p.c, p.n, "approve", match);
      ok(otherDecide.res.status === 404, "BAŞKA uzmanın telefonu onaylayamaz");
      const forged = await qrDecide(expPhone, p.c, p.n, "approve", match, otherPhone);
      ok(forged.res.status === 400 && forged.json.code === "BAD_SIGNATURE", "doğru cihaz kimliği + yanlış anahtar imzası → reddedilir", forged.json);
      const stale = await post(qrDecideRoute.POST, `${L}/api/auth/mfa/qr/decide`, (() => {
        const ts = nowTs() - 600;
        return { challengeId: p.c, qrNonce: p.n, deviceId: expPhone.deviceId, decision: "approve", matchCode: match, ts, signature: signWith(expPhone, qrDecideMessage(p.c, p.n, expPhone.deviceId!, "approve", match, ts)) };
      })());
      ok(stale.res.status === 400 && stale.json.code === "BAD_TIMESTAMP", "10 dk eski imzalı mesaj (tekrar oynatma) reddedilir");
      const f = await qrFetch(expPhone, p.c, p.n);
      ok(f.res.status === 200 && f.json.browser === "Windows · Edge", "doğru telefon okur (Edge özeti)");
      const d = await qrDecide(expPhone, p.c, p.n, "approve", match);
      ok(d.res.status === 200 && d.json.result === "approved", "doğru telefon + doğru sayı → onay");
      const replay = await qrDecide(expPhone, p.c, p.n, "approve", match);
      ok(replay.res.status === 404, "aynı QR ikinci kez onaylanamaz");
      const thief = await post(completeRoute.POST, `${L}/api/auth/mfa/complete`, { challengeId: p.c }, { "user-agent": WEB_UA, "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${"Z".repeat(43)}` });
      ok(thief.res.status === 401, "QR/challenge'ı kopyalayan BAŞKA tarayıcı oturum açamaz");
      ok(await count(`SELECT count(*)::int n FROM public.harness_trial_log WHERE user_id = $1`, [U.exp]) === 0, "onay + reddedilen tamamlama denemeyi başlatmadı");
      const c = await complete(p.c, l.bind, EDGE_UA);
      ok(c.res.status === 200 && (c.json.user as J)?.id === U.exp, "başlatan tarayıcı (Edge) oturumu açar", c.json);
      ok(await count(`SELECT count(*)::int n FROM public.harness_trial_log WHERE user_id = $1`, [U.exp]) === 1, "deneme yalnız başarılı MFA'lı oturumla başladı");
      const c2 = await complete(p.c, l.bind, EDGE_UA);
      ok(c2.res.status === 401 && c2.json.code === "MFA_CONSUMED", "aynı challenge ikinci kez oturum açmaz");
    }

    section("E) Yanlış sayı (kimlik avı) ve ret kesin");
    {
      const l = await webLogin(EMAIL.exp);
      const qr = (l.json.qr ?? {}) as J;
      const p = parseQr(String(qr.url))!;
      const f = await qrFetch(expPhone, p.c, p.n);
      const wrong = ((f.json.options ?? []) as string[]).find((x) => x !== qr.matchCode)!;
      const d = await qrDecide(expPhone, p.c, p.n, "approve", wrong);
      ok(d.res.status === 200 && d.json.result === "denied", "yanlış sayı → reddedildi");
      const st = await get(statusRoute.GET, `${L}/api/auth/mfa/status?challenge=${p.c}`, { cookie: `__Host-yasam_mfa=${l.bind}`, "user-agent": WEB_UA });
      ok(st.json.state === "denied", "bilgisayar 'denied' görür");
      const again = await qrDecide(expPhone, p.c, p.n, "approve", String(qr.matchCode));
      ok(again.res.status === 404, "reddedilen istek sonradan doğru sayıyla onaylanamaz");
      const c = await complete(p.c, l.bind);
      ok(c.res.status === 401 && c.json.code === "MFA_DENIED", "reddedilen istek oturum açmaz", c.json);
      const l2 = await webLogin(EMAIL.exp);
      const p2 = parseQr(String((l2.json.qr as J).url))!;
      const den = await qrDecide(expPhone, p2.c, p2.n, "deny", "");
      ok(den.res.status === 200 && den.json.result === "denied", "telefondan Reddet → reddedildi");
      const c2 = await complete(p2.c, l2.bind);
      ok(c2.res.status === 401, "reddedilen istek oturum açmaz");
    }

    section("F) Cihaz iptali (telefon kaybı) → onayladığı oturumlar kapanır, yeniden onay YOK");
    {
      const l = await webLogin(EMAIL.exp);
      const qr = (l.json.qr ?? {}) as J;
      const p = parseQr(String(qr.url))!;
      await qrDecide(expPhone, p.c, p.n, "approve", String(qr.matchCode));
      const c = await complete(p.c, l.bind);
      const sid = cookieFrom(c.res, "__Host-yasam_sid")?.value ?? "";
      ok(c.res.status === 200 && !!sid, "uzman yeni MFA'lı oturum");
      const mine = await get(meDevicesRoute.GET, `${L}/api/me/devices`, { "x-user-id": U.exp, cookie: `__Host-yasam_sid=${sid}`, "user-agent": WEB_UA });
      ok(mine.res.status === 200 && ((mine.json.devices ?? []) as J[]).some((x) => x.id === expPhone.deviceId && x.state === "active"), "Cihazlarım listesi (aktif)", mine.json);
      const rv = await meDeviceRoute.DELETE(new NextRequest(`${L}/api/me/devices/${expPhone.deviceId}`, {
        method: "DELETE", headers: { "content-type": "application/json", "x-user-id": U.exp, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin", "user-agent": WEB_UA },
        body: JSON.stringify({ reason: "telefon kayboldu" }),
      }), { params: Promise.resolve({ id: expPhone.deviceId! }) });
      const rvj = (await rv.json()) as J;
      ok(rv.status === 200 && Number(rvj.sessionsClosed) >= 2, "kendi cihazını iptal → bu cihazın onayladığı oturumlar kapandı", rvj);
      const v = await sessionRoute.GET(new NextRequest(`${L}/api/auth/session`, { headers: { "user-agent": WEB_UA, cookie: `__Host-yasam_sid=${sid}` } }));
      ok(((await v.json()) as J).valid === false, "iptal sonrası oturum geçersiz");
      const l2 = await webLogin(EMAIL.exp);
      ok(l2.res.status === 202, "zorunlu kullanıcı yine MFA'ya yönlenir (parolaya düşmez)");
      const p2 = parseQr(String(((l2.json.qr ?? {}) as J).url ?? "")) ?? { c: String(l2.json.challengeId), n: "A".repeat(32) };
      const f = await qrFetch(expPhone, p2.c, p2.n);
      ok(f.res.status === 404, "iptal edilen cihaz bir daha onaylayamaz");
    }

    section("G) MFA zorunlu OLMAYAN hesap regresyonsuz");
    {
      const l = await webLogin(EMAIL.free);
      ok(l.res.status === 200 && !!l.sid, "uzman (MFA'sız) normal giriş 200");
    }
  } finally {
    await admin.end().catch(() => {});
    await shim?.close().catch(() => {});
    await pool?.end().catch(() => {});
    await server.stop().catch(() => {});
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
  }
  console.log(`\nf2c routes harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
