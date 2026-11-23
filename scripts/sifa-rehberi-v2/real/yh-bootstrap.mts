/**
 * 10. aşama — TEST projesine YH çekirdeği + Şifa V2 sahiplik migration'ı (yalnız guard'lı test projesi).
 *   1) Ön koşul: yasam_hafizasi_index YOK (tek seferlik; YH şeması boş olmalı).
 *   2) GERÇEK YH çekirdek migration dosyaları, sırayla ve DEĞİŞTİRİLMEDEN (her dosya kendi işlemi):
 *      index · eklentiler (unaccent, vector) · sözlüksel altyapı · arama v1 · outbox · mutabakat · aktivasyon.
 *   3) Sentetik + boş stub: public.stone_exclusions (arama RPC'leri sorgu planında ister; Doğaltaş modülü
 *      bu projede yok). RLS açık, tarayıcı rollerine kapalı.
 *   4) supabase/migrations/20280110000100_yh_owner_scope_sifa_v2.sql (İKİ KEZ: idempotentlik).
 * Aktivasyon (yh_source_activation) burada YAPILMAZ — e2e testi kendi yapar.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/yh-bootstrap.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { connectTestDb, redact } from "./guard";

const FILES = [
  "20260710000000_yasam_hafizasi_index.sql",
  "20260711000000_enable_yasam_hafizasi_extensions.sql",
  "20260712000000_yasam_hafizasi_lexical_infra.sql",
  "20260724000000_yh_search_candidates_rpc.sql",
  "20260815000000_yasam_hafizasi_outbox.sql",
  "20260901000000_yasam_hafizasi_reconcile_enqueue.sql",
  "20260927000000_yh_source_activation_control.sql",
];
const OWNER = readFileSync(path.resolve("supabase/migrations/20280110000100_yh_owner_scope_sifa_v2.sql"), "utf8");

const c = await connectTestDb();
try {
  if ((await c.query("select to_regclass('public.yasam_hafizasi_index') r")).rows[0].r !== null) {
    throw new Error("DUR: yasam_hafizasi_index zaten var — bootstrap tek seferliktir.");
  }
  for (const f of FILES) {
    await c.query(readFileSync(path.resolve("supabase/migrations", f), "utf8"));
    console.log(`  ✓ ${f}`);
  }
  await c.query(`
    begin;
    create table if not exists public.stone_exclusions (tenant_id text not null, stone_id uuid not null, primary key (tenant_id, stone_id));
    alter table public.stone_exclusions enable row level security;
    revoke all on public.stone_exclusions from public, anon, authenticated;
    grant select on public.stone_exclusions to service_role;
    commit;`);
  console.log("  ✓ stub public.stone_exclusions (boş, sentetik)");
  await c.query(OWNER);
  await c.query(OWNER);
  console.log("  ✓ 20280110000100_yh_owner_scope_sifa_v2.sql (×2, idempotent)");
  await c.query("NOTIFY pgrst, 'reload schema'");
  const r = (await c.query(`select
      (select count(*)::int from information_schema.columns where table_name='yasam_hafizasi_index' and column_name='owner_user_id') owner_col,
      (select count(*)::int from pg_proc where proname in ('yh_search_candidates','yh_search_candidates_v2','yh_search_candidates_v3')) search_fns,
      (select count(*)::int from pg_trigger where tgname like 'yh_cdc_sifa_v2_%') triggers,
      (select count(*)::int from public.yasam_hafizasi_index) index_rows,
      (select count(*)::int from public.yh_source_activation where is_active) active_sources`)).rows[0];
  console.log("durum:", JSON.stringify(r));
} catch (e) {
  console.error(redact((e as Error).message));
  process.exitCode = 1;
} finally {
  await c.end();
}
