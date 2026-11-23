/**
 * 12. aşama — V1 silme paketinin SQL doğrulaması (YALNIZ test projesi; veri DEĞİŞMEZ).
 *   01_envanter: BEGIN READ ONLY içinde ifade ifade (savepoint) çalıştırılır; test projesinde olmayan tablo → "yok".
 *   02_silme_plani: şablon AYNEN çalıştırılır; tenant listesi boş olduğu için DELETE'ten ÖNCE 'DUR' ile durmalı → ROLLBACK.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { connectTestDb } from "./guard";

const D = path.resolve("docs/sifa-rehberi-v2/v1-silme");
const c = await connectTestDb();
let fail = 0;
try {
  const env = readFileSync(path.join(D, "01_envanter_salt_okunur.sql"), "utf8").replace(/^\s*--.*$/gm, "");
  const stmts = env.split(/;\s*\n/).map((s) => s.trim()).filter((s) => s && !/^BEGIN READ ONLY$/i.test(s) && !/^ROLLBACK$/i.test(s));
  await c.query("BEGIN READ ONLY");
  let i = 0;
  for (const s of stmts) {
    i++;
    await c.query("SAVEPOINT x");
    try {
      const r = await c.query(s);
      console.log(`  ✓ 01/${i}: ${r.rowCount} satır${r.rows.length && r.rows.length <= 3 ? " " + JSON.stringify(r.rows).slice(0, 160) : ""}`);
    } catch (e) {
      const m = (e as Error).message;
      const missing = /does not exist/.test(m);
      if (!missing) fail++;
      console.log(`  ${missing ? "·" : "✗"} 01/${i}: ${missing ? "test projesinde tablo yok (production'da var)" : m}`);
      await c.query("ROLLBACK TO SAVEPOINT x");
    }
  }
  const ro = (await c.query("show transaction_read_only")).rows[0].transaction_read_only;
  console.log(`  ✓ envanter işlemi salt-okunur: ${ro}`);
  await c.query("ROLLBACK");

  const before = (await c.query("select (select count(*) from public.healing_guides)::int g, (select count(*) from public.healing_guide_sections)::int s")).rows[0];
  const plan = readFileSync(path.join(D, "02_silme_plani_CALISTIRMA.sql"), "utf8");
  const doBlock = plan.slice(plan.indexOf("DO $$"), plan.indexOf("$$;") + 3);
  await c.query("BEGIN");
  let stopped = "";
  try {
    await c.query(doBlock);
  } catch (e) {
    stopped = (e as Error).message;
  }
  await c.query("ROLLBACK");
  const after = (await c.query("select (select count(*) from public.healing_guides)::int g, (select count(*) from public.healing_guide_sections)::int s")).rows[0];
  const okStop = /DUR: tenant listesi/.test(stopped) && before.g === after.g && before.s === after.s;
  if (!okStop) fail++;
  console.log(`  ${okStop ? "✓" : "✗"} 02 şablonu ayrıştı ve DELETE'ten ÖNCE durdu ("${stopped.slice(0, 60)}"); V1 sayıları değişmedi ${JSON.stringify(before)}`);
} finally {
  await c.end();
}
console.log(`\nSONUÇ: ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
