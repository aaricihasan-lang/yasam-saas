/**
 * GİRİŞ GÜVENLİĞİ F4 — MFA pilotu kilitlenme güvenliği. Gerçek route'lar + gerçek PostgreSQL (en güncel F2 zinciri +
 * TASLAK migration 20280129100000) + sentetik e-posta. Production / gerçek hesap YOK.
 *
 * Kanıtlananlar:
 *   A) MFA ÖNCESİ kurtarma kodu kurulumu: migration yokken kapalı (fail-closed) · yalnız MFA kapsamındaki (test listesi),
 *      e-postası doğrulanmış, zorunluluğu açılmamış hesap · parola + kayıtlı adrese giden kod ŞART (yalnız parola yetmez; doğrudan
 *      RPC'de de) · kurulum kodu ile adres doğrulama kodu birbirinin yerine GEÇMEZ · yanlış / 5 yanlış kilit / 60 sn · paralel
 *      tüketimde tek kazanan · 10 kod yalnız yanıtta, DB'de yalnız özet · denetim kaydı · 24 sa'te 3 sınırı · zorunluluk
 *      açıldıktan sonra kurulum kapalı (normal MFA'lı yol).
 *   B) Owner ekranı: Owner dışı hesapta kurtarma kodu yokken zorunluluk AÇILAMAZ (409 RECOVERY_REQUIRED); kod varsa açılır.
 *   C) Risk B: zorunluluğu açık hesap test listesinden düşse (süre dolumu) de e-posta yöntemi KALIR; listede olmayan ve zorunlu
 *      olmayan hesap yine kapsam dışı (genişleme yok).
 *   D) Acil kapatma: yalnız SQL konsolu (service_role reddedilir) · gerekçe şartı · tek hesap · diğer hesapların MFA durumu
 *      değişmez (fonksiyon içi kanıt + dış ölçüm) · security_events kaydı · tekrar çağrı değişiklik yapmaz.
 *   E) Yaşam döngüsü: e-posta doğrulaması düşerse (adres değişikliği) kurtarma kodu sürer; pasif hesap MFA'yı atlamaz;
 *      arşiv / etkin olmayan hesap girişi zaten kapalı.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f4-kurtarma-guvenligi.harness.ts
 * Negatif kontroller (yalnız test süreci; üretim kodunda bayrak YOK):
 *   F4_NEGATIF_KAPI=1  → Owner ekranındaki kurtarma kodu şartı kaldırılır (sourceMutation) → B maddesi FAIL VERMELİ.
 *   F4_NEGATIF_RISKB=1 → test listesi süre dolumu korunması kaldırılır (sourceMutation) → C maddesi FAIL VERMELİ.
 *   F4_NEGATIF_SQL=1   → taslak migration'daki posta kutusu kanıtı (OTP tüketimi) bellekte çıkarılır → A2/A3 FAIL VERMELİ.
 */
import Module from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { installSourceMutations } from "./sourceMutation";

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
const PEPPER = "f4-kurtarma-pepper-0123456789abcdefghijklmn";
const MIG = "supabase/migrations/20280129100000_auth_mfa_pilot_safety_f4.sql";

