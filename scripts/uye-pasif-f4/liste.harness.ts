/**
 * ÜYE PASİFLEŞTİRME F4 tamamlama — üye listeleri harness'ı (gerçek PG + gerçek migration + gerçek admin rotaları).
 * Production'a / ağa SIFIR temas; sentetik hesaplar (ZZ_PSL_*).
 *
 *   M  20280126000100: ön koşul fail-closed (kısıt kolonu yokken uygulanmaz) · 2× uygulama · DML yok · yetkiler
 *   V  Üye Listesi V2 (admin_list_members_v2 + /api/admin/members): kısıtlı uzman 'pasif' + access_restricted; eski giriş
 *      kapalı 'pasif' (access_restricted=false); arşiv 'arsiv'; Aktif (Pro/Deneme) görünmez; 'Pasif hesaplar' filtresi
 *   K  TİCARİ SAYAÇLAR ('counts') ve ödeme / süre bayrakları kısıt öncesi ↔ sonrası BİREBİR (anlam değişmez)
 *   C  Klasik liste (admin_list_users + /api/admin/users): 'Aktif' filtresinde kısıtlı uzman YOK, 'Pasif'te VAR;
 *      satır access_restricted; klasik sayaçlar birebir
 *   U  Kullanım Takibi (usage360 experts / detail rotaları): accessRestricted gösterim bayrağı
 *   G  F4-R1 Kullanım Takibi: 20280126000200 (fail-closed · 2× · DML yok · yetkiler) · Genel Bakış 4 ayrık durum
 *      (Aktif / Pasif / Giriş kapalı / Arşivde; toplam = Toplam Uzman) · uzman süzgeci 4 durum · gerçek arşiv bayrağı ·
 *      geçmiş kullanım kayıtları (usage_daily) birebir
 *   E  etiketler: memberStageLabel (Pasif · modüller kilitli / Pasif · giriş kapalı), StatusPill, AccountBadge
 *   R  kısıt kaldırılınca liste ve sayaçlar ilk hâle birebir döner
 *
 * Çalıştır: npx tsx scripts/uye-pasif-f4/liste.harness.ts
 */
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb, type TestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); return; }
  fail++;
  failures.push(label);
  console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 700)}`}`);
}

const realFetch = globalThis.fetch;
let shimUrl = "http://127.0.0.1:1";
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (u.startsWith(shimUrl)) return realFetch(input, init);
  throw new Error(`AG ENGELLENDI (harness): ${u.slice(0, 80)}`);
}) as typeof fetch;

const MIG_F2 = "20280126000000_member_access_restriction.sql";
const MIG_LIST = "20280126000100_member_list_access_restricted.sql";
const MIG_U360 = "20280126000200_usage360_member_access_states.sql";
const PRE = [
  "20271009100000_admin_purge_archived_expert.sql",
  "20271230000000_astrology_technique_grants.sql",
  "20280101000000_trial7_self_trial.sql",
  "20280101000100_trial7_claims_retention.sql",
  "20280101000200_trial7_admin_trial_approval.sql",
  "20280101000300_admin_legacy_package_repair.sql",
  "20280101000400_admin_owner_notifications.sql",
  "20280101000500_admin_list_members_v2.sql",
  "20280101000600_admin_member_archive_state.sql",
  "20280101000690_user_payment_history_payment_date_optional_4b.sql",
  "20280101000700_admin_payment_atomic_4b.sql",
  "20280101000710_admin_trial_convert_passive_guard_4b.sql",
];
const OWNER = "00000000-0000-4000-8000-00000000f5a1";
const TOKEN = "zz-psl-owner-0001";
const D = 86_400_000;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const a = srv.address();
      const p = typeof a === "object" && a ? a.port : 0;
      srv.close(() => (p ? resolve(p) : reject(new Error("boş port alınamadı"))));
    });
  });
}

