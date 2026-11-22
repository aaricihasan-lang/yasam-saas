/**
 * 12. aşama — V1 silme şablonunun (docs/sifa-rehberi-v2/v1-silme/02) DAVRANIŞ testi (yerel GEÇİCİ PostgreSQL; ağ/prod YOK).
 * Gerçek V1 migration'ları + sentetik kayıtlar; şablonun DO bloğu değerleri doldurularak çalıştırılır.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/v1-silme.pg.harness.mts
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";

let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${!c && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
const M = (f: string) => readFileSync(path.resolve("supabase/migrations", f), "utf8");
const PLAN = readFileSync(path.resolve("docs/sifa-rehberi-v2/v1-silme/02_silme_plani_CALISTIRMA.sql"), "utf8");
const DO_BLOCK = PLAN.slice(PLAN.indexOf("DO $$"), PLAN.indexOf("$$;") + 3);
const fill = (tenants: string[], g: number, s: number) =>
  DO_BLOCK.replace("ARRAY[]::uuid[]", `ARRAY[${tenants.map((t) => `'${t}'`).join(",")}]::uuid[]`)
    .replace("v_exp_guides     int    := -1", `v_exp_guides     int    := ${g}`)
    .replace("v_exp_sections   int    := -1", `v_exp_sections   int    := ${s}`);

const port = await new Promise<number>((res) => {
  const srv = net.createServer();
  srv.listen(0, "127.0.0.1", () => {
    const p = (srv.address() as net.AddressInfo).port;
    srv.close(() => res(p));
  });
});
const dir = path.join(os.tmpdir(), `v1-silme-${process.pid}`);
const epg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "x", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
await epg.initialise();
await epg.start();
const c = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password: "x", database: "postgres" });
await c.connect();
const q = (s: string, p?: unknown[]) => c.query(s, p);
try {
  await q(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create extension pgcrypto;`);
  const legacy = ["general_summary", "medical_causes", "subconscious_causes", "temperament_causes", "other_causes", "iridology_match", "hand_analysis_match", "cupping_leech", "reflexology", "diet_recommendations", "herbal_methods", "stone_recommendations", "aromatherapy", "meditation", "breathwork", "bioenergy", "massage", "daily_routine", "sleep_routine", "supportive_alternative_methods", "islamic_recommendations"];
  await q(`create table public.healing_guides (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text not null, category text, symptoms text,
    created_at timestamptz not null default now(), updated_at timestamptz, images jsonb default '[]'::jsonb, related_stones jsonb, related_reflexology jsonb, ${legacy.map((x) => `${x} text`).join(", ")})`);
  for (const f of ["20260520120000_healing_guide_sections.sql", "20260521120000_healing_guide_applications_section.sql", "20261201000000_lock_healing_guide_sections_anon.sql", "20261202000000_healing_guide_sections_faz2_provenance_notes.sql", "20261211000000_sifa_rehberi_search.sql", "20261213000000_healing_guides_transfer_provenance.sql", "20270108000000_sifa_create_healing_guide_with_sections.sql"]) await q(M(f));
  await q("create table public.other_module_records (id uuid primary key default gen_random_uuid(), tenant_id uuid, payload text)");
  const TA = randomUUID(), TB = randomUUID(), TX = randomUUID();
  const mk = async (t: string, sections: number) => {
    const r = (await q("select public.create_healing_guide_with_sections($1::uuid, $2::jsonb, $3::jsonb, $4::uuid) r", [t, JSON.stringify({ name: `ZZ ${t.slice(0, 4)}` }), JSON.stringify(Array.from({ length: sections }, (_, i) => ({ section_type: "reasons", mode: "genel_ozet", note: `not ${i}` }))), randomUUID()])).rows[0].r;
    return r;
  };
  await mk(TA, 2);
  await mk(TA, 1);
  await mk(TB, 3);
  await mk(TX, 1); // kapsam DIŞI tenant
  await q("insert into public.other_module_records (tenant_id, payload) values ($1,'başka modül'),($2,'başka modül')", [TA, TB]);
  const counts = async () => (await q(`select (select count(*) from public.healing_guides)::int g, (select count(*) from public.healing_guide_sections)::int s,
     (select count(*) from public.healing_guide_create_idempotency)::int i, (select count(*) from public.other_module_records)::int o`)).rows[0];
  const c0 = await counts();
  ok(c0.g === 4 && c0.s === 7 && c0.i === 4, "sentetik V1: 4 rehber / 7 bölüm / 4 idempotency (3 tenant)", c0);

  const tryRun = async (sql: string) => {
    await q("BEGIN");
    try {
      await q(sql);
      return { err: "", c: await counts() };
    } catch (e) {
      return { err: (e as Error).message, c: null };
    } finally {
      await q("ROLLBACK");
    }
  };
  let r = await tryRun(fill([TA, TB], 3, 6));
  ok(/listede olmayan 1 tenant/.test(r.err), "kapsam DIŞI tenant varken DURUR (silmez)", r.err);
  r = await tryRun(fill([TA, TB, TX], 5, 7));
  ok(/sayılar envanterden farklı/.test(r.err), "beklenen sayı uyuşmazsa DURUR (bayat envanter)", r.err);
  r = await tryRun(fill([TA, TB, TX], 4, 7));
  ok(r.err === "" && r.c?.g === 0 && r.c?.s === 0 && r.c?.i === 0 && r.c?.o === 2, "doğru envanterle: rehber + bölüm + idempotency (CASCADE) 0; başka modül verisi AYNEN", r);
  ok(JSON.stringify(await counts()) === JSON.stringify(c0), "ROLLBACK sonrası veri birebir geri (COMMIT elle olduğu için güvenli)");
} catch (e) {
  fail++;
  console.log(String((e as Error).stack ?? e).slice(0, 500));
} finally {
  await c.end().catch(() => {});
  await epg.stop().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
