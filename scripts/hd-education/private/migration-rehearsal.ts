/**
 * FAZ 6 — Özel eğitim arşivi MIGRATION PROVASI (yalnız izole embedded-postgres; prod/preview'a SIFIR temas).
 * Kontroller: temiz uygulama · iki kez uygulama (idempotent) · varsayılan kapalı durum · ayrıcalık kilidi (hiçbir role tablo
 * ayrıcalığı yok) · merkezî katalog migration'larıyla (20271110/12/13) HER İKİ SIRADA birlikte uygulanabilirlik (bağımsızlık) ·
 * mevcut HD tablolarının kolon/ayrıcalık parmak izi DEĞİŞMEDİ · izin metni SHA tutarlılığı.
 * Çalıştır: npx tsx scripts/hd-education/private/migration-rehearsal.ts   (HD_EDU_PRIV_PG_PORT, varsayılan 54731)
 */
import "../../hd-analysis-word-flow/env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { privateArchiveSql, PRIVATE_MIGRATION } from "./pgSchema";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const CENTRAL = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql", "20271113000000_hd_education_chart_provider_body.sql"];
const PRIV_TABLES = ["hd_edu_private_control", "hd_edu_private_consent_texts", "hd_edu_private_consents",
  "hd_edu_private_consent_evidence", "hd_edu_private_items", "hd_edu_private_audit"];
const HD_TABLES = ["human_design_clients", "human_design_charts", "human_design_reports", "human_design_knowledge_records", "users", "clients"];

async function fingerprintExisting(env: TestEnv): Promise<string> {
  const cols = await env.su.query(
    `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
      where table_schema='public' and table_name = any($1) order by table_name, column_name`, [HD_TABLES]);
  const privs = await env.su.query(
    `select table_name, grantee, privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name = any($1) order by 1,2,3`, [HD_TABLES]);
  const trg = await env.su.query(
    `select event_object_table, trigger_name from information_schema.triggers where event_object_schema='public' and event_object_table = any($1) order by 1,2`, [HD_TABLES]);
  const cons = await env.su.query(
    `select conrelid::regclass::text t, conname from pg_constraint where conrelid::regclass::text = any($1) order by 1,2`, [HD_TABLES.map((t) => `${t}`)]);
  return JSON.stringify([cols.rows, privs.rows, trg.rows, cons.rows]);
}

