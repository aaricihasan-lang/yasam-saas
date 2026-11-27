/**
 * GİRİŞ GÜVENLİĞİ F2-G — Owner işleme özel yeniden doğrulama: UÇTAN UCA route harness'ı (GERÇEK PostgreSQL +
 * GERÇEK route'lar). Production'a SIFIR temas; sentetik kullanıcılar; e-posta SENTETİK (gerçek Gmail değil).
 * "Telefon" adımı = imzası doğrulanmış QR kararının DB adımı (auth_qr_decide; imza F2-C harness'ında sınanır).
 *
 * Senaryo: saldırganın elinde YALNIZ Owner'ın taze oturum çerezi var → cihaz onayı / kurtarma yürütme yapılamaz;
 * kanıt e-postası Owner'ın kutusuna gider; yanlış kodlar kilitlenir. Meşru Owner e-posta veya QR ile kanıt alır,
 * işlem bir kez yapılır; kanıt başka oturum / hedef / işlemde geçmez.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2g-routes.harness.ts
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
const section = (s: string) => console.log(`\n── ${s} ──`);
type J = Record<string, unknown>;
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
function cookieFrom(res: Response, name: string): string {
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const raw of all) if (raw.startsWith(`${name}=`)) return raw.slice(name.length + 1).split(";")[0];
  return "";
}

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2g: true });
  const { admin } = db;
  const VE = { id: "00000000-0000-0000-0000-00000000e0d1", email: "f2d-ve@test.local" };
  const ADM2 = { id: "00000000-0000-0000-0000-00000000a002", email: "admin2@test.local" };
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f2g-harness-service-key", SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "f2g-rate", LOGIN_IP_PEPPER: "f2g-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all", AUTH_MFA_EMAIL_ROLES: "expert,admin",
      EMAIL_PROVIDER: "synthetic", AUTH_EMAIL_SELF_SERVICE_ROLES: "owner,admin,expert" /* F3: önceki aşamaların uzman e-posta akışları — kapsam açık */, EMAIL_SYNTHETIC_ALLOW: "1", AUTH_OTP_PEPPER: "f2g-harness-pepper-0123456789abcdefghijklmnop",
    });
    delete process.env.SESSION_EXPIRY_ENFORCE;
    const { syntheticOutbox } = await import("@/lib/email/syntheticProvider");
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const stepUp = await import("@/app/api/admin/step-up/route");
    const adminDevice = await import("@/app/api/admin/devices/[id]/route");
    const adminCases = await import("@/app/api/admin/recovery-cases/route");
    const adminCase = await import("@/app/api/admin/recovery-cases/[id]/route");

    let ip = 10;
    type Handler = (r: NextRequest, c?: unknown) => Promise<Response>;
    const call = async (h: unknown, url: string, method: "GET" | "POST", body: unknown, headers: Record<string, string> = {}, ctx?: unknown) => {
      const res = await (h as Handler)(new NextRequest(url, { method,
        headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${ip++ % 250}`, "user-agent": WEB_UA, ...headers },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}) }), ctx);
      return { res, json: (await res.clone().json().catch(() => ({}))) as J };
    };
    const L = "http://localhost";
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    const lastCode = (to: string) => /\b([0-9]{6})\b/.exec([...syntheticOutbox()].reverse().find((m) => m.to === to)?.text ?? "")?.[1] ?? "";
    const web = (bind: string) => ({ "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bind}` });
    const adminH = (id: string, sid: string) => ({ "x-admin-id": id, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" });
    const ownerLogin = async () => {
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [U.owner]);
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [U.owner]);
      const l = await call(sessionRoute.POST, `${L}/api/auth/session`, "POST", { email: EMAIL.owner, password: pw(EMAIL.owner) });
      const bind = cookieFrom(l.res, "__Host-yasam_mfa");
      const ch = String(l.json.challengeId);
      await call(sendRoute.POST, `${L}/api/auth/mfa/email/send`, "POST", { challengeId: ch }, web(bind));
      await call(verifyRoute.POST, `${L}/api/auth/mfa/email/verify`, "POST", { challengeId: ch, code: lastCode(EMAIL.owner) }, web(bind));
      const c = await call(completeRoute.POST, `${L}/api/auth/mfa/complete`, "POST", { challengeId: ch }, web(bind));
      return cookieFrom(c.res, "__Host-yasam_sid");
    };
    const approve = (sid: string, dev: string) => call(adminDevice.POST, `${L}/api/admin/devices/${dev}`, "POST",
      { action: "approve", fingerprintConfirmed: true, verificationMethod: "telefon", note: "kayıtlı numaradan arandı" }, adminH(U.owner, sid), { params: Promise.resolve({ id: dev }) });
    const begin = (sid: string, action: string, targetId: string) => call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "begin", action, targetId }, adminH(U.owner, sid));
    const status = (sid: string, ch: string) => call(stepUp.GET, `${L}/api/admin/step-up?challenge=${ch}`, "GET", null, adminH(U.owner, sid));

    section("Kurulum");
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id IN ($1, $2)`, [U.owner, VE.id]);
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id IN ('${U.owner}', '${VE.id}'); SELECT set_config('yasam.mfa_policy','off',false);`);
    const odev = (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
      VALUES ($1, repeat('O',120), encode(sha256('owner-phone'::bytea),'hex'), 'OWNR-PHON', 'active', now()) RETURNING id`, [U.owner])).rows[0].id as string;
    const stolen = await ownerLogin();   // saldırganın çaldığı (taze) çerez = bu oturum
    ok(!!stolen, "Owner MFA'lı oturum");
    const xdev = (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, device_model, state)
      VALUES ($1, repeat('X',120), encode(sha256('attacker'::bytea),'hex'), 'ATCK-PHON', 'Saldırgan', 'pending_owner') RETURNING id`, [VE.id])).rows[0].id as string;

    section("SALDIRI: yalnız taze Owner çerezi");
    const a1 = await approve(stolen, xdev);
    ok(a1.res.status === 403 && a1.json.code === "step_up_required" && /ek doğrulama/.test(String(a1.json.error)), "çerez tek başına cihaz onaylayamaz", a1.json);
    const b = await begin(stolen, "device_approve", xdev);
    ok(b.res.status === 200 && !!(b.json.qr as J)?.matchCode && b.json.emailHint === "a***@t***.local", "istek açılır (QR + maskeli e-posta)", b.json);
    const ch = String(b.json.challengeId);
    const before = syntheticOutbox().length;
    const s1 = await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "email_send", challengeId: ch }, adminH(U.owner, stolen));
    const mail = syntheticOutbox().slice(before).find((m) => m.to === EMAIL.owner);
    ok(s1.res.status === 200 && !!mail && /kritik bir işlemi onaylama/.test(mail.text) && !JSON.stringify(s1.json).match(/[0-9]{6}/),
      "kod YALNIZ Owner'ın e-posta kutusuna gider (yanıtta kod yok)", s1.json);
    for (let i = 0; i < 5; i++) {
      const g = await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "email_verify", challengeId: ch, code: String(100000 + i) }, adminH(U.owner, stolen));
      if (i === 4) ok(g.res.status === 401, "tahminler reddedilir", g.json);
    }
    ok((await status(stolen, ch)).json.state === "denied", "5 yanlış → istek kalıcı RED");
    const a2 = await approve(stolen, xdev);
    ok(a2.json.code === "step_up_required", "hâlâ onaylanamaz");
    ok((await q(`SELECT state FROM public.auth_trusted_devices WHERE id = $1`, [xdev])).rows[0].state === "pending_owner", "saldırgan cihazı beklemede");
    const adm2 = await call(sessionRoute.POST, `${L}/api/auth/session`, "POST", { email: ADM2.email, password: pw(ADM2.email) });
    const adm2Sid = cookieFrom(adm2.res, "__Host-yasam_sid");
    const nb = await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "begin", action: "device_approve", targetId: xdev }, adminH(ADM2.id, adm2Sid));
    ok(nb.res.status === 403, "Owner olmayan yönetici istek açamaz", nb.json);

    section("MEŞRU OWNER: e-posta kanıtı");
    const ldev = (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, device_model, state)
      VALUES ($1, repeat('L',120), encode(sha256('legit'::bytea),'hex'), 'LEGT-PHON', 'Yeni Pixel', 'pending_owner') RETURNING id`, ["00000000-0000-0000-0000-00000000e0b2"])).rows[0].id as string;
    const owner2 = await ownerLogin();
    const b2 = await begin(owner2, "device_approve", ldev);
    const ch2 = String(b2.json.challengeId);
    ok((await status(stolen, ch2)).json.state === "invalid", "başka oturum bu isteği göremez");
    await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes' WHERE user_id = $1`, [U.owner]);
    await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "email_send", challengeId: ch2 }, adminH(U.owner, owner2));
    const crossVerify = await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "email_verify", challengeId: ch2, code: lastCode(EMAIL.owner) }, adminH(U.owner, stolen));
    ok(crossVerify.res.status === 401, "kod başka oturumdan doğrulanamaz", crossVerify.json);
    const v = await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "email_verify", challengeId: ch2, code: lastCode(EMAIL.owner) }, adminH(U.owner, owner2));
    ok(v.res.status === 200 && (await status(owner2, ch2)).json.state === "verified", "Owner kendi kutusundaki kodla doğruladı", v.json);
    const wrongSess = await approve(stolen, ldev);
    ok(wrongSess.json.code === "step_up_required", "kanıt başka oturumda (çalınmış çerez) geçmez");
    const wrongTarget = await approve(owner2, xdev);
    ok(wrongTarget.json.code === "step_up_required", "kanıt başka hedefte geçmez");
    const okA = await approve(owner2, ldev);
    ok(okA.res.status === 200, "kanıtla onay", okA.json);
    ok((await status(owner2, ch2)).json.state === "consumed", "kanıt tüketildi");

    section("MEŞRU OWNER: telefon (QR) kanıtı + tek kullanım");
    const b3 = await begin(owner2, "device_approve", xdev);
    const url = new URL(String((b3.json.qr as J).url));
    const nonce = new URLSearchParams(url.hash.slice(1)).get("n");
    const dec = (await q(`SELECT public.auth_qr_decide($1, $2, $3, 'approve', $4) AS r`, [b3.json.challengeId, nonce, odev, (b3.json.qr as J).matchCode])).rows[0].r;
    ok(dec.result === "approved", "Owner telefonu onayladı");
    const rej = await call(adminDevice.POST, `${L}/api/admin/devices/${xdev}`, "POST", { action: "reject", note: "saldırgan" }, adminH(U.owner, owner2), { params: Promise.resolve({ id: xdev }) });
    ok(rej.res.status === 200, "RET kanıt tüketmeden yapılır");
    ok((await status(owner2, String(b3.json.challengeId))).json.state === "verified", "ret kanıtı harcamadı");

    section("Kurtarma yürütme kanıt ister");
    const o = await call(adminCases.POST, `${L}/api/admin/recovery-cases`, "POST", { email: VE.email, verificationMethod: "telefon", note: "kayıtlı numaradan arandı" }, adminH(U.owner, owner2));
    const cid = String(o.json.caseId);
    await q(`UPDATE public.auth_recovery_cases SET opened_at = opened_at - interval '73 hours', not_before = not_before - interval '73 hours', expires_at = expires_at - interval '73 hours' WHERE id = $1`, [cid]);
    await q(`UPDATE public.user_sessions SET created_at = created_at - interval '80 hours' WHERE user_id = $1`, [VE.id]);
    const ex1 = await call(adminCase.POST, `${L}/api/admin/recovery-cases/${cid}`, "POST", { action: "execute", identityReconfirmed: true, password: pw(EMAIL.owner) }, adminH(U.owner, owner2), { params: Promise.resolve({ id: cid }) });
    ok(ex1.res.status === 403 && ex1.json.code === "STEP_UP_REQUIRED", "kanıtsız yürütme yok", ex1.json);
    const b4 = await begin(owner2, "recovery_execute", cid);
    const n4 = new URLSearchParams(new URL(String((b4.json.qr as J).url)).hash.slice(1)).get("n");
    await q(`SELECT public.auth_qr_decide($1, $2, $3, 'approve', $4)`, [b4.json.challengeId, n4, odev, (b4.json.qr as J).matchCode]);
    const ex2 = await call(adminCase.POST, `${L}/api/admin/recovery-cases/${cid}`, "POST", { action: "execute", identityReconfirmed: true, password: pw(EMAIL.owner) }, adminH(U.owner, owner2), { params: Promise.resolve({ id: cid }) });
    ok(ex2.res.status === 200 && typeof ex2.json.ticket === "string", "kanıtla yürütüldü", ex2.json);
  } finally {
    await db.close();
  }
  console.log(`\nf2g-routes harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
