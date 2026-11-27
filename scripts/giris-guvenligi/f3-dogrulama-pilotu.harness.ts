/**
 * GİRİŞ GÜVENLİĞİ F3 PİLOT — tek uzman hesabı için e-posta ADRES DOĞRULAMASI (AUTH_EMAIL_VERIFY_PILOT_USER_ID).
 * Gerçek route'lar + gerçek PostgreSQL (en güncel F2 zinciri) + sentetik e-posta. Production / Turhost / gerçek hesap YOK.
 *
 * Kanıtlananlar: pilot yalnız ayardaki TEK kullanıcı kimliğine (oturumun DB kullanıcısı) açılır; diğer uzmanlar, Owner olmayan
 * yönetici, demo kapalı kalır, Owner açık kalır · pilot hesap demo / pasif / arşiv / etkin değil / yönetici ise kapalı · biçimsiz /
 * çoklu değer → pilot YOK · IDOR / CSRF / gövdeyle kimlik değiştirme reddedilir · kod yalnız pilotun KAYITLI adresine, 6 hane,
 * 3 dk, yanlış kod sınırı, 60 sn bekleme, tek kullanım, HMAC (düz kod yok) · kod başka kullanıcıya / başka işleme (giriş) /
 * başka adrese uygulanamaz · adres değiştirme, güvenlik bildirimi, kurtarma, MFA zorunluluğu pilotla AÇILMAZ · pilot dışındaki
 * kullanıcıların kayıtları ve oturumları değişmez.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f3-dogrulama-pilotu.harness.ts
 * Negatif kontrol: F3_PILOT_NEGATIF=1 → pilot hesap uygunluk denetimi test sürecinde kaldırılır (sourceMutation) → FAIL beklenir.
 */
import Module from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
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
const PEPPER = "f3-pilot-pepper-0123456789abcdefghijklmnop";

