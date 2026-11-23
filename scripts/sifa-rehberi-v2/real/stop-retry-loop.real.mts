/**
 * 8. aşama — ACİL: PostgREST'in SQLSTATE 40001 (sifa_conflict) üzerine SONSUZ yeniden deneme döngüsündeki
 * bağlantılarını sonlandırır. YALNIZ test projesi (guard) + YALNIZ authenticator'ın sifa_v2_apply sorguları.
 * Veri değiştirmez (döngüdeki işlemler zaten hatayla geri alınıyor).
 */
import { connectTestDb } from "./guard";

const c = await connectTestDb();
try {
  const r = await c.query(`select pid, pg_terminate_backend(pid) ok from pg_stat_activity
    where usename = 'authenticator' and query ilike '%sifa_v2_apply_changeset%' and pid <> pg_backend_pid()`);
  console.log("sonlandırılan:", JSON.stringify(r.rows));
} finally {
  await c.end();
}
