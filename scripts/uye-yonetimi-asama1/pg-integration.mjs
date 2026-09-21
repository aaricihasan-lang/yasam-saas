// GERÇEK PostgreSQL entegrasyon + rollback + eşzamanlılık + yetki testleri.
// Bağımsız EPHEMERAL yerel Postgres (embedded-postgres) — production'a SIFIR temas, sentetik veri.
// Şema: sentetik users + yasam_hafizasi_flags + repo migration'ları (admin_audit_log, yh_grade)
//        + Aşama 1 migration (20270105000000). Çalıştır: node scripts/uye-yonetimi-asama1/pg-integration.mjs
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

// initdb, Türkçe (non-ASCII) sistem locale'ini reddediyor → C locale'e zorla.
process.env.LC_ALL = "C";
process.env.LANG = "C";

// EPHEMERAL data dir: OS temp altında sabit, oturumdan-bağımsız → temiz bir geliştirme
// ortamında da tekrar çalıştırılabilir. `persistent: false` teardown'da klasörü siler;
// ayrıca olası çökme artığı (leftover lock) için başlangıçta güvenli temizlik yapılır.
const DATA_DIR = path.join(os.tmpdir(), "uye-yonetimi-asama1-pgdata");
try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
const PORT = 54329, PW = "testpw";
const ROOT = process.cwd();
const readMig = (f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; console.error(`  ✗ ${l}`); } };
const conn = (database = "postgres") => new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database });

// sentetik users tablosu (repo'da migration yok — dashboard). yh_grade + RPC'lerin kullandığı kolonlar.
const USERS_DDL = `
create table public.users (
  id uuid primary key,
  full_name text, email text, role text,
  active boolean default false,
  approval_status text default 'pending',
  approved_at timestamptz,
  module_permissions jsonb default '{}'::jsonb,
  package_type text, membership_status text, subscription_status text,
  trial_started_at timestamptz, trial_ends_at timestamptz,
  membership_started_at timestamptz, membership_ends_at timestamptz,
  plan text, admin_level text, tenant_id uuid, created_at timestamptz default now(),
  is_super_admin boolean not null default false,
  is_demo_account boolean not null default false
);
create table public.yasam_hafizasi_flags (
  tenant_id uuid primary key, yh_enabled boolean default false, yh_hizli boolean default false, yh_shared boolean default false
);`;

const T_ADMIN = "00000000-0000-0000-0000-0000000000a1";
const T_EXPERT = "00000000-0000-0000-0000-0000000000e1";
const T_TENANT = "11111111-1111-1111-1111-111111111111";

