/**
 * Şifa Rehberi F3 — YAŞAM HAFIZASI: çöpteki ANA NOTUN kutuları aramaya yansımaz (yerel GEÇİCİ PostgreSQL;
 * ağ / sır / production / test projesi YOK).
 *
 * Zincir uçtan uca gerçek: kayıt servisi (saveChangeset → sifa_v2_apply_changeset) → CDC tetikleyicileri
 * (20280110000100 + YENİ 20280130000100) → outbox → GERÇEK YH worker (runOutboxBatch +
 * createProfessionalOutboxBatchDeps; okuyucu kapısı filterSifaV2Live) → gerçek indeks → GERÇEK arama RPC'si
 * (yh_search_candidates_v3, SET ROLE service_role). PostgREST: test-only shim (scripts/usage360/pgrestShim).
 * Yaşam Hafızası ÜRÜNDE ETKİNLEŞTİRİLMEZ: aktivasyon yalnız bu geçici veritabanında açılır/kapanır.
 *
 * Çalıştır: npx tsx scripts/sifa-rehberi-f3/yh-kutu.pg.mts   (FAIL → exit 1)
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import Module from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { startPgrestShim } from "../usage360/pgrestShim";
import { saveChangeset, type Scope } from "@/lib/sifa-rehberi-v2/server/service";
import { pgDb } from "@/lib/sifa-rehberi-v2/server/dbAdapters";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const ROOT = process.cwd();
const M = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
const NEW_SQL = M("20280130000100_yh_sifa_f3_kutu_yayilimi.sql");
// Gerçek YH çekirdek migration'ları — scripts/sifa-rehberi-v2/yh/yh-owner.pg.harness.mts YH_CORE ile aynı liste
// (o dosya import edilmez: üst düzeyde kendi testini çalıştırır).
const YH_CORE = [
  "20260710000000_yasam_hafizasi_index.sql",
  "20260712000000_yasam_hafizasi_lexical_infra.sql",
  "20260724000000_yh_search_candidates_rpc.sql",
  "20260815000000_yasam_hafizasi_outbox.sql",
  "20260901000000_yasam_hafizasi_reconcile_enqueue.sql",
  "20260927000000_yh_source_activation_control.sql",
];
const SRC = "sifa_rehberi_v2:notes";

let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${!c && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};

const port = await new Promise<number>((res) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); });
});
const dir = path.join(os.tmpdir(), `sifa-f3-yh-${process.pid}`);
const epg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "x", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
await epg.initialise();
await epg.start();
const c = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password: "x", database: "postgres" });
await c.connect();
// Gerçek PostgREST bigint'i JSON SAYISI döner (event_version); pg sürücüsü metin döner → yalnız shim havuzunda sayıya çevrilir.
const int8AsNumber = { getTypeParser: (oid: number, fmt?: "text" | "binary") => (oid === 20 ? (v: string) => Number(v) : pg.types.getTypeParser(oid, fmt as "text")) };
const pool = new pg.Pool({ host: "127.0.0.1", port, user: "postgres", password: "x", database: "postgres", max: 10, types: int8AsNumber as never });
const q = (s: string, p?: unknown[]) => c.query(s, p);
const db = pgDb(c);
let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;

const TA = randomUUID(), TB = randomUUID();
const U1: Scope = { tenantId: TA, userId: randomUUID() };
const U2: Scope = { tenantId: TA, userId: randomUUID() };
const KW = `zzkutu${Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 6)}`;
const doc = (x: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: x }] }] });
const topic = (o: Record<string, unknown>) => ({ parent_id: null, sort_key: "m", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null, ...o });
const blk = (o: Record<string, unknown> & { text: string }) => {
  const { text, ...rest } = o;
  return { title: "", content_json: doc(text), content_text: text, classification: null, sort_key: "m", deleted_at: null, delete_batch_id: null, base_version: null, sources: [], ...rest };
};
async function save(s: Scope, body: Record<string, unknown>) {
  const r = await saveChangeset(db, s, { topics: [], blocks: [], links_add: [], links_remove: [], ...body });
  if (!r.ok) throw new Error(`kayıt reddedildi: ${r.status} ${r.code} ${r.error}`);
}
const rowOf = async (id: string) => (await q("select * from public.sifa_topic_blocks where id=$1", [id])).rows[0];
/** Ekrandaki "notu çöpe at": YALNIZ not satırı (kutular dokunulmadan) — F3 istemcisinin ürettiği küme. */
async function setNoteTrash(s: Scope, noteId: string, trashed: boolean) {
  const n = await rowOf(noteId);
  await save(s, { blocks: [{ ...blk({ id: noteId, topic_id: n.topic_id, title: n.title, text: n.content_text, sort_key: n.sort_key }), content_json: n.content_json, base_version: n.version,
    deleted_at: trashed ? new Date().toISOString() : null, delete_batch_id: trashed ? randomUUID() : null }] });
}
const outbox = async () => (await q(`select source_id::text id, operation op from public.yasam_hafizasi_outbox where source_key=$1 and status='pending' order by 1`, [SRC])).rows as Array<{ id: string; op: string }>;
const clearOutbox = () => q("delete from public.yasam_hafizasi_outbox where source_key=$1", [SRC]); // yalnız yerel geçici DB
const activate = (on: boolean) => q("insert into public.yh_source_activation (source_key, is_active) values ($1, $2) on conflict (source_key) do update set is_active = excluded.is_active", [SRC, on]);
const W = "{1,0.6,0.35,0.15}";
async function search(s: Scope): Promise<string[]> {
  await q("BEGIN");
  await q("SET LOCAL ROLE service_role");
  try {
    const r = await q(`select source_id::text id from public.yh_search_candidates_v3($1, $2::uuid, $3::uuid, $4::float4[], 50, null)`, [KW, s.tenantId, s.userId, W]);
    return r.rows.map((x) => x.id).sort();
  } finally {
    await q("COMMIT");
  }
}
const indexed = async (id: string) => Number((await q("select count(*)::int n from public.yasam_hafizasi_index where source_id=$1", [id])).rows[0].n);
const eq = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

