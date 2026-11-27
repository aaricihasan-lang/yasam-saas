/**
 * Şifa Rehberi F3 — GERİ DÖNÜŞTE VERİ KAYBI YOK: gerçek ESKİ kod + F3 şeması + şema geri dönüşü + yeniden ileri alma
 * (yerel GEÇİCİ PostgreSQL; ağ / sır / production YOK).
 *
 * "Eski kod" = F3 ÖNCESİ main'in (PRE_F3) lib/sifa-rehberi-v2 sunucu modülleri; git'ten geçici klasöre AYNEN çıkarılır,
 * yalnız kendi içe aktarmaları o klasöre yönlendirilir. Senaryo (yayin-ve-geri-donus.md §3 seviyeleri):
 *   B) YENİ kodla F3 verisi: grup başlığı, not + içerik kutuları (biri başlıksız), "bağlantı" kaynağı
 *   C) Seviye 1 (önceki dağıtıma dönüş): ESKİ kod F3 şemasıyla okur/kaydeder → hiçbir F3 satırı bozulmaz/silinmez
 *   D) Seviye 3 (şema geri dönüşü): docs/sifa-rehberi-f3/geri-donus-sema.sql → eski kod çalışır, F3 verisi yerinde
 *   E) Yeniden ileri alma (F3 migration tekrar) → YENİ kodun gördüğü kütüphane geri dönüş öncesiyle BİREBİR
 * Çalıştır: npx tsx scripts/sifa-rehberi-f3/geri-donus.pg.mts   (FAIL → exit 1)
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadWorkspace, saveChangeset, type Scope } from "@/lib/sifa-rehberi-v2/server/service";
import { pgDb } from "@/lib/sifa-rehberi-v2/server/dbAdapters";

/** F3 öncesi main (dal tabanı). */
const PRE_F3 = "ee5c25aa5f7b2b3a47b288ef2f531e322a960376";
const ROOT = process.cwd();