async function seedExpert(c, { id, tenant, modules = {}, approval = "pending", active = false, pkg = null, plan = null, approvedAt = null, demo = false }) {
  await c.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, approved_at, module_permissions, package_type, plan, tenant_id, is_demo_account)
     values ($1,$2,$3,'expert',$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (id) do update set active=excluded.active, approval_status=excluded.approval_status,
       approved_at=excluded.approved_at, module_permissions=excluded.module_permissions,
       package_type=excluded.package_type, plan=excluded.plan, tenant_id=excluded.tenant_id, is_demo_account=excluded.is_demo_account`,
    [id, "Test Uzman", `${id}@t.local`, active, approval, approvedAt, JSON.stringify(modules), pkg, plan, tenant, demo],
  );
}
const premiumMembership = { package_type: "premium", membership_status: "active", membership_started_at: new Date(0).toISOString(), membership_ends_at: null, trial_started_at: null, trial_ends_at: null, plan: "premium", subscription_status: "active" };

async function main() {
  const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
  await epg.initialise();
  await epg.start();
  console.log("embedded-postgres başlatıldı (ephemeral).");

  const su = conn();
  await su.connect();
  try {
    // Roller + şema + migration'lar
    await su.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
                    grant usage on schema public to anon, authenticated, service_role;`);
    await su.query(USERS_DDL);
    await su.query(readMig("20260903000000_admin_audit_log.sql"));
    await su.query(readMig("20261221000000_yh_grade_expert_premium_rpc.sql"));
    await su.query(readMig("20270105000000_admin_membership_atomic_rpcs.sql"));
    // service_role users tablosuna erişebilsin (SECURITY DEFINER zaten owner ile çalışır; yine de yetki verelim)
    await su.query(`grant select, insert, update on all tables in schema public to service_role;`);
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id)
                    values ($1,'Owner','owner@t.local','admin',true,'approved',true,$2)`, [T_ADMIN, T_ADMIN]);
    console.log("Şema + migration'lar uygulandı.\n");

    // ── B: MIGRATION DOĞRULAMA ──
    console.log("[B] Migration doğrulama");
    const fns = (await su.query(`select proname, prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and proname in ('admin_approve_expert_premium','admin_reject_user','admin_set_user_active','admin_archive_user') order by proname`)).rows;
    ok(fns.length === 4, "4 RPC oluşturuldu");
    ok(fns.every(f => f.prosecdef === true), "hepsi SECURITY DEFINER");
    const yhOk = (await su.query(`select 1 from pg_proc where proname='yh_grade_expert_premium'`)).rowCount === 1;
    ok(yhOk, "mevcut yh_grade_expert_premium bozulmadı (mevcut)");
    const gexec = (await su.query(`select has_function_privilege('service_role','public.admin_approve_expert_premium(uuid,jsonb,uuid)','EXECUTE') svc,
      has_function_privilege('anon','public.admin_approve_expert_premium(uuid,jsonb,uuid)','EXECUTE') anon,
      has_function_privilege('authenticated','public.admin_approve_expert_premium(uuid,jsonb,uuid)','EXECUTE') auth`)).rows[0];
    ok(gexec.svc === true && gexec.anon === false && gexec.auth === false, "EXECUTE yalnız service_role (anon/auth reddedilir)");

    const callAs = async (role, sql, params) => { const c = conn(); await c.connect(); try { await c.query(`set role ${role}`); return await c.query(sql, params); } finally { await c.end(); } };

    // ── C1: Seçili modüller korunur ──
    console.log("\n[C1] Onay → Premium, Numeroloji+Doğaltaş korunur");
    await seedExpert(su, { id: T_EXPERT, tenant: T_TENANT, modules: { numerology: true, stones: true }, approval: "pending", active: false });
    const before = (await su.query(`select module_permissions from public.users where id=$1`, [T_EXPERT])).rows[0].module_permissions;
    await callAs("service_role", `select public.admin_approve_expert_premium($1,$2,$3)`, [T_EXPERT, premiumMembership, T_ADMIN]);
    const aft = (await su.query(`select approval_status, active, package_type, approved_at, module_permissions from public.users where id=$1`, [T_EXPERT])).rows[0];
    ok(aft.approval_status === "approved" && aft.active === true && aft.package_type === "premium", "approved + active + premium");
    ok(aft.approved_at !== null, "approved_at yazıldı");
    ok(aft.module_permissions.numerology === true && aft.module_permissions.stones === true, "Numeroloji + Doğaltaş KORUNDU");
    ok(!("clients" in aft.module_permissions) && !("energy_body" in aft.module_permissions), "diğer modüller AÇILMADI");
    const aud = (await su.query(`select action, actor_admin_id, old_value, new_value from admin_audit_log where target_user_id=$1 and action='user_approved'`, [T_EXPERT])).rows;
    ok(aud.length === 1 && aud[0].actor_admin_id === T_ADMIN, "user_approved audit + doğru aktör");
    console.log(`     (izinler: önce=${JSON.stringify(before)} sonra=${JSON.stringify(aft.module_permissions)})`);

    // ── C2: Boş izin → premium, regular modül açılmaz ──
    console.log("\n[C2] Boş modül izni → premium, regular modül açılmaz");
    const E2 = "00000000-0000-0000-0000-0000000000e2";
    await seedExpert(su, { id: E2, tenant: "22222222-2222-2222-2222-222222222222", modules: {}, approval: "pending" });
    await callAs("service_role", `select public.admin_approve_expert_premium($1,$2,$3)`, [E2, premiumMembership, T_ADMIN]);
    const a2 = (await su.query(`select package_type, module_permissions from public.users where id=$1`, [E2])).rows[0];
    const regularKeys = Object.keys(a2.module_permissions).filter(k => k !== "yasam_hafizasi");
    ok(a2.package_type === "premium", "premium atandı");
    ok(regularKeys.every(k => a2.module_permissions[k] !== true), "hiçbir REGULAR modül otomatik açılmadı (YH ayrı motor kuralı)");

    // ── C3: Zaten premium re-approve → ilk tarih + izin korunur ──
    console.log("\n[C3] Zaten premium re-approve → ilk approved_at + izinler korunur");
    const firstDate = (await su.query(`select approved_at from public.users where id=$1`, [T_EXPERT])).rows[0].approved_at;
    await callAs("service_role", `select public.admin_approve_expert_premium($1,$2,$3)`, [T_EXPERT, premiumMembership, T_ADMIN]);
    const a3 = (await su.query(`select approved_at, module_permissions from public.users where id=$1`, [T_EXPERT])).rows[0];
    ok(new Date(a3.approved_at).getTime() === new Date(firstDate).getTime(), "İLK onay tarihi KORUNDU (ezilmedi)");
    ok(a3.module_permissions.numerology === true && a3.module_permissions.stones === true, "izinler yine korunuyor");

    // ── D: YH uygunluk ──
    console.log("\n[D] Yaşam Hafızası grant kuralı");
    ok((await su.query(`select yh_enabled from yasam_hafizasi_flags where tenant_id=$1`, [T_TENANT])).rows[0]?.yh_enabled === true, "uygun premium → YH aktif (premium_with_yh)");
    const E3 = "00000000-0000-0000-0000-0000000000e3", DT = "33333333-3333-3333-3333-333333333333";
    await seedExpert(su, { id: E3, tenant: DT, modules: {}, approval: "pending" });
    await seedExpert(su, { id: "00000000-0000-0000-0000-0000000000d9", tenant: DT, demo: true }); // tenant'ta demo user → ineligible
    await callAs("service_role", `select public.admin_approve_expert_premium($1,$2,$3)`, [E3, premiumMembership, T_ADMIN]);
    const e3 = (await su.query(`select package_type, module_permissions from public.users where id=$1`, [E3])).rows[0];
    ok(e3.package_type === "premium" && e3.module_permissions.yasam_hafizasi !== true, "uygun DEĞİL (demo tenant) → premium ama YH YOK");

    // ── E: ATOMİK ROLLBACK (audit hatası → hiçbir değişiklik) ──
    console.log("\n[E] Atomik rollback — audit INSERT hatasında üyelik değişmez");
    const E4 = "00000000-0000-0000-0000-0000000000e4";
    await seedExpert(su, { id: E4, tenant: "44444444-4444-4444-4444-444444444444", modules: { numerology: true }, approval: "pending", active: false });
    const snapE4 = (await su.query(`select approval_status, active, package_type, approved_at, module_permissions from public.users where id=$1`, [E4])).rows[0];
    await su.query(`create function public._boom() returns trigger language plpgsql as $$ begin raise exception 'audit boom'; end; $$;
                    create trigger _boom_t before insert on admin_audit_log for each row execute function public._boom();`);
    let approveErr = null;
    try { await callAs("service_role", `select public.admin_approve_expert_premium($1,$2,$3)`, [E4, premiumMembership, T_ADMIN]); }
    catch (e) { approveErr = e.message; }
    ok(approveErr !== null, "audit hatasında approve RAISE etti");
    const afterBoom = (await su.query(`select approval_status, active, package_type, approved_at, module_permissions from public.users where id=$1`, [E4])).rows[0];
    ok(JSON.stringify(afterBoom) === JSON.stringify(snapE4), "ROLLBACK: users satırı HİÇ değişmedi (premium/approved/approved_at/izin)");
    ok((await su.query(`select count(*)::int n from yasam_hafizasi_flags where tenant_id=$1`, ["44444444-4444-4444-4444-444444444444"])).rows[0].n === 0, "ROLLBACK: YH flags yazılmadı");
    // reject/set_active/archive de aynı trigger altında rollback
    await seedExpert(su, { id: E4, tenant: "44444444-4444-4444-4444-444444444444", approval: "approved", active: true });
    let rejErr = null; try { await callAs("service_role", `select public.admin_reject_user($1,$2)`, [E4, T_ADMIN]); } catch (e) { rejErr = e.message; }
    ok(rejErr !== null && (await su.query(`select approval_status from public.users where id=$1`, [E4])).rows[0].approval_status === "approved", "ROLLBACK: reject audit hatasında approval_status değişmedi");
    await su.query(`drop trigger _boom_t on admin_audit_log; drop function public._boom();`);

    // ── E2: RPC bağımlılığı hatası (tutarsız premium payload) → rollback ──
    console.log("\n[E2] Bağımlılık hatası (yh_grade gate) → rollback");
    const E5 = "00000000-0000-0000-0000-0000000000e5";
    await seedExpert(su, { id: E5, tenant: "55555555-5555-5555-5555-555555555555", modules: { stones: true }, approval: "pending" });
    let badErr = null;
    try { await callAs("service_role", `select public.admin_approve_expert_premium($1,$2,$3)`, [E5, { package_type: "premium", plan: "trial" }, T_ADMIN]); }
    catch (e) { badErr = e.message; }
    ok(badErr !== null, "tutarsız payload → yh_grade gate RAISE");
    const e5 = (await su.query(`select approval_status, package_type from public.users where id=$1`, [E5])).rows[0];
    ok(e5.approval_status === "pending" && e5.package_type === null, "ROLLBACK: bağımlılık hatasında üyelik yarım kalmadı");
    ok((await su.query(`select count(*)::int n from admin_audit_log where target_user_id=$1`, [E5])).rows[0].n === 0, "ROLLBACK: audit yazılmadı");

    // ── F: EŞZAMANLILIK (gerçek paralel bağlantılar) ──
    console.log("\n[F] Eşzamanlılık (paralel bağlantılar, FOR UPDATE)");
    // Test 4: modül izni değiştirme + onay yarışı — eski snapshot yeni izni EZMEMELİ
    const E6 = "00000000-0000-0000-0000-0000000000e6";
    await seedExpert(su, { id: E6, tenant: "66666666-6666-6666-6666-666666666666", modules: { numerology: true }, approval: "pending" });
    const c1 = conn(), c2 = conn(); await c1.connect(); await c2.connect();
    await c1.query("set role service_role"); await c2.query("set role service_role");
    await Promise.all([
      c1.query(`select public.admin_approve_expert_premium($1,$2,$3)`, [E6, premiumMembership, T_ADMIN]),
      c2.query(`update public.users set module_permissions = module_permissions || '{"stones":true}'::jsonb where id=$1`, [E6]),
    ]);
    const e6 = (await su.query(`select approval_status, module_permissions from public.users where id=$1`, [E6])).rows[0];
    ok(e6.approval_status === "approved", "yarış: onay tamamlandı");
    ok(e6.module_permissions.numerology === true && e6.module_permissions.stones === true, "yarış: eşzamanlı eklenen 'stones' izni EZİLMEDİ (in-row koruma)");
    await c1.end(); await c2.end();
    // Test 1: onay + onay → tutarlı + iki audit
    const E7 = "00000000-0000-0000-0000-0000000000e7";
    await seedExpert(su, { id: E7, tenant: "77777777-7777-7777-7777-777777777777", modules: {}, approval: "pending" });
    const d1 = conn(), d2 = conn(); await d1.connect(); await d2.connect(); await d1.query("set role service_role"); await d2.query("set role service_role");
    await Promise.all([
      d1.query(`select public.admin_approve_expert_premium($1,$2,$3)`, [E7, premiumMembership, T_ADMIN]),
      d2.query(`select public.admin_approve_expert_premium($1,$2,$3)`, [E7, premiumMembership, T_ADMIN]),
    ]);
    const e7 = (await su.query(`select approval_status, package_type from public.users where id=$1`, [E7])).rows[0];
    ok(e7.approval_status === "approved" && e7.package_type === "premium", "onay+onay: son durum tutarlı");
    await d1.end(); await d2.end();
    // Test 5: eşzamanlı arşivleme → active=false, çelişki yok
    const E8 = "00000000-0000-0000-0000-0000000000e8";
    await seedExpert(su, { id: E8, tenant: "88888888-8888-8888-8888-888888888888", approval: "approved", active: true });
    const g1 = conn(), g2 = conn(); await g1.connect(); await g2.connect(); await g1.query("set role service_role"); await g2.query("set role service_role");
    await Promise.all([
      g1.query(`select public.admin_archive_user($1,$2)`, [E8, T_ADMIN]),
      g2.query(`select public.admin_archive_user($1,$2)`, [E8, T_ADMIN]),
    ]);
    ok((await su.query(`select active from public.users where id=$1`, [E8])).rows[0].active === false, "eşzamanlı arşivleme: active=false (çelişki yok)");
    await g1.end(); await g2.end();
    // Test 2: onay + ret paralel → serileşir, çelişki yok, iki audit + son-audit=son-durum
    const E10 = "00000000-0000-0000-0000-0000000000f1";
    await seedExpert(su, { id: E10, tenant: "f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1", modules: {}, approval: "pending" });
    const h1 = conn(), h2 = conn(); await h1.connect(); await h2.connect(); await h1.query("set role service_role"); await h2.query("set role service_role");
    await Promise.allSettled([
      h1.query(`select public.admin_approve_expert_premium($1,$2,$3)`, [E10, premiumMembership, T_ADMIN]),
      h2.query(`select public.admin_reject_user($1,$2)`, [E10, T_ADMIN]),
    ]);
    await h1.end(); await h2.end();
    const f1 = (await su.query(`select approval_status, active, package_type from public.users where id=$1`, [E10])).rows[0];
    ok(f1.approval_status === "approved" || f1.approval_status === "rejected", "onay+ret: durum ikisinden biri (bozuk değil)");
    ok((f1.approval_status === "approved") === (f1.active === true), "onay+ret: active ↔ approval tutarlı");
    const f1aud = (await su.query(`select action from admin_audit_log where target_user_id=$1 and action in ('user_approved','user_rejected')`, [E10])).rows.map(r => r.action);
    ok(f1aud.includes("user_approved") && f1aud.includes("user_rejected"), "onay+ret: HER İKİ audit kaydı mevcut (append-only, kayıp yok)");
    // NOT: audit.created_at = now() (tx BAŞLANGICI) → eşzamanlılıkta commit sırasıyla aynı olmayabilir;
    // bu yüzden "son durum" için audit zaman sırasına DEĞİL, users satırının atomik tutarlılığına bakılır.
    // Atomiklik (sıra-bağımsız): SON commit eden işlem KENDİ sözleşmesini bütünüyle uygular.
    //  - approve son ise: approval='approved' ∧ active=true ∧ package='premium' (üçü AYNI tx).
    //  - reject  son ise: approval='rejected' ∧ active=false (package_type reject sözleşmesinde YOK → dokunulmaz;
    //    önceki approve'dan kalan 'premium' değeri, pasif+reddedilmiş hesapta anlamsızdır ve "karışık yazım" DEĞİLDİR).
    const f1atomic = f1.approval_status === "approved"
      ? (f1.active === true && f1.package_type === "premium")
      : (f1.active === false);
    ok(f1atomic, "onay+ret: son durum TAM olarak son işlemin (kendi sözleşmesinin) sonucu (atomik; kısmi/karışık değil)");
    const f1match = (await su.query(`select 1 from admin_audit_log where target_user_id=$1 and action=$2`, [E10, f1.approval_status === "approved" ? "user_approved" : "user_rejected"])).rowCount;
    ok(f1match >= 1, "onay+ret: son durumu üreten işlemin audit kaydı VAR");
    // Test 3: pasife alma + yeniden aktifleştirme paralel → son-audit=son-durum, iki audit
    const E11 = "00000000-0000-0000-0000-0000000000f2";
    await seedExpert(su, { id: E11, tenant: "f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2", approval: "approved", active: true });
    const k1 = conn(), k2 = conn(); await k1.connect(); await k2.connect(); await k1.query("set role service_role"); await k2.query("set role service_role");
    await Promise.allSettled([
      k1.query(`select public.admin_set_user_active($1,$2,false)`, [E11, T_ADMIN]),
      k2.query(`select public.admin_set_user_active($1,$2,true)`, [E11, T_ADMIN]),
    ]);
    await k1.end(); await k2.end();
    const f2 = (await su.query(`select active from public.users where id=$1`, [E11])).rows[0];
    const f2aud = (await su.query(`select distinct action from admin_audit_log where target_user_id=$1 and action in ('user_activated','user_deactivated')`, [E11])).rows.map(r => r.action);
    ok(typeof f2.active === "boolean", "pasif+aktif: son durum tutarlı (boolean)");
    const f2match = (await su.query(`select 1 from admin_audit_log where target_user_id=$1 and (new_value->>'active') = $2`, [E11, String(f2.active)])).rowCount;
    ok(f2match >= 1, "pasif+aktif: son durumu üreten işlemin audit kaydı VAR (kayıp/ezme yok)");
    ok(f2aud.includes("user_activated") && f2aud.includes("user_deactivated"), "pasif+aktif: her iki audit türü kaydedildi");

    // ── G: yaşam döngüsü (pasife al → arşiv → geri dön) ──
    console.log("\n[G] Pasife alma → arşiv → yeniden aktifleştirme");
    await callAs("service_role", `select public.admin_set_user_active($1,$2,false)`, [T_EXPERT, T_ADMIN]);
    ok((await su.query(`select active from public.users where id=$1`, [T_EXPERT])).rows[0].active === false, "pasife alındı (active=false)");
    ok((await su.query(`select 1 from admin_audit_log where target_user_id=$1 and action='user_deactivated'`, [T_EXPERT])).rowCount === 1, "user_deactivated audit");
    const archived = (await su.query(`select id from public.users where role='expert' and approval_status='approved' and active=false`)).rows.map(r => r.id);
    ok(archived.includes(T_EXPERT), "arşiv kapsamında görünüyor (expert+approved+pasif)");
    await callAs("service_role", `select public.admin_set_user_active($1,$2,true)`, [T_EXPERT, T_ADMIN]);
    const life = (await su.query(`select active, module_permissions from public.users where id=$1`, [T_EXPERT])).rows[0];
    ok(life.active === true && life.module_permissions.numerology === true && life.module_permissions.stones === true, "yeniden aktif + izinler/veri korundu");
    ok((await su.query(`select 1 from admin_audit_log where target_user_id=$1 and action='user_activated'`, [T_EXPERT])).rowCount >= 1, "user_activated audit");
    // reddedilmiş/pending arşive karışmaz
    await seedExpert(su, { id: "00000000-0000-0000-0000-0000000000e9", tenant: T_TENANT, approval: "rejected", active: false });
    await seedExpert(su, { id: "00000000-0000-0000-0000-0000000000ea", tenant: T_TENANT, approval: "pending", active: false });
    const arch2 = (await su.query(`select id from public.users where role='expert' and approval_status='approved' and active=false`)).rows.map(r => r.id);
    ok(!arch2.includes("00000000-0000-0000-0000-0000000000e9") && !arch2.includes("00000000-0000-0000-0000-0000000000ea"), "reddedilmiş/pending arşive KARIŞMAZ");

    // ── H: YETKİ ──
    console.log("\n[H] Yetkilendirme");
    let anonErr = null; try { await callAs("anon", `select public.admin_approve_expert_premium($1,$2,$3)`, [T_EXPERT, premiumMembership, T_ADMIN]); } catch (e) { anonErr = e.code; }
    ok(anonErr === "42501", "anon EXECUTE reddedildi (42501)");
    let authErr = null; try { await callAs("authenticated", `select public.admin_reject_user($1,$2)`, [T_EXPERT, T_ADMIN]); } catch (e) { authErr = e.code; }
    ok(authErr === "42501", "authenticated EXECUTE reddedildi (42501)");
    // aktör admin değilse → RAISE (istemci adminId'sine güvenilmez)
    let actorErr = null; try { await callAs("service_role", `select public.admin_reject_user($1,$2)`, [T_EXPERT, T_EXPERT]); } catch (e) { actorErr = e.message; }
    ok(actorErr !== null && /yetkisiz aktor/.test(actorErr), "aktör admin+aktif DEĞİLSE RAISE (DB otoritesi)");

    console.log(`\n──────────\nGERÇEK PG: PASS ${pass} · FAIL ${fail}`);
  } finally {
    try { await su.end(); } catch {}
    try { await epg.stop(); console.log("embedded-postgres durduruldu."); }
    catch (e) { console.log("(teardown uyarısı — test sonucunu etkilemez:", e.message, ")"); }
  }
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error("BEKLENMEYEN:", e); process.exit(1); });
