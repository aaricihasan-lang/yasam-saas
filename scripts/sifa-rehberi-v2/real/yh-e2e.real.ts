/**
 * 10. aşama — YH UZMAN SAHİPLİĞİ uçtan uca (GERÇEK test projesi: gerçek V2 API → gerçek CDC tetikleyicisi →
 * gerçek outbox → GERÇEK YH worker (runOutboxBatch + createProfessionalOutboxBatchDeps) → gerçek indeks →
 * GERÇEK arama rotası (/api/yasam-hafizasi/search) ve doğrudan RPC saldırıları).
 * Her çalıştırma yeni rastgele ZZ_ tenant/uzman + benzersiz anahtar kelime üretir (tekrar çalıştırılabilir).
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/yh-e2e.real.ts
 */
import Module from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { applyProcessEnv, connectTestDb, installNetworkFence, loadTestTarget, redact } from "./guard";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 320)}` : ""}`);
};
type Json = Record<string, unknown>;

async function main() {
  const T = loadTestTarget();
  installNetworkFence(T);
  applyProcessEnv(T);
  process.env.SIFA_REHBERI_V2_ENABLED = "1";
  const su = await connectTestDb();
  const { createClient } = await import("@supabase/supabase-js");
  const svc = createClient(T.url, T.secretKey, { auth: { persistSession: false } });
  const search = await import("../../../app/api/yasam-hafizasi/search/route");
  const ws = await import("../../../app/api/sifa-rehberi-v2/workspace/route");
  const { runOutboxBatch } = await import("../../../lib/yasam-hafizasi/outbox/eventProcessor");
  const { createProfessionalOutboxBatchDeps } = await import("../../../lib/yasam-hafizasi/outbox/professionalOutboxRuntime");
  const { readProfessionalCandidate } = await import("../../../lib/yasam-hafizasi/client/snapshotStore");
  const { supabaseDb } = await import("../../../lib/sifa-rehberi-v2/server/dbAdapters");
  const { supabaseStorage } = await import("../../../lib/sifa-rehberi-v2/server/storage");
  const { purgeTrash } = await import("../../../lib/sifa-rehberi-v2/server/trash");

  // ── Aktivasyon (yalnız test projesi; gerçek production kapısı RPC'si) ──
  for (const k of ["sifa_rehberi_v2:notes", "sifa_rehberi:guides"]) {
    await su.query("select public.yh_source_activation_set($1, true, false, null, null, 'ZZ 10. asama test projesi')", [k]);
  }

  // ── Sentetik kapsam ──
  const KW = `zzyh${Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 8)}`;
  const TA = randomUUID();
  const TB = randomUUID();
  await su.query("insert into public.tenants(id, name) values ($1, 'ZZ_SIFA_YH_A'), ($2, 'ZZ_SIFA_YH_B')", [TA, TB]);
  for (const t of [TA, TB]) await su.query("insert into public.yasam_hafizasi_flags (tenant_id, yh_enabled, yh_hizli) values ($1, true, true)", [t]);
  const mk = async (label: string, tenant: string, perms: Json = { sifa_rehberi: true, yasam_hafizasi: true }) => {
    const id = randomUUID();
    const token = `zz-sifa-yh-${label.toLowerCase()}-${randomUUID()}`;
    await su.query(
      `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, membership_status, subscription_status)
       values ($1, $2, $3, 'expert', true, 'approved', $4, 'premium', 'premium', $5, 'active', 'active')`,
      [id, `ZZ_SIFA_YH_${label}`, `zz.sifa.yh.${label.toLowerCase()}@example.test`, JSON.stringify(perms), tenant],
    );
    await su.query("insert into public.user_sessions(user_id, session_token) values ($1, $2)", [id, token]);
    return { id, token };
  };
  const U1 = await mk("U1", TA);
  const U2 = await mk("U2", TA);
  const U3 = await mk("U3", TB);
  const NOYH = await mk("NOYH", TA, { sifa_rehberi: true, yasam_hafizasi: false });

  async function call(h: (r: NextRequest) => Promise<Response>, url: string, method: string, auth: { id: string; token: string } | null, body?: unknown) {
    const headers: Record<string, string> = {};
    if (auth) {
      headers["x-user-id"] = auth.id;
      headers["x-session-token"] = auth.token;
    }
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await h(new NextRequest(`http://localhost${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }));
    let json: Json = {};
    try {
      json = (await res.json()) as Json;
    } catch {
      /* boş */
    }
    return { status: res.status, json };
  }
  const find = async (u: { id: string; token: string } | null) => call(search.POST, "/api/yasam-hafizasi/search", "POST", u, { q: KW });
  const titles = (r: { json: Json }) => ((r.json.results ?? []) as { title: string }[]).map((x) => x.title).sort();
  const runWorker = async () => {
    const total = { claimed: 0, completed: 0, failed: 0, outcomes: {} as Record<string, number> };
    for (let i = 0; i < 10; i++) {
      const s = await runOutboxBatch(createProfessionalOutboxBatchDeps(svc as never, "zz-sifa-yh-e2e", 50));
      total.claimed += s.claimed;
      total.completed += s.completed;
      total.failed += s.failedPermanent + s.failedTransient + s.transportErrors;
      for (const [k, v] of Object.entries(s.outcomes)) total.outcomes[k] = (total.outcomes[k] ?? 0) + (v ?? 0);
      if (s.claimed === 0) break;
    }
    return total;
  };
  const doc = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
  const topic = (id: string, title: string, extra: Json = {}) => ({ id, parent_id: null, title, sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null, ...extra });
  const blk = (id: string, t: string, title: string, text: string) => ({ id, topic_id: t, title, content_json: doc(text), content_text: text, classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] });
  const idxRows = async (sourceId: string) => (await su.query("select tenant_id, owner_user_id from public.yasam_hafizasi_index where source_id = $1", [sourceId])).rows;

  console.log("1) İçerik: V1 kurum kayıtları (A, B) + V2 kişisel notlar (U1, U2, U3) + V2 kurum kopyası (A)");
  const GA = (await su.query(`insert into public.healing_guides (tenant_id, name, general_summary) values ($1, $2, $3) returning id`, [TA, `V1 Kurum A ${KW}`, `kurum ozeti ${KW}`])).rows[0].id;
  const GB = (await su.query(`insert into public.healing_guides (tenant_id, name, general_summary) values ($1, $2, $3) returning id`, [TB, `V1 Kurum B ${KW}`, `kurum ozeti ${KW}`])).rows[0].id;
  // V1 CDC tetikleyicisi (20261004000000) bu test projesinde kurulu değil → aynı kuyruk satırı doğrudan (tetikleyici eşdeğeri).
  for (const [g, t] of [[GA, TA], [GB, TB]]) {
    await su.query(`insert into public.yasam_hafizasi_outbox (source_key, source_table, source_id, tenant_id, operation) values ('sifa_rehberi:guides', 'healing_guides', $1, $2, 'upsert')`, [g, t]);
  }
  const P1 = randomUUID(), B1 = randomUUID(), P2 = randomUUID(), B2 = randomUUID(), P3 = randomUUID(), B3 = randomUUID();
  const s1 = await call(ws.POST, "/api/sifa-rehberi-v2/workspace", "POST", U1, { topics: [topic(P1, "U1 konusu")], blocks: [blk(B1, P1, `U1 kisisel ${KW}`, `U1 GIZLI not ${KW}`)] });
  const s2 = await call(ws.POST, "/api/sifa-rehberi-v2/workspace", "POST", U2, { topics: [topic(P2, "U2 konusu")], blocks: [blk(B2, P2, `U2 kisisel ${KW}`, `U2 GIZLI not ${KW}`)] });
  const s3 = await call(ws.POST, "/api/sifa-rehberi-v2/workspace", "POST", U3, { topics: [topic(P3, "U3 konusu")], blocks: [blk(B3, P3, `U3 kisisel ${KW}`, `U3 GIZLI not ${KW}`)] });
  ok(s1.status === 200 && s2.status === 200 && s3.status === 200, "V2 kişisel kayıtlar gerçek API ile kaydedildi", [s1.status, s2.status, s3.status]);
  const K = randomUUID(), KB = randomUUID();
  await su.query("select public.sifa_v2_import_legacy($1::uuid, $2::jsonb, '[]'::jsonb)", [TA, JSON.stringify({ topics: [topic(K, `V2 kurum kopyasi ${KW}`)], blocks: [blk(KB, K, `V2 kurum kutusu ${KW}`, `kurum ${KW}`)], assets: [] })]);
  const ob = (await su.query("select source_key, count(*)::int n from public.yasam_hafizasi_outbox where source_id = any($1::uuid[]) group by 1 order by 1", [[B1, B2, B3, KB, GA, GB]])).rows;
  const obMap = Object.fromEntries(ob.map((r) => [r.source_key, r.n]));
  ok(ob.length === 2 && obMap["sifa_rehberi:guides"] === 2 && obMap["sifa_rehberi_v2:notes"] === 3, "kuyruk: 3 kişisel not (CDC tetikleyicisi) + 2 V1; V2 kurum kopyası KUYRUKTA YOK", ob);

  console.log("2) Gerçek YH worker");
  const w1 = await runWorker();
  ok(w1.failed === 0 && w1.completed >= 5, "worker: olaylar tamamlandı, hata 0", w1);
  const r1 = await idxRows(B1);
  ok(r1.length === 1 && r1[0].owner_user_id === U1.id && r1[0].tenant_id === TA, "U1 notu indekste: tenant A + owner U1", r1);
  ok((await idxRows(KB)).length === 0, "V2 kurum kopyası indekste YOK (V1 ile mükerrer değil)");
  ok((await idxRows(GA)).length === 1 && (await idxRows(GA))[0].owner_user_id === null, "V1 kurum kaydı indekste: owner NULL (tenant geneli)");

  console.log("3) Güvenlik matrisi — GERÇEK arama rotası (oturumdan tenant + kullanıcı)");
  const a1 = await find(U1);
  ok(a1.status === 200 && JSON.stringify(titles(a1)) === JSON.stringify([`U1 kisisel ${KW}`, `V1 Kurum A ${KW}`].sort()), "A/U1: kendi kişisel notu + A'nın V1 kurum kaydı; U2 YOK", titles(a1));
  const a2 = await find(U2);
  ok(a2.status === 200 && JSON.stringify(titles(a2)) === JSON.stringify([`U2 kisisel ${KW}`, `V1 Kurum A ${KW}`].sort()), "A/U2: kendi kişisel notu + A kurum; U1 YOK", titles(a2));
  const b3 = await find(U3);
  ok(b3.status === 200 && JSON.stringify(titles(b3)) === JSON.stringify([`U3 kisisel ${KW}`, `V1 Kurum B ${KW}`].sort()), "B/U3: yalnız B; A'nın hiçbir kişisel/ortak kaydı YOK", titles(b3));
  const allJson = JSON.stringify([a1.json, a2.json, b3.json]);
  ok(!JSON.stringify(a1.json).includes("U2 GIZLI") && !JSON.stringify(a2.json).includes("U1 GIZLI") && !JSON.stringify(b3.json).includes("U1 GIZLI"), "yanıt gövdesinin HİÇBİR yerinde (özet/kanıt/etiket) başka uzmanın metni yok");
  const facets = (r: { json: Json }) => ((r.json.facets ?? []) as { count: number }[]).reduce((s, f) => s + Number(f.count ?? 0), 0);
  ok(a1.json.total === 2 && facets(a1) === 2 && a2.json.total === 2 && facets(a2) === 2 && b3.json.total === 2, "sayaçlar (total + faset) yalnız görünür sonuçları sayar", { a1: [a1.json.total, facets(a1)], a2: [a2.json.total, facets(a2)] });
  const health = await import("../../../app/api/yasam-hafizasi/health/route");
  const h1 = await call(health.GET as never, "/api/yasam-hafizasi/health", "GET", U1);
  const h2 = await call(health.GET as never, "/api/yasam-hafizasi/health", "GET", U2);
  const h3 = await call(health.GET as never, "/api/yasam-hafizasi/health", "GET", U3);
  ok(h1.json.tenantRows === 2 && h2.json.tenantRows === 2 && h3.json.tenantRows === 2, "YH sağlık sayacı: yalnız kendi + tenant geneli satırlar (başka uzmanın not ADEDİ sızmaz)", [h1.json.tenantRows, h2.json.tenantRows, h3.json.tenantRows]);
  ok(!allJson.includes(`V2 kurum kutusu ${KW}`) && ((a1.json.results ?? []) as { sourceTable: string }[]).filter((x) => x.sourceTable === "healing_guides").length === 1, "V1/V2 mükerrer YOK: kurum içeriği tek sonuç (V1)");

  console.log("4) Yetkisiz erişim ve parametre sahteciliği");
  ok((await find(null)).status === 401, "oturumsuz arama → 401");
  ok((await find({ id: U2.id, token: U1.token })).status !== 200, "başkasının token'ı ile x-user-id sahteciliği → reddedilir");
  ok((await find(NOYH)).status === 403, "YH modül izni olmayan uzman → 403");
  const rpcBody = (tenant: string, user: string | null) => ({ p_tsquery: KW, p_session_tenant: tenant, p_session_user: user, p_weights: [1, 0.6, 0.35, 0.15], p_limit: 50, p_modules: null });
  const anon = await fetch(`${T.url}/rest/v1/rpc/yh_search_candidates_v3`, { method: "POST", headers: { apikey: T.publishableKey, Authorization: `Bearer ${T.publishableKey}`, "content-type": "application/json" }, body: JSON.stringify(rpcBody(TA, U1.id)) });
  ok(anon.status === 401 || anon.status === 403, "tarayıcı anahtarıyla v3 RPC → reddedilir", anon.status);
  const anonIdx = await fetch(`${T.url}/rest/v1/yasam_hafizasi_index?select=title&limit=1`, { headers: { apikey: T.publishableKey, Authorization: `Bearer ${T.publishableKey}` } });
  ok(!anonIdx.ok, "tarayıcı anahtarıyla indeks tablosu okunamaz", anonIdx.status);
  const forged = await svc.rpc("yh_search_candidates_v3", rpcBody(TB, U1.id));
  ok(!forged.error && !JSON.stringify(forged.data).includes("U1 kisisel"), "service_role + (tenant B, kullanıcı U1) sahteciliği → U1 notu DÖNMEZ (üyelik doğrulaması)", (forged.data as Json[] | null)?.map((x) => x.title));
  const v2call = await svc.rpc("yh_search_candidates_v2", { p_tsquery: KW, p_session_tenant: TA, p_weights: [1, 0.6, 0.35, 0.15], p_limit: 50, p_modules: null });
  ok(!v2call.error && !JSON.stringify(v2call.data).includes("kisisel"), "eski v2 doğrudan çağrısı kişisel notları HİÇ döndürmez", (v2call.data as Json[] | null)?.map((x) => x.title));
  const idxId = (await su.query("select id from public.yasam_hafizasi_index where source_id = $1", [B1])).rows[0].id;
  const snap = await readProfessionalCandidate({ db: svc as never, tenantId: TA, clientId: randomUUID(), actorUserId: U1.id, allowShared: false } as never, idxId);
  ok(snap === null, "danışan rapor anlık görüntüsü kişisel notu KOPYALAYAMAZ (sahibi istese de)");
  const snapV1 = await readProfessionalCandidate({ db: svc as never, tenantId: TA, clientId: randomUUID(), actorUserId: U1.id, allowShared: false } as never, (await su.query("select id from public.yasam_hafizasi_index where source_id = $1", [GA])).rows[0].id);
  ok(snapV1 !== null, "V1 kurum kaydı anlık görüntüye alınabilir (davranış aynen)");

  console.log("5) Çöp Kutusu yaşam döngüsü (gerçek API → CDC → worker)");
  const tv = Number((await su.query("select version from public.sifa_topics where id = $1", [P1])).rows[0].version);
  const tr = await call(ws.POST, "/api/sifa-rehberi-v2/workspace", "POST", U1, { topics: [{ ...topic(P1, "U1 konusu"), deleted_at: new Date().toISOString(), delete_batch_id: randomUUID(), base_version: tv }] });
  ok(tr.status === 200, "U1 konusunu çöpe attı (yalnız konu; kutusu işaretlenmeden — üst konu kapısı sınanır)", tr.status);
  const w2 = await runWorker();
  ok((await idxRows(B1)).length === 0 && w2.failed === 0, "çöpteki konunun notu indeksten KALKTI", w2);
  ok(!titles(await find(U1)).includes(`U1 kisisel ${KW}`), "aramada GÖRÜNMEZ");
  const tv2 = Number((await su.query("select version from public.sifa_topics where id = $1", [P1])).rows[0].version);
  await call(ws.POST, "/api/sifa-rehberi-v2/workspace", "POST", U1, { topics: [{ ...topic(P1, "U1 konusu"), base_version: tv2 }] });
  await runWorker();
  const back = await idxRows(B1);
  ok(back.length === 1 && back[0].owner_user_id === U1.id, "geri alındı → yeniden indekslendi, AYNI kapsamla (owner U1)", back);
  ok(titles(await find(U1)).includes(`U1 kisisel ${KW}`) && !titles(await find(U2)).includes(`U1 kisisel ${KW}`), "geri alınan not yalnız U1'e görünür");

  console.log("6) Tekrar indeksleme mükerrer üretmez");
  const n0 = (await su.query("select public.yh_sifa_v2_replay_enqueue($1) n", [TA])).rows[0].n;
  await runWorker();
  await su.query("select public.yh_sifa_v2_replay_enqueue($1)", [TA]);
  await runWorker();
  const dup = (await su.query("select source_id, count(*)::int n from public.yasam_hafizasi_index where tenant_id = $1 group by 1 having count(*) > 1", [TA])).rows;
  ok(n0 >= 2 && dup.length === 0, "replay ×2 + worker ×2 → her kaynak için TEK indeks satırı", { n0, dup });

  console.log("7) Kalıcı silme (gerçek çöp temizliği → delete olayı → deindex)");
  const batch = randomUUID();
  await su.query("update public.sifa_topics set deleted_at = now() - interval '40 days', delete_batch_id = $2 where id = $1", [P2, batch]);
  await su.query("update public.sifa_topic_blocks set deleted_at = now() - interval '40 days', delete_batch_id = $2 where id = $1", [B2, batch]);
  const pr = await purgeTrash(supabaseDb(svc as never), supabaseStorage(svc as never));
  await runWorker();
  ok(Number((await su.query("select count(*)::int n from public.sifa_topic_blocks where id = $1", [B2])).rows[0].n) === 0 && pr.deleted.blocks >= 1, "kaynak satırı kalıcı silindi", pr.deleted);
  ok((await idxRows(B2)).length === 0, "indekste KALINTI YOK");
  ok(!titles(await find(U2)).some((t) => t.startsWith("U2 kisisel")), "aramada görünmez");

  const stuck = (await su.query("select count(*)::int n from public.yasam_hafizasi_outbox where source_id = any($1::uuid[]) and status <> 'succeeded'", [[B1, B2, B3, GA, GB]])).rows[0].n;
  ok(Number(stuck) === 0, "kuyrukta bekleyen/başarısız olay kalmadı", stuck);
  await su.end();
}

main()
  .catch((e) => {
    fail++;
    console.log(`  ✗ ${redact(String((e as Error)?.stack ?? e)).slice(0, 900)}`);
  })
  .finally(() => {
    console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  });
