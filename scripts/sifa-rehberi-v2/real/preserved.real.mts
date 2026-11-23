/**
 * 9. aşama — 8. aşama sentetik verisinin KORUNDUĞUNU doğrular (SALT-OKUNUR).
 * Sınır = 9. aşamanın ilk sentetik kaydı (ZZ_SIFA_P0_* kullanıcısının created_at'i). Sınırdan önceki kayıtlar
 * 8. aşama envanteriyle (5 tenant, 9 kullanıcı, 220 V2 başlığı, 8 V1 kaydı, 2 bucket, 1 görsel …) eşleşmeli.
 */
import { connectTestDb } from "./guard";

const EXPECT = { tenants: 5, users: 9, sifa_topics: 220, sifa_topic_blocks: 47, sifa_block_sources: 2, sifa_topic_links: 3, sifa_block_assets: 5, sifa_legacy_import_map: 15, healing_guides: 8, healing_guide_sections: 7, buckets: 2, stone_photos_objects_8: 1 };
let pass = 0;
let fail = 0;
const c = await connectTestDb();
try {
  await c.query("BEGIN READ ONLY");
  const b = (await c.query("select min(created_at) t from public.users where full_name like 'ZZ_SIFA_P0%'")).rows[0].t as Date;
  const n = async (sql: string, p: unknown[] = []) => Number((await c.query(sql, p)).rows[0].n);
  const got: Record<string, number> = {
    tenants: await n("select count(distinct t.id)::int n from public.tenants t join public.users u on u.tenant_id = t.id where u.created_at < $1", [b]),
    users: await n("select count(*)::int n from public.users where created_at < $1", [b]),
    sifa_topics: await n("select count(*)::int n from public.sifa_topics where created_at < $1", [b]),
    sifa_topic_blocks: await n("select count(*)::int n from public.sifa_topic_blocks where created_at < $1", [b]),
    sifa_block_sources: await n("select count(*)::int n from public.sifa_block_sources s join public.sifa_topic_blocks x on x.id = s.block_id where x.created_at < $1", [b]),
    sifa_topic_links: await n("select count(*)::int n from public.sifa_topic_links where created_at < $1", [b]),
    sifa_block_assets: await n("select count(*)::int n from public.sifa_block_assets where created_at < $1", [b]),
    sifa_legacy_import_map: await n("select count(*)::int n from public.sifa_legacy_import_map where imported_at < $1", [b]),
    healing_guides: await n("select count(*)::int n from public.healing_guides where created_at < $1", [b]),
    healing_guide_sections: await n("select count(*)::int n from public.healing_guide_sections s join public.healing_guides g on g.id = s.guide_id where g.created_at < $1", [b]),
    buckets: await n("select count(*)::int n from storage.buckets where created_at < $1", [b]),
    stone_photos_objects_8: await n("select count(*)::int n from storage.objects where bucket_id = 'stone-photos' and created_at < $1", [b]),
  };
  const now: Record<string, number> = {
    tenants: await n("select count(*)::int n from public.tenants"),
    users: await n("select count(*)::int n from public.users"),
    sifa_topics: await n("select count(*)::int n from public.sifa_topics"),
    sifa_topic_blocks: await n("select count(*)::int n from public.sifa_topic_blocks"),
    healing_guides: await n("select count(*)::int n from public.healing_guides"),
    stone_photos_objects: await n("select count(*)::int n from storage.objects where bucket_id = 'stone-photos'"),
    sifa_arastirma_objects: await n("select count(*)::int n from storage.objects where bucket_id = 'sifa-arastirma'"),
  };
  for (const [k, v] of Object.entries(EXPECT)) {
    const g = got[k];
    if (g === v) pass++;
    else fail++;
    console.log(`  ${g === v ? "✓" : "✗"} 8. aşama ${k}: beklenen ${v}, bulunan ${g}`);
  }
  console.log("güncel toplamlar (9. aşama eklemeleri dahil):", JSON.stringify(now));
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
