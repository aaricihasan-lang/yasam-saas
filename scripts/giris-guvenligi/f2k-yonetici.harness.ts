/**
 * GİRİŞ GÜVENLİĞİ F2-K (N2) — çalınmış Owner oturumuyla KALICI YÖNETİCİ ERİŞİMİ saldırısı: gerçek route'lar + gerçek
 * PostgreSQL (F2-A…F2-K zinciri). Production'a SIFIR temas; sentetik hesaplar.
 *
 * Tehdit modeli: saldırganda yalnız Owner'ın GEÇERLİ, TAZE (MFA ile açılmış) oturum çerezi var. Owner parolası, telefonu
 * ve e-posta kutusu YOK. "Telefon onayı" (meşru akış) = imzası doğrulanmış QR kararının DB adımı (auth_qr_decide).
 *
 * Testte üye oluşturma / etkinleştirme RPC'lerinin SADE karşılıkları tanımlanır (yalnız users satırını yazar): F2-K
 * korumasının asıl yeri users tetikleyicisi ve kanıt tüketen fonksiyonlardır; sade karşılıklar bunları ATLAMAZ.
 *
 * Çalıştır: npx tsx scripts/giris-guvenligi/f2k-yonetici.harness.ts
 *   F2K_WITHOUT_FIX=1 → 001100 uygulanmaz (F2-J zinciri): saldırının kendisi yeniden üretilir (beklenen: FAIL).
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
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
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
type J = Record<string, unknown>;
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const WITHOUT_FIX = process.env.F2K_WITHOUT_FIX === "1";

async function main() {
  const { startF2cDb, U, EMAIL, pw, installAdminStandIns } = await import("./testDb");
  const db = await startF2cDb(WITHOUT_FIX ? { withF2j: true } : { withF2k: true });
  const { admin } = db;
  try {
    Object.assign(process.env, {
      NEXT_PUBLIC_SUPABASE_URL: db.shimUrl, SUPABASE_SERVICE_ROLE_KEY: "f2k-n2", SESSION_COOKIE_MODE: "primary",
      RATE_LIMIT_SECRET: "f2k-n2-rate", LOGIN_IP_PEPPER: "f2k-n2-ip", REQUIRE_DB_SUPER_ADMIN_MARKER: "true",
      AUTH_MFA_METHODS: "qr_device,email_otp", AUTH_MFA_METHOD_SCOPE: "all", AUTH_MFA_EMAIL_ROLES: "expert,admin",
    });
    const q = (sql: string, a: unknown[] = []) => admin.query(sql, a);
    // Sade karşılıklar + denetim kaydı yetkisi (ortak: testDb.installAdminStandIns).
    await installAdminStandIns(admin);
    // Owner: MFA zorunlu, etkin telefon, TAZE MFA'lı oturum (saldırganın çaldığı çerez).
    await q(`SELECT set_config('yasam.mfa_policy','on',false); UPDATE public.users SET mfa_required = true WHERE id = '${U.owner}'; SELECT set_config('yasam.mfa_policy','off',false);`);
    const odev = (await q(`INSERT INTO public.auth_trusted_devices (user_id, public_key_spki, key_fingerprint, display_code, state, activated_at)
      VALUES ($1, repeat('O',120), encode(sha256(convert_to('k-owner','UTF8')),'hex'), 'KKKK-OOOO', 'active', now()) RETURNING id`, [U.owner])).rows[0].id as string;
    const sid = randomUUID();
    await q(`SELECT set_config('yasam.mfa_finalize','on',false)`);
    await q(`INSERT INTO public.user_sessions (user_id, session_token, is_active, client_channel, session_role, expires_at, mfa_method, created_at)
             VALUES ($1, $2, true, 'desktop_web', 'admin', now() + interval '1 day', 'qr_device', now() - interval '5 minutes')`, [U.owner, sid]);
    await q(`SELECT set_config('yasam.mfa_finalize','off',false)`);
    const H = { "x-admin-id": U.owner, cookie: `__Host-yasam_sid=${sid}`, "sec-fetch-site": "same-origin" };
    const usersRoute = await import("@/app/api/admin/users/route");
    const userRoute = await import("@/app/api/admin/users/[id]/route");
    const statusRoute = await import("@/app/api/admin/users/[id]/status/route");
    let ip = 30;
    type Handler = (r: NextRequest, ctx?: unknown) => Promise<Response>;
    const call = async (h: unknown, url: string, method: "POST" | "PATCH", body: unknown, params?: J) => {
      const res = await (h as Handler)(new NextRequest(url, { method,
        headers: { "content-type": "application/json", "x-real-ip": `198.51.100.${ip++ % 250}`, "user-agent": WEB_UA, ...H },
        body: JSON.stringify(body) }), params ? { params: Promise.resolve(params) } : undefined);
      return { status: res.status, json: (await res.clone().json().catch(() => ({}))) as J };
    };
    const L = "http://localhost/api/admin/users";
    // Meşru Owner telefon onayı (testte DB adımı): kanıt üret.
    const proof = async (target: string) => {
      const b = (await q(`SELECT public.auth_owner_step_up_begin($1, 'admin_grant', $2) AS r`, [sid, target])).rows[0].r as J;
      if (b.ok !== true) return b;
      return (await q(`SELECT public.auth_qr_decide($1, $2, $3, 'approve', $4) AS r`, [b.challenge_id, b.qr_nonce, odev, b.match_code])).rows[0].r as J;
    };
    const userBy = async (email: string) => (await q(`SELECT id, role, active, mfa_required FROM public.users WHERE lower(email) = lower($1)`, [email])).rows[0];
    const NEW_ADMIN = { fullName: "Saldırgan Yönetici", email: "k-saldirgan@example.test", password: "Saldirgan-Parola-123!", role: "admin", modules: [] };

    // ══ 1–2) Çalınmış çerezle yönetici oluşturma + kendi parolasını atama ══
    const c1 = await call(usersRoute.POST, L, "POST", NEW_ADMIN);
    const u1 = await userBy(NEW_ADMIN.email);
    ok(c1.status === 403 && c1.json.code === "STEP_UP_REQUIRED" && !u1, "N2-1 yalnız çerezle yönetici OLUŞTURULAMAZ (işleme özel doğrulama ister)", { c1, u1 });

    // ══ 5) Eski API / doğrudan yollar: oluşturma RPC'si, doğrudan sunucu rolü yazımı ══
    const sr = async (sql: string, a: unknown[] = []) => {
      await q("BEGIN"); await q("SET LOCAL ROLE service_role");
      try { await q(sql, a); await q("COMMIT"); return "ok"; } catch (e) { await q("ROLLBACK"); return (e as { code?: string }).code ?? "err"; }
    };
    const r5a = await sr(`SELECT public.admin_create_user_with_modules($1::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::text[])`,
      [JSON.stringify({ email: "k-eski-api@example.test", role: "admin", password_hash: "x", actor_admin_id: U.owner })]);
    ok(r5a !== "ok" && !(await userBy("k-eski-api@example.test")), "N2-5a eski oluşturma RPC'si ile yönetici AÇILAMAZ", r5a);
    const r5b = await sr(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [U.exp]);
    ok(r5b === "42501" && (await userBy(EMAIL.exp)).role === "expert", "N2-5b sunucu rolüyle doğrudan rol yükseltme REDDEDİLİR", r5b);
    const r5c = await sr(`UPDATE public.users SET is_super_admin = true WHERE id = $1`, [U.exp]);
    ok(r5c === "42501", "N2-5c sistem sahibi işareti uygulama yolundan VERİLEMEZ", r5c);

    // ══ 4) Mevcut uzmanı yöneticiye yükseltme (çerezle) ══
    const p4 = await call(userRoute.PATCH, `${L}/${U.exp}`, "PATCH", { action: "edit", fullName: "Uzman K", email: EMAIL.exp, role: "admin" }, { id: U.exp });
    ok(p4.status === 403 && p4.json.code === "STEP_UP_REQUIRED" && (await userBy(EMAIL.exp)).role === "expert",
      "N2-4 yalnız çerezle uzman → yönetici YÜKSELTİLEMEZ; hiçbir alan değişmez", p4);

    // ══ 7) Başka kullanıcı için üretilmiş kanıt ══
    if (!WITHOUT_FIX) {
      const other = (await q(`SELECT public.auth_admin_grant_email_target('baska@example.test') AS t`)).rows[0].t as string;
      const pr = await proof(other);
      const c7 = await call(usersRoute.POST, L, "POST", NEW_ADMIN);
      ok(pr.ok === true && c7.status === 403 && !(await userBy(NEW_ADMIN.email)), "N2-7 başka hedefe (başka e-posta) üretilmiş kanıt bu yöneticiyi AÇAMAZ", { pr, c7 });
      const p7 = await proof(U.and1);
      const r7 = await call(userRoute.PATCH, `${L}/${U.exp}`, "PATCH", { action: "edit", fullName: "Uzman K", email: EMAIL.exp, role: "admin" }, { id: U.exp });
      ok(p7.ok === true && r7.status === 403 && (await userBy(EMAIL.exp)).role === "expert", "N2-7b başka kullanıcı için kanıt bu kullanıcıyı YÜKSELTEMEZ", r7);
    }

    // ══ Meşru akış: Owner telefonla onaylar → yönetici oluşur; MFA zorunlu ══
    if (!WITHOUT_FIX) {
      const target = (await q(`SELECT public.auth_admin_grant_email_target($1) AS t`, [NEW_ADMIN.email])).rows[0].t as string;
      ok(c1.json.target === target, "kanıt hedefi e-postaya bağlı (rota ↔ DB aynı)", { route: c1.json.target, db: target });
      const pr = await proof(target);
      const c2 = await call(usersRoute.POST, L, "POST", NEW_ADMIN);
      const u2 = await userBy(NEW_ADMIN.email);
      ok(pr.ok === true && c2.status === 201 && u2?.role === "admin" && u2?.mfa_required === true,
        "meşru: telefon onayıyla yönetici oluştu, MFA ZORUNLU", { c2, u2 });
      // ══ 8) Aynı kanıt ikinci kez ══
      const c3 = await call(usersRoute.POST, L, "POST", { ...NEW_ADMIN, email: NEW_ADMIN.email });
      ok(c3.status !== 201, "N2-8 aynı kanıt ikinci kez KULLANILAMAZ", c3);
      // ══ 3 + 9) Yeni yönetici MFA'sız oturum alamaz → yönetici işlemi yapamaz ══
      let blocked = false;
      try {
        await q(`SELECT public.create_session_admin_web($1, 'k-yeni-admin', '1.1.1.1', 'TR', 'Istanbul', 'UA', 'desktop', 'desktop_web', NULL, now() + interval '1 day')`, [u2.id]);
      } catch { blocked = true; }
      const n = (await q(`SELECT count(*)::int AS n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [u2.id])).rows[0].n as number;
      ok(blocked && n === 0, "N2-3/9 yeni yönetici MFA kurulmadan oturum AÇAMAZ (kritik işlem yapamaz)", { blocked, n });

      // ══ 6) Eşzamanlı yükseltme: tek kanıt, iki paralel istek ══
      const p6 = await proof(U.exp);
      const [a, b2] = await Promise.all([
        call(userRoute.PATCH, `${L}/${U.exp}`, "PATCH", { action: "edit", fullName: "Uzman K", email: EMAIL.exp, role: "admin" }, { id: U.exp }),
        call(userRoute.PATCH, `${L}/${U.exp}`, "PATCH", { action: "edit", fullName: "Uzman K", email: EMAIL.exp, role: "admin" }, { id: U.exp }),
      ]);
      const ue = await userBy(EMAIL.exp);
      const grants = (await q(`SELECT count(*)::int AS n FROM public.security_events WHERE user_id = $1 AND event_type = 'admin_role_granted'`, [U.exp])).rows[0].n as number;
      ok(p6.ok === true && ue.role === "admin" && ue.mfa_required === true && grants === 1 && [a.status, b2.status].filter((s) => s === 200).length >= 1,
        "N2-6 paralel iki istekte tek kanıt yalnız BİR yetki verir; yükseltilen kullanıcıda MFA zorunlu", { a: a.status, b: b2.status, grants });
      const sess = (await q(`SELECT count(*)::int AS n FROM public.user_sessions WHERE user_id = $1 AND is_active`, [U.exp])).rows[0].n as number;
      ok(sess === 0, "yükseltilen kullanıcının açık oturumları kapandı (yeniden MFA ile giriş)", { sess });

      // ══ Pasif yönetici: etkinleştirme kanıt ister; pasifleştirme (yetki azaltma) istemez ══
      const d1 = await call(statusRoute.POST, `${L}/${u2.id}/status`, "POST", { action: "toggle_active", currentActive: true }, { id: u2.id });
      ok(d1.status === 200 && (await userBy(NEW_ADMIN.email)).active === false, "yetki azaltma: yöneticiyi pasifleştirme kanıt İSTEMEZ", d1);
      const r1 = await call(statusRoute.POST, `${L}/${u2.id}/status`, "POST", { action: "toggle_active", currentActive: false }, { id: u2.id });
      ok(r1.status === 403 && r1.json.code === "STEP_UP_REQUIRED" && (await userBy(NEW_ADMIN.email)).active === false,
        "pasif yöneticiyi yalnız çerezle etkinleştirme REDDEDİLİR", r1);
      await proof(u2.id);
      const r2 = await call(statusRoute.POST, `${L}/${u2.id}/status`, "POST", { action: "toggle_active", currentActive: false }, { id: u2.id });
      ok(r2.status === 200 && (await userBy(NEW_ADMIN.email)).active === true, "meşru: telefon onayıyla pasif yönetici etkinleşir", r2);
      // Yetki düşürme (yönetici → uzman) kanıt istemez.
      const dn = await call(userRoute.PATCH, `${L}/${u2.id}`, "PATCH", { action: "edit", fullName: "Saldırgan Yönetici", email: NEW_ADMIN.email, role: "expert" }, { id: u2.id });
      ok(dn.status === 200 && (await userBy(NEW_ADMIN.email)).role === "expert", "yetki azaltma: yönetici → uzman kanıt İSTEMEZ", dn);

      // ══ F2-L: ARAYÜZ YOLU — doğrulama penceresinin çağırdığı /api/admin/step-up 'admin_grant'ı başlatabilmeli ══
      // (tarayıcı e2e'si bu route'un 400 döndüğünü yakaladı; DB çağıran testler göremiyordu).
      const stepUpRoute = await import("@/app/api/admin/step-up/route");
      const UI_ADMIN = { ...NEW_ADMIN, email: "k-arayuz@example.test" };
      const c0 = await call(usersRoute.POST, L, "POST", UI_ADMIN);
      const sb = await call(stepUpRoute.POST, "http://localhost/api/admin/step-up", "POST", { op: "begin", action: "admin_grant", targetId: c0.json.target });
      const sq = (sb.json.qr ?? {}) as J;
      ok(c0.status === 403 && sb.status === 200 && /^[0-9]{6}$/.test(String(sq.matchCode)), "F2-L arayüz yolu: /api/admin/step-up 'admin_grant' doğrulamasını BAŞLATIR", sb);
      const nonce = /#c=[^&]+&n=([A-Za-z0-9_-]+)$/.exec(String(sq.url ?? ""))?.[1];
      if (sb.status === 200 && nonce) {
        await q(`SELECT public.auth_qr_decide($1, $2, $3, 'approve', $4)`, [sb.json.challengeId, nonce, odev, sq.matchCode]);
      }
      const c0b = await call(usersRoute.POST, L, "POST", UI_ADMIN);
      ok(c0b.status === 201 && (await userBy(UI_ADMIN.email))?.role === "admin", "F2-L arayüz yolu: telefon onayından sonra yönetici oluşur", c0b);

      // ══ Owner MFA'sız / bayat oturumla: yetki verme yolu kapalı ══
      await q(`UPDATE public.user_sessions SET created_at = now() - interval '2 hours' WHERE session_token = $1`, [sid]);
      const st = await call(usersRoute.POST, L, "POST", { ...NEW_ADMIN, email: "k-bayat@example.test" });
      ok(st.status === 403 && st.json.code === "FRESH_MFA_REQUIRED", "bayat Owner oturumu (30 dk dışı) yönetici açamaz", st);
      // Owner kurtarma: Owner'ın kendi hesabı / oturum açma etkilenmedi (tetikleyici yalnız yetki KAZANIMINI denetler).
      const ow = (await q(`SELECT role, active, is_super_admin FROM public.users WHERE id = $1`, [U.owner])).rows[0];
      ok(ow.role === "admin" && ow.active === true && ow.is_super_admin === true, "Owner hesabı kilitlenmedi", ow);
      void pw;
    }
  } finally {
    await db.close();
  }
  console.log(`\nf2k-yonetici${WITHOUT_FIX ? " (DÜZELTMESİZ)" : ""}: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
