/**
 * Inngest uçtan uca testi — AŞAMA 1/2: HAZIRLIK (YALNIZ izole test projesi; fail-closed guard).
 * Yapılanlar (hepsi idempotent, MEVCUT SIR DEĞİŞTİRİLMEZ):
 *   1) public.yh_outbox_webhook_secret_matches(text) yoksa kurulur — gövde repo migration'ı
 *      supabase/migrations/20271010000000_yh_outbox_webhook_vault_secret.sql'den AYNEN alınır (yalnız bu fonksiyon;
 *      migration'ın DO bloğu / sır üretimi / outbox tetikleyicisi ÇALIŞTIRILMAZ).
 *   2) Vault'ta 'yh_outbox_webhook_secret' YOKSA yeni rastgele test sırrı oluşturulur ve değeri yalnız Git dışı
 *      gizli klasöre (sifa-v2-test-inngest.env) yazılır. Vault'ta VARSA ve yerel dosya yoksa → DUR (sır değiştirilmez).
 * Sır çıktıya YAZILMAZ. Çalıştır: npx tsx --tsconfig tsconfig.json scripts/sifa-rehberi-v2/real/inngest-prep.real.mts
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { connectTestDb, testSecretFile } from "./guard";

export const INNGEST_SECRET_FILE = testSecretFile("sifa-v2-test-inngest.env");
const MIG = path.resolve("supabase/migrations/20271010000000_yh_outbox_webhook_vault_secret.sql");

const su = await connectTestDb();
let code = 0;
try {
  // 1) Yalnız secret_matches fonksiyonu (migration'dan birebir: CREATE … $$; + REVOKE/GRANT satırları)
  if ((await su.query("select to_regprocedure('public.yh_outbox_webhook_secret_matches(text)') f")).rows[0].f === null) {
    const sql = readFileSync(MIG, "utf8");
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.yh_outbox_webhook_secret_matches");
    const grant = "GRANT EXECUTE ON FUNCTION public.yh_outbox_webhook_secret_matches(text) TO service_role;";
    const end = sql.indexOf(grant, start);
    if (start < 0 || end < 0) throw new Error("migration içinde fonksiyon bloğu bulunamadı");
    await su.query(`BEGIN; ${sql.slice(start, end + grant.length)} COMMIT;`);
    console.log("  ✓ yh_outbox_webhook_secret_matches kuruldu (repo migration gövdesi)");
  } else console.log("  ✓ yh_outbox_webhook_secret_matches zaten var (değiştirilmedi)");

  // 2) Sır: yalnız YOKSA yeni oluştur
  const inVault = Number((await su.query("select count(*)::int n from vault.secrets where name = 'yh_outbox_webhook_secret'")).rows[0].n);
  const local = existsSync(INNGEST_SECRET_FILE);
  if (inVault === 0) {
    const secret = randomBytes(32).toString("hex");
    writeFileSync(INNGEST_SECRET_FILE, `SIFA_TEST_YH_WEBHOOK_SECRET=${secret}\n`, { flag: "wx" });
    await su.query("select vault.create_secret($1, 'yh_outbox_webhook_secret', 'ZZ izole test projesi — Inngest e2e')", [secret]);
    console.log("  ✓ yeni test sırrı oluşturuldu (Vault + Git dışı gizli dosya; değer yazdırılmadı)");
  } else if (local) {
    const ok = (await su.query("select public.yh_outbox_webhook_secret_matches($1) m", [readFileSync(INNGEST_SECRET_FILE, "utf8").split("=")[1].trim()])).rows[0].m;
    if (ok !== true) throw new Error("Vault'taki sır yerel test dosyasıyla eşleşmiyor → DUR (sır değiştirilmez)");
    console.log("  ✓ test sırrı zaten hazır ve yerel dosyayla eşleşiyor (değiştirilmedi)");
  } else {
    throw new Error("Vault'ta 'yh_outbox_webhook_secret' VAR ama yerel test dosyası yok → DUR (mevcut sır değiştirilmez)");
  }
  const url = Number((await su.query("select count(*)::int n from vault.secrets where name = 'yh_outbox_webhook_url'")).rows[0].n);
  const trig = Number((await su.query("select count(*)::int n from pg_trigger where tgrelid = 'public.yasam_hafizasi_outbox'::regclass and not tgisinternal")).rows[0].n);
  console.log(`  ✓ pg_net URL sırrı: ${url} · outbox tetikleyicisi: ${trig} (DB dışarı istek atmaz)`);
  console.log("\nHAZIRLIK: PASS");
} catch (e) {
  code = 1;
  console.log(`  ✗ ${String((e as Error).message ?? e).slice(0, 300)}\nHAZIRLIK: FAIL`);
} finally {
  await su.end();
}
process.exit(code);
