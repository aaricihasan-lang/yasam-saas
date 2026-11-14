/**
 * AŞAMA 4a — MIGRATION KURU PROVASI (izole embedded PostgreSQL; production'a SIFIR temas).
 *
 * Migration dosyası kendi BEGIN; … COMMIT; ifadelerini içerir → dışarıdan BEGIN/ROLLBACK ile sarmalamak GÜVENLİ DEĞİLDİR
 * (iç COMMIT değişiklikleri kalıcılaştırır). Bu prova bu yüzden:
 *   T  dosyanın üst düzeyinde YALNIZ ilk "BEGIN;" ve son "COMMIT;" bulunduğunu dolar-tırnak farkındalıklı ayrıştırıcıyla
 *      kanıtlar; gövdeyi yalnız bu iki ifade çıkarılarak üretir; gövdede ve prova metninde hiçbir COMMIT/ROLLBACK/BEGIN yoktur.
 *   R  canlıya benzer sentetik veritabanında (aynı migration zinciri + ledger) gövdeyi + ledger kaydını TEK işlemde çalıştırır,
 *      işlem kimliğinin baştan sona AYNI kaldığını (araya COMMIT girmediğini) ve yeni nesnelerin işlem içinde var olduğunu
 *      doğrular, sonra ROLLBACK eder; şema / fonksiyon / tetikleyici / kısıt / kolon / indeks / ledger / tüm satırlar ÖNCE = SONRA.
 *   F  hata yolu: ön koşul bozuksa (audit CHECK sapması) gerçek uygulama metni durur; hiçbir şey kalıcılaşmaz.
 *   A  gerçek uygulama metni (gövde + ledger, tek işlem, COMMIT) izole veritabanında: nesneler, ACL, ledger, mevcut veri aynı;
 *      ikinci uygulama denemesi ledger PK'si ile tamamen geri alınır.
 *
 * Çalıştır: npx tsx scripts/uye-arsiv-4a/rehearsal.harness.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";
import { extractMigrationBody, normalizeStatement, splitTopLevel } from "./migrationBody";
import { buildApplyText, buildRehearsalText, MIG_VERSION } from "./applyText";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, detail?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label); console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 600)}`}`); }
}

const MIG = "20280101000600_admin_member_archive_state.sql";
const OWNER = "00000000-0000-4000-8000-0000000004f1";

/** Katalog + veri parmak izi (public şema; tüm kullanıcı satırları ve bağlı tablolar). */
async function snapshot(c: pg.Client | pg.PoolClient): Promise<Record<string, string>> {
  const q = async (sql: string) => String((await c.query(sql)).rows[0]?.h ?? "");
  return {
    fonksiyonlar: await q(`select md5(string_agg(p.oid::regprocedure::text||md5(p.prosrc)||coalesce(p.proacl::text,'')||p.prosecdef::text||coalesce(array_to_string(p.proconfig,','),''), E'\\n' order by 1)) h
                           from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`),
    tetikleyiciler: await q(`select md5(coalesce(string_agg(t.tgname||':'||pg_get_triggerdef(t.oid), E'\\n' order by t.tgname, t.tgrelid), '')) h
                             from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal`),
    kisitlar: await q(`select md5(string_agg(c.conname||':'||pg_get_constraintdef(c.oid), E'\\n' order by c.conname, c.conrelid)) h
                       from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'`),
    kolonlar: await q(`select md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||coalesce(column_default,'')||':'||is_nullable, E'\\n' order by table_name, column_name)) h
                       from information_schema.columns where table_schema='public'`),
    indeksler: await q(`select md5(string_agg(indexdef, E'\\n' order by indexname)) h from pg_indexes where schemaname='public'`),
    yorumlar: await q(`select md5(coalesce(string_agg(d.objoid::text||d.objsubid||d.description, E'\\n' order by d.objoid, d.objsubid), '')) h
                       from pg_description d join pg_class c on c.oid=d.objoid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'`),
    ledger: await q(`select md5(string_agg(version||':'||coalesce(name,'')||':'||coalesce(created_by,''), ',' order by version)) h from supabase_migrations.schema_migrations`),
    users: await q(`select md5(string_agg(u::text, E'\\n' order by u.id)) h from public.users u`),
    oturumlar: await q(`select md5(string_agg(s::text, E'\\n' order by s.id)) h from public.user_sessions s`),
    odeme_gecmisi: await q(`select md5(coalesce(string_agg(x::text, E'\\n' order by x.id), '')) h from public.user_payment_history x`),
    fiyat_donemleri: await q(`select md5(coalesce(string_agg(x::text, E'\\n' order by x.id), '')) h from public.member_pricing_phases x`),
    deneme_profilleri: await q(`select md5(coalesce(string_agg(x::text, E'\\n' order by x.user_id), '')) h from public.trial_profiles x`),
    yonetim_gecmisi: await q(`select md5(coalesce(string_agg(x::text, E'\\n' order by x.id), '')) h from public.admin_audit_log x`),
    bildirimler: await q(`select md5(coalesce(string_agg(x::text, E'\\n' order by x.id), '')) h from public.admin_notifications x`),
    danisanlar: await q(`select md5(coalesce(string_agg(x::text, E'\\n' order by x.id), '')) h from public.clients x`),
  };
}
const diffKeys = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).filter((k) => a[k] !== b[k]);