async function run(label: string, port: number, order: "no-central" | "central-first") {
  console.log(`\n[${label}]`);
  const base = privateArchiveSql({ withPrivate: false, withCentral: false });
  const env = await startAnamnezTestEnv({ port, dirName: `hd-edu-priv-mig-${order}-${Date.now()}-${randomUUID().slice(0, 6)}`, extraSql: base });
  try {
    const before = await fingerprintExisting(env);
    const priv = readMig(PRIVATE_MIGRATION);
    if (order === "no-central") {
      // FAZ 8 TEK YETKİ: 20271110 olmadan özel arşiv migration'ı ÖNKOŞUL hatasıyla durmalı (yarım şema yok).
      let err = "";
      try { await env.su.query(priv); } catch (e) { err = String((e as Error).message); await env.su.query("ROLLBACK").catch(() => undefined); }
      ok(/precondition/.test(err), "20271110 YOKKEN özel arşiv migration'ı önkoşul hatasıyla reddedildi", err.slice(0, 160));
      const left = await env.su.query(`select count(*)::int n from pg_class where relname like 'hd_edu_private_%'`);
      ok(left.rows[0].n === 0, "reddedilen uygulamadan hiç tablo kalmadı (BEGIN/COMMIT bütünlüğü)");
      return;
    }
    for (const f of CENTRAL) await env.su.query(readMig(f));
    await env.su.query(priv);
    ok(true, "sıralı uygulama (20271110/12/13 → 20271125) temiz");
    await env.su.query(priv);
    ok(true, "ikinci uygulama (idempotent) hatasız");
    const after = await fingerprintExisting(env);
    // Not: yeni tablolar mevcut tablolara FK ekler; mevcut tablonun kendi kolon/ayrıcalık/tetikleyici/kısıt kümesi değişmez.
    ok(before === after, "mevcut HD / users / clients tablolarının kolon + ayrıcalık + tetikleyici + kısıt parmak izi DEĞİŞMEDİ");
    const ctl = await env.su.query(`select archive_open from public.hd_edu_private_control`);
    ok(ctl.rows.length === 1 && ctl.rows[0].archive_open === false, "arşiv anahtarı varsayılan KAPALI (tek satır)");
    const txt = await env.su.query(`select version, approved_for_use, body_sha256 = encode(sha256(convert_to(body,'UTF8')),'hex') as sha_ok from public.hd_edu_private_consent_texts`);
    ok(txt.rows.length === 1 && txt.rows[0].version === "hd-egitim-izin-v1" && txt.rows[0].approved_for_use === false && txt.rows[0].sha_ok === true,
      "izin metni v1 TASLAK, kullanıma ONAYSIZ, SHA tutarlı", txt.rows);
    const n = await env.su.query(`select (select count(*) from public.hd_education_access_grants)::int g, (select count(*) from public.hd_edu_private_items)::int i,
                                         (select count(*) from public.hd_edu_private_consents)::int c`);
    ok(n.rows[0].g === 0 && n.rows[0].i === 0 && n.rows[0].c === 0, "yetki 0 / kayıt 0 / izin 0");
    const privs = await env.su.query(
      `select table_name, grantee, privilege_type from information_schema.role_table_grants
        where table_schema='public' and table_name = any($1) and grantee in ('PUBLIC','anon','authenticated','service_role')`, [PRIV_TABLES]);
    ok(privs.rows.length === 0, "6 yeni tabloda PUBLIC/anon/authenticated/service_role tablo ayrıcalığı YOK", privs.rows);
    const rls = await env.su.query(`select relname, relrowsecurity from pg_class where relname = any($1)`, [PRIV_TABLES]);
    ok(rls.rows.length === 6 && rls.rows.every((r) => r.relrowsecurity === true), "6 tabloda RLS açık");
    const pol = await env.su.query(`select count(*)::int n from pg_policies where tablename = any($1)`, [PRIV_TABLES]);
    ok(pol.rows[0].n === 0, "policy yok (varsayılan deny)");
    const fnPriv = await env.su.query(`
      select p.proname, has_function_privilege('service_role', p.oid, 'EXECUTE') sr, has_function_privilege('anon', p.oid, 'EXECUTE') an,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') au, p.prosecdef
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname like 'hd_edu_priv_%'`);
    const internal = ["hd_edu_priv_text_guard", "hd_edu_priv_consent_guard", "hd_edu_priv_evidence_guard",
      "hd_edu_priv_item_guard", "hd_edu_priv_audit_guard", "hd_edu_priv_chart_fp", "hd_edu_priv_is_owner", "hd_edu_priv_resolve_actor",
      "hd_edu_priv_can_touch", "hd_edu_priv_item_state"];
    ok(fnPriv.rows.every((r) => r.an === false && r.au === false), "anon/authenticated hiçbir hd_edu_priv_* fonksiyonunu çalıştıramaz");
    ok(fnPriv.rows.filter((r) => internal.includes(r.proname)).every((r) => r.sr === false), "iç yardımcılar service_role'e de KAPALI");
    ok(fnPriv.rows.filter((r) => !internal.includes(r.proname)).every((r) => r.sr === true && r.prosecdef === true), "API RPC'leri: yalnız service_role + SECURITY DEFINER");
    // service_role doğrudan tabloya erişemez.
    await env.su.query("set role service_role");
    let denied = 0;
    for (const t of PRIV_TABLES) {
      try { await env.su.query(`select 1 from public.${t} limit 1`); } catch (e) { if ((e as { code?: string }).code === "42501") denied++; }
    }
    await env.su.query("reset role");
    ok(denied === 6, "service_role 6 tablonun HİÇBİRİNİ doğrudan okuyamaz (42501)", denied);
    {
      const cen = await env.su.query(`select count(*)::int n from pg_class where relname like 'hd_education_%' and relkind='r'`);
      ok(cen.rows[0].n === 7, "merkezî 7 tablo aynen mevcut", cen.rows);
      const shared = await env.su.query(`select proname from pg_proc where proname like 'hd_edu_priv_%' and prosrc like '%hd_education_%' order by 1`);
      ok(shared.rows.map((r) => r.proname).join(",") === "hd_edu_priv_owner_overview,hd_edu_priv_resolve_actor",
        "merkezî nesneye BİLİNÇLİ bağımlılık yalnız TEK yetki (resolve_actor) + owner yetki listesi", shared.rows);
      const priv2 = await env.su.query(`select count(*)::int n from pg_class where relname = 'hd_edu_private_grants'`);
      ok(priv2.rows[0].n === 0, "ayrı özel arşiv yetki tablosu YOK (tek kaynak)");
    }
  } finally {
    await env.stop();
  }
}

async function main() {
  const p = Number(process.env.HD_EDU_PRIV_PG_PORT ?? 54731);
  await run("1 · önkoşulsuz (20271110 yok) → RED", p, "no-central");
  await run("2 · sıralı: merkezî (20271110/12/13) → özel (20271125), iki kez", p + 1, "central-first");
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });
