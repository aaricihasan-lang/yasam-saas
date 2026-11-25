/**
 * I18N-F1-R5 / A6 — human_design_chart_narratives migration TASLAĞI: PGlite (bellek-içi) SENTETİK test.
 * Gerçek / prod DB YOK, gerçek danışan verisi YOK. Taslak repoda değil → yol argümanla (varsayılan: kanıt klasörü).
 * Çalıştırma: npx tsx scripts/hd-i18n/narrative-migration.pglite.ts [taslak.sql]
 */
import { readFileSync, existsSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const DRAFT = process.argv[2] ?? "C:/YasamSistemi-Kanit/I18N-F1-R5-2026-11-25/migration/hd-anlati-20280127000000_hd_chart_narratives.sql";

let pass = 0;
let failN = 0;
function ok(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    failN++;
    console.log(`  ✗ ${name}${detail === undefined ? "" : ` — ${String(detail).slice(0, 300)}`}`);
  }
}

const TA = "11111111-1111-4111-8111-111111111111";
const TB = "22222222-2222-4222-8222-222222222222";
const CH = "d0000000-0000-4000-8000-0000000000a1";
const CH2 = "d0000000-0000-4000-8000-0000000000a2";
const K1 = "a".repeat(64);
const SHA = "b".repeat(64);

async function errCode(db: PGlite, sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "ERR";
  }
}

const INS = `INSERT INTO public.human_design_chart_narratives
  (tenant_id, chart_id, cache_key, endpoint, adapter_version, narrative_version, node_type, lang, chart_input_hash, canonical_sha, provider_raw)
  VALUES ($1, $2, $3, '/human-design/bodygraph', 'roxy-bodygraph-1', 'hd-narrative-1', 'true', $4, 'h', $5, $6::jsonb)`;

async function main() {
  if (!existsSync(DRAFT)) {
    console.log(`taslak bulunamadı: ${DRAFT}`);
    console.log("\n=== HD ANLATI MIGRATION (PGlite): 0 PASS / 1 FAIL ===");
    process.exit(1);
  }
  const sql = readFileSync(DRAFT, "utf8");
  const db = new PGlite();
  // Sentetik minimum şema (Supabase rolleri + human_design_charts'ın ilgili kolonları).
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    CREATE TABLE public.human_design_charts (
      id uuid PRIMARY KEY, tenant_id uuid, source text, provider text, input jsonb, input_hash text,
      computed_result jsonb, provider_raw jsonb
    );
    GRANT SELECT ON public.human_design_charts TO service_role;
    INSERT INTO public.human_design_charts VALUES
      ('${CH}', '${TA}', 'computed', 'roxyapi', '{"lang":"tr"}', 'h', '{"type":"Generator"}', '{"type":"Generator","typeDescription":"TR"}'),
      ('${CH2}', '${TB}', 'computed', 'roxyapi', '{"lang":"tr"}', 'h2', '{"type":"Projector"}', '{"type":"Projector"}');
  `);
  const chartsBefore = JSON.stringify((await db.query("SELECT * FROM public.human_design_charts ORDER BY id")).rows);

  let applyErr: unknown = null;
  try {
    await db.exec(sql);
  } catch (e) {
    applyErr = e;
  }
  ok("M1 taslak uygulanır", applyErr === null, applyErr);
  let twiceErr: unknown = null;
  try {
    await db.exec(sql);
  } catch (e) {
    twiceErr = e;
  }
  ok("M2 ikinci kez uygulanır (idempotent)", twiceErr === null, twiceErr);

  ok("M3 geçerli EN satırı eklenir", (await errCode(db, INS, [TA, CH, K1, "en", SHA, '{"type":"Generator","typeDescription":"EN"}'])) === null);
  ok("M4 lang='tr' reddedilir (TR kaynağı provider_raw; çoğaltma yok)", (await errCode(db, INS, [TA, CH, "c".repeat(64), "tr", SHA, "{}"])) === "23514");
  ok("M5 başka tenant'ın haritasına satır reddedilir (tetikleyici 23514)", (await errCode(db, INS, [TA, CH2, "d".repeat(64), "en", SHA, "{}"])) === "23514");
  ok("M6 olmayan harita reddedilir (23503)", (await errCode(db, INS, [TA, "d0000000-0000-4000-8000-0000000000ff", "e".repeat(64), "en", SHA, "{}"])) === "23503");
  ok("M7 aynı (tenant, harita, cache_key) ikinci kez eklenemez (23505)", (await errCode(db, INS, [TA, CH, K1, "en", SHA, "{}"])) === "23505");
  ok("M8 geçersiz cache_key / canonical_sha reddedilir", (await errCode(db, INS, [TA, CH, "XYZ", "en", SHA, "{}"])) === "23514" && (await errCode(db, INS, [TA, CH, "f".repeat(64), "en", "kisa", "{}"])) === "23514");
  ok("M9 provider_raw nesne olmalı", (await errCode(db, INS, [TA, CH, "9".repeat(64), "en", SHA, "[]"])) === "23514");

  const chartsAfter = JSON.stringify((await db.query("SELECT * FROM public.human_design_charts ORDER BY id")).rows);
  ok("M10 human_design_charts satırları bayt-bayt aynı (anlatı yazımı haritaya dokunmaz)", chartsAfter === chartsBefore);

  const rls = (await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname = 'human_design_chart_narratives'")).rows[0];
  ok("M11 RLS etkin (policy yok = deny-by-default)", rls?.relrowsecurity === true);
  const pol = (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'human_design_chart_narratives'")).rows[0];
  ok("M12 hiçbir RLS policy yok", pol?.n === 0);
  const grants = (await db.query<{ grantee: string; privilege_type: string }>(
    "SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name = 'human_design_chart_narratives' AND grantee IN ('anon','authenticated')",
  )).rows;
  ok("M13 anon / authenticated için tablo yetkisi YOK", grants.length === 0, JSON.stringify(grants));
  const sr = (await db.query<{ privilege_type: string }>(
    "SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name = 'human_design_chart_narratives' AND grantee = 'service_role' ORDER BY 1",
  )).rows.map((r) => r.privilege_type).join(",");
  ok("M14 service_role: SELECT/INSERT/UPDATE/DELETE", sr === "DELETE,INSERT,SELECT,UPDATE", sr);
  // Yetki kontrolünün çalışma anında da geçerli olduğu (PGlite rol değişimi destekliyorsa).
  await db.exec("SET ROLE authenticated");
  const denied = await errCode(db, "SELECT * FROM public.human_design_chart_narratives");
  await db.exec("RESET ROLE");
  ok("M15 authenticated rolüyle SELECT reddedilir (42501)", denied === "42501", denied);

  await db.query("DELETE FROM public.human_design_charts WHERE id = $1", [CH]);
  const left = (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.human_design_chart_narratives")).rows[0];
  ok("M16 harita silinince anlatılar CASCADE silinir", left?.n === 0);

  await db.close();
  console.log(`\n=== HD ANLATI MIGRATION (PGlite): ${pass} PASS / ${failN} FAIL ===`);
  process.exit(failN ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  console.log(`\n=== HD ANLATI MIGRATION (PGlite): ${pass} PASS / ${failN + 1} FAIL ===`);
  process.exit(1);
});