try {
  console.log("0) Kurulum: gerçek YH çekirdeği + Şifa V2 + YH sahiplik + görsel yaşam döngüsü + F3 + YENİ migration (×2)");
  await q(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
           create schema extensions; create extension unaccent with schema extensions; create extension pgcrypto;
           grant usage on schema extensions to anon, authenticated, service_role; -- Supabase varsayılanı
           grant usage on schema public to anon, authenticated, service_role;
           alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
           alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
           alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
           create table public.tenants (id uuid primary key, name text, is_demo boolean default false);
           create table public.users (id uuid primary key, tenant_id uuid, role text, active boolean default true, full_name text, is_demo_account boolean default false);
           create table public.stone_exclusions (tenant_id text, stone_id uuid);
           grant select on public.users, public.tenants, public.stone_exclusions to service_role;`);
  for (const f of YH_CORE) await q(M(f));
  for (const f of ["20280110000000_sifa_rehberi_v2_core.sql", "20280110000100_yh_owner_scope_sifa_v2.sql", "20280124000000_sifa_v2_asset_lifecycle.sql", "20280130000000_sifa_rehberi_f3.sql"]) await q(M(f));
  let migErr = "";
  try { await q(NEW_SQL); await q(NEW_SQL); } catch (e) { migErr = (e as Error).message; }
  ok(migErr === "", "yeni migration uygulandı ve İKİNCİ kez hatasız (idempotent)", migErr);
  const trg = (await q(`select t.tgname, t.tgfoid::regproc::text fn from pg_trigger t where t.tgrelid='public.sifa_topic_blocks'::regclass and not t.tgisinternal and t.tgname like 'yh_%' order by 1`)).rows;
  ok(trg.length === 3 && trg.some((r) => r.tgname === "yh_cdc_sifa_v2_note_trash_trg" && r.fn === "yh_sifa_v2_note_trash_enqueue"), "kutu tablosunda YH tetikleyicileri: mevcut 2 + yeni not-çöpü tetikleyicisi", trg);
  const priv = (await q(`select has_function_privilege('anon','public.yh_sifa_v2_note_trash_enqueue()','EXECUTE') a, has_function_privilege('authenticated','public.yh_sifa_v2_note_trash_enqueue()','EXECUTE') b,
    has_function_privilege('service_role','public.yh_sifa_v2_note_trash_enqueue()','EXECUTE') s, p.prosecdef, p.proconfig::text cfg from pg_proc p where p.oid='public.yh_sifa_v2_note_trash_enqueue()'::regprocedure`)).rows[0];
  ok(!priv.a && !priv.b && !priv.s && priv.prosecdef && priv.cfg === "{\"search_path=public, pg_catalog\"}", "yeni fonksiyon hiçbir role çağrılamaz; SECURITY DEFINER + sabit search_path", priv);
  const fresh = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password: "x", database: "template1" });
  await fresh.connect();
  let preErr = "";
  try { await fresh.query(NEW_SQL); } catch (e) { preErr = (e as Error).message; }
  await fresh.end();
  ok(/önkoşul eksik/.test(preErr), "önkoşul migration'ları yoksa açık hata ile durur (yarım kurulum yok)", preErr);

  await q("insert into public.tenants (id, name) values ($1,'ZZ A'),($2,'ZZ B')", [TA, TB]);
  await q("insert into public.users (id, tenant_id, role, active) values ($1,$3,'expert',true),($2,$3,'expert',true)", [U1.userId, U2.userId, TA]);

  console.log("1) Yaşam Hafızası KAPALI (ürünün mevcut durumu): hiçbir olay üretilmez, kayıt bozulmaz");
  const P0 = randomUUID(), N0 = randomUUID(), K0 = randomUUID();
  await save(U1, { topics: [topic({ id: P0, title: "Kapalı konu" })], blocks: [blk({ id: N0, topic_id: P0, title: "Not", text: "not" }), blk({ id: K0, topic_id: P0, parent_block_id: N0, text: `kutu ${KW}` })] });
  await setNoteTrash(U1, N0, true);
  ok((await outbox()).length === 0 && (await rowOf(N0)).deleted_at !== null, "aktivasyon kapalı: not çöpe atıldı, kuyruk BOŞ");
  await setNoteTrash(U1, N0, false);

  console.log("2) Aktivasyon YALNIZ bu geçici veritabanında açılır; gerçek worker indeksler");
  await activate(true);
  const P1 = randomUUID(), N1 = randomUUID(), K1 = randomUUID(), K2 = randomUUID(), N2 = randomUUID(), K3 = randomUUID();
  const PB = randomUUID(), NB = randomUUID(), KB = randomUUID();
  await save(U1, { topics: [topic({ id: P1, title: "Migren" })], blocks: [
    blk({ id: N1, topic_id: P1, title: "Not bir", text: "ana not bir", sort_key: "a" }),
    blk({ id: K1, topic_id: P1, parent_block_id: N1, title: `Kutu bir ${KW}`, text: `birinci kutu ${KW}`, sort_key: "a" }),
    blk({ id: K2, topic_id: P1, parent_block_id: N1, title: `Kutu iki ${KW}`, text: `ikinci kutu ${KW}`, sort_key: "b" }),
    blk({ id: N2, topic_id: P1, title: "Not iki", text: "ana not iki", sort_key: "b" }),
    blk({ id: K3, topic_id: P1, parent_block_id: N2, title: `Kutu üç ${KW}`, text: `üçüncü kutu ${KW}`, sort_key: "a" }),
  ] });
  await save(U2, { topics: [topic({ id: PB, title: "Astım" })], blocks: [
    blk({ id: NB, topic_id: PB, title: "U2 notu", text: "u2" }),
    blk({ id: KB, topic_id: PB, parent_block_id: NB, title: `U2 kutusu ${KW}`, text: `u2 kutu ${KW}` }),
  ] });
  // Kapalıyken yazılmış eski kayıtlar: tarihsel kuyruğa alma (exact yol).
  await q("select public.yh_sifa_v2_replay_enqueue($1)", [TA]);

  // Gerçek PostgREST JSON dizisini dizi tipli sütunda (text[]) PostgreSQL dizisine çevirir; test shim'i
  // (paylaşılan dosya — DEĞİŞTİRİLMEZ) JSON metni gönderir. Yalnız bu harness'in havuzunda, yalnız dizi tipli
  // sütun konumlarında aynı dönüşüm yapılır (jsonb sütunlar etkilenmez).
  const arrayCols = new Map<string, Set<string>>();
  for (const r of (await q(`select table_name t, column_name c from information_schema.columns where table_schema='public' and data_type='ARRAY'`)).rows) {
    if (!arrayCols.has(r.t)) arrayCols.set(r.t, new Set());
    arrayCols.get(r.t)!.add(r.c);
  }
  const fixParams = (sql: unknown, params: unknown) => {
    const m = typeof sql === "string" ? /^insert into public\.("?)([a-z_]+)\1 \(([^)]*)\)/i.exec(sql) : null;
    if (!m || !Array.isArray(params)) return params;
    const set = arrayCols.get(m[2]);
    if (!set) return params;
    const cols = m[3].split(",").map((x) => x.trim().replace(/"/g, ""));
    return params.map((v, i) => (set.has(cols[i]) && typeof v === "string" && v.startsWith("[") ? JSON.parse(v) : v));
  };
  const wrapClient = <T extends { query: (...a: unknown[]) => unknown }>(cl: T): T =>
    new Proxy(cl, { get: (t, k) => (k === "query" ? (sql: unknown, params?: unknown, ...rest: unknown[]) => t.query(sql, fixParams(sql, params), ...rest) : Reflect.get(t, k, t)) });
  const shimPool = new Proxy(pool, {
    get: (t, k) => {
      if (k === "connect") return async () => wrapClient(await t.connect());
      if (k === "query") return (sql: unknown, params?: unknown) => t.query(sql as string, fixParams(sql, params) as unknown[]);
      return Reflect.get(t, k, t);
    },
  });
  shim = await startPgrestShim(shimPool);
  process.env.NEXT_PUBLIC_SUPABASE_URL = shim.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "zz-test-service-role-not-a-secret";
  // Tanı: shim'in reddettiği ilk istekler (yalnız hata halinde yazdırılır).
  const shimErrors: string[] = [];
  const baseFetch = globalThis.fetch;
  const tracingFetch: typeof fetch = async (input, init) => {
    const res = await baseFetch(input, init);
    if (!res.ok && shimErrors.length < 5) {
      const body = await res.clone().text().catch(() => "");
      shimErrors.push(`${init?.method ?? "GET"} ${String(input).replace(shim!.url, "").slice(0, 90)} → ${res.status} ${body.slice(0, 200)}`);
    }
    return res;
  };
  globalThis.fetch = tracingFetch; // sunucu istemcisi (getServerDb) de aynı shim'e gider
  const svc = createClient(shim.url, "zz-test-service-role-not-a-secret", { auth: { persistSession: false } });
  const { runOutboxBatch } = await import("../../lib/yasam-hafizasi/outbox/eventProcessor");
  const { createProfessionalOutboxBatchDeps } = await import("../../lib/yasam-hafizasi/outbox/professionalOutboxRuntime");
  const { createSupabaseSourceReader } = await import("../../lib/yasam-hafizasi/indexer/supabaseIndexAdapters");
  const { YH_INDEX_SOURCES } = await import("../../lib/yasam-hafizasi/indexer/sources");
  const runWorker = async () => {
    const t = { claimed: 0, completed: 0, failed: 0 };
    for (let i = 0; i < 10; i++) {
      const s = await runOutboxBatch(createProfessionalOutboxBatchDeps(svc as never, "zz-sifa-f3-yh", 50));
      t.claimed += s.claimed; t.completed += s.completed; t.failed += s.failedPermanent + s.failedTransient + s.transportErrors;
      if (s.claimed === 0) break;
    }
    if (t.failed > 0) {
      const errs = (await q("select distinct last_error from public.yasam_hafizasi_outbox where source_key=$1 and last_error is not null", [SRC])).rows;
      console.log(`    (worker hata kodları: ${JSON.stringify(errs.map((r) => r.last_error))}; shim: ${JSON.stringify(shimErrors)})`);
    }
    return t;
  };
  const w1 = await runWorker();
  ok(w1.failed === 0 && w1.completed >= 9, "worker: tüm olaylar tamamlandı, hata 0", w1);
  const s1 = await search(U1);
  ok(eq(s1, [K0, K1, K2, K3]), "U1 araması: kendi 4 kutusu (K0, K1, K2, K3); U2'nin kutusu YOK", s1);
  ok(eq(await search(U2), [KB]), "U2 araması: yalnız kendi kutusu");

  console.log("3) ANA NOT çöpe → kutuları kuyruğa → indeksten düşer → aramada YOK");
  await clearOutbox();
  await setNoteTrash(U1, N1, true);
  const ob1 = await outbox();
  ok(eq(ob1.map((r) => r.id), [N1, K1, K2]) && ob1.every((r) => r.op === "upsert"), "kuyruk: not + İKİ kutusu (K1, K2); diğer notun kutusu (K3) ve U2 kutusu YOK", ob1);
  ok((await rowOf(K1)).deleted_at === null && (await rowOf(K2)).deleted_at === null, "kutu satırlarına DOKUNULMADI (yalnız not çöpte; F2 davranışı)");
  const w2 = await runWorker();
  ok(w2.failed === 0 && (await indexed(K1)) === 0 && (await indexed(K2)) === 0 && (await indexed(K3)) === 1, "worker: K1 ve K2 indeksten SİLİNDİ; K3 duruyor", { w2, K1: await indexed(K1), K2: await indexed(K2), K3: await indexed(K3) });
  const s2 = await search(U1);
  ok(eq(s2, [K0, K3]), "U1 araması: çöpteki notun kutuları GÖRÜNMEZ (yalnız K0, K3)", s2);
  ok(eq(await search(U2), [KB]), "U2 etkilenmedi");

  console.log("4) Okuyucu kapısı (olay olmasa bile savunma)");
  const reader = createSupabaseSourceReader(svc as never);
  const cfg = YH_INDEX_SOURCES.find((x) => x.sourceKey === SRC)!;
  const ex = async (id: string) => (await reader.readExactRecord!({ config: cfg, sourceId: id } as never)).rows.length;
  ok((await ex(K1)) === 0 && (await ex(K2)) === 0 && (await ex(K3)) === 1, "çöpteki notun kutusu okunmaz (0 satır); canlı notun kutusu okunur", { K1: await ex(K1), K3: await ex(K3) });

  console.log("5) Not geri alınınca kutular aramaya DÖNER");
  await clearOutbox();
  await setNoteTrash(U1, N1, false);
  ok(eq((await outbox()).map((r) => r.id), [N1, K1, K2]), "geri alma: not + kutuları kuyruğa");
  await runWorker();
  ok(eq(await search(U1), [K0, K1, K2, K3]), "U1 araması: K1 ve K2 geri geldi");

  console.log("6) Tek kutu çöpe / kalıcı kutu silme / konu çöpe / kalıcı not silme");
  await clearOutbox();
  const k3 = await rowOf(K3);
  await save(U1, { blocks: [{ ...blk({ id: K3, topic_id: P1, parent_block_id: N2, title: k3.title, text: k3.content_text, sort_key: "a" }), base_version: k3.version, deleted_at: new Date().toISOString(), delete_batch_id: randomUUID() }] });
  const ob5 = (await outbox()).map((r) => r.id);
  // F3: kutu değişikliği ana notun content_updated_at'ini günceller → notun KENDİ olayı (yayılım değil; not çöpte değil).
  ok(eq(ob5, [K3, N2]), "yalnız kutu çöpe → o kutu + ana notunun kendi güncelleme olayı; kardeş/başka kutu YOK (yayılım tetiklenmez)", ob5);
  await runWorker();
  ok(eq(await search(U1), [K0, K1, K2]), "çöpteki kutu aramada yok");
  await clearOutbox();
  const k2 = await rowOf(K2);
  await save(U1, { blocks_delete: [{ id: K2, base_version: k2.version }] });
  const ob6 = await outbox();
  ok(ob6.some((r) => r.id === K2 && r.op === "delete"), "kalıcı kutu silme → delete olayı", ob6);
  await runWorker();
  ok((await indexed(K2)) === 0 && eq(await search(U1), [K0, K1]), "kalıcı silinen kutu indekste ve aramada yok");
  await clearOutbox();
  const p1 = (await q("select * from public.sifa_topics where id=$1", [P1])).rows[0];
  await save(U1, { topics: [topic({ id: P1, title: p1.title, sort_key: p1.sort_key, base_version: p1.version, deleted_at: new Date().toISOString(), delete_batch_id: randomUUID() })] });
  const ob7 = (await outbox()).map((r) => r.id);
  ok([N1, K1, N2].every((x) => ob7.includes(x)), "konu çöpe → konudaki notlar ve kutular kuyruğa (mevcut davranış F3 kutularını da kapsar)", ob7);
  await runWorker();
  ok(eq(await search(U1), [K0]), "çöpteki konunun kutuları aramada yok");
  await clearOutbox();
  await q("delete from public.sifa_topic_blocks where id=$1", [N0]); // kalıcı not silme (çöp temizliği eşdeğeri) → kutular CASCADE
  const ob8 = await outbox();
  ok(ob8.some((r) => r.id === K0 && r.op === "delete") && (await rowOf(K0)) === undefined, "kalıcı not silme → kutusu CASCADE ile silinir + delete olayı", ob8);
  await runWorker();
  ok((await indexed(K0)) === 0 && eq(await search(U1), []), "kalıcı silinen notun kutusu aramada yok");

  console.log("7) Aktivasyon tekrar KAPALI (ürünün mevcut durumu korunur)");
  await activate(false);
  await clearOutbox();
  await setNoteTrash(U2, NB, true);
  ok((await outbox()).length === 0 && (await rowOf(NB)).deleted_at !== null, "kapalı: not çöpe atıldı, olay YOK, kayıt başarılı");

  console.log("8) Şema geri dönüşü (docs/sifa-rehberi-f3/geri-donus-sema.sql) YH kuruluyken");
  await q(readFileSync(path.join(ROOT, "docs/sifa-rehberi-f3/geri-donus-sema.sql"), "utf8"));
  const trg2 = (await q(`select t.tgname from pg_trigger t where t.tgrelid='public.sifa_topic_blocks'::regclass and not t.tgisinternal and t.tgname like 'yh_%' order by 1`)).rows.map((r) => r.tgname);
  ok(JSON.stringify(trg2) === JSON.stringify(["yh_cdc_sifa_v2_blocks_delete_trg", "yh_cdc_sifa_v2_blocks_upsert_trg"]) && (await q("select to_regprocedure('public.yh_sifa_v2_note_trash_enqueue()') f")).rows[0].f === null,
    "geri dönüş: YALNIZ yeni not-çöpü tetikleyicisi + fonksiyonu kalktı; mevcut YH tetikleyicileri yerinde", trg2);
  await activate(true);
  const nb = await rowOf(NB);
  await q("update public.sifa_topic_blocks set deleted_at = null, delete_batch_id = null, version = version + 1 where id = $1", [nb.id]); // yalnız yerel geçici DB
  ok((await rowOf(NB)).deleted_at === null, "geri dönüş sonrası not satırı güncellenebiliyor (tetikleyici hatası yok)");
  await activate(false);
} catch (e) {
  fail++;
  console.log(`  ✗ BEKLENMEYEN: ${String((e as Error).stack ?? e).slice(0, 900)}`);
} finally {
  await shim?.close().catch(() => {});
  await pool.end().catch(() => {});
  await c.end().catch(() => {});
  await epg.stop().catch(() => {});
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows: postgres dosya kilidi — geçici klasör */ }
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
