/**
 * GİRİŞ GÜVENLİĞİ F2-I — 17.11 güvenlik denetimi: SALDIRI zincirlerinin GERÇEK route'lar + GERÇEK PostgreSQL ile
 * uçtan uca doğrulanması. Production'a SIFIR temas; sentetik kullanıcılar; sentetik e-posta sağlayıcısı.
 * "Telefon" adımı = imzası doğrulanmış QR kararının DB adımı (auth_qr_decide).
 *
 * Tehdit modeli: saldırgan Owner'ın TAZE oturum çerezini çaldı; Owner parolası, telefonu ve e-posta kutusu YOK.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2i-routes.harness.ts
 *   F2I_WITHOUT_FIX=1 → 000900 uygulanmaz: kusurların kendisi yeniden üretilir (beklenen: FAIL).
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
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
type J = Record<string, unknown>;
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
function cookieFrom(res: Response, name: string): string {
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const raw of all) if (raw.startsWith(`${name}=`)) return raw.slice(name.length + 1).split(";")[0];
  return "";
}
const WITHOUT_FIX = process.env.F2I_WITHOUT_FIX === "1";

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb(WITHOUT_FIX ? { withF2h: true } : { withF2i: true });
  const { admin } = db;
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f2i-harness", SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "f2i-rate", LOGIN_IP_PEPPER: "f2i-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all", AUTH_MFA_EMAIL_ROLES: "expert,admin",
      EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1", AUTH_OTP_PEPPER: "f2i-harness-pepper-0123456789abcdefghijklmnop",
    });
    const { syntheticOutbox } = await import("@/lib/email/syntheticProvider");
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const stepUp = await import("@/app/api/admin/step-up/route");
    const userRoute = await import("@/app/api/admin/users/[id]/route");
    const passwordRoute = await import("@/app/api/admin/users/[id]/password/route");
    const emailVerify = await import("@/app/api/me/email-verification/route");
    const recovery = await import("@/app/api/me/account-recovery/route");
    const devices = await import("@/app/api/admin/devices/[id]/route");
    let ip = 10;
    type Handler = (r: NextRequest, ctx?: unknown) => Promise<Response>;
    const call = async (h: unknown, url: string, method: "GET" | "POST" | "PATCH", body: unknown, headers: Record<string, string> = {}, params?: J) => {
      const res = await (h as Handler)(new NextRequest(url, { method,
        headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${ip++ % 250}`, "user-agent": WEB_UA, ...headers },
        ...(method !== "GET" ? { body: JSON.stringify(body) } : {}) }), params ? { params: Promise.resolve(params) } : undefined);
      return { res, json: (await res.clone().json().catch(() => ({}))) as J };
    };
    const L = "http://localhost";
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    const lastCode = (to: string) => /\b([0-9]{6})\b/.exec([...syntheticOutbox()].reverse().find((m) => m.to === to)?.text ?? "")?.[1] ?? "";
    const web = (bind: string) => ({ "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bind}` });

    // Kurulum: Owner + kurban uzman: ikisinde de doğrulanmış e-posta (oturumlardan ÖNCE), MFA zorunlu, telefon.
    await q(`UPDATE public.users SET email_verified_at = now() - interval '1 day' WHERE id = ANY($1)`, [[U.owner, U.exp]]);
    await q(`CREATE OR REPLACE FUNCTION public.hash_password(p_plain text) RETURNS text LANGUAGE sql SECURITY DEFINER
             SET search_path = public, extensions AS $f$ SELECT crypt(p_plain, gen_salt('bf', 4)) $f$;
             GRANT EXECUTE ON FUNCTION public.hash_password(text) TO service_role;`);
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id IN ('${U.owner}','${U.exp}'); SELECT set_config('yasam.mfa_policy','off',false);`);
    const dev = async (user: string, tag: string) => (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
      VALUES ($1, repeat('O',120), encode(sha256($2::bytea),'hex'), 'ABCD-EFGH', 'active', now()) RETURNING id`, [user, tag])).rows[0].id as string;
    const odev = await dev(U.owner, "owner-phone");
    const vdev = await dev(U.exp, "victim-phone");
    // Owner'ın (meşru) girişi: parola + e-posta kodu → saldırgan bu oturum çerezini çalar.
    const login = async (email: string) => {
      const l = await call(sessionRoute.POST, `${L}/api/auth/session`, "POST", { email, password: pw(email) });
      const bind = cookieFrom(l.res, "__Host-yasam_mfa");
      const ch = String(l.json.challengeId);
      await call(sendRoute.POST, `${L}/api/auth/mfa/email/send`, "POST", { challengeId: ch }, web(bind));
      await call(verifyRoute.POST, `${L}/api/auth/mfa/email/verify`, "POST", { challengeId: ch, code: lastCode(email) }, web(bind));
      return cookieFrom((await call(completeRoute.POST, `${L}/api/auth/mfa/complete`, "POST", { challengeId: ch }, web(bind))).res, "__Host-yasam_sid");
    };
    const sid = await login(EMAIL.owner);
    ok(!!sid, "kurulum: Owner MFA ile giriş yaptı");
    await q(`UPDATE public.user_sessions SET created_at = now() - interval '5 minutes' WHERE session_token = $1`, [sid]);   // 5 dk önce açılmış, taze
    const H = { "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" };
    const SELF = { "x-user-id": U.owner, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" };

    // ══ Z1: çalınmış çerezle Owner e-postasını ele geçirip e-posta kanıtıyla başkasının MFA'sını kapatma ══
    const edit = await call(userRoute.PATCH, `${L}/api/admin/users/${U.owner}`, "PATCH",
      { action: "edit", fullName: "Owner", email: "zz.saldirgan@example.test", role: "admin" }, H, { id: U.owner });
    ok(edit.res.status === 403, "Z1a admin düzenleme yolundan Owner e-postası değiştirilemez", edit.json);
    // Başka bir yoldan (ör. doğrudan DB) değişmiş olsa bile: saldırganın kutusuna kanıt gidemez.
    await q(`UPDATE public.users SET email = 'zz.saldirgan@example.test' WHERE id = $1`, [U.owner]);
    await call(emailVerify.POST, `${L}/api/me/email-verification`, "POST", { action: "send" }, SELF);
    const ev = await call(emailVerify.POST, `${L}/api/me/email-verification`, "POST", { action: "confirm", code: lastCode("zz.saldirgan@example.test") }, SELF);
    console.log(`  bilgi: saldırgan yeni adresi doğruladı mı: ${ev.res.status} ${JSON.stringify(ev.json)}`);
    const b = await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "begin", action: "mfa_disable", targetId: U.exp }, H);
    ok(b.res.status === 200 && b.json.emailHint === undefined, "Z1b oturum içinde doğrulanan e-posta kanıt yöntemi olarak sunulmaz", b.json);
    const before = syntheticOutbox().length;
    const es = await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "email_send", challengeId: b.json.challengeId }, H);
    const leaked = syntheticOutbox().slice(before).some((m) => m.to === "zz.saldirgan@example.test");
    ok(!leaked && es.res.status !== 200, "Z1c kanıt kodu saldırganın kutusuna GÖNDERİLMEZ", { status: es.res.status, leaked });
    const code = lastCode("zz.saldirgan@example.test");
    await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "email_verify", challengeId: b.json.challengeId, code }, H);
    const dis = await q(`SELECT public.auth_mfa_set_required($1, $2, false, 'saldırı') AS r`, [sid, U.exp]);
    ok(dis.rows[0].r?.ok !== true, "Z1d kurbanın MFA zorunluluğu KAPATILAMAZ", dis.rows[0].r);
    await q(`UPDATE public.users SET email = $2, email_verified_at = now() - interval '1 day' WHERE id = $1`, [U.owner, EMAIL.owner]);

    // ══ Z3: kurban e-posta koduyla girmiş (parola + kutu ele geçmiş) → kurtarma kodu üretemez (telefonu var) ══
    const vsid = await login(EMAIL.exp);
    const rg = await call(recovery.POST, `${L}/api/me/account-recovery`, "POST", { action: "generate", password: pw(EMAIL.exp) },
      { "x-user-id": U.exp, cookie: `__Host-yasam_sid=${vsid}`, "sec-fetch-site": "same-origin" });
    ok(rg.res.status === 403 && rg.json.code === "STRONG_MFA_REQUIRED", "Z3 telefonu olan kullanıcı e-posta oturumunda kurtarma kodu üretemez", rg.json);

    // ══ Z2: çalınmış çerezle parola sıfırlama → işleme özel kanıt şart ══
    const NEWPW = "Zz-saldirgan-Parola-2026!";
    const hashBefore = (await q(`SELECT password_hash FROM public.users WHERE id = $1`, [U.exp])).rows[0].password_hash;
    const p1 = await call(passwordRoute.POST, `${L}/api/admin/users/${U.exp}/password`, "POST", { newPassword: NEWPW }, H, { id: U.exp });
    ok(p1.res.status === 403 && p1.json.code === "STEP_UP_REQUIRED" && p1.json.target === U.exp, "Z2a kanıtsız parola sıfırlama reddedildi", p1.json);
    ok(hashBefore === (await q(`SELECT password_hash FROM public.users WHERE id = $1`, [U.exp])).rows[0].password_hash, "Z2b parola değişmedi");
    // Meşru Owner telefonuyla onaylar → sıfırlama çalışır.
    const sb = await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "begin", action: "password_reset", targetId: U.exp }, H);
    const n = new URLSearchParams(new URL(String((sb.json.qr as J).url)).hash.slice(1)).get("n");
    await q(`SELECT public.auth_qr_decide($1, $2, $3, 'approve', $4)`, [sb.json.challengeId, n, odev, (sb.json.qr as J).matchCode]);
    const p2 = await call(passwordRoute.POST, `${L}/api/admin/users/${U.exp}/password`, "POST", { newPassword: NEWPW }, H, { id: U.exp });
    // Not: bu test DB'sinde yönetici işlem kaydı (admin_audit_log) tablosu yok → rota parolayı yazdıktan sonra kayıt
    // adımında 500 döner; ölçüt: kanıt engeli geçildi ve parola GERÇEKTEN değişti.
    const hashAfter = (await q(`SELECT password_hash FROM public.users WHERE id = $1`, [U.exp])).rows[0].password_hash;
    ok(p2.json.code !== "STEP_UP_REQUIRED" && hashAfter !== hashBefore, "Z2c telefon onayıyla parola sıfırlandı (meşru yol çalışır)", p2.json);
    const p3 = await call(passwordRoute.POST, `${L}/api/admin/users/${U.exp}/password`, "POST", { newPassword: NEWPW + "x" }, H, { id: U.exp });
    ok(p3.json.code === "STEP_UP_REQUIRED", "Z2d kanıt tek kullanımlık", p3.json);

    // ══ Z4: eski (taze olmayan) Owner oturumuyla başkasının cihazını iptal → taze MFA şart ══
    await q(`UPDATE public.user_sessions SET created_at = now() - interval '2 hours' WHERE session_token = $1`, [sid]);
    const rv = await call(devices.POST, `${L}/api/admin/devices/${vdev}`, "POST", { action: "revoke", reason: "test" }, H, { id: vdev });
    ok(rv.res.status === 403 && rv.json.code === "FRESH_MFA_REQUIRED", "Z4 eski Owner oturumu kurbanın telefonunu iptal edemez", rv.json);
    ok((await q(`SELECT state FROM public.auth_trusted_devices WHERE id = $1`, [vdev])).rows[0].state === "active", "Z4 kurbanın telefonu etkin kaldı");
    void odev;
  } finally {
    await db.close();
  }
  console.log(`\nf2i-routes harness${WITHOUT_FIX ? " (DÜZELTMESİZ)" : ""}: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
