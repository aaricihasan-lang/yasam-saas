/**
 * ÜYE YÖNETİMİ H1–H4 — etiket + eski kayıt onarımı + deneme→Pro harness'ı
 * (gerçek Next handler + gerçek PostgreSQL + gerçek migration'lar; embedded-postgres + test PostgREST shim).
 * Production'a / ağa SIFIR temas; tüm hesaplar sentetiktir (ZZ_H1H4_*).
 *
 *   H1  Pro (Premium) üyede kayıtlı geçmiş deneme penceresi "deneme süresi doldu" uyarısı ÜRETMEZ; tarih silinmez.
 *   H2  20280101000300 admin_repair_legacy_expert_to_pro: yalnız ana yönetici, yalnız uygun eski kayıt, bayat ekran
 *       409, en az bir modül, Astroloji teknik izni, eşzamanlı çift istek → tek kazanan, audit aynı işlemde,
 *       deneme tarihçesi + ilk onay tarihi + user_id + tenant + danışan kayıtları korunur; migration hiçbir satırı
 *       değiştirmez; anon/authenticated çalıştıramaz.
 *   H3  süresi dolmuş 7 günlük deneme: "Aktif Yap" (pasif → aktif) deneme kısıtını kaldırmaz (salt okunur kalır);
 *       detaydaki doğru yol (deneme → Pro dönüşümü) tam erişim verir, kayıtlar korunur; eski kayıt onarımı deneme
 *       üyesine uygulanamaz, deneme dönüşümü eski kayda uygulanamaz.
 *   H4  uyarı türleri: eski kayıt → "legacy", 7 günlük deneme → "trial7"; Premium → yok.
 *
 * Çalıştır: npx tsx scripts/uye-yonetimi-h1h4/h1h4.harness.ts
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";

process.env.RATE_LIMIT_SECRET = "zz-h1h4-rate-limit-secret";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
}

const OWNER = "00000000-0000-4000-8000-0000000014a1";
const ADMIN2 = "00000000-0000-4000-8000-0000000014a2";
const TOK = { owner: "zz-h1h4-owner-token-0001", admin2: "zz-h1h4-admin2-token-0001" };
const ALL_TECH = { mode: "all" };

async function main(): Promise<void> {
  const port = 55000 + Math.floor(Math.random() * 3000);
  const db = await startTestDb(port, `uye-yonetimi-h1h4-${port}`);
  const { su } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    // Canlıdaki zincirin devamı: Gökyüzü Atlası teknik izinleri + TRIAL7 (3 migration) — sonra H2 migration'ı.
    for (const f of [
      "20271230000000_astrology_technique_grants.sql",
      "20280101000000_trial7_self_trial.sql",
      "20280101000100_trial7_claims_retention.sql",
      "20280101000200_trial7_admin_trial_approval.sql",
    ]) {
      await su.query(readMig(f));
    }
    await su.query(`grant select, insert, update on public.clients to service_role`);

    const tenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]);
      return id;
    };
    for (const [id, name, email, sup] of [
      [OWNER, "ZZ_H1H4_OWNER", "zz.h1h4.owner@example.test", true],
      [ADMIN2, "ZZ_H1H4_ADMIN2", "zz.h1h4.admin2@example.test", false],
    ] as [string, string, string, boolean][]) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id)
         values ($1,$2,$3,'admin',true,'approved',$4,$5,$6)`,
        [id, name, email, sup, sup ? "owner" : "admin", await tenant()],
      );
    }
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4)`, [OWNER, TOK.owner, ADMIN2, TOK.admin2]);

    type Kind = "premium_past_window" | "legacy" | "legacy_inactive" | "premium" | "demo" | "pending";
    const mk = async (kind: Kind, label: string) => {
      const id = randomUUID();
      const t = await tenant();
      const past = "2026-09-12T10:00:00+03:00";
      const started = "2026-09-05T10:00:00+03:00";
      const cfg: Record<Kind, { active: boolean; approval: string; pkg: string | null; plan: string; ts: string | null; te: string | null; demo: boolean; perms: Record<string, boolean> }> = {
        // H1: eski akışla onaylanmış Pro — onay anında yazılan "keşif" penceresi geçmiş.
        premium_past_window: { active: true, approval: "approved", pkg: "premium", plan: "premium", ts: started, te: past, demo: false, perms: { clients: true, numerology: true } },
        // H2: onaylı + aktif ama paketi Premium değil (canlıdaki eski kayıtla aynı şekil: package_type NULL, plan trial).
        legacy: { active: true, approval: "approved", pkg: null, plan: "trial", ts: started, te: past, demo: false, perms: {} },
        legacy_inactive: { active: false, approval: "approved", pkg: null, plan: "trial", ts: started, te: past, demo: false, perms: {} },
        premium: { active: true, approval: "approved", pkg: "premium", plan: "premium", ts: null, te: null, demo: false, perms: { clients: true } },
        demo: { active: true, approval: "approved", pkg: "trial", plan: "trial", ts: null, te: null, demo: true, perms: {} },
        pending: { active: false, approval: "pending", pkg: null, plan: "trial", ts: started, te: past, demo: false, perms: {} },
      };
      const c = cfg[kind];
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, package_type, plan,
                                  subscription_status, membership_status, trial_started_at, trial_ends_at, is_demo_account,
                                  module_permissions, tenant_id)
         values ($1,$2,$3,'expert',$4,$5,$6::timestamptz,$7,$8,$8,$8,$9::timestamptz,$10::timestamptz,$11,$12,$13)`,
        [id, label, `zz.h1h4.${kind}.${id.slice(0, 6)}@example.test`, c.active, c.approval,
          c.approval === "approved" ? "2026-09-20T17:43:00+03:00" : null, c.pkg, c.plan, c.ts, c.te, c.demo, JSON.stringify(c.perms), t],
      );
      await su.query(`insert into public.clients(tenant_id, full_name) values ($1,'ZZ Danışan A'),($1,'ZZ Danışan B')`, [t]);
      return { id, tenant: t };
    };

    const P1 = await mk("premium_past_window", "ZZ_H1H4 Pro Eski Pencere");
    const L1 = await mk("legacy", "ZZ_H1H4 Eski Kayıt");
    const L2 = await mk("legacy", "ZZ_H1H4 Eski Kayıt Astro");
    const L3 = await mk("legacy", "ZZ_H1H4 Eski Kayıt Yarış");
    const L4 = await mk("legacy", "ZZ_H1H4 Eski Kayıt Yalnız HD");
    const L5 = await mk("legacy", "ZZ_H1H4 Eski Kayıt Yalnız Numeroloji");
    const TR2 = await mk("pending", "ZZ_H1H4 Deneme Adayı 2");
    const LI = await mk("legacy_inactive", "ZZ_H1H4 Eski Pasif");
    const PR = await mk("premium", "ZZ_H1H4 Premium");
    const DM = await mk("demo", "ZZ_H1H4 Demo");
    const PD = await mk("pending", "ZZ_H1H4 Bekleyen");
    const TR = await mk("pending", "ZZ_H1H4 Deneme Adayı");

    // ── H2 migration: iki kez uygulanır; hiçbir satır değişmez ─────────────────────
    console.log("[M] H2 migration");
    const snapSql = `select id, active, approval_status, approved_at, package_type, plan, subscription_status, membership_status,
                            trial_started_at, trial_ends_at, trial_kind, trial_status, module_permissions, tenant_id
                       from public.users order by id`;
    const before = JSON.stringify((await su.query(snapSql)).rows);
    const auditBefore = (await su.query(`select count(*)::int n from public.admin_audit_log`)).rows[0].n;
    await su.query(readMig("20280101000300_admin_legacy_package_repair.sql"));
    await su.query(readMig("20280101000300_admin_legacy_package_repair.sql"));
    ok(JSON.stringify((await su.query(snapSql)).rows) === before, "M1 migration iki kez uygulandı; hiçbir kullanıcı satırı değişmedi (kendiliğinden Pro YOK)");
    ok((await su.query(`select count(*)::int n from public.admin_audit_log`)).rows[0].n === auditBefore, "M2 migration audit yazmadı");
    const acl = (await su.query(
      `select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') b,
              has_function_privilege('service_role', p.oid, 'execute') s, p.prosecdef d
         from pg_proc p where p.proname = 'admin_repair_legacy_expert_to_pro'`)).rows[0];
    ok(acl && acl.a === false && acl.b === false && acl.s === true && acl.d === true, "M3 yalnız service_role çalıştırır (SECURITY DEFINER)", acl);

    shim = await startPgrestShim(db.pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";

    const statusRoute = await import("../../app/api/admin/users/[id]/status/route");
    const detailRoute = await import("../../app/api/admin/users/[id]/route");
    const usersRoute = await import("../../app/api/admin/users/route");
    const convertRoute = await import("../../app/api/admin/trials/[id]/convert/route");
    const { mapDbUser, trialEndedNotice } = await import("../../lib/admin/userManagement");
    const { resolveMembershipAccessLevel } = await import("../../lib/auth/membershipAccessCore");

    type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    type Auth = { adminId: string; token: string };
    const asOwner: Auth = { adminId: OWNER, token: TOK.owner };
    const asAdmin2: Auth = { adminId: ADMIN2, token: TOK.admin2 };
    async function call(handler: unknown, method: string, url: string, auth: Auth, body?: unknown, id = "") {
      const headers: Record<string, string> = { "x-admin-id": auth.adminId, "x-session-token": auth.token };
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
      const res = await (handler as Handler)(req, { params: Promise.resolve({ id }) });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { _raw: text };
      }
      return { status: res.status, json };
    }
    const status = (id: string, body: unknown, auth: Auth = asOwner) =>
      call(statusRoute.POST, "POST", `/api/admin/users/${id}/status`, auth, body, id);
    const detail = async (id: string) => {
      const r = await call(detailRoute.GET, "GET", `/api/admin/users/${id}`, asOwner, undefined, id);
      return mapDbUser((r.json.user ?? {}) as Record<string, unknown>);
    };
    const row = async (id: string) => (await su.query(`select * from public.users where id = $1`, [id])).rows[0] as Record<string, unknown>;
    const clients = async (t: string) => (await su.query(`select id, full_name from public.clients where tenant_id = $1 order by id`, [t])).rows;
    const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : new Date(String(v)).toISOString());
    const listUsers = async () => {
      const r = await call(usersRoute.GET, "GET", "/api/admin/users?page=1&pageSize=50", asOwner);
      return ((r.json.users ?? []) as Record<string, unknown>[]).map((u) => mapDbUser(u));
    };

    // ── H1 / H4: liste uyarısı gerçek üyelik durumundan türer ──────────────────────
    console.log("\n[H1/H4] Liste uyarısı");
    const list0 = await listUsers();
    const byId = (id: string) => list0.find((u) => u.id === id);
    ok(!!byId(P1.id) && trialEndedNotice(byId(P1.id)!) === null, "H1 Pro üye: geçmiş pencere tarihi uyarı üretmiyor");
    ok(iso((await row(P1.id)).trial_ends_at) === iso("2026-09-12T10:00:00+03:00"), "H1 Pro üyenin kayıtlı deneme tarihi silinmedi/değişmedi");
    ok(byId(P1.id)?.membershipDisplay.packageLabel === "Premium" && byId(P1.id)?.legacyPackage === false, "H1 Pro üye listede Premium, eski kayıt değil");
    ok(!!byId(L1.id) && trialEndedNotice(byId(L1.id)!) === "legacy", "H4 eski kayıt: uyarı türü 'legacy' (süre sayısı yazılmaz)");
    ok(byId(L1.id)?.legacyPackage === true && byId(L1.id)?.membershipDisplay.packageLabel === "Paket eksik (eski kayıt)", "H2 eski kayıt listede 'Paket eksik' + legacyPackage");
    ok(byId(PR.id) ? trialEndedNotice(byId(PR.id)!) === null : false, "H1 pencere kaydı olmayan Premium: uyarı yok");
    ok(byId(LI.id) ? trialEndedNotice(byId(LI.id)!) === null : true, "H4 pasif eski kayıt: uyarı yok (pasif rozet yeterli)");
    ok(byId(PD.id) ? byId(PD.id)!.legacyPackage === false && trialEndedNotice(byId(PD.id)!) === null : false, "H4 onay bekleyen başvuru: eski kayıt sayılmaz, uyarı yok");
    ok(byId(DM.id) ? byId(DM.id)!.legacyPackage === false && trialEndedNotice(byId(DM.id)!) === null : false, "H2 demo hesap 'eski kayıt' sayılmaz (onarım butonu çıkmaz)");
    ok(resolveMembershipAccessLevel(await row(L1.id)) === "none", "H2 kök neden: eski kayıt aktif + onaylı olduğu halde erişim 'none'");

    // ── H2: kök neden — mevcut yollar eski kaydı düzeltemez ───────────────────────────
    console.log("\n[H2] Kök neden (mevcut yollar)");
    const a1 = await status(L1.id, { action: "approve", modules: ["clients"], expectedApproval: "pending" });
    ok(a1.status === 409 || a1.status === 400, "H2 mevcut 'Pro Üyeliği Onayla' eski kaydı reddeder (zaten onaylı)", a1);
    const a2 = await call(convertRoute.POST, "POST", `/api/admin/trials/${L1.id}/convert`, asOwner, { modules: ["clients"] }, L1.id);
    ok(a2.status === 404, "H2 mevcut deneme dönüşümü eski kaydı reddeder (deneme üyesi değil)", a2);
    const a3 = await status(L1.id, { action: "toggle_active", currentActive: true }, asOwner);
    ok(a3.status === 200, "H2 'Pasif Yap' çalışır", a3);
    const a4 = await status(L1.id, { action: "toggle_active", currentActive: false }, asOwner);
    ok(a4.status === 200 && resolveMembershipAccessLevel(await row(L1.id)) === "none", "H2 'Aktif Yap' çalışır ama erişim yine 'none' (sorunun kaynağı)", a4);

    // ── H2: yeni onarım yolu — reddedilmesi gereken durumlar ─────────────────────────
    console.log("\n[H2] Onarım — ret durumları");
    const snapL1 = JSON.stringify(await row(L1.id));
    const r403 = await status(L1.id, { action: "repair_legacy_pro", modules: ["clients"], expectedPackage: "trial" }, asAdmin2);
    ok(r403.status === 403, "R1 ana yönetici olmayan admin → 403", r403);
    const rStale = await status(L1.id, { action: "repair_legacy_pro", modules: ["clients"], expectedPackage: "pro" });
    ok(rStale.status === 409, "R2 bayat ekran (beklenen paket farklı) → 409", rStale);
    const rNone = await status(L1.id, { action: "repair_legacy_pro", modules: [], expectedPackage: "trial" });
    ok(rNone.status === 400, "R3 modül seçilmeden → 400", rNone);
    const rAstro = await status(L1.id, { action: "repair_legacy_pro", modules: ["astrology"], expectedPackage: "trial" });
    ok(rAstro.status === 400, "R4 Astroloji SEÇİLİP Gökyüzü Atlası tekniği seçilmezse → 400 (mevcut Pro onay politikası; Astroloji zorunlu DEĞİL)", rAstro);
    const rGr = await status(L1.id, { action: "repair_legacy_pro", modules: ["clients"], expectedPackage: "trial", astrologyGrants: ALL_TECH });
    ok(rGr.status === 400, "R5 Astroloji seçilmeden teknik izni → 400", rGr);
    const rBad = await status(L1.id, { action: "repair_legacy_pro", modules: ["clients"], expectedPackage: "premium" });
    ok(rBad.status === 400, "R6 geçersiz beklenen paket değeri → 400", rBad);
    ok(JSON.stringify(await row(L1.id)) === snapL1, "R7 reddedilen 6 istek eski kaydı DEĞİŞTİRMEDİ");
    for (const [u, label] of [
      [PR, "Premium"], [DM, "demo"], [PD, "onay bekleyen"], [LI, "pasif eski kayıt"],
    ] as [{ id: string }, string][]) {
      const before1 = JSON.stringify(await row(u.id));
      const r = await status(u.id, { action: "repair_legacy_pro", modules: ["clients"], expectedPackage: "trial" });
      const r2 = await status(u.id, { action: "repair_legacy_pro", modules: ["clients"], expectedPackage: "" });
      ok((r.status === 409 || r.status === 400) && (r2.status === 409 || r2.status === 400) && JSON.stringify(await row(u.id)) === before1,
        `R8 ${label} hesap onarıma uygun değil → 409, hesap değişmedi`, [r.status, r2.status]);
    }

    // ── H2: başarılı onarım ─────────────────────────────────────────────────────────
    console.log("\n[H2] Onarım — başarılı");
    const tok = `zz-h1h4-l1-${randomUUID()}`;
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [L1.id, tok]);
    const pre = await row(L1.id);
    const preClients = JSON.stringify(await clients(L1.tenant));
    const auditN = (await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id = $1`, [L1.id])).rows[0].n;
    const ok1 = await status(L1.id, { action: "repair_legacy_pro", modules: ["clients", "appointments", "numerology"], expectedPackage: "trial" });
    ok(ok1.status === 200 && ok1.json.ok === true && ok1.json.package_type === "premium", "S1 ana yönetici onarımı → 200 Premium", ok1);
    const post = await row(L1.id);
    ok(post.package_type === "premium" && post.plan === "premium" && post.active === true && post.approval_status === "approved", "S2 paket Premium, hesap aktif + onaylı");
    ok(post.id === pre.id && post.tenant_id === pre.tenant_id && post.email === pre.email, "S3 user_id + tenant + e-posta aynı");
    ok(JSON.stringify(await clients(L1.tenant)) === preClients, "S4 danışan kayıtları birebir korundu");
    ok(iso(post.trial_started_at) === iso(pre.trial_started_at) && iso(post.trial_ends_at) === iso(pre.trial_ends_at), "S5 eski deneme tarihçesi değişmedi");
    ok(iso(post.approved_at) === iso(pre.approved_at), "S6 ilk onay tarihi korundu");
    const perms = post.module_permissions as Record<string, unknown>;
    ok(perms.clients === true && perms.appointments === true && perms.numerology === true && perms.digital_content !== true && perms.astrology !== true,
      "S7 yalnız seçilen modüller açık", perms);
    ok(resolveMembershipAccessLevel(post) === "full", "S8 onarım sonrası sunucu erişim kararı 'full'");
    ok((await su.query(`select is_active from public.user_sessions where session_token = $1`, [tok])).rows[0].is_active === false, "S9 eski oturum kapatıldı (yeni paket bir sonraki girişte)");
    const aud = (await su.query(
      `select actor_admin_id, actor_is_main_admin, action, context from public.admin_audit_log where target_user_id = $1 order by created_at desc limit 1`, [L1.id])).rows[0];
    ok((await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id = $1`, [L1.id])).rows[0].n === auditN + 1 &&
      aud.action === "user_approved" && aud.actor_admin_id === OWNER && aud.actor_is_main_admin === true && aud.context?.source === "legacy_package_repair",
      "S10 tek audit satırı: user_approved / legacy_package_repair / ana yönetici", aud);
    const d1 = await detail(L1.id);
    ok(d1.legacyPackage === false && d1.membershipDisplay.packageLabel === "Premium" && trialEndedNotice(d1) === null, "S11 detay: artık Premium, uyarı yok");
    const again = await status(L1.id, { action: "repair_legacy_pro", modules: ["clients"], expectedPackage: "trial" });
    ok(again.status === 409, "S12 ikinci onarım → 409 (zaten Pro; tekrar audit yok)", again);

    const ok2 = await status(L2.id, { action: "repair_legacy_pro", modules: ["clients", "astrology"], expectedPackage: "trial", astrologyGrants: ALL_TECH });
    const p2 = await row(L2.id);
    ok(ok2.status === 200 && (p2.module_permissions as Record<string, unknown>).astrology === true &&
      JSON.stringify(p2.astrology_technique_grants) === JSON.stringify(ALL_TECH), "S13 Astroloji + teknik izinleri aynı işlemde yazıldı", ok2);

    // Astroloji zorunlu değil: owner yalnız Human Design veya yalnız Numeroloji verebilir.
    const onlyHd = await status(L4.id, { action: "repair_legacy_pro", modules: ["human_design"], expectedPackage: "trial" });
    const p4 = await row(L4.id);
    const p4m = p4.module_permissions as Record<string, unknown>;
    ok(onlyHd.status === 200 && p4.package_type === "premium" && p4m.human_design === true && p4m.astrology !== true && p4m.numerology !== true &&
      p4.astrology_technique_grants == null && resolveMembershipAccessLevel(p4) === "full",
      "S13a YALNIZ Human Design → 200; Astroloji/Numeroloji kapalı, teknik izni yazılmadı", { onlyHd, p4m });
    const onlyNum = await status(L5.id, { action: "repair_legacy_pro", modules: ["numerology"], expectedPackage: "trial" });
    const p5m = (await row(L5.id)).module_permissions as Record<string, unknown>;
    ok(onlyNum.status === 200 && p5m.numerology === true && p5m.human_design !== true && p5m.astrology !== true,
      "S13b YALNIZ Numeroloji → 200; diğer modüller kapalı", { onlyNum, p5m });
    const { resolveModuleAccess } = await import("../../lib/auth/moduleAccessCore");
    ok(resolveModuleAccess("expert", p4m, "human_design") === true && resolveModuleAccess("expert", p4m, "astrology") === false &&
      resolveModuleAccess("expert", p5m, "numerology") === true && resolveModuleAccess("expert", p5m, "human_design") === false,
      "S13c sunucu modül kapısı: yalnız seçilen modül açık");
    const subOnly = await status(L3.id, { action: "repair_legacy_pro", modules: ["hd_system_reading"], expectedPackage: "trial" });
    ok(subOnly.status === 400, "S13d yalnız alt yetki (HD Sistem Yorumu) tek başına yetmez → 400 (mevcut kural: en az bir ana modül)", subOnly);

    // Eşzamanlı çift istek (çift tıklama / iki sekme): tek kazanan.
    const race = await Promise.all([0, 1, 2].map(() =>
      status(L3.id, { action: "repair_legacy_pro", modules: ["clients"], expectedPackage: "trial" })));
    ok(race.filter((r) => r.status === 200).length === 1 && race.filter((r) => r.status === 409).length === 2,
      "S14 3 eşzamanlı onarım isteği → tam 1 başarı, 2×409", race.map((r) => r.status));
    ok((await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id = $1 and context->>'source' = 'legacy_package_repair'`, [L3.id])).rows[0].n === 1,
      "S15 eşzamanlı isteklerde tek audit satırı");

    // ── H3: 7 günlük deneme üyesi ───────────────────────────────────────────────────
    console.log("\n[H3] Deneme bitti → doğru Pro yolu");
    const at = await status(TR.id, { action: "approve_trial", expectedApproval: "pending" });
    ok(at.status === 200, "T1 '7 Günlük Denemeyi Onayla' (mevcut akış)", at);
    await su.query(`select public.trial_activate_on_login($1)`, [TR.id]);
    // Sentetik: pencereyi geçmişe al (süre doldu).
    await su.query(`update public.users set trial_started_at = now() - interval '200 hours', trial_ends_at = now() - interval '32 hours' where id = $1`, [TR.id]);
    let dT = await detail(TR.id);
    ok(dT.trialPhase === "expired" && trialEndedNotice(dT) === "trial7", "T2 detay/liste: faz 'expired', uyarı türü 'trial7'");
    ok(resolveMembershipAccessLevel(await row(TR.id)) === "read_only", "T3 süresi dolan deneme: aktif ama salt okunur");
    await status(TR.id, { action: "toggle_active", currentActive: true });
    const act = await status(TR.id, { action: "toggle_active", currentActive: false });
    ok(act.status === 200 && (await row(TR.id)).active === true && resolveMembershipAccessLevel(await row(TR.id)) === "read_only",
      "T4 'Pasif Yap' → 'Aktif Yap' çalışır ama deneme kısıtı SÜRER (aktiflik ≠ deneme hakkı ≠ Pro)");
    const wrong = await status(TR.id, { action: "repair_legacy_pro", modules: ["clients"], expectedPackage: "trial" });
    ok(wrong.status === 409, "T5 eski kayıt onarımı deneme üyesine uygulanamaz → 409", wrong);
    const trialClients = JSON.stringify(await clients(TR.tenant));
    const tenantBefore = (await row(TR.id)).tenant_id;
    const cv = await call(convertRoute.POST, "POST", `/api/admin/trials/${TR.id}/convert`, asOwner, { modules: ["clients", "numerology", "astrology"] }, TR.id);
    ok(cv.status === 200, "T6 detaydaki 'Pro Üyeliğe Geçir' ucu (deneme dönüşümü) → 200", cv);
    const tr2 = await row(TR.id);
    ok(tr2.package_type === "premium" && tr2.trial_status === "converted" && tr2.tenant_id === tenantBefore, "T7 Premium + converted; tenant aynı");
    ok(JSON.stringify(await clients(TR.tenant)) === trialClients, "T8 danışan kayıtları korundu");
    ok(resolveMembershipAccessLevel(tr2) === "full", "T9 Pro'ya geçen eski deneme üyesi tam erişimde");
    dT = await detail(TR.id);
    ok(dT.trialPhase === "converted" && trialEndedNotice(dT) === null && dT.membershipDisplay.packageLabel === "Premium", "T10 detay: Premium, deneme uyarısı yok");
    const cv2 = await call(convertRoute.POST, "POST", `/api/admin/trials/${TR.id}/convert`, asOwner, { modules: ["clients"] }, TR.id);
    ok(cv2.status === 409, "T11 ikinci dönüşüm → 409", cv2);

    // Deneme → Pro: yalnız Human Design (Astroloji zorunlu değil).
    ok((await status(TR2.id, { action: "approve_trial", expectedApproval: "pending" })).status === 200, "T12 ikinci deneme üyesi onaylandı");
    const cvHd = await call(convertRoute.POST, "POST", `/api/admin/trials/${TR2.id}/convert`, asOwner, { modules: ["human_design"] }, TR2.id);
    const t2 = await row(TR2.id);
    const t2m = t2.module_permissions as Record<string, unknown>;
    ok(cvHd.status === 200 && t2.package_type === "premium" && t2m.human_design === true && t2m.astrology !== true && t2m.numerology !== true,
      "T13 deneme → Pro YALNIZ Human Design → 200; Astroloji/Numeroloji kapalı", { cvHd, t2m });

    // ── Son kontrol: dokunulmayan hesaplar ────────────────────────────────────────
    console.log("\n[Z] Diğer hesaplar");
    const untouched = (await su.query(snapSql)).rows.filter((r: Record<string, unknown>) => ([P1.id, PR.id, DM.id, PD.id, LI.id] as string[]).includes(String(r.id)));
    const beforeRows = (JSON.parse(before) as Record<string, unknown>[]).filter((r) => ([P1.id, PR.id, DM.id, PD.id, LI.id] as string[]).includes(String(r.id)));
    ok(JSON.stringify(untouched) === JSON.stringify(beforeRows), "Z1 Pro / Premium / demo / bekleyen / pasif hesaplar hiç değişmedi");
  } finally {
    if (shim) await shim.close().catch(() => undefined);
    await db.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.error(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
