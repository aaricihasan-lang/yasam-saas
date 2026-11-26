/**
 * ÜYE PASİFLEŞTİRME F2 — bağımsız erişim kısıtı ("Pasif") veritabanı altyapısı harness'ı.
 * Gerçek PostgreSQL (embedded) + gerçek migration zinciri (… → 4a → 4b → 20280126000000) + gerçek RPC'ler.
 * Production'a / ağa SIFIR temas; tüm hesaplar sentetik (ZZ_PSF2_*). Route / UI kodu YOK (F3+).
 *
 *   M  migration: ön koşul fail-closed (audit CHECK sürüklenmesi, 4a alanı yok) · 2× uygulama · DML yok · yetkiler
 *   S  member_account_state sınıflandırması (aktif / pasif / giris_kapali / arsiv)
 *   R  RPC: pasif yap / aktif yap · bayat istemci · idempotent · yalnız uzman · kendi hesabı · aktör yetkisi ·
 *      giriş kapalı hesap kısıtlanamaz · onaysız · arşivde (UY005) · null girdi · bulunamadı
 *   P  korunma: oturumlar iptal EDİLMEZ · active=true kalır · paket/deneme/modül/ödeme/onay aynen ·
 *      kısıt kalkınca satır pasif öncesiyle BİREBİR (ek yetki yok) · danışan / ödeme / audit satırı silinmez
 *   T  deneme: aktif / süresi dolmuş deneme kısıtlanır; deneme alanları ve pencere değişmez
 *   A  arşiv etkileşimi: pasif→arşiv (giriş kapalı + oturumlar biter) · arşivde kısıt değişmez (tetik UY005) ·
 *      arşivden çıkar → giris_kapali (kısıt korunur, fail-closed) · Aktif Yap → hâlâ pasif · kısıt kaldır → aktif
 *   K  CHECK: kısıtlı uzman rolü yönetici yapılamaz (23514)
 *   C  eşzamanlılık: çift pasif yap → tek değişiklik + tek audit · pasif ∥ arşiv tutarlı
 *   O  oturum geçerliliği: touch_active_session pasif uzmanda GEÇERLİ, giris_kapali/arşivde GEÇERSİZ
 *      (+ F2-A D-06 sürümü giriş güvenliği dalından okunabiliyorsa aynı kontrol)
 *   L  eski kayıtlar: salt-okunur rapor READ ONLY çalışır + bağımsız sayımla aynı · geçiş taslağı F3 bayrağı ve
 *      uygunluk kontrolleriyle fail-closed · onaylı kimlikte tek UPDATE ile giris_kapali → pasif
 *
 * Çalıştır: npx tsx scripts/uye-pasif-f2/uye-pasif-f2.harness.ts
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { startTestDb, type TestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";

let pass = 0;
let fail = 0;
const failures: string[] = [];
const notes: string[] = [];
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

const MIG = "20280126000000_member_access_restriction.sql";
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
const OWNER = "00000000-0000-4000-8000-00000000f2a1";
const ADMIN2 = "00000000-0000-4000-8000-00000000f2a2";
const ADMIN_OFF = "00000000-0000-4000-8000-00000000f2a3";
const EXPERT_ACTOR = "00000000-0000-4000-8000-00000000f2e1";
const D = 86_400_000;
const RPC = "select public.admin_set_member_access_restriction($1,$2,$3,$4) r";

type Q = { query: (sql: string, args?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };

async function errCode(c: Q, sql: string, args: unknown[] = []): Promise<string> {
  try { await c.query(sql, args); return "OK"; } catch (e) { return (e as { code?: string }).code ?? "?"; }
}

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

type Ex = { key: string; active?: boolean; approval?: string; trial?: "active" | "expired"; pkg?: string; demo?: boolean };

async function main(): Promise<void> {
  const port = await freePort();
  const db: TestDb = await startTestDb(port, `uye-pasif-f2-${port}`);
  const { su, pool } = db;
  try {
    for (const f of PRE) await su.query(readMig(f));

    const tenant = async () => {
      const id = randomUUID();
      await su.query(`insert into public.tenants(id, name, slug, status) values ($1,'ZZPSF2',$2,'active')`, [id, `zzpsf2-${id.slice(0, 12)}`]);
      return id;
    };
    for (const [id, role, sup, act] of [
      [OWNER, "admin", true, true], [ADMIN2, "admin", false, true], [ADMIN_OFF, "admin", false, false], [EXPERT_ACTOR, "expert", false, true],
    ] as [string, string, boolean, boolean][]) {
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id, created_at)
         values ($1,$2,$3,$4,$5,'approved',$6,$7,$8, now() - interval '400 days')`,
        [id, `ZZ_PSF2 ${role} ${id.slice(-2)}`, `zz.psf2.${id.slice(-2)}@example.test`, role, act, sup, sup ? "owner" : role === "admin" ? "admin" : null, await tenant()],
      );
    }

    const mk = async (e: Ex): Promise<string> => {
      const id = randomUUID();
      const now = Date.now();
      const trial = e.trial !== undefined;
      await su.query(
        `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, package_type, plan, trial_kind, trial_status,
            trial_started_at, trial_ends_at, payment_status, payment_note, module_permissions, tenant_id, is_demo_account, created_at)
         values ($1,$2,$3,'expert',$4,$5, now() - interval '20 days', $6,$7,$8,$9,$10,$11,'paid','zz not',$12,$13,$14, now() - interval '30 days')`,
        [id, `ZZ_PSF2 Uzman ${e.key}`, `zz.psf2.${e.key}@example.test`, e.active !== false, e.approval ?? "approved",
          trial ? "trial" : (e.pkg ?? "premium"), trial ? "trial" : (e.pkg ?? "premium"),
          trial ? "self_7d" : null, trial ? "active" : null,
          trial ? new Date(now - (e.trial === "expired" ? 9 : 2) * D) : null,
          trial ? new Date(now + (e.trial === "expired" ? -2 : 5) * D) : null,
          JSON.stringify({ clients: true, numerology: true, human_design: false }), await tenant(), e.demo === true],
      );
      await su.query(`insert into public.clients(tenant_id, full_name) select tenant_id, 'ZZ Danışan' from public.users where id=$1`, [id]);
      await su.query(`insert into public.user_payment_history(user_id, payment_status, paid_amount, payment_note) values ($1,'paid',1500,'zz')`, [id]);
      if (e.active !== false) {
        await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2),($1,$3)`,
          [id, `zz-psf2-${e.key}-a-${id.slice(0, 6)}`, `zz-psf2-${e.key}-b-${id.slice(0, 6)}`]);
      }
      return id;
    };

    const ids: Record<string, string> = {};
    for (const e of [
      { key: "pro" }, { key: "pro2" }, { key: "trial_act", trial: "active" }, { key: "trial_exp", trial: "expired" },
      { key: "legacy_off", active: false }, { key: "legacy_off2", active: false }, { key: "legacy_off3", active: false },
      { key: "pending", active: false, approval: "pending" }, { key: "demo_off", active: false, demo: true },
      { key: "arch" }, { key: "conc" }, { key: "race" }, { key: "role" }, { key: "cycle" },
    ] as Ex[]) ids[e.key] = await mk(e);

    // ── M) Migration ─────────────────────────────────────────────────────────
    console.log("\n[M] Migration: ön koşul · tekrar · mevcut veri · yetki");
    const snap = async () => (await su.query(`select
        (select md5(string_agg((to_jsonb(u) - 'access_restricted_at')::text, '|' order by id)) from public.users u) u,
        (select md5(string_agg(a::text, '|' order by id)) from public.admin_audit_log a) a,
        (select md5(string_agg(s::text, '|' order by id)) from public.user_sessions s) s,
        (select md5(string_agg(h::text, '|' order by id)) from public.user_payment_history h) h,
        (select count(*)::int from public.clients) c`)).rows[0];
    const s0 = await snap();

    // Ön koşul 1: audit CHECK sürüklenmiş (bilinmeyen eylem) → hiçbir şey uygulanmaz.
    {
      const c = await pool.connect();
      let e1 = "";
      try {
        await c.query("begin");
        await c.query(`alter table public.admin_audit_log drop constraint admin_audit_action_chk`);
        await c.query(`alter table public.admin_audit_log add constraint admin_audit_action_chk check (action in ('user_created','zz_baska_eylem'))`);
        await c.query(readMig(MIG));
      } catch (e) { e1 = (e as Error).message; }
      await c.query("rollback").catch(() => undefined);
      const col = (await c.query(`select count(*)::int n from information_schema.columns where table_name='users' and column_name='access_restricted_at'`)).rows[0].n;
      c.release();
      ok(/admin_audit_action_chk beklenenden farkli/.test(e1) && col === 0, "ön koşul: audit CHECK sürüklenmişse migration fail-closed (kolon eklenmez)", { e1, col });
    }
    // Ön koşul 2: 4a arşiv alanı yok → hiçbir şey uygulanmaz.
    {
      const c = await pool.connect();
      let e2 = "";
      try {
        await c.query("begin");
        await c.query(`alter table public.users rename column archived_at to zz_archived_at`);
        await c.query(readMig(MIG));
      } catch (e) { e2 = (e as Error).message; }
      await c.query("rollback").catch(() => undefined);
      c.release();
      ok(/4a arsiv alani/.test(e2), "ön koşul: users.archived_at yoksa migration fail-closed", { e2 });
    }

    // PSF2_EXECUTOR=limited → Supabase benzeri yürütücü (db-privileges-drift-check D4 emsali): süper kullanıcı DEĞİL,
    // `postgres` üyesi. Migration bu rolle uygulanır; aşağıdaki TÜM testler o koşulda doğrulanır. Varsayılan: süper kullanıcı.
    if (process.env.PSF2_EXECUTOR === "limited") {
      await su.query(`create role mig_limited login password 'pw' nosuperuser; grant postgres to mig_limited;`);
      const lim = new pg.Client({ host: "127.0.0.1", port, user: "mig_limited", password: "pw", database: "postgres" });
      await lim.connect();
      try {
        const who = (await lim.query(`select current_user u, (select rolsuper from pg_roles where rolname = current_user) s`)).rows[0];
        await lim.query(readMig(MIG));
        await lim.query(readMig(MIG));
        const own = (await su.query(`select pg_get_userbyid(proowner) o from pg_proc where proname = 'admin_set_member_access_restriction'`)).rows[0].o;
        ok(who.u === "mig_limited" && who.s === false && own === "mig_limited",
          "[X] Supabase benzeri yürütücü (süper kullanıcı DEĞİL, postgres üyesi): migration 2× hatasız; fonksiyon sahibi yürütücü", { who, own });
      } finally {
        await lim.end();
      }
    } else if (process.env.PSF2_EXECUTOR === "supabase") {
      // Supabase rol düzenine en yakın yerel taklit: `postgres` rolünün öznitelikleri (NOSUPERUSER CREATEDB CREATEROLE
      // BYPASSRLS REPLICATION); public nesnelerin SAHİBİ bu rol; süper kullanıcıya ÜYE DEĞİL. (Gerçek supabase/postgres
      // imajı DEĞİLDİR — o doğrulama Docker / CI gerektirir.)
      await su.query(`create role supa_postgres login password 'pw' nosuperuser createdb createrole bypassrls replication;
        grant usage, create on schema public to supa_postgres;
        do $own$ declare r record; begin
          for r in select c.oid::regclass t from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind in ('r','p','v','m','f') loop
            execute format('alter table %s owner to supa_postgres', r.t);
          end loop;
          -- Tabloya bağlı (serial / identity) diziler tablo sahibiyle birlikte taşınır; yalnız BAĞIMSIZ diziler ayrıca.
          for r in select c.oid::regclass t from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'S'
                      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype in ('a','i')) loop
            execute format('alter sequence %s owner to supa_postgres', r.t);
          end loop;
          for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.prokind in ('f','p') loop
            execute format('alter routine %s owner to supa_postgres', r.f);
          end loop;
        end $own$;`);
      const sb = new pg.Client({ host: "127.0.0.1", port, user: "supa_postgres", password: "pw", database: "postgres" });
      await sb.connect();
      try {
        const who = (await sb.query(`select current_user u, r.rolsuper s, r.rolcreaterole cr, r.rolbypassrls b,
            pg_has_role(current_user, 'postgres', 'MEMBER') m from pg_roles r where r.rolname = current_user`)).rows[0];
        await sb.query(readMig(MIG));
        await sb.query(readMig(MIG));
        const own = (await su.query(`select pg_get_userbyid(proowner) o from pg_proc where proname = 'admin_set_member_access_restriction'`)).rows[0].o;
        ok(who.u === "supa_postgres" && who.s === false && who.m === false && who.cr === true && who.b === true && own === "supa_postgres",
          "[X] Supabase rol düzeni taklidi (NOSUPERUSER + CREATEROLE + BYPASSRLS, nesne sahibi, süper kullanıcı üyeliği YOK): migration 2× hatasız", { who, own });
      } finally {
        await sb.end();
      }
    } else {
      await su.query(readMig(MIG));
      await su.query(readMig(MIG));
    }
    const s1 = await snap();
    ok(JSON.stringify(s0) === JSON.stringify(s1), "migration 2× uygulandı; users (yeni kolon hariç) / audit / oturum / ödeme / danışan DEĞİŞMEDİ", { s0, s1 });
    const nonNull = (await su.query(`select count(*)::int n from public.users where access_restricted_at is not null`)).rows[0].n;
    ok(nonNull === 0, "backfill YOK: hiçbir mevcut hesap kendiliğinden pasif olmadı", { nonNull });
    const legacyStill = (await su.query(`select bool_and(active is not true) b from public.users where id = any($1)`,
      [[ids.legacy_off, ids.legacy_off2, ids.legacy_off3, ids.pending]])).rows[0].b;
    ok(legacyStill === true, "mevcut girişi kapalı hesapların girişi kendiliğinden AÇILMADI");

    const priv = (await su.query(`select
        has_function_privilege('anon','public.admin_set_member_access_restriction(uuid,uuid,boolean,boolean)','EXECUTE') a1,
        has_function_privilege('authenticated','public.admin_set_member_access_restriction(uuid,uuid,boolean,boolean)','EXECUTE') a2,
        has_function_privilege('service_role','public.admin_set_member_access_restriction(uuid,uuid,boolean,boolean)','EXECUTE') a3,
        has_function_privilege('anon','public.member_account_state(boolean,timestamptz,timestamptz)','EXECUTE') b1,
        has_function_privilege('authenticated','public.member_account_state(boolean,timestamptz,timestamptz)','EXECUTE') b2,
        has_function_privilege('anon','public.member_access_restriction_archived_guard_trg()','EXECUTE') t1,
        (select prosecdef from pg_proc where proname='admin_set_member_access_restriction') sd,
        (select proconfig::text from pg_proc where proname='admin_set_member_access_restriction') cfg`)).rows[0];
    ok(!priv.a1 && !priv.a2 && priv.a3 && !priv.b1 && !priv.b2 && !priv.t1 && priv.sd && /search_path=public, pg_catalog/.test(priv.cfg),
      "EXECUTE yalnız service_role; RPC SECURITY DEFINER + sabit search_path", priv);
    // Supabase güvenlik manifesti: gerçek drift aracı (manifest.sql → compare.mjs) sentetik DB'de.
    {
      await su.query(`create table if not exists storage.buckets (id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[])`);
      const manifestSql = readFileSync(path.join(process.cwd(), "scripts/final-hardening/drift/manifest.sql"), "utf8");
      const { compareManifest } = (await import(pathToFileURL(path.join(process.cwd(), "scripts/final-hardening/drift/compare.mjs")).href)) as
        { compareManifest: (a: unknown, e: unknown) => { fails: string[]; warnings: string[] } };
      const full = JSON.parse(readFileSync(path.join(process.cwd(), "supabase/expected-manifest.json"), "utf8"));
      const NEW_FNS = ["admin_set_member_access_restriction", "member_account_state", "member_access_restriction_archived_guard_trg"];
      ok(NEW_FNS.every((n) => full.functions_no_client_execute.names.includes(n) && full.functions_no_client_execute.optional.includes(n)),
        "expected-manifest: 3 yeni fonksiyon functions_no_client_execute (names + optional) listesinde");
      const expected = { functions_no_client_execute: { names: NEW_FNS, optional: [] } };
      const actual = (await su.query(manifestSql)).rows;
      const r = compareManifest(actual, expected);
      ok(r.fails.length === 0, "drift compare (gerçek manifest.sql çıktısı): yeni fonksiyonlarda anon/authenticated EXECUTE YOK", r.fails);
      const c = await pool.connect();
      let neg: { fails: string[] } = { fails: [] };
      try {
        await c.query("begin");
        await c.query(`grant execute on function public.admin_set_member_access_restriction(uuid,uuid,boolean,boolean) to anon`);
        neg = compareManifest((await c.query(manifestSql)).rows, expected);
      } finally {
        await c.query("rollback").catch(() => undefined);
        c.release();
      }
      ok(neg.fails.some((f) => f.includes("admin_set_member_access_restriction") && f.includes("anon")),
        "drift compare negatif kontrol: anon EXECUTE verilirse FAIL üretir (işlem geri alındı)", neg.fails);
    }
    const chk = (await su.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname='admin_audit_action_chk'`)).rows[0].d as string;
    const acts = [...chk.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    ok(acts.length === 35 && acts.includes("user_access_restricted") && acts.includes("user_access_unrestricted") && acts.includes("user_unarchived"),
      "audit CHECK süperset: mevcut 33 eylem korunur + 2 yeni eylem", { n: acts.length });

    // ── S) Durum sınıflandırması ─────────────────────────────────────────────
    console.log("\n[S] member_account_state");
    const st = (await su.query(`select
        public.member_account_state(true, null, null) a,
        public.member_account_state(true, null, now()) p,
        public.member_account_state(false, null, null) g,
        public.member_account_state(false, null, now()) g2,
        public.member_account_state(null, null, null) g3,
        public.member_account_state(false, now(), null) r,
        public.member_account_state(false, now(), now()) r2`)).rows[0];
    ok(st.a === "aktif" && st.p === "pasif" && st.g === "giris_kapali" && st.g2 === "giris_kapali" && st.g3 === "giris_kapali"
      && st.r === "arsiv" && st.r2 === "arsiv", "aktif / pasif / giris_kapali / arsiv (arşiv ve giriş kapalı, kısıttan ÖNCE gelir)", st);

    const row = async (id: string) => (await su.query(`select to_jsonb(u) j from public.users u where id=$1`, [id])).rows[0].j as Record<string, unknown>;
    const strip = (j: Record<string, unknown>) => { const c = { ...j }; delete c.access_restricted_at; return c; };
    const sessions = async (id: string) => (await su.query(
      `select count(*) filter (where is_active)::int a, count(*)::int t, md5(string_agg(s::text,'|' order by id)) h from public.user_sessions s where user_id=$1`, [id])).rows[0];
    const audits = async (id: string, action?: string) => (await su.query(
      `select count(*)::int n from public.admin_audit_log where target_user_id=$1 and ($2::text is null or action=$2)`, [id, action ?? null])).rows[0].n as number;
    const state = async (id: string) => (await su.query(
      `select public.member_account_state(active, archived_at, access_restricted_at) s from public.users where id=$1`, [id])).rows[0].s as string;

    // ── R/P) RPC davranışı + korunma ─────────────────────────────────────────
    console.log("\n[R/P] Pasif Yap / Aktif Yap");
    const before = await row(ids.pro);
    const sesBefore = await sessions(ids.pro);
    const r1 = (await su.query(RPC, [ids.pro, ADMIN2, true, false])).rows[0].r;
    const afterR = await row(ids.pro);
    ok(r1.ok === true && r1.changed === true && r1.restricted === true && afterR.access_restricted_at !== null, "pasif yap: kısıt yazıldı", r1);
    ok(afterR.active === true && (await state(ids.pro)) === "pasif", "pasif yap: active=true KALIR (giriş açık), durum = pasif");
    ok(JSON.stringify(strip(afterR)) === JSON.stringify(strip(before)), "pasif yap: paket / deneme / modül / ödeme / onay / rol alanları AYNEN");
    const sesAfter = await sessions(ids.pro);
    ok(sesAfter.a === 2 && sesAfter.h === sesBefore.h, "pasif yap: oturumlar İPTAL EDİLMEDİ (satırlar birebir)", { sesBefore, sesAfter });
    const au = (await su.query(`select actor_admin_id, actor_is_main_admin, old_value, new_value from public.admin_audit_log
        where target_user_id=$1 and action='user_access_restricted'`, [ids.pro])).rows;
    ok(au.length === 1 && au[0].actor_admin_id === ADMIN2 && au[0].actor_is_main_admin === false
      && au[0].old_value.access_restricted === false && au[0].new_value.access_restricted === true && au[0].new_value.active === true,
      "pasif yap: aynı işlemde TEK audit (aktör, eski/yeni değer)", au);

    const rIdem = (await su.query(RPC, [ids.pro, ADMIN2, true, true])).rows[0].r;
    ok(rIdem.changed === false && (await audits(ids.pro, "user_access_restricted")) === 1, "aynı duruma tekrar istek: idempotent, audit yazılmaz", rIdem);
    const stale = await errCode(su, RPC, [ids.pro, ADMIN2, true, false]);
    const stale2 = await errCode(su, RPC, [ids.pro, ADMIN2, false, false]);
    ok(stale === "UY001" && stale2 === "UY001" && JSON.stringify(await row(ids.pro)) === JSON.stringify(afterR), "bayat istemci → UY001, satır değişmez", { stale, stale2 });

    const r2 = (await su.query(RPC, [ids.pro, OWNER, false, true])).rows[0].r;
    const afterU = await row(ids.pro);
    ok(r2.changed === true && afterU.access_restricted_at === null && (await state(ids.pro)) === "aktif", "aktif yap: kısıt kaldırıldı, durum = aktif", r2);
    ok(JSON.stringify(afterU) === JSON.stringify(before), "aktif yap: satır pasif ÖNCESİYLE BİREBİR — önceki meşru yetkiler döner, ek yetki YOK");
    ok((await audits(ids.pro, "user_access_unrestricted")) === 1 && (await sessions(ids.pro)).h === sesBefore.h, "aktif yap: tek audit; oturumlar dokunulmadı");

    console.log("\n[R] Ret kuralları");
    const snapAll = async () => (await su.query(`select md5(string_agg(to_jsonb(u)::text,'|' order by id)) u,
        (select count(*)::int from public.admin_audit_log) a from public.users u`)).rows[0];
    const sR = await snapAll();
    const codes = {
      nullArg: await errCode(su, RPC, [ids.pro2, ADMIN2, null, false]),
      nullExp: await errCode(su, RPC, [ids.pro2, ADMIN2, true, null]),
      self: await errCode(su, RPC, [ADMIN2, ADMIN2, true, false]),
      notFound: await errCode(su, RPC, [randomUUID(), ADMIN2, true, false]),
      expertActor: await errCode(su, RPC, [ids.pro2, EXPERT_ACTOR, true, false]),
      inactiveAdmin: await errCode(su, RPC, [ids.pro2, ADMIN_OFF, true, false]),
      unknownActor: await errCode(su, RPC, [ids.pro2, randomUUID(), true, false]),
      adminTarget: await errCode(su, RPC, [ADMIN2, OWNER, true, false]),
      ownerTarget: await errCode(su, RPC, [OWNER, ADMIN2, true, false]),
      legacyOff: await errCode(su, RPC, [ids.legacy_off, OWNER, true, false]),
      pending: await errCode(su, RPC, [ids.pending, OWNER, true, false]),
    };
    ok(codes.nullArg === "UY003" && codes.nullExp === "UY003" && codes.self === "UY003" && codes.notFound === "UY003", "geçersiz girdi / kendi hesabı / bulunamadı → UY003", codes);
    ok(codes.expertActor === "42501" && codes.inactiveAdmin === "42501" && codes.unknownActor === "42501", "aktör aktif yönetici değilse → 42501", codes);
    ok(codes.adminTarget === "UY002" && codes.ownerTarget === "UY002", "yönetici / owner hedef → UY002 (yalnız uzman kısıtlanır)", codes);
    ok(codes.legacyOff === "UY002" && codes.pending === "UY002", "girişi kapalı (eski pasif) / onay bekleyen hesap kısıtlanamaz → UY002 (girişi açılmaz)", codes);
    ok(JSON.stringify(await snapAll()) === JSON.stringify(sR), "reddedilen hiçbir istekte satır veya audit değişmedi");

    // ── T) Deneme ────────────────────────────────────────────────────────────
    console.log("\n[T] Deneme süresi politikası değişmez");
    for (const k of ["trial_act", "trial_exp"]) {
      const b = await row(ids[k]);
      await su.query(RPC, [ids[k], ADMIN2, true, false]);
      const a = await row(ids[k]);
      ok(a.trial_kind === "self_7d" && a.trial_status === b.trial_status && a.trial_started_at === b.trial_started_at
        && a.trial_ends_at === b.trial_ends_at && a.package_type === b.package_type && (await state(ids[k])) === "pasif",
        `${k}: pasif yapıldı; deneme türü / durumu / pencere (başlangıç-bitiş) DEĞİŞMEDİ`);
      await su.query(RPC, [ids[k], ADMIN2, false, true]);
      ok(JSON.stringify(await row(ids[k])) === JSON.stringify(b), `${k}: aktif yap → satır birebir (deneme uzatılmadı / sıfırlanmadı)`);
    }

    // ── A) Arşiv etkileşimi ──────────────────────────────────────────────────
    console.log("\n[A] Arşiv etkileşimi (4a mekanizması korunur)");
    await su.query(RPC, [ids.arch, ADMIN2, true, false]);
    const archRes = (await su.query(`select public.admin_archive_user($1,$2) r`, [ids.arch, OWNER])).rows[0].r;
    const ar = await row(ids.arch);
    const arSes = await sessions(ids.arch);
    ok(archRes.ok === true && ar.active === false && ar.archived_at !== null && arSes.a === 0 && arSes.t === 2 && (await state(ids.arch)) === "arsiv",
      "pasif → Pasife Al ve Arşivle: giriş kapandı, TÜM oturumlar sonlandı (satırlar silinmedi), durum = arşiv", { archRes, arSes });
    const archRpc = await errCode(su, RPC, [ids.arch, OWNER, false, true]);
    const archRpc2 = await errCode(su, RPC, [ids.arch, OWNER, true, true]);
    const archDirect = await errCode(su, `update public.users set access_restricted_at = null where id=$1`, [ids.arch]);
    const archOther = await errCode(su, `update public.users set full_name = 'ZZ_PSF2 Ad Değişti' where id=$1`, [ids.arch]);
    ok(archRpc === "UY005" && archRpc2 === "UY005" && archDirect === "UY005", "arşivde: kısıt RPC ile de doğrudan UPDATE ile de değişmez (UY005)", { archRpc, archRpc2, archDirect });
    ok(archOther === "OK", "arşivde: ad değişikliği gibi izinli alanlar etkilenmedi (4a sözleşmesi)", { archOther });
    const un = (await su.query(`select public.admin_unarchive_user($1,$2) r`, [ids.arch, OWNER])).rows[0].r;
    ok(un.ok === true && (await state(ids.arch)) === "giris_kapali" && (await row(ids.arch)).access_restricted_at !== null,
      "arşivden çıkar → giris_kapali; kısıt KORUNUR (fail-closed)", un);
    await su.query(`select public.admin_set_user_active($1,$2,true,false)`, [ids.arch, OWNER]);
    ok((await state(ids.arch)) === "pasif", "ardından mevcut 'Aktif Yap' (active=true) → hâlâ PASİF: kısıt kendiliğinden kalkmaz");
    await su.query(RPC, [ids.arch, OWNER, false, true]);
    ok((await state(ids.arch)) === "aktif", "kısıt ayrıca kaldırılınca → aktif");
    // Kısıtı kaldırmak giriş kapalı hesabı AÇMAZ.
    await su.query(RPC, [ids.cycle, ADMIN2, true, false]);
    await su.query(`select public.admin_set_user_active($1,$2,false,true)`, [ids.cycle, OWNER]);
    ok((await state(ids.cycle)) === "giris_kapali", "pasif hesap mevcut sert kapatmayla (active=false) → giris_kapali");
    await su.query(RPC, [ids.cycle, ADMIN2, false, true]);
    const cy = await row(ids.cycle);
    ok(cy.active === false && (await state(ids.cycle)) === "giris_kapali", "giris_kapali hesapta kısıtı kaldırmak girişi AÇMAZ (ek yetki yok)");

    // ── K) CHECK ─────────────────────────────────────────────────────────────
    console.log("\n[K] Değişmez");
    await su.query(RPC, [ids.role, ADMIN2, true, false]);
    const roleUp = await errCode(su, `update public.users set role='admin' where id=$1`, [ids.role]);
    const adminDirect = await errCode(su, `update public.users set access_restricted_at = now() where id=$1`, [ADMIN2]);
    ok(roleUp === "23514" && adminDirect === "23514", "kısıtlı uzman yönetici yapılamaz; yönetici satırına kısıt yazılamaz (CHECK 23514)", { roleUp, adminDirect });

    // ── C) Eşzamanlılık ──────────────────────────────────────────────────────
    console.log("\n[C] Eşzamanlılık");
    {
      const [c1, c2] = [await pool.connect(), await pool.connect()];
      try {
        await c1.query("begin");
        await c1.query(RPC, [ids.conc, ADMIN2, true, false]); // satır kilidi c1'de
        const p2 = errCode(c2 as unknown as Q, RPC, [ids.conc, OWNER, true, false]);
        await new Promise((r) => setTimeout(r, 300));
        await c1.query("commit");
        const second = await p2;
        ok(second === "UY001" && (await audits(ids.conc, "user_access_restricted")) === 1,
          "çift 'Pasif Yap' (aynı bayat görünüm): ikinci kilit sonrası UY001; tek değişiklik + tek audit", { second });
      } finally { c1.release(); c2.release(); }
    }
    {
      const [c1, c2] = [await pool.connect(), await pool.connect()];
      try {
        const res = await Promise.all([
          errCode(c1 as unknown as Q, RPC, [ids.race, ADMIN2, true, false]),
          errCode(c2 as unknown as Q, `select public.admin_archive_user($1,$2)`, [ids.race, OWNER]),
        ]);
        const fin = await row(ids.race);
        const s = await state(ids.race);
        ok(s === "arsiv" && fin.active === false && ["OK", "UY005"].includes(res[0]) && res[1] === "OK"
          && (await sessions(ids.race)).a === 0, "pasif ∥ arşiv: son durum arşiv, giriş kapalı, oturumlar bitti; hata yalnız UY005", { res, s });
      } finally { c1.release(); c2.release(); }
    }

    // ── O) Oturum geçerliliği (giriş güvenliği çekirdeği değişmedi) ──────────
    console.log("\n[O] Oturum geçerliliği");
    await su.query(RPC, [ids.pro2, ADMIN2, true, false]);
    const tok = (await su.query(`select session_token t from public.user_sessions where user_id=$1 and is_active limit 1`, [ids.pro2])).rows[0].t;
    const touch = async (t: string) => (await su.query(`select public.touch_active_session($1, 0, 86400, true) r`, [t])).rows[0].r;
    const tp = await touch(tok);
    ok(tp !== null && String(tp) !== "", "pasif uzmanın mevcut oturumu GEÇERLİ kalır (touch_active_session)", { tp });
    const archTok = (await su.query(`select session_token t from public.user_sessions where user_id=$1 limit 1`, [ids.arch])).rows[0].t;
    ok((await touch(archTok)) === null, "arşivlenmiş hesabın sonlanmış oturumu GEÇERSİZ");
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,'zz-psf2-legacy-yetim')`, [ids.legacy_off]);
    notes.push(`O: mevcut zincirdeki touch_active_session (20270129000200) users.active'e bakmaz; giris_kapali hesap için oturum sonlandırma admin_revoke_user_sessions_tx + verifyUserRequest(.eq active) ile sağlanır (F2-A D-06 bunu DB'ye taşır).`);
    // F2-A D-06 (giriş güvenliği dalı) — dal yerelde varsa aynı kontrol.
    let f2aSql = "";
    try {
      f2aSql = execFileSync("git", ["show", "origin/work/giris-guvenligi-f2-yayin:supabase/migrations/20280103000000_auth_session_hardening_f2a.sql"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch { /* dal yok */ }
    if (f2aSql) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query(readMig("20271003200000_session_model_v2.sql"));
        await c.query(f2aSql.replace(/^\s*BEGIN;\s*$/m, "").replace(/^\s*COMMIT;\s*$/m, ""));
        const tp2 = (await c.query(`select public.touch_active_session($1, 0, 86400, true) r`, [tok])).rows[0].r;
        const tl = (await c.query(`select public.touch_active_session('zz-psf2-legacy-yetim', 0, 86400, true) r`)).rows[0].r;
        ok(tp2 !== null && tl === null, "F2-A D-06 ile: pasif uzman oturumu GEÇERLİ, giris_kapali hesabın oturumu GEÇERSİZ (çakışma yok)", { tp2, tl });
      } catch (e) {
        notes.push(`O/F2-A: D-06 sentetik şemada kurulamadı → NOT TESTED (${String((e as Error).message).slice(0, 160)})`);
      } finally {
        await c.query("rollback").catch(() => undefined);
        c.release();
      }
    } else {
      notes.push("O/F2-A: giriş güvenliği dalı okunamadı → D-06 kontrolü NOT TESTED");
    }

    // ── L) Eski kayıtlar ─────────────────────────────────────────────────────
    console.log("\n[L] Eski girişi kapalı hesaplar");
    const roSql = readFileSync(path.join(process.cwd(), "scripts/uye-pasif-f2/legacy-passive-readonly.sql"), "utf8");
    const sL0 = await snapAll();
    const roRes = (await su.query(roSql)) as unknown as { rows: Record<string, any>[] }[];
    const dist = roRes.find((r) => r.rows?.[0] && "durum" in r.rows[0])?.rows ?? [];
    const cand = roRes.find((r) => r.rows?.[0] && "pasife_alinma" in r.rows[0])?.rows ?? [];
    const indep = (await su.query(`select id from public.users where role='expert' and approval_status='approved' and active is not true
        and archived_at is null and is_demo_account = false order by id`)).rows.map((r) => r.id);
    ok(JSON.stringify(cand.map((r) => r.id).sort()) === JSON.stringify(indep.sort()) && dist.length > 0,
      "salt-okunur rapor: aday listesi bağımsız sayımla aynı (demo / onaysız / arşiv hariç)", { cand: cand.length, indep: indep.length });
    ok(!cand.some((r) => "email" in r || "full_name" in r || "name" in r), "salt-okunur rapor kişisel veri (ad / e-posta) döndürmez");
    ok(JSON.stringify(await snapAll()) === JSON.stringify(sL0), "salt-okunur rapor hiçbir satırı değiştirmedi");
    const roWrite = await errCode(su, roSql.replace("ROLLBACK;", "update public.users set full_name = full_name; ROLLBACK;"));
    await su.query("rollback").catch(() => undefined); // yazma denemesi işlemi iptal etti → kapat
    ok(roWrite === "25006", "rapor READ ONLY işlemde çalışır (yazma denemesi 25006)", { roWrite });

    const conv = readFileSync(path.join(process.cwd(), "scripts/uye-pasif-f2/legacy-passive-convert.DRAFT.sql"), "utf8");
    const fill = (actor: string | null, list: string[], f3: boolean, end: "ROLLBACK" | "COMMIT") => conv
      .replace("v_actor   uuid   := NULL;", `v_actor uuid := ${actor ? `'${actor}'` : "NULL"};`)
      .replace("v_ids     uuid[] := ARRAY[]::uuid[];", `v_ids uuid[] := ARRAY[${list.map((x) => `'${x}'`).join(",")}]::uuid[];`)
      .replace("v_f3_live boolean := false;", `v_f3_live boolean := ${f3};`)
      .replace(/^ROLLBACK;.*$/m, `${end};`);
    const runConv = async (sql: string) => {
      const c = await pool.connect();
      try { await c.query(sql); return "OK"; } catch (e) { await c.query("rollback").catch(() => undefined); return (e as Error).message; } finally { c.release(); }
    };
    ok(!/v_f3_live boolean := false;/.test(fill(OWNER, [ids.legacy_off], true, "COMMIT")) && /^ROLLBACK;/m.test(conv), "taslak: varsayılan son satır ROLLBACK; yer tutucular doldurulabilir");
    const sC0 = await snapAll();
    const e1 = await runConv(fill(OWNER, [ids.legacy_off], false, "COMMIT"));
    const e2 = await runConv(fill(OWNER, [], true, "COMMIT"));
    const e3 = await runConv(fill(ADMIN2, [ids.legacy_off], true, "COMMIT"));
    const e4 = await runConv(fill(OWNER, [ids.legacy_off, ids.pending], true, "COMMIT"));
    const e5 = await runConv(fill(OWNER, [ids.legacy_off, ids.demo_off], true, "COMMIT"));
    const e6 = await runConv(fill(OWNER, [ids.legacy_off, ids.arch], true, "COMMIT"));
    const e7 = await runConv(fill(OWNER, [ids.legacy_off, ids.pro2], true, "COMMIT"));
    ok(/F3 kodu/.test(e1) && /en az bir/.test(e2) && /ana yonetici/.test(e3), "taslak fail-closed: F3 bayrağı yok / boş liste / ana yönetici değil", { e1, e2, e3 });
    ok([e4, e5, e6, e7].every((e) => /uygun degil/.test(e)), "taslak: listede tek uygunsuz kimlik (onaysız / demo / arşiv / zaten açık) → hiçbir satır değişmez", { e4, e5, e6, e7 });
    const eRb = await runConv(fill(OWNER, [ids.legacy_off], true, "ROLLBACK"));
    ok(eRb === "OK" && JSON.stringify(await snapAll()) === JSON.stringify(sC0), "taslak ROLLBACK ile çalıştırıldı: veri değişmedi");
    const bL = await row(ids.legacy_off);
    const eOk = await runConv(fill(OWNER, [ids.legacy_off], true, "COMMIT"));
    const aL = await row(ids.legacy_off);
    const { active: _a1, access_restricted_at: _r1, ...restB } = bL;
    const { active: _a2, access_restricted_at: _r2, ...restA } = aL;
    ok(eOk === "OK" && (await state(ids.legacy_off)) === "pasif" && JSON.stringify(restA) === JSON.stringify(restB),
      "onaylı kimlik: giris_kapali → pasif (tek UPDATE); diğer tüm alanlar aynen", { eOk });
    ok((await audits(ids.legacy_off, "user_access_restricted")) === 1 && (await state(ids.legacy_off2)) === "giris_kapali" && (await state(ids.legacy_off3)) === "giris_kapali",
      "geçiş: tek audit; listede olmayan eski hesaplara DOKUNULMADI");

    // ── Silme yok ────────────────────────────────────────────────────────────
    const fin = await snap();
    ok(fin.c === s0.c && (await su.query(`select count(*)::int n from public.user_payment_history`)).rows[0].n === Object.keys(ids).length,
      "hiçbir danışan / ödeme geçmişi satırı silinmedi", { clients: fin.c });
  } finally {
    await db.stop();
  }

  console.log(`\nNOTLAR:\n${notes.map((n) => `  - ${n}`).join("\n") || "  (yok)"}`);
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    console.error(failures.map((f) => `  ✗ ${f}`).join("\n"));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
