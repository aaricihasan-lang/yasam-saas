/**
 * GİRİŞ GÜVENLİĞİ — OWNER KİLİTLENME GÜVENLİĞİ (23.11): GERÇEK PostgreSQL (en güncel F2 zinciri) + GERÇEK route'lar.
 * Production'a SIFIR temas; sentetik kullanıcılar; kit / kurtarma kodları YALNIZ bu geçici test DB'sinde üretilir ve
 * HİÇBİR çıktıya yazılmaz (D bölümü bunu çıktının kendisini tarayarak kanıtlar). E-posta SENTETİK.
 *
 * A) Owner kendi zorunluluğunu açmadan önce: kullanılmamış çevrimdışı kit yoksa / ayar hatalıysa API REDDEDER; kit ve
 *    normal kurtarma kodu AYRI sayılır; kit oluşunca açılır.
 * B) Yanlış MFA ortam ayarı (kapsam / yöntem listesi) Owner'ın GEÇERLİ kurtarma yolunu arayüzden SİLMEZ; ama hiçbir asıl
 *    yöntemi açmaz, MFA atlanmaz; geçersiz / tüketilmiş / başka kullanıcıya ait kod kabul edilmez.
 * C) Fail-closed: kodu olmayan kullanıcıya kurtarma sunulmaz; DB okunamazsa kurtarma sunulmaz.
 * D) Hiçbir kod / kit çıktıya veya yanıta sızmaz.
 *
 * Negatif kontroller (yalnız test süreci; üretim kodunda bayrak YOK — sourceMutation.ts):
 *   OWNER_KILIT_ESKI_COZUMLEME=1 → eski çözümleme (bayraklar boşsa liste erkenden boş) → B FAIL vermeli.
 *   OWNER_KIT_KORUMASIZ=1        → Owner kit koruması kaldırılır → A FAIL vermeli.
 *   OWNER_AYAR_KORUMASIZ=1       → ayar biçim koruması kaldırılır → A FAIL vermeli.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/owner-kilitlenme.harness.ts
 */
import Module from "node:module";
import path from "node:path";
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

const MUTATIONS = installSourceMutations([
  { envVar: "OWNER_KILIT_ESKI_COZUMLEME", file: "lib/auth/mfaChallenge.ts", label: "eski yöntem çözümlemesi (bayraklar boşsa kurtarma da gizlenir)",
    anchor: `  const flags = resolveOfferedMfaMethods(args.isTestAccount, env);\n  const { data, error } = await db.rpc("auth_mfa_user_methods"`,
    replacement: `  const flags = resolveOfferedMfaMethods(args.isTestAccount, env);\n  if (flags.length === 0) return [];\n  const { data, error } = await db.rpc("auth_mfa_user_methods"` },
  { envVar: "OWNER_KIT_KORUMASIZ", file: "app/api/admin/users/[id]/mfa/route.ts", label: "Owner kit koruması kaldırıldı",
    anchor: `if (st.status.isOwnerAccount && st.status.ownerSelfRecoveryReady !== true) {`, replacement: `if (false) {` },
  { envVar: "OWNER_AYAR_KORUMASIZ", file: "app/api/admin/users/[id]/mfa/route.ts", label: "MFA ayar biçim koruması kaldırıldı",
    anchor: `if (st.status.configIssues.length) {`, replacement: `if (false) {` },
]);