async function main() {
  const muts = installSourceMutations([{
    envVar: "F3_PILOT_NEGATIF", file: "lib/auth/emailSelfService.ts", label: "pilot hesap uygunluk denetimi kaldırıldı",
    anchor: "    return u.active === true && u.is_demo_account !== true && String(u.role ?? \"\").trim().toLowerCase() === \"expert\"",
    replacement: "    return true || u.active === true && u.is_demo_account !== true && String(u.role ?? \"\").trim().toLowerCase() === \"expert\"",
  }]);
  if (muts.length) console.log(`NEGATİF KONTROL (F3_PILOT_NEGATIF=1): ${muts.join(", ")}`);
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2n: true });
  const { admin } = db;
  const sink = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "f3-pilot-")), "eposta.jsonl");
  try {
    await admin.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS access_restricted_at timestamptz`);
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f3-pilot", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "f3-pilot-rate", LOGIN_IP_PEPPER: "f3-pilot-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: sink, AUTH_OTP_PEPPER: PEPPER,
    });
    for (const k of ["AUTH_EMAIL_SELF_SERVICE_ROLES", "AUTH_EMAIL_VERIFY_PILOT_USER_ID", "AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256", "AUTH_MFA_METHODS", "AUTH_MFA_METHOD_SCOPE", "AUTH_MFA_EMAIL_ROLES"]) delete process.env[k];
    const sessionRoute = await import("@/app/api/auth/session/route");
    const meEmail = await import("@/app/api/me/email-verification/route");
    const meChange = await import("@/app/api/me/email-change/route");
    const statusRoute = await import("@/app/api/admin/email-status/route");
    const { sendSecurityNotice } = await import("@/lib/auth/securityNotice");
    const { verifyOtp } = await import("@/lib/auth/emailOtp");
    const { getServerDb } = await import("@/lib/supabase-server");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 100;
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
    const login = async (email: string) => cookieVal((await call(sessionRoute.POST, "/api/auth/session", "POST", { email, password: pw(email) })).set, "__Host-yasam_sid");
    const self = (id: string, sid: string) => ({ "x-user-id": id, cookie: `__Host-yasam_sid=${sid}` });
    const mails = () => { try { return fs.readFileSync(sink, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; subject: string; text?: string }); } catch { return []; } };
    const lastCode = (to: string) => { const m = mails().filter((x) => x.to === to); return /\b([0-9]{6})\b/.exec(m[m.length - 1]?.text ?? "")?.[1] ?? ""; };
    const n = async (sql: string, a: unknown[] = []) => Number((await q(sql, a)).rows[0].n);
    const skipCooldown = (id: string) => q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [id]);
    const fix = (sql: string) => q(`BEGIN; SET LOCAL session_replication_role = replica; ${sql}; COMMIT;`);

    const P = U.exp;          // pilot (tenant 14)
    const PE = EMAIL.exp;
    const O = U.free;         // başka uzman (başka tenant)
    const DEMO = randomUUID();
    const ADM2 = randomUUID();
    const tenant = (await q(`SELECT tenant_id FROM public.users WHERE id = $1`, [U.owner])).rows[0].tenant_id;
    await fix(`INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, is_demo_account) VALUES ('${DEMO}', 'f3-pilot-demo@test.local', 'expert', '${tenant}', true, 'approved', true);
               INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, is_super_admin) VALUES ('${ADM2}', 'f3-pilot-adm2@test.local', 'admin', '${tenant}', true, 'approved', false)`);
    await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = ANY($1::uuid[])`, [[U.owner, P, O]]);
    const sP = await login(PE);
    const sO = await login(EMAIL.free);
    const sOwner = await login(EMAIL.owner);
    const direct = async (id: string, role: string) => { const sid = randomUUID(); await q(`INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at) VALUES ($1, $2, true, 'desktop_web', $3, now() + interval '1 day')`, [id, sid, role]); return sid; };
    const sDemo = await direct(DEMO, "expert");
    const sAdm2 = await direct(ADM2, "admin");
    ok(!!sP && !!sO && !!sOwner, "kurulum: pilot uzman + başka uzman + Owner parola girişi");
    const snapOthers = async () => (await q(`SELECT md5(string_agg(u.id::text || u.email || coalesce(u.password_hash,'') || u.role || u.active::text || coalesce(u.email_verified_at::text,'-') || u.mfa_required::text, ',' ORDER BY u.id)) AS u,
        (SELECT md5(string_agg(s.id::text || s.is_active::text, ',' ORDER BY s.id)) FROM public.user_sessions s WHERE s.user_id <> $1) AS s FROM public.users u WHERE u.id <> $1`, [P])).rows[0];
    const others0 = await snapOthers();

    section("1) Pilot TANIMSIZ: davranış #842 ile aynı");
    {
      const g = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(P, sP));
      const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(P, sP));
      ok(g.json.available === false && s.status === 403 && mails().length === 0, "uzman (pilot adayı) kapalı; ileti yok", { g: g.json, s: s.status });
    }

    section("2) Geçersiz pilot ayarı → pilot YOK");
    const { emailVerifyPilotAddressHash } = await import("@/lib/auth/emailSelfService");
    process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256 = emailVerifyPilotAddressHash(PE);   // adres sabitlemesi doğru; kimlik geçersiz
    for (const v of ["abc", `${P},${O}`, `${P} ${O}`, "*", P.replace(/-/g, "")]) {
      process.env.AUTH_EMAIL_VERIFY_PILOT_USER_ID = v;
      const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(P, sP));
      ok(s.status === 403, `AUTH_EMAIL_VERIFY_PILOT_USER_ID="${v.length > 20 ? v.slice(0, 20) + "…" : v}" → kapalı`, s.status);
    }

    section("2b) Adres sabitleme ve onay şartı (pilot kimliği DOĞRU)");
    process.env.AUTH_EMAIL_VERIFY_PILOT_USER_ID = P;
    {
      const pinned = emailVerifyPilotAddressHash(PE);
      const cases: [string, () => Promise<unknown>, () => Promise<unknown>][] = [
        ["adres özeti tanımsız", async () => { delete process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256; }, async () => { process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256 = pinned; }],
        ["adres özeti biçimsiz", async () => { process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256 = "abc"; }, async () => { process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256 = pinned; }],
        ["adres özeti başka adresin", async () => { process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256 = emailVerifyPilotAddressHash("baska@test.local"); }, async () => { process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256 = pinned; }],
        ["kayıtlı adres sonradan değişti", () => fix(`UPDATE public.users SET email = 'pilot-yeni@test.local' WHERE id = '${P}'`), () => fix(`UPDATE public.users SET email = '${PE}' WHERE id = '${P}'`)],
        ["hesap onaylı değil (approval_status)", () => fix(`UPDATE public.users SET approval_status = 'pending' WHERE id = '${P}'`), () => fix(`UPDATE public.users SET approval_status = 'approved' WHERE id = '${P}'`)],
      ];
      for (const [label, prep, undo] of cases) {
        await prep();
        const before = mails().length;
        const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(P, sP));
        ok(s.status === 403 && mails().length === before, `${label} → pilot KAPALI, ileti yok`, s.status);
        await undo();
      }
      process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256 = pinned.toUpperCase();
      const g = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(P, sP));
      ok(g.json.available === true, "özet büyük harfle yazılsa da (biçim) eşleşir", g.json.available);
      process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256 = pinned;
    }

    section("3) Pilot = tek uzman kimliği");
    process.env.AUTH_EMAIL_VERIFY_PILOT_USER_ID = ` ${P.toUpperCase()} `;
    {
      const g = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(P, sP));
      ok(g.json.available === true && g.json.changeAvailable === false, "pilot: doğrulama AÇIK, adres değişikliği KAPALI", g.json);
      const go = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(O, sO));
      const so = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(O, sO));
      ok(go.json.available === false && so.status === 403 && so.json.code === "METHOD_NOT_IN_SCOPE", "başka uzman (başka tenant) KAPALI", { g: go.json, s: so.status });
      const sd = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(DEMO, sDemo));
      const sa = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(ADM2, sAdm2));
      const gw = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(U.owner, sOwner));
      ok(sd.status === 403 && sa.status === 403 && gw.json.available === true, "demo + Owner olmayan yönetici KAPALI; Owner AÇIK (değişmedi)", { d: sd.status, a: sa.status, o: gw.json.available });
      ok(mails().length === 0, "bu denetimlerde hiç ileti gitmedi");
    }

    section("4) Kimlik taklidi / CSRF");
    {
      const i1 = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(P, sO));
      const i2 = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send", userId: P, email: "saldirgan@kotu.example" }, self(O, sO));
      const i3 = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, { ...self(P, sP), origin: "https://kotu.example", "sec-fetch-site": "cross-site" });
      ok((i1.status === 401 || i1.status === 403) && i2.status === 403 && i3.status === 403 && mails().length === 0,
        "başka uzman oturumu + pilot kimliği / gövdeye pilot userId + sahte adres / başka site → reddedildi, ileti YOK", [i1.status, i2.status, i3.status]);
    }

    section("5) Pilot OTP akışı: mevcut kurallar aynen");
    {
      const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send", email: "saldirgan@kotu.example" }, self(P, sP));
      const code = lastCode(PE);
      ok(s.status === 200 && mails().length === 1 && mails()[0].to === PE && /^[0-9]{6}$/.test(code) && !s.text.includes(code), "kod yalnız pilotun KAYITLI adresine (gövdedeki adres yok sayıldı); 6 hane; yanıtta kod yok", { s: s.status, to: mails().map((x) => x.to) });
      const o = (await q(`SELECT purpose, extract(epoch FROM expires_at - created_at)::int AS ttl, code_hash FROM public.auth_email_otps WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [P])).rows[0];
      ok(o?.purpose === "verify_email" && o?.ttl === 180 && /^[0-9a-f]{64}$/.test(String(o?.code_hash)) && !String(o?.code_hash).includes(code), "DB: verify_email, 3 dk, yalnız HMAC (düz kod yok)", { p: o?.purpose, ttl: o?.ttl });
      const again = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(P, sP));
      ok(again.status === 429, "60 sn dolmadan yeni kod → 429", again.status);
      const cross = await verifyOtp(getServerDb(), { userId: O, purpose: "verify_email", challengeId: null, code, email: PE });
      const login = await verifyOtp(getServerDb(), { userId: P, purpose: "login", challengeId: randomUUID(), code });
      const otherAddr = await verifyOtp(getServerDb(), { userId: P, purpose: "verify_email", challengeId: null, code, email: "baska@adres.test" });
      ok(!cross.ok && !login.ok && !otherAddr.ok, "kod başka kullanıcıya / giriş işlemine / başka adrese UYGULANAMAZ", { cross, login, otherAddr });
      const wrong = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code: code === "000000" ? "111111" : "000000" }, self(P, sP));
      ok(wrong.status === 400 && /Kalan deneme/.test(String(wrong.json.error)), "yanlış kod → 400 + kalan deneme", wrong.json);
      const c = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code }, self(P, sP));
      const v = (await q(`SELECT email, email_verified_at, mfa_required FROM public.users WHERE id = $1`, [P])).rows[0];
      ok(c.status === 200 && v.email_verified_at !== null && v.email === PE && v.mfa_required === false, "doğru kod → pilot adresi doğrulandı; adres aynı; MFA zorunluluğu AÇILMADI", { c: c.status, mfa: v.mfa_required });
      const reuse = await verifyOtp(getServerDb(), { userId: P, purpose: "verify_email", challengeId: null, code, email: PE });
      ok(!reuse.ok, "aynı kod ikinci kez kabul edilmez", reuse);
    }

    section("6) Süre aşımı ve 5 yanlış deneme (pilot, ikinci tur)");
    {
      await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = $1`, [P]); // yalnız sentetik DB: ikinci tur için
      await skipCooldown(P);
      await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(P, sP));
      const code = lastCode(PE);
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '4 minutes', expires_at = expires_at - interval '4 minutes' WHERE user_id = $1 AND state = 'active'`, [P]);
      const exp = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code }, self(P, sP));
      ok(exp.status === 400 && exp.json.code === "OTP_EXPIRED", "3 dakikası dolmuş kod reddedildi", exp.json.code);
      await skipCooldown(P);
      await q(`UPDATE public.auth_email_otps SET attempts = 0 WHERE user_id = $1`, [P]);
      await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(P, sP));
      const good = lastCode(PE);
      const bad = good === "222222" ? "333333" : "222222";
      const outs: string[] = [];
      for (let i = 0; i < 5; i++) outs.push(String((await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code: bad }, self(P, sP))).json.code));
      const after = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code: good }, self(P, sP));
      ok(outs[4] === "OTP_LOCKED" && after.status === 400, "5 yanlışta kilit; kilitten sonra doğru kod da geçmez", { outs, after: after.json.code });
    }

    section("7) Pilot adres değiştirme / bildirim / kurtarma AÇMAZ");
    {
      const ch = await call(meChange.POST, "/api/me/email-change", "POST", { action: "start", newEmail: "pilot-yeni@test.local", password: pw(PE) }, self(P, sP));
      ok(ch.status === 403 && ch.json.code === "METHOD_NOT_IN_SCOPE", "pilot adres değiştiremez (403)", ch.json.code);
      const before = mails().length;
      const sn = await sendSecurityNotice(getServerDb(), { userId: P, to: PE, name: null, kind: "recovery_codes_generated" });
      ok(sn === false && mails().length === before, "pilota güvenlik bildirimi GİTMEZ (scope_closed)");
      ok(await n(`SELECT count(*)::int n FROM public.auth_recovery_codes WHERE user_id = $1`, [P]) === 0, "kurtarma kodu oluşmadı");
    }

    section("8) Uygun olmayan pilot hesabı → kapalı");
    for (const [label, prep, undo] of [
      ["pasif", `UPDATE public.users SET access_restricted_at = now() WHERE id = '${P}'`, `UPDATE public.users SET access_restricted_at = NULL WHERE id = '${P}'`],
      ["arşiv", `UPDATE public.users SET archived_at = now() WHERE id = '${P}'`, `UPDATE public.users SET archived_at = NULL WHERE id = '${P}'`],
      ["demo", `UPDATE public.users SET is_demo_account = true WHERE id = '${P}'`, `UPDATE public.users SET is_demo_account = false WHERE id = '${P}'`],
    ] as const) {
      await fix(prep);
      await skipCooldown(P);
      const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(P, sP));
      ok(s.status === 403, `pilot hesap ${label} → kapalı`, s.status);
      await fix(undo);
    }
    {
      // Adres sabitlemesi her seferinde o hesabın KENDİ adresine göre (yalnız rol / demo kuralı sınanır).
      process.env.AUTH_EMAIL_VERIFY_PILOT_USER_ID = DEMO;
      process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256 = emailVerifyPilotAddressHash("f3-pilot-demo@test.local");
      const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(DEMO, sDemo));
      process.env.AUTH_EMAIL_VERIFY_PILOT_USER_ID = ADM2;
      process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256 = emailVerifyPilotAddressHash("f3-pilot-adm2@test.local");
      const a = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(ADM2, sAdm2));
      ok(s.status === 403 && a.status === 403, "pilot = demo hesabı / yönetici hesabı → kapalı (pilot yalnız uzman)", [s.status, a.status]);
      process.env.AUTH_EMAIL_VERIFY_PILOT_USER_ID = P;
      process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256 = emailVerifyPilotAddressHash(PE);
    }

    section("9) Owner durum ekranı + diğer kayıtlar");
    {
      const st = await call(statusRoute.GET, "/api/admin/email-status", "GET", null, { "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sOwner}` });
      const vp = st.json.verifyPilot as J | undefined;
      ok(st.status === 200 && vp?.configured === "set" && vp?.eligible === true && !st.text.includes(P) && !st.text.includes(PE), "Owner ekranı: pilot tanımlı + uygun; kimlik / adres DÖNMEZ", vp);
      const others1 = await snapOthers();
      ok(JSON.stringify(others0) === JSON.stringify(others1), "pilot dışındaki kullanıcıların kayıtları ve oturumları DEĞİŞMEDİ");
      ok(mails().every((m) => m.to === PE), "bütün koşu boyunca iletiler YALNIZ pilotun kayıtlı adresine", [...new Set(mails().map((m) => m.to))]);
    }
  } finally {
    await db.close();
  }
  console.log(`\nf3-dogrulama-pilotu: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("f3-dogrulama-pilotu HATA:", e instanceof Error ? e.message : e);
  console.log(`\nf3-dogrulama-pilotu: ${pass} PASS / ${fail + 1} FAIL`);
  process.exit(1);
});
