/**
 * Görsel yaşam döngüsü migration'ını (20280124000000) YALNIZ ayrı test projesine uygular (guard FAIL-CLOSED).
 * Yalnız CREATE OR REPLACE FUNCTION + yetki; tablo/veri değişmez → idempotent. Production'a ASLA.
 * Çalıştır: SIFA_V2_TEST_SECRET_DIR=… npx tsx scripts/sifa-rehberi-v2/real/apply-lifecycle.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { connectTestDb, installNetworkFence, loadTestTarget } from "./guard";

const T = loadTestTarget();
installNetworkFence(T);
const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20280124000000_sifa_v2_asset_lifecycle.sql"), "utf8");
const db = await connectTestDb();
const counts = `select (select count(*) from public.sifa_topics) t, (select count(*) from public.sifa_topic_blocks) b, (select count(*) from public.sifa_block_assets) a`;
const before = (await db.query(counts)).rows[0];
await db.query("begin");
await db.query(sql);
await db.query("commit");
const after = (await db.query(counts)).rows[0];
const fns = (await db.query(`select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('sifa_v2_gc_candidates','sifa_v2_gc_purge','sifa_v2__asset_in_use','sifa_v2__block_dead') order by 1`)).rows.map((r) => r.proname);
const anon = (await db.query(`select count(*)::int n from information_schema.routine_privileges where routine_name like 'sifa_v2_gc%' and grantee in ('anon','authenticated','PUBLIC')`)).rows[0].n;
console.log(JSON.stringify({ fns, anonGrants: anon, rowsUnchanged: JSON.stringify(before) === JSON.stringify(after) }));
await db.end();
process.exit(fns.length === 4 && anon === 0 && JSON.stringify(before) === JSON.stringify(after) ? 0 : 1);