async function main(): Promise<void> {
  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations", MIG), "utf8");
  console.log(`[T] Dosya ve gövde · ${MIG} · sha256 ${createHash("sha256").update(sql).digest("hex")}`);
  const { body, txStatements } = extractMigrationBody(sql);
  ok(JSON.stringify(txStatements) === JSON.stringify(["BEGIN;", "COMMIT;"]), "T1 üst düzeyde YALNIZ ilk BEGIN; ve son COMMIT; var (PL/pgSQL BEGIN/END'ler gövde içinde)", txStatements);
  ok(sql.length - body.length === "BEGIN;".length + "COMMIT;".length, "T2 gövde = dosya − yalnız bu iki ifadenin karakterleri (diğer her bayt aynen)");
  const rehearsalText = buildRehearsalText(body);
  const rTop = splitTopLevel(rehearsalText).map((s) => normalizeStatement(s.text)).filter((t) => /^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START TRANSACTION|SAVEPOINT|RELEASE)\b/.test(t));
  ok(JSON.stringify(rTop) === JSON.stringify(["BEGIN;", "ROLLBACK;"]) && !/\bCOMMIT\s*;/i.test(splitTopLevel(rehearsalText).map((s) => normalizeStatement(s.text)).join("\n")),
    "T3 prova metni: üst düzeyde yalnız BEGIN; … ROLLBACK; — hiçbir COMMIT yok", rTop);
  const applyTop = splitTopLevel(buildApplyText(body)).map((s) => normalizeStatement(s.text)).filter((t) => /^(BEGIN|COMMIT|ROLLBACK)\b/.test(t));
  ok(JSON.stringify(applyTop) === JSON.stringify(["BEGIN;", "COMMIT;"]), "T4 uygulama metni: tek BEGIN … tek COMMIT (gövde + ledger aynı işlemde)", applyTop);

  const port = 58900 + Math.floor(Math.random() * 90);
  const db = await startTestDb(port, `uye-arsiv-4a-prova-${port}`);
  const { su, pool } = db;
  try {
    // Canlıya benzer zincir (canlıda 20280101000500'e kadar uygulanmış; parmak izleri canlı = depo)
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
    await su.query(`create schema supabase_migrations;
      create table supabase_migrations.schema_migrations(version text primary key, statements text[], name text, created_by text);
      insert into supabase_migrations.schema_migrations(version, name) values ('20280101000400','admin_owner_notifications'), ('20280101000500','admin_list_members_v2');`);
    // Canlı bağlamına benzer sentetik veri: 1 yönetici + 11 uzman (9 Pro [2 muaf], 1 demo, 1 eski kayıt)
    const tenant = async () => { const id = randomUUID(); await su.query(`insert into public.tenants(id,name,slug,status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 12)}`]); return id; };
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, admin_level, tenant_id)
      values ($1,'ZZ Prova Yönetici','zz.prova.owner@example.test','admin',true,'approved',true,'owner',$2)`, [OWNER, await tenant()]);
    for (let i = 0; i < 11; i++) {
      const id = randomUUID();
      const exempt = i < 2, demo = i === 9, legacy = i === 10;
      await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, approved_at, is_demo_account, package_type, plan,
          payment_status, next_payment_date, module_permissions, tenant_id)
        values ($1,$2,$3,'expert',true,'approved',now() - interval '60 days',$4,$5,$6,$7,current_date + 20,$8,$9)`,
        [id, `ZZ Prova Uzman ${i}`, `zz.prova.${i}@example.test`, demo, legacy ? null : "premium", legacy ? "trial" : "premium",
          exempt ? "exempt" : "paid", JSON.stringify({ clients: true, numerology: i % 2 === 0 }), await tenant()]);
      await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, `zz-prova-${id}`]);
      await su.query(`insert into public.user_payment_history(user_id, payment_status, paid_amount) values ($1,'paid',1500)`, [id]);
      if (!legacy && !demo) await su.query(`select public.admin_pricing_phase_save($1,$2,null,current_date - 30,null,1500,'monthly','zz',null)`, [OWNER, id]);
    }
    await su.query(`select public.admin_notifications_reconcile()`);

    console.log("\n[R] Kuru prova: gövde + ledger tek işlemde → ROLLBACK");
    // R0 ölçüm kontrolü: araya bilerek COMMIT konursa işlem kimliği DEĞİŞİR (R1 ölçümü gizli COMMIT'i yakalar).
    {
      const k = await pool.connect();
      try {
        await k.query("BEGIN");
        const t1 = String((await k.query("select txid_current() t")).rows[0].t);
        await k.query("select 1; COMMIT; BEGIN;");
        const t2 = String((await k.query("select txid_current() t")).rows[0].t);
        ok(t1 !== t2, `R0 ölçüm kontrolü: gizli COMMIT işlem kimliğini değiştirir (${t1} → ${t2})`);
      } finally {
        await k.query("ROLLBACK").catch(() => undefined);
        k.release();
      }
    }
    const s0 = await snapshot(su);
    const c = await pool.connect();
    let txA = "", txB = "", inside: Record<string, unknown> = {};
    try {
      await c.query("BEGIN");
      txA = String((await c.query("select txid_current() t")).rows[0].t);
      // Gövdeyi + ledger satırını AYNI işlemde çalıştır (buildRehearsalText'in BEGIN/ROLLBACK'i dışarıda yönetilir).
      const inner = rehearsalText.replace(/^BEGIN;\n/, "").replace(/\nROLLBACK;\n$/, "\n");
      await c.query(inner);
      txB = String((await c.query("select txid_current() t")).rows[0].t);
      inside = (await c.query(`select
          exists(select 1 from information_schema.columns where table_name='users' and column_name='archived_at') kolon,
          exists(select 1 from pg_constraint where conname='users_archived_inactive_chk') chk,
          to_regprocedure('public.admin_unarchive_user(uuid,uuid)') is not null fn,
          (select count(*)::int from pg_trigger where tgname in ('admin_archived_user_guard','admin_purge_require_archived','admin_archived_guard') and not tgisinternal) tetik,
          (select count(*)::int from supabase_migrations.schema_migrations where version=$1) ledger,
          pg_get_constraintdef((select oid from pg_constraint where conname='admin_audit_action_chk')) like '%user_unarchived%' audit`, [MIG_VERSION])).rows[0];
    } finally {
      await c.query("ROLLBACK").catch(() => undefined);
      c.release();
    }
    ok(txA !== "" && txA === txB, `R1 gövde boyunca işlem kimliği aynı (${txA} = ${txB}) → araya COMMIT girmedi`);
    ok(inside.kolon === true && inside.chk === true && inside.fn === true && inside.tetik === 5 && inside.ledger === 1 && inside.audit === true,
      "R2 işlem İÇİNDE: kolon, CHECK, arşivden çıkarma fonksiyonu, 5 tetikleyici, audit eylemi ve ledger kaydı oluştu (gövde gerçekten çalıştı)", inside);
    const s1 = await snapshot(su);
    ok(diffKeys(s0, s1).length === 0, `R3 ROLLBACK sonrası ${Object.keys(s0).length} parmak izi ÖNCE = SONRA (şema, fonksiyon, tetikleyici, kısıt, kolon, indeks, yorum, ledger, tüm satırlar)`, diffKeys(s0, s1));
    ok((await su.query(`select count(*)::int n from information_schema.columns where table_name='users' and column_name='archived_at'`)).rows[0].n === 0
       && (await su.query(`select count(*)::int n from supabase_migrations.schema_migrations where version=$1`, [MIG_VERSION])).rows[0].n === 0,
      "R4 kalıcı iz yok: archived_at kolonu yok, ledger'da 000600 yok");

    console.log("\n[F] Hata yolu: ön koşul bozuksa durur, hiçbir şey kalıcılaşmaz");
    const chkDef = (await su.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname='admin_audit_action_chk'`)).rows[0].d as string;
    await su.query(`alter table public.admin_audit_log drop constraint admin_audit_action_chk;
      alter table public.admin_audit_log add constraint admin_audit_action_chk ${chkDef.replace("'pricing_phase_changed'::text", "'pricing_phase_changed'::text, 'zz_sapma'::text")}`);
    const sF0 = await snapshot(su);
    const f = await pool.connect();
    let fErr = "";
    try {
      await f.query(buildApplyText(body)); // GERÇEK uygulama metni (COMMIT dahil) — izole DB
    } catch (e) {
      fErr = (e as Error).message;
    } finally {
      await f.query("ROLLBACK").catch(() => undefined);
      f.release();
    }
    const sF1 = await snapshot(su);
    ok(/on kosul/.test(fErr) && diffKeys(sF0, sF1).length === 0, "F1 ön koşul sapmasında uygulama metni hata verip durdu; şema/veri/ledger değişmedi", { fErr: fErr.slice(0, 120), d: diffKeys(sF0, sF1) });
    await su.query(`alter table public.admin_audit_log drop constraint admin_audit_action_chk;
      alter table public.admin_audit_log add constraint admin_audit_action_chk ${chkDef}`);
    ok(diffKeys(s0, await snapshot(su)).length === 0, "F2 test sapması geri alındı (başlangıç durumu birebir)");
    // F3 işlem içi veri bekçisi: gövde mevcut veriyi değiştirseydi (simülasyon) uygulama COMMIT'e varmadan durur.
    const sB0 = await snapshot(su);
    const bk = await pool.connect();
    let bkErr = "";
    try {
      await bk.query(buildApplyText(body + "\nUPDATE public.users SET full_name = full_name || ' (zz)' WHERE role = 'expert';\n"));
    } catch (e) {
      bkErr = (e as Error).message;
    } finally {
      await bk.query("ROLLBACK").catch(() => undefined);
      bk.release();
    }
    ok(/veri bekcisi/.test(bkErr) && diffKeys(sB0, await snapshot(su)).length === 0,
      "F3 veri bekçisi: mevcut kullanıcı verisi değişirse uygulama durur, hiçbir şey kalıcılaşmaz", bkErr.slice(0, 120));

    console.log("\n[A] Gerçek uygulama metni (izole DB'de COMMIT)");
    const postSql = readFileSync(path.join(process.cwd(), "scripts/uye-arsiv-4a/prod-postcheck.sql"), "utf8");
    ok(!/\b(insert|update|delete|create|alter|drop|truncate|grant|revoke|copy|vacuum|lock|call)\b/i.test(postSql.replace(/--.*$/gm, "")),
      "P0 uygulama sonrası doğrulama sorgusu salt-okunur (yazma/DDL anahtar kelimesi yok)");
    const z6Sql = postSql.slice(postSql.indexOf("SELECT 'Z6 veri_parmak_izi'"));
    const z6Before = (await su.query(`begin transaction read only; ${z6Sql} rollback;`) as unknown as { rows: Record<string, unknown>[] }[])
      .flatMap((r) => r.rows ?? []).find((r) => r.kontrol === "Z6 veri_parmak_izi");
    const userDataBefore = (await su.query(`select md5(string_agg((to_jsonb(u) - 'archived_at')::text, E'\\n' order by u.id)) h from public.users u`)).rows[0].h;
    const otherBefore = { ...s0 };
    await su.query(buildApplyText(body));
    const sA = await snapshot(su);
    const changed = diffKeys(otherBefore, sA).sort();
    ok(JSON.stringify(changed) === JSON.stringify(["fonksiyonlar", "kisitlar", "kolonlar", "ledger", "tetikleyiciler", "users", "yorumlar"].sort()),
      "A1 yalnız beklenen alanlar değişti (fonksiyon, kısıt, kolon, yorum, tetikleyici, ledger; users yalnız yeni NULL kolon nedeniyle)", changed);
    ok((await su.query(`select md5(string_agg((to_jsonb(u) - 'archived_at')::text, E'\\n' order by u.id)) h from public.users u`)).rows[0].h === userDataBefore
       && (await su.query(`select count(*)::int n from public.users where archived_at is not null`)).rows[0].n === 0,
      "A2 mevcut kullanıcı satırları birebir aynı (archived_at hepsinde NULL; backfill yok)");
    for (const k of ["oturumlar", "odeme_gecmisi", "fiyat_donemleri", "deneme_profilleri", "yonetim_gecmisi", "bildirimler", "danisanlar"]) {
      ok(sA[k] === s0[k], `A3 ${k} birebir aynı`);
    }
    const led = (await su.query(`select version, name, created_by from supabase_migrations.schema_migrations where version=$1`, [MIG_VERSION])).rows;
    ok(led.length === 1 && led[0].created_by === "pr780-uye-arsiv-4a", "A4 ledger kaydı migration ile AYNI işlemde yazıldı", led);
    const acl = (await su.query(`select p.proname, has_function_privilege('anon',p.oid,'EXECUTE') a, has_function_privilege('authenticated',p.oid,'EXECUTE') au,
        has_function_privilege('service_role',p.oid,'EXECUTE') s from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname in ('admin_archive_user','admin_set_user_active','admin_unarchive_user','admin_list_members_v2')`)).rows;
    ok(acl.length === 4 && acl.every((r) => r.a === false && r.au === false && r.s === true), "A5 yetkiler: yalnız service_role", acl);
    const post = (await su.query(`begin transaction read only; ${postSql} rollback;`) as unknown as { rows: Record<string, unknown>[] }[]).flatMap((r) => r.rows ?? []);
    const z = (k: string) => post.filter((r) => r.kontrol === k);
    const z1 = z("Z1 nesneler")[0];
    ok(z1 && z1.archived_at_kolonu === true && z1.arsiv_check_dogrulanmis === true && z1.unarchive_fn === true && Number(z1.ledger_000600) === 1 && Number(z1.audit_eylem_sayisi) === 33,
      "P1 doğrulama Z1: kolon, doğrulanmış CHECK, fonksiyon, ledger 1, audit 33 eylem", z1);
    ok(z("Z2 parmak_izi").length === 10, "P2 doğrulama Z2: 10 fonksiyon parmak izi üretildi");
    ok(z("Z3 tetikleyiciler").length === 5 && z("Z3 tetikleyiciler").every((r) => r.durum === "O"), "P3 doğrulama Z3: 5 koruma tetikleyicisi etkin", z("Z3 tetikleyiciler"));
    ok(z("Z4 yetki").length === 4 && z("Z4 yetki").every((r) => r.anon === false && r.authenticated === false && r.service_role === true), "P4 doğrulama Z4: yalnız service_role");
    const z5 = z("Z5 durum")[0];
    ok(z5 && Number(z5.arsivde) === 0 && Number(z5.aktif_arsiv_celiskisi) === 0 && Number(z5.purge_context_satir) === 0, "P5 doğrulama Z5: arşivde 0, çelişki 0, purge işareti 0", z5);
    ok(JSON.stringify(z("Z6 veri_parmak_izi")[0]) === JSON.stringify(z6Before), "P6 doğrulama Z6: veri parmak izi ÖNCE = SONRA (uygulama yalnız şemayı değiştirdi)");
    const sA2 = await snapshot(su);
    let dupErr = "";
    const d = await pool.connect();
    try { await d.query(buildApplyText(body)); } catch (e) { dupErr = (e as { code?: string }).code ?? (e as Error).message; } finally { await d.query("ROLLBACK").catch(() => undefined); d.release(); }
    ok(dupErr === "23505" && diffKeys(sA2, await snapshot(su)).length === 0, "A6 ikinci uygulama denemesi ledger PK ile tamamen geri alındı (çift uygulama yok)", dupErr);
  } finally {
    await db.stop();
  }
  console.log(`\n──────────\nAŞAMA 4a MIGRATION PROVASI: PASS ${pass} · FAIL ${fail}`);
  if (fail > 0) { for (const x of failures) console.error(`  ✗ ${x}`); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error("BEKLENMEYEN:", e); process.exit(1); });
