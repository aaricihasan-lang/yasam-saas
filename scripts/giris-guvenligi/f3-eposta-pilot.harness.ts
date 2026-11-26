/**
 * GİRİŞ GÜVENLİĞİ F3 — E-POSTA DOĞRULAMA PİLOTU (tek uzman hesabı; Owner 26.11.2026).
 * Gerçek route'lar (/api/me/email-verification, /api/me/email-change, /api/admin/email-status, /api/auth/session) + gerçek
 * PostgreSQL (en güncel F2 zinciri) + SENTETİK e-posta sağlayıcısı. Gerçek posta sunucusu / production / gerçek hesap YOK.
 *
 * Kanıtlananlar:
 *   · ayar (tek UUID + adres özeti) eksik / geçersiz / çoklu → pilot KAPALI (genişletilemez); DB okuma hatası → KAPALI;
 *   · pilot uzman YALNIZ kayıtlı adres doğrulamasını yapar; adres değişikliği / bildirim / MFA AÇILMAZ, mfa_required değişmez,
 *     oturumlar ve diğer kayıtlar değişmez; kod yalnız kayıtlı adrese gider, yanıtta / DB'de düz kod yok;
 *   · OTP kuralları aynen: 3 dk geçerlilik, 60 sn yeniden gönderim, 5 hatalı denemede kilit, günlük sınır, hashli saklama, teslim kaydı;
 *   · kod başka kullanıcıya / başka işleme (login) / başka adrese uygulanamaz; adres değişince pilot kapanır;
 *   · uygunluk DB'den: pasif yapılan / girişi kapatılan / arşivlenen / onayı kalkan / demo işaretlenen pilot hesap KAPALI;
 *   · diğer uzmanlar, Owner olmayan yönetici, demo hesabı ve Owner'ın mevcut yetkileri AYNEN;
 *   · kimlik taklidi (IDOR), gövdeye kimlik / alıcı yazmak ve başka siteden istek (CSRF) reddedilir, e-posta gitmez;
 *   · Owner durum ekranı pilot durumunu gösterir; kimlik / adres / özet DÖNMEZ.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f3-eposta-pilot.harness.ts
 * Negatif kontrol: F3_PILOT_NEGATIF=1 → pilot kararı bu test sürecinde "her zaman açık" kopyayla değiştirilir
 *   (sourceMutation.ts; üretim kodunda bayrak YOK) → başka uzman / uygunluk maddeleri FAIL VERMELİ.
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
const PEPPER = "f3-pilot-pepper-0123456789abcdefghijklmnopq";

async function main() {
  const muts = installSourceMutations([{
    envVar: "F3_PILOT_NEGATIF", file: "lib/auth/emailVerifyPilot.ts", label: "pilot kararı kaldırıldı (her zaman açık)",
    anchor: "  const cfg = emailVerifyPilotConfig(env);\n  if (!cfg) return { allowed: false, reason: \"not_configured\" };",
    replacement: "  return { allowed: true, reason: \"ok\" };\n  const cfg = emailVerifyPilotConfig(env);\n  if (!cfg) return { allowed: false, reason: \"not_configured\" };",
  }]);
  if (muts.length) console.log(`NEGATİF KONTROL (F3_PILOT_NEGATIF=1): ${muts.join(", ")}`);
  const P = await import("@/lib/auth/emailVerifyPilot");
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const ID = U.exp, ADDR = EMAIL.exp;
  const HASH = P.pilotEmailHash(ADDR);

  section("1) Ayar çözümleme (saf) — genişletilemez, fail-closed");
  {
    ok(P.emailVerifyPilotConfig({}) === null, "tanımsız → kapalı");
    ok(P.emailVerifyPilotConfig({ AUTH_EMAIL_VERIFY_PILOT_USER_ID: ID }) === null, "yalnız kimlik (özet yok) → kapalı");
    ok(P.emailVerifyPilotConfig({ AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256: HASH }) === null, "yalnız özet (kimlik yok) → kapalı");
    ok(P.emailVerifyPilotConfig({ AUTH_EMAIL_VERIFY_PILOT_USER_ID: `${ID},${U.free}`, AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256: HASH }) === null, "iki kimlik (virgül) → kapalı (çoklu açılamaz)");
    ok(P.emailVerifyPilotConfig({ AUTH_EMAIL_VERIFY_PILOT_USER_ID: "*", AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256: HASH }) === null, "joker → kapalı");
    ok(P.emailVerifyPilotConfig({ AUTH_EMAIL_VERIFY_PILOT_USER_ID: ID, AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256: ADDR }) === null, "özet yerine düz adres → kapalı");
    const c = P.emailVerifyPilotConfig({ AUTH_EMAIL_VERIFY_PILOT_USER_ID: ` ${ID.toUpperCase()} `, AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256: HASH.toUpperCase() });
    ok(c?.userId === ID && c?.emailHash === HASH, "büyük harf / boşluk normalleştirilir");
    ok(P.pilotEmailHash(`  ${ADDR.toUpperCase()} `) === HASH && /^[0-9a-f]{64}$/.test(HASH), "adres özeti küçük harf + kırpma ile");
    const env = { AUTH_EMAIL_VERIFY_PILOT_USER_ID: ID, AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256: HASH };
    const errDb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "column does not exist" } }) }) }) }) } as never;
    const throwDb = { from: () => { throw new Error("ağ"); } } as never;
    ok((await P.emailVerifyPilotDecision(errDb, ID, env)).reason === "lookup_failed", "DB okuma hatası (ör. eksik kolon) → KAPALI");
    ok(!(await P.emailVerifyPilotAllowed(throwDb, ID, env)), "DB istisnası → KAPALI");
    ok((await P.emailVerifyPilotDecision(errDb, U.free, env)).reason === "other_user", "başka kullanıcı → DB'ye sorulmadan KAPALI");
  }

  const db = await startF2cDb({ withF2n: true });
  const { admin } = db;
  const sink = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "f3-pilot-")), "eposta.jsonl");
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f3-pilot", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "f3-pilot-rate", LOGIN_IP_PEPPER: "f3-pilot-ip",
      REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: sink, AUTH_OTP_PEPPER: PEPPER,
      AUTH_EMAIL_VERIFY_PILOT_USER_ID: ID, AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256: HASH,
    });
    delete process.env.AUTH_EMAIL_SELF_SERVICE_ROLES; // kapsam varsayılanı: yalnız Owner
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    // Production şemasıyla aynı: 4a arşiv + üye pasifleştirme kolonları (F2 test zincirinde yok; yalnız fikstür).
    await q(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL, ADD COLUMN IF NOT EXISTS access_restricted_at timestamptz NULL`);
    const sessionRoute = await import("@/app/api/auth/session/route");
    const meEmail = await import("@/app/api/me/email-verification/route");
    const meChange = await import("@/app/api/me/email-change/route");
    const emailStatus = await import("@/app/api/admin/email-status/route");
    const { sendSecurityNotice } = await import("@/lib/auth/securityNotice");
    const { verifyOtp } = await import("@/lib/auth/emailOtp");
    const { getServerDb } = await import("@/lib/supabase-server");
    let ip = 40;
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
    const loginRes = (email: string) => call(sessionRoute.POST, "/api/auth/session", "POST", { email, password: pw(email) });
    const login = async (email: string) => cookieVal((await loginRes(email)).set, "__Host-yasam_sid");
    const self = (id: string, sid: string) => ({ "x-user-id": id, cookie: `__Host-yasam_sid=${sid}` });
    const mails = () => { try { return fs.readFileSync(sink, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; subject: string }); } catch { return []; } };
    const lastCode = (to: string) => { const m = mails().filter((x) => x.to.toLowerCase() === to.toLowerCase()); return /([0-9]{6})/.exec(m[m.length - 1]?.subject ?? "")?.[1] ?? ""; };
    const n = async (sql: string, a: unknown[] = []) => Number((await q(sql, a)).rows[0].n);
    const otps = (id: string) => n(`SELECT count(*)::int n FROM public.auth_email_otps WHERE user_id = $1`, [id]);
    const deliveries = (id: string) => n(`SELECT count(*)::int n FROM public.auth_email_deliveries WHERE user_id = $1`, [id]);
    const skipCooldown = (id: string) => q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [id]);
    const send = (id: string, sid: string, extra: J = {}) => call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send", ...extra }, self(id, sid));
    const confirm = (id: string, sid: string, code: string) => call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code }, self(id, sid));
    const get = (id: string, sid: string) => call(meEmail.GET, "/api/me/email-verification", "GET", null, self(id, sid));
    const userRow = (id: string) => q(`SELECT email, email_verified_at, mfa_required, active, role, approval_status FROM public.users WHERE id = $1`, [id]).then((r) => r.rows[0]);

    // Sentetik ek hesaplar: ikinci uzman (pilot DIŞI) + Owner olmayan yönetici + demo uzman.
    const EXP2 = randomUUID(), ADM2 = randomUUID(), DEMO = randomUUID();
    const tenant = (await q(`SELECT tenant_id FROM public.users WHERE id = $1`, [U.owner])).rows[0].tenant_id;
    const tenant2 = (await q(`SELECT tenant_id FROM public.users WHERE id = $1`, [ID])).rows[0].tenant_id;
    await q(`BEGIN; SET LOCAL session_replication_role = replica;
             INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, is_super_admin) VALUES ('${ADM2}', 'pilot-adm2@test.local', 'admin', '${tenant}', true, 'approved', false);
             COMMIT;`);
    await q(`INSERT INTO public.users (id, email, role, tenant_id, active, approval_status) VALUES ($1, 'pilot-exp2@test.local', 'expert', $2, true, 'approved')`, [EXP2, tenant2]);
    await q(`INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, is_demo_account) VALUES ($1, 'pilot-demo@test.local', 'expert', $2, true, 'approved', true)`, [DEMO, tenant]);
    const directSession = async (id: string, role: string) => {
      const sid = randomUUID();
      await q(`INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at)
               VALUES ($1, $2, true, 'desktop_web', $3, now() + interval '1 day')`, [id, sid, role]);
      return sid;
    };
    await q(`UPDATE public.users SET email_verified_at = NULL, mfa_required = false WHERE id = ANY($1::uuid[])`, [[U.owner, ID, EXP2]]);
    const sOwner = await login(EMAIL.owner);
    const sPilot = await login(ADDR);
    const sExp2 = await directSession(EXP2, "expert");
    const sAdm2 = await directSession(ADM2, "admin");
    const sDemo = await directSession(DEMO, "expert");
    ok(!!sOwner && !!sPilot && !!sExp2 && !!sAdm2 && !!sDemo, "kurulum: Owner + pilot uzman (parola girişi), ikinci uzman + ikinci yönetici + demo oturumu");
    const sessCount = () => n(`SELECT count(*)::int n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [ID]);
    const pilotSessions0 = await sessCount();
    const otherSnap = async () => (await q(`SELECT md5(string_agg(id::text||coalesce(email,'')||coalesce(email_verified_at::text,'')||coalesce(mfa_required::text,'')||coalesce(active::text,''), '|' ORDER BY id)) h FROM public.users WHERE id <> $1`, [ID])).rows[0].h;
    const others0 = await otherSnap();

    section("2) Pilot uzman: yalnız doğrulama açık; adres değişikliği / bildirim kapalı");
    {
      const g = await get(ID, sPilot);
      ok(g.status === 200 && g.json.available === true && g.json.changeAvailable === false && g.json.verified === false, "pilot: doğrulama AÇIK, adres değişikliği KAPALI", g.json);
      ok(!g.text.includes(ADDR) && !g.text.includes(HASH), "yanıtta tam adres / özet YOK (yalnız maske)");
      const ch = await call(meChange.POST, "/api/me/email-change", "POST", { action: "start", newEmail: "pilot-yeni@test.local", password: pw(ADDR) }, self(ID, sPilot));
      ok(ch.status === 403 && ch.json.code === "METHOD_NOT_IN_SCOPE", "pilot adres değişikliği → 403 (pilot AÇMAZ)", ch);
      const before = mails().length;
      const sn = await sendSecurityNotice(getServerDb(), { userId: ID, to: ADDR, name: null, kind: "recovery_codes_generated" });
      ok(sn === false && mails().length === before, "pilot hesaba güvenlik bildirimi GİTMEZ (kapsam aynen)");
    }

    section("3) Pilot doğrulama akışı + OTP kuralları (aynen)");
    {
      const s = await send(ID, sPilot, { email: "saldirgan@kotu.example", to: "saldirgan@kotu.example", userId: EXP2 });
      const code = lastCode(ADDR);
      ok(s.status === 200 && s.json.sent === true && !!code && !s.text.includes(code), "kod gönderildi; yanıtta kod YOK", s.json);
      ok(mails().length >= 1 && mails().every((m) => m.to === ADDR) && !mails().some((m) => /kotu\.example/.test(m.to)), "kod YALNIZ kayıtlı adrese gitti (gövdedeki alıcı / kimlik yok sayıldı)");
      const o = (await q(`SELECT purpose, code_hash, state, extract(epoch FROM expires_at - created_at)::int ttl FROM public.auth_email_otps WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [ID])).rows[0];
      ok(o.purpose === "verify_email" && o.ttl === 180 && o.state === "active", "kayıt: amaç verify_email, geçerlilik 3 dakika", o);
      ok(typeof o.code_hash === "string" && o.code_hash.length >= 32 && !o.code_hash.includes(code), "kod HASHLİ saklanıyor (düz kod yok)");
      const d = (await q(`SELECT purpose, to_hash, state FROM public.auth_email_deliveries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [ID])).rows[0];
      ok(d.purpose === "verify_email" && !String(d.to_hash).includes("@") && d.state === "sent", "teslim kaydı (denetim): amaç + alıcı özeti + durum", d);
      const again = await send(ID, sPilot);
      ok(again.status === 429 && again.json.code === "COOLDOWN", "60 sn dolmadan yeniden gönderim → 429 (bekleme süresi)", again.json);
      // Başka işleme (login) uygulanamaz:
      const asLogin = await verifyOtp(getServerDb(), { userId: ID, purpose: "login", challengeId: randomUUID(), code, email: ADDR });
      ok(!asLogin.ok, "aynı kod giriş (login) amacında GEÇMEZ", asLogin);
      // Başka kullanıcıya uygulanamaz (kapsam geçici genişletilse bile):
      process.env.AUTH_EMAIL_SELF_SERVICE_ROLES = "owner,expert";
      const other = await confirm(EXP2, sExp2, code);
      delete process.env.AUTH_EMAIL_SELF_SERVICE_ROLES;
      ok(other.status === 400 && (await userRow(EXP2)).email_verified_at === null, "pilotun kodu başka uzmanda GEÇMEZ (kullanıcıya bağlı)", other.json);
      // Yanlış kod + kalan deneme
      const wrong = await confirm(ID, sPilot, code === "000000" ? "111111" : "000000");
      ok(wrong.status === 400 && wrong.json.code === "OTP_WRONG" && /Kalan deneme: 4/.test(String(wrong.json.error)), "yanlış kod → 400, kalan deneme 4", wrong.json);
      const okc = await confirm(ID, sPilot, code);
      const u = await userRow(ID);
      ok(okc.status === 200 && okc.json.verified === true && u.email_verified_at !== null, "doğru kod → pilot uzmanın adresi DOĞRULANDI", okc.json);
      ok(u.mfa_required === false && u.email === ADDR && u.active === true && u.role === "expert", "MFA zorunluluğu AÇILMADI; adres / rol / durum değişmedi", u);
      ok((await sessCount()) === pilotSessions0, "pilot uzmanın oturumları DEĞİŞMEDİ");
      const lg = await loginRes(ADDR);
      ok(lg.status === 200 && !lg.json.mfaRequired && !!cookieVal(lg.set, "__Host-yasam_sid"), "doğrulama sonrası giriş MFA istemeden aynen", lg.json);
      const reuse = await confirm(ID, sPilot, code);
      ok(reuse.status === 200 && reuse.json.verified === true && (await otps(ID)) >= 1, "doğrulanmış hesapta tekrar istek yeni kod üretmez (verified döner)");
      ok((await otherSnap()) === others0, "diğer bütün kullanıcıların adres / doğrulama / MFA / durum alanları DEĞİŞMEDİ");
    }

    section("4) Kilit, süre dolumu, günlük sınır (yeni doğrulama için durum sıfırlanır — yalnız fikstür)");
    {
      await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = $1`, [ID]);
      await skipCooldown(ID);
      await send(ID, sPilot);
      let lastWrong: J = {};
      for (let i = 0; i < 5; i++) lastWrong = (await confirm(ID, sPilot, "000001")).json;
      const after = await confirm(ID, sPilot, lastCode(ADDR));
      ok(String(lastWrong.code) === "OTP_LOCKED" || String(after.json.code) === "OTP_LOCKED" || String(after.json.code) === "OTP_NO_CODE", "5 hatalı denemeden sonra kod KİLİTLİ; doğru kod da geçmez", { lastWrong, after: after.json });
      ok((await userRow(ID)).email_verified_at === null, "kilitte doğrulama olmadı");
      await skipCooldown(ID);
      await send(ID, sPilot);
      const code = lastCode(ADDR);
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '4 minutes', expires_at = expires_at - interval '4 minutes' WHERE user_id = $1 AND state = 'active'`, [ID]);
      const exp = await confirm(ID, sPilot, code);
      ok(exp.status === 400 && /OTP_(EXPIRED|NO_CODE)/.test(String(exp.json.code)), "süresi dolan kod GEÇMEZ", exp.json);
      await skipCooldown(ID);
      const used = await n(`SELECT count(*)::int n FROM public.auth_email_deliveries WHERE created_at > now() - interval '24 hours'`);
      process.env.EMAIL_DAILY_LIMIT = String(used);
      const capped = await send(ID, sPilot);
      delete process.env.EMAIL_DAILY_LIMIT;
      ok(capped.status === 503 && /QUOTA/.test(String(capped.json.code)), "günlük sınır doluysa gönderim yok (503)", capped.json);
    }

    section("5) Başka adrese uygulanamaz: adres değişirse kod geçmez ve pilot kapanır");
    {
      await skipCooldown(ID);
      await send(ID, sPilot);
      const code = lastCode(ADDR);
      await q(`UPDATE public.users SET email = 'pilot-degisti@test.local' WHERE id = $1`, [ID]);
      const c = await confirm(ID, sPilot, code);
      const g = await get(ID, sPilot);
      ok(c.status === 403 && g.json.available === false, "adres değişince (özet tutmuyor) pilot KAPALI; eski kod uygulanamaz", { c: c.status, g: g.json });
      ok((await userRow(ID)).email_verified_at === null, "doğrulama olmadı");
      await q(`UPDATE public.users SET email = $2 WHERE id = $1`, [ID, ADDR]);
    }

    section("6) Uygunluk veritabanından (her istekte)");
    {
      const cases: [string, string, string][] = [
        ["Pasif (erişim kısıtı)", `access_restricted_at = now()`, `access_restricted_at = NULL`],
        ["girişi kapalı (active=false)", `active = false`, `active = true`],
        ["arşivde", `archived_at = now()`, `archived_at = NULL`],
        ["onay bekliyor", `approval_status = 'pending'`, `approval_status = 'approved'`],
        ["demo işaretli", `is_demo_account = true`, `is_demo_account = false`],
      ];
      for (const [label, on, off] of cases) {
        await q(`BEGIN; SET LOCAL session_replication_role = replica; UPDATE public.users SET ${on} WHERE id = '${ID}'; COMMIT;`);
        const d = await P.emailVerifyPilotDecision(getServerDb(), ID);
        await q(`BEGIN; SET LOCAL session_replication_role = replica; UPDATE public.users SET ${off} WHERE id = '${ID}'; COMMIT;`);
        ok(!d.allowed && d.reason === "not_eligible", `${label} → pilot KAPALI`, d);
      }
      const back = await P.emailVerifyPilotDecision(getServerDb(), ID);
      ok(back.allowed, "uygun duruma dönünce pilot yeniden açık (ayar aynı)");
    }

    section("7) Diğer hesaplar AYNEN");
    {
      const before = mails().length;
      const g2 = await get(EXP2, sExp2);
      const s2 = await send(EXP2, sExp2);
      ok(g2.json.available === false && s2.status === 403 && s2.json.code === "METHOD_NOT_IN_SCOPE", "pilot dışı uzman: kapalı (403)", { g: g2.json, s: s2.status });
      const a2 = await send(ADM2, sAdm2);
      ok(a2.status === 403, "Owner olmayan yönetici: kapalı");
      const dm = await send(DEMO, sDemo);
      const dg = await get(DEMO, sDemo);
      ok(dm.status === 403 && dg.json.available === false, "demo: kapalı");
      const go = await get(U.owner, sOwner);
      ok(go.json.available === true && go.json.changeAvailable === true, "Owner: doğrulama + adres değişikliği AÇIK (değişmedi)", go.json);
      ok(mails().length === before && (await deliveries(EXP2)) === 0 && (await deliveries(ADM2)) === 0 && (await deliveries(DEMO)) === 0, "bu hesaplara HİÇ e-posta gitmedi");
      // Pilot kimliği başka bir uzmanın kimliğine ayarlansa bile (yanlış ayar) adres özeti tutmadıkça açılmaz:
      process.env.AUTH_EMAIL_VERIFY_PILOT_USER_ID = EXP2;
      const wrongCfg = await get(EXP2, sExp2);
      process.env.AUTH_EMAIL_VERIFY_PILOT_USER_ID = ID;
      ok(wrongCfg.json.available === false, "kimlik başka uzmana çevrilse de adres özeti tutmadığı için KAPALI");
    }

    section("8) Kimlik taklidi (IDOR) ve başka siteden istek (CSRF)");
    {
      const before = mails().length;
      const imp = await send(ID, sExp2);
      ok(imp.status === 401 || imp.status === 403, "ikinci uzmanın oturumu + pilot kimliği başlığı → reddedildi", imp.status);
      const imp2 = await send(EXP2, sExp2, { userId: ID, email: ADDR });
      ok(imp2.status === 403, "ikinci uzman gövdeye pilot kimliği / adresi yazsa da kapalı", imp2.status);
      const imp3 = await send(EXP2, sPilot);
      ok(imp3.status === 401 || imp3.status === 403, "pilot oturumu + başka uzman kimliği → reddedildi", imp3.status);
      await skipCooldown(ID);
      const csrf = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, { ...self(ID, sPilot), origin: "https://kotu-site.example", "sec-fetch-site": "cross-site" });
      ok(csrf.status === 403, "pilot çerezi + başka site kaynağı → 403 (CSRF)", csrf.status);
      ok(mails().length === before, "bu isteklerin hiçbiri e-posta göndermedi");
    }

    section("9) Owner durum ekranı + geri alma");
    {
      const st = await call(emailStatus.GET, "/api/admin/email-status", "GET", null, { "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sOwner}` });
      const vp = st.json.verifyPilot as { configured?: boolean; eligible?: boolean; reason?: string } | undefined;
      ok(st.status === 200 && vp?.configured === true && vp?.eligible === true && vp?.reason === "ok", "durum: pilot ayarlı + uygun", vp);
      ok(!st.text.includes(ID) && !st.text.includes(ADDR) && !st.text.includes(HASH) && !st.text.includes(PEPPER), "yanıtta pilot kimliği / adres / özet / pepper YOK");
      const sc = st.json.selfServiceScope as { roles?: string[] } | undefined;
      ok(JSON.stringify(sc?.roles) === '["owner"]', "genel kapsam hâlâ yalnız owner");
      await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [ID]);
      delete process.env.AUTH_EMAIL_VERIFY_PILOT_USER_ID;
      delete process.env.AUTH_EMAIL_VERIFY_PILOT_EMAIL_SHA256;
      const g = await get(ID, sPilot);
      const s = await send(ID, sPilot);
      ok(g.json.available === false && g.json.verified === true && s.status === 403, "ayar silinince pilot KAPALI; doğrulanmış durum korunur", { g: g.json, s: s.status });
      const st2 = await call(emailStatus.GET, "/api/admin/email-status", "GET", null, { "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sOwner}` });
      ok((st2.json.verifyPilot as { configured?: boolean })?.configured === false, "durum: pilot ayarlı değil");
    }
  } finally {
    await db.close();
  }
  console.log(`\nf3-eposta-pilot: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("f3-eposta-pilot HATA:", e instanceof Error ? e.message : e);
  console.log(`\nf3-eposta-pilot: ${pass} PASS / ${fail + 1} FAIL`);
  process.exit(1);
});
