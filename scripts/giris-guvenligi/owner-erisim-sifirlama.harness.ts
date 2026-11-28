/**
 * GİRİŞ GÜVENLİĞİ — OWNER DESTEKLİ GİRİŞ ERİŞİMİ SIFIRLAMA (Owner kararı 28.11; kurtarma kodu zorunluluğunun yerine).
 * Gerçek route (POST /api/admin/users/[id]/mfa action=access_reset) + gerçek PostgreSQL (en güncel F2 zinciri + F4 + yeni
 * migration 20280130000500) + sentetik e-posta. Production / gerçek hesap YOK.
 *
 * Kanıtlananlar:
 *   0) Migration yokken sıfırlama kapalı (503) — hiçbir şey değişmez.
 *   1) Yetki: Owner olmayan yönetici / uzman oturumu → reddedilir; parolasız / yanlış parola / onaysız / kısa gerekçe → reddedilir;
 *      kendi hesabı ve Owner hesabı hedeflenemez; doğrudan RPC'de uzman oturumu → forbidden.
 *   2) Başarı: hedefin MFA zorunluluğu kalkar, aktif güvenilir cihazı iptal, BÜTÜN oturumları kapanır (eski çerez 401), kullanılmamış
 *      kurtarma kodları geçersiz, bekleyen giriş isteği reddedilir; security_events (critical; Owner + gerekçe).
 *      Parola, e-posta adresi ve doğrulama durumu DEĞİŞMEZ; DİĞER hesaplar (kayıt + oturum özeti) DEĞİŞMEZ; kullanıcı verisi silinmez.
 *   3) Üye sıfırlamadan sonra parolasıyla girer; Owner'ın adres değişikliği (mevcut yol) doğrulamayı DÜŞÜRÜR.
 *   4) MFA KULLANAN Owner: F2-G kuralı korunur (taze MFA + işleme bağlı kanıt) — çalınmış çerez + parola yetmez.
 *   5) Kurtarma kodu şartı yok: kodsuz üyede zorunluluk açılır.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/owner-erisim-sifirlama.harness.ts
 * Negatif kontrol: OWNER_SIFIRLAMA_PAROLASIZ=1 → route'taki Owner parolası doğrulaması kaldırılır (sourceMutation) → 1) FAIL VERMELİ.
 */
import Module from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
const MIGS = ["supabase/migrations/20280129100100_auth_mfa_pilot_safety_f4.sql", "supabase/migrations/20280130000500_auth_owner_access_reset.sql"];

