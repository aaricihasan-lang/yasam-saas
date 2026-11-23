/**
 * 8. aşama — GERÇEK PostgREST / Storage HTTP güvenlik sondaları (yazma YOK: yalnız okuma ve reddedilmesi
 * beklenen çağrılar; reddedilmezse bile yük geçersiz kapsamla hata verecek biçimde kurulur).
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/security.real.mts
 */
import { randomUUID } from "node:crypto";
import { installNetworkFence, loadTestTarget } from "./guard";

const T = loadTestTarget();
installNetworkFence(T);
let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
};
const H = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" });
const get = async (p: string, key: string) => {
  const r = await fetch(`${T.url}${p}`, { headers: H(key) });
  const txt = await r.text();
  return { s: r.status, n: (() => { try { const j = JSON.parse(txt); return Array.isArray(j) ? j.length : null; } catch { return null; } })(), code: (() => { try { return JSON.parse(txt).code ?? null; } catch { return null; } })() };
};
const rpc = async (fn: string, key: string, body: object) => {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(`${T.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: H(key), body: JSON.stringify(body), signal: ac.signal });
    const txt = await r.text();
    let code: string | null = null;
    try { code = JSON.parse(txt).code ?? null; } catch { /* skaler */ }
    return { s: r.status, code };
  } finally {
    clearTimeout(to);
  }
};
const denied = (x: { s: number }) => x.s === 401 || x.s === 403 || x.s === 404;

const PK = T.publishableKey;
const SK = T.secretKey;
const t0 = randomUUID();
const u0 = randomUUID();

console.log("A) Tarayıcı anahtarı (publishable → anon) — tablolar");
for (const t of ["sifa_topics", "sifa_topic_blocks", "sifa_block_sources", "sifa_topic_links", "sifa_block_assets", "sifa_legacy_import_map", "users", "user_sessions", "tenants", "healing_guides", "healing_guide_sections", "zz_sifa_v2_test_marker"]) {
  const r = await get(`/rest/v1/${t}?select=*&limit=1`, PK);
  ok(denied(r) || (r.s === 200 && r.n === 0 && false), `anon GET ${t} reddedilir`, r);
}
console.log("B) Tarayıcı anahtarı — V2 RPC'leri");
for (const [fn, body] of [
  ["sifa_v2_load", { p_tenant: t0, p_user: u0 }],
  ["sifa_v2_apply_changeset", { p_tenant: t0, p_user: t0, p_changes: {} }],
  ["sifa_v2_copy_shared", { p_tenant: t0, p_user: t0, p_root: u0 }],
  ["sifa_v2_import_legacy", { p_tenant: t0, p_changes: {}, p_map: [] }],
  ["sifa_v2_visible_assets", { p_tenant: t0, p_user: u0, p_ids: [] }],
  ["sifa_v2_trash_candidates", { p_cutoff: "1970-01-01T00:00:00Z" }],
] as const) {
  const r = await rpc(fn, PK, body);
  ok(denied(r), `anon RPC ${fn} reddedilir`, r);
}
console.log("C) Sunucu anahtarı (secret → service_role)");
const sLoad = await rpc("sifa_v2_load", SK, { p_tenant: t0, p_user: u0 });
ok(sLoad.s === 200, "service_role sifa_v2_load çağırabilir (boş tenant → boş sonuç)", sLoad);
const sApply = await rpc("sifa_v2__apply", SK, { p_tenant: t0, p_owner: t0, p_scope: "gecersiz", p_changes: {} });
ok(denied(sApply), "iç yardımcı sifa_v2__apply service_role'e de KAPALI", sApply);
const sDet = await rpc("sifa_v2__det_uuid", SK, { p: "x" });
ok(denied(sDet), "iç yardımcı sifa_v2__det_uuid service_role'e de KAPALI", sDet);
const sScope = await rpc("sifa_v2_load", SK, { p_tenant: t0, p_user: t0 });
ok(sScope.s === 200, "tenant kimliğiyle (kurum adına) yükleme çağrısı hata vermez ama boş döner (SQL korur)", sScope);

console.log("D) Storage — bucket yapılandırması");
const b = await fetch(`${T.url}/storage/v1/bucket/sifa-arastirma`, { headers: H(SK) });
const bj = (await b.json()) as { public?: boolean; file_size_limit?: number; allowed_mime_types?: string[] };
ok(b.ok && bj.public === false, "sifa-arastirma bucket ÖZEL", { public: bj.public });
ok(bj.file_size_limit === 10485760 && JSON.stringify(bj.allowed_mime_types?.slice().sort()) === JSON.stringify(["image/gif", "image/jpeg", "image/png", "image/webp"]), "boyut sınırı 10 MB + yalnız 4 görsel türü", { lim: bj.file_size_limit, mimes: bj.allowed_mime_types });
const bAnon = await fetch(`${T.url}/storage/v1/bucket`, { headers: H(PK) });
const bAnonJ = bAnon.ok ? ((await bAnon.json()) as unknown[]) : [];
ok(!bAnon.ok || bAnonJ.length === 0, "anon bucket listesini göremez", { s: bAnon.status, n: bAnonJ.length });

console.log("E) 9. aşama yetki daraltması — service_role doğrudan YAZAMAZ (yalnız SELECT + geri yükleme INSERT'i)");
const ghost = randomUUID(); // var olmayan kimlik: yetki olsa bile 0 satır etkilenir
for (const t of ["sifa_topics", "sifa_topic_blocks", "sifa_block_sources", "sifa_topic_links", "sifa_block_assets", "sifa_legacy_import_map"]) {
  const filt = t === "sifa_legacy_import_map" ? `tenant_id=eq.${ghost}` : `id=eq.${ghost}`;
  const up = await fetch(`${T.url}/rest/v1/${t}?${filt}`, { method: "PATCH", headers: { ...H(SK), Prefer: "return=minimal" }, body: JSON.stringify({ tenant_id: ghost }) });
  const del = await fetch(`${T.url}/rest/v1/${t}?${filt}`, { method: "DELETE", headers: { ...H(SK), Prefer: "return=minimal" } });
  const upC = up.ok ? null : ((await up.json().catch(() => ({}))) as { code?: string }).code;
  const delC = del.ok ? null : ((await del.json().catch(() => ({}))) as { code?: string }).code;
  ok(!up.ok && upC === "42501" && !del.ok && delC === "42501", `service_role doğrudan UPDATE/DELETE ${t} → reddedilir (42501)`, { up: up.status, del: del.status });
}
const ins = await fetch(`${T.url}/rest/v1/sifa_legacy_import_map`, { method: "POST", headers: { ...H(SK), Prefer: "return=minimal" }, body: JSON.stringify({ tenant_id: ghost, legacy_kind: "guide", legacy_id: "x", target_kind: "topic", target_id: ghost, source_hash: "x" }) });
ok(!ins.ok && ((await ins.json().catch(() => ({}))) as { code?: string }).code === "42501", "service_role sifa_legacy_import_map'e doğrudan INSERT → reddedilir", ins.status);
{
  const { connectTestDb } = await import("./guard");
  const c = await connectTestDb();
  try {
    const r = await c.query(`select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') au
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('sifa_topics_guard_tree', 'sifa_topics_guard_template')`);
    ok(r.rows.length === 2 && r.rows.every((x) => !x.a && !x.au), "tetikleyici fonksiyonları anon/authenticated'a kapalı", r.rows);
    const sd = await c.query(`select count(*) filter (where prosecdef)::int secdef, count(*) filter (where prosecdef and coalesce(array_to_string(proconfig, ','), '') not like '%search_path=""%')::int bad,
      count(*) filter (where prosecdef and pg_get_userbyid(proowner) <> 'postgres')::int other_owner
      from pg_proc where pronamespace = 'public'::regnamespace and proname like 'sifa_v2%'`);
    // 20280124000000 (görsel yaşam döngüsü) bilinçli olarak 4 SECURITY DEFINER fonksiyon ekler: 8 → 12.
    ok(sd.rows[0].secdef === 12 && sd.rows[0].bad === 0 && sd.rows[0].other_owner === 0, "SECURITY DEFINER denetimi: 12 dış fonksiyon (8 + yaşam döngüsü 4), hepsi search_path='' + sahip postgres", sd.rows[0]);
  } finally {
    await c.end();
  }
}

console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
