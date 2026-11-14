/**
 * ADMIN ÜYE YÖNETİMİ V2 · AŞAMA 4a — PASİF ≠ ARŞİV harness'ı.
 * Gerçek PostgreSQL (embedded) + gerçek migration zinciri (… → liste V2 → 4a) + gerçek RPC'ler + gerçek Next route
 * handler'ları (test-only PostgREST şimi). Production'a / ağa SIFIR temas; tüm hesaplar sentetik (ZZ_4A_*).
 *
 *   F  migration ÖNCESİ: route'lar archived_at olmadan eski davranışa düşer (deploy sırası güvenliği)
 *   M  migration: ön koşul fail-closed · 2× uygulama · mevcut satır / fonksiyon / audit değişmez · yetkiler · CHECK
 *   L  eski kayıtlar: active=false hesaplar "pasif" (kaybolmaz, arşiv sayılmaz) · salt-okunur rapor · Owner onaylı geçiş
 *   D  geçişler: aktif→pasif→aktif, aktif→arşiv, pasif→arşiv, arşiv→(çıkar)→pasif→aktif; deneme/Pro/ödeme/modül korunur
 *   C  eşzamanlılık + tekrar: çift arşiv tek audit · çift çıkarma tek başarı · arşiv ∥ aktifleştir tutarlı
 *   G  giriş/oturum kapısı (gerçek verifyUserRequest): pasif ve arşivdeki hesap yeni oturumla da giremez
 *   R  route'lar: arşivle / durum / arşivden çıkar / arşiv listesi / detay — yetki, parola, bayat istek, hata eşlemesi
 *   V  Üye Listesi V2 + klasik liste + zil: aşama/filtre/sayaç tutarlılığı, ticari sayaçlar değişmez
 *   S  arşivleme kapsamı: yalnız onaylı uzman (başvuru / reddedilen / yönetici → RPC UY002, route 409)
 *   Y  arşivdeki hesapta üyelik / deneme / modül / kredi / ödeme / lisans / rol değişikliği yok (DB UY005 + route 409); okuma serbest
 *   K  kalıcı silme yalnız arşivde (admin_purge_context tetikleyicisi UP006; eşzamanlı arşivden çıkarma; hiçbir satır silinmez)
 *   P  production salt-okunur ön kontrol sorgusu yerelde READ ONLY çalışır ve bağımsız sayımla aynı
 *
 * Çalıştır: npx tsx scripts/uye-arsiv-4a/arsiv-4a.harness.ts
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";
import { memberAccountState } from "../../lib/admin/membershipActions";
import { memberStageLabel, MEMBER_V2_MORE_FILTERS, parseMemberV2Query } from "../../lib/admin/memberListV2";
import { ADMIN_AUDIT_ACTIONS } from "../../lib/admin/adminAudit";
import { AUDIT_ACTION_LABELS } from "../../lib/admin/member360";

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
    console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 700)}`}`);
  }
}

const MIG_4A = "20280101000600_admin_member_archive_state.sql";
const OWNER = "00000000-0000-4000-8000-0000000004a1";
const ADMIN2 = "00000000-0000-4000-8000-0000000004a2";
const TOK = { owner: "zz-4a-owner-token-0001", admin2: "zz-4a-admin2-token-0001" };
const PASS = "zz-owner-pass"; // testDb verify_admin_login taslağı
const D = 86_400_000;

type U = {
  id: string; key: string; approval: string; active: boolean; demo?: boolean; pkg?: string | null; plan?: string;
  tk?: string | null; ts?: string | null; t0?: number | null; te?: number | null; pay?: string | null; npd?: string | null;
  mods?: Record<string, boolean>;
};

async function main(): Promise<void> {
  const port = 57000 + Math.floor(Math.random() * 900);
  const db = await startTestDb(port, `uye-arsiv-4a-${port}`);
  const { su, pool } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    for (const f of [
      "20271009100000_admin_purge_archived_expert.sql",
      "20271230000000_astrology_technique_grants.sql",
      "20280101000000_trial7_self_trial.sql",
      "20280101000100_trial7_claims_retention.sql",
      "20280101000200_trial7_admin_trial_approval.sql",
      "20280101000300_admin_legacy_package_repair.sql",
      "20280101000400_admin_owner_notifications.sql",
      "20280101000500_admin_list_members_v2.sql",
    ]) await su.query(readMig(f));

    const tenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ4A',$2,'active')`, [id, `zz4a-${id.slice(0, 12)}`]);
      return id;
    };
    for (const [id, sup] of [[OWNER, true], [ADMIN2, false]] as [string, boolean][]) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id, created_at)
         values ($1,$2,$3,'admin',true,'approved',$4,$5,$6, now() - interval '400 days')`,
        [id, `ZZ_4A Yönetici ${id.slice(-2)}`, `zz.4a.admin.${id.slice(-2)}@example.test`, sup, sup ? "owner" : "admin", await tenant()],
      );
    }
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($3,$4)`, [OWNER, TOK.owner, ADMIN2, TOK.admin2]);

    // ── Sentetik uzmanlar ────────────────────────────────────────────────────
    const NOW = Date.now();
    const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(ms));
    const mods = { clients: true, numerology: true, human_design: false, stones: true };
    const defs: U[] = [
      { id: "", key: "pro_paid", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "paid", npd: day(NOW + 20 * D), mods },
      { id: "", key: "pro_exempt", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "exempt", mods },
      { id: "", key: "pro_overdue", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "overdue", npd: day(NOW - 9 * D), mods },
      { id: "", key: "trial_exp", approval: "approved", active: true, pkg: "trial", tk: "self_7d", ts: "active", t0: NOW - 9 * D, te: NOW - 2 * D },
      { id: "", key: "trial_act", approval: "approved", active: true, pkg: "trial", tk: "self_7d", ts: "active", t0: NOW - 2 * D, te: NOW + 5 * D },
      { id: "", key: "trial_ns", approval: "approved", active: true, pkg: "trial", tk: "self_7d", ts: "not_started" },
      { id: "", key: "legacy", approval: "approved", active: true, pkg: null, plan: "trial" },
      { id: "", key: "pending", approval: "pending", active: false },
      { id: "", key: "rejected", approval: "rejected", active: false },
      { id: "", key: "demo", approval: "approved", active: true, demo: true, pkg: "premium", plan: "premium" },
      { id: "", key: "old_deact", approval: "approved", active: false, pkg: "premium", plan: "premium", pay: "paid", mods },
      { id: "", key: "old_arch", approval: "approved", active: false, pkg: "premium", plan: "premium", pay: "paid", mods },
      { id: "", key: "old_noaudit", approval: "approved", active: false, pkg: "premium", plan: "premium", pay: "exempt", mods },
      { id: "", key: "conc", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "paid", mods },
      { id: "", key: "race", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "paid", mods },
      { id: "", key: "route", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "paid", mods },
      { id: "", key: "frozen", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "paid", npd: day(NOW + 10 * D), mods },
      { id: "", key: "arch_trial", approval: "approved", active: true, pkg: "trial", tk: "self_7d", ts: "active", t0: NOW - D, te: NOW + 6 * D },
      { id: "", key: "other", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "paid", mods },
      { id: "", key: "purge_ok", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "paid", mods },
      { id: "", key: "purge_conc", approval: "approved", active: true, pkg: "premium", plan: "premium", pay: "paid", mods },
    ];
    const id: Record<string, string> = {};
    const tenantOf: Record<string, string> = {};
    for (const u of defs) {
      u.id = randomUUID();
      id[u.key] = u.id;
      tenantOf[u.key] = await tenant();
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, is_demo_account, package_type, plan, trial_kind,
            trial_status, trial_started_at, trial_ends_at, payment_status, next_payment_date, module_permissions, tenant_id, created_at)
         values ($1,$2,$3,'expert',$4,$5, case when $5='approved' then now() - interval '30 days' end, $6,$7,$8,$9,$10,$11,$12,$13,$14::date,$15,$16, now() - interval '40 days')`,
        [u.id, `ZZ_4A Uzman ${u.key}`, `zz.4a.${u.key}@example.test`, u.active, u.approval, u.demo === true, u.pkg ?? null, u.plan ?? "trial",
          u.tk ?? null, u.ts ?? null, u.t0 ? new Date(u.t0) : null, u.te ? new Date(u.te) : null, u.pay ?? null, u.npd ?? null,
          JSON.stringify(u.mods ?? {}), tenantOf[u.key]],
      );
      // Korunacak iş verisi: danışanlar + ödeme geçmişi (+ etkin uzmanda oturum)
      await su.query(`insert into public.clients(tenant_id, full_name) values ($1,'ZZ Danışan A'),($1,'ZZ Danışan B')`, [tenantOf[u.key]]);
      await su.query(`insert into public.user_payment_history(user_id, payment_status, paid_amount, payment_note) values ($1,'paid',1500,'zz')`, [u.id]);
      if (u.active) await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [u.id, `zz-4a-${u.key}-s1`]);
    }
    // Eski sistem geçmişi: biri "Pasif Yap", biri "Pasife Al ve Arşivle" ile kapatılmış; biri kayıtsız.
    await su.query(`insert into public.admin_audit_log(actor_admin_id, actor_is_main_admin, target_user_id, action, old_value, new_value, created_at)
      values ($1,true,$2,'user_deactivated','{"active":true}','{"active":false}', now() - interval '20 days'),
             ($1,true,$3,'user_deactivated','{"active":true}','{"active":false}', now() - interval '30 days'),
             ($1,true,$3,'user_archived','{"active":false}','{"active":false}', now() - interval '10 days')`,
      [OWNER, id.old_deact, id.old_arch]);
    await su.query(`insert into public.pro_upgrade_requests(user_id, note) values ($1,'zz')`, [id.trial_exp]);

    // Korunacak kayıtların parmak izi (iş verisi + üyelik/deneme/ödeme/modül alanları — yalnız active/archived_at hariç)
    const recordsFp = async () => (await su.query(`select
        (select md5(string_agg(c::text, ',' order by c.id)) from public.clients c) cl,
        (select md5(string_agg(h::text, ',' order by h.id)) from public.user_payment_history h) ph,
        (select md5(string_agg(q::text, ',' order by q.id)) from public.pro_upgrade_requests q) pr,
        (select md5(coalesce(string_agg(t::text, ',' order by t.claim_hash), '')) from public.trial_claims t) tc,
        (select md5(string_agg((to_jsonb(u) - 'active' - 'archived_at')::text, ',' order by u.id)) from public.users u) us`)).rows[0];
    const auditRows = async (uid: string) =>
      (await su.query(`select action, old_value, new_value, context from public.admin_audit_log where target_user_id=$1 order by created_at, id`, [uid])).rows as
        { action: string; old_value: Record<string, unknown>; new_value: Record<string, unknown>; context: Record<string, unknown> }[];
    const userRow = async (uid: string) => (await su.query(`select * from public.users where id=$1`, [uid])).rows[0] as Record<string, unknown>;
    const activeSessions = async (uid: string) =>
      (await su.query(`select count(*)::int n from public.user_sessions where user_id=$1 and is_active`, [uid])).rows[0].n as number;
    const asSvc = async (sql: string, args: unknown[]) => {
      const c = await pool.connect();
      try {
        await c.query("set role service_role");
        return (await c.query(sql, args)).rows[0];
      } finally {
        await c.query("reset role").catch(() => undefined);
        c.release();
      }
    };
    const code = async (sql: string, args: unknown[]) => {
      try { await asSvc(sql, args); return "OK"; } catch (e) { return (e as { code?: string }).code ?? "ERR"; }
    };
    const list = async (f = "all", actor = OWNER) =>
      (await su.query(`select public.admin_list_members_v2($1,$2,'', 'expert', null, 'all', 'attn', 100, 0) r`, [actor, f])).rows[0].r as
        { total: number; rows: { id: string; stage: string }[]; presets: Record<string, number>; counts: Record<string, number>; decisions: Record<string, number> };
    const stageOf = async (uid: string) => (await list("all")).rows.find((r) => r.id === uid)?.stage
      ?? (await list("arsiv")).rows.find((r) => r.id === uid)?.stage ?? null;

    // ── ROUTE altyapısı (şim migration ÖNCESİ başlar → geri düşüş de sınanır) ───────────
    shim = await startPgrestShim(pool);
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    const detailRoute = await import("../../app/api/admin/users/[id]/route");
    const archiveListRoute = await import("../../app/api/admin/users/archive/route");
    const deleteRoute = await import("../../app/api/admin/users/[id]/delete/route");
    const statusRoute = await import("../../app/api/admin/users/[id]/status/route");
    const unarchiveRoute = await import("../../app/api/admin/users/[id]/unarchive/route");
    const membersRoute = await import("../../app/api/admin/members/route");
    const paymentRoute = await import("../../app/api/admin/users/[id]/payment/route");
    const pricingRoute = await import("../../app/api/admin/users/[id]/pricing-phases/route");
    const astroRoute = await import("../../app/api/admin/users/[id]/astrology-techniques/route");
    const trialRoute = await import("../../app/api/admin/trials/[id]/route");
    const convertRoute = await import("../../app/api/admin/trials/[id]/convert/route");
    const { verifyUserRequest } = await import("../../lib/auth/userGuard");
    type H = (r: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
    const call = async (h: unknown, url: string, auth: { adminId?: string; token?: string }, body?: unknown, paramId?: string) => {
      const headers: Record<string, string> = {};
      if (auth.adminId) headers["x-admin-id"] = auth.adminId;
      if (auth.token) headers["x-session-token"] = auth.token;
      if (body !== undefined) headers["content-type"] = "application/json";
      const req = new NextRequest(`http://localhost${url}`, {
        method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      const res = await (h as H)(req, { params: Promise.resolve({ id: paramId ?? "" }) });
      let json: Record<string, unknown> = {};
      try { json = await res.json(); } catch { /* boş */ }
      return { status: res.status, json };
    };
    const asOwner = { adminId: OWNER, token: TOK.owner };
    const asAdmin2 = { adminId: ADMIN2, token: TOK.admin2 };
    const userGate = async (uid: string, token: string) => {
      const r = await verifyUserRequest(new NextRequest("http://localhost/api/x", { headers: { "x-user-id": uid, "x-session-token": token } }));
      return r.ok ? 200 : r.response.status;
    };

    console.log("[F] Migration ÖNCESİ geri düşüş (yeni kod + eski şema)");
    const f1 = await call(detailRoute.GET, `/api/admin/users/${id.old_arch}`, asOwner, undefined, id.old_arch);
    ok(f1.status === 200 && (f1.json.archive as { supported: boolean }).supported === false && (f1.json.archive as { archivedAt: unknown }).archivedAt === null,
      "F1 detay: archived_at kolonu yokken 200 + archive.supported=false (ekran eski davranışla açılır)", f1.json.archive);
    const f2 = await call(archiveListRoute.GET, "/api/admin/users/archive", asOwner);
    ok(f2.status === 200 && f2.json.archiveModel === false && (f2.json.users as unknown[]).length === 3,
      "F2 arşiv listesi: kolon yokken eski sorguya düşer (3 eski pasif hesap, archiveModel=false)", { s: f2.status, m: f2.json.archiveModel });
    const f3 = await call(unarchiveRoute.POST, `/api/admin/users/${id.old_arch}/unarchive`, asOwner, { adminPassword: PASS }, id.old_arch);
    ok(f3.status === 503, "F3 arşivden çıkar: fonksiyon yokken 503, hiçbir şey yazılmaz", f3);
    // Yayın sırası "önce kod, sonra migration": yeni kod eski şemada çalışmaya devam eder (çökme yok, davranış bugünkü gibi).
    const f4 = await call(membersRoute.GET, "/api/admin/members", asOwner);
    ok(f4.status === 200 && Array.isArray(f4.json.rows) && (f4.json.rows as { stage: string }[]).every((x) => x.stage !== "pasif"),
      "F4 yeni kod + eski şema: Üye Listesi V2 200 (eski aşamalar; yeni istemci hepsini tanır)");
    const f5 = await call(membersRoute.GET, "/api/admin/members?f=pasif", asOwner);
    ok(f5.status >= 400 && f5.status < 600 && f5.json.rows === undefined, `F5 yeni kod + eski şema: yalnız yeni “Pasif hesaplar” filtresi kontrollü hata (${f5.status}); sayfa çökmez, sayaç dönmez`);
    const f6 = await (async () => {
      const req = new NextRequest(`http://localhost/api/admin/users/${id.pro_overdue}`, { method: "PATCH", headers: { "x-admin-id": OWNER, "x-session-token": TOK.owner, "content-type": "application/json" }, body: JSON.stringify({ action: "modules", changes: { stones: false } }) });
      const res = await (detailRoute.PATCH as unknown as H)(req, { params: Promise.resolve({ id: id.pro_overdue }) });
      return res.status;
    })();
    const f6row = await userRow(id.pro_overdue);
    ok(f6 === 200 && (f6row.module_permissions as Record<string, boolean>).stones === false, "F6 yeni kod + eski şema: arşiv koruması kolon yokken atlanır, modül değişikliği bugünkü gibi çalışır");
    await su.query(`update public.users set module_permissions = module_permissions || '{"stones":true}'::jsonb where id=$1`, [id.pro_overdue]);

    console.log("\n[P] Production salt-okunur sorgusu (yerel, READ ONLY)");
    await su.query(`create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations(version text primary key, name text, created_by text);
      insert into supabase_migrations.schema_migrations(version, name) values ('20280101000500', 'admin_list_members_v2') on conflict do nothing`);
    const prodSql = readFileSync(path.join(process.cwd(), "scripts/uye-arsiv-4a/prod-readonly-check.sql"), "utf8");
    ok(!/\b(insert|update|delete|create|alter|drop|truncate|grant|revoke|copy|vacuum|lock|call)\b/i.test(prodSql.replace(/--.*$/gm, "")),
      "P0 sorguda yazma/DDL anahtar kelimesi yok");
    const pRes = (await su.query(`begin transaction read only; ${prodSql}; rollback;`)) as unknown as { rows: Record<string, unknown>[] }[];
    const pRow = (k: string) => pRes.flatMap((r) => r.rows ?? []).filter((r) => r.kontrol === k);
    const a1 = pRow("A1 4a_nesneleri")[0]; const a2 = pRow("A2 on_kosullar")[0]; const a3 = pRow("A3 audit_check")[0]; const a6 = pRow("A6 pasif_siniflandirma")[0];
    ok(a1 && a1.archived_at_kolonu === false && a1.unarchive_fn === false && Number(a1.ledger_000600) === 0, "P1 migration öncesi: 4a nesneleri yok, ledger'da 000600 yok", a1);
    ok(a2 && a2.purge_context === true && a2.purge_in_progress === true && a2.trial_profiles === true && a2.pricing_phases === true && a2.payment_history === true,
      "P2 ön koşullar mevcut", a2);
    ok(a3 && Number(a3.canli_eylem) === 32 && Number(a3.beklenen_eylem) === 32 && a3.yalniz_canlida === null && a3.yalniz_depoda === null, "P3 audit CHECK 32 = 32, fark yok", a3);
    ok(pRow("A4 parmak_izi").length === 6, "P4 6 fonksiyonun parmak izi üretildi");
    ok(a6 && Number(a6.toplam_pasif_uzman) === 3 && Number(a6.son_islem_arsivleme) === 1 && Number(a6.son_islem_pasiflestirme) === 1 && Number(a6.belirsiz) === 1
       && Number(a6.demo) === 0 && Object.keys(a6).every((k) => !/mail|name|ad$|id$/.test(k)),
      "P5 toplu sınıflandırma = bağımsız beklenti (3 pasif: 1 arşivleme · 1 pasifleştirme · 1 belirsiz); kişisel alan yok", a6);

    console.log("\n[M] Migration");
    const listBefore = await list("all");
    const fnFp = `select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,''), ',' order by p.oid::regprocedure::text)) h
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
       and p.proname not in ('admin_archive_user','admin_set_user_active','admin_unarchive_user','admin_list_members_v2',
                             'admin_purge_require_archived_trg','admin_archived_user_guard_trg','admin_archived_child_guard_trg')`;
    const before = { fn: (await su.query(fnFp)).rows[0].h, rec: await recordsFp(),
      act: (await su.query(`select md5(string_agg(id::text||active::text, ',' order by id)) h from public.users`)).rows[0].h,
      audit: (await su.query(`select count(*)::int n, md5(string_agg(a::text, ',' order by a.id)) h from public.admin_audit_log a`)).rows[0],
      chk: (await su.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname='admin_audit_action_chk'`)).rows[0].d as string };

    // M0 ön koşul: canlı audit CHECK beklenenden farklıysa migration HİÇBİR şey uygulamaz.
    await su.query(`alter table public.admin_audit_log drop constraint admin_audit_action_chk;
      alter table public.admin_audit_log add constraint admin_audit_action_chk ${before.chk.replace("'pricing_phase_changed'::text", "'pricing_phase_changed'::text, 'zz_prod_only'::text")}`);
    let m0err = "";
    try { await su.query(readMig(MIG_4A)); } catch (e) { m0err = (e as Error).message; }
    await su.query("rollback").catch(() => undefined);
    const colAfterFail = (await su.query(`select count(*)::int n from information_schema.columns where table_name='users' and column_name='archived_at'`)).rows[0].n;
    ok(/on kosul/.test(m0err) && colAfterFail === 0, "M0 audit CHECK sürüklenmişse migration fail-closed (kolon eklenmedi, hiçbir şey değişmedi)", m0err);
    await su.query(`alter table public.admin_audit_log drop constraint admin_audit_action_chk;
      alter table public.admin_audit_log add constraint admin_audit_action_chk ${before.chk}`);

    await su.query(readMig(MIG_4A));
    await su.query(readMig(MIG_4A));
    ok((await su.query(fnFp)).rows[0].h === before.fn, "M1 migration 2× uygulandı; değiştirilen 4 fonksiyon dışında hiçbir fonksiyon (gövde/yetki) değişmedi");
    const recAfter = await recordsFp();
    ok(JSON.stringify(recAfter) === JSON.stringify(before.rec), "M2 danışan, ödeme geçmişi, Pro talebi, deneme hakkı ve tüm üyelik/modül alanları birebir aynı");
    ok((await su.query(`select md5(string_agg(id::text||active::text, ',' order by id)) h from public.users`)).rows[0].h === before.act
       && (await su.query(`select count(*)::int n from public.users where archived_at is not null`)).rows[0].n === 0,
      "M3 hiçbir hesabın erişimi (active) değişmedi; backfill YOK (archived_at hepsinde NULL)");
    const aud = (await su.query(`select count(*)::int n, md5(string_agg(a::text, ',' order by a.id)) h from public.admin_audit_log a`)).rows[0];
    ok(aud.n === before.audit.n && aud.h === before.audit.h, "M4 yönetim geçmişi değişmedi (migration audit yazmaz/silmez)");
    const acl = (await su.query(`select p.proname, has_function_privilege('anon', p.oid,'EXECUTE') a, has_function_privilege('authenticated', p.oid,'EXECUTE') au,
        has_function_privilege('service_role', p.oid,'EXECUTE') s, p.prosecdef d, array_to_string(p.proconfig, ',') cfg
      from pg_proc p where p.proname in ('admin_archive_user','admin_set_user_active','admin_unarchive_user','admin_list_members_v2')`)).rows as Record<string, unknown>[];
    ok(acl.length === 4 && acl.every((r) => r.a === false && r.au === false && r.s === true && r.d === true && String(r.cfg).includes("search_path")),
      "M5 4 fonksiyon: SECURITY DEFINER + sabit search_path; anon/authenticated çalıştıramaz, yalnız service_role", acl);
    const chk = (await su.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname='admin_audit_action_chk'`)).rows[0].d as string;
    const liveActions = Array.from(chk.matchAll(/'([a-z_]+)'::text/g)).map((m) => m[1]).sort();
    ok(JSON.stringify(liveActions) === JSON.stringify([...ADMIN_AUDIT_ACTIONS].sort()), "M6 audit CHECK = TS eylem listesi (user_unarchived dahil 33)", liveActions.length);
    ok(Boolean(AUDIT_ACTION_LABELS.user_unarchived), "M7 yönetim geçmişinde “Arşivden çıkarıldı” etiketi var");

    console.log("\n[L] Eski kayıtlar (otomatik arşivleme YOK)");
    const lAll = await list("all");
    const lArs = await list("arsiv");
    for (const k of ["old_deact", "old_arch", "old_noaudit"]) {
      ok(lAll.rows.find((r) => r.id === id[k])?.stage === "pasif" && !lArs.rows.some((r) => r.id === id[k]),
        `L1 eski active=false hesap (${k}) “Pasif” — Tüm üyeler'de görünür, arşiv sayılmaz`);
    }
    ok(lAll.presets.pasif === 3 && lAll.presets.arsiv === 0 && listBefore.presets.arsiv === 3,
      "L2 önce arşiv=3 (pasif dahil) → sonra pasif=3, arşiv=0 (hiçbir eski hesap listeden kaybolmadı)", { before: listBefore.presets.arsiv, after: lAll.presets });
    ok(lAll.presets.all === listBefore.presets.all + 3, "L3 Tüm üyeler sayısı = önceki + 3 eski pasif hesap");
    ok(JSON.stringify(lAll.counts) === JSON.stringify(listBefore.counts) && JSON.stringify(lAll.decisions) === JSON.stringify(listBefore.decisions),
      "L4 ticari sayaçlar (Pro/deneme/ödeme/bugün) ve karar sayıları DEĞİŞMEDİ");
    const roSql = readFileSync(path.join(process.cwd(), "scripts/uye-arsiv-4a/legacy-archive-readonly.sql"), "utf8");
    const roRes = await su.query(roSql) as unknown as { rows: Record<string, unknown>[] }[];
    const roRows = roRes.find((r) => Array.isArray(r.rows) && r.rows.length && "son_olay" in r.rows[0])?.rows ?? [];
    const byEvt = Object.fromEntries(roRows.map((r) => [String(r.son_olay), Number(r.hesap_sayisi)]));
    ok(byEvt.user_archived === 1 && byEvt.user_deactivated === 1 && byEvt["(yok)"] === 1 && roRows.every((r) => !("email" in r) && !("full_name" in r)),
      "L5 salt-okunur rapor: son olay user_archived 1 · user_deactivated 1 · kayıtsız 1 (yalnız toplu sayı, kişisel veri yok)", roRows);
    const bfSql = readFileSync(path.join(process.cwd(), "scripts/uye-arsiv-4a/legacy-archive-backfill.sql"), "utf8").split(":'actor'").join(`'${OWNER}'`);
    const recPre = await recordsFp();
    const dry = await su.query(bfSql) as unknown as { rows: Record<string, unknown>[] }[];
    const aday = dry.find((r) => r.rows?.[0] && "aktarilacak" in r.rows[0])?.rows[0].aktarilacak;
    ok(aday === 1 && (await su.query(`select count(*)::int n from public.users where archived_at is not null`)).rows[0].n === 0
       && JSON.stringify(await recordsFp()) === JSON.stringify(recPre), "L6 geçiş betiği varsayılan KURU: aday 1, ROLLBACK → hiçbir şey yazılmadı");
    const bad = await su.query(bfSql.split(`'${OWNER}'`).join(`'${ADMIN2}'`)).then(() => "OK", (e: Error) => e.message);
    await su.query("rollback").catch(() => undefined);
    ok(/ana yonetici degil/.test(bad), "L7 geçiş betiği ana yönetici olmayan aktörle çalışmaz", bad);
    const archEvtAt = (await su.query(`select created_at from public.admin_audit_log where target_user_id=$1 and action='user_archived'`, [id.old_arch])).rows[0].created_at as Date;
    await su.query(bfSql.replace(/ROLLBACK; -- Owner onayıyla COMMIT yapılır\.\s*$/, "COMMIT;"));
    const oa = await userRow(id.old_arch);
    ok(oa.archived_at instanceof Date && (oa.archived_at as Date).getTime() === archEvtAt.getTime() && oa.active === false
       && (await userRow(id.old_deact)).archived_at === null && (await userRow(id.old_noaudit)).archived_at === null,
      "L8 Owner onaylı uygulamada yalnız açıkça arşivlenmiş eski hesap arşive geçer; tarih = kendi arşiv olayı; diğerleri pasif kalır");
    const oaAud = await auditRows(id.old_arch);
    ok(oaAud.length === 3 && oaAud[2].action === "user_archived" && oaAud[2].context.backfill === true
       && oaAud[0].action === "user_deactivated" && oaAud[1].action === "user_archived",
      "L9 geçiş audit'i eklendi (backfill=true); eski pasifleştirme/arşiv olayları korunur");
    ok(JSON.stringify(await recordsFp()) === JSON.stringify(recPre), "L10 geçiş yalnız archived_at yazdı; diğer tüm alanlar ve iş verisi aynı");

    console.log("\n[D] Durum geçişleri (gerçek RPC, service_role)");
    const rec0 = await recordsFp();
    // D1 Aktif → Pasif
    const p = id.trial_exp;
    const d1 = await asSvc(`select public.admin_set_user_active($1,$2,false,true) r`, [p, ADMIN2]);
    const u1 = await userRow(p);
    ok(d1.r.revoked_session_count === 1 && u1.active === false && u1.archived_at === null && (await activeSessions(p)) === 0,
      "D1 Aktif→Pasif: giriş kapandı, oturum sonlandırıldı, arşivlenmedi");
    ok((await stageOf(p)) === "pasif" && (await list("all")).rows.some((r) => r.id === p) && !(await list("arsiv")).rows.some((r) => r.id === p),
      "D2 Pasif hesap normal yönetimden kaybolmaz; “Arşiv”de görünmez");
    // D3 Pasif → Aktif (normal admin de yapabilir; deneme hakkı sıfırlanmaz)
    const d3 = await asSvc(`select public.admin_set_user_active($1,$2,true,false) r`, [p, ADMIN2]);
    const u3 = await userRow(p);
    ok(d3.r.active === true && (u3.trial_ends_at as Date).getTime() === (u1.trial_ends_at as Date).getTime() && u3.trial_status === "active"
       && (await stageOf(p)) === "deneme_bitti"
       && (await su.query(`select public.trial_phase_of(trial_kind, trial_status, package_type, trial_ends_at) ph from public.users where id=$1`, [p])).rows[0].ph === "expired",
      "D3 Pasif→Aktif: denemesi bitmiş hesap yine “deneme bitti” (süre uzamadı/sıfırlanmadı, yeni işlem hakkı açılmadı)");
    // D4 Aktif → Arşiv
    const a = id.pro_paid;
    const d4 = await code(`select public.admin_archive_user($1,$2)`, [a, OWNER]);
    const u4 = await userRow(a);
    ok(d4 === "OK" && u4.active === false && u4.archived_at instanceof Date && (await activeSessions(a)) === 0,
      "D4 Aktif→Arşiv: erişim kapandı, archived_at yazıldı, oturumlar sonlandırıldı");
    ok((await stageOf(a)) === "arsiv" && !(await list("all")).rows.some((r) => r.id === a) && (await list("arsiv")).rows.some((r) => r.id === a),
      "D5 arşivlenen hesap Tüm üyeler'de yok, Arşiv'de var");
    const a4 = await auditRows(a);
    ok(a4.length === 1 && a4[0].action === "user_archived" && a4[0].new_value.archived === true && a4[0].old_value.active === true,
      "D6 tek user_archived audit (önce aktif / sonra arşivde)");
    // D7 tekrar arşiv → değişiklik yok, yeni audit yok
    const d7 = await asSvc(`select public.admin_archive_user($1,$2) r`, [a, OWNER]);
    ok(d7.r.already_archived === true && (await auditRows(a)).length === 1
       && ((await userRow(a)).archived_at as Date).getTime() === (u4.archived_at as Date).getTime(),
      "D7 tekrarlanan arşiv isteği: durum ve tarih aynı, ikinci audit YOK");
    // D8 Arşivdeki hesap aktifleştirilemez (DB kuralı)
    ok(await code(`select public.admin_set_user_active($1,$2,true,false)`, [a, OWNER]) === "UY004" && (await userRow(a)).active === false
       && (await auditRows(a)).length === 1, "D8 arşivdeki hesap “Aktif Yap” ile açılamaz (UY004); durum/audit değişmez");
    let chkCode = "";
    try { await su.query(`update public.users set active = true where id=$1`, [a]); } catch (e) { chkCode = (e as { code?: string }).code ?? ""; }
    ok(chkCode === "23514" || chkCode === "UY005", `D9 doğrudan veri yazımı da arşivdeki hesabı aktif yapamaz (${chkCode})`);
    ok(await code(`select public.admin_approve_expert_with_modules($1,$2,$3,$4,$5,$6)`,
      [a, JSON.stringify({ package_type: "premium" }), OWNER, JSON.stringify({ clients: true }), [], "pending"]) !== "OK" && (await userRow(a)).active === false,
      "D10 onay akışı arşivdeki (onaylı) hesabı açamaz");
    // D11 Arşivden çıkar: yalnız ana yönetici
    ok(await code(`select public.admin_unarchive_user($1,$2)`, [a, ADMIN2]) === "42501" && (await userRow(a)).archived_at !== null,
      "D11 normal yönetici arşivden çıkaramaz (42501)");
    ok(await code(`select public.admin_unarchive_user($1,$2)`, [OWNER, OWNER]) === "UY003", "D12 ana yönetici kendi hesabında işlem yapamaz");
    const d13 = await asSvc(`select public.admin_unarchive_user($1,$2) r`, [a, OWNER]);
    const u13 = await userRow(a);
    ok(d13.r.archived === false && u13.archived_at === null && u13.active === false && (await stageOf(a)) === "pasif",
      "D13 arşivden çıkan hesap PASİF (giriş hâlâ kapalı); Tüm üyeler'e döner");
    const a13 = await auditRows(a);
    ok(a13.length === 2 && a13[1].action === "user_unarchived" && a13[1].new_value.archived === false && a13[1].new_value.active === false,
      "D14 user_unarchived audit (aynı tx)");
    ok(await code(`select public.admin_unarchive_user($1,$2)`, [a, OWNER]) === "UY002", "D15 arşivde olmayan hesabı çıkarma → UY002 (409)");
    const d16 = await asSvc(`select public.admin_set_user_active($1,$2,true,false) r`, [a, OWNER]);
    ok(d16.r.active === true && (await activeSessions(a)) === 0 && (await stageOf(a)) === "pro",
      "D16 sonra Aktif Yap: Pro üyelik aynen döner; eski oturumlar CANLANMAZ");
    const ua = await userRow(a);
    ok(ua.package_type === "premium" && ua.payment_status === "paid" && JSON.stringify(ua.module_permissions) === JSON.stringify(u4.module_permissions),
      "D17 paket, ödeme durumu ve modül izinleri tüm döngü boyunca korundu");
    // D18 Pasif → Arşiv (pasiflik olayı korunur)
    const q = id.pro_exempt;
    await asSvc(`select public.admin_set_user_active($1,$2,false,true) r`, [q, OWNER]);
    await asSvc(`select public.admin_archive_user($1,$2) r`, [q, OWNER]);
    const qa = await auditRows(q);
    ok((await userRow(q)).archived_at !== null && qa.map((r) => r.action).join(",") === "user_deactivated,user_archived" && qa[1].old_value.active === false,
      "D18 Pasif→Arşiv: arşive geçti; önceki pasifleştirme olayı yönetim geçmişinde duruyor");
    // D19 Deneme hesabı arşiv döngüsü: deneme alanları ve hak kaydı değişmez
    const t = id.trial_act;
    const tBefore = await userRow(t);
    await asSvc(`select public.admin_archive_user($1,$2) r`, [t, OWNER]);
    await asSvc(`select public.admin_unarchive_user($1,$2) r`, [t, OWNER]);
    await asSvc(`select public.admin_set_user_active($1,$2,true,false) r`, [t, OWNER]);
    const tAfter = await userRow(t);
    ok(["trial_kind", "trial_status", "package_type", "plan"].every((k) => tAfter[k] === tBefore[k])
       && (tAfter.trial_ends_at as Date).getTime() === (tBefore.trial_ends_at as Date).getTime() && (await stageOf(t)) === "deneme",
      "D19 deneme hesabı arşiv→çıkar→aktif: deneme türü/durumu/bitişi aynı (uzamadı, sıfırlanmadı)");
    // D20 Eski kayıt + onay bekleyen / reddedilen akışlar bozulmadı
    ok(await code(`select public.admin_set_user_active($1,$2,true,false)`, [id.pending, OWNER]) === "UY002",
      "D20 onaysız uzmanı aktifleştirme hâlâ UY002 (mevcut kural korunur)");
    ok(JSON.stringify((await recordsFp()).cl) === JSON.stringify(rec0.cl) && (await recordsFp()).ph === rec0.ph && (await recordsFp()).pr === rec0.pr,
      "D21 tüm geçişlerden sonra danışan, ödeme geçmişi ve Pro talebi kayıtları birebir aynı (hiçbir şey silinmedi)");

    console.log("\n[C] Eşzamanlılık + tekrar");
    const c = id.conc;
    const conc = await Promise.allSettled([1, 2, 3].map(() => asSvc(`select public.admin_archive_user($1,$2) r`, [c, OWNER])));
    const cAud = (await auditRows(c)).filter((r) => r.action === "user_archived");
    ok(conc.every((r) => r.status === "fulfilled") && cAud.length === 1 && (await userRow(c)).archived_at !== null,
      "C1 3 eşzamanlı arşiv isteği → tek arşiv, TEK audit");
    const un = await Promise.allSettled([1, 2].map(() => asSvc(`select public.admin_unarchive_user($1,$2) r`, [c, OWNER])));
    const unOk = un.filter((r) => r.status === "fulfilled").length;
    const unCodes = un.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason as { code?: string }).code);
    ok(unOk === 1 && unCodes.join() === "UY002" && (await auditRows(c)).filter((r) => r.action === "user_unarchived").length === 1,
      "C2 2 eşzamanlı arşivden çıkarma → 1 başarı + 1 UY002, tek audit", { unOk, unCodes });
    const r = id.race;
    await asSvc(`select public.admin_set_user_active($1,$2,false,true) r`, [r, OWNER]);
    const race = await Promise.allSettled([
      asSvc(`select public.admin_archive_user($1,$2) r`, [r, OWNER]),
      asSvc(`select public.admin_set_user_active($1,$2,true,false) r`, [r, ADMIN2]),
    ]);
    const ru = await userRow(r);
    ok(!(ru.active === true && ru.archived_at !== null) && race.some((x) => x.status === "fulfilled"),
      "C3 arşiv ∥ aktifleştir yarışı: sonuç ya ‘aktif’ ya ‘arşivde’ — asla ‘aktif ve arşivde’", { active: ru.active, archived: ru.archived_at !== null });
    ok((await su.query(`select count(*)::int n from public.users where archived_at is not null and active`)).rows[0].n === 0,
      "C4 tüm veritabanında aktif+arşiv çelişkisi 0");

    console.log("\n[G] Giriş / oturum kapısı (gerçek verifyUserRequest)");
    const g = id.conc; // şu an pasif (arşivden çıkmış)
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,'zz-4a-g-pasif')`, [g]);
    ok((await userGate(g, "zz-4a-g-pasif")) !== 200, "G1 pasif hesap geçerli görünen yeni oturumla da giremez");
    await asSvc(`select public.admin_archive_user($1,$2) r`, [g, OWNER]);
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,'zz-4a-g-arsiv')`, [g]);
    ok((await userGate(g, "zz-4a-g-arsiv")) !== 200, "G2 arşivdeki hesap yeni oturumla da giremez");
    ok((await userGate(g, "zz-4a-conc-s1")) !== 200, "G3 arşiv öncesi eski oturum token'ı kullanılamaz");
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,'zz-4a-g-ok')`, [id.pro_overdue]);
    ok((await userGate(id.pro_overdue, "zz-4a-g-ok")) === 200, "G4 kontrol: aktif hesap aynı kapıdan geçer (sahte negatif yok)");

    console.log("\n[R] Route'lar (gerçek handler)");
    const rt = id.route;
    const del = (auth: typeof asOwner, body: unknown, uid = rt) => call(deleteRoute.POST, `/api/admin/users/${uid}/delete`, auth, body, uid);
    ok((await del(asAdmin2, { adminPassword: PASS })).status === 403 && (await userRow(rt)).archived_at === null, "R1 normal yönetici arşivleyemez (403)");
    ok((await del(asOwner, { adminPassword: "yanlis" })).status === 403 && (await userRow(rt)).active === true, "R2 yanlış parola → 403, değişiklik yok");
    ok((await del(asOwner, {})).status === 400, "R3 parola yok → 400");
    ok((await call(deleteRoute.POST, "/api/admin/users/x/delete", asOwner, { adminPassword: PASS }, "not-a-uuid")).status === 400, "R4 geçersiz ID → 400");
    const r5 = await del(asOwner, { adminPassword: PASS });
    ok(r5.status === 200 && r5.json.alreadyArchived === false && typeof r5.json.archivedAt === "string" && (await userRow(rt)).archived_at !== null,
      "R5 ana yönetici + parola → arşivlendi (archivedAt döner)");
    const r6 = await del(asOwner, { adminPassword: PASS });
    ok(r6.status === 200 && r6.json.alreadyArchived === true && (await auditRows(rt)).filter((x) => x.action === "user_archived").length === 1,
      "R6 tekrar gönderim → 200 alreadyArchived, ikinci audit yok");
    const st = await call(statusRoute.POST, `/api/admin/users/${rt}/status`, asOwner, { action: "toggle_active", currentActive: false }, rt);
    ok(st.status === 409 && /arşivde/i.test(String(st.json.error)) && (await userRow(rt)).active === false, "R7 durum route'u: arşivdeki hesabı Aktif Yap → 409 açıklamalı");
    const una = (auth: { adminId?: string; token?: string }, body: unknown, uid = rt) => call(unarchiveRoute.POST, `/api/admin/users/${uid}/unarchive`, auth, body, uid);
    ok((await una({}, { adminPassword: PASS })).status === 401, "R8 kimliksiz arşivden çıkarma → 401");
    ok((await una(asAdmin2, { adminPassword: PASS })).status === 403 && (await userRow(rt)).archived_at !== null, "R9 normal yönetici → 403 (hedef bilgisi sızmaz)");
    const expTok = "zz-4a-expert-tok";
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id.pro_overdue, expTok]);
    const r10 = await una({ adminId: id.pro_overdue, token: expTok }, { adminPassword: PASS });
    ok(r10.status === 401 || r10.status === 403, `R10 uzman hesabı yönetici taklidi yapamaz (${r10.status})`);
    ok((await una(asOwner, { adminPassword: "yanlis" })).status === 403, "R11 yanlış parola → 403");
    ok((await una(asOwner, {})).status === 400, "R12 parola yok → 400");
    ok((await una(asOwner, { adminPassword: PASS }, OWNER)).status === 400, "R13 kendi hesabı → 400");
    ok((await una(asOwner, { adminPassword: PASS }, randomUUID())).status === 404, "R14 olmayan kullanıcı → 404");
    const r15 = await una(asOwner, { adminPassword: PASS });
    ok(r15.status === 200 && r15.json.active === false && (await userRow(rt)).archived_at === null && (await userRow(rt)).active === false,
      "R15 ana yönetici + parola → arşivden çıktı, hesap pasif");
    ok((await una(asOwner, { adminPassword: PASS })).status === 409, "R16 tekrar → 409 (arşivde değil)");
    const r17 = await call(statusRoute.POST, `/api/admin/users/${rt}/status`, asAdmin2, { action: "toggle_active", currentActive: false }, rt);
    ok(r17.status === 200 && (await userRow(rt)).active === true, "R17 sonra normal yönetici “Aktif Yap” → 200 (pasif hesap kuralı aynen)");
    await del(asOwner, { adminPassword: PASS });
    const r18 = await call(detailRoute.GET, `/api/admin/users/${rt}`, asOwner, undefined, rt);
    const r18a = r18.json.archive as { supported: boolean; archivedAt: string | null };
    ok(r18.status === 200 && r18a.supported === true && typeof r18a.archivedAt === "string" && (r18.json.user as Record<string, unknown>).archived_at === undefined,
      "R18 detay: archive.supported + archivedAt; USERS_SAFE_SELECT sözleşmesi değişmedi");
    const r19 = await call(archiveListRoute.GET, "/api/admin/users/archive", asOwner);
    const r19u = (r19.json.users as Record<string, unknown>[]) ?? [];
    const r19arch = r19u.filter((u) => u.archived_at != null).map((u) => String(u.id)).sort();
    const dbArch = (await su.query(`select id::text from public.users where role='expert' and approval_status='approved' and active=false and archived_at is not null order by 1`)).rows.map((x) => x.id);
    const dbPas = (await su.query(`select count(*)::int n from public.users where role='expert' and approval_status='approved' and active=false`)).rows[0].n;
    ok(r19.status === 200 && r19.json.archiveModel === true && JSON.stringify(r19arch) === JSON.stringify(dbArch) && r19u.length === dbPas,
      "R19 klasik “Pasif ve Arşiv” görünümü: kapsam aynı (kaybolan yok) + satır bazında archived_at doğru", { list: r19u.length, dbPas });
    const m1 = await call(membersRoute.GET, "/api/admin/members?f=pasif", asOwner);
    const m2 = await call(membersRoute.GET, "/api/admin/members?f=arsiv", asOwner);
    ok(m1.status === 200 && (m1.json.rows as { stage: string }[]).every((x) => x.stage === "pasif") && (m1.json.rows as unknown[]).length > 0
       && m2.status === 200 && (m2.json.rows as { id: string; stage: string }[]).every((x) => x.stage === "arsiv")
       && JSON.stringify((m2.json.rows as { id: string }[]).map((x) => x.id).sort()) === JSON.stringify(dbArch),
      "R20 /api/admin/members: f=pasif yalnız pasif, f=arsiv yalnız archived_at dolu hesaplar");
    ok(parseMemberV2Query(new URLSearchParams("f=pasif")).ok === true, "R21 URL filtresi f=pasif geçerli");
    let down = 0;
    await su.query(`alter function public.admin_unarchive_user(uuid, uuid) rename to admin_unarchive_user_zz`);
    await del(asOwner, { adminPassword: PASS }).catch(() => undefined);
    const dd = await una(asOwner, { adminPassword: PASS });
    if (dd.status === 503 || dd.status === 500) down++;
    await su.query(`alter function public.admin_unarchive_user_zz(uuid, uuid) rename to admin_unarchive_user`);
    ok(down === 1 && (await userRow(rt)).archived_at !== null, "R22 veritabanı hatası → 5xx; arşiv durumu değişmez");

    console.log("\n[S] Arşivleme kapsamı (Owner kararı: yalnız onaylı uzman)");
    for (const [k, uid] of [["onay bekleyen", id.pending], ["reddedilen", id.rejected], ["yardımcı yönetici", ADMIN2]] as [string, string][]) {
      const b = await userRow(uid);
      const c0 = await code(`select public.admin_archive_user($1,$2)`, [uid, OWNER]);
      const a0 = await userRow(uid);
      ok(c0 === "UY002" && a0.archived_at === null && a0.active === b.active && a0.approval_status === b.approval_status,
        `S1 ${k} arşivlenemez (RPC UY002); durum değişmez`, c0);
    }
    const sPend = await call(deleteRoute.POST, `/api/admin/users/${id.pending}/delete`, asOwner, { adminPassword: PASS }, id.pending);
    const sRej = await call(deleteRoute.POST, `/api/admin/users/${id.rejected}/delete`, asOwner, { adminPassword: PASS }, id.rejected);
    const sAdm = await call(deleteRoute.POST, `/api/admin/users/${ADMIN2}/delete`, asOwner, { adminPassword: PASS }, ADMIN2);
    ok(sPend.status === 409 && sRej.status === 409 && sAdm.status === 409 && (await userRow(ADMIN2)).active === true,
      "S2 route: başvuru / reddedilen / yönetici arşivleme → 409; yönetici hesabı aktif kalır", [sPend.status, sRej.status, sAdm.status]);
    ok((await su.query(`select count(*)::int n from public.admin_audit_log where action='user_archived' and target_user_id = any($1)`,
      [[id.pending, id.rejected, ADMIN2]])).rows[0].n === 0, "S3 reddedilen arşiv denemeleri yönetim geçmişine arşiv olarak yazılmaz");

    console.log("\n[Y] Arşivdeki hesapta değişiklik yok (veritabanı + sunucu)");
    const z = id.frozen;
    const zt = id.arch_trial;
    await asSvc(`select public.admin_pricing_phase_save($1,$2,null,$3::date,null,1500,'monthly','zz',null) r`, [OWNER, z, day(NOW - 30 * D)]);
    const phaseId = (await su.query(`select id from public.member_pricing_phases where user_id=$1`, [z])).rows[0]?.id as string | undefined;
    ok(Boolean(phaseId), "Y0 arşiv öncesi fiyat dönemi eklenebildi (kontrol)");
    await asSvc(`select public.admin_archive_user($1,$2) r`, [z, OWNER]);
    await asSvc(`select public.admin_archive_user($1,$2) r`, [zt, OWNER]);
    const zFp = async () => (await su.query(`select md5((to_jsonb(u) - 'full_name' - 'email' - 'password_hash')::text) h from public.users u where id=$1`, [z])).rows[0].h as string;
    const ztFp = async () => (await su.query(`select md5(to_jsonb(u)::text) h from public.users u where id=$1`, [zt])).rows[0].h as string;
    const childFp = async () => (await su.query(`select
        (select md5(coalesce(string_agg(p::text, ',' order by p.id), '')) from public.member_pricing_phases p where p.user_id = any($1)) pp,
        (select md5(coalesce(string_agg(h::text, ',' order by h.id), '')) from public.user_payment_history h where h.user_id = any($1)) ph,
        (select md5(coalesce(string_agg(t::text, ',' order by t.user_id), '')) from public.trial_profiles t where t.user_id = any($1)) tp`, [[z, zt]])).rows[0];
    const zBefore = await zFp(); const ztBefore = await ztFp(); const chBefore = await childFp();
    const directCols: [string, string][] = [
      ["module_permissions", `'{"clients":false}'::jsonb`], ["payment_status", "'overdue'"], ["next_payment_date", "current_date + 400"],
      ["paid_amount", "1"], ["agreed_fee", "9"], ["package_type", "'trial'"], ["membership_status", "'expired'"],
      ["license_type", "'family'"], ["security_exempt", "true"], ["allowed_active_sessions", "7"],
      ["role", "'admin'"], ["approval_status", "'pending'"], ["astrology_technique_grants", `'{"mode":"all"}'::jsonb`],
    ];
    let blocked = 0;
    const leaks: string[] = [];
    for (const [col, val] of directCols) {
      const cc = await code(`update public.users set ${col} = ${val} where id = $1`, [z]);
      if (cc === "UY005") blocked++; else leaks.push(`${col}:${cc}`);
    }
    ok(blocked === directCols.length, `Y1 doğrudan veri yazımı: ${blocked}/${directCols.length} üyelik/ödeme/lisans/rol/onay/Atlas alanı reddedildi (UY005)`, leaks);
    ok(await code(`update public.users set trial_status = 'suspended' where id = $1`, [zt]) === "UY005"
       && await code(`update public.users set trial_ends_at = trial_ends_at + interval '7 days' where id = $1`, [zt]) === "UY005",
      "Y2 deneme durumu / süresi değiştirilemez (uzatma veya yeniden başlatma yok)");
    const rpcCases: [string, string, unknown[]][] = [
      ["modül izni RPC", `select public.admin_set_module_permissions($1,$2,$3::jsonb)`, [z, OWNER, JSON.stringify({ stones: false })]],
      ["deneme kredi limiti RPC", `select public.admin_trial_set_limits($1,$2,10,'{}'::jsonb)`, [OWNER, zt]],
      ["deneme durdurma RPC", `select public.admin_trial_set_state($1,$2,'suspend',null)`, [OWNER, zt]],
      ["denemeden Pro'ya geçiş RPC", `select public.admin_trial_convert_to_pro($1,$2,$3::jsonb,'{}'::text[])`, [OWNER, zt, JSON.stringify({ clients: true })]],
      ["fiyat dönemi ekleme RPC", `select public.admin_pricing_phase_save($1,$2,null,current_date,null,999,'monthly','x',null)`, [OWNER, z]],
      ["fiyat dönemi silme RPC", `select public.admin_pricing_phase_delete($1,$2,$3)`, [OWNER, z, phaseId]],
      ["ödeme geçmişi kaydı", `insert into public.user_payment_history(user_id, payment_status, paid_amount) values ($1,'paid',5)`, [z]],
    ];
    for (const [label, sql, args] of rpcCases) {
      const cc = await code(sql, args);
      ok(cc === "UY005", `Y3 ${label} → reddedildi (UY005)`, cc);
    }
    ok((await zFp()) === zBefore && (await ztFp()) === ztBefore && JSON.stringify(await childFp()) === JSON.stringify(chBefore),
      "Y4 tüm denemelerden sonra hesap satırları, fiyat dönemi, ödeme geçmişi ve deneme profili birebir aynı");
    ok(await code(`update public.users set full_name = 'ZZ_4A Uzman frozen (ad düzeltme)' where id = $1`, [z]) === "OK"
       && await code(`update public.users set password_hash = 'zz-test-hash:yeni' where id = $1`, [z]) === "OK",
      "Y5 ad ve parola değişebilir (üyelik/erişim değil)");
    const readOk = (await su.query(`select count(*)::int n from public.user_payment_history where user_id=$1`, [z])).rows[0].n >= 1
      && (await asSvc(`select public.admin_pricing_phase_list($1) r`, [z])) !== undefined;
    ok(readOk, "Y6 arşivdeki hesabın ödeme geçmişi ve fiyat dönemleri OKUNUR");
    ok(await code(`select public.admin_pricing_phase_save($1,$2,null,current_date,null,700,'monthly','iz',null)`, [OWNER, id.other]) === "OK"
       && await code(`select public.admin_set_module_permissions($1,$2,$3::jsonb)`, [id.other, OWNER, JSON.stringify({ stones: false })]) === "OK",
      "Y7 izolasyon: arşivde olmayan başka uzmanın işlemleri etkilenmez");
    // Rotalar (arayüzle aynı kimlik başlıkları)
    const patch = async (url: string, body: unknown, uid: string, h: unknown) => {
      const req = new NextRequest(`http://localhost${url}`, { method: "PATCH", headers: { "x-admin-id": OWNER, "x-session-token": TOK.owner, "content-type": "application/json" }, body: JSON.stringify(body) });
      const res = await (h as H)(req, { params: Promise.resolve({ id: uid }) });
      let j: Record<string, unknown> = {}; try { j = await res.json(); } catch { /* boş */ }
      return { status: res.status, json: j };
    };
    const del2 = async (url: string, body: unknown, uid: string, h: unknown) => {
      const req = new NextRequest(`http://localhost${url}`, { method: "DELETE", headers: { "x-admin-id": OWNER, "x-session-token": TOK.owner, "content-type": "application/json" }, body: JSON.stringify(body) });
      const res = await (h as H)(req, { params: Promise.resolve({ id: uid }) });
      return { status: res.status };
    };
    const put = async (url: string, body: unknown, uid: string, h: unknown) => {
      const req = new NextRequest(`http://localhost${url}`, { method: "PUT", headers: { "x-admin-id": OWNER, "x-session-token": TOK.owner, "content-type": "application/json" }, body: JSON.stringify(body) });
      const res = await (h as H)(req, { params: Promise.resolve({ id: uid }) });
      return { status: res.status };
    };
    const zRow = await userRow(z);
    const routeCases: [string, Promise<{ status: number }>][] = [
      ["ödeme kaydet", call(paymentRoute.POST, `/api/admin/users/${z}/payment`, asOwner, { draft: { status: "paid" } }, z)],
      ["fiyat dönemi ekle", call(pricingRoute.POST, `/api/admin/users/${z}/pricing-phases`, asOwner, { startsOn: day(NOW), amount: 1, billingPeriod: "monthly" }, z)],
      ["fiyat dönemi sil", del2(`/api/admin/users/${z}/pricing-phases`, { phaseId, expectedUpdatedAt: null }, z, pricingRoute.DELETE)],
      ["modül anahtarı", patch(`/api/admin/users/${z}`, { action: "modules", changes: { stones: false } }, z, detailRoute.PATCH)],
      ["lisans / oturum limiti", patch(`/api/admin/users/${z}`, { action: "license", license_type: "family" }, z, detailRoute.PATCH)],
      ["rol değişimi", patch(`/api/admin/users/${z}`, { action: "edit", fullName: zRow.full_name, email: zRow.email, role: "admin" }, z, detailRoute.PATCH)],
      ["Atlas teknik izinleri", put(`/api/admin/users/${z}/astrology-techniques`, { grants: { mode: "all" }, enableModule: true }, z, astroRoute.PUT)],
      ["deneme kredi limiti", patch(`/api/admin/trials/${zt}`, { action: "limits", dailyLimit: 10 }, zt, trialRoute.PATCH)],
      ["deneme durdur/sürdür", patch(`/api/admin/trials/${zt}`, { action: "suspend" }, zt, trialRoute.PATCH)],
      ["denemeden Pro'ya geçiş", call(convertRoute.POST, `/api/admin/trials/${zt}/convert`, asOwner, { modules: ["clients"] }, zt)],
    ];
    for (const [label, p] of routeCases) {
      const r = await p;
      ok(r.status === 409, `Y8 route: ${label} → 409 (arşivde)`, r.status);
    }
    ok((await zFp()) === zBefore
       && (await ztFp()) === ztBefore && JSON.stringify(await childFp()) === JSON.stringify(chBefore) && (await userRow(z)).role === "expert",
      "Y9 route denemelerinden sonra da hiçbir üyelik/ticari kayıt değişmedi");
    const nameEdit = await patch(`/api/admin/users/${z}`, { action: "edit", fullName: "ZZ_4A Uzman frozen (yeni ad)", email: zRow.email, role: "expert" }, z, detailRoute.PATCH);
    ok(nameEdit.status === 200 && (await userRow(z)).full_name === "ZZ_4A Uzman frozen (yeni ad)", "Y10 arşivdeki hesapta ad düzeltmesi serbest (200)", nameEdit.status);
    const dGet = await call(detailRoute.GET, `/api/admin/users/${z}`, asOwner, undefined, z);
    ok(dGet.status === 200 && (dGet.json.paymentHistory as unknown[]).length >= 1, "Y11 detay + ödeme geçmişi okunur (200)");
    const dismiss = await patch(`/api/admin/trials/${zt}`, { action: "dismiss_pro_request" }, zt, trialRoute.PATCH);
    ok(dismiss.status !== 409, `Y12 Pro talebini kapatma (hak açmaz) engellenmez (${dismiss.status})`);
    await asSvc(`select public.admin_unarchive_user($1,$2) r`, [z, OWNER]);
    ok(await code(`select public.admin_set_module_permissions($1,$2,$3::jsonb)`, [z, OWNER, JSON.stringify({ stones: false })]) === "OK"
       && await code(`update public.users set payment_status = 'pending' where id = $1`, [z]) === "OK"
       && (await userRow(z)).active === false,
      "Y13 arşivden çıkınca değişiklik yeniden mümkün; hesap yine PASİF (erişim açılmadı)");

    console.log("\n[K] Kalıcı silme yalnız arşivde (DB tetikleyicisi + route)");
    const PURGE_COUNTS = async (uid: string, tenantId: string) => (await su.query(`select
        (select count(*)::int from public.users where id=$1) u,
        (select count(*)::int from public.clients where tenant_id=$2) c,
        (select count(*)::int from public.user_payment_history where user_id=$1) h,
        (select count(*)::int from public.member_pricing_phases where user_id=$1) p,
        (select count(*)::int from public.tenants where id=$2) t`, [uid, tenantId])).rows[0];
    const totalOthers = async () => (await su.query(`select count(*)::int n from public.clients`)).rows[0].n as number;
    const purge = (uid: string, email: string) => code(`select public.admin_purge_archived_expert($1,$2,$3)`, [uid, OWNER, email]);
    for (const [k, label] of [["old_deact", "eski pasif (arşivlenmemiş)"], ["old_noaudit", "kayıtsız eski pasif"], ["pro_overdue", "aktif"]] as [string, string][]) {
      const b = await PURGE_COUNTS(id[k], tenantOf[k]);
      const cc = await purge(id[k], `zz.4a.${k}@example.test`);
      ok(cc === "UP006" && JSON.stringify(await PURGE_COUNTS(id[k], tenantOf[k])) === JSON.stringify(b),
        `K1 ${label} hesap kalıcı silinemez (UP006); hiçbir ilişkili kayıt silinmedi`, cc);
    }
    const po = id.purge_ok;
    await asSvc(`select public.admin_pricing_phase_save($1,$2,null,current_date,null,1200,'monthly','p',null) r`, [OWNER, po]);
    await asSvc(`select public.admin_archive_user($1,$2) r`, [po, OWNER]);
    const others0 = await totalOthers();
    const k2 = await purge(po, "zz.4a.purge_ok@example.test");
    const k2c = await PURGE_COUNTS(po, tenantOf.purge_ok);
    ok(k2 === "OK" && k2c.u === 0 && k2c.c === 0 && k2c.h === 0 && k2c.p === 0 && k2c.t === 0 && (await totalOthers()) === others0 - 2,
      "K2 arşivdeki uzman (fiyat dönemi + ödeme geçmişi ile) kalıcı silinir; yalnız kendi kayıtları gider, başkalarınınki kalır", { k2, k2c });
    ok((await su.query(`select count(*)::int n from public.admin_purge_context`)).rows[0].n === 0, "K3 işlem işareti temizlendi (artık satır yok)");
    // Eşzamanlılık: arşivden çıkarma işlemi kilit tutarken gelen kalıcı silme beklemeli ve güncel (arşivde değil) durumu görmeli.
    const pc = id.purge_conc;
    await asSvc(`select public.admin_archive_user($1,$2) r`, [pc, OWNER]);
    const pcBefore = await PURGE_COUNTS(pc, tenantOf.purge_conc);
    const holder = await pool.connect();
    let k4 = "";
    try {
      await holder.query("begin");
      await holder.query("set local role service_role");
      await holder.query(`select public.admin_unarchive_user($1,$2)`, [pc, OWNER]);
      const pending = purge(pc, "zz.4a.purge_conc@example.test");
      await new Promise((r) => setTimeout(r, 700));
      await holder.query("commit");
      k4 = await pending;
    } finally {
      holder.release();
    }
    const pcRow = await userRow(pc);
    ok(k4 === "UP006" && pcRow && pcRow.archived_at === null && JSON.stringify(await PURGE_COUNTS(pc, tenantOf.purge_conc)) === JSON.stringify(pcBefore),
      "K4 eşzamanlı: arşivden çıkarma ile yarışan kalıcı silme UP006; hesap ve tüm kayıtları duruyor", k4);
    const purgeRoute = await import("../../app/api/admin/users/[id]/purge/route");
    const { PURGE_FINAL_PHRASE } = await import("../../lib/admin/expertPurge");
    const k5 = await call(purgeRoute.POST, `/api/admin/users/${id.old_deact}/purge`, asOwner,
      { adminPassword: PASS, confirmEmail: "zz.4a.old_deact@example.test", finalPhrase: PURGE_FINAL_PHRASE }, id.old_deact);
    ok(k5.status === 409 && /arşivlenmiş/.test(String(k5.json.error)) && (await userRow(id.old_deact)) !== undefined,
      "K5 route: pasif (arşivlenmemiş) hesap için kalıcı silme → 409, hesap duruyor", k5);
    const k6 = await call(purgeRoute.POST, `/api/admin/users/${pc}/purge`, asAdmin2,
      { adminPassword: PASS, confirmEmail: "zz.4a.purge_conc@example.test", finalPhrase: PURGE_FINAL_PHRASE }, pc);
    ok(k6.status === 403, "K6 route: yardımcı yönetici kalıcı silme yapamaz (403, mevcut kural)");

    console.log("\n[V] Liste / klasik / zil tutarlılığı");
    const v = await list("all");
    const vp = await list("pasif");
    const va = await list("arsiv");
    ok(v.presets.pasif === vp.total && v.presets.arsiv === va.total && vp.rows.every((x) => x.stage === "pasif") && va.rows.every((x) => x.stage === "arsiv"),
      "V1 hazır filtre sayıları = filtre sonuçları (pasif/arşiv)");
    const ids = new Set(v.rows.map((x) => x.id));
    ok(vp.rows.every((x) => ids.has(x.id)) && va.rows.every((x) => !ids.has(x.id)), "V2 pasif ⊂ Tüm üyeler; arşiv ∩ Tüm üyeler = ∅");
    const manual = (await su.query(`select
        count(*) filter (where role='expert' and not is_demo_account and package_type='premium' and active and approval_status='approved' and (trial_kind is null or trial_status='converted')) pro
      from public.users`)).rows[0];
    ok(v.counts.pro === Number(manual.pro), "V3 Pro sayacı yalnız aktif Pro üyeler (pasif/arşiv sayılmaz — eskisi gibi)", { got: v.counts.pro, exp: manual.pro });
    const klasik = (await su.query(`select public.admin_list_users('', null, 'members', 'all', 'all', 'all', 'all', 20, 0) r`)).rows[0].r as { counts?: Record<string, number> };
    const klasikExp = (await su.query(`select count(*)::int n from public.users where role='expert' and approval_status='approved' and active is not true`)).rows[0].n;
    ok(Number(klasik.counts?.archived) === klasikExp && klasikExp > 0,
      "V4 klasik liste/sistem sağlığı “Pasif (arşiv)” sayacı aynı tanımla (değişmedi)");
    await su.query(`select public.admin_notifications_reconcile()`);
    const openAct = (await su.query(`select type, count(*)::int n from public.admin_notifications where kind='action' and resolved_at is null group by 1 order by 1`)).rows;
    ok(!openAct.some((x) => ["basvuru"].includes(x.type) && x.n > 1), "V5 zil: pasif/arşiv işlemleri yeni karar bildirimi üretmez", openAct);
    ok(memberStageLabel("pasif", { nowMs: NOW }).label.includes("Pasif") && memberStageLabel("arsiv", { nowMs: NOW }).label === "Arşivde"
       && MEMBER_V2_MORE_FILTERS.some(([k, l]) => k === "askida" && l === "Denemesi durdurulanlar") && MEMBER_V2_MORE_FILTERS.some(([k]) => k === "pasif"),
      "V6 etiketler: Pasif ≠ Arşiv ≠ Denemesi durdurulanlar");
    ok(memberAccountState({ active: true, archivedAt: null }) === "active" && memberAccountState({ active: false, archivedAt: null }) === "passive"
       && memberAccountState({ active: false, archivedAt: "2026-11-12T00:00:00Z" }) === "archived"
       && memberAccountState({ active: true, archivedAt: "x" }) === "archived", "V7 saf yardımcı: aktif / pasif / arşiv (çelişkide arşiv = kapalı)");
  } finally {
    if (shim) await shim.close().catch(() => undefined);
    await db.stop();
  }
  console.log(`\n──────────\nAŞAMA 4a (pasif ≠ arşiv): PASS ${pass} · FAIL ${fail}`);
  if (fail > 0) {
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  process.exit(0); // açık havuz/şim tanıtıcıları süreci asılı tutmasın
}

main().catch((e) => {
  console.error("BEKLENMEYEN:", e);
  process.exit(1);
});
