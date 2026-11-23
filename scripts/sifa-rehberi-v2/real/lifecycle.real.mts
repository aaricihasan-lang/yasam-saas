/**
 * Görsel YAŞAM DÖNGÜSÜ — GERÇEK test projesi (gerçek PostgREST + gerçek Storage). Migration 20280124000000
 * önce apply-lifecycle.mts ile YALNIZ test projesine uygulanmış olmalı. Tüm çağrılar TEK sentetik tenant'a
 * sınırlı (p_tenant) → test projesindeki başka sentetik veriye dokunulmaz (kontrol tenant'ı ile kanıtlanır).
 * Çalıştır: SIFA_V2_TEST_SECRET_DIR=… npx tsx scripts/sifa-rehberi-v2/real/lifecycle.real.mts
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { connectTestDb, installNetworkFence, loadTestTarget, redact } from "./guard";
import { supabaseDb } from "../../../lib/sifa-rehberi-v2/server/dbAdapters";
import { supabaseStorage } from "../../../lib/sifa-rehberi-v2/server/storage";
import { runAssetLifecycle } from "../../../lib/sifa-rehberi-v2/server/trash";

const T = loadTestTarget();
installNetworkFence(T);
let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
};
const su = await connectTestDb();
const svc = createClient(T.url, T.secretKey, { auth: { persistSession: false } });
const db = supabaseDb(svc);
const st = supabaseStorage(svc);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const exists = async (p: string) => !(await svc.storage.from("sifa-arastirma").download(p)).error;
const rowExists = async (id: string) => (await su.query("select count(*)::int n from public.sifa_block_assets where id=$1", [id])).rows[0].n === 1;

try {
  const TEN = randomUUID();
  const CTRL = randomUUID();
  await su.query("insert into public.tenants(id, name) values ($1,'ZZ_SIFA_GC'),($2,'ZZ_SIFA_GC_KONTROL')", [TEN, CTRL]);
  const mkUser = async (tenant: string, label: string) => {
    const id = randomUUID();
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, membership_status, subscription_status)
       values ($1, $2, $3, 'expert', true, 'approved', '{"sifa_rehberi": true}', 'premium', 'premium', $4, 'active', 'active')`,
      [id, `ZZ_SIFA_GC_${label}`, `zz.sifa.gc.${label.toLowerCase()}.${id.slice(0, 6)}@example.test`, tenant],
    );
    return id;
  };
  const U = await mkUser(TEN, "U");
  const K = await mkUser(CTRL, "K");
  /** Gerçek Storage nesnesi + (isteğe bağlı) DB görsel satırı. */
  const upload = async (tenant: string, user: string, register = true) => {
    const id = randomUUID();
    const p = `${tenant}/${user}/${id}.png`;
    const up = await svc.storage.from("sifa-arastirma").upload(p, PNG, { contentType: "image/png" });
    if (up.error) throw new Error(`yükleme: ${up.error.message}`);
    if (register) await db.rpc("sifa_v2_register_upload", { p_tenant: tenant, p_user: user, p_asset: { id, storage_path: p, mime_type: "image/png", byte_size: PNG.length } });
    return { id, p };
  };
  const fig = (id: string) => ({ type: "figure", attrs: { src: `sifa-asset:${id}`, alt: "", caption: "" } });
  const docOf = (...ids: string[]) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "not" }] }, ...ids.map(fig)] });
  const topic = randomUUID();
  const block = (id: string, content: unknown) => ({ id, topic_id: topic, title: "Kutu", content_json: content, content_text: "not", classification: null, sources: [], sort_key: `a${id.replace(/[^1-9a-z]/g, "").slice(0, 4)}z`, deleted_at: null, delete_batch_id: null, base_version: null });

  // Senaryolar
  const A1 = await upload(TEN, U); // canlı kutuda kullanılıyor
  const A2 = await upload(TEN, U); // yalnız YAKINDA çöpe atılan kutuda (geri yüklenebilir)
  const A3 = await upload(TEN, U); // canlı X + uzun süre önce çöpe atılan Y; block_id = Y (eski kuralın veri kaybı açığı)
  const A4 = await upload(TEN, U); // hiç kaydedilmemiş, eski
  const A5 = await upload(TEN, U); // içerikten çıkarılmış (block_id dolu), eski
  const A6 = await upload(TEN, U); // yalnız 30 günü dolan çöpteki kutuda
  const A7 = await upload(TEN, U); // hiç kaydedilmemiş, YENİ (bekleme süresi içinde)
  const S1 = await upload(TEN, U, false); // DB satırı yok (yarım yükleme)
  const KA = await upload(CTRL, K); // kontrol tenant'ının sahipsiz görseli
  const [bLive, bTrashNew, bY, bRemoved, bOld] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  await db.rpc("sifa_v2_apply_changeset", {
    p_tenant: TEN,
    p_user: U,
    p_changes: {
      topics: [{ id: topic, parent_id: null, title: "ZZ GC Konusu", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }],
      blocks: [block(bLive, docOf(A1.id, A3.id)), block(bTrashNew, docOf(A2.id)), block(bY, docOf(A3.id)), block(bRemoved, docOf(A5.id)), block(bOld, docOf(A6.id))],
      links_add: [],
      links_remove: [],
      asset_links: [
        { asset_id: A1.id, block_id: bLive }, { asset_id: A2.id, block_id: bTrashNew }, { asset_id: A3.id, block_id: bY },
        { asset_id: A5.id, block_id: bRemoved }, { asset_id: A6.id, block_id: bOld },
      ],
    },
  });
  // A5 içerikten çıkarıldı (kutu canlı, referans yok); zaman/çöp durumları doğrudan (sentetik) ayarlanır.
  await su.query("update public.sifa_topic_blocks set content_json = $2::jsonb where id = $1", [bRemoved, JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "görsel çıkarıldı" }] }] })]);
  await su.query("update public.sifa_topic_blocks set deleted_at = now() - interval '2 days', delete_batch_id = gen_random_uuid() where id = $1", [bTrashNew]);
  await su.query("update public.sifa_topic_blocks set deleted_at = now() - interval '45 days', delete_batch_id = gen_random_uuid() where id = any($1::uuid[])", [[bY, bOld]]);
  await su.query("update public.sifa_block_assets set created_at = now() - interval '10 days' where id = any($1::uuid[])", [[A1.id, A2.id, A3.id, A4.id, A5.id, A6.id, KA.id]]);
  const block_id_A3 = (await su.query("select block_id from public.sifa_block_assets where id=$1", [A3.id])).rows[0].block_id;
  ok(block_id_A3 === bY, "kurulum: A3'ün block_id'si uzun süre önce çöpe atılan Y kutusunu gösteriyor (eski açığın koşulu)");

  console.log("\n1) Kuru çalışma (varsayılan) — hiçbir şey silinmez");
  const snap = async () => (await su.query("select (select count(*) from public.sifa_block_assets where tenant_id=$1) a, (select count(*) from public.sifa_topic_blocks where tenant_id=$1) b, (select count(*) from storage.objects where bucket_id='sifa-arastirma' and name like $2) o", [TEN, `${TEN}/%`])).rows[0];
  const s0 = await snap();
  const dry = await runAssetLifecycle(db, st, { tenantId: TEN });
  const s1 = await snap();
  ok(dry.dryRun === true && JSON.stringify(s0) === JSON.stringify(s1), "kuru çalışma: satır ve nesne sayısı değişmedi", { dry, s0, s1 });
  const cand = (await db.rpc("sifa_v2_gc_candidates", { p_cutoff: new Date(Date.now() - 30 * 86_400_000).toISOString(), p_upload_cutoff: new Date(Date.now() - 7 * 86_400_000).toISOString(), p_tenant: TEN, p_limit: 500 })) as { assets: { id: string }[]; stray_objects: string[] };
  const cIds = new Set(cand.assets.map((a) => a.id));
  ok(cIds.has(A4.id) && cIds.has(A5.id) && cIds.has(A6.id), "adaylar: kaydedilmemiş eski (A4), içerikten çıkarılmış (A5), süresi dolmuş çöp (A6)");
  ok(!cIds.has(A1.id) && !cIds.has(A2.id) && !cIds.has(A3.id) && !cIds.has(A7.id), "korunanlar aday DEĞİL: canlı (A1), geri yüklenebilir çöp (A2), canlıda da kullanılan (A3), yeni yükleme (A7)");
  ok(!cIds.has(KA.id), "tenant filtresi: kontrol tenant'ının görseli aday listesinde yok");
  ok(cand.stray_objects.length === 0, "satırsız nesne YENİ olduğu için (bekleme süresi) aday değil");

  console.log("\n2) Gerçek çalışma (tenant'a sınırlı)");
  const run = await runAssetLifecycle(db, st, { tenantId: TEN, dryRun: false });
  ok(run.removedObjects === 3 && run.failedObjects === 0 && run.deleted.assets === 3, "3 görsel nesnesi + satırı silindi", run);
  for (const [a, label] of [[A4, "A4"], [A5, "A5"], [A6, "A6"]] as const) ok(!(await rowExists(a.id)) && !(await exists(a.p)), `${label}: satır ve nesne YOK`);
  for (const [a, label] of [[A1, "A1 canlı"], [A2, "A2 geri yüklenebilir çöp"], [A3, "A3 canlıda da kullanılan"], [A7, "A7 yeni"]] as const) ok((await rowExists(a.id)) && (await exists(a.p)), `${label}: satır ve nesne DURUYOR`);
  ok((await su.query("select count(*)::int n from public.sifa_topic_blocks where id = any($1::uuid[])", [[bY, bOld]])).rows[0].n === 0, "süresi dolmuş çöp kutuları (Y, eski) kalıcı silindi");
  ok((await su.query("select block_id from public.sifa_block_assets where id=$1", [A3.id])).rows[0].block_id === null, "A3: Y kutusu silinince bağlantı NULL oldu, görsel korunuyor (canlı X'te kullanılıyor)");
  ok((await su.query("select count(*)::int n from public.sifa_topic_blocks where id = any($1::uuid[])", [[bLive, bTrashNew, bRemoved]])).rows[0].n === 3, "canlı ve geri yüklenebilir kutular duruyor");
  ok((await rowExists(KA.id)) && (await exists(KA.p)), "kontrol tenant'ının sahipsiz görseli DOKUNULMADI");
  const urls = await db.rpc("sifa_v2_visible_assets", { p_tenant: TEN, p_user: U, p_ids: [A1.id, A3.id] });
  ok(Array.isArray(urls) && urls.length === 2, "korunan görseller hâlâ imzalanabilir (görüntülenebilir)");

  console.log("\n3) Bekleme süresi dolunca (simülasyon: +8 gün)");
  const later = new Date(Date.now() + 8 * 86_400_000);
  const run2 = await runAssetLifecycle(db, st, { tenantId: TEN, dryRun: false, now: later });
  ok(run2.removedStray === 1 && !(await exists(S1.p)), "satırsız yarım nesne (S1) Storage'dan silindi", run2);
  ok(!(await rowExists(A7.id)), "kaydedilmeyen yeni yükleme (A7) bekleme dolunca silindi");
  ok((await rowExists(A1.id)) && (await exists(A1.p)) && (await rowExists(A2.id)) && (await exists(A2.p)) && (await rowExists(A3.id)) && (await exists(A3.p)), "kullanımdaki ve çöpteki (süresi dolmamış) görseller yine korundu");

  console.log("\n4) Storage silme hatası → DB izi kaybolmaz");
  const A8 = await upload(TEN, U);
  await su.query("update public.sifa_block_assets set created_at = now() - interval '10 days' where id=$1", [A8.id]);
  const failing = { ...st, remove: async () => [] as string[] };
  const run3 = await runAssetLifecycle(db, failing, { tenantId: TEN, dryRun: false });
  ok(run3.failedObjects === 1 && (await rowExists(A8.id)) && (await exists(A8.p)), "nesne silinemedi → satır da silinmedi (sonraki tur yeniden dener)", run3);

  console.log("\n5) Yetki");
  const anon = createClient(T.url, T.publishableKey, { auth: { persistSession: false } });
  const ar = await anon.rpc("sifa_v2_gc_purge", { p_cutoff: new Date().toISOString(), p_tenant: TEN, p_removed_assets: [A1.id] });
  ok(!!ar.error && (await rowExists(A1.id)), "anon anahtarı temizlik fonksiyonunu çağıramaz", ar.error?.code);
} catch (e) {
  fail++;
  console.log(`  ✗ BEKLENMEYEN HATA: ${redact(String((e as Error)?.stack ?? e)).slice(0, 800)}`);
} finally {
  // İz bırakma: yalnız bu betiğin ZZ_SIFA_GC* tenant'larındaki satırların geriye alınmış tarihi bugüne döner
  // (preserved.real'in "8. aşama sınırı öncesi" sayımı etkilenmesin). Silme YOK.
  await su.query("update public.sifa_block_assets set created_at = now() where tenant_id in (select id from public.tenants where name like 'ZZ_SIFA_GC%')").catch(() => {});
  await su.end();
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