let pass = 0;
let fail = 0;
const ok = (c: unknown, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${!c && extra !== undefined ? ` — ${JSON.stringify(extra).slice(0, 500)}` : ""}`);
};
const section = (s: string) => console.log(`\n${s}`);

// ── Eski kodu çıkar ─────────────────────────────────────────────────────────────
const OLD = path.join(os.tmpdir(), `sifa-f3-eski-kod-${process.pid}`);
rmSync(OLD, { recursive: true, force: true });
const files = execSync(`git ls-tree -r --name-only ${PRE_F3} -- lib/sifa-rehberi-v2`, { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f.endsWith(".ts"));
const OLD_ROOT = path.join(OLD, "lib", "sifa-rehberi-v2");
for (const f of files) {
  let src = execSync(`git show ${PRE_F3}:${f}`, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  // Kendi modülleri → eski kopya; diğer "@/" içe aktarmaları → depodaki (değişmeyen) modüller.
  src = src.replace(/from "@\/lib\/sifa-rehberi-v2\/([^"]+)"/g, (_m, rel) => `from "${pathToFileURL(path.join(OLD_ROOT, rel)).href}.ts"`);
  src = src.replace(/from "@\/([^"]+)"/g, (_m, rel) => `from "${pathToFileURL(path.join(ROOT, rel)).href}"`);
  const out = path.join(OLD, f);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, src);
}
const oldService = await import(pathToFileURL(path.join(OLD_ROOT, "server", "service.ts")).href);
const oldAdapters = await import(pathToFileURL(path.join(OLD_ROOT, "server", "dbAdapters.ts")).href);

// ── Veritabanı ──────────────────────────────────────────────────────────────────
const PORT = await new Promise<number>((res) => {
  const srv = net.createServer();
  srv.listen(0, "127.0.0.1", () => { const { port } = srv.address() as net.AddressInfo; srv.close(() => res(port)); });
});
const DATA_DIR = path.join(os.tmpdir(), `sifa-f3-geri-${process.pid}`);
const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: "testpw", port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
await epg.initialise();
await epg.start();
const c = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres" });
await c.connect();
const q = (sql: string, p?: unknown[]) => c.query(sql, p);
const newDb = pgDb(c);
const oldDb = oldAdapters.pgDb(c);
const MIG = (f: string) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
const ROLLBACK = readFileSync(path.join(ROOT, "docs/sifa-rehberi-f3/geri-donus-sema.sql"), "utf8");

const T = "11111111-1111-4111-8111-111111111111";
const A: Scope = { tenantId: T, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const id = () => crypto.randomUUID();
const doc = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const topic = (o: Record<string, unknown>) => ({ parent_id: null, sort_key: "m", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null, ...o });
const blk = (o: Record<string, unknown> & { text: string }) => {
  const { text, ...rest } = o;
  return { title: "Not", content_json: doc(text), content_text: text, classification: null, sort_key: "m", deleted_at: null, delete_batch_id: null, base_version: null, sources: [], ...rest };
};
const row = async (table: string, rid: string) => (await q(`select * from public.${table} where id = $1`, [rid])).rows[0];
/** Tüm Şifa satırlarının TÜM sütunları (satır başına md5). */
async function snapshot(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const t of ["sifa_topics", "sifa_topic_blocks", "sifa_block_sources", "sifa_block_assets", "sifa_topic_links"]) {
    for (const r of (await q(`select id::text id, md5(row_to_json(x)::text) h from public.${t} x`)).rows) m.set(`${t}:${r.id}`, r.h);
  }
  return m;
}
const diffKeys = (a: Map<string, string>, b: Map<string, string>) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
/** YENİ kodun gördüğü kütüphane (yapı + içerik; sürüm/zaman hariç). */
async function newView() {
  const r = await loadWorkspace(newDb, A, A.userId);
  if (!r.ok) throw new Error(r.error);
  const ws = r.value;
  return JSON.stringify({
    nodes: ws.nodes.map((n) => [n.id, n.parentId, n.title, n.templateKey ?? null, n.nodeKind ?? null, !!n.deletedAt]).sort(),
    blocks: ws.blocks.map((b) => [b.id, b.nodeId, b.parentBlockId ?? null, b.title, b.contentText, JSON.stringify(b.sources.map((s) => [s.kind, s.title, s.url ?? null, s.doi ?? null])), !!b.deletedAt]).sort(),
  });
}

const ROOT_T = id(), GRP = id(), H = id(), N = id(), K1 = id(), K2 = id(), N2 = id();
try {
  section("A) Kurulum: çekirdek + görsel yaşam döngüsü + F3 (+ eski kod git'ten: " + PRE_F3.slice(0, 8) + ")");
  await q("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;");
  for (const f of ["20280110000000_sifa_rehberi_v2_core.sql", "20280124000000_sifa_v2_asset_lifecycle.sql", "20280130000200_sifa_rehberi_f3.sql"]) await q(MIG(f));
  ok(files.length >= 5 && typeof oldService.saveChangeset === "function" && oldService.saveChangeset !== saveChangeset, `eski sunucu kodu yüklendi (${files.length} modül; yeni koddan AYRI)`);

  section("B) YENİ kodla F3 verisi");
  const r1 = await saveChangeset(newDb, A, {
    topics: [topic({ id: ROOT_T, title: "Migren" }), topic({ id: GRP, parent_id: ROOT_T, title: "Grubum", node_kind: "grup", sort_key: "a" }), topic({ id: H, parent_id: GRP, title: "Alt başlık", sort_key: "a" })],
    blocks: [
      blk({ id: N, topic_id: H, title: "Ana not", text: "ana not metni", sort_key: "a", sources: [{ id: id(), kind: "baglanti", title: "Site", url: "https://example.org/a" }, { id: id(), kind: "makale", title: "Makale", doi: "10.1234/x.1" }] }),
      blk({ id: K1, topic_id: H, parent_block_id: N, title: "", text: "başlıksız kutu", sort_key: "a" }),
      blk({ id: K2, topic_id: H, parent_block_id: N, title: "Kutu 2", text: "ikinci kutu", sort_key: "b" }),
      blk({ id: N2, topic_id: H, title: "Basit not", text: "basit", sort_key: "b" }),
    ],
    links_add: [], links_remove: [],
  });
  ok(r1.ok, "F3 verisi yazıldı (grup başlığı, not + 2 kutu, başlıksız kutu, bağlantı kaynağı)", r1);
  const S0 = await snapshot();
  const V0 = await newView();

  section("C) Seviye 1 — önceki dağıtım (ESKİ kod) F3 şemasıyla");
  const ol = await oldService.loadWorkspace(oldDb, A, A.userId);
  ok(ol.ok && ol.value.blocks.length === 4 && ol.value.nodes.some((n: { id: string }) => n.id === GRP), "eski kod okur: 4 blok (not + kutular + basit not), grup başlığı görünür", ol.ok ? ol.value.blocks.length : ol);
  ok(diffKeys(S0, await snapshot()).length === 0, "okuma hiçbir satırı değiştirmedi");
  // Basit notu düzenle (eski istemci biçimi: parent_block_id / node_kind anahtarı YOK)
  const n2 = await row("sifa_topic_blocks", N2);
  const e1 = await oldService.saveChangeset(oldDb, A, { topics: [], blocks: [blk({ id: N2, topic_id: H, title: "Basit not", text: "basit DÜZENLENDİ", sort_key: "b", base_version: n2.version })], links_add: [], links_remove: [] });
  const d1 = diffKeys(S0, await snapshot());
  ok(e1.ok && d1.length === 1 && d1[0] === `sifa_topic_blocks:${N2}`, "eski kodla basit not düzenlendi → YALNIZ o satır değişti", { ok: e1.ok, d1 });
  // Kutuyu düzenle (eski istemci kutuyu ayrı not sanır; parent anahtarı göndermez)
  const k2 = await row("sifa_topic_blocks", K2);
  const e2 = await oldService.saveChangeset(oldDb, A, { topics: [], blocks: [blk({ id: K2, topic_id: H, title: "Kutu 2", text: "ikinci kutu ESKİ KOD", sort_key: "b", base_version: k2.version })], links_add: [], links_remove: [] });
  const k2b = await row("sifa_topic_blocks", K2);
  ok(e2.ok && k2b.parent_block_id === N && k2b.content_text === "ikinci kutu ESKİ KOD", "eski kodla kutu düzenlendi → kutu, notunun kutusu olarak KALDI (parent korunur)", { ok: e2.ok, parent: k2b.parent_block_id });
  // Bağlantı kaynaklı not ve başlıksız kutu: eski doğrulayıcı tanımıyorsa kayıt REDDEDİLİR → veri değişmez
  const S1 = await snapshot();
  const nr = await row("sifa_topic_blocks", N);
  const srcs = (await q("select id, kind, title, url, doi from public.sifa_block_sources where block_id = $1 order by position", [N])).rows.map((s) => ({ id: s.id, kind: s.kind, title: s.title, ...(s.url ? { url: s.url } : {}), ...(s.doi ? { doi: s.doi } : {}) }));
  const e3 = await oldService.saveChangeset(oldDb, A, { topics: [], blocks: [blk({ id: N, topic_id: H, title: "Ana not", text: "ana not ESKİ KOD", sort_key: "a", base_version: nr.version, sources: srcs })], links_add: [], links_remove: [] });
  const d3 = diffKeys(S1, await snapshot());
  ok((e3.ok && (await q("select count(*)::int n from public.sifa_block_sources where block_id = $1 and kind = 'baglanti'", [N])).rows[0].n === 1) || (!e3.ok && d3.length === 0),
    `bağlantı kaynaklı not (eski kod): ${e3.ok ? "kaydedildi, bağlantı kaynağı KORUNDU" : `reddedildi (${e3.status}) → hiçbir satır değişmedi`}`, { ok: e3.ok, d3 });
  const k1 = await row("sifa_topic_blocks", K1);
  const S2 = await snapshot();
  const e4 = await oldService.saveChangeset(oldDb, A, { topics: [], blocks: [blk({ id: K1, topic_id: H, title: "", text: "başlıksız kutu ESKİ", sort_key: "a", base_version: k1.version })], links_add: [], links_remove: [] });
  ok((e4.ok && (await row("sifa_topic_blocks", K1)).parent_block_id === N) || (!e4.ok && diffKeys(S2, await snapshot()).length === 0),
    `başlıksız kutu (eski kod): ${e4.ok ? "kaydedildi, kutu olarak kaldı" : `reddedildi (${e4.status}) → hiçbir satır değişmedi`}`);
  // Eski kodla notu çöpe at → kutular silinmez (F3'te not ile birlikte Silinenler'de), geri alınca döner
  const nr2 = await row("sifa_topic_blocks", N);
  const e5 = await oldService.saveChangeset(oldDb, A, { topics: [], blocks: [{ ...blk({ id: N, topic_id: H, title: "Ana not", text: nr2.content_text, sort_key: "a", sources: srcs }), content_json: nr2.content_json, base_version: nr2.version, deleted_at: new Date().toISOString(), delete_batch_id: id() }], links_add: [], links_remove: [] });
  const kids = (await q("select count(*)::int n from public.sifa_topic_blocks where parent_block_id = $1 and deleted_at is null", [N])).rows[0].n;
  ok(!e5.ok || kids === 2, `eski kodla not çöpe: ${e5.ok ? "kutular satır olarak yerinde (silinmedi)" : `reddedildi (${e5.status})`}`, { ok: e5.ok, kids });
  if (e5.ok) {
    const nr3 = await row("sifa_topic_blocks", N);
    const back = await saveChangeset(newDb, A, { topics: [], blocks: [{ ...blk({ id: N, topic_id: H, title: "Ana not", text: nr3.content_text, sort_key: "a", sources: srcs }), content_json: nr3.content_json, base_version: nr3.version }], links_add: [], links_remove: [] });
    const v = await newView();
    ok(back.ok && JSON.parse(v).blocks.filter((b: unknown[]) => b[2] === N && b[6] === false).length === 2, "yeni kodla not geri alındı → iki kutusu da yerinde");
  }
  // Bağlantı kaynağı OLMAYAN kutulu not: eski kodla çöpe → kutular satır olarak kalır; yeni kodla geri alınınca döner
  const N3 = id(), K3 = id();
  await saveChangeset(newDb, A, { topics: [], blocks: [blk({ id: N3, topic_id: H, title: "Üçüncü not", text: "üç", sort_key: "c" }), blk({ id: K3, topic_id: H, parent_block_id: N3, title: "Kutu 3", text: "üçüncü kutu", sort_key: "a" })], links_add: [], links_remove: [] });
  S0.set(`sifa_topic_blocks:${N3}`, "eklendi");
  S0.set(`sifa_topic_blocks:${K3}`, "eklendi");
  const n3 = await row("sifa_topic_blocks", N3);
  const e7 = await oldService.saveChangeset(oldDb, A, { topics: [], blocks: [{ ...blk({ id: N3, topic_id: H, title: "Üçüncü not", text: "üç", sort_key: "c" }), base_version: n3.version, deleted_at: new Date().toISOString(), delete_batch_id: id() }], links_add: [], links_remove: [] });
  const k3 = await row("sifa_topic_blocks", K3);
  ok(e7.ok && (await row("sifa_topic_blocks", N3)).deleted_at !== null && k3 && k3.parent_block_id === N3, "eski kodla kutulu not çöpe → kutu satırı SİLİNMEDİ, bağı yerinde", { ok: e7.ok });
  const v3 = JSON.parse(await newView());
  ok(v3.blocks.some((x: unknown[]) => x[0] === N3 && x[6] === true) && v3.blocks.some((x: unknown[]) => x[0] === K3 && x[2] === N3), "yeni kod: not Silinenler'de, kutusu notuna bağlı (birlikte geri gelir)");
  const n3b = await row("sifa_topic_blocks", N3);
  const back3 = await saveChangeset(newDb, A, { topics: [], blocks: [{ ...blk({ id: N3, topic_id: H, title: "Üçüncü not", text: "üç", sort_key: "c" }), base_version: n3b.version }], links_add: [], links_remove: [] });
  ok(back3.ok && (await row("sifa_topic_blocks", N3)).deleted_at === null && (await row("sifa_topic_blocks", K3)).deleted_at === null, "yeni kodla geri alındı → not ve kutusu canlı");
  // F3-R2: eski ekranın SIRALAMA ve TAŞIMA davranışı (önceden yalnız değerlendirmeydi → artık ölçülüyor)
  const k1s = await row("sifa_topic_blocks", K1), k2s = await row("sifa_topic_blocks", K2);
  const e8 = await oldService.saveChangeset(oldDb, A, { topics: [], blocks: [blk({ id: K2, topic_id: H, title: "Kutu 2", text: k2s.content_text, sort_key: "0i", base_version: k2s.version })], links_add: [], links_remove: [] });
  const vOrd = JSON.parse(await newView());
  const k2after = await row("sifa_topic_blocks", K2);
  const order = (await q("select id::text from public.sifa_topic_blocks where parent_block_id = $1 and deleted_at is null order by sort_key, id", [N])).rows.map((r) => r.id);
  ok(e8.ok && k2after.parent_block_id === N && k2after.content_text === k2s.content_text && order.indexOf(K2) < order.indexOf(K1) && vOrd.blocks.some((x: unknown[]) => x[0] === K2 && x[2] === N),
    "eski ekranda kutunun SIRASI değiştirilirse: kutu notunda kalır, içerik aynı; yalnız not içindeki sırası değişir (ölçüldü)", { ok: e8.ok, order: order.map((x) => (x === K1 ? "K1" : x === K2 ? "K2" : "?")) });
  void k1s;
  const H2 = id();
  await saveChangeset(newDb, A, { topics: [topic({ id: H2, parent_id: GRP, title: "Başka başlık", sort_key: "z" })], blocks: [], links_add: [], links_remove: [] });
  S0.set(`sifa_topics:${H2}`, "eklendi");
  const k2m = await row("sifa_topic_blocks", K2);
  const Sm = await snapshot();
  const e9 = await oldService.saveChangeset(oldDb, A, { topics: [], blocks: [blk({ id: K2, topic_id: H2, title: "Kutu 2", text: k2m.content_text, sort_key: k2m.sort_key, base_version: k2m.version })], links_add: [], links_remove: [] });
  ok(!e9.ok && diffKeys(Sm, await snapshot()).length === 0, `eski ekranda kutu BAŞKA başlığa taşınmak istenirse: veritabanı reddeder (${e9.ok ? "kabul" : e9.status}) → hiçbir satır değişmez (yanlış yazım yok)`, { ok: e9.ok });
  const S3 = await snapshot();
  const lost = [...S0.keys()].filter((k) => !S3.has(k));
  ok(lost.length === 0, "seviye 1 sonunda HİÇBİR F3 satırı silinmedi", lost);
  const grp = await row("sifa_topics", GRP);
  ok(grp.node_kind === "grup", "grup başlığı türü korundu");

  section("D) Seviye 3 — şema geri dönüşü (geri-donus-sema.sql)");
  const preRb = await snapshot();
  await q(ROLLBACK);
  const postRb = await snapshot();
  ok(diffKeys(preRb, postRb).length === 0, "şema geri dönüşü HİÇBİR satırı değiştirmedi/silmedi (sütunlar + veri kalır)", diffKeys(preRb, postRb).slice(0, 5));
  const cols = (await q("select column_name from information_schema.columns where table_name = 'sifa_topic_blocks' and column_name in ('parent_block_id','content_updated_at') union all select column_name from information_schema.columns where table_name = 'sifa_topics' and column_name = 'node_kind'")).rows.length;
  ok(cols === 3, "F3 sütunları (node_kind, parent_block_id, content_updated_at) yerinde");
  const ol2 = await oldService.loadWorkspace(oldDb, A, A.userId);
  ok(ol2.ok && ol2.value.blocks.length === 6, "geri dönüş sonrası eski kod okur (6 blok)", ol2.ok ? ol2.value.blocks.length : ol2);
  const n2b = await row("sifa_topic_blocks", N2);
  const e6 = await oldService.saveChangeset(oldDb, A, { topics: [], blocks: [blk({ id: N2, topic_id: H, title: "Basit not", text: "geri dönüşte yazıldı", sort_key: "b", base_version: n2b.version })], links_add: [], links_remove: [] });
  const k2c = await row("sifa_topic_blocks", K2);
  ok(e6.ok && (await row("sifa_topic_blocks", N2)).content_text === "geri dönüşte yazıldı" && k2c.parent_block_id === N, "geri dönüş sonrası eski kod yazar; kutu bağları bozulmaz", e6.ok ? undefined : e6);
  const VRB = await newViewOldSafe();

  section("E) Yeniden ileri alma — F3 migration tekrar");
  await q(MIG("20280130000200_sifa_rehberi_f3.sql"));
  const V2 = await newView();
  ok(V2 === VRB, "yeniden ileri alma sonrası yeni kodun gördüğü kütüphane, geri dönüşten önceki hâliyle BİREBİR (veri kaybı yok)");
  const struct = JSON.parse(V2);
  ok(struct.blocks.filter((b: unknown[]) => b[2] === N).length === 2 && struct.nodes.some((n: unknown[]) => n[0] === GRP && n[4] === "grup") && struct.blocks.some((b: unknown[]) => b[0] === K1 && b[3] === ""),
    "kutular, grup başlığı ve başlıksız kutu F3 ekranında aynen");
  ok(JSON.parse(V0).blocks.length + 2 === struct.blocks.length && JSON.parse(V0).nodes.length + 1 === struct.nodes.length, "tüm süreç boyunca hiçbir satır kaybolmadı (başlangıç + bu testte eklenen 2 blok ve 1 başlık)");
  const r9 = await saveChangeset(newDb, A, { topics: [], blocks: [blk({ id: id(), topic_id: H, parent_block_id: N, title: "Yeni kutu", text: "ileri alma sonrası" })], links_add: [], links_remove: [] });
  ok(r9.ok, "ileri alma sonrası yeni kod yeni kutu yazar");

  /** Geri dönüş anındaki durumun YENİ koddan bağımsız özeti (şema geri dönükken yeni load çağrılmaz). */
  async function newViewOldSafe() {
    const nodes = (await q("select id::text, parent_id::text, title, template_key, node_kind, deleted_at is not null d from public.sifa_topics where owner_key = $1", [A.userId])).rows
      .map((n) => [n.id, n.parent_id, n.title, n.template_key ?? null, n.node_kind ?? null, n.d]).sort();
    const blocks = [];
    for (const b of (await q("select id::text, topic_id::text, parent_block_id::text, title, content_text, deleted_at is not null d from public.sifa_topic_blocks where owner_key = $1", [A.userId])).rows) {
      const s = (await q("select kind, title, url, doi from public.sifa_block_sources where block_id = $1 order by position", [b.id])).rows.map((x) => [x.kind, x.title, x.url ?? null, x.doi ?? null]);
      blocks.push([b.id, b.topic_id, b.parent_block_id ?? null, b.title, b.content_text, JSON.stringify(s), b.d]);
    }
    return JSON.stringify({ nodes, blocks: blocks.sort() });
  }
} catch (e) {
  fail++;
  console.log(`  ✗ BEKLENMEYEN: ${(e as Error).stack ?? e}`);
} finally {
  await c.end().catch(() => {});
  await epg.stop().catch(() => {});
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* Windows kilidi */ }
  try { rmSync(OLD, { recursive: true, force: true }); } catch { /* geçici */ }
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
