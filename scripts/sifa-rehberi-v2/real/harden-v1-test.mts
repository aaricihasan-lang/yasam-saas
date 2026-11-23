/**
 * 8. aşama — integration.real'in ELLE kurduğu sentetik V1 taban tabloları (healing_guides, other_module_records)
 * Supabase varsayılan yetkileriyle anon/authenticated'a AÇIK doğar (repoda CREATE yok → production izni
 * migration'da değil). Production deseniyle (kardeş healing_guide_sections: RLS açık + REVOKE) hizalanır.
 * YALNIZ test projesi (guard). V2 tablolarına DOKUNMAZ (bulgu olarak raporlanır).
 */
import { connectTestDb } from "./guard";

const c = await connectTestDb();
try {
  await c.query("BEGIN");
  for (const t of ["healing_guides", "other_module_records"]) {
    await c.query(`alter table public.${t} enable row level security`);
    await c.query(`revoke all on table public.${t} from public, anon, authenticated`);
  }
  await c.query("COMMIT");
  const r = await c.query(`select c.relname t, c.relrowsecurity rls, has_table_privilege('anon', c.oid, 'SELECT') anon_sel
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('healing_guides','other_module_records')`);
  console.log(JSON.stringify(r.rows));
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await c.end();
}
