/**
 * GİRİŞ GÜVENLİĞİ — Owner İki Aşamalı Giriş Yönetimi: UÇTAN UCA route harness'ı (GERÇEK PostgreSQL + bütün F2 zinciri
 * 000000…001100 + GERÇEK route'lar, HttpOnly çerez birincil kip). Production'a SIFIR temas; sentetik hesaplar; e-posta
 * SENTETİK (gerçek Gmail YOK).
 *
 * Kanıtlanan:
 *   A) Yalnız Owner: Owner olmayan yönetici / uzman / sahte x-admin-id / CSRF / iptal edilmiş oturum → işlem YOK.
 *   B) Durum: gizli değer dönmez; giriş akışıyla AYNI yöntem hesabı.
 *   C) Kilitlenme koruması: DB'de e-posta doğrulanmış olsa bile Gmail kapalı / yöntem kapalı / kapsam dışı / rol izinsiz
 *      → zorunluluk AÇILMAZ (DB fonksiyonu tek başına kabul ederdi — fark ölçülür).
 *   D) Açma: açık onay + gerekçe; aynı işlemde MFA'sız oturumlar kapanır; tekrar ve eşzamanlı çift istek tek değişiklik.
 *      Açılan üye girişte gerçekten yöntem bulur; parolaya düşülmez.
 *   E) Owner ilk kurulum: e-posta doğrulanmış Owner kendi zorunluluğunu açar → MFA'sız oturumu kapanır → e-posta koduyla
 *      taze oturum. Arka kapı yok.
 *   F) Kaldırma: taze MFA'sız oturum RED; kanıtsız RED; başka üyeye bağlı kanıt RED; kanıtla bir kez; kanıt ikinci kez
 *      geçmez; Owner kendi zorunluluğunu kaldıramaz.
 *   G) E-posta servisi sonradan kapanırsa: zorunlu üye parolaya DÜŞMEZ (oturum yok); Owner ekranı riski gösterir.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/mfa-yonetimi-routes.harness.ts
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
  else { fail++; failures.push(label); console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n── ${s} ──`);
type J = Record<string, unknown>;
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
function cookieFrom(res: Response, name: string): string {
  const all = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const raw of all) if (raw.startsWith(`${name}=`)) return raw.slice(name.length + 1).split(";")[0];
  return "";
}

const BASE_ENV = {
  SESSION_COOKIE_MODE: "primary", RATE_LIMIT_SECRET: "mfa-yonetim-rate", LOGIN_IP_PEPPER: "mfa-yonetim-ip",
  REQUIRE_DB_SUPER_ADMIN_MARKER: "true", AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all",
  AUTH_MFA_EMAIL_ROLES: "expert,owner", EMAIL_PROVIDER: "synthetic", EMAIL_SYNTHETIC_ALLOW: "1",
  AUTH_OTP_PEPPER: "mfa-yonetim-pepper-0123456789abcdefghijklmnop",
};

async function main() {
  const { startF2cDb, U, EMAIL, pw } = await import("./testDb");
  const db = await startF2cDb({ withF2d: true, withF2e: true, withF2g: true, withF2h: true, withF2i: true, withF2j: true, withF2k: true });
  const { admin } = db;
  const ADM2 = { id: "00000000-0000-0000-0000-00000000a002", email: "admin2@test.local" };
  const MOB1 = { id: "00000000-0000-0000-0000-00000000e001", email: "free@test.local" };  // oturum limiti yok (fikstür -1)
  const EXC = { id: "00000000-0000-0000-0000-00000000e003", email: "exc@test.local" };
  try {
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "mfa-yonetim-service-key", ...BASE_ENV });
    delete process.env.SESSION_EXPIRY_ENFORCE;
    const { syntheticOutbox } = await import("@/lib/email/syntheticProvider");
    const sessionRoute = await import("@/app/api/auth/session/route");
    const completeRoute = await import("@/app/api/auth/mfa/complete/route");
    const sendRoute = await import("@/app/api/auth/mfa/email/send/route");
    const verifyRoute = await import("@/app/api/auth/mfa/email/verify/route");
    const stepUp = await import("@/app/api/admin/step-up/route");
    const mfaRoute = await import("@/app/api/admin/users/[id]/mfa/route");

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
    const lastCode = (to: string) => /^([0-9]{6}) — /.exec([...syntheticOutbox()].reverse().find((m) => m.to === to)?.subject ?? "")?.[1] ?? "";
    const web = (bind: string) => ({ "sec-fetch-site": "same-origin", cookie: `__Host-yasam_mfa=${bind}` });
    const adminH = (id: string, sid: string) => ({ "x-admin-id": id, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" });
    const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
    const getStatus = (actor: string, sid: string, target: string) =>
      call(mfaRoute.GET, `${L}/api/admin/users/${target}/mfa`, "GET", null, adminH(actor, sid), ctxOf(target));
    const setMfa = (actor: string, sid: string, target: string, body: J, extra: Record<string, string> = {}) =>
      call(mfaRoute.POST, `${L}/api/admin/users/${target}/mfa`, "POST", body, { ...adminH(actor, sid), ...extra }, ctxOf(target));
    const required = async (id: string) => (await q(`SELECT mfa_required, mfa_required_at FROM public.users WHERE id = $1`, [id])).rows[0] as { mfa_required: boolean; mfa_required_at: Date | null };
    const sessionActive = async (sid: string) => ((await q(`SELECT is_active FROM public.user_sessions WHERE session_token = $1`, [sid])).rows[0] as { is_active?: boolean } | undefined)?.is_active === true;
    const login = async (email: string) => {
      const l = await call(sessionRoute.POST, `${L}/api/auth/session`, "POST", { email, password: pw(email) });
      return { status: l.res.status, json: l.json, sid: cookieFrom(l.res, "__Host-yasam_sid"), bind: cookieFrom(l.res, "__Host-yasam_mfa") };
    };
    const emailMfaLogin = async (email: string, uid: string) => {
      await q(`UPDATE public.auth_mfa_challenges SET state = 'expired' WHERE user_id = $1 AND state IN ('pending','verified')`, [uid]);
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [uid]);
      const l = await login(email);
      const ch = String(l.json.challengeId ?? "");
      await call(sendRoute.POST, `${L}/api/auth/mfa/email/send`, "POST", { challengeId: ch }, web(l.bind));
      await call(verifyRoute.POST, `${L}/api/auth/mfa/email/verify`, "POST", { challengeId: ch, code: lastCode(email) }, web(l.bind));
      const c = await call(completeRoute.POST, `${L}/api/auth/mfa/complete`, "POST", { challengeId: ch }, web(l.bind));
      return { first: l, sid: cookieFrom(c.res, "__Host-yasam_sid"), completeStatus: c.res.status };
    };
    const withEnv = async <T>(patch: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> => {
      const saved: Record<string, string | undefined> = {};
      for (const k of Object.keys(patch)) { saved[k] = process.env[k]; if (patch[k] === undefined) delete process.env[k]; else process.env[k] = patch[k]; }
      try { return await fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
    };
    const ENABLE = (reason = "Owner kararı: hesap güvenliği") => ({ action: "enable", reason, confirm: true });
    const DISABLE = (reason = "Üye telefonunu kaybetti, kurtarma") => ({ action: "disable", reason, confirm: true });

    section("Kurulum");
    for (const u of [U.owner, MOB1.id, EXC.id]) ok((await required(u)).mfa_required === false, `başlangıç: ${u.slice(-4)} zorunluluk KAPALI (migration kimseyi zorunlu yapmaz)`);
    const owner0 = await login(EMAIL.owner);
    ok(owner0.status === 200 && !!owner0.sid, "Owner (henüz MFA'sız) oturum açtı", owner0.json);
    const adm2 = await login(ADM2.email);
    ok(adm2.status === 200 && !!adm2.sid, "Owner olmayan yönetici oturum açtı", adm2.json);

    section("A) Yalnız Owner");
    const a1 = await getStatus(ADM2.id, adm2.sid, MOB1.id);
    ok(a1.res.status === 403 && a1.json.code === "OWNER_ONLY" && !a1.json.status, "Owner olmayan yönetici durumu GÖREMEZ", a1.json);
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [MOB1.id]);
    const a2 = await setMfa(ADM2.id, adm2.sid, MOB1.id, ENABLE());
    ok(a2.res.status === 403 && (await required(MOB1.id)).mfa_required === false, "Owner olmayan yönetici zorunluluk AÇAMAZ", a2.json);
    const mob = await login(MOB1.email);
    const a3 = await setMfa(MOB1.id, mob.sid, MOB1.id, ENABLE());
    ok(a3.res.status >= 401 && a3.res.status <= 403 && (await required(MOB1.id)).mfa_required === false, "uzman kendi isteğiyle açamaz (yönetici değil)", { s: a3.res.status });
    // F4: Owner dışı hesapta zorunluluk için kurtarma kodu şartı (gerçek akış: üye kodlarını ÖNCE oluşturur). Sentetik özet satırları;
    // kural ayrıca f4-kurtarma-guvenligi'nde (kodsuz → 409 RECOVERY_REQUIRED) sınanır.
    await q(`INSERT INTO public.auth_recovery_codes (user_id, kind, batch_id, code_hash)
             SELECT u, 'user', gen_random_uuid(), md5(random()::text) || md5(random()::text) FROM unnest($1::uuid[]) u`, [[MOB1.id, U.and1, EXC.id]]);
    const a4 = await setMfa(U.owner, adm2.sid, MOB1.id, ENABLE());
    ok(a4.res.status >= 401 && a4.res.status <= 403 && (await required(MOB1.id)).mfa_required === false, "başka yöneticinin oturumu + Owner kimliği (x-admin-id) → RED", { s: a4.res.status });
    const a5 = await setMfa(U.owner, owner0.sid, MOB1.id, ENABLE(), { "sec-fetch-site": "cross-site", origin: "https://evil.example" });
    ok(a5.res.status === 403 && (await required(MOB1.id)).mfa_required === false, "çapraz site (CSRF) isteği → RED", { s: a5.res.status });
    const a6 = await call(mfaRoute.POST, `${L}/api/admin/users/${MOB1.id}/mfa`, "POST", ENABLE(), { "x-admin-id": U.owner, "sec-fetch-site": "same-origin" }, ctxOf(MOB1.id));
    ok(a6.res.status === 401 && (await required(MOB1.id)).mfa_required === false, "oturumsuz istek → RED", { s: a6.res.status });

    section("B) Durum (gizli değer yok, giriş akışıyla aynı hesap)");
    await q(`UPDATE public.users SET email_verified_at = NULL WHERE id = $1`, [MOB1.id]);
    const b1 = await getStatus(U.owner, owner0.sid, MOB1.id);
    const st1 = (b1.json.status ?? {}) as J;
    ok(b1.res.status === 200 && st1.ready === false && st1.mfaRequired === false, "doğrulanmamış e-posta + cihaz yok → HAZIR DEĞİL", b1.json);
    ok(JSON.stringify((st1.methods as J)?.email_otp).includes("email_not_verified") && JSON.stringify((st1.methods as J)?.qr_device).includes("no_active_device"), "neden kodları + sade Türkçe metin", st1.methods);
    const raw = JSON.stringify(b1.json);
    const rawNoIds = raw.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "");
    ok(!raw.includes("@") && !/[0-9]{6}/.test(rawNoIds) && !raw.includes(owner0.sid) && !/password|token|pepper|secret/i.test(raw), "yanıtta e-posta adresi / kod / oturum anahtarı / gizli değer YOK");

    section("C) Kilitlenme koruması (DB tek başına yeterli sayılmaz)");
    const c1 = await setMfa(U.owner, owner0.sid, MOB1.id, ENABLE());
    ok(c1.res.status === 409 && c1.json.code === "NO_USABLE_METHOD" && (await required(MOB1.id)).mfa_required === false, "e-postası doğrulanmamış uzman → AÇILMAZ (409)", c1.json);
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [MOB1.id]);
    const dbWouldAccept = ((await q(`SELECT public.auth_mfa_user_has_method($1) AS v`, [MOB1.id])).rows[0] as { v: boolean }).v;
    ok(dbWouldAccept === true, "ölçüm: DB fonksiyonu (yalnız veri) bu hesabı 'yöntemi var' sayıyor");
    for (const [label, patch, code] of [
      ["Gmail / e-posta servisi kapalı", { EMAIL_PROVIDER: undefined }, "email_provider_missing"],
      ["pepper eksik (servis yapılandırılmamış)", { AUTH_OTP_PEPPER: undefined }, "email_provider_missing"],
      ["e-posta yöntemi sistemde kapalı", { AUTH_MFA_METHODS: "qr_device" }, "method_not_offered"],
      ["kapsam yalnız test hesapları", { AUTH_MFA_METHOD_SCOPE: "test_accounts" }, "scope_test_accounts"],
      ["rol izni yok (yalnız Owner)", { AUTH_MFA_EMAIL_ROLES: "owner" }, "email_role_not_allowed"],
    ] as const) {
      await withEnv(patch as Record<string, string | undefined>, async () => {
        const s = await getStatus(U.owner, owner0.sid, MOB1.id);
        const e = await setMfa(U.owner, owner0.sid, MOB1.id, ENABLE());
        ok(e.res.status === 409 && JSON.stringify((s.json.status as J)?.methods).includes(code) && (await required(MOB1.id)).mfa_required === false,
          `${label} → AÇILMAZ, neden gösterilir (${code})`, { s: e.res.status, m: (s.json.status as J)?.methods });
      });
    }

    // NEGATİF KONTROL: API'deki ortam kontrolü olmasaydı ne olurdu? (ayrı sentetik üye; DB fonksiyonu doğrudan, Gmail kapalı)
    const AND1 = { id: U.and1, email: EMAIL.and1 };
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [AND1.id]);
    await withEnv({ EMAIL_PROVIDER: undefined }, async () => {
      const raw0 = (await q(`SELECT public.auth_mfa_set_required($1, $2, true, 'API atlanarak (negatif kontrol)') AS r`, [owner0.sid, AND1.id])).rows[0] as { r: J };
      const lockedLogin = await login(AND1.email);
      // F4: üyenin kurtarma kodu (fikstür) olduğu için tam kilitlenme yerine YALNIZ kurtarma kodu kalır — asıl yöntem yok,
      // parolayla oturum yok. API kontrolünün gerekçesi değişmez (asıl yöntemsiz zorunluluk).
      ok(raw0.r.ok === true && lockedLogin.status === 202 && !lockedLogin.sid && JSON.stringify(lockedLogin.json.methods) === '["recovery_code"]',
        "NEGATİF KONTROL: ortam kontrolü atlanırsa üyenin ASIL yöntemi kalmaz (DB kabul etti; yalnız kurtarma kodu) — API kontrolünün gerekçesi", { raw0: raw0.r, login: lockedLogin.json.methods });
    });

    section("D) Açma — onay, gerekçe, atomik oturum kapatma, tekrar / eşzamanlılık");
    const d0 = await getStatus(U.owner, owner0.sid, MOB1.id);
    ok((d0.json.status as J)?.ready === true && JSON.stringify((d0.json.status as J)?.loginMethods).includes("email_otp"), "ayarlar tamam → HAZIR (girişte e-posta kodu sunulacak)", d0.json.status);
    const dNoConfirm = await setMfa(U.owner, owner0.sid, MOB1.id, { action: "enable", reason: "gerekçe var" });
    ok(dNoConfirm.res.status === 400 && dNoConfirm.json.code === "CONFIRM_REQUIRED" && (await required(MOB1.id)).mfa_required === false, "açık onay olmadan → RED", dNoConfirm.json);
    const dNoReason = await setMfa(U.owner, owner0.sid, MOB1.id, { action: "enable", reason: " a ", confirm: true });
    ok(dNoReason.res.status === 400 && (await required(MOB1.id)).mfa_required === false, "gerekçesiz → RED", dNoReason.json);
    const mobOld = await login(MOB1.email);
    ok(await sessionActive(mobOld.sid), "üyenin MFA'sız açık oturumu var (başka sekme)");
    const d1 = await setMfa(U.owner, owner0.sid, MOB1.id, ENABLE());
    const r1 = await required(MOB1.id);
    ok(d1.res.status === 200 && d1.json.changed === true && r1.mfa_required === true && !!r1.mfa_required_at, "Owner onaylı + gerekçeli → AÇILDI", d1.json);
    ok(!(await sessionActive(mobOld.sid)) && !(await sessionActive(mob.sid)), "aynı işlemde üyenin MFA'sız oturumları KAPANDI");
    const ev = (await q(`SELECT metadata FROM public.security_events WHERE user_id = $1 AND event_type = 'mfa_policy_changed' ORDER BY created_at DESC LIMIT 1`, [MOB1.id])).rows[0] as { metadata?: J } | undefined;
    ok(ev?.metadata?.actor_id === U.owner && ev?.metadata?.required === true && String(ev?.metadata?.reason).includes("Owner kararı"), "denetim kaydı: aktör + gerekçe", ev);
    const d2 = await setMfa(U.owner, owner0.sid, MOB1.id, ENABLE());
    ok(d2.res.status === 200 && d2.json.changed === false, "aynı işlemi tekrar gönderme → değişiklik yok", d2.json);
    const [p1, p2] = await Promise.all([setMfa(U.owner, owner0.sid, EXC.id, ENABLE()), setMfa(U.owner, owner0.sid, EXC.id, ENABLE())]);
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [EXC.id]);
    const [p3, p4] = await Promise.all([setMfa(U.owner, owner0.sid, EXC.id, ENABLE()), setMfa(U.owner, owner0.sid, EXC.id, ENABLE())]);
    const evCount = Number(((await q(`SELECT count(*)::int AS n FROM public.security_events WHERE user_id = $1 AND event_type = 'mfa_policy_changed'`, [EXC.id])).rows[0] as { n: number }).n);
    ok(p1.res.status === 409 && p2.res.status === 409, "yöntemsizken eşzamanlı iki istek → ikisi de RED");
    ok([p3.json.changed, p4.json.changed].filter((x) => x === true).length === 1 && evCount === 1, "eşzamanlı çift gönderim → TEK değişiklik, tek denetim kaydı", { p3: p3.json.changed, p4: p4.json.changed, evCount });
    const mobLogin = await login(MOB1.email);
    ok(mobLogin.status === 202 && !mobLogin.sid && JSON.stringify(mobLogin.json.methods).includes("email_otp"), "üye girişte YÖNTEM BULUR (e-posta kodu); parolayla oturum açılmaz", mobLogin.json);
    const mobMfa = await emailMfaLogin(MOB1.email, MOB1.id);
    ok(mobMfa.completeStatus === 200 && !!mobMfa.sid, "üye e-posta koduyla güvenli giriş yaptı (kilitlenme yok)");

    section("E) Owner ilk kurulum (önce Owner)");
    const fresh0 = await setMfa(U.owner, owner0.sid, MOB1.id, DISABLE());
    ok(fresh0.res.status === 403 && fresh0.json.code === "fresh_mfa_required" && (await required(MOB1.id)).mfa_required === true, "MFA'sız Owner başkasının zorunluluğunu KALDIRAMAZ", fresh0.json);
    const ownerSelf0 = await getStatus(U.owner, owner0.sid, U.owner);
    ok((ownerSelf0.json.status as J)?.ready === false && ownerSelf0.json.isSelf === true, "Owner'ın kendi e-postası doğrulanmadan hazır değil", ownerSelf0.json.status);
    await q(`UPDATE public.users SET email_verified_at = now() WHERE id = $1`, [U.owner]);   // Ayarlar → Giriş Yöntemlerim ile doğrulandı (F2-D akışı ayrıca sınanır)
    // Owner kilitlenme koruması (23.11): kendi zorunluluğu için kullanılmamış çevrimdışı kit şart; kit ile normal kod ayrı.
    const noKit = await setMfa(U.owner, owner0.sid, U.owner, ENABLE("Owner MFA etkinleştirme"));
    ok(noKit.res.status === 409 && noKit.json.code === "OWNER_RECOVERY_REQUIRED" && (await required(U.owner)).mfa_required === false && (await sessionActive(owner0.sid)),
      "kit yokken Owner kendi zorunluluğunu AÇAMAZ (409); oturum açık kalır", noKit.json);
    const kitN = (await q(`SELECT count(*)::int n FROM public.auth_owner_offline_kit_issue() k`)).rows[0] as { n: number };   // SQL konsolu (sentetik DB); kodlar okunmaz
    const ownerKit = await getStatus(U.owner, owner0.sid, U.owner);
    ok(kitN.n === 5 && (ownerKit.json.status as J)?.ownerOfflineKitLeft === 5 && (ownerKit.json.status as J)?.recoveryCodesLeft === 0 && (ownerKit.json.status as J)?.ownerSelfRecoveryReady === true,
      "kit 5 · normal kurtarma kodu 0 — AYRI gösterilir; Owner hazır", ownerKit.json.status);
    const e1 = await setMfa(U.owner, owner0.sid, U.owner, ENABLE("Owner MFA etkinleştirme"));
    ok(e1.res.status === 200 && e1.json.changed === true && e1.json.reloginRequired === true && (await required(U.owner)).mfa_required === true, "Owner kendi zorunluluğunu açtı (yeniden giriş istenir)", e1.json);
    ok(!(await sessionActive(owner0.sid)), "Owner'ın MFA'sız oturumu aynı işlemde KAPANDI");
    const e2 = await getStatus(U.owner, owner0.sid, MOB1.id);
    ok(e2.res.status === 401 || e2.res.status === 403, "kapanan oturumla yönetim YOK", { s: e2.res.status });
    const ownerPw = await login(EMAIL.owner);
    ok(ownerPw.status === 202 && !ownerPw.sid, "Owner artık parolayla oturum AÇAMAZ (ikinci doğrulama şart)", ownerPw.json);
    const owner = await emailMfaLogin(EMAIL.owner, U.owner);
    ok(owner.completeStatus === 200 && !!owner.sid, "Owner e-posta koduyla taze MFA oturumu aldı");

    section("F) Kaldırma — taze MFA + işleme / üyeye bağlı tek kullanımlık kanıt");
    const f0 = await setMfa(U.owner, owner.sid, MOB1.id, { action: "disable", reason: "gerekçe var" });
    ok(f0.res.status === 400 && f0.json.code === "CONFIRM_REQUIRED", "açık onaysız kaldırma → RED", f0.json);
    const f1 = await setMfa(U.owner, owner.sid, MOB1.id, DISABLE());
    ok(f1.res.status === 403 && f1.json.code === "STEP_UP_REQUIRED" && f1.json.action === "mfa_disable" && (await required(MOB1.id)).mfa_required === true, "kanıtsız → ek doğrulama istenir (değişmez)", f1.json);
    const stepUpFor = async (target: string) => {
      await q(`UPDATE public.auth_email_otps SET created_at = created_at - interval '2 minutes', expires_at = expires_at - interval '2 minutes' WHERE user_id = $1`, [U.owner]);
      const b = await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "begin", action: "mfa_disable", targetId: target }, adminH(U.owner, owner.sid));
      const ch = String(b.json.challengeId ?? "");
      await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "email_send", challengeId: ch }, adminH(U.owner, owner.sid));
      const v = await call(stepUp.POST, `${L}/api/admin/step-up`, "POST", { op: "email_verify", challengeId: ch, code: lastCode(EMAIL.owner) }, adminH(U.owner, owner.sid));
      return { begin: b.res.status, verify: v.res.status };
    };
    const sEXC = await stepUpFor(EXC.id);
    ok(sEXC.begin === 200 && sEXC.verify === 200, "Owner başka üye (EXC) için kanıt aldı");
    const f2 = await setMfa(U.owner, owner.sid, MOB1.id, DISABLE());
    ok(f2.json.code === "STEP_UP_REQUIRED" && (await required(MOB1.id)).mfa_required === true, "BAŞKA üyeye bağlı kanıt bu üyede GEÇMEZ", f2.json);
    const adm2f = await setMfa(ADM2.id, adm2.sid, MOB1.id, DISABLE());
    ok(adm2f.res.status === 403 && (await required(MOB1.id)).mfa_required === true, "Owner olmayan yönetici kaldıramaz", adm2f.json);
    const sMOB = await stepUpFor(MOB1.id);
    ok(sMOB.verify === 200, "Owner bu üye için kanıt aldı");
    const f3 = await setMfa(U.owner, owner.sid, MOB1.id, DISABLE());
    const r3 = await required(MOB1.id);
    ok(f3.res.status === 200 && f3.json.changed === true && r3.mfa_required === false && r3.mfa_required_at === null, "kanıtla zorunluluk KALDIRILDI", f3.json);
    const used = Number(((await q(`SELECT count(*)::int AS n FROM public.auth_mfa_challenges WHERE user_id = $1 AND purpose = 'step_up' AND state = 'consumed'`, [U.owner])).rows[0] as { n: number }).n);
    ok(used >= 1, "kanıt aynı işlemde TÜKETİLDİ", { used });
    const f4 = await setMfa(U.owner, owner.sid, MOB1.id, ENABLE("yeniden aç"));
    ok(f4.res.status === 200 && f4.json.changed === true, "yeniden açıldı (açma kanıt istemez)");
    const f5 = await setMfa(U.owner, owner.sid, MOB1.id, DISABLE());
    ok(f5.json.code === "STEP_UP_REQUIRED" && (await required(MOB1.id)).mfa_required === true, "kullanılmış kanıt İKİNCİ KEZ GEÇMEZ", f5.json);
    const f6 = await setMfa(U.owner, owner.sid, U.owner, DISABLE());
    ok(f6.res.status === 403 && f6.json.code === "self_disable_forbidden" && (await required(U.owner)).mfa_required === true, "Owner kendi zorunluluğunu KALDIRAMAZ", f6.json);
    const selfDb = (await q(`SELECT public.auth_mfa_set_required($1, $2, false, 'doğrudan RPC denemesi') AS r`, [owner.sid, U.owner])).rows[0] as { r: J };
    ok(selfDb.r.ok === false && selfDb.r.code === "self_disable_forbidden", "DB de Owner'ın kendi kaldırmasını reddeder (API'yi atlasa bile)", selfDb.r);
    const directDb = (await q(`SELECT public.auth_mfa_set_required($1, $2, false, 'doğrudan RPC denemesi') AS r`, [owner.sid, MOB1.id])).rows[0] as { r: J };
    ok(directDb.r.ok === false && directDb.r.code === "step_up_required" && (await required(MOB1.id)).mfa_required === true, "DB'ye doğrudan çağrı da kanıtsız kaldıramaz", directDb.r);
    const anonGrant = (await q(`SELECT has_function_privilege('anon', 'public.auth_mfa_set_required(text,uuid,boolean,text)', 'EXECUTE') AS a, has_function_privilege('authenticated', 'public.auth_mfa_set_required(text,uuid,boolean,text)', 'EXECUTE') AS b`)).rows[0] as { a: boolean; b: boolean };
    ok(anonGrant.a === false && anonGrant.b === false, "istemci rolleri (anon / authenticated) fonksiyonu ÇAĞIRAMAZ", anonGrant);
    const roleExists = ((await q(`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') AS v`)).rows[0] as { v: boolean }).v;
    ok(roleExists && (await required(MOB1.id)).mfa_required === true, "ölçüm ön koşulu: service_role var ve üyenin zorunluluğu AÇIK");
    let directUpdate = "";
    try { await q(`SET ROLE service_role; UPDATE public.users SET mfa_required = false WHERE id = '${MOB1.id}'; RESET ROLE;`); directUpdate = "geçti"; }
    catch (e) { directUpdate = String((e as Error).message).slice(0, 120); await q(`RESET ROLE`); }
    ok(directUpdate !== "geçti" && !/does not exist/.test(directUpdate) && (await required(MOB1.id)).mfa_required === true,
      "service_role ile users tablosuna doğrudan UPDATE → RED (zorunluluk değişmez)", directUpdate);

    section("G) E-posta servisi sonradan kapanırsa");
    await withEnv({ EMAIL_PROVIDER: undefined }, async () => {
      const g1 = await login(MOB1.email);
      ok(g1.status === 202 && !g1.sid && JSON.stringify(g1.json.methods) === '["recovery_code"]', "zorunlu üye parolaya DÜŞMEZ (oturum yok); e-posta yöntemi kalkar, KURTARMA KODU kalır (F4: kilitlenme yok)", g1.json.methods);
      const g2 = await getStatus(U.owner, owner.sid, MOB1.id);
      const gs = (g2.json.status ?? {}) as J;
      ok(gs.mfaRequired === true && gs.ready === false && JSON.stringify(gs.methods).includes("email_provider_missing"), "Owner ekranı riski gösterir (zorunlu + yöntem yok)", gs);
    });
    const g3 = await login(MOB1.email);
    ok(g3.status === 202 && JSON.stringify(g3.json.methods).includes("email_otp"), "servis dönünce üye yine giriş yapabilir");
  } finally {
    console.log(`\nmfa-yonetimi-routes: ${pass} PASS, ${fail} FAIL`);
    if (failures.length) console.log("FAIL:\n - " + failures.join("\n - "));
    await db.close();
  }
  process.exit(fail ? 1 : 0);
}
void main().catch((e) => { console.error(e); console.log(`\nmfa-yonetimi-routes: ${pass} PASS, ${fail + 1} FAIL`); process.exit(1); });
