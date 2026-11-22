/** 10. aşama — TANI (SALT-OKUNUR): Şifa V2 / V1 YH outbox durum dağılımı. */
import { connectTestDb } from "./guard";
const c = await connectTestDb();
try {
  await c.query("BEGIN READ ONLY");
  const r = await c.query(`select source_key, status, count(*)::int n from public.yasam_hafizasi_outbox
    where source_key in ('sifa_rehberi_v2:notes','sifa_rehberi:guides') group by 1,2 order by 1,2`);
  console.log(JSON.stringify(r.rows));
  const chk = await c.query(`select pg_get_constraintdef(oid) d from pg_constraint where conrelid = 'public.yasam_hafizasi_outbox'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'`);
  console.log(chk.rows.map((x) => x.d).join(" | "));
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
