/**
 * Şifa Rehberi F4-R2 — 20280130000300 (YH kutu yayılımı) + 20280130000400 (ileri yaşam döngüsü + yayın hazırlık işareti)
 * migration'larını YALNIZ izole test projesine uygular (guard.ts FAIL-CLOSED; production'a dokunmaz). Production sırasıyla aynı:
 * F3 (20280130000200, apply-f3.mts) → YH → ileri. Ön koşullar (onkosul) burada da denetlenir; satırlar md5 ile değişmemeli;
 * her migration iki kez uygulanır (yeniden çalıştırma güvenli). Sonunda sifa_v2_f3_hazir() = true olmalı.
 * Çalıştır: SIFA_V2_TEST_SECRET_DIR=… npx tsx scripts/sifa-rehberi-f3/real/apply-f3-tamam.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { connectTestDb, installNetworkFence, loadTestTarget } from "../../sifa-rehberi-v2/real/guard";

const T = loadTestTarget();
installNetworkFence(T);
const db = await connectTestDb();
const MIG = (f: string) => readFileSync(path.resolve("supabase/migrations", f), "utf8");
const YH = MIG("20280130000300_yh_sifa_f3_kutu_yayilimi.sql");
const ILERI = MIG("20280130000400_sifa_v2_asset_lifecycle_ileri.sql");
const sums = async () =>
  (await db.query(`select (select md5(coalesce(string_agg(row_to_json(t)::text, ';' order by id), '')) from public.sifa_topics t) t,
     (select md5(coalesce(string_agg(row_to_json(b)::text, ';' order by id), '')) from public.sifa_topic_blocks b) b,
     (select md5(coalesce(string_agg(row_to_json(a)::text, ';' order by id), '')) from public.sifa_block_assets a) a`)).rows[0];
const var_ = async (sig: string) => (await db.query("select to_regprocedure($1) is not null v", [sig])).rows[0].v as boolean;
const onkosulYh = (await var_("public.yh_cdc_enqueue_sifa_v2()")) && (await db.query("select to_regclass('public.yasam_hafizasi_outbox') is not null v")).rows[0].v;
const onkosulF3 = await var_("public.sifa_blocks_guard_nest()");
if (!onkosulF3 || !onkosulYh) throw new Error(`Ön koşul yok: F3=${onkosulF3} YH-sahiplik=${onkosulYh}`);
const once = await sums();
const hazirOnce = await var_("public.sifa_v2_f3_hazir()");
await db.query(YH);
await db.query(YH);
const ileriOnkosul = (await var_("public.sifa_blocks_guard_nest()")) && (await var_("public.yh_sifa_v2_note_trash_enqueue()"));
if (!ileriOnkosul) throw new Error("ileri migration ön koşulu sağlanmadı");
await db.query(ILERI);
await db.query(ILERI);
const sonra = await sums();
const hazir = (await db.query("set role service_role; select public.sifa_v2_f3_hazir() h; reset role;")) as unknown as Array<{ rows: Array<{ h: boolean }> }>;
const h = hazir[1]?.rows[0]?.h === true;
const aktif = (await db.query("select coalesce((select is_active::text from public.yh_source_activation where source_key='sifa_rehberi_v2:notes'),'kayit-yok') a")).rows[0].a;
const same = JSON.stringify(once) === JSON.stringify(sonra);
console.log(JSON.stringify({ ok: same && h && !hazirOnce, hazir_isareti_once: hazirOnce, hazir_isareti_sonra: h, satirlar_ayni: same, yh_sifa_aktivasyon: aktif }, null, 1));
await db.end();
process.exit(same && h ? 0 : 1);
