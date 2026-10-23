/**
 * FAZ 8 — Çizim katmanı MIGRATION PROVASI (yalnız izole embedded-postgres; prod/preview'a SIFIR temas).
 * Önkoşul reddi (20271125 yokken) · sıralı temiz uygulama · iki kez uygulama · ayrıcalık kilidi · RLS · mevcut tablo
 * parmak izi DEĞİŞMEDİ · DB kısıtları ('<' '>' reddi, tam olarak bir kaynak, revizyon tek adım, denetim append-only).
 * Çalıştır: npx tsx scripts/hd-education/annotations/annotation-migration-rehearsal.ts   (HD_EDU_ANN_PG_PORT, varsayılan 54791)
 */
import "../../hd-analysis-word-flow/env";
import { randomUUID } from "node:crypto";
import { startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { privateArchiveSql } from "../private/pgSchema";
import { ANN_MIGRATION, readMig } from "./annSeed";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const TABLES = ["hd_edu_annotation_layers", "hd_edu_annotation_audit"];
const EXISTING = ["users", "human_design_clients", "human_design_charts", "hd_education_subjects", "hd_education_publications", "hd_education_charts",
  "hd_education_access_grants", "hd_edu_private_items", "hd_edu_private_consents", "hd_edu_private_audit"];

async function fingerprint(env: TestEnv): Promise<string> {
  const cols = await env.su.query(`select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
      where table_schema='public' and table_name = any($1) order by 1,2`, [EXISTING]);
  const privs = await env.su.query(`select table_name, grantee, privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name = any($1) order by 1,2,3`, [EXISTING]);
  const trg = await env.su.query(`select event_object_table, trigger_name from information_schema.triggers where event_object_schema='public' and event_object_table = any($1) order by 1,2`, [EXISTING]);
  const cons = await env.su.query(`select conrelid::regclass::text t, conname from pg_constraint where conrelid::regclass::text = any($1) order by 1,2`, [EXISTING]);
  const fns = await env.su.query(`select p.proname, md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'hd_edu_priv_%' or p.proname like 'hd_education_%') order by 1,2`);
  return JSON.stringify([cols.rows, privs.rows, trg.rows, cons.rows, fns.rows]);
}

async function main() {
  const p = Number(process.env.HD_EDU_ANN_PG_PORT ?? 54791);

  console.log("\n[1 · önkoşulsuz (20271125 yok) → RED]");
  const e1 = await startAnamnezTestEnv({ port: p, dirName: `hd-edu-ann-mig-a-${Date.now()}-${randomUUID().slice(0, 6)}`, extraSql: privateArchiveSql({ withPrivate: false }) });
  try {
    let err = "";
    try { await e1.su.query(readMig(ANN_MIGRATION)); } catch (e) { err = String((e as Error).message); await e1.su.query("ROLLBACK").catch(() => undefined); }
    ok(/precondition/.test(err), "özel arşiv (20271125) YOKKEN çizim migration'ı önkoşul hatasıyla reddedildi", err.slice(0, 160));
    const left = await e1.su.query(`select count(*)::int n from pg_class where relname like 'hd_edu_annotation_%'`);
    ok(left.rows[0].n === 0, "reddedilen uygulamadan tablo kalmadı (BEGIN/COMMIT bütünlüğü)");
  } finally { await e1.stop(); }

  console.log("\n[2 · sıralı: 20271110/12/13 → 20271125 → 20271126, iki kez]");
  const env = await startAnamnezTestEnv({ port: p + 1, dirName: `hd-edu-ann-mig-b-${Date.now()}-${randomUUID().slice(0, 6)}`, extraSql: privateArchiveSql() });
  try {
    const before = await fingerprint(env);
    await env.su.query(readMig(ANN_MIGRATION));
    ok(true, "temiz uygulama");
    await env.su.query(readMig(ANN_MIGRATION));
    ok(true, "ikinci uygulama (idempotent) hatasız");
    ok(before === await fingerprint(env), "mevcut users / HD / merkezî / özel arşiv tablolarının kolon + ayrıcalık + tetikleyici + kısıt + fonksiyon parmak izi DEĞİŞMEDİ");
    const privs = await env.su.query(`select table_name, grantee, privilege_type from information_schema.role_table_grants
        where table_schema='public' and table_name = any($1) and grantee in ('PUBLIC','anon','authenticated','service_role')`, [TABLES]);
    ok(privs.rows.length === 0, "2 yeni tabloda PUBLIC/anon/authenticated/service_role tablo ayrıcalığı YOK", privs.rows);
    const rls = await env.su.query(`select relname, relrowsecurity from pg_class where relname = any($1)`, [TABLES]);
    ok(rls.rows.length === 2 && rls.rows.every((r) => r.relrowsecurity === true), "2 tabloda RLS açık");
    ok((await env.su.query(`select count(*)::int n from pg_policies where tablename = any($1)`, [TABLES])).rows[0].n === 0, "policy yok (varsayılan deny)");
    const fn = await env.su.query(`select p.proname, has_function_privilege('service_role', p.oid, 'EXECUTE') sr, has_function_privilege('anon', p.oid, 'EXECUTE') an,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') au, p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'hd_edu_ann_%'`);
    const internal = ["hd_edu_ann_audit_guard", "hd_edu_ann_layer_guard", "hd_edu_ann_central_actor", "hd_edu_ann_trainer_source", "hd_edu_ann_layer_json"];
    ok(fn.rows.every((r) => r.an === false && r.au === false), "anon/authenticated hiçbir hd_edu_ann_* fonksiyonunu çalıştıramaz");
    ok(fn.rows.filter((r) => internal.includes(r.proname)).every((r) => r.sr === false), "iç yardımcılar service_role'e de KAPALI");
    ok(fn.rows.filter((r) => !internal.includes(r.proname)).length === 9 && fn.rows.filter((r) => !internal.includes(r.proname)).every((r) => r.sr === true && r.prosecdef === true),
      "9 API RPC (FAZ 9: +eğitmen veri durumu, +kalıcı silme önizleme/uygulama): yalnız service_role + SECURITY DEFINER");
    await env.su.query("set role service_role");
    let denied = 0;
    for (const t of TABLES) { try { await env.su.query(`select 1 from public.${t} limit 1`); } catch (e) { if ((e as { code?: string }).code === "42501") denied++; } }
    await env.su.query("reset role");
    ok(denied === 2, "service_role 2 tablonun HİÇBİRİNİ doğrudan okuyamaz (42501)", denied);

    // DB kısıtları (kod hatası olsa bile).
    const tenant = randomUUID(), uid = randomUUID();
    await env.su.query(`insert into public.tenants(id,name) values ($1,'ZZ')`, [tenant]);
    await env.su.query(`insert into public.users(id, full_name, email, role, active, tenant_id) values ($1,'ZZ','zz.ann@example.test','expert',true,$2)`, [uid, tenant]);
    const subj = randomUUID();
    await env.su.query(`insert into public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, documented_local_time, document_quote, utc_status, legal_status)
                        values ($1,$2,'ZZ','ZZ','bilim',false,'1900-01-01','ZZ','ZZ','ZZ','PENDING_VERIFICATION','LOW_UNREVIEWED')`, [subj, `zz-mig-${subj.slice(0, 8)}-1900-01-01`]);
    const ins = (doc: unknown, n: number, kind = "central", ref: string | null = subj, priv: string | null = null) => env.su.query(
      `insert into public.hd_edu_annotation_layers (tenant_id, trainer_user_id, source_kind, central_subject_id, private_item_id, doc, el_count) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [tenant, uid, kind, ref, priv, JSON.stringify(doc), n]).then(() => "ok", (e: { code?: string }) => e.code ?? "err");
    ok(await ins({ v: 1, els: [{ id: "x1x1", t: "text", s: "<script>alert(1)</script>" }] }, 1) === "23514", "DB: '<' içeren belge doğrudan INSERT'te bile REDDEDİLİR");
    ok(await env.su.query(`insert into public.hd_edu_annotation_layers (tenant_id, trainer_user_id, source_kind, central_subject_id, doc, el_count)
        values ($1,$2,'central',$3,'{"v":1,"els":[{"s":"\\u003cb\\u003e"}]}'::jsonb,1)`, [tenant, uid, subj]).then(() => "ok", (e: { code?: string }) => e.code) === "23514",
      "DB: JSON kaçışıyla (\\u003c) gizlenmiş '<' de çözülüp REDDEDİLİR");
    await env.su.query(`delete from public.hd_edu_annotation_layers`);
    ok(await ins({ v: 1, els: [] }, 0, "central", subj, randomUUID()) === "23514", "DB: iki kaynak birden → RED (tam olarak bir kaynak)");
    ok(await ins({ v: 1, els: [] }, 3) === "23514", "DB: el_count belgeyle tutarsız → RED");
    ok(await ins({ v: 2, els: [] }, 0) === "23514", "DB: bilinmeyen belge sürümü → RED");
    ok(await ins({ v: 1, els: [] }, 0) === "ok", "geçerli boş belge kabul");
    ok(await env.su.query(`update public.hd_edu_annotation_layers set revision = revision + 5`).then(() => "ok", (e: { code?: string }) => e.code) === "23514", "DB: revizyon atlatılamaz (tek adım)");
    ok(await env.su.query(`update public.hd_edu_annotation_layers set trainer_user_id = $1`, [randomUUID()]).then(() => "ok", (e: { code?: string }) => e.code) !== "ok", "DB: katmanın sahibi değiştirilemez");
    await env.su.query(`insert into public.hd_edu_annotation_audit (tenant_id, actor_kind, action) values ($1,'trainer','layer_created')`, [tenant]);
    ok(await env.su.query(`delete from public.hd_edu_annotation_audit`).then(() => "ok", (e: { code?: string }) => e.code) === "23514", "denetim izi silinemez (append-only)");
    ok(await env.su.query(`update public.hd_edu_annotation_audit set action='owner_viewed'`).then(() => "ok", (e: { code?: string }) => e.code) === "23514", "denetim izi değiştirilemez");
    const cols = await env.su.query(`select column_name from information_schema.columns where table_name = 'hd_edu_annotation_layers' order by 1`);
    const colNames = cols.rows.map((r) => r.column_name as string);
    ok(!colNames.some((c) => /birth|provider|computed|raw|name|place|utc/.test(c)), "katman tablosunda doğum / sağlayıcı / hesap / isim kolonu YOK (kopya yok)", colNames);
  } finally { await env.stop(); }

  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });
