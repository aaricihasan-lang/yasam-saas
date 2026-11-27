/**
 * GİRİŞ GÜVENLİĞİ F3 (Görev A) — kullanıcı e-postası işlemlerinin kapsamı: AUTH_EMAIL_SELF_SERVICE_ROLES (varsayılan yalnız Owner).
 * Gerçek route'lar (/api/me/email-verification, /api/me/email-change, /api/admin/email-status) + gerçek PostgreSQL (en güncel
 * F2 zinciri) + SENTETİK e-posta sağlayıcısı. Gerçek posta sunucusu / production / gerçek hesap YOK.
 *
 * Kanıtlananlar:
 *   · varsayılan kapsamda Owner doğrulayabilir; uzman, Owner olmayan yönetici ve demo hesabı doğrulayamaz / adres değiştiremez
 *     (sunucu 403 METHOD_NOT_IN_SCOPE; e-posta GİTMEZ, kod / teslim kaydı OLUŞMAZ, parola denenmez) — yalnız arayüz gizlemesi değil;
 *   · Owner kararı istekteki başlık / gövdeden değil DB işaretinden (auth_is_owner_admin); işaret kalkınca Owner da kapalı;
 *   · başka kullanıcının kimliğiyle istek (IDOR) ve başka siteden istek (CSRF) reddedilir, e-posta gitmez;
 *   · yanlış yazılmış değer kapsamı GENİŞLETMEZ; "owner,expert" ile açılan kapsam eski akışı aynen çalıştırır (geri alınabilir);
 *   · kapsam dışı alıcıya güvenlik bildirimi gitmez, security_events'e "scope_closed" kaydı düşer;
 *   · Owner durum ekranı kapsamı gösterir, gizli değer döndürmez.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f3-eposta-kapsam.harness.ts
 * Negatif kontrol: F3_KAPSAM_NEGATIF=1 → kapsam kararı (emailSelfServiceAllowed) bu test sürecinde "her zaman açık" kopyayla
 *   değiştirilir (sourceMutation.ts; üretim kodunda bayrak YOK) → uzman / yönetici / bildirim maddeleri FAIL VERMELİ.
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
const PEPPER = "f3-kapsam-pepper-0123456789abcdefghijklmnop";

async function main() {
  const muts = installSourceMutations([{
    envVar: "F3_KAPSAM_NEGATIF", file: "lib/auth/emailSelfService.ts", label: "kapsam denetimi kaldırıldı (her zaman açık)",
    anchor: "  const { roles } = emailSelfServiceScope(env);\n  const r = String(role ?? \"\").trim().toLowerCase();",
    replacement: "  return true;\n  const { roles } = emailSelfServiceScope(env);\n  const r = String(role ?? \"\").trim().toLowerCase();",
  }]);
  if (muts.length) console.log(`NEGATİF KONTROL (F3_KAPSAM_NEGATIF=1): ${muts.join(", ")}`);
  const { emailSelfServiceScope, emailSelfServiceAllowed } = await import("@/lib/auth/emailSelfService");

  section("1) Bayrak çözümleme (saf)");
  {
    const d = emailSelfServiceScope({});
    ok(JSON.stringify(d.roles) === '["owner"]' && d.isDefault, "tanımsız → yalnız owner (varsayılan)", d);
    const e = emailSelfServiceScope({ AUTH_EMAIL_SELF_SERVICE_ROLES: " Owner , EXPERT " });
    ok(JSON.stringify(e.roles) === '["owner","expert"]' && !e.isDefault, "büyük/küçük harf + boşluk: owner,expert", e);
    const t = emailSelfServiceScope({ AUTH_EMAIL_SELF_SERVICE_ROLES: "experts,ownr,*" });
    ok(JSON.stringify(t.roles) === '["owner"]' && t.isDefault && t.ignored === 3, "yanlış yazım / joker kapsamı GENİŞLETMEZ → owner (3 değer yok sayıldı)", t);
    ok(JSON.stringify(emailSelfServiceScope({ AUTH_EMAIL_SELF_SERVICE_ROLES: " , ," }).roles) === '["owner"]', "yalnız virgül/boşluk → owner");
    let calls = 0;
    const okDb = { rpc: async () => { calls++; return { data: true, error: null }; } } as never;
    const errDb = { rpc: async () => ({ data: null, error: { message: "x" } }) } as never;
    const throwDb = { rpc: async () => { throw new Error("ağ"); } } as never;
    ok(!(await emailSelfServiceAllowed(okDb, "u", "expert", {})) && calls === 0, "varsayılanda uzman kapalı (DB'ye sorulmadan)");
    ok(await emailSelfServiceAllowed(okDb, "u", "admin", {}), "varsayılanda DB işareti Owner olan yönetici açık");
    ok(!(await emailSelfServiceAllowed(errDb, "u", "admin", {})), "Owner sorgusu hata → KAPALI (fail-closed)");
    ok(!(await emailSelfServiceAllowed(throwDb, "u", "admin", {})), "Owner sorgusu istisna → KAPALI (fail-closed)");
    ok(!(await emailSelfServiceAllowed(okDb, "u", "client", { AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" })), "tanınmayan rol her kapsamda kapalı");
    ok(await emailSelfServiceAllowed(okDb, "u", "expert", { AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,expert" }), "owner,expert → uzman açık");
  }

  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2n: true });
  const { admin } = db;
  const sink = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "f3-kapsam-")), "eposta.jsonl");
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f3-kapsam", SESSION_COOKIE_MODE: "primary",
      SESSION_COOKIE_ALLOWED_ORIGINS: ORIGIN, RATE_LIMIT_SECRET: "f3-kapsam-rate", LOGIN_IP_PEPPER: "f3-kapsam-ip",
      REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", EMAIL_SYNTHETIC_SINK: sink, AUTH_OTP_PEPPER: PEPPER,
    });
    delete process.env.AUTH_EMAIL_SELF_SERVICE_ROLES;
    const sessionRoute = await import("@/app/api/auth/session/route");
    const meEmail = await import("@/app/api/me/email-verification/route");
    const meChange = await import("@/app/api/me/email-change/route");
    const emailStatus = await import("@/app/api/admin/email-status/route");
    const { sendSecurityNotice } = await import("@/lib/auth/securityNotice");
    const { getServerDb } = await import("@/lib/supabase-server");
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    let ip = 30;
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
    const lastCode = (to: string) => { const m = mails().filter((x) => x.to.toLowerCase() === to.toLowerCase()); return /\b([0-9]{6})\b/.exec(m[m.length - 1]?.text ?? "")?.[1] ?? ""; };
    const n = async (sql: string, a: unknown[] = []) => Number((await q(sql, a)).rows[0].n);
    const otps = (id: string) => n(`SELECT count(*)::int n FROM public.auth_email_otps WHERE user_id = $1`, [id]);
    const deliveries = (id: string) => n(`SELECT count(*)::int n FROM public.auth_email_deliveries WHERE user_id = $1`, [id]);
    const skipCooldown = (id: string) => q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [id]);

    // Sentetik ek hesaplar: Owner OLMAYAN ikinci yönetici + demo uzman (oturumları doğrudan; parola akışı gerekmez).
    const ADM2 = randomUUID();
    const DEMO = randomUUID();
    const tenant = (await q(`SELECT tenant_id FROM public.users WHERE id = $1`, [U.owner])).rows[0].tenant_id;
    // Fikstür: yönetici yetki tetikleyicisi (F2-K) yalnız bu sentetik kurulum için tek işlemde devre dışı (kural testte gevşetilmez).
    await q(`BEGIN; SET LOCAL session_replication_role = replica;
             INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, is_super_admin) VALUES ('${ADM2}', 'f3-adm2@test.local', 'admin', '${tenant}', true, 'approved', false);
             COMMIT;`);
    await q(`INSERT INTO public.users (id, email, role, tenant_id, active, approval_status, is_demo_account) VALUES ($1, 'f3-demo@test.local', 'expert', $2, true, 'approved', true)`, [DEMO, tenant]);
    const directSession = async (id: string, role: string) => {
      const sid = randomUUID();
      await q(`INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at)
               VALUES ($1, $2, true, 'desktop_web', $3, now() + interval '1 day')`, [id, sid, role]);
      return sid;
    };
    await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = ANY($1::uuid[])`, [[U.owner, U.exp]]);
    const sOwner = await login(EMAIL.owner);
    const sExp = await login(EMAIL.exp);
    const sAdm2 = await directSession(ADM2, "admin");
    const sDemo = await directSession(DEMO, "expert");
    ok(!!sOwner && !!sExp && !!sAdm2 && !!sDemo, "kurulum: Owner + uzman (parola girişi), ikinci yönetici + demo oturumu");

    section("2) Varsayılan kapsam (değişken TANIMSIZ = yalnız Owner)");
    {
      const g = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(U.owner, sOwner));
      ok(g.status === 200 && g.json.available === true && g.json.changeAvailable === true, "Owner: doğrulama + adres değişikliği AÇIK", g.json);
      const ge = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(U.exp, sExp));
      ok(ge.status === 200 && ge.json.available === false && ge.json.changeAvailable === false && ge.json.verified === false && typeof ge.json.email === "string",
        "uzman: kapalı görünür; maskeli adres + doğrulanma bilgisi DEĞİŞMEDİ", ge.json);
      const before = mails().length;
      const se = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(U.exp, sExp));
      ok(se.status === 403 && se.json.code === "METHOD_NOT_IN_SCOPE", "uzman kod isteği → 403 METHOD_NOT_IN_SCOPE (sunucu denetimi)", se);
      const ce = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code: "123456" }, self(U.exp, sExp));
      ok(ce.status === 403, "uzman kod onayı → 403", ce.status);
      const ch = await call(meChange.POST, "/api/me/email-change", "POST", { action: "start", newEmail: "f3-yeni@test.local", password: pw(EMAIL.exp) }, self(U.exp, sExp));
      ok(ch.status === 403 && ch.json.code === "METHOD_NOT_IN_SCOPE", "uzman adres değişikliği → 403 (parola denenmedi, kod üretilmedi)", ch);
      const chc = await call(meChange.POST, "/api/me/email-change", "POST", { action: "confirm", requestId: randomUUID(), code: "123456" }, self(U.exp, sExp));
      ok(chc.status === 403, "uzman adres değişikliği onayı → 403", chc.status);
      ok(mails().length === before && (await otps(U.exp)) === 0 && (await deliveries(U.exp)) === 0, "uzmana HİÇ e-posta gitmedi; kod / teslim kaydı yok");
      const u = (await q(`SELECT email, email_verified_at FROM public.users WHERE id = $1`, [U.exp])).rows[0];
      ok(u.email === EMAIL.exp && u.email_verified_at === null, "uzmanın kayıtlı adresi ve doğrulama durumu değişmedi", u);
      const a2 = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(ADM2, sAdm2));
      const a2g = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(ADM2, sAdm2));
      ok(a2.status === 403 && a2g.json.available === false && (await deliveries(ADM2)) === 0, "Owner OLMAYAN yönetici de kapalı (rol 'admin' yetmez, DB Owner işareti gerekir)", { a2: a2.status, g: a2g.json });
      const d = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(DEMO, sDemo));
      const dg = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(DEMO, sDemo));
      ok(d.status === 403 && dg.json.available === false && (await deliveries(DEMO)) === 0, "demo hesabı kapalı (önceki demo kuralı korunur)", { d: d.status, g: dg.json });
    }

    section("3) Kimlik taklidi (IDOR/BOLA) ve başka siteden istek (CSRF)");
    {
      const before = mails().length;
      const imp = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(U.owner, sExp));
      ok(imp.status === 401 || imp.status === 403, "uzman oturumu + Owner kimliği başlığı → reddedildi", imp.status);
      const imp2 = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send", userId: U.owner, role: "owner" }, self(U.exp, sExp));
      ok(imp2.status === 403 && imp2.json.code === "METHOD_NOT_IN_SCOPE", "gövdeye userId/role yazmak kapsamı değiştirmez", imp2);
      const imp3 = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(U.exp, sOwner));
      ok(imp3.status === 401 || imp3.status === 403, "Owner oturumu + uzman kimliği → reddedildi (uzmana kod gitmez)", imp3.status);
      const csrf = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, { ...self(U.owner, sOwner), origin: "https://kotu-site.example", "sec-fetch-site": "cross-site" });
      ok(csrf.status === 403, "Owner çerezi + başka site kaynağı → 403 (CSRF)", csrf.status);
      ok(mails().length === before && (await otps(U.owner)) === 0, "bu isteklerin hiçbiri e-posta göndermedi / kod üretmedi");
    }

    section("4) Owner doğrulama akışı (sentetik sağlayıcı)");
    {
      const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(U.owner, sOwner));
      const code = lastCode(EMAIL.owner);
      ok(s.status === 200 && s.json.sent === true && !!code && !s.text.includes(code), "Owner'a kod gönderildi; yanıtta kod YOK", s.json);
      ok(/^[0-9]{6}$/.test(code) && mails().every((m) => m.to === EMAIL.owner), "kod yalnız Owner'ın kayıtlı adresine gitti");
      const c = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code }, self(U.owner, sOwner));
      const v = (await q(`SELECT email_verified_at FROM public.users WHERE id = $1`, [U.owner])).rows[0].email_verified_at;
      ok(c.status === 200 && v !== null, "doğru kod → Owner e-postası doğrulandı", c.json);
    }

    section("5) Owner kararı DB işaretinden (rol adı yetmez)");
    {
      const mark = (v: boolean) => q(`BEGIN; SET LOCAL session_replication_role = replica; UPDATE public.users SET is_super_admin = ${v} WHERE id = '${U.owner}'; COMMIT;`);
      await mark(false);
      const g = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(U.owner, sOwner));
      const ch = await call(meChange.POST, "/api/me/email-change", "POST", { action: "start", newEmail: "f3-o2@test.local", password: pw(EMAIL.owner) }, self(U.owner, sOwner));
      ok(g.json.changeAvailable === false && ch.status === 403, "Owner işareti kalkınca aynı hesap da KAPALI", { g: g.json, ch: ch.status });
      await mark(true);
    }

    section("6) Güvenlik bildirimi kapsamı");
    {
      const before = mails().length;
      const ex = await sendSecurityNotice(getServerDb(), { userId: U.exp, to: EMAIL.exp, name: null, kind: "recovery_codes_generated" });
      const ev = (await q(`SELECT metadata->>'reason' AS r FROM public.security_events WHERE user_id = $1 AND event_type = 'security_notice_undelivered' ORDER BY id DESC LIMIT 1`, [U.exp])).rows[0]?.r;
      ok(ex === false && mails().length === before && ev === "scope_closed", "uzmana bildirim GİTMEDİ; denetim izi reason=scope_closed", { ex, ev });
      const ow = await sendSecurityNotice(getServerDb(), { userId: U.owner, to: EMAIL.owner, name: null, kind: "recovery_codes_generated" });
      ok(ow === true && mails().length === before + 1 && mails()[mails().length - 1].to === EMAIL.owner, "Owner'a bildirim gitti");
    }

    section("7) Owner durum ekranı: kapsam görünür, gizli değer yok");
    {
      const st = await call(emailStatus.GET, "/api/admin/email-status", "GET", null, { "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sOwner}` });
      const sc = st.json.selfServiceScope as { roles?: string[]; isDefault?: boolean } | undefined;
      ok(st.status === 200 && JSON.stringify(sc?.roles) === '["owner"]' && sc?.isDefault === true, "e-posta durumu: kapsam = yalnız owner (varsayılan)", st.json.selfServiceScope ?? st.status);
      ok(!st.text.includes(PEPPER) && !st.text.includes(EMAIL.owner), "yanıtta pepper / adres YOK");
      const e = await call(emailStatus.GET, "/api/admin/email-status", "GET", null, { "x-admin-id": ADM2, cookie: `__Host-yasam_sid=${sAdm2}` });
      ok(e.status === 403 || e.status === 401, "Owner olmayan yönetici durum ekranını okuyamaz", e.status);
    }

    section("8) Yanlış yazım kapsamı genişletmez; açık genişletme eski akışı aynen çalıştırır; geri alınır");
    {
      process.env.AUTH_EMAIL_SELF_SERVICE_ROLES = "experts,uzman";
      const t = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(U.exp, sExp));
      ok(t.status === 403, "AUTH_EMAIL_SELF_SERVICE_ROLES=experts,uzman → uzman yine kapalı", t.status);
      process.env.AUTH_EMAIL_SELF_SERVICE_ROLES = "owner,expert";
      const s = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "send" }, self(U.exp, sExp));
      const code = lastCode(EMAIL.exp);
      const c = await call(meEmail.POST, "/api/me/email-verification", "POST", { action: "confirm", code }, self(U.exp, sExp));
      ok(s.status === 200 && c.status === 200, "owner,expert → uzman doğrulaması önceki gibi çalışır", { s: s.status, c: c.status });
      const a2 = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(ADM2, sAdm2));
      ok(a2.json.available === false, "owner,expert → Owner olmayan yönetici hâlâ kapalı");
      process.env.AUTH_EMAIL_SELF_SERVICE_ROLES = "admin";
      const a3 = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(ADM2, sAdm2));
      ok(a3.json.available === true, "admin → bütün yöneticiler açık");
      delete process.env.AUTH_EMAIL_SELF_SERVICE_ROLES;
      await skipCooldown(U.exp);
      const back = await call(meEmail.GET, "/api/me/email-verification", "GET", null, self(U.exp, sExp));
      ok(back.json.available === false && back.json.verified === true, "değişken silinince uzman yeniden kapalı (doğrulanmış durum korunur)", back.json);
    }
  } finally {
    await db.close();
  }
  console.log(`\nf3-eposta-kapsam: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("f3-eposta-kapsam HATA:", e instanceof Error ? e.message : e);
  console.log(`\nf3-eposta-kapsam: ${pass} PASS / ${fail + 1} FAIL`);
  process.exit(1);
});