async function main(): Promise<void> {
  const port = await freePort();
  const db: TestDb = await startTestDb(port, `uye-pasif-liste-${port}`);
  const { su, pool } = db;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  try {
    for (const f of PRE) await su.query(readMig(f));
    const tenant = async (k: string) => {
      const t = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZPSL',$2,'active')`, [t, `zzpsl-${k}-${t.slice(0, 8)}`]);
      return t;
    };
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id, created_at)
       values ($1,'ZZ_PSL Owner','zz.psl.owner@example.test','admin',true,'approved',true,'owner',$2, now() - interval '400 days')`,
      [OWNER, await tenant("owner")],
    );
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [OWNER, TOKEN]);
    const ids: Record<string, string> = {};
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const mk = async (key: string, o: { active?: boolean; trialEndsInH?: number; pay?: string; npd?: string } = {}) => {
      const uid = randomUUID();
      ids[key] = uid;
      const now = Date.now();
      const trial = o.trialEndsInH !== undefined;
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, package_type, plan, trial_kind, trial_status,
           trial_started_at, trial_ends_at, payment_status, next_payment_date, module_permissions, tenant_id, created_at)
         values ($1,$2,$3,'expert',$4,'approved', now() - interval '20 days', $5,$5,$6,$7,$8,$9,$10,$11::date,$12,$13, now() - interval '30 days')`,
        [uid, `ZZ_PSL ${key}`, `zz.psl.${key}@example.test`, o.active !== false, trial ? "trial" : "premium",
          trial ? "self_7d" : null, trial ? "active" : null, trial ? new Date(now - 6 * D) : null,
          trial ? new Date(now + (o.trialEndsInH ?? 0) * 3_600_000) : null, o.pay ?? "paid", o.npd ?? null,
          JSON.stringify({ clients: true, numerology: true }), await tenant(key)],
      );
      await su.query(`insert into public.clients(tenant_id, full_name) select tenant_id, 'ZZ Danışan' from public.users where id=$1`, [uid]);
      return uid;
    };
    await mk("proA", { pay: "paid", npd: day(Date.now() + 3 * D) });
    await mk("proB", { pay: "overdue", npd: day(Date.now() - 5 * D) });
    await mk("trialC", { trialEndsInH: 20 });
    await mk("legacyD", { active: false });
    await mk("archE");
    await su.query(`select public.admin_archive_user($1,$2)`, [ids.archE, OWNER]);
    // Geçmiş kullanım kayıtları (sentetik): kısıt / migration sonrası birebir korunmalı.
    for (const k of ["proA", "proB", "trialC", "legacyD", "archE"]) {
      await su.query(`insert into public.usage_daily(user_id, tenant_id, day_tr, channel, visits, active_seconds, module_opens, first_at, last_at)
        select id, tenant_id, current_date - 3, 'desktop_web', 4, 600, 2, now() - interval '3 days', now() - interval '3 days' from public.users where id=$1`, [ids[k]]);
    }
    const usageHash = async () => (await su.query(`select count(*)::int n, md5(string_agg(to_jsonb(d)::text, '|' order by user_id, day_tr)) h from public.usage_daily d`)).rows[0];
    const usage0 = await usageHash();

    // ── M) Migration ─────────────────────────────────────────────────────────
    console.log("\n[M] Migration 20280126000100");
    let pre = "";
    try { await su.query(readMig(MIG_LIST)); } catch (e) { pre = (e as Error).message; await su.query("rollback").catch(() => undefined); }
    ok(/uye-pasif liste on kosul/.test(pre), "ön koşul: kısıt kolonu yokken liste migration'ı fail-closed (uygulanmaz)", pre);
    let preU = "";
    try { await su.query(readMig(MIG_U360)); } catch (e) { preU = (e as Error).message; await su.query("rollback").catch(() => undefined); }
    ok(/uye-pasif usage360 on kosul/.test(preU), "ön koşul: kısıt kolonu yokken usage360 migration'ı fail-closed (uygulanmaz)", preU);
    await su.query(readMig(MIG_F2));
    const snapRows = async () => (await su.query(`select md5(string_agg((to_jsonb(u))::text, '|' order by id)) h from public.users u`)).rows[0].h;
    const h0 = await snapRows();
    await su.query(readMig(MIG_LIST));
    await su.query(readMig(MIG_LIST));
    ok((await snapRows()) === h0, "liste migration'ı 2× uygulandı; kullanıcı satırları DEĞİŞMEDİ (DML yok)");
    await su.query(readMig(MIG_U360));
    await su.query(readMig(MIG_U360));
    ok((await snapRows()) === h0 && JSON.stringify(await usageHash()) === JSON.stringify(usage0),
      "usage360 migration'ı 2× uygulandı; kullanıcı ve kullanım kayıtları DEĞİŞMEDİ (DML yok)");
    const privU = (await su.query(`select
        has_function_privilege('anon','public.usage360_expert_list(text,text,text,integer,integer,boolean,date)','EXECUTE') a,
        has_function_privilege('authenticated','public.usage360_expert_list(text,text,text,integer,integer,boolean,date)','EXECUTE') b,
        has_function_privilege('service_role','public.usage360_expert_list(text,text,text,integer,integer,boolean,date)','EXECUTE') c`)).rows[0];
    ok(privU.a === false && privU.b === false && privU.c === true, "usage360_expert_list yetkileri aynen", privU);
    const priv = (await su.query(`select
        has_function_privilege('anon','public.admin_list_members_v2(uuid,text,text,text,text[],text,text,integer,integer,timestamptz)','EXECUTE') a,
        has_function_privilege('authenticated','public.admin_list_users(text,text,text,text,text,text,text,integer,integer,text,text,text,text[],text,date)','EXECUTE') b,
        has_function_privilege('service_role','public.admin_list_members_v2(uuid,text,text,text,text[],text,text,integer,integer,timestamptz)','EXECUTE') c`)).rows[0];
    ok(priv.a === false && priv.b === false && priv.c === true, "yetkiler aynen: istemci rolleri çalıştıramaz, service_role çalıştırır", priv);

    shim = await startPgrestShim(pool);
    shimUrl = shim.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
    const membersRoute = await import("../../app/api/admin/members/route");
    const usersRoute = await import("../../app/api/admin/users/route");
    const u360List = await import("../../app/api/admin/expert-stats/usage360/experts/route");
    const u360Detail = await import("../../app/api/admin/expert-stats/usage360/detail/route");
    const overviewRoute = await import("../../app/api/admin/expert-stats/overview/route");
    const ov = async () => (await get(overviewRoute.GET, "/api/admin/expert-stats/overview")).json.data as Record<string, any>;
    const ovVals = (d: Record<string, any>) => ({
      total: d.totalExperts?.value, active: d.activeExperts?.value, passive: d.passiveExperts?.value,
      loginClosed: d.loginClosedExperts?.value, archived: d.archivedExperts?.value, pending: d.pendingExperts?.value,
    });
    const ulist = async (status: string) =>
      new Set((((await get(u360List.GET, `/api/admin/expert-stats/usage360/experts?status=${status}&pageSize=100`)).json.data?.rows ?? []) as Record<string, any>[]).map((r) => r.userId as string));
    const get = async (h: unknown, url: string) => {
      const res = await (h as (r: NextRequest) => Promise<Response>)(new NextRequest(`http://localhost${url}`, { headers: { "x-admin-id": OWNER, "x-session-token": TOKEN } }));
      return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, any> };
    };
    const v2 = async (f = "all") => get(membersRoute.GET, `/api/admin/members?f=${f}&rol=expert&pageSize=100`);
    const classic = async (active: string) => get(usersRoute.GET, `/api/admin/users?active=${active}&pageSize=50`);
    const rowOf = (j: Record<string, any>, id: string) => (j.rows as Record<string, any>[]).find((r) => r.id === id);
    const ids2 = (j: Record<string, any>, key = "rows") => new Set(((j[key] ?? []) as Record<string, any>[]).map((r) => r.id as string));

    const ov0 = ovVals(await ov());
    const b0 = await v2();
    const c0Active = await classic("active");
    const c0Passive = await classic("passive");
    ok(b0.status === 200 && rowOf(b0.json, ids.proB)?.stage === "pro" && rowOf(b0.json, ids.legacyD)?.stage === "pasif",
      "başlangıç: Pro uzman 'pro', eski giriş kapalı 'pasif'", { proB: rowOf(b0.json, ids.proB)?.stage });

    // Kısıtla: Pro (ödemesi gecikmiş) + deneme (süresi yakında doluyor).
    await su.query(`select public.admin_set_member_access_restriction($1,$2,true,false)`, [ids.proB, OWNER]);
    await su.query(`select public.admin_set_member_access_restriction($1,$2,true,false)`, [ids.trialC, OWNER]);

    // ── V) V2 liste ──────────────────────────────────────────────────────────
    console.log("\n[V] Üye Listesi V2");
    const b1 = await v2();
    const rB = rowOf(b1.json, ids.proB), rC = rowOf(b1.json, ids.trialC), rD = rowOf(b1.json, ids.legacyD), rA = rowOf(b1.json, ids.proA);
    ok(rB?.stage === "pasif" && rB?.access_restricted === true && rC?.stage === "pasif" && rC?.access_restricted === true,
      "kısıtlı Pro ve deneme uzmanı: aşama 'pasif' + access_restricted (Aktif / Pro / Denemede GÖRÜNMEZ)", { rB, rC });
    ok(rD?.stage === "pasif" && rD?.access_restricted === false && rA?.stage === "pro" && rA?.access_restricted === false,
      "eski giriş kapalı: 'pasif' + access_restricted=false · aktif Pro aynen 'pro'");
    const arsiv = await v2("arsiv");
    ok(ids2(arsiv.json).has(ids.archE) && rowOf(arsiv.json, ids.archE)?.stage === "arsiv", "arşivdeki uzman 'arsiv' (Arşiv filtresinde)");
    const fp = await v2("pasif");
    const fpIds = ids2(fp.json);
    ok(fpIds.has(ids.proB) && fpIds.has(ids.trialC) && fpIds.has(ids.legacyD) && !fpIds.has(ids.proA) && !fpIds.has(ids.archE),
      "'Pasif hesaplar' filtresi: kısıtlı + eski giriş kapalı; aktif ve arşiv YOK");
    const fpro = await v2("pro");
    ok(!ids2(fpro.json).has(ids.proB) && ids2(fpro.json).has(ids.proA), "'Pro' filtresi: kısıtlı Pro uzman YOK, aktif Pro VAR");

    // ── K) Ticari sayaçlar ───────────────────────────────────────────────────
    console.log("\n[K] Ticari sayaçlar ve ödeme bayrakları");
    ok(JSON.stringify(b1.json.counts) === JSON.stringify(b0.json.counts), "ticari göstergeler ('counts') kısıt öncesiyle BİREBİR", { b0: b0.json.counts, b1: b1.json.counts });
    ok(rB?.pay_check === true && rowOf(b0.json, ids.proB)?.pay_check === true, "ödeme takibi: kısıtlı Pro uzman 'ödeme kontrolü'nde kalır (bayrak aynen)");
    const pr0 = b0.json.presets ?? {}, pr1 = b1.json.presets ?? {};
    ok(pr1.pasif === pr0.pasif + 2 && pr1.pro === pr0.pro - 1 && pr1.trial === pr0.trial - 1 && pr1.all === pr0.all && pr1.pay === pr0.pay && pr1.soon === pr0.soon,
      "filtre sayıları: Pasif +2, Pro −1, Denemede −1; Tümü / Ödeme / Süresi yakında AYNEN", { pr0, pr1 });

    // ── C) Klasik liste ──────────────────────────────────────────────────────
    console.log("\n[C] Klasik liste");
    const c1Active = await classic("active");
    const c1Passive = await classic("passive");
    const ca = ids2(c1Active.json, "users"), cp = ids2(c1Passive.json, "users");
    ok(c1Active.status === 200 && !ca.has(ids.proB) && !ca.has(ids.trialC) && ca.has(ids.proA) && cp.has(ids.proB) && cp.has(ids.trialC),
      "klasik 'Aktif' filtresinde kısıtlı uzman YOK; 'Pasif' filtresinde VAR", { st: c1Active.status, err: c1Active.json.error, aktif: [...ca].length, pasif: [...cp].length });
    const cB = (c1Passive.json.users as Record<string, any>[]).find((u) => u.id === ids.proB);
    const cA = (c1Active.json.users as Record<string, any>[]).find((u) => u.id === ids.proA);
    ok(cB?.access_restricted === true && cA?.access_restricted === false, "klasik satır: access_restricted (rozet 'Pasif')");
    ok(JSON.stringify(c1Active.json.counts) === JSON.stringify(c0Active.json.counts), "klasik sayaçlar (onaylı aktif / yenileme) BİREBİR", { c0: c0Active.json.counts, c1: c1Active.json.counts });
    ok(cp.size === ids2(c0Passive.json, "users").size + 2, "klasik 'Pasif' filtresi +2 (yalnız kısıtlananlar)");

    // ── U) Kullanım Takibi ───────────────────────────────────────────────────
    console.log("\n[U] Kullanım Takibi");
    const ul = await get(u360List.GET, "/api/admin/expert-stats/usage360/experts?status=all&pageSize=100");
    const urows = (ul.json.data?.rows ?? []) as Record<string, any>[];
    const uB = urows.find((r) => r.userId === ids.proB), uA = urows.find((r) => r.userId === ids.proA);
    ok(ul.status === 200 && uB?.accessRestricted === true && uA?.accessRestricted === false, "uzman listesi: accessRestricted gösterim bayrağı", { st: ul.status, uB: uB?.accessRestricted });
    const today = new Date().toISOString().slice(0, 10);
    const ud = await get(u360Detail.GET, `/api/admin/expert-stats/usage360/detail?userId=${ids.proB}&from=${today}&to=${today}`);
    ok(ud.status === 200 && ud.json.data?.account?.accessRestricted === true, "uzman detayı: account.accessRestricted", { st: ud.status, err: ud.json.error });

    // ── G) F4-R1 Kullanım Takibi sayaçları ve süzgeçleri ───────────────────────
    console.log("\n[G] Kullanım Takibi — Genel Bakış ve süzgeç (F4-R1)");
    const ov1 = ovVals(await ov());
    const exp = (await su.query(`select
        count(*) filter (where active is true and access_restricted_at is null)::int active,
        count(*) filter (where active is true and access_restricted_at is not null)::int passive,
        count(*) filter (where active is false and archived_at is null)::int login_closed,
        count(*) filter (where archived_at is not null)::int archived,
        count(*)::int total
      from public.users where role='expert' and is_demo_account=false`)).rows[0];
    ok(ov1.active === exp.active && ov1.passive === exp.passive && ov1.loginClosed === exp.login_closed && ov1.archived === exp.archived && ov1.total === exp.total,
      "Genel Bakış: Aktif / Pasif / Giriş kapalı / Arşivde DB ile birebir", { ov1, exp });
    ok(ov1.active + ov1.passive + ov1.loginClosed + ov1.archived === ov1.total, "dört durum ayrık; toplamları = Toplam Uzman", ov1);
    ok(ov1.active === ov0.active - 2 && ov1.passive === ov0.passive + 2 && ov0.passive === 0 && ov1.loginClosed === ov0.loginClosed && ov1.archived === ov0.archived
      && ov1.total === ov0.total && ov1.pending === ov0.pending,
      "kısıt: Aktif −2, Pasif +2; Giriş kapalı / Arşivde / Toplam / Onay bekleyen AYNEN (pasif uzman aktif SAYILMAZ)", { ov0, ov1 });
    const sA = await ulist("active"), sP = await ulist("passive"), sL = await ulist("login_closed"), sR = await ulist("archive"), sAll = await ulist("all");
    ok(sA.has(ids.proA) && !sA.has(ids.proB) && !sA.has(ids.trialC) && !sA.has(ids.legacyD) && !sA.has(ids.archE), "süzgeç 'Aktif': yalnız kısıtsız aktif (pasif uzman YOK)");
    ok(sP.has(ids.proB) && sP.has(ids.trialC) && !sP.has(ids.proA) && !sP.has(ids.legacyD) && !sP.has(ids.archE), "süzgeç 'Pasif · modüller kilitli': yalnız kısıtlılar");
    ok(sL.has(ids.legacyD) && !sL.has(ids.archE) && !sL.has(ids.proB), "süzgeç 'Giriş kapalı': eski kapalı hesap; arşiv ve pasif YOK");
    ok(sR.has(ids.archE) && !sR.has(ids.legacyD), "süzgeç 'Arşivde': yalnız 4a arşivi (eski 'onaylı+pasif' tahmini değil)");
    ok(sA.size + sP.size + sL.size + sR.size === sAll.size, "dört süzgeç ayrık ve 'Tümü'nü tam kapsar", { a: sA.size, p: sP.size, l: sL.size, r: sR.size, all: sAll.size });
    const urowsAll = (((await get(u360List.GET, "/api/admin/expert-stats/usage360/experts?status=all&pageSize=100")).json.data?.rows ?? []) as Record<string, any>[]);
    ok(urowsAll.find((r) => r.userId === ids.archE)?.isArchived === true && urowsAll.find((r) => r.userId === ids.legacyD)?.isArchived === false,
      "satır arşiv bayrağı gerçek archived_at'tan (eski giriş kapalı hesap 'arşiv' görünmez)");
    const todayG = new Date().toISOString().slice(0, 10);
    const udL = await get(u360Detail.GET, `/api/admin/expert-stats/usage360/detail?userId=${ids.legacyD}&from=${todayG}&to=${todayG}`);
    ok(udL.status === 200 && udL.json.data?.account?.archived === false && udL.json.data?.account?.accessRestricted === false, "detay: account.archived / accessRestricted", udL.json.data?.account);
    ok(JSON.stringify(await usageHash()) === JSON.stringify(usage0), "geçmiş kullanım kayıtları (usage_daily) kısıt sonrası BİREBİR");

    // ── E) Etiketler ─────────────────────────────────────────────────────────
    console.log("\n[E] Etiketler");
    const { memberStageLabel } = await import("../../lib/admin/memberListV2");
    const now = Date.now();
    ok(memberStageLabel("pasif", { nowMs: now, restricted: true }).label === "Pasif · modüller kilitli"
      && memberStageLabel("pasif", { nowMs: now }).label === "Pasif · giriş kapalı" && memberStageLabel("pro", { nowMs: now, restricted: true }).label === "Pro",
      "V2 etiketi: kısıtlı → 'Pasif · modüller kilitli'; eski → 'Pasif · giriş kapalı' (aynen)");
    const { StatusPill } = await import("../../app/admin/kullanim-takibi/components/ui");
    const sp = (p: Record<string, unknown>) => renderToStaticMarkup(createElement(StatusPill as never, p as never));
    ok(sp({ active: true, approvalStatus: "approved", isArchived: false, accessRestricted: true }).includes("Pasif · modüller kilitli")
      && sp({ active: true, approvalStatus: "approved", isArchived: false }).includes(">Aktif<")
      && sp({ active: false, approvalStatus: "approved", isArchived: true, accessRestricted: true }).includes(">Arşivde<")
      && sp({ active: false, approvalStatus: "approved", isArchived: false }).includes(">Giriş kapalı<"),
      "Kullanım Takibi rozeti: kısıtlı 'Pasif · modüller kilitli'; active=false 'Giriş kapalı'; arşiv öncelikli 'Arşivde'");

    // ── R) Geri dönüş ────────────────────────────────────────────────────────
    console.log("\n[R] Kısıt kaldırılınca");
    await su.query(`select public.admin_set_member_access_restriction($1,$2,false,true)`, [ids.proB, OWNER]);
    await su.query(`select public.admin_set_member_access_restriction($1,$2,false,true)`, [ids.trialC, OWNER]);
    const b2 = await v2();
    ok(JSON.stringify(b2.json.presets) === JSON.stringify(b0.json.presets) && JSON.stringify(b2.json.counts) === JSON.stringify(b0.json.counts)
      && rowOf(b2.json, ids.proB)?.stage === "pro", "liste, filtre sayıları ve ticari sayaçlar ilk hâle BİREBİR döndü");
    ok(JSON.stringify(ovVals(await ov())) === JSON.stringify(ov0) && JSON.stringify(await usageHash()) === JSON.stringify(usage0),
      "Kullanım Takibi Genel Bakış ilk hâle BİREBİR döndü; kullanım kayıtları aynen");
  } finally {
    if (shim) await shim.close().catch(() => undefined);
    await db.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) console.log(failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
