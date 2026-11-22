/** 8. aşama — test projesindeki sentetik kaynak envanteri (SALT-OKUNUR). */
import { connectTestDb } from "./guard";

const c = await connectTestDb();
try {
  await c.query("BEGIN READ ONLY");
  const tabs = await c.query(`select relname t, n_live_tup::int n from pg_stat_user_tables where schemaname='public' order by 1`);
  const exact: Record<string, number> = {};
  for (const r of tabs.rows) exact[r.t] = Number((await c.query(`select count(*)::int n from public.${r.t}`)).rows[0].n);
  console.log("public tablolar (satır):", JSON.stringify(exact));
  const fns = (await c.query("select count(*)::int n from pg_proc where pronamespace='public'::regnamespace")).rows[0].n;
  console.log("public fonksiyon sayısı:", fns);
  const b = await c.query("select b.id, b.public, (select count(*)::int from storage.objects o where o.bucket_id=b.id) objs from storage.buckets b order by 1");
  console.log("bucket'lar:", JSON.stringify(b.rows));
  const u = await c.query("select count(*)::int n, count(*) filter (where full_name like 'ZZ_%')::int zz, count(*) filter (where email like '%@example.test')::int ex from public.users");
  console.log("users:", JSON.stringify(u.rows[0]), "· auth.users:", (await c.query("select count(*)::int n from auth.users")).rows[0].n);
  const t = await c.query("select count(*)::int n, count(*) filter (where name like 'ZZ_%')::int zz from public.tenants");
  console.log("tenants:", JSON.stringify(t.rows[0]));
  const ext = await c.query("select extname, extversion from pg_extension order by 1");
  console.log("eklentiler:", ext.rows.map((r) => `${r.extname}@${r.extversion}`).join(", "));
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
