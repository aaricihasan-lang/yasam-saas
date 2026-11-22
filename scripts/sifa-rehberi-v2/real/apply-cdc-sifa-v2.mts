/**
 * Son tamamlama — izole CDC: güncel YH sahiplik migration'ını (yh_cdc_enqueue_sifa_v2) YALNIZ test projesine uygular.
 * Migration idempotent (yh-owner.pg harness'ı ×2 uygular). Genel yh_cdc_enqueue(): gövde md5 + ayar + bağlı tetikleyiciler
 * ÖNCE = SONRA doğrulanır; farklıysa işlem GERİ ALINIR. Tablo verisi değişmez.
 * Çalıştır: npx tsx --tsconfig tsconfig.json scripts/sifa-rehberi-v2/real/apply-cdc-sifa-v2.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { connectTestDb } from "./guard";

const SQL = readFileSync(path.resolve("supabase/migrations/20280110000100_yh_owner_scope_sifa_v2.sql"), "utf8");
const body = SQL.replace(/^\s*BEGIN;\s*$/m, "").replace(/^\s*COMMIT;\s*$/m, "");
const su = await connectTestDb();
const state = async () =>
  (await su.query(`select md5(p.prosrc) md5, p.prosecdef, p.proconfig::text cfg,
                          (select count(*)::int from pg_trigger t where not t.tgisinternal and t.tgfoid = p.oid) n,
                          (select string_agg(t.tgrelid::regclass::text || '.' || t.tgname || ':' || t.tgenabled::text || ':' || encode(t.tgargs, 'hex'), ',' order by 1)
                             from pg_trigger t where not t.tgisinternal and t.tgfoid = p.oid) trig
                     from pg_proc p where p.oid = 'public.yh_cdc_enqueue()'::regprocedure`)).rows[0];
const v2bind = async () =>
  (await su.query(`select t.tgname, t.tgfoid::regproc::text fn from pg_trigger t
                    where t.tgrelid = 'public.sifa_topic_blocks'::regclass and not t.tgisinternal order by 1`)).rows;
let code = 0;
try {
  const before = await state();
  const bindBefore = await v2bind();
  await su.query("BEGIN");
  await su.query(body);
  const mid = await state();
  // Önceden V2'nin 2 tetikleyicisi genel fonksiyona bağlıydı → artık değil; geri kalan bağlantılar AYNEN.
  const strip = (s: string | null) => (s ?? "").split(",").filter((x) => x && !x.startsWith("sifa_topic_blocks.")).join(",");
  if (mid.md5 !== before.md5 || mid.cfg !== before.cfg || mid.prosecdef !== before.prosecdef || strip(mid.trig) !== strip(before.trig)) {
    await su.query("ROLLBACK");
    throw new Error("genel yh_cdc_enqueue değişti → GERİ ALINDI");
  }
  await su.query("COMMIT");
  const bindAfter = await v2bind();
  console.log("  genel yh_cdc_enqueue md5 önce/sonra:", before.md5, "/", mid.md5);
  console.log("  genel fonksiyona bağlı tetikleyici sayısı önce/sonra:", before.n, "/", mid.n, "(fark yalnız V2'nin kendi 2 tetikleyicisi)");
  console.log("  V2 kutu tetikleyicileri önce:", JSON.stringify(bindBefore));
  console.log("  V2 kutu tetikleyicileri sonra:", JSON.stringify(bindAfter));
  const okBind = bindAfter.length === 2 && bindAfter.every((r: { fn: string }) => r.fn === "yh_cdc_enqueue_sifa_v2");
  console.log(okBind && mid.n === before.n - bindBefore.filter((r: { fn: string }) => r.fn === "yh_cdc_enqueue").length ? "\nUYGULAMA: PASS" : "\nUYGULAMA: FAIL");
  if (!okBind) code = 1;
} catch (e) {
  code = 1;
  console.log(`  ✗ ${String((e as Error).message).slice(0, 300)}\nUYGULAMA: FAIL`);
} finally {
  await su.end();
}
process.exit(code);