async function main() {
  const muts = installSourceMutations([
    { envVar: "OWNER_SIFIRLAMA_PAROLASIZ", file: "app/api/admin/users/[id]/mfa/route.ts", label: "Owner parolası doğrulaması kaldırıldı",
      anchor: "  const step = await reconfirmPassword(guard.db, req, guard.adminId, body?.password);\n  if (!step.ok) return json(step.body, step.status);",
      replacement: "  void reconfirmPassword;" },
  ]);
  if (muts.length) console.log(`NEGATİF KONTROL: ${muts.join(", ")}`);
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2n: true });
  const { admin } = db;
  const sink = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "owner-sifirlama-")), "eposta.jsonl");
  try {
    await admin.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS access_restricted_at timestamptz`);
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "owner-sifirlama", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "owner-sifirlama-rate", LOGIN_IP_PEPPER: "owner-sifirlama-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: sink, AUTH_OTP_PEPPER: "owner-sifirlama-pepper-0123456789abcdefgh",
      AUTH_MFA_METHODS: "email_otp", AUTH_MFA_METHOD_SCOPE: "test_accounts",
    });
    for (const k of ["AUTH_EMAIL_SELF_SERVICE_ROLES", "AUTH_MFA_EMAIL_ROLES", "AUTH_EMAIL_VERIFY_PILOT_USER_ID"]) delete process.env[k];
    const sessionRoute = await import("@/app/api/auth/session/route");
    const profileRoute = await import("@/app/api/auth/profile/route");
    const mfaRoute = await import("@/app/api/admin/users/[id]/mfa/route");
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
    const login = async (email: string, password = pw(email)) => {
      const r = await call(sessionRoute.POST, "/api/auth/session", "POST", { email, password });
      return { ...r, sid: cookieVal(r.set, "__Host-yasam_sid") };
    };
    const adm = (adminId: string, sid: string) => ({ "x-admin-id": adminId, cookie: `__Host-yasam_sid=${sid}` });
    const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
    const n = async (sql: string, a: unknown[] = []) => Number((await q(sql, a)).rows[0].n);
    const fix = (sql: string) => q(`BEGIN; SET LOCAL session_replication_role = replica; ${sql}; COMMIT;`);
    // Yalnız test kurulumu: gerçek girişin ürettiği MFA'lı oturumun sentetik eşi (koruma tetikleyicileri bu ekleme için kapalı).
    const directMfa = async (id: string, role: string, age = "0 minutes") => { const sid = randomUUID(); await fix(`INSERT INTO public.user_sessions (user_id, session_token, is_active, session_state, client_channel, session_role, expires_at, mfa_method, created_at) VALUES ('${id}', '${sid}', true, 'active', 'desktop_web', '${role}', now() + interval '1 day', 'email_otp', now() - interval '${age}')`); return sid; };
    const direct = async (id: string, role: string) => { const sid = randomUUID(); await q(`INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at) VALUES ($1, $2, true, 'desktop_web', $3, now() + interval '1 day')`, [id, sid, role]); return sid; };
    const T = U.exp, TE = EMAIL.exp;           // hedef üye (erişimini kaybetmiş)
    const reset = (adminId: string, sid: string, body: J, target = T) =>
      call(mfaRoute.POST, `/api/admin/users/${target}/mfa`, "POST", { action: "access_reset", ...body }, adm(adminId, sid), ctxOf(target));
    const GOOD = { reason: "Kişi telefonla teyit edildi, e-posta erişimi yok", password: pw(EMAIL.owner), confirm: true };

    // Hedef: zorunlu MFA + aktif cihaz + 2 oturum + kurtarma kodları + bekleyen giriş isteği (kilitlenmiş üye)
    const oSid = (await login(EMAIL.owner)).sid;
    const tSid1 = (await login(TE)).sid;
    const tSid2 = await direct(T, "expert");
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [T]);
    await q(`INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at) VALUES ($1, 'sıfırlama testi', $2, now(), now() + interval '14 days')`, [T, U.owner]);
    const dev = (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
      VALUES ($1, repeat('T',120), encode(sha256('hedef-telefon'::bytea),'hex'), 'HEDF-TLFN', 'active', now()) RETURNING id`, [T])).rows[0].id as string;
    await q(`INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash) VALUES ($1, 'user', gen_random_uuid(), $2)`, [T, "c".repeat(64)]);
    const tSid3 = await directMfa(T, "expert");   // MFA'lı açık oturum (zorunluluktan sonra da sürer)
    await q(`BEGIN; SET LOCAL yasam.mfa_policy = 'on'; UPDATE public.users SET mfa_required = true, mfa_required_at = now() WHERE id = '${T}'; COMMIT;`);
    const pend = await login(TE);
    ok(!!oSid && pend.status === 202, "kurulum: Owner oturumu; hedef zorunlu MFA'da (parola tek başına 202)", pend.status);
    const ADM2 = randomUUID();
    const tenant = (await q(`SELECT tenant_id FROM public.users WHERE id = $1`, [U.owner])).rows[0].tenant_id;
    await fix(`INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, is_super_admin) VALUES ('${ADM2}', 'sifirlama-adm2@test.local', 'admin', '${tenant}', true, 'approved', false)`);
    const sAdm2 = await direct(ADM2, "admin");
    const userRow = async () => (await q(`SELECT email, password_hash, email_verified_at, active, role, tenant_id FROM public.users WHERE id = $1`, [T])).rows[0];
    const t0 = await userRow();
    const others = async () => (await q(`SELECT md5(string_agg(u.id::text||u.email||coalesce(u.password_hash,'')||u.mfa_required::text||coalesce(u.email_verified_at::text,'-'), ',' ORDER BY u.id)) AS u,
        (SELECT md5(string_agg(s.id::text||s.is_active::text, ',' ORDER BY s.id)) FROM public.user_sessions s WHERE s.user_id <> $1 AND s.user_id <> '${U.owner}') AS s,
        (SELECT md5(string_agg(d.id::text||d.state, ',' ORDER BY d.id)) FROM public.auth_trusted_devices d WHERE d.user_id <> $1) AS d
       FROM public.users u WHERE u.id <> $1`, [T])).rows[0];
    const others0 = await others();

    section("0) Migration YOKKEN sıfırlama kapalı");
    {
      await q(fs.readFileSync(path.join(process.cwd(), MIGS[0]), "utf8"));
      const r = await reset(U.owner, oSid, GOOD);
      ok(r.status === 503 && r.json.code === "UNAVAILABLE" && (await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [T])).rows[0].mfa_required === true,
        "fonksiyon yok → 503, hedef hâlâ zorunlu", { s: r.status, c: r.json.code });
      await q(fs.readFileSync(path.join(process.cwd(), MIGS[1]), "utf8"));
      ok(true, "sıfırlama migration'ı sentetik DB'ye uygulandı");
    }

    section("1) Yetki ve onay kapıları — hiçbiri hedefi DEĞİŞTİRMEZ");
    {
      const cases: [string, () => ReturnType<typeof reset>, (s: number, c: unknown) => boolean][] = [
        ["Owner olmayan yönetici", () => reset(ADM2, sAdm2, { ...GOOD, password: "herhangi" }), (s) => s === 403],
        ["uzman oturumu (yönetici değil)", () => reset(U.free, tSid1, GOOD), (s) => s === 401 || s === 403],
        ["Owner — parola YOK", () => reset(U.owner, oSid, { ...GOOD, password: "" }), (s, c) => s === 400 && c === "PASSWORD_REQUIRED"],
        ["Owner — parola YANLIŞ", () => reset(U.owner, oSid, { ...GOOD, password: "yanlis-parola" }), (s, c) => s === 400 && c === "PASSWORD_WRONG"],
        ["Owner — teyit onayı yok", () => reset(U.owner, oSid, { ...GOOD, confirm: false }), (s, c) => s === 400 && c === "CONFIRM_REQUIRED"],
        ["Owner — gerekçe kısa", () => reset(U.owner, oSid, { ...GOOD, reason: "kısa" }), (s) => s === 400],
        ["Owner — kendi hesabı", () => reset(U.owner, oSid, GOOD, U.owner), (s) => s === 403],
      ];
      for (const [label, run, want] of cases) {
        const r = await run();
        const still = (await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [T])).rows[0].mfa_required;
        ok(want(r.status, r.json.code) && still === true, `${label} → reddedildi, hedef değişmedi`, { s: r.status, c: r.json.code });
      }
      const sb = createClient(db.shimUrl, "owner-sifirlama", { auth: { persistSession: false } }) as SupabaseClient;
      const d1 = await sb.rpc("auth_owner_access_reset", { p_actor_token: tSid1, p_user_id: U.free, p_reason: "uzman oturumuyla doğrudan deneme" });
      const d2 = await sb.rpc("auth_owner_access_reset", { p_actor_token: sAdm2, p_user_id: T, p_reason: "Owner olmayan yöneticiyle deneme" });
      const d3 = await sb.rpc("auth_owner_access_reset", { p_actor_token: oSid, p_user_id: U.owner, p_reason: "Owner hesabını hedefleme denemesi" });
      ok((d1.data as J)?.code === "forbidden" && (d2.data as J)?.code === "forbidden" && (d3.data as J)?.code === "target_forbidden",
        "doğrudan RPC: uzman / Owner olmayan yönetici → forbidden; Owner hesabı hedeflenemez", [d1.data, d2.data, d3.data]);
    }

    section("2) Başarılı sıfırlama");
    {
      const r = await reset(U.owner, oSid, GOOD);
      ok(r.status === 200 && r.json.ok === true && r.json.mfaRequiredBefore === true && Number(r.json.devicesRevoked) === 1 && Number(r.json.sessionsClosed) >= 1 && Number(r.json.codesRevoked) === 1,
        "Owner (parola + gerekçe + teyit) → 200; 1 cihaz, açık (MFA'lı) oturum, 1 kod", r.json);
      const u = (await q(`SELECT mfa_required, mfa_required_at FROM public.users WHERE id = $1`, [T])).rows[0];
      ok(u.mfa_required === false && u.mfa_required_at === null, "MFA zorunluluğu kalktı");
      ok((await q(`SELECT state FROM public.auth_trusted_devices WHERE id = $1`, [dev])).rows[0].state === "revoked", "güvenilir cihaz iptal edildi");
      ok(await n(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [T]) === 0, "hedefin BÜTÜN oturumları kapandı");
      ok(await n(`SELECT count(*)::int n FROM public.user_sessions WHERE session_token = ANY($1::text[]) AND is_active`, [[tSid1, tSid2, tSid3]]) === 0, "parola girişi, doğrudan ve MFA'lı oturumların hiçbiri açık değil");
      const old = await call(profileRoute.GET, "/api/auth/profile", "GET", null, { "x-user-id": T, cookie: `__Host-yasam_sid=${tSid3}` });
      ok(old.status === 401, "eski (MFA'lı) oturum çerezi artık GEÇERSİZ", old.status);
      ok(await n(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1 AND state = 'active'`, [T]) === 0, "kullanılmamış kurtarma kodları geçersiz");
      ok(await n(`SELECT count(*)::int n FROM public.auth_mfa_challenges WHERE user_id = $1 AND state IN ('pending','verified')`, [T]) === 0, "bekleyen giriş isteği reddedildi");
      const ev = (await q(`SELECT severity, metadata FROM public.security_events WHERE user_id = $1 AND event_type = 'owner_access_reset' ORDER BY id DESC LIMIT 1`, [T])).rows[0];
      ok(ev?.severity === "critical" && (ev.metadata as J).actor_id === U.owner && String((ev.metadata as J).reason).includes("teyit"), "denetim: security_events critical (Owner + gerekçe)", ev);
      const t1 = await userRow();
      ok(JSON.stringify(t0) === JSON.stringify(t1), "parola, e-posta, doğrulama durumu, rol, tenant DEĞİŞMEDİ (veri silinmedi)");
      ok(JSON.stringify(others0) === JSON.stringify(await others()), "DİĞER hesapların kayıtları, oturumları ve cihazları DEĞİŞMEDİ");
      const again = await reset(U.owner, oSid, GOOD);
      ok(again.status === 200 && again.json.mfaRequiredBefore === false && Number(again.json.sessionsClosed) === 0, "ikinci sıfırlama zararsız (değişecek bir şey yok)", again.json);
    }

    section("3) Sonrası: parolayla giriş; adres değişikliği doğrulamayı düşürür");
    {
      const l = await login(TE);
      ok(l.status === 200 && !!l.sid, "üye parolasıyla girer (ikinci doğrulama istenmez)", l.status);
      // Adres değişikliği mevcut Owner yolundan (PATCH action=edit) yapılır; güvence DB tetikleyicisinde (users_email_change_guard):
      // adres HANGİ yoldan değişirse değişsin doğrulama düşer; yalnız yeni adrese giden kodla doğrulanır.
      await q(`UPDATE public.users SET email = 'hedef-yeni@test.local' WHERE id = $1`, [T]);
      const v = (await q(`SELECT email, email_verified_at FROM public.users WHERE id = $1`, [T])).rows[0];
      ok(v.email === "hedef-yeni@test.local" && v.email_verified_at === null, "adres değişti → yeni adres DOĞRULANMAMIŞ (kullanıcı doğrulayana kadar)", v);
    }

    section("4) MFA KULLANAN Owner: F2-G kuralı korunur");
    {
      const T2 = U.and1;
      await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [T2]);
      await q(`INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at) VALUES ($1, 'sıfırlama testi 2', $2, now(), now() + interval '14 days')`, [T2, U.owner]);
      await q(`BEGIN; SET LOCAL yasam.mfa_policy = 'on'; UPDATE public.users SET mfa_required = true, mfa_required_at = now() WHERE id = '${T2}'; COMMIT;`);
      // Owner oturumu MFA'lı ama TAZE değil (çalınmış eski çerez senaryosu) → parola doğru olsa da reddedilir.
      const oMfa = await directMfa(U.owner, "admin", "2 hours");
      const r = await reset(U.owner, oMfa, GOOD, T2);
      const still = (await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [T2])).rows[0].mfa_required;
      ok(r.status === 403 && (r.json.code === "fresh_mfa_required" || r.json.code === "STEP_UP_REQUIRED") && still === true,
        "MFA'lı Owner'ın eski oturumu + doğru parola → 403 (taze MFA / işlem kanıtı şart); hedef değişmedi", { s: r.status, c: r.json.code });
      const oMfaFresh = await directMfa(U.owner, "admin");
      const r2 = await reset(U.owner, oMfaFresh, GOOD, T2);
      ok(r2.status === 403 && r2.json.code === "STEP_UP_REQUIRED" && r2.json.action === "mfa_disable", "taze MFA'lı Owner'a da hedefe bağlı işlem kanıtı (mfa_disable) istenir", { s: r2.status, j: r2.json });
      await q(`BEGIN; SET LOCAL yasam.mfa_policy = 'on'; UPDATE public.users SET mfa_required = false, mfa_required_at = NULL WHERE id = '${T2}'; COMMIT;`);
    }

    section("5) Kurtarma kodu şartı yok");
    {
      const T3 = U.free;
      const t3s = (await login(EMAIL.free)).sid;
      await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [T3]);
      await q(`INSERT INTO public.auth_mfa_test_accounts (user_id, note, added_by, created_at, expires_at) VALUES ($1, 'kodsuz', $2, now(), now() + interval '14 days')`, [T3, U.owner]);
      const en = await call(mfaRoute.POST, `/api/admin/users/${T3}/mfa`, "POST", { action: "enable", reason: "kodsuz zorunluluk", confirm: true }, adm(U.owner, oSid), ctxOf(T3));
      const codes = await n(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1`, [T3]);
      ok(en.status === 200 && codes === 0 && (await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [T3])).rows[0].mfa_required === true,
        "kurtarma kodu OLMAYAN üyede zorunluluk açıldı (409 RECOVERY_REQUIRED yok)", { s: en.status, c: en.json.code });
      void t3s;
    }
  } finally {
    await db.close();
  }
  console.log(`\nowner-erisim-sifirlama: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("owner-erisim-sifirlama HATA:", e instanceof Error ? e.message : e);
  console.log(`\nowner-erisim-sifirlama: ${pass} PASS / ${fail + 1} FAIL`);
  process.exit(1);
});
