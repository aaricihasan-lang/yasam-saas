/**
 * GİRİŞ GÜVENLİĞİ F3 — Owner test iletisinin "kayıtlı test hesabı" alıcısı (EMAIL_OWNER_TEST_RECIPIENT).
 * Gerçek route (/api/admin/email-status) + gerçek PostgreSQL (en güncel F2 zinciri) + sentetik e-posta; SMTP kota bölümü
 * production sağlayıcısıyla (bağlantı AÇILMADAN kapı reddeder). Production / Turhost / gerçek hesap YOK.
 *
 * Kanıtlananlar: alıcı yalnız sunucu ayarından (istek gövdesi alıcıyı değiştiremez) · ayarsız / geçersiz / kayıtsız / demo / pasif
 * değil / arşiv / etkin olmayan hesapta gönderim YOK · yalnız Owner (Owner olmayan yönetici, uzman, CSRF reddedilir) · yanıtta tam
 * adres yok (maske) · saatte en çok 5 Owner testi (iki alıcı ortak) · SMTP 50/saat kapısı korunur · denetim kaydı (owner_test,
 * aktör Owner, alıcı yalnız özet) · uzman e-posta kapsamı ve uzman hesap / oturum kayıtları değişmez.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f3-test-alici.harness.ts
 * Negatif kontrol: F3_ALICI_NEGATIF=1 → uygunluk denetimi (etkin / demo / arşiv / pasif) test sürecinde kaldırılır (sourceMutation;
 *   üretim kodunda bayrak YOK) → demo / pasif / arşiv / etkin değil maddeleri FAIL VERMELİ.
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
const PEPPER = "f3-alici-pepper-0123456789abcdefghijklmnop";

async function main() {
  const muts = installSourceMutations([{
    envVar: "F3_ALICI_NEGATIF", file: "lib/email/ownerTestRecipient.ts", label: "test alıcısı uygunluk denetimi kaldırıldı",
    anchor: "if (!eligible || typeof u.id !== \"string\") return { ok: false, issue: \"not_eligible\" };",
    replacement: "if (typeof u.id !== \"string\") return { ok: false, issue: \"not_eligible\" };",
  }]);
  if (muts.length) console.log(`NEGATİF KONTROL (F3_ALICI_NEGATIF=1): ${muts.join(", ")}`);
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2n: true });
  const { admin } = db;
  const sink = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "f3-alici-")), "eposta.jsonl");
  try {
    // Production şemasındaki iki kolon (en küçük F2 test şemasında yok): arşiv + "Pasif" kısıtı. Veri eklemez.
    await admin.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS access_restricted_at timestamptz`);
    // SMTP saatlik kota fonksiyonu: production migration 20270130000000'den AYNEN.
    const mig = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20270130000000_admin_member_phase2.sql"), "utf8").replace(/\r\n/g, "\n");
    const a0 = mig.indexOf("CREATE TABLE IF NOT EXISTS public.auth_rate_limit_events");
    const f0 = mig.indexOf("CREATE OR REPLACE FUNCTION public.auth_rate_limit_hit(");
    const b0 = mig.indexOf("$$;", f0);
    await admin.query(`${mig.slice(a0, b0 + 3)}\nREVOKE ALL ON FUNCTION public.auth_rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_rate_limit_hit(text, integer, integer) TO service_role;`);

    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f3-alici", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "f3-alici-rate", LOGIN_IP_PEPPER: "f3-alici-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: sink, AUTH_OTP_PEPPER: PEPPER,
    });
    delete process.env.AUTH_EMAIL_SELF_SERVICE_ROLES;
    delete process.env.EMAIL_OWNER_TEST_RECIPIENT;
    const sessionRoute = await import("@/app/api/auth/session/route");
    const statusRoute = await import("@/app/api/admin/email-status/route");
    const meEmail = await import("@/app/api/me/email-verification/route");
    const { resetEmailProviderCache } = await import("@/lib/email/provider");
    const { SMTP_HOURLY_BUCKET } = await import("@/lib/email/smtpQuota");
    const { hashRecipient } = await import("@/lib/auth/emailOtp");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 80;
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
    const mails = () => { try { return fs.readFileSync(sink, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; subject: string }); } catch { return []; } };
    const n = async (sql: string, a: unknown[] = []) => Number((await q(sql, a)).rows[0].n);
    const ageTests = () => q(`UPDATE public.auth_email_deliveries SET created_at = created_at - interval '61 minutes' WHERE purpose = 'owner_test'`);

    const sOwner = await login(EMAIL.owner);
    const sExp = await login(EMAIL.exp);
    const ADM2 = randomUUID();
    const DEMO = randomUUID();
    const tenant = (await q(`SELECT tenant_id FROM public.users WHERE id = $1`, [U.owner])).rows[0].tenant_id;
    await q(`BEGIN; SET LOCAL session_replication_role = replica;
             INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, is_super_admin) VALUES ('${ADM2}', 'f3-alici-adm2@test.local', 'admin', '${tenant}', true, 'approved', false);
             INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, is_demo_account) VALUES ('${DEMO}', 'f3-alici-demo@test.local', 'expert', '${tenant}', true, 'approved', true);
             COMMIT;`);
    const sAdm2 = randomUUID();
    await q(`INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at) VALUES ($1, $2, true, 'desktop_web', 'admin', now() + interval '1 day')`, [ADM2, sAdm2]);
    const own = { "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sOwner}` };
    const snapExp = async () => (await q(`SELECT u.email, u.password_hash, u.role, u.active, u.email_verified_at, u.mfa_required,
        (SELECT md5(coalesce(string_agg(s.id::text || s.is_active::text, ',' ORDER BY s.id), '')) FROM public.user_sessions s WHERE s.user_id = u.id) AS ses
        FROM public.users u WHERE u.id = $1`, [U.exp])).rows[0];
    const exp0 = await snapExp();
    ok(!!sOwner && !!sExp, "kurulum: Owner + uzman parola girişi");
    const send = (body: J, headers: Record<string, string> = own) => call(statusRoute.POST, "/api/admin/email-status", "POST", body, headers);
    const status = (headers: Record<string, string> = own) => call(statusRoute.GET, "/api/admin/email-status", "GET", null, headers);

    section("1) Ayar YOK → özellik kapalı");
    {
      const g = await status();
      const t = g.json.testRecipient as J | undefined;
      ok(g.status === 200 && t?.available === false && t?.issue === "not_configured" && t?.masked === null, "durum: test alıcısı yok (not_configured)", t);
      const before = mails().length;
      const p = await send({ action: "test", target: "test_account" });
      ok(p.status === 409 && p.json.code === "TEST_RECIPIENT_UNAVAILABLE" && mails().length === before, "gönderim reddedildi (409), ileti YOK", p.json);
      ok(await n(`SELECT count(*)::int n FROM public.auth_email_deliveries`) === 0, "teslim kaydı oluşmadı (kota harcanmadı)");
    }

    section("2) Geçersiz / kayıtsız / uygun olmayan alıcı → gönderim YOK");
    for (const [v, issue, prep, undo] of [
      ["kotu adres", "invalid_address", null, null],
      ["kayitsiz@ornek.test", "not_registered", null, null],
      ["f3-alici-demo@test.local", "not_eligible", null, null],
      ["f3-alici-adm2@test.local", "ok", null, null],
      [EMAIL.exp, "not_eligible", `UPDATE public.users SET access_restricted_at = now() WHERE id = '${U.exp}'`, `UPDATE public.users SET access_restricted_at = NULL WHERE id = '${U.exp}'`],
      [EMAIL.exp, "not_eligible", `UPDATE public.users SET archived_at = now() WHERE id = '${U.exp}'`, `UPDATE public.users SET archived_at = NULL WHERE id = '${U.exp}'`],
      [EMAIL.exp, "not_eligible", `UPDATE public.users SET active = false WHERE id = '${U.exp}'`, `UPDATE public.users SET active = true WHERE id = '${U.exp}'`],
    ] as const) {
      process.env.EMAIL_OWNER_TEST_RECIPIENT = v;
      if (prep) await q(`BEGIN; SET LOCAL session_replication_role = replica; ${prep}; COMMIT;`);
      const g = await status();
      const t = g.json.testRecipient as J | undefined;
      if (issue === "ok") { ok(t?.available === true, `Owner olmayan yönetici hesabı da kayıtlı test hesabı olabilir (${String(t?.masked)})`); continue; }
      const before = mails().length;
      const p = await send({ action: "test", target: "test_account" });
      ok(t?.available === false && t?.issue === issue && p.status === 409 && mails().length === before, `${prep ? prep.split(" SET ")[1].split(" WHERE")[0] : v} → ${issue}, gönderim YOK`, { t, s: p.status });
      if (undo) await q(`BEGIN; SET LOCAL session_replication_role = replica; ${undo}; COMMIT;`);
    }

    section("3) Kayıtlı uzman test hesabı → yalnız o adrese tek ileti");
    process.env.EMAIL_OWNER_TEST_RECIPIENT = `  ${EMAIL.exp.toUpperCase()} `;
    {
      const g = await status();
      const t = g.json.testRecipient as J | undefined;
      ok(t?.available === true && typeof t?.masked === "string" && t?.masked !== EMAIL.exp && !g.text.includes(EMAIL.exp), "durum: maskeli alıcı; yanıtta tam adres YOK", t);
      const before = mails().length;
      const p = await send({ action: "test", target: "test_account", to: "saldirgan@kotu.example", email: "saldirgan@kotu.example", recipient: EMAIL.owner });
      const got = mails().slice(before);
      ok(p.status === 200 && p.json.ok === true && got.length === 1 && got[0].to === EMAIL.exp, "200; gövdedeki to/email/recipient YOK SAYILDI, ileti yalnız ayardaki kayıtlı hesaba", { s: p.status, to: got.map((x) => x.to) });
      ok(!/[0-9]{6} — /.test(got[0]?.subject ?? ""), "iletide doğrulama kodu YOK (owner_test şablonu)");
      const d = (await q(`SELECT purpose, provider, state, user_id, to_hash FROM public.auth_email_deliveries ORDER BY id DESC LIMIT 1`)).rows[0];
      ok(d?.purpose === "owner_test" && d?.state === "sent" && d?.user_id === U.owner && d?.to_hash === hashRecipient(EMAIL.exp, PEPPER),
        "denetim kaydı: owner_test, aktör Owner, alıcı yalnız özet (adres yok), sent", { p: d?.purpose, s: d?.state, owner: d?.user_id === U.owner });
      const self = await send({ action: "test" });
      ok(self.status === 200 && mails()[mails().length - 1]?.to === EMAIL.owner, "mevcut 'kendime test' davranışı değişmedi (Owner'ın kendi adresi)");
      const bad = await send({ action: "test", target: "baskasi" });
      ok(bad.status === 400, "tanınmayan alıcı seçimi → 400", bad.status);
    }

    section("4) Yetki: yalnız Owner; CSRF");
    {
      const before = mails().length;
      const a2 = await send({ action: "test", target: "test_account" }, { "x-admin-id": ADM2, cookie: `__Host-yasam_sid=${sAdm2}` });
      const ex = await send({ action: "test", target: "test_account" }, { "x-admin-id": U.exp, cookie: `__Host-yasam_sid=${sExp}` });
      const imp = await send({ action: "test", target: "test_account" }, { "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sExp}` });
      const csrf = await send({ action: "test", target: "test_account" }, { ...own, origin: "https://kotu.example", "sec-fetch-site": "cross-site" });
      const g2 = await status({ "x-admin-id": ADM2, cookie: `__Host-yasam_sid=${sAdm2}` });
      ok([a2, ex, imp, csrf].every((r) => r.status === 401 || r.status === 403) && mails().length === before, "Owner olmayan yönetici / uzman / Owner kimliği taklidi / başka site → reddedildi, ileti YOK",
        [a2.status, ex.status, imp.status, csrf.status]);
      ok((g2.status === 401 || g2.status === 403) && !g2.text.includes("testRecipient"), "Owner olmayan yönetici test alıcısı bilgisini göremez", g2.status);
    }

    section("5) Saatte en çok 5 Owner testi (iki alıcı ORTAK sınır)");
    {
      await ageTests();
      const outs: number[] = [];
      for (let i = 0; i < 6; i++) outs.push((await send({ action: "test", target: i % 2 ? "self" : "test_account" })).status);
      ok(JSON.stringify(outs) === "[200,200,200,200,200,429]", "5 test geçti, 6. → 429 (kendime + test hesabı birlikte sayılır)", outs);
    }

    section("6) SMTP 50/saat kapısı test hesabı alıcısında da geçerli (production sağlayıcısı; bağlantı açılmaz)");
    {
      await ageTests();
      Object.assign(process.env, { EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.ornek-alan.test", SMTP_PORT: "465", SMTP_USER: "info@ornek-alan.test", SMTP_SENDER: "info@ornek-alan.test", SMTP_PASSWORD: "Sahte-F3-Alici-Parola!" });
      resetEmailProviderCache();
      await q(`INSERT INTO public.auth_rate_limit_events (bucket, created_at) SELECT $1, now() - (g || ' seconds')::interval FROM generate_series(1, 50) g`, [SMTP_HOURLY_BUCKET]).catch(async () => {
        for (let i = 0; i < 50; i++) await q(`INSERT INTO public.auth_rate_limit_events (bucket) VALUES ($1)`, [SMTP_HOURLY_BUCKET]);
      });
      const before = mails().length;
      const p = await send({ action: "test", target: "test_account" });
      const d = (await q(`SELECT state, error_code FROM public.auth_email_deliveries ORDER BY id DESC LIMIT 1`)).rows[0];
      ok(p.status === 503 && p.json.code === "quota" && d?.state === "failed" && d?.error_code === "quota" && mails().length === before,
        "son 1 saatte 50 SMTP gönderimi varken → quota; sunucuya bağlanılmadı, ileti yok", { s: p.status, c: p.json.code, d });
      ok(!p.text.includes("Sahte-F3-Alici-Parola!"), "yanıtta SMTP parolası YOK");
      Object.assign(process.env, { EMAIL_PROVIDER: "synthetic" });
      resetEmailProviderCache();
    }

    section("7) Uzmanlara e-posta özellikleri açılmadı; uzman kayıtları değişmedi");
    {
      const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, { "x-user-id": U.exp, cookie: `__Host-yasam_sid=${sExp}` });
      ok(s.status === 403 && s.json.code === "METHOD_NOT_IN_SCOPE", "test hesabı (uzman) kendi e-posta doğrulamasını yine BAŞLATAMAZ (kapsam yalnız Owner)", s.json.code);
      const exp1 = await snapExp();
      ok(JSON.stringify(exp0) === JSON.stringify(exp1), "uzmanın e-postası, parola özeti, rolü, doğrulama / MFA durumu ve oturumları DEĞİŞMEDİ");
    }
  } finally {
    await db.close();
  }
  console.log(`\nf3-test-alici: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("f3-test-alici HATA:", e instanceof Error ? e.message : e);
  console.log(`\nf3-test-alici: ${pass} PASS / ${fail + 1} FAIL`);
  process.exit(1);
});
