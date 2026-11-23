/**
 * 8. aşama — sürüm çakışması GERÇEK PostgREST'te nasıl dönüyor? (TANI; veri YAZMAZ: bayat sürüm → RAISE → geri alınır)
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/conflict-probe.real.mts
 */
import { createClient } from "@supabase/supabase-js";
import { connectTestDb, installNetworkFence, loadTestTarget, redact } from "./guard";

const T = loadTestTarget();
installNetworkFence(T);
const su = await connectTestDb();
try {
  const row = (await su.query(
    `select t.id, t.tenant_id, t.owner_key, t.title, t.version, t.sort_key, t.parent_id from public.sifa_topics t
      where t.scope = 'kisisel' and t.parent_id is null and t.deleted_at is null order by t.created_at limit 1`,
  )).rows[0];
  const before = (await su.query("select version, updated_at from public.sifa_topics where id = $1", [row.id])).rows[0];
  const changes = { topics: [{ id: row.id, parent_id: null, title: row.title, sort_key: row.sort_key, template_key: null, deleted_at: null, delete_batch_id: null, base_version: row.version + 50 }], blocks: [], links: [], link_deletes: [], asset_links: [] };
  // 1) Ham HTTP (PostgREST yanıtının kendisi)
  const r = await fetch(`${T.url}/rest/v1/rpc/sifa_v2_apply_changeset`, {
    method: "POST",
    headers: { apikey: T.secretKey, Authorization: `Bearer ${T.secretKey}`, "content-type": "application/json" },
    body: JSON.stringify({ p_tenant: row.tenant_id, p_user: row.owner_key, p_changes: changes }),
  });
  const txt = await r.text();
  console.log(`HAM PostgREST: HTTP ${r.status}`);
  console.log(`gövde: ${redact(txt).slice(0, 400)}`);
  // 2) supabase-js
  const sb = createClient(T.url, T.secretKey, { auth: { persistSession: false } });
  const { error } = await sb.rpc("sifa_v2_apply_changeset", { p_tenant: row.tenant_id, p_user: row.owner_key, p_changes: changes });
  console.log(`supabase-js error: ${redact(JSON.stringify(error)).slice(0, 400)}`);
  const after = (await su.query("select version, updated_at from public.sifa_topics where id = $1", [row.id])).rows[0];
  console.log(`satır değişmedi: ${before.version === after.version && +before.updated_at === +after.updated_at}`);
} finally {
  await su.end();
}
