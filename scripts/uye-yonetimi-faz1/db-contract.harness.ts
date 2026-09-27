/**
 * ÜYE YÖNETİMİ FAZ 1 — GERÇEK PostgreSQL RPC sözleşmesi: yetki, atomik rollback, eşzamanlılık.
 * Ephemeral embedded-postgres (127.0.0.1) — production'a SIFIR temas, sentetik veri.
 *
 * Çalıştır: npx tsx scripts/uye-yonetimi-faz1/db-contract.harness.ts
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

process.env.LC_ALL = "C";
process.env.LANG = "C";
const DATA_DIR = path.join(os.tmpdir(), "uye-yonetimi-faz1-dbcontract");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* temiz */ }
const PORT = 54342, PW = "testpw";
const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

let pass = 0, fail = 0;
const ok = (c: boolean, l: string) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); } };
const conn = () => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });

const DDL = `
create table public.users (
  id uuid primary key, full_name text, email text, role text,
  active boolean default false, approval_status text default 'pending', approved_at timestamptz,
  module_permissions jsonb default '{}'::jsonb,
  package_type text, membership_status text, subscription_status text,
  trial_started_at timestamptz, trial_ends_at timestamptz, membership_started_at timestamptz, membership_ends_at timestamptz,
  plan text, tenant_id uuid, is_super_admin boolean not null default false, is_demo_account boolean not null default false
);
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, session_token text not null unique,
  is_active boolean not null default true, created_at timestamptz default now(), last_seen_at timestamptz default now(),
  ended_at timestamptz, end_reason text, platform text
);
create table public.yasam_hafizasi_flags (tenant_id uuid primary key, yh_enabled boolean default false, yh_hizli boolean default false, yh_shared boolean default false);`;

const ACTOR = "00000000-0000-4000-8000-0000000000a1";
const MEMBERSHIP = { package_type: "premium", membership_status: "active", membership_started_at: new Date().toISOString(), membership_ends_at: null, trial_started_at: null, trial_ends_at: null, plan: "premium", subscription_status: "active" };
const FULL = (sel: string[]) => {
  const keys = ["clients", "numerology", "stones", "human_design", "cosmic_calendar", "cupping"];
  return Object.fromEntries(keys.map((k) => [k, sel.includes(k)]));
};

