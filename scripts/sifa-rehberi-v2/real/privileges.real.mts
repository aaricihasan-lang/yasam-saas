/**
 * 8. aşama — GERÇEK Supabase yetki matrisi (SALT-OKUNUR: BEGIN READ ONLY).
 * Tablo × rol (anon/authenticated/service_role) ve sifa_* fonksiyon EXECUTE yetkileri + RLS durumu.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/privileges.real.mts
 */
import { connectTestDb } from "./guard";

const c = await connectTestDb();
try {
  await c.query("BEGIN READ ONLY");
  const tabs = await c.query(`
    select c.relname t, c.relrowsecurity rls,
      (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)::int pol,
      string_agg(distinct case when has_table_privilege('anon', c.oid, x) then x end, ',') anon,
      string_agg(distinct case when has_table_privilege('authenticated', c.oid, x) then x end, ',') auth,
      string_agg(distinct case when has_table_privilege('service_role', c.oid, x) then x end, ',') svc
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) x
    where n.nspname='public' and c.relkind='r' group by c.relname, c.relrowsecurity, c.oid order by 1`);
  console.log("TABLO | RLS | politika | anon | authenticated | service_role");
  for (const r of tabs.rows) console.log(`${r.t} | ${r.rls} | ${r.pol} | ${r.anon ?? "-"} | ${r.auth ?? "-"} | ${r.svc ?? "-"}`);
  const fns = await c.query(`
    select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f, p.prosecdef secdef,
      has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') au,
      has_function_privilege('service_role', p.oid, 'EXECUTE') s,
      coalesce(array_to_string(p.proconfig, ';'), '') cfg
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'sifa_v2%' order by 1`);
  console.log("\nFONKSİYON | SECURITY DEFINER | anon | authenticated | service_role | config");
  for (const r of fns.rows) console.log(`${r.f.slice(0, 70)} | ${r.secdef} | ${r.a} | ${r.au} | ${r.s} | ${r.cfg}`);
  const defacl = await c.query(`select pg_get_userbyid(d.defaclrole) owner, d.defaclobjtype typ, d.defaclacl::text acl
    from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public' order by 1,2`);
  console.log("\nVARSAYILAN YETKİLER (public)");
  for (const r of defacl.rows) console.log(`${r.owner} ${r.typ} ${r.acl}`);
  const b = await c.query("select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id");
  console.log("\nBUCKET'LAR", JSON.stringify(b.rows));
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
