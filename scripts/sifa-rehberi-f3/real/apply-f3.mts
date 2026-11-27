/**
 * Şifa Rehberi F3 — migration'ı YALNIZ izole test projesine uygular (guard.ts FAIL-CLOSED; production'a dokunmaz).
 * Kanıt: uygulama ÖNCESİ ve SONRASI mevcut satırların eski sütunları md5 ile karşılaştırılır (veri değişmemeli);
 * migration iki kez uygulanır (yeniden çalıştırma güvenli). Ön koşul: 20280124000000 (yaşam döngüsü) fonksiyonları mevcut.
 * Çalıştır: SIFA_V2_TEST_SECRET_DIR=… npx tsx scripts/sifa-rehberi-f3/real/apply-f3.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { connectTestDb, installNetworkFence, loadTestTarget } from "../../sifa-rehberi-v2/real/guard";

const T = loadTestTarget();
installNetworkFence(T);
const db = await connectTestDb();
const SQL = readFileSync(path.resolve("supabase/migrations/20280130000000_sifa_rehberi_f3.sql"), "utf8");
const sums = async () =>
  (
    await db.query(`select
      (select md5(coalesce(string_agg(concat_ws('|',id,tenant_id,owner_key,scope,parent_id,title,sort_key,template_key,version,created_at,updated_at,deleted_at,delete_batch_id), ';' order by id),'')) from public.sifa_topics) t,
      (select md5(coalesce(string_agg(concat_ws('|',id,tenant_id,owner_key,scope,topic_id,title,content_json::text,content_text,classification,sort_key,version,created_at,updated_at,deleted_at,delete_batch_id), ';' order by id),'')) from public.sifa_topic_blocks) b,
      (select md5(coalesce(string_agg(concat_ws('|',id,block_id,kind,title,authors,year,doi,url,position), ';' order by id),'')) from public.sifa_block_sources) s,
      (select md5(coalesce(string_agg(concat_ws('|',id,block_id,origin,bucket,storage_path,caption,created_at), ';' order by id),'')) from public.sifa_block_assets) a,
      (select count(*) from public.sifa_topics) nt, (select count(*) from public.sifa_topic_blocks) nb`)
  ).rows[0];
const pre = await db.query("select count(*)::int n from pg_proc where proname in ('sifa_v2__asset_in_use','sifa_v2_gc_candidates')");
if (pre.rows[0].n !== 2) throw new Error("Ön koşul yok: 20280124000000 (yaşam döngüsü) test projesinde uygulanmamış");
const before = await sums();
await db.query(SQL);
const after = await sums();
await db.query(SQL);
const again = await sums();
// F3-R1 (Owner: kullanıcı kotası YOK): taslak F3 sürümünün kota fonksiyonu bu TEST projesine önceden uygulanmıştı → kaldırılır.
await db.query("DROP FUNCTION IF EXISTS public.sifa_v2_upload_usage(uuid, uuid)");
const quotaFn = (await db.query("select count(*)::int n from pg_proc where proname = 'sifa_v2_upload_usage'")).rows[0].n;
const cols = (await db.query("select table_name, column_name from information_schema.columns where table_schema='public' and column_name in ('node_kind','parent_block_id','content_updated_at') order by 1,2")).rows;
const same = JSON.stringify(before) === JSON.stringify(after) && JSON.stringify(after) === JSON.stringify(again);
console.log(JSON.stringify({ ok: same && cols.length === 3 && quotaFn === 0, kota_fonksiyonu: quotaFn, satirlar: { konu_baslik: before.nt, kutu: before.nb }, eski_sutunlar_ayni: same, yeni_sutunlar: cols.map((c) => `${c.table_name}.${c.column_name}`) }, null, 1));
await db.end();
process.exit(same && cols.length === 3 && quotaFn === 0 ? 0 : 1);