async function main(): Promise<void> {
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise();
  await epg.start();
  const su = conn();
  await su.connect();
  try {
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
                    grant usage on schema public to anon, authenticated, service_role;`);
    await su.query(DDL);
    await su.query(readMig("20260903000000_admin_audit_log.sql"));
    await su.query(readMig("20261221000000_yh_grade_expert_premium_rpc.sql"));
    await su.query(readMig("20270107000000_admin_membership_atomic_rpcs.sql"));
    await su.query(readMig("20270128000000_admin_member_phase1_hardening.sql"));
    // İdempotency: migration iki kez uygulanabilir olmalı.
    let reapplyErr: string | null = null;
    try { await su.query(readMig("20270128000000_admin_member_phase1_hardening.sql")); } catch (e) { reapplyErr = (e as Error).message; }
    ok(reapplyErr === null, "migration idempotent (ikinci uygulama hatasız)");
    await su.query(`grant select, insert, update on public.users, public.user_sessions, public.yasam_hafizasi_flags to service_role;`);
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id)
                    values ($1,'ZZ_MEMBER_PHASE1_DB_OWNER','zz.db.owner@example.test','admin',true,'approved',true,$2)`, [ACTOR, randomUUID()]);

    const callAs = async (role: string, sql: string, params: unknown[]) => {
      const c = conn(); await c.connect();
      try { await c.query(`set role ${role}`); return await c.query(sql, params); } finally { await c.end(); }
    };
    const seed = async (o: { approval?: string; active?: boolean; perms?: Record<string, unknown>; role?: string }) => {
      const id = randomUUID();
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, tenant_id)
                      values ($1,'ZZ_MEMBER_PHASE1_DB',$2,$3,$4,$5,$6,$7)`,
        [id, `zz.db.${id.slice(0, 8)}@example.test`, o.role ?? "expert", o.active ?? false, o.approval ?? "pending", JSON.stringify(o.perms ?? {}), randomUUID()]);
      return id;
    };
    const approveSql = `select public.admin_approve_expert_with_modules($1,$2,$3,$4,$5,$6)`;

    console.log("\n[1] Fonksiyon güvenliği");
    const fns = ["admin_approve_expert_with_modules", "admin_set_module_permissions", "admin_reject_user", "admin_archive_user", "admin_set_user_active", "admin_revoke_user_sessions_tx"];
    const defs = (await su.query(`select proname, prosecdef, proconfig from pg_proc where proname = any($1)`, [fns])).rows;
    ok(defs.length === fns.length && defs.every((d) => d.prosecdef === true), "tüm yazma RPC'leri SECURITY DEFINER");
    ok(defs.every((d) => JSON.stringify(d.proconfig ?? []).includes("search_path=public, pg_catalog")), "sabit search_path");
    const sigs = [
      "public.admin_approve_expert_with_modules(uuid,jsonb,uuid,jsonb,text[],text)",
      "public.admin_set_module_permissions(uuid,uuid,jsonb,jsonb)",
      "public.admin_reject_user(uuid,uuid)",
      "public.admin_archive_user(uuid,uuid)",
      "public.admin_set_user_active(uuid,uuid,boolean,boolean)",
      "public.admin_revoke_user_sessions_tx(uuid,text)",
    ];
    for (const s of sigs) {
      const g = (await su.query(`select has_function_privilege('service_role',$1,'EXECUTE') svc, has_function_privilege('anon',$1,'EXECUTE') anon, has_function_privilege('authenticated',$1,'EXECUTE') auth`, [s])).rows[0];
      ok(g.svc === true && g.anon === false && g.auth === false, `EXECUTE yalnız service_role: ${s.split("(")[0].replace("public.", "")}`);
    }
    const P = await seed({});
    let anonErr = ""; try { await callAs("anon", approveSql, [P, MEMBERSHIP, ACTOR, FULL(["clients"]), [], "pending"]); } catch (e) { anonErr = (e as { code: string }).code; }
    ok(anonErr === "42501", "anon approve → 42501");
    let authErr = ""; try { await callAs("authenticated", `select public.admin_set_module_permissions($1,$2,$3,'{}'::jsonb)`, [P, ACTOR, { clients: true }]); } catch (e) { authErr = (e as { code: string }).code; }
    ok(authErr === "42501", "authenticated module RPC → 42501");
    let actorErr = ""; try { await callAs("service_role", approveSql, [P, MEMBERSHIP, P, FULL(["clients"]), [], "pending"]); } catch (e) { actorErr = (e as Error).message; }
    ok(/yetkisiz aktor/.test(actorErr), "aktör admin değil → RAISE (DB otoritesi)");

    console.log("\n[2] Girdi doğrulama (DB ikinci savunma hattı)");
    const expectCode = async (sql: string, params: unknown[]) => { try { await callAs("service_role", sql, params); return "OK"; } catch (e) { return (e as { code: string }).code; } };
    ok(await expectCode(approveSql, [P, MEMBERSHIP, ACTOR, FULL([]), [], "pending"]) === "UY003", "approve: hiç modül seçilmemiş → UY003");
    ok(await expectCode(approveSql, [P, MEMBERSHIP, ACTOR, { yasam_hafizasi: true, clients: true }, [], "pending"]) === "UY003", "approve: yasam_hafizasi anahtarı → UY003");
    ok(await expectCode(approveSql, [P, MEMBERSHIP, ACTOR, { clients: "true" }, [], "pending"]) === "UY003", "approve: non-boolean → UY003");
    ok(await expectCode(approveSql, [P, MEMBERSHIP, ACTOR, { "Bad-Key": true }, [], "pending"]) === "UY003", "approve: geçersiz anahtar biçimi → UY003");
    ok(await expectCode(`select public.admin_set_module_permissions($1,$2,$3,'{}'::jsonb)`, [P, ACTOR, {}]) === "UY003", "modules: boş değişiklik → UY003");
    ok(await expectCode(`select public.admin_set_module_permissions($1,$2,$3,'{}'::jsonb)`, [P, ACTOR, { is_admin: 1 }]) === "UY003", "modules: non-boolean → UY003");
    const adminTarget = await seed({ role: "admin", approval: "approved", active: true });
    ok(await expectCode(approveSql, [adminTarget, MEMBERSHIP, ACTOR, FULL(["clients"]), [], "pending"]) === "UY002", "approve: admin hedef → UY002");
    ok(await expectCode(approveSql, [P, MEMBERSHIP, ACTOR, FULL(["clients"]), [], "rejected"]) === "UY001", "approve: bayat beklenen durum (pending iken 'rejected') → UY001");
    ok(await expectCode(approveSql, [P, MEMBERSHIP, ACTOR, FULL(["clients"]), [], null]) === "UY001", "approve: beklenen durum yok → UY001");
    ok(await expectCode(approveSql, [P, MEMBERSHIP, ACTOR, FULL(["clients"]), [], "approved"]) === "UY001", "approve: geçersiz beklenen durum → UY001");
    ok((await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id=$1`, [P])).rows[0].n === 0, "reddedilen çağrılar audit yazmadı");

    console.log("\n[3] Atomik rollback (audit hatası → hiçbir değişiklik)");
    const RB = await seed({ perms: { numerology: true } });
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,'zz-rb-token')`, [RB]);
    const snap = JSON.stringify((await su.query(`select approval_status, active, package_type, approved_at, module_permissions from public.users where id=$1`, [RB])).rows[0]);
    await su.query(`create function public._boom() returns trigger language plpgsql as $$ begin raise exception 'audit boom'; end; $$;
                    create trigger _boom_t before insert on public.admin_audit_log for each row execute function public._boom();`);
    ok(await expectCode(approveSql, [RB, MEMBERSHIP, ACTOR, FULL(["clients"]), [], "pending"]) !== "OK", "audit hatasında approve RAISE");
    ok(JSON.stringify((await su.query(`select approval_status, active, package_type, approved_at, module_permissions from public.users where id=$1`, [RB])).rows[0]) === snap, "ROLLBACK: users satırı değişmedi");
    ok((await su.query(`select is_active from public.user_sessions where session_token='zz-rb-token'`)).rows[0].is_active === true, "ROLLBACK: oturum iptali de geri alındı");
    ok(await expectCode(`select public.admin_set_module_permissions($1,$2,$3,'{}'::jsonb)`, [RB, ACTOR, { stones: true }]) !== "OK", "audit hatasında modules RAISE");
    ok((await su.query(`select module_permissions from public.users where id=$1`, [RB])).rows[0].module_permissions.stones === undefined, "ROLLBACK: modül değişmedi");
    ok(await expectCode(`select public.admin_reject_user($1,$2)`, [RB, ACTOR]) !== "OK" && (await su.query(`select approval_status from public.users where id=$1`, [RB])).rows[0].approval_status === "pending", "ROLLBACK: reject değişmedi");
    await su.query(`drop trigger _boom_t on public.admin_audit_log; drop function public._boom();`);

    console.log("\n[4] Eşzamanlılık (paralel bağlantılar, FOR UPDATE)");
    const E1 = await seed({});
    const [x1, x2] = await Promise.allSettled([
      callAs("service_role", approveSql, [E1, MEMBERSHIP, ACTOR, FULL(["clients"]), [], "pending"]),
      callAs("service_role", approveSql, [E1, MEMBERSHIP, ACTOR, FULL(["numerology"]), [], "pending"]),
    ]);
    const okN = [x1, x2].filter((s) => s.status === "fulfilled").length;
    const conflictN = [x1, x2].filter((s) => s.status === "rejected" && (s.reason as { code: string }).code === "UY002").length;
    ok(okN === 1 && conflictN === 1, "onay+onay paralel → TAM 1 başarılı, 1 UY002 (çift onay yok)");
    ok((await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id=$1 and action='user_approved'`, [E1])).rows[0].n === 1, "tek user_approved audit");
    const E2 = await seed({});
    const [y1, y2] = await Promise.allSettled([
      callAs("service_role", approveSql, [E2, MEMBERSHIP, ACTOR, FULL(["clients"]), [], "pending"]),
      callAs("service_role", `select public.admin_reject_user($1,$2)`, [E2, ACTOR]),
    ]);
    const e2 = (await su.query(`select approval_status, active from public.users where id=$1`, [E2])).rows[0];
    const oneWins = [y1, y2].filter((s) => s.status === "fulfilled").length === 1;
    ok(oneWins, "onay+ret paralel → yalnız biri uygulanır (diğeri UY002)");
    ok((e2.approval_status === "approved" && e2.active === true) || (e2.approval_status === "rejected" && e2.active === false), "onay+ret: son durum tutarlı (karışık değil)");
    const E3 = await seed({ approval: "approved", active: true });
    const keys = ["clients", "numerology", "stones", "human_design", "cosmic_calendar", "cupping"];
    await Promise.all(keys.map((k) => callAs("service_role", `select public.admin_set_module_permissions($1,$2,$3,'{}'::jsonb)`, [E3, ACTOR, { [k]: true }])));
    const e3 = (await su.query(`select module_permissions from public.users where id=$1`, [E3])).rows[0].module_permissions;
    ok(keys.every((k) => e3[k] === true), "6 paralel modül değişikliği → 6/6 korundu (lost-update yok)");
    ok((await su.query(`select count(*)::int n from public.admin_audit_log where target_user_id=$1 and action='module_enabled'`, [E3])).rows[0].n === 6, "6 module_enabled audit (gerçek final state)");

    console.log("\n[5] Oturum iptali sözleşmesi");
    const S = await seed({ approval: "approved", active: true });
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,'zz-s1'),($1,'zz-s2')`, [S]);
    const arch = (await callAs("service_role", `select public.admin_archive_user($1,$2) r`, [S, ACTOR])).rows[0].r;
    ok(arch.revoked_session_count === 2, "arşiv → 2 oturum iptal (aynı tx)");
    const re = (await callAs("service_role", `select public.admin_set_user_active($1,$2,true,false) r`, [S, ACTOR])).rows[0].r;
    ok(re.active === true && (await su.query(`select count(*)::int n from public.user_sessions where user_id=$1 and is_active`, [S])).rows[0].n === 0, "reaktivasyon eski oturumları CANLANDIRMAZ");
    const pend = await seed({});
    ok(await expectCode(`select public.admin_set_user_active($1,$2,true,false)`, [pend, ACTOR]) === "UY002", "onaysız uzmanı aktifleştirme → UY002");
  } finally {
    await su.end().catch(() => undefined);
    await epg.stop().catch((e: Error) => console.log("(teardown uyarısı)", e.message));
  }
  console.log(`\n──────────\nFAZ 1 DB SÖZLEŞME: PASS ${pass} · FAIL ${fail}`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error("BEKLENMEYEN:", e); process.exit(1); });
