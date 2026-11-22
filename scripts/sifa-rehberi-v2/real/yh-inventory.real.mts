/** 10. aşama — YH test envanteri (SALT-OKUNUR). */
import { connectTestDb } from "./guard";
const c = await connectTestDb();
try {
  await c.query("BEGIN READ ONLY");
  const r = (await c.query(`select
    (select count(*)::int from public.yasam_hafizasi_index) idx_total,
    (select count(*)::int from public.yasam_hafizasi_index where owner_user_id is not null) idx_owned,
    (select count(*)::int from public.yasam_hafizasi_index where source_table = 'sifa_topic_blocks' and owner_user_id is null) idx_v2_unowned,
    (select count(*)::int from public.yasam_hafizasi_outbox) outbox,
    (select count(*)::int from public.yasam_hafizasi_outbox where status <> 'succeeded') outbox_open,
    (select string_agg(source_key, ',' order by source_key) from public.yh_source_activation where is_active) active_sources,
    (select count(*)::int from public.tenants) tenants, (select count(*)::int from public.users) users`)).rows[0];
  console.log(JSON.stringify(r));
  await c.query("ROLLBACK");
} finally { await c.end(); }
