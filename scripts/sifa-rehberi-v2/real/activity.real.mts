/** 8. aşama — TANI: test projesinde etkin sifa_v2 sorguları + çağrı sayısı (SALT-OKUNUR). */
import { connectTestDb } from "./guard";

const c = await connectTestDb();
try {
  await c.query("BEGIN READ ONLY");
  const a = await c.query(`select usename, state, now() - query_start dur, left(regexp_replace(query, '\\s+', ' ', 'g'), 90) q
    from pg_stat_activity where query ilike '%sifa_v2_apply%' and pid <> pg_backend_pid()`);
  console.log("etkin:", JSON.stringify(a.rows));
  const f = await c.query(`select funcname, calls from pg_stat_user_functions where funcname like 'sifa_v2%' order by 1`);
  console.log("çağrılar:", JSON.stringify(f.rows));
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