async function main() {
  const muts = installSourceMutations([
    { envVar: "F4_NEGATIF_KAPI", file: "app/api/admin/users/[id]/mfa/route.ts", label: "kurtarma kodu şartı kaldırıldı",
      anchor: "if (!st.status.isOwnerAccount && st.status.memberRecoveryReady !== true) {", replacement: "if (false) {" },
    { envVar: "F4_NEGATIF_RISKB", file: "lib/auth/mfaChallenge.ts", label: "test listesi süre dolumu korunması kaldırıldı",
      anchor: "      if (req.status === \"required\") flags = resolveOfferedMfaMethods(true, env);", replacement: "      void req;" },
  ]);
  if (muts.length || process.env.F4_NEGATIF_SQL === "1") console.log(`NEGATİF KONTROL: ${[...muts, ...(process.env.F4_NEGATIF_SQL === "1" ? ["SQL posta kutusu kanıtı çıkarıldı"] : [])].join(", ")}`);
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2n: true });
  const { admin } = db;
  const sink = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "f4-kurtarma-")), "eposta.jsonl");
  try {
    await admin.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS access_restricted_at timestamptz`);
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f4-kurtarma", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "f4-kurtarma-rate", LOGIN_IP_PEPPER: "f4-kurtarma-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: sink, AUTH_OTP_PEPPER: PEPPER,
      AUTH_MFA_METHODS: "email_otp", AUTH_MFA_METHOD_SCOPE: "test_accounts",
    });
    for (const k of ["AUTH_EMAIL_SELF_SERVICE_ROLES", "AUTH_MFA_EMAIL_ROLES", "AUTH_EMAIL_VERIFY_PILOT_USER_ID"]) delete process.env[k];
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const meRecovery = await import("@/app/api/me/account-recovery/route");
    const mfaRoute = await import("@/app/api/admin/users/[id]/mfa/route");
    const { issueAndSendOtp, verifyOtp } = await import("@/lib/auth/emailOtp");
    const { generateRecoveryCodes, hashRecoveryCode } = await import("@/lib/auth/recoveryCodes");
    const { getServerDb } = await import("@/lib/supabase-server");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 140;
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
    const web = (bind: string) => ({ cookie: `__Host-yasam_mfa=${bind}` });
    const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
    const mails = () => { try { return fs.readFileSync(sink, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; subject: string; text?: string }); } catch { return []; } };
    const codeIn = (m?: { text?: string }) => /\b([0-9]{6})\b/.exec(m?.text ?? "")?.[1] ?? "";
    const lastCode = (to: string, after = 0) => codeIn(mails().slice(after).filter((x) => x.to === to).pop());
    const n = async (sql: string, a: unknown[] = []) => Number((await q(sql, a)).rows[0].n);
    const login = async (email: string) => {
      const r = await call(sessionRoute.POST, "/api/auth/session", "POST", { email, password: pw(email) });
      return { ...r, bind: cookieVal(r.set, "__Host-yasam_mfa"), sid: cookieVal(r.set, "__Host-yasam_sid") };
    };
    const fresh = async (id: string) => {
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [id]);
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [id]);
    };
    const fix = (sql: string) => q(`BEGIN; SET LOCAL session_replication_role = replica; ${sql}; COMMIT;`);
    const P = U.exp, PE = EMAIL.exp, O = U.free, OE = EMAIL.free;
    const rec = (id: string, sid: string, body: J) => call(meRecovery.POST, "/api/me/account-recovery", "POST", body, self(id, sid));
    const recGet = (id: string, sid: string) => call(meRecovery.GET, "/api/me/account-recovery", "GET", null, self(id, sid));

    const oSid = (await login(EMAIL.owner)).sid;
    let pSid = (await login(PE)).sid;
    const oUserSid = (await login(OE)).sid;
    ok(!!oSid && !!pSid && !!oUserSid, "kurulum: Owner + pilot + başka uzman parola girişi");

    section("A0) Migration YOKKEN kurulum kapalı (fail-closed)");
    {
      await q(`INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at) VALUES ($1, 'F4 kurtarma', $2, now(), now() + interval '14 days')`, [P, U.owner]);
      await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [P]);
      const s = await rec(P, pSid, { action: "setup_send", password: pw(PE) });
      const code = lastCode(PE);
      const g = await rec(P, pSid, { action: "setup_generate", code });
      ok(s.status === 200 && g.status === 503 && g.json.code === "SETUP_UNAVAILABLE" && await n(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1`, [P]) === 0,
        "fonksiyon yok → 503 SETUP_UNAVAILABLE, kod üretilmedi", { s: s.status, g: g.json.code });
      let sql = fs.readFileSync(path.join(process.cwd(), MIG), "utf8").replace(/\r\n/g, "\n");
      if (process.env.F4_NEGATIF_SQL === "1") {
        const a = sql.indexOf("  v_otp := public.auth_email_otp_verify(");
        const b = sql.indexOf("  END IF;\n", a) + "  END IF;\n".length;
        if (a < 0 || b <= a) { console.error("F4_NEGATIF_SQL: mutasyon noktası bulunamadı"); process.exit(2); }
        sql = sql.slice(0, a) + sql.slice(b);
      }
      await admin.query(sql);
      await fresh(P);
      ok(true, "TASLAK migration sentetik DB'ye uygulandı");
    }

    section("A1) Uygunluk");
    {
      await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [O]); // en kötü durum: doğrulanmış e-posta var
      const go = await recGet(O, oUserSid);
      const so = await rec(O, oUserSid, { action: "setup_send", password: pw(OE) });
      await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = $1`, [O]);
      ok((go.json.setup as J)?.available === false && (go.json.setup as J)?.issue === "not_in_mfa_scope" && so.status === 403, "test listesinde olmayan uzman: kurulum KAPALI", { g: go.json.setup, s: so.status });
      await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = $1`, [P]);
      const gu = await recGet(P, pSid);
      ok((gu.json.setup as J)?.issue === "email_unverified", "e-postası doğrulanmamış pilot: kapalı (email_unverified)", gu.json.setup);
      await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [P]);
      const gp = await recGet(P, pSid);
      const sp = gp.json.setup as J;
      ok(sp?.available === true && typeof sp?.emailHint === "string" && !gp.text.includes(PE), "pilot: kurulum AÇIK, adres maskeli", sp);
    }

    section("A2) Posta kutusu kanıtı şart");
    let goodCode = "";
    {
      const before = mails().length;
      const bad = await rec(P, pSid, { action: "setup_send", password: "yanlis" });
      ok(bad.status >= 400 && mails().length === before, "yanlış parola → kod GÖNDERİLMEZ", bad.status);
      const s = await rec(P, pSid, { action: "setup_send", password: pw(PE) });
      goodCode = lastCode(PE, before);
      ok(s.status === 200 && /^[0-9]{6}$/.test(goodCode) && mails().slice(before).every((m) => m.to === PE) && !s.text.includes(goodCode), "kod yalnız pilotun kayıtlı adresine; yanıtta kod yok");
      const again = await rec(P, pSid, { action: "setup_send", password: pw(PE) });
      ok(again.status === 429, "60 sn dolmadan yeni kod → 429", again.status);
      const asVerify = await verifyOtp(getServerDb(), { userId: P, purpose: "verify_email", challengeId: null, code: goodCode, email: PE });
      ok(!asVerify.ok, "kurulum kodu ADRES DOĞRULAMASINDA geçmez (ayrı HMAC kapsamı)", asVerify);
      await fresh(P);
      const before2 = mails().length;
      await rec(P, pSid, { action: "setup_send", password: pw(PE) });
      goodCode = lastCode(PE, before2);
      // Saldırgan yalnız parolayı biliyor: oturum açık ama kod yok → doğrudan RPC de reddeder.
      const sb = createClient(db.shimUrl, "f4-kurtarma", { auth: { persistSession: false } }) as SupabaseClient;
      const hashes = generateRecoveryCodes().map((c) => hashRecoveryCode(P, c));
      const r1 = await sb.rpc("auth_recovery_codes_setup", { p_actor_token: pSid, p_code_hashes: hashes, p_otp_hash: "0".repeat(64) });
      const r2 = await sb.rpc("auth_recovery_codes_setup", { p_actor_token: pSid, p_code_hashes: hashes, p_otp_hash: null });
      ok((r1.data as J)?.ok === false && String((r1.data as J)?.code).startsWith("otp_") && (r2.data as J)?.ok === false,
        "doğrudan RPC: yanlış / eksik posta kutusu kanıtıyla kod ÜRETİLMEZ", { r1: (r1.data as J)?.code ?? (r1.data as J)?.ok, r2: (r2.data as J)?.code });
      const vReal = await issueAndSendOtp(getServerDb(), { userId: P, email: PE, purpose: "verify_email", challengeId: null });
      ok(vReal.ok === false, "(bekleme süresi nedeniyle adres doğrulama kodu bu anda üretilemez — beklenen)", vReal);
    }

    section("A3) Yanlış kod, kilit, paralel tüketim, başarı");
    let codes: string[] = [];
    {
      const w = await rec(P, pSid, { action: "setup_generate", code: goodCode === "000000" ? "111111" : "000000" });
      ok(w.status === 400 && w.json.code === "OTP_WRONG" && /Kalan deneme/.test(String(w.json.error)), "yanlış kod → 400 OTP_WRONG + kalan deneme", { s: w.status, c: w.json.code });
      const [a, b] = await Promise.all([rec(P, pSid, { action: "setup_generate", code: goodCode }), rec(P, pSid, { action: "setup_generate", code: goodCode })]);
      const wins = [a, b].filter((x) => x.status === 200);
      ok(wins.length === 1, "aynı doğru kodla PARALEL iki kurulum: yalnız BİRİ başarılı", [a.status, b.status]);
      codes = (wins[0]?.json.codes as string[] | undefined) ?? [];
      const rows = (await q(`SELECT code_hash, state FROM public.auth_recovery_codes WHERE user_id = $1 AND kind = 'user'`, [P])).rows as { code_hash: string; state: string }[];
      const plain = codes.map((c) => c.replace(/-/g, ""));
      ok(codes.length === 10 && rows.filter((r) => r.state === "active").length === 10 && rows.every((r) => /^[0-9a-f]{64}$/.test(r.code_hash) && plain.every((p) => !r.code_hash.includes(p))),
        "10 kod yalnız yanıtta; DB'de 10 aktif özet, düz kod YOK", { n: codes.length });
      const ev = (await q(`SELECT detail FROM public.auth_recovery_events WHERE subject_user_id = $1 AND event = 'codes_generated' ORDER BY id DESC LIMIT 1`, [P])).rows[0]?.detail as J | undefined;
      const se = await n(`SELECT count(*)::int n FROM public.security_events WHERE user_id = $1 AND event_type = 'recovery_codes_generated' AND metadata->>'setup' = 'true'`, [P]);
      ok(ev?.setup === true && se >= 1, "denetim: codes_generated (setup=true) + security_events");
      const reuse = await rec(P, pSid, { action: "setup_generate", code: goodCode });
      ok(reuse.status === 400, "aynı kurulum kodu ikinci kez KULLANILAMAZ", reuse.json.code);
      // 5 yanlışta kilit (yeni kod)
      await fresh(P);
      await q(`UPDATE public.auth_email_otps SET attempts = 0 WHERE user_id = $1`, [P]);
      const b3 = mails().length;
      await rec(P, pSid, { action: "setup_send", password: pw(PE) });
      const c3 = lastCode(PE, b3);
      const bad = c3 === "222222" ? "333333" : "222222";
      const outs: string[] = [];
      for (let i = 0; i < 5; i++) outs.push(String((await rec(P, pSid, { action: "setup_generate", code: bad })).json.code));
      const after = await rec(P, pSid, { action: "setup_generate", code: c3 });
      ok(outs[4] === "OTP_LOCKED" && after.status === 400, "5 yanlışta kilit; doğru kod da geçmez", { outs, after: after.json.code });
      const still = await n(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1 AND state = 'active'`, [P]);
      ok(still === 10, "başarısız denemeler mevcut kodları DEĞİŞTİRMEDİ", still);
    }

    section("B) Owner ekranı: kurtarma kodu şartı");
    {
      // Başka bir test hesabı: listede, e-posta doğrulanmış, kurtarma kodu YOK
      await q(`INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at) VALUES ($1, 'F4 kurtarma (kodsuz)', $2, now(), now() + interval '14 days')`, [O, U.owner]);
      await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [O]);
      const st = await call(mfaRoute.GET, `/api/admin/users/${O}/mfa`, "GET", null, adm(oSid), ctxOf(O));
      const no = await call(mfaRoute.POST, `/api/admin/users/${O}/mfa`, "POST", { action: "enable", reason: "kodsuz deneme", confirm: true }, adm(oSid), ctxOf(O));
      const rO = (await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [O])).rows[0].mfa_required;
      ok((st.json.status as J)?.memberRecoveryReady === false && no.status === 409 && no.json.code === "RECOVERY_REQUIRED" && rO === false, "kurtarma kodu yok → 409 RECOVERY_REQUIRED, zorunluluk açılmadı", { s: no.status, c: no.json.code });
      const yes = await call(mfaRoute.POST, `/api/admin/users/${P}/mfa`, "POST", { action: "enable", reason: "F4 pilot", confirm: true }, adm(oSid), ctxOf(P));
      ok(yes.status === 200, "pilotun 10 kodu var → zorunluluk açıldı", yes.json);
      await q(`DELETE FROM public.auth_mfa_test_accounts WHERE user_id = $1`, [O]);
      await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = $1`, [O]);
    }

    section("A4) Zorunluluk açıldıktan sonra kurulum kapalı");
    {
      await fresh(P);
      const l = await login(PE);
      ok(l.status === 202 && !l.sid, "pilot artık parola + ikinci doğrulama ile girer");
      const b0 = mails().length;
      await call(sendRoute.POST, "/api/auth/mfa/email/send", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      const code = lastCode(PE, b0);
      await call(verifyRoute.POST, "/api/auth/mfa/email/verify", "POST", { challengeId: l.json.challengeId, code }, web(l.bind));
      const c = await call(completeRoute.POST, "/api/auth/mfa/complete", "POST", { challengeId: l.json.challengeId }, web(l.bind));
      pSid = cookieVal(c.set, "__Host-yasam_sid");
      const s = await rec(P, pSid, { action: "setup_send", password: pw(PE) });
      ok(s.status === 403 && s.json.code === "SETUP_MFA_REQUIRED", "zorunlu hesapta kurulum KAPALI (normal MFA'lı üretim yolu)", s.json.code);
    }

    section("C) Risk B: test listesi süresi dolsa da yöntem kalır; genişleme yok");
    {
      await q(`UPDATE public.auth_mfa_test_accounts SET created_at = now() - interval '20 days', expires_at = now() - interval '1 minute' WHERE user_id = $1`, [P]);
      await fresh(P);
      const l = await login(PE);
      const m = (l.json.methods ?? []) as string[];
      ok(l.status === 202 && !l.sid && m.includes("email_otp") && m.includes("recovery_code"), "liste süresi doldu: e-posta + kurtarma kodu sürüyor; parola tek başına yetmez", m);
      const st = await call(mfaRoute.GET, `/api/admin/users/${O}/mfa`, "GET", null, adm(oSid), ctxOf(O));
      ok((st.json.status as J)?.ready === false, "listede olmayan, zorunlu olmayan hesap: hâlâ hazır DEĞİL (kapsam genişlemedi)");
      const lo = await login(OE);
      ok(lo.status === 200, "o hesabın parola girişi değişmedi", lo.status);
      // Listeye HİÇ alınmamış ama zorunlu hesap (yanlış kapsam ayarı senaryosu, #833): asıl yöntem AÇILMAZ, yalnız kurtarma.
      const AND1 = U.and1;
      await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [AND1]);
      await q(`INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash) VALUES ($1, 'user', gen_random_uuid(), $2)`, [AND1, "a".repeat(64)]);
      await q(`BEGIN; SET LOCAL yasam.mfa_policy = 'on'; UPDATE public.users SET mfa_required = true, mfa_required_at = now() WHERE id = '${AND1}'; COMMIT;`);
      await fresh(AND1);
      const la = await login(EMAIL.and1);
      ok(la.status === 202 && JSON.stringify(la.json.methods) === '["recovery_code"]', "listeye hiç alınmamış zorunlu hesap: asıl yöntem AÇILMAZ, yalnız kurtarma kodu (#833 kuralı korunur)", la.json.methods);
      await q(`BEGIN; SET LOCAL yasam.mfa_policy = 'on'; UPDATE public.users SET mfa_required = false, mfa_required_at = NULL WHERE id = '${AND1}'; COMMIT;`);
      await q(`DELETE FROM public.auth_recovery_codes WHERE user_id = $1`, [AND1]);
      await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = $1`, [AND1]);
    }

    section("E) Yaşam döngüsü");
    {
      await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = $1`, [P]);   // adres değişikliği / doğrulama düşmesi
      await fresh(P);
      const l = await login(PE);
      ok(JSON.stringify(l.json.methods) === '["recovery_code"]' && !l.sid, "e-posta doğrulaması düştü: yalnız kurtarma kodu; kilitlenme yok, MFA atlanmaz", l.json.methods);
      await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [P]);
      await fix(`UPDATE public.users SET access_restricted_at = now() WHERE id = '${P}'`);
      await fresh(P);
      const lp = await login(PE);
      ok(lp.status === 202 && !lp.sid, "pasif hesap: MFA YİNE istenir (atlanmaz)", lp.status);
      await fix(`UPDATE public.users SET access_restricted_at = NULL WHERE id = '${P}'`);
    }

    section("D) Acil kapatma (yalnız SQL konsolu)");
    {
      // İkinci zorunlu hesap: acil kapatma onu ETKİLEMEMELİ.
      const AND1 = U.and1;
      await q(`BEGIN; SET LOCAL yasam.mfa_policy = 'on'; UPDATE public.users SET mfa_required = true, mfa_required_at = now() WHERE id = '${AND1}'; COMMIT;`);
      const sb = createClient(db.shimUrl, "f4-kurtarma", { auth: { persistSession: false } }) as SupabaseClient;
      const svc = await sb.rpc("auth_mfa_emergency_disable", { p_user_id: P, p_reason: "servis rolü denemesi" });
      ok(!!svc.error, "service_role (uygulama) acil kapatmayı ÇAĞIRAMAZ", svc.error?.message?.slice(0, 80));
      const short = (await q(`SELECT public.auth_mfa_emergency_disable($1, 'kısa') AS r`, [P])).rows[0].r as J;
      ok(short.ok === false && short.code === "bad_request", "gerekçesiz / kısa gerekçe reddedilir", short);
      const before = (await q(`SELECT id, mfa_required FROM public.users WHERE id <> $1 ORDER BY id`, [P])).rows;
      const r = (await q(`SELECT public.auth_mfa_emergency_disable($1, 'F4 pilot acil geri dönüş — sentetik') AS r`, [P])).rows[0].r as J;
      const after = (await q(`SELECT id, mfa_required FROM public.users WHERE id <> $1 ORDER BY id`, [P])).rows;
      const pr = (await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [P])).rows[0].mfa_required;
      ok(r.ok === true && r.changed === true && r.others_unchanged === true && Number(r.mfa_required_before) === 2 && Number(r.mfa_required_after) === 1 && pr === false,
        "pilotun zorunluluğu kaldırıldı; fonksiyon: önce 2 → sonra 1, diğerleri değişmedi", r);
      ok(JSON.stringify(before) === JSON.stringify(after), "dış ölçüm: diğer hesapların MFA durumu BİREBİR aynı (and1 hâlâ zorunlu)");
      const ev = (await q(`SELECT severity, metadata FROM public.security_events WHERE user_id = $1 AND event_type = 'mfa_emergency_disabled' ORDER BY id DESC LIMIT 1`, [P])).rows[0];
      ok(ev?.severity === "critical" && String((ev?.metadata as J)?.reason).includes("acil"), "security_events: mfa_emergency_disabled (critical, gerekçe)");
      const again = (await q(`SELECT public.auth_mfa_emergency_disable($1, 'ikinci çağrı — değişiklik olmamalı') AS r`, [P])).rows[0].r as J;
      ok(again.ok === true && again.changed === false, "ikinci çağrı değişiklik yapmaz", again);
      await fresh(P);
      const l = await login(PE);
      ok(l.status === 200 && !!l.sid, "pilot yeniden parolayla girer (kurtarma kodları korunur)", l.status);
      ok(await n(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1 AND state = 'active'`, [P]) >= 9, "acil kapatma kurtarma kodlarına DOKUNMADI");
    }
  } finally {
    await db.close();
  }
  console.log(`\nf4-kurtarma-guvenligi: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("f4-kurtarma-guvenligi HATA:", e instanceof Error ? e.message : e);
  console.log(`\nf4-kurtarma-guvenligi: ${pass} PASS / ${fail + 1} FAIL`);
  process.exit(1);
});