// Çıktının kendisi taranır (D): sentetik kodlar dahi hiçbir satıra yazılmamalı.
const captured: string[] = [];
const origLog = console.log;
console.log = (...a: unknown[]) => { captured.push(a.map(String).join(" ")); origLog(...a); };

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
  const db = await startF2cDb({ withF2m: true });
  const { admin } = db;
  const VE = { id: "00000000-0000-0000-0000-00000000e0d1", email: "f2d-ve@test.local" };
  const EXP = { id: U.exp, email: EMAIL.exp };
  const secrets: string[] = [];
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "owner-kilit-harness", SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "owner-kilit-rate", LOGIN_IP_PEPPER: "owner-kilit-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all", AUTH_MFA_EMAIL_ROLES: "expert,admin",
      EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1", AUTH_OTP_PEPPER: "owner-kilit-pepper-0123456789abcdefghijklmnop",
    });
    delete process.env.SESSION_EXPIRY_ENFORCE;
    const { syntheticOutbox } = await import("@/lib/email/syntheticProvider");
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const recoveryRoute = await import("@/app/api/auth/mfa/recovery/verify/route");
    const meRecovery = await import("@/app/api/me/account-recovery/route");
    const mfaRoute = await import("@/app/api/admin/users/[id]/mfa/route");
    let ip = 10;
    type Handler = (r: NextRequest, c?: unknown) => Promise<Response>;
    const call = async (h: unknown, url: string, method: "GET" | "POST", body: unknown, headers: Record<string, string> = {}, ctx?: unknown) => {
      const res = await (h as Handler)(new NextRequest(url, { method,
        headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${ip++ % 250}`, "user-agent": WEB_UA, ...headers },
        ...(method === "POST" ? { body: JSON.stringify(body) } : {}) }), ctx);
      const text = await res.clone().text();
      let json: J = {};
      try { json = JSON.parse(text) as J; } catch { /* boş */ }
      return { res, json, text };
    };
    const L = "http://localhost";
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    const lastCode = (to: string) => /\b([0-9]{6})\b/.exec([...syntheticOutbox()].reverse().find((m) => m.to === to)?.text ?? "")?.[1] ?? "";
    const web = (bind: string) => ({ "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bind}` });
    const adminH = (id: string, sid: string) => ({ "x-admin-id": id, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" });
    const self = (id: string, sid: string) => ({ "x-user-id": id, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" });
    const expireOpen = (uid: string) => q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [uid]);
    const login = async (email: string, uid: string) => {
      await expireOpen(uid);
      const l = await call(sessionRoute.POST, `${L}/api/auth/session`, "POST", { email, password: pw(email) });
      return { status: l.res.status, json: l.json, text: l.text, sid: cookieFrom(l.res, "__Host-yasam_sid"), bind: cookieFrom(l.res, "__Host-yasam_mfa") };
    };
    const emailMfaLogin = async (email: string, uid: string) => {
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [uid]);
      const l = await login(email, uid);
      const ch = String(l.json.challengeId ?? "");
      await call(sendRoute.POST, `${L}/api/auth/mfa/email/send`, "POST", { challengeId: ch }, web(l.bind));
      await call(verifyRoute.POST, `${L}/api/auth/mfa/email/verify`, "POST", { challengeId: ch, code: lastCode(email) }, web(l.bind));
      const c = await call(completeRoute.POST, `${L}/api/auth/mfa/complete`, "POST", { challengeId: ch }, web(l.bind));
      return cookieFrom(c.res, "__Host-yasam_sid");
    };
    const recover = (ch: string, code: string, bind: string) => call(recoveryRoute.POST, `${L}/api/auth/mfa/recovery/verify`, "POST", { challengeId: ch, code }, web(bind));
    const complete = async (ch: string, bind: string) => {
      const c = await call(completeRoute.POST, `${L}/api/auth/mfa/complete`, "POST", { challengeId: ch }, web(bind));
      return { status: c.res.status, sid: cookieFrom(c.res, "__Host-yasam_sid") };
    };
    const getStatus = (sid: string, target: string) => call(mfaRoute.GET, `${L}/api/admin/users/${target}/mfa`, "GET", null, adminH(U.owner, sid), { params: Promise.resolve({ id: target }) });
    const enable = (sid: string, target: string) => call(mfaRoute.POST, `${L}/api/admin/users/${target}/mfa`, "POST",
      { action: "enable", reason: "Owner kilitlenme testi", confirm: true }, adminH(U.owner, sid), { params: Promise.resolve({ id: target }) });
    const required = async (uid: string) => ((await q(`SELECT mfa_required FROM public.users WHERE id = $1`, [uid])).rows[0] as { mfa_required: boolean }).mfa_required;
    const active = async (sid: string) => ((await q(`SELECT count(*)::int n FROM public.user_sessions WHERE session_token = $1 AND is_active`, [sid])).rows[0] as { n: number }).n === 1;
    const withEnv = async <T>(patch: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> => {
      const saved: Record<string, string | undefined> = {};
      for (const k of Object.keys(patch)) { saved[k] = process.env[k]; if (patch[k] === undefined) delete process.env[k]; else process.env[k] = patch[k]; }
      try { return await fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
    };
    const st = (r: { json: J }) => (r.json.status ?? {}) as J;

    section("Kurulum");
    if (MUTATIONS.length) console.log(`  bilgi: negatif kontrol kipi — ${MUTATIONS.join("; ")}`);
    // AND1: e-postası doğrulanmış, zorunluluğu KAPALI üye → ayar biçim testinde "hazır" (yalnız ayar koruması durdurur).
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id IN ($1, $2, $3)`, [U.owner, VE.id, "00000000-0000-0000-0000-00000000e0b2"]);
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id IN ('${VE.id}', '${EXP.id}'); SELECT set_config('yasam.mfa_policy','off',false);`);
    // VE: e-posta koduyla MFA oturumu → kendi normal kurtarma kodları (başka kullanıcı kodu testi için).
    const veSid = await emailMfaLogin(VE.email, VE.id);
    const gen = await call(meRecovery.POST, `${L}/api/me/account-recovery`, "POST", { action: "generate", password: pw(VE.email) }, self(VE.id, veSid));
    const veCodes = Array.isArray(gen.json.codes) ? (gen.json.codes as string[]) : [];
    secrets.push(...veCodes);
    ok(veCodes.length === 10, "sentetik üye kendi 10 kurtarma kodunu üretti (değerler yazdırılmaz)");

    section("A) Owner kendi zorunluluğunu açmadan önce kurtarma yolu şartı");
    const ownerPlain = await login(EMAIL.owner, U.owner);
    ok(ownerPlain.status === 200 && !!ownerPlain.sid, "Owner parolayla giriş (henüz zorunlu değil)");
    const a1 = await getStatus(ownerPlain.sid, U.owner);
    ok(a1.res.status === 200 && a1.json.isSelf === true && st(a1).ready === true && st(a1).ownerOfflineKitLeft === 0 && st(a1).ownerSelfRecoveryReady === false && st(a1).recoveryCodesLeft === 0,
      "durum: asıl yöntem hazır AMA kit 0 → kendi zorunluluğu için hazır DEĞİL", st(a1));
    const a2 = await enable(ownerPlain.sid, U.owner);
    ok(a2.res.status === 409 && a2.json.code === "OWNER_RECOVERY_REQUIRED" && (await required(U.owner)) === false && (await active(ownerPlain.sid)),
      "kit yokken Owner kendi zorunluluğunu AÇAMAZ (409); oturum açık kalır", a2.json);
    for (const [label, patch, issue] of [
      ["tanınmayan yöntem adı (sms)", { AUTH_MFA_METHODS: "qr_device,email_otp,sms" }, "config_methods_unknown"],
      ["tanınmayan kapsam (herkes)", { AUTH_MFA_METHOD_SCOPE: "herkes" }, "config_scope_invalid"],
    ] as const) {
      await withEnv(patch as Record<string, string | undefined>, async () => {
        const s = await getStatus(ownerPlain.sid, VE.id);
        const e = await enable(ownerPlain.sid, "00000000-0000-0000-0000-00000000e0b2");
        ok(JSON.stringify(st(s).configIssues ?? []).includes(issue) && e.res.status === 409 && e.json.code === "CONFIG_INVALID"
          && (await required("00000000-0000-0000-0000-00000000e0b2")) === false, `ayar hatası: ${label} → zorunluluk AÇILMAZ (409 CONFIG_INVALID)`, { s: st(s).configIssues, e: e.json.code });
      });
    }
    const kit = (await q(`SELECT k FROM public.auth_owner_offline_kit_issue() k`)).rows.map((r) => String((r as { k: unknown }).k));
    secrets.push(...kit);
    ok(kit.length === 5, "SQL konsolu (sentetik DB): 5 kit kodu üretildi (değerler yazdırılmaz)");
    const combined = Number(((await q(`SELECT public.auth_mfa_user_methods($1) AS m`, [U.owner])).rows[0] as { m: J }).m.recovery_codes);
    const a3 = await getStatus(ownerPlain.sid, U.owner);
    ok(st(a3).ownerOfflineKitLeft === 5 && st(a3).recoveryCodesLeft === 0 && st(a3).ownerSelfRecoveryReady === true && combined === 5,
      "kit ve normal kod AYRI: kit 5 · normal kod 0 (DB birleşik sayısı 5 — eski panel bunu 'kurtarma kodu' gösterirdi)", { s: st(a3), combined });
    ok(!kit.some((k) => a3.text.toUpperCase().includes(k.replace(/-/g, "")) || a3.text.includes(k)), "durum yanıtında kit kodu YOK");
    const a4 = await enable(ownerPlain.sid, U.owner);
    ok(a4.res.status === 200 && a4.json.reloginRequired === true && (await required(U.owner)) === true && !(await active(ownerPlain.sid)),
      "kit varken Owner kendi zorunluluğunu açtı; MFA'sız oturum kapandı", a4.json);

    section("B) Yanlış ortam ayarı kurtarma yolunu SİLMEZ ama MFA'yı da atlatmaz (Owner)");
    const BAD: Array<[string, Record<string, string | undefined>]> = [
      ["kapsam tanımsız (→ yalnız test hesapları)", { AUTH_MFA_METHOD_SCOPE: undefined }],
      ["kapsam test_accounts", { AUTH_MFA_METHOD_SCOPE: "test_accounts" }],
      ["yöntem listesi tanımsız", { AUTH_MFA_METHODS: undefined }],
      ["yöntem listesi boş", { AUTH_MFA_METHODS: "" }],
      ["yöntem listesi yalnız tanınmayan (sms)", { AUTH_MFA_METHODS: "sms" }],
    ];
    for (const [label, patch] of BAD) {
      await withEnv(patch, async () => {
        const l = await login(EMAIL.owner, U.owner);
        ok(l.status === 202 && !l.sid && JSON.stringify(l.json.methods) === JSON.stringify(["recovery_code"]) && !("qr" in l.json) && !("emailHint" in l.json),
          `${label}: Owner'a YALNIZ kurtarma kodu sunulur; parolayla oturum yok, asıl yöntem açılmaz`, { s: l.status, m: l.json.methods });
      });
    }
    await withEnv({ AUTH_MFA_METHOD_SCOPE: undefined }, async () => {
      const l1 = await login(EMAIL.owner, U.owner);
      const ch = String(l1.json.challengeId ?? "");
      const early = await complete(ch, l1.bind);
      ok(early.status !== 200 && !early.sid, "kod doğrulanmadan tamamlama YOK (MFA atlanmaz)", { s: early.status });
      const bad = await recover(ch, "AAAA-BBBB-CCCC-DDDD", l1.bind);
      ok(bad.res.status === 401, "geçersiz kod reddedilir", bad.json);
      const cross = await recover(ch, veCodes[0] ?? "x", l1.bind);
      ok(cross.res.status === 401, "BAŞKA kullanıcının (üye) kurtarma kodu Owner'da kabul edilmez", { s: cross.res.status });
      const good = await recover(ch, kit[0], l1.bind);
      ok(good.res.status === 200 && good.json.kind === "owner_offline", "Owner'ın kendi kit kodu kabul edilir", { s: good.res.status, kind: good.json.kind });
      const c = await complete(ch, l1.bind);
      const mm = c.sid ? ((await q(`SELECT mfa_method FROM public.user_sessions WHERE session_token = $1`, [c.sid])).rows[0] as { mfa_method: string } | undefined)?.mfa_method : null;
      ok(c.status === 200 && !!c.sid && mm === "recovery_code", "Owner kurtarma koduyla giriş yaptı (oturum MFA yöntemi = recovery_code)", { s: c.status, mm });
      const l2 = await login(EMAIL.owner, U.owner);
      const reuse = await recover(String(l2.json.challengeId ?? ""), kit[0], l2.bind);
      ok(reuse.res.status === 401, "tüketilmiş kit kodu İKİNCİ kez kabul edilmez", { s: reuse.res.status });
      const v = await login(VE.email, VE.id);
      ok(JSON.stringify(v.json.methods) === JSON.stringify(["recovery_code"]) && !v.sid, "üye: yanlış ayarda yalnız kendi kurtarma kodu sunulur", v.json.methods);
      const ownerOnVe = await recover(String(v.json.challengeId ?? ""), kit[1], v.bind);
      ok(ownerOnVe.res.status === 401, "Owner'ın kit kodu üyenin hesabında kabul edilmez", { s: ownerOnVe.res.status });
    });
    const goodEnv = await login(EMAIL.owner, U.owner);
    ok(JSON.stringify(goodEnv.json.methods) === JSON.stringify(["email_otp", "recovery_code"]), "doğru ayarda Owner'a e-posta kodu + kurtarma kodu sunulur", goodEnv.json.methods);

    section("C) Fail-closed: kurtarma yalnız gerçek kayda göre");
    await withEnv({ AUTH_MFA_METHOD_SCOPE: undefined }, async () => {
      const e = await login(EXP.email, EXP.id);
      ok(e.status === 202 && !e.sid && Array.isArray(e.json.methods) && (e.json.methods as unknown[]).length === 0,
        "kurtarma kodu OLMAYAN zorunlu kullanıcıya yanlış ayarda hiçbir yöntem sunulmaz (giriş yok)", e.json.methods);
      await q(`REVOKE EXECUTE ON FUNCTION public.auth_mfa_user_methods(uuid) FROM service_role`);
      try {
        const o = await login(EMAIL.owner, U.owner);
        ok(o.status === 202 && !o.sid && (o.json.methods as unknown[]).length === 0, "kayıt okunamazsa (DB hatası) kurtarma SUNULMAZ — fail-closed", o.json.methods);
      } finally {
        await q(`GRANT EXECUTE ON FUNCTION public.auth_mfa_user_methods(uuid) TO service_role`);
      }
    });
    const goodVe = await login(VE.email, VE.id);
    ok(JSON.stringify(goodVe.json.methods) === JSON.stringify(["email_otp", "recovery_code"]), "doğru ayarda üye davranışı değişmedi", goodVe.json.methods);

    section("D) Sızıntı");
    const norm = secrets.filter(Boolean).map((s) => s.replace(/-/g, "").toUpperCase());
    const out = captured.join("\n").toUpperCase().replace(/-/g, "");
    ok(norm.length === 15 && !norm.some((s) => out.includes(s)), `test çıktısında hiçbir kit / kurtarma kodu yok (${norm.length} sentetik kod tarandı)`);
    const mailHits = syntheticOutbox().filter((m) => norm.some((s) => (m.text + m.html + m.subject).toUpperCase().replace(/-/g, "").includes(s))).length;
    ok(mailHits === 0, "hiçbir e-postada kit / kurtarma kodu yok");
  } finally {
    await db.close();
  }
  console.log(`\nowner-kilitlenme: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}
void main().catch((e) => { console.error(e); process.exit(1); });
