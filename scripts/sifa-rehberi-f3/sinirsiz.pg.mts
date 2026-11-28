/**
 * Şifa Rehberi F3-R1 — KULLANICI SINIRI YOK (Owner kararı 27.11.2026): konu, not, içerik kutusu, kaynak, görsel SAYISINA
 * kullanıcı kotası uygulanmaz. Yerel GEÇİCİ PostgreSQL + gerçek migration'lar + gerçek kayıt servisi + gerçek F3 modeli
 * (ağ / sır / production / Storage YOK; tamamen sentetik).
 *   A) Model: kalabalık gruplarda (2.600 kardeş) silme / taşıma / ekleme YALNIZ değişen satırları gönderir
 *      (istek başına teknik sınır toplam sayıya dönüşmez); sıra anahtarları geçerli ve görünen sıra doğru.
 *   B) Veritabanı: 2.600 ana konu, 2.600 notlu başlık, 2.600 kutulu not, 300 kaynaklı not, 6.000 görsel satırı yazılır;
 *      model değişiklikleri gerçek SQL'e yazılır ve yeniden yüklemede sıra birebir.
 *   C) Kaynakta kota kalıntısı yok.
 * Çalıştır: npx tsx scripts/sifa-rehberi-f3/sinirsiz.pg.mts   (FAIL → exit 1)
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import crypto from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import { loadWorkspace, saveChangeset, type Scope } from "@/lib/sifa-rehberi-v2/server/service";
import { pgDb } from "@/lib/sifa-rehberi-v2/server/dbAdapters";
import { CHANGESET_LIMITS } from "@/lib/sifa-rehberi-v2/changeset";
import { orderKeys, stateToChangeset, workspaceToState, type State } from "@/lib/sifa-rehberi-f3/model";
import { jsonToText } from "@/lib/sifa-rehberi-f3/richText";
import type { Workspace } from "@/lib/sifa-rehberi-v2/types";

let pass = 0;
let fail = 0;
const ok = (c: unknown, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${!c && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const section = (s: string) => console.log(`\n${s}`);
const id = (): string => crypto.randomUUID();
const N = 2600; // > istek başına 2.000 teknik sınırı
const codec = { toHtml: (j: JSONContent | null) => JSON.stringify(j), toJson: (h: string) => JSON.parse(h) as JSONContent, toText: jsonToText };
const doc = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const KEY_RE = /^[0-9a-z]*[1-9a-z]$/;

// ── A) Model (saf) ───────────────────────────────────────────────────────────────
section("A) Model: kalabalık gruplarda yalnız değişen satırlar");
{
  const keys = Array.from({ length: N }, (_, i) => `${(i + 1).toString(36).padStart(5, "0")}m`);
  const ids = keys.map(() => id());
  const ex = new Map(ids.map((x, i) => [x, keys[i]]));
  const valid = (order: string[], m: Map<string, string>) => order.every((x, i) => KEY_RE.test(m.get(x)!) && (i === 0 || m.get(order[i - 1])! < m.get(x)!));
  const changed = (m: Map<string, string>) => [...m].filter(([x, k]) => ex.get(x) !== k).length;
  const del = ids.slice(1);
  const m1 = orderKeys(del, (x) => ex.get(x));
  ok(valid(del, m1) && changed(m1) === 0, `${N} kardeşten İLKİ silindi → 0 yeniden anahtar (eskiden ${N - 1})`);
  const mv = [ids[N - 1], ...ids.slice(0, N - 1)];
  const m2 = orderKeys(mv, (x) => ex.get(x));
  ok(valid(mv, m2) && changed(m2) === 1, "sonuncu başa taşındı → yalnız 1 anahtar");
  const ins = [id(), ...ids];
  const m3 = orderKeys(ins, (x) => ex.get(x));
  ok(valid(ins, m3) && [...m3].filter(([x]) => !ex.has(x)).length === 1 && changed(m3) === 1, "başa yeni öğe → yalnız yeni öğe anahtar alır");
  const rnd = [...ids].sort(() => Math.random() - 0.5).slice(0, 400);
  const m4 = orderKeys(rnd, (x) => ex.get(x));
  ok(valid(rnd, m4), "rastgele karışık sıra → tüm anahtarlar geçerli ve sırayla artan");
  const dup = ["a", "b", "c"];
  const m5 = orderKeys(dup, () => "m");
  ok(valid(dup, m5), "aynı anahtarlı eski kayıtlar (\"m\") → yine geçerli, kesin artan sıra");

  // Gerçek stateToChangeset: 2.600 notlu başlık + 2.600 kutulu not
  const owner = id(), R = id(), H = id(), BIG = id();
  const T0 = "2026-11-01T00:00:00.000Z";
  const node = (nid: string, parentId: string | null, title: string, sortKey: string) => ({ id: nid, ownerId: owner, parentId, title, sortKey, templateKey: null, nodeKind: null, version: 1, scope: "kisisel" as const, createdAt: T0, updatedAt: T0, deletedAt: null, deleteBatchId: null });
  const block = (bid: string, nodeId: string, parentBlockId: string | null, title: string, sortKey: string) => ({ id: bid, ownerId: owner, nodeId, parentBlockId, title, contentJson: doc(title), contentText: title, classification: null, sources: [], sortKey, version: 1, scope: "kisisel" as const, createdAt: T0, updatedAt: T0, contentUpdatedAt: T0, assets: [] });
  const noteIds = Array.from({ length: N }, () => id());
  const boxIds = Array.from({ length: N }, () => id());
  const headIds = Array.from({ length: N }, () => id());
  const ws: Workspace = {
    ownerId: owner,
    nodes: [node(R, null, "Kalabalık", "m"), node(H, R, "Başlık", keys[0]), ...headIds.map((h, i) => node(h, R, `B${i}`, keys[i + 1] ?? `${keys[N - 1]}${i}m`))],
    blocks: [
      block(BIG, H, null, "Çok kutulu", keys[0]),
      ...noteIds.map((n, i) => block(n, H, null, `Not ${i}`, keys[i + 1] ?? `${keys[N - 1]}${i}m`)),
      ...boxIds.map((b, i) => block(b, H, BIG, `Kutu ${i}`, keys[i])),
    ],
    links: [],
  } as unknown as Workspace;
  const { state, meta } = workspaceToState(ws, codec);
  const size = (cs: unknown) => Buffer.byteLength(JSON.stringify(cs));
  const run = (mut: (d: State) => void) => {
    const d = clone(state);
    mut(d);
    return stateToChangeset(state, d, meta, codec, id);
  };
  const c1 = run((d) => { d.notes[H].find((n) => n.id === BIG)!.boxes.splice(0, 1); });
  ok((c1.blocks_delete ?? []).length === 1 && c1.blocks.filter((b) => b.parent_block_id === BIG).length === 0 && size(c1) < 50_000,
    `${N} kutulu notta ilk kutu silindi → 1 kalıcı silme, 0 kardeş yeniden yazımı (istek ${size(c1)} B)`, { del: c1.blocks_delete?.length, boxes: c1.blocks.length });
  const c2 = run((d) => { const a = d.notes[H]; a.splice(1, 1); });
  ok(c2.blocks.length <= 1 && size(c2) < 50_000, `${N + 1} notlu başlıkta bir not kaldırıldı → en fazla 1 satır (gönderilen ${c2.blocks.length})`);
  const c3 = run((d) => { const a = d.notes[H]; a.unshift(a.pop()!); });
  ok(c3.blocks.length === 1, `${N + 1} notlu başlıkta son not başa taşındı → 1 satır`, c3.blocks.length);
  const c4 = run((d) => { const h = d.nodes.filter((x) => x.parentId === R || (x.rootId === R && x.parentId === null && x.id !== R)); void h; const kids = d.nodes.filter((x) => headIds.includes(x.id)); const first = kids.reduce((a, b) => (a.order < b.order ? a : b)); first.order = Math.max(...kids.map((x) => x.order)) + 1; });
  ok(c4.topics.length === 1, `${N + 1} kardeş başlıkta ilk başlık sona taşındı → 1 satır`, c4.topics.length);
  ok([c1, c2, c3, c4].every((c) => c.blocks.length <= CHANGESET_LIMITS.maxBlocks && c.topics.length <= CHANGESET_LIMITS.maxTopics), "hiçbir düzenleme istek başına teknik sınıra yaklaşmadı");
}

// ── B) Gerçek veritabanı ─────────────────────────────────────────────────────────
const PORT = await new Promise<number>((res) => {
  const srv = net.createServer();
  srv.listen(0, "127.0.0.1", () => { const { port } = srv.address() as net.AddressInfo; srv.close(() => res(port)); });
});
const DATA_DIR = path.join(os.tmpdir(), `sifa-f3-sinirsiz-${process.pid}`);
const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: "testpw", port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
await epg.initialise();
await epg.start();
const c = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres" });
await c.connect();
const q = (sql: string, p?: unknown[]) => c.query(sql, p);
const db = pgDb(c);
const MIG = (f: string) => readFileSync(path.resolve("supabase/migrations", f), "utf8");
const A: Scope = { tenantId: "11111111-1111-4111-8111-111111111111", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const topic = (o: Record<string, unknown>): Record<string, unknown> & { id: string } => ({ id: "", parent_id: null, sort_key: "m", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null, ...o });
const blk = (o: Record<string, unknown>) => ({ title: "Not", content_json: doc("x"), content_text: "x", classification: null, sort_key: "m", deleted_at: null, delete_batch_id: null, base_version: null, sources: [], ...o });
async function save(body: Record<string, unknown>) {
  const r = await saveChangeset(db, A, { topics: [], blocks: [], links_add: [], links_remove: [], ...body });
  if (!r.ok) throw new Error(`kayıt reddedildi: ${r.status} ${r.code} ${r.error}`);
}
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));
const key = (i: number) => `${(i + 1).toString(36).padStart(5, "0")}m`;
try {
  section("B) Gerçek veritabanı: kalabalık kütüphane (sentetik)");
  await q("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;");
  for (const f of ["20280110000000_sifa_rehberi_v2_core.sql", "20280124000000_sifa_v2_asset_lifecycle.sql", "20280130000200_sifa_rehberi_f3.sql"]) await q(MIG(f));
  const roots = Array.from({ length: N }, (_, i) => topic({ id: id(), title: `Konu ${i}`, sort_key: key(i) }));
  for (const ch of chunks(roots, 1000)) await save({ topics: ch });
  const H = id();
  await save({ topics: [topic({ id: H, parent_id: roots[0].id, title: "Başlık" })] });
  const notes = Array.from({ length: N }, (_, i) => blk({ id: id(), topic_id: H, title: `Not ${i}`, sort_key: key(i + 1) }));
  for (const ch of chunks(notes, 1000)) await save({ blocks: ch });
  const BIG = id();
  await save({ blocks: [blk({ id: BIG, topic_id: H, title: "Çok kutulu", sort_key: key(0) })] });
  const boxes = Array.from({ length: N }, (_, i) => blk({ id: id(), topic_id: H, parent_block_id: BIG, title: `Kutu ${i}`, sort_key: key(i) }));
  for (const ch of chunks(boxes, 1000)) await save({ blocks: ch });
  const srcNote = id();
  await save({ blocks: [blk({ id: srcNote, topic_id: H, title: "300 kaynaklı", sort_key: key(N + 5), sources: Array.from({ length: 300 }, (_, i) => ({ id: id(), kind: "makale", title: `Kaynak ${i}` })) })] });
  const cnt = (await q(`select (select count(*)::int from public.sifa_topics where owner_key=$1 and parent_id is null) k,
    (select count(*)::int from public.sifa_topic_blocks where owner_key=$1 and parent_block_id is null and topic_id=$2) n,
    (select count(*)::int from public.sifa_topic_blocks where parent_block_id=$3) b,
    (select count(*)::int from public.sifa_block_sources where block_id=$4) s`, [A.userId, H, BIG, srcNote])).rows[0];
  ok(cnt.k === N && cnt.n === N + 2 && cnt.b === N && cnt.s === 300, `yazıldı: ${cnt.k} ana konu, ${cnt.n} notlu başlık, ${cnt.b} kutulu not, ${cnt.s} kaynaklı not (sayı sınırı yok)`, cnt);
  await q(`insert into public.sifa_block_assets(id, tenant_id, owner_key, scope, block_id, origin, bucket, storage_path, mime_type, byte_size)
    select gen_random_uuid(), $1::uuid, $2::uuid, 'kisisel', $3::uuid, 'upload', 'sifa-arastirma', $1::text || '/' || $2::text || '/' || gen_random_uuid() || '.jpg', 'image/jpeg', 10485760 from generate_series(1, 6000)`, [A.tenantId, A.userId, BIG]);
  const big = (await q("select count(*)::int n, sum(byte_size)::bigint b from public.sifa_block_assets where owner_key=$1", [A.userId])).rows[0];
  ok(big.n === 6000 && Number(big.b) > 250 * 1048576, `6.000 görsel / ${Math.round(Number(big.b) / 1073741824)} GB kayıt (sentetik satır) — DB'de kota/sayı kısıtı yok`, big);

  // Model → gerçek SQL: ilk kutuyu sil + son notu başa taşı; yeniden yüklemede sıra
  const l1 = await loadWorkspace(db, A, A.userId);
  if (!l1.ok) throw new Error(l1.error);
  const st = workspaceToState(l1.value, codec);
  const d = clone(st.state);
  const big1 = d.notes[H].find((n) => n.id === BIG)!;
  const firstBox = big1.boxes[0].id;
  big1.boxes.splice(0, 1);
  const lastNote = d.notes[H][d.notes[H].length - 1].id;
  d.notes[H].unshift(d.notes[H].pop()!);
  const cs = stateToChangeset(st.state, d, st.meta, codec, id);
  const r = await saveChangeset(db, A, cs);
  ok(r.ok && (cs.blocks_delete ?? []).length === 1 && cs.blocks.length <= 2, `kalabalık notta kutu silme + kalabalık başlıkta taşıma tek kayıtta (${cs.blocks.length} blok + ${(cs.blocks_delete ?? []).length} silme)`, r.ok ? undefined : r);
  const l2 = await loadWorkspace(db, A, A.userId);
  if (!l2.ok) throw new Error(l2.error);
  const s2 = workspaceToState(l2.value, codec).state;
  ok(!s2.notes[H].find((n) => n.id === BIG)!.boxes.some((b) => b.id === firstBox) && s2.notes[H].find((n) => n.id === BIG)!.boxes.length === N - 1, "yeniden yükleme: kutu kalıcı silindi, diğer kutular yerinde");
  ok(s2.notes[H][0].id === lastNote && s2.notes[H].length === N + 2, "yeniden yükleme: taşınan not başta, toplam not sayısı aynı");

  section("C) Kaynakta kota kalıntısı yok");
  const files = execSync("git ls-files -co --exclude-standard -- lib/sifa-rehberi-v2 lib/sifa-rehberi-f3 components/sifa-rehberi-f3 app/api/sifa-rehberi-v2 app/sifa-rehberi supabase/migrations/20280130000200_sifa_rehberi_f3.sql supabase/migrations/20280130000300_yh_sifa_f3_kutu_yayilimi.sql", { encoding: "utf8" }).split("\n").filter(Boolean);
  const hits = files.filter((f) => /UPLOAD_QUOTA|SIFA_V2_QUOTA|upload_usage|uploadUsage|kotanız|depolama kotası/i.test(readFileSync(f, "utf8")));
  ok(hits.length === 0, `Şifa ürün kodu + F3 migration'larında kota sabiti / kodu / iletisi YOK (${files.length} dosya tarandı)`, hits);
  ok(!("maxSourcesPerBlock" in CHANGESET_LIMITS), "not başına kaynak sayısı sınırı kaldırıldı");
} catch (e) {
  fail++;
  console.log(`  ✗ BEKLENMEYEN: ${(e as Error).stack ?? e}`);
} finally {
  await c.end().catch(() => {});
  await epg.stop().catch(() => {});
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* Windows kilidi */ }
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
