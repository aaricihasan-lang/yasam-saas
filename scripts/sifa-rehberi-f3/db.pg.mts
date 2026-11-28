/**
 * Şifa Rehberi F3 — VERİTABANI testi (yerel GEÇİCİ PostgreSQL; production / ağ YOK).
 *
 * Çalıştır: npx tsx scripts/sifa-rehberi-f3/db.pg.mts
 *
 * Sınar (gerçek migration dosyaları + gerçek sunucu servisi lib/sifa-rehberi-v2/server/service.ts):
 *  A) Kurulum sırası: çekirdek (20280110000000) → yaşam döngüsü (20280124000000) → F3 (20280130000200);
 *     F3 ÖNCESİ yazılmış kayıtlar F3 SONRASI bayt bayt aynı (eski sütunlar); F3 iki kez uygulanabilir.
 *  B) Geriye uyum: eski (V2) değişiklik kümesi aynen çalışır; yeni alanlar eski güncellemede korunur.
 *  C) Kişisel okuma (kurum kayıtları gelmez) + yeni alanlar.
 *  D) Hazır başlık: bu konuda ad değişimi + tek başına çöp SERBEST; anahtar/yer kilitli.
 *  E) Grup başlığı türü.  F) Not ↔ içerik kutusu yapısı.  G) 'baglanti' türü.
 *  H) Çöp zamanı sunucuda.  I) İçerik tarihi kuralları.  J) Kalıcı kutu silme.  K) Galeri görselleri.
 *  L) Yaşam döngüsü (galeri korunur).  M) Yetkiler.  N) Kota kullanımı.  O) Çakışma.  P) İzolasyon.
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { loadWorkspace, registerUpload, saveChangeset, type Scope } from "@/lib/sifa-rehberi-v2/server/service";
import { pgDb } from "@/lib/sifa-rehberi-v2/server/dbAdapters";

let pass = 0;
let fail = 0;
async function test(name: string, fn: () => Promise<string | void>) {
  try {
    const d = await fn();
    pass++;
    console.log(`  ✓ ${name}${d ? ` — ${d}` : ""}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n      ${(e as Error).message.split("\n")[0]}`);
  }
}
const section = (n: string) => console.log(`\n${n}`);
function assert(c: unknown, msg: string): asserts c {
  if (!c) throw new Error(msg);
}

const PORT = await new Promise<number>((res) => {
  const srv = net.createServer();
  srv.listen(0, "127.0.0.1", () => {
    const { port } = srv.address() as net.AddressInfo;
    srv.close(() => res(port));
  });
});
const DATA_DIR = path.join(os.tmpdir(), `sifa-f3-db-${process.pid}`);
const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: "testpw", port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
await epg.initialise();
await epg.start();
const c = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: "testpw", database: "postgres" });
await c.connect();
const q = (sql: string, p?: unknown[]) => c.query(sql, p);
const db = pgDb(c);
const MIG = (f: string) => readFileSync(path.resolve("supabase/migrations", f), "utf8");
const CORE = MIG("20280110000000_sifa_rehberi_v2_core.sql");
const LC = MIG("20280124000000_sifa_v2_asset_lifecycle.sql");
const F3 = MIG("20280130000200_sifa_rehberi_f3.sql");

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const A: Scope = { tenantId: T1, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const B: Scope = { tenantId: T1, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const C: Scope = { tenantId: T2, userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
const id = () => crypto.randomUUID();
const para = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }] });

type Res = Awaited<ReturnType<typeof saveChangeset>>;
async function save(s: Scope, body: unknown): Promise<Res> {
  return saveChangeset(db, s, body);
}
async function mustSave(s: Scope, body: unknown) {
  const r = await save(s, body);
  assert(r.ok, `kayıt reddedildi: ${!r.ok ? `${r.status} ${r.code} ${r.error}` : ""}`);
  return r.value;
}
async function load(s: Scope) {
  const r = await loadWorkspace(db, s, s.userId);
  assert(r.ok, `yükleme: ${!r.ok ? r.error : ""}`);
  return r.value;
}
const row = async (table: string, rid: string) => (await q(`select * from public.${table} where id = $1`, [rid])).rows[0];
const topic = (o: Record<string, unknown>) => ({ parent_id: null, sort_key: "m", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null, ...o });
const block = (o: Record<string, unknown>) => ({ title: "Not", content_json: para("metin"), content_text: "metin", classification: null, sort_key: "m", deleted_at: null, delete_batch_id: null, base_version: null, sources: [], ...o });
/** Eski sütunların sağlama toplamı (F3 öncesi kayıtların değişmediğini kanıtlar). */
async function oldColumnsChecksum(): Promise<string> {
  const parts = [
    "select md5(coalesce(string_agg(concat_ws('|',id,tenant_id,owner_key,scope,parent_id,title,sort_key,template_key,version,created_at,updated_at,deleted_at,delete_batch_id), ';' order by id),'')) h from public.sifa_topics",
    "select md5(coalesce(string_agg(concat_ws('|',id,tenant_id,owner_key,scope,topic_id,title,content_json::text,content_text,classification,sort_key,version,created_at,updated_at,deleted_at,delete_batch_id), ';' order by id),'')) h from public.sifa_topic_blocks",
    "select md5(coalesce(string_agg(concat_ws('|',id,block_id,kind,title,authors,year,doi,url,position), ';' order by id),'')) h from public.sifa_block_sources",
    "select md5(coalesce(string_agg(concat_ws('|',id,from_topic_id,to_topic_id,created_at), ';' order by id),'')) h from public.sifa_topic_links",
    "select md5(coalesce(string_agg(concat_ws('|',id,block_id,origin,bucket,storage_path,caption,created_at), ';' order by id),'')) h from public.sifa_block_assets",
  ];
  const out: string[] = [];
  for (const s of parts) out.push(String((await q(s)).rows[0].h));
  return out.join("/");
}

// Ortak kimlikler
const ROOT_A = id(), TPL_GRP = id(), TPL_KONU = id(), OWN_H = id(), NOTE_A = id(), NOTE_A2 = id(), SRC_A = id();
const ROOT_B = id(), NOTE_B = id();
const ASSET_A = id(), ASSET_A2 = id(), ASSET_B = id();
const KURUM_ROOT = id();

try {
  section("A) Kurulum ve mevcut kayıtların korunması");
  await q("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;");
  await test("çekirdek + yaşam döngüsü migration'ları kuruldu", async () => {
    await q(CORE);
    await q(LC);
  });
  await test("F3 ÖNCESİ (eski V2 biçimiyle) kişisel + kurum + başka uzman kayıtları yazıldı", async () => {
    await mustSave(A, {
      topics: [
        topic({ id: ROOT_A, title: "Migren" }),
        topic({ id: TPL_GRP, parent_id: ROOT_A, title: "Belirtiler / Sebepler", template_key: "grup:belirtiler", sort_key: "a" }),
        topic({ id: TPL_KONU, parent_id: TPL_GRP, title: "Tıbbi Nedenler", template_key: "konu:tibbi", sort_key: "a" }),
        topic({ id: OWN_H, parent_id: ROOT_A, title: "Kendi başlığım", sort_key: "b" }),
      ],
      blocks: [
        block({ id: NOTE_A, topic_id: TPL_KONU, title: "Eski not", sources: [{ id: SRC_A, kind: "makale", title: "Makale", doi: "10.1234/abc.1" }] }),
        block({ id: NOTE_A2, topic_id: TPL_GRP, title: "Grup başlığına eski not", sort_key: "b" }),
      ],
      links_add: [],
      links_remove: [],
    });
    await mustSave(B, { topics: [topic({ id: ROOT_B, title: "Migren" })], blocks: [block({ id: NOTE_B, topic_id: ROOT_B, title: "B notu" })], links_add: [], links_remove: [] });
    for (const [s, aid, n] of [[A, ASSET_A, 1], [A, ASSET_A2, 2], [B, ASSET_B, 3]] as const) {
      const r = await registerUpload(db, s, { id: aid, storage_path: `${s.tenantId}/${s.userId}/${aid}.png`, mime_type: "image/png", byte_size: 1000 * n });
      assert(r.ok, "yükleme kaydı");
    }
    // Eski istemci görseli içerik referansıyla bağlar
    const ws = await load(A);
    const n = ws.blocks.find((b) => b.id === NOTE_A)!;
    await mustSave(A, {
      topics: [],
      blocks: [block({ id: NOTE_A, topic_id: TPL_KONU, title: "Eski not", base_version: n.version, content_json: { type: "doc", content: [{ type: "figure", attrs: { src: `sifa-asset:${ASSET_A}`, caption: "eski" } }] }, sources: [{ id: SRC_A, kind: "makale", title: "Makale", doi: "10.1234/abc.1" }] })],
      links_add: [],
      links_remove: [],
      asset_links: [{ asset_id: ASSET_A, block_id: NOTE_A }],
    });
    // Kurum kaydı (V1 aktarım yolu — artık kullanılmıyor ama mevcut satırların okunmadığını kanıtlamak için)
    await q("select public.sifa_v2_import_legacy($1::uuid, $2::jsonb, '[]'::jsonb)", [T1, JSON.stringify({ topics: [topic({ id: KURUM_ROOT, title: "Kurum kaydı" })], blocks: [] })]);
  });
  let before = "";
  await test("F3 migration uygulandı; eski sütunlar BAYT BAYT aynı (hiçbir satır değişmedi)", async () => {
    before = await oldColumnsChecksum();
    const counts = async () => (await q("select (select count(*) from public.sifa_topics) t,(select count(*) from public.sifa_topic_blocks) b,(select count(*) from public.sifa_block_sources) s,(select count(*) from public.sifa_block_assets) a")).rows[0];
    const c0 = JSON.stringify(await counts());
    await q(F3);
    assert((await oldColumnsChecksum()) === before, "eski sütunlar değişti");
    assert(JSON.stringify(await counts()) === c0, "satır sayısı değişti");
    const nb = await q("select count(*)::int n from public.sifa_topic_blocks where parent_block_id is not null or content_updated_at is not null");
    assert(nb.rows[0].n === 0, "yeni sütunlar boş başlamalı");
    return c0;
  });
  await test("F3 ikinci kez uygulanabilir (yeniden çalıştırmada hata/veri değişimi yok)", async () => {
    await q(F3);
    assert((await oldColumnsChecksum()) === before, "ikinci uygulama veriyi değiştirdi");
  });

  section("B) Geriye uyum (eski istemci biçimi)");
  await test("eski biçimli güncelleme (yeni anahtar yok) çalışır; node_kind ve parent_block_id korunur", async () => {
    const ws = await load(A);
    const h = ws.nodes.find((x) => x.id === OWN_H)!;
    await mustSave(A, { topics: [topic({ id: OWN_H, parent_id: ROOT_A, title: "Kendi başlığım", sort_key: "b", base_version: h.version, node_kind: "grup" })], blocks: [], links_add: [], links_remove: [] });
    const h2 = (await load(A)).nodes.find((x) => x.id === OWN_H)!;
    await mustSave(A, { topics: [topic({ id: OWN_H, parent_id: ROOT_A, title: "Kendi başlığım (ad)", sort_key: "b", base_version: h2.version })], blocks: [], links_add: [], links_remove: [] });
    const r = await row("sifa_topics", OWN_H);
    assert(r.node_kind === "grup" && r.title === "Kendi başlığım (ad)", JSON.stringify(r));
    await mustSave(A, { topics: [topic({ id: OWN_H, parent_id: ROOT_A, title: "Kendi başlığım", sort_key: "b", base_version: r.version, node_kind: null })], blocks: [], links_add: [], links_remove: [] });
  });

  section("C) Okuma yalnız kişisel");
  await test("A'nın okumasında kurum kaydı ve B'nin kaydı YOK; yeni alanlar var", async () => {
    const ws = await load(A);
    assert(!ws.nodes.some((n) => n.id === KURUM_ROOT), "kurum kaydı okunmamalı");
    assert(!ws.nodes.some((n) => n.id === ROOT_B) && !ws.blocks.some((b) => b.id === NOTE_B), "B'nin kaydı sızdı");
    const n = ws.blocks.find((b) => b.id === NOTE_A)!;
    assert(n.parentBlockId === null && Array.isArray(n.assets) && n.assets.length === 1 && n.assets[0].id === ASSET_A, JSON.stringify(n.assets));
    assert("contentUpdatedAt" in n && ws.nodes.every((x) => x.nodeKind === null || x.nodeKind === "grup"), "alanlar");
  });

  section("D) Hazır başlık (bu konuya özel)");
  await test("hazır başlığın adı bu konuda değişir", async () => {
    const t = await row("sifa_topics", TPL_KONU);
    await mustSave(A, { topics: [topic({ id: TPL_KONU, parent_id: TPL_GRP, title: "Tıbbi Nedenlerim", template_key: "konu:tibbi", sort_key: "a", base_version: t.version })], blocks: [], links_add: [], links_remove: [] });
    assert((await row("sifa_topics", TPL_KONU)).title === "Tıbbi Nedenlerim", "ad");
  });
  await test("hazır başlık TEK BAŞINA çöpe atılır ve geri gelir", async () => {
    const t = await row("sifa_topics", TPL_KONU);
    const bt = id();
    await mustSave(A, { topics: [topic({ id: TPL_KONU, parent_id: TPL_GRP, title: t.title, template_key: "konu:tibbi", sort_key: "a", base_version: t.version, deleted_at: new Date().toISOString(), delete_batch_id: bt })], blocks: [], links_add: [], links_remove: [] });
    const t2 = await row("sifa_topics", TPL_KONU);
    assert(t2.deleted_at && (await row("sifa_topics", TPL_GRP)).deleted_at === null, "yalnız alt başlık");
    await mustSave(A, { topics: [topic({ id: TPL_KONU, parent_id: TPL_GRP, title: t.title, template_key: "konu:tibbi", sort_key: "a", base_version: t2.version })], blocks: [], links_add: [], links_remove: [] });
    assert((await row("sifa_topics", TPL_KONU)).deleted_at === null, "geri gelmedi");
  });
  await test("hazır başlığın anahtarı / yeri değiştirilemez; kullanıcı başlığına anahtar verilemez (422)", async () => {
    const t = await row("sifa_topics", TPL_KONU);
    const r1 = await save(A, { topics: [topic({ id: TPL_KONU, parent_id: ROOT_A, title: t.title, template_key: "konu:tibbi", sort_key: "a", base_version: t.version })], blocks: [], links_add: [], links_remove: [] });
    const r2 = await save(A, { topics: [topic({ id: TPL_KONU, parent_id: TPL_GRP, title: t.title, template_key: "konu:diyet", sort_key: "a", base_version: t.version })], blocks: [], links_add: [], links_remove: [] });
    const o = await row("sifa_topics", OWN_H);
    const r3 = await save(A, { topics: [topic({ id: OWN_H, parent_id: ROOT_A, title: o.title, template_key: "konu:diyet", sort_key: "b", base_version: o.version })], blocks: [], links_add: [], links_remove: [] });
    assert(!r1.ok && r1.status === 422 && !r2.ok && r2.status === 422 && !r3.ok && r3.status === 422, JSON.stringify([r1, r2, r3].map((r) => (!r.ok ? r.code : "ok"))));
  });

  section("E) Grup başlığı türü");
  await test("kullanıcı başlığı 'grup' olur; hazır başlığa ve köke grup türü verilemez", async () => {
    const t = await row("sifa_topics", TPL_KONU);
    const r1 = await save(A, { topics: [topic({ id: TPL_KONU, parent_id: TPL_GRP, title: t.title, template_key: "konu:tibbi", sort_key: "a", base_version: t.version, node_kind: "grup" })], blocks: [], links_add: [], links_remove: [] });
    const rt = await row("sifa_topics", ROOT_A);
    const r2 = await save(A, { topics: [topic({ id: ROOT_A, title: "Migren", base_version: rt.version, node_kind: "grup" })], blocks: [], links_add: [], links_remove: [] });
    const r3 = await save(A, { topics: [topic({ id: id(), parent_id: ROOT_A, title: "Yeni grup", sort_key: "c", node_kind: "grup" })], blocks: [], links_add: [], links_remove: [] });
    const r4 = await save(A, { topics: [topic({ id: id(), parent_id: ROOT_A, title: "x", sort_key: "d", node_kind: "baska" })], blocks: [], links_add: [], links_remove: [] });
    assert(!r1.ok && r1.status === 422 && !r2.ok && r2.status === 422 && r3.ok && !r4.ok && r4.status === 400, JSON.stringify([r1, r2, r3, r4].map((r) => (!r.ok ? r.status : "ok"))));
  });
  await test("grup başlığına daha önce yazılmış not KORUNUR (otomatik taşınmaz/silinmez)", async () => {
    const n = await row("sifa_topic_blocks", NOTE_A2);
    assert(n && n.topic_id === TPL_GRP && n.deleted_at === null, "eski grup notu");
  });

  section("F) Not ↔ içerik kutusu");
  const NOTE_F = id(), BOX_F1 = id(), BOX_F2 = id();
  await test("aynı kayıtta not + kutular (kutu dizide notan ÖNCE gelse bile) oluşturulur; adlar boş olabilir", async () => {
    await mustSave(A, {
      topics: [],
      blocks: [
        block({ id: BOX_F1, topic_id: OWN_H, parent_block_id: NOTE_F, title: "", sort_key: "a" }),
        block({ id: NOTE_F, topic_id: OWN_H, title: "", sort_key: "c" }),
        block({ id: BOX_F2, topic_id: OWN_H, parent_block_id: NOTE_F, title: "Dikkat Edilecekler", sort_key: "b" }),
      ],
      links_add: [],
      links_remove: [],
    });
    const ws = await load(A);
    const kids = ws.blocks.filter((b) => b.parentBlockId === NOTE_F).map((b) => b.id).sort();
    assert(kids.join() === [BOX_F1, BOX_F2].sort().join() && ws.blocks.find((b) => b.id === NOTE_F)!.title === "", JSON.stringify(kids));
  });
  await test("kutunun içine kutu, başka başlıktaki nota kutu, üst bağ değişimi → 422 (tamamı geri alınır)", async () => {
    const r1 = await save(A, { topics: [], blocks: [block({ id: id(), topic_id: OWN_H, parent_block_id: BOX_F1 })], links_add: [], links_remove: [] });
    const r2 = await save(A, { topics: [], blocks: [block({ id: id(), topic_id: ROOT_A, parent_block_id: NOTE_F })], links_add: [], links_remove: [] });
    const bx = await row("sifa_topic_blocks", BOX_F1);
    const r3 = await save(A, { topics: [], blocks: [block({ id: BOX_F1, topic_id: OWN_H, parent_block_id: NOTE_A, base_version: bx.version, sort_key: "a" })], links_add: [], links_remove: [] });
    assert(!r1.ok && r1.status === 422 && !r2.ok && r2.status === 422 && !r3.ok && r3.status === 422, JSON.stringify([r1, r2, r3].map((r) => (!r.ok ? `${r.status}` : "ok"))));
  });
  await test("başka uzmanın notuna kutu eklenemez (404; varlık sızmaz)", async () => {
    const r = await save(A, { topics: [], blocks: [block({ id: id(), topic_id: OWN_H, parent_block_id: NOTE_B })], links_add: [], links_remove: [] });
    assert(!r.ok && r.status === 404, JSON.stringify(r));
  });

  section("G) Web bağlantısı türü");
  await test("'baglanti' türü kaydedilir ve okunur; https dışı reddedilir", async () => {
    const b = await row("sifa_topic_blocks", BOX_F2);
    await mustSave(A, { topics: [], blocks: [block({ id: BOX_F2, topic_id: OWN_H, parent_block_id: NOTE_F, title: "Dikkat Edilecekler", sort_key: "b", base_version: b.version, sources: [{ id: id(), kind: "baglanti", title: "Site", url: "https://ornek.example/a" }] })], links_add: [], links_remove: [] });
    const src = (await load(A)).blocks.find((x) => x.id === BOX_F2)!.sources;
    const b2 = await row("sifa_topic_blocks", BOX_F2);
    const bad = await save(A, { topics: [], blocks: [block({ id: BOX_F2, topic_id: OWN_H, parent_block_id: NOTE_F, sort_key: "b", base_version: b2.version, sources: [{ id: id(), kind: "baglanti", title: "x", url: "javascript:alert(1)" }] })], links_add: [], links_remove: [] });
    assert(src.length === 1 && src[0].kind === "baglanti" && !bad.ok && bad.status === 400, JSON.stringify(src));
  });

  section("H) Çöp zamanı SUNUCUDA");
  await test("istemcinin geçmiş tarihli deleted_at'i yok sayılır; tekrar kaydetme ilk tarihi korur", async () => {
    const t = await row("sifa_topics", OWN_H);
    const bt = id();
    const notes = (await q("select id, version, title, sort_key from public.sifa_topic_blocks where topic_id = $1", [OWN_H])).rows;
    // Başlık (ve altındaki not/kutular) aynı partide çöpe
    await mustSave(A, {
      topics: [topic({ id: OWN_H, parent_id: ROOT_A, title: t.title, sort_key: "b", base_version: t.version, deleted_at: "2000-01-01T00:00:00Z", delete_batch_id: bt })],
      blocks: [],
      links_add: [],
      links_remove: [],
    });
    const d1 = (await row("sifa_topics", OWN_H)).deleted_at as Date;
    assert(Date.now() - d1.getTime() < 60_000, `sunucu zamanı değil: ${d1.toISOString()}`);
    const t2 = await row("sifa_topics", OWN_H);
    await mustSave(A, { topics: [topic({ id: OWN_H, parent_id: ROOT_A, title: "yeni ad", sort_key: "b", base_version: t2.version, deleted_at: "2099-01-01T00:00:00Z", delete_batch_id: bt })], blocks: [], links_add: [], links_remove: [] });
    const d2 = (await row("sifa_topics", OWN_H)).deleted_at as Date;
    assert(d2.getTime() === d1.getTime(), "ilk çöp tarihi korunmadı");
    const t3 = await row("sifa_topics", OWN_H);
    await mustSave(A, { topics: [topic({ id: OWN_H, parent_id: ROOT_A, title: "Kendi başlığım", sort_key: "b", base_version: t3.version })], blocks: [], links_add: [], links_remove: [] });
    return `${notes.length} not/kutu aynı başlıkta`;
  });

  section("I) İçerik tarihi (oluşturulma / son güncelleme)");
  await test("yalnız sıralama değişince ve çöp/geri almada tarih DEĞİŞMEZ; içerik değişince değişir", async () => {
    const n0 = await row("sifa_topic_blocks", NOTE_F);
    const c0 = n0.content_updated_at as Date;
    await new Promise((r) => setTimeout(r, 20));
    await mustSave(A, { topics: [], blocks: [block({ id: NOTE_F, topic_id: OWN_H, title: "", sort_key: "e", base_version: n0.version })], links_add: [], links_remove: [] });
    const n1 = await row("sifa_topic_blocks", NOTE_F);
    assert((n1.content_updated_at as Date).getTime() === c0.getTime(), "sıralama tarihi değiştirdi");
    const bt = id();
    await mustSave(A, { topics: [], blocks: [block({ id: NOTE_F, topic_id: OWN_H, title: "", sort_key: "e", base_version: n1.version, deleted_at: new Date().toISOString(), delete_batch_id: bt })], links_add: [], links_remove: [] });
    const n2 = await row("sifa_topic_blocks", NOTE_F);
    await mustSave(A, { topics: [], blocks: [block({ id: NOTE_F, topic_id: OWN_H, title: "", sort_key: "e", base_version: n2.version })], links_add: [], links_remove: [] });
    const n3 = await row("sifa_topic_blocks", NOTE_F);
    assert((n3.content_updated_at as Date).getTime() === c0.getTime(), "çöp/geri alma tarihi değiştirdi");
    await mustSave(A, { topics: [], blocks: [block({ id: NOTE_F, topic_id: OWN_H, title: "Adlı not", sort_key: "e", base_version: n3.version })], links_add: [], links_remove: [] });
    const n4 = await row("sifa_topic_blocks", NOTE_F);
    assert((n4.content_updated_at as Date).getTime() > c0.getTime() && n4.created_at.getTime() === n0.created_at.getTime(), "içerik değişimi tarihi yenilemedi / oluşturulma değişti");
  });
  await test("kutudaki değişiklik ÜST NOTUN tarihini yeniler; başka not etkilenmez", async () => {
    const note = await row("sifa_topic_blocks", NOTE_F);
    const other = await row("sifa_topic_blocks", NOTE_A);
    const box = await row("sifa_topic_blocks", BOX_F1);
    await new Promise((r) => setTimeout(r, 20));
    await mustSave(A, { topics: [], blocks: [block({ id: BOX_F1, topic_id: OWN_H, parent_block_id: NOTE_F, title: "Adlandı", sort_key: "a", base_version: box.version })], links_add: [], links_remove: [] });
    const note2 = await row("sifa_topic_blocks", NOTE_F);
    const other2 = await row("sifa_topic_blocks", NOTE_A);
    assert((note2.content_updated_at as Date) > (note.content_updated_at as Date) && note2.version === note.version, "üst not tarihi");
    assert(String(other2.content_updated_at) === String(other.content_updated_at), "başka not etkilendi");
  });

  section("J) İçerik kutusunu KALICI silme");
  const BOX_J = id(), SRC_J = id();
  await test("kutu + kaynağı + görseli kalıcı silinir; nesne yolu döner; üst notun tarihi yenilenir", async () => {
    await mustSave(A, { topics: [], blocks: [block({ id: BOX_J, topic_id: OWN_H, parent_block_id: NOTE_F, title: "Silinecek", sort_key: "z", sources: [{ id: SRC_J, kind: "kitap", title: "Kitap" }] })], links_add: [], links_remove: [], assets_set: [{ id: ASSET_A2, block_id: BOX_J, caption: "galeri" }] });
    assert((await row("sifa_block_assets", ASSET_A2)).block_id === BOX_J, "görsel bağlanmadı");
    const bx = await row("sifa_topic_blocks", BOX_J);
    const note = await row("sifa_topic_blocks", NOTE_F);
    await new Promise((r) => setTimeout(r, 20));
    const r = await mustSave(A, { topics: [], blocks: [], links_add: [], links_remove: [], blocks_delete: [{ id: BOX_J, base_version: bx.version }] });
    assert(!(await row("sifa_topic_blocks", BOX_J)) && !(await row("sifa_block_sources", SRC_J)) && !(await row("sifa_block_assets", ASSET_A2)), "kalıntı var");
    assert(r.removedAssets.length === 1 && r.removedAssets[0].storage_path.endsWith(`${ASSET_A2}.png`), JSON.stringify(r.removedAssets));
    assert((await row("sifa_topic_blocks", NOTE_F)).content_updated_at > note.content_updated_at, "üst not tarihi");
  });
  await test("NOT kalıcı silinemez (422) ve aynı kayıttaki diğer değişiklik de YAZILMAZ", async () => {
    const n = await row("sifa_topic_blocks", NOTE_A);
    const h = await row("sifa_topics", ROOT_A);
    const r = await save(A, { topics: [topic({ id: ROOT_A, title: "DEĞİŞMEMELİ", base_version: h.version })], blocks: [], links_add: [], links_remove: [], blocks_delete: [{ id: NOTE_A, base_version: n.version }] });
    assert(!r.ok && r.status === 422 && (await row("sifa_topics", ROOT_A)).title === "Migren" && (await row("sifa_topic_blocks", NOTE_A)), JSON.stringify(r));
  });
  await test("başka uzmanın kutusu silinemez (404); eski sürümle silme 409", async () => {
    const bBox = id();
    await mustSave(B, { topics: [], blocks: [block({ id: bBox, topic_id: ROOT_B, parent_block_id: NOTE_B, title: "B kutusu" })], links_add: [], links_remove: [] });
    const r1 = await save(A, { topics: [], blocks: [], links_add: [], links_remove: [], blocks_delete: [{ id: bBox, base_version: 1 }] });
    const box = await row("sifa_topic_blocks", BOX_F1);
    const r2 = await save(A, { topics: [], blocks: [], links_add: [], links_remove: [], blocks_delete: [{ id: BOX_F1, base_version: box.version + 5 }] });
    assert(!r1.ok && r1.status === 404 && (await row("sifa_topic_blocks", bBox)) && !r2.ok && r2.status === 409 && (r2.conflicts ?? []).some((x) => x.id === BOX_F1), JSON.stringify([r1, r2]));
  });

  section("K) Galeri görselleri");
  await test("görsel nota bağlanır + açıklama yazılır; açıklama değişimi notun tarihini yeniler", async () => {
    const A3 = id();
    assert((await registerUpload(db, A, { id: A3, storage_path: `${T1}/${A.userId}/${A3}.png`, mime_type: "image/png", byte_size: 10 })).ok, "kayıt");
    await mustSave(A, { topics: [], blocks: [], links_add: [], links_remove: [], assets_set: [{ id: A3, block_id: NOTE_F, caption: "İlk açıklama" }] });
    const n0 = await row("sifa_topic_blocks", NOTE_F);
    await new Promise((r) => setTimeout(r, 20));
    await mustSave(A, { topics: [], blocks: [], links_add: [], links_remove: [], assets_set: [{ id: A3, block_id: NOTE_F, caption: "Yeni açıklama" }] });
    const ws = await load(A);
    const a = ws.blocks.find((b) => b.id === NOTE_F)!.assets!.find((x) => x.id === A3)!;
    assert(a.caption === "Yeni açıklama" && (await row("sifa_topic_blocks", NOTE_F)).content_updated_at > n0.content_updated_at, JSON.stringify(a));
  });
  await test("görsel başka kutuya TAŞINAMAZ; başka uzmanın görseli bağlanamaz (404, tamamı geri alınır)", async () => {
    const r1 = await save(A, { topics: [], blocks: [], links_add: [], links_remove: [], assets_set: [{ id: ASSET_A, block_id: NOTE_F, caption: null }] });
    const r2 = await save(A, { topics: [], blocks: [], links_add: [], links_remove: [], assets_set: [{ id: ASSET_B, block_id: NOTE_F, caption: null }] });
    const legacy = await save(A, { topics: [], blocks: [], links_add: [], links_remove: [], asset_links: [{ asset_id: ASSET_A, block_id: NOTE_F }] });
    assert(!r1.ok && r1.status === 404 && !r2.ok && r2.status === 404 && (await row("sifa_block_assets", ASSET_A)).block_id === NOTE_A, JSON.stringify([r1, r2]));
    assert(legacy.ok && (await row("sifa_block_assets", ASSET_A)).block_id === NOTE_A, "eski asset_links başka kutuya taşıdı");
  });
  await test("görsel kaldırma: satır silinir, yol döner; başkasınınki kaldırılamaz", async () => {
    const A4 = id();
    await registerUpload(db, A, { id: A4, storage_path: `${T1}/${A.userId}/${A4}.png`, mime_type: "image/png", byte_size: 10 });
    await mustSave(A, { topics: [], blocks: [], links_add: [], links_remove: [], assets_set: [{ id: A4, block_id: NOTE_F, caption: null }] });
    const r = await mustSave(A, { topics: [], blocks: [], links_add: [], links_remove: [], assets_delete: [A4] });
    const r2 = await save(A, { topics: [], blocks: [], links_add: [], links_remove: [], assets_delete: [ASSET_B] });
    assert(!(await row("sifa_block_assets", A4)) && r.removedAssets.length === 1 && !r2.ok && r2.status === 404 && (await row("sifa_block_assets", ASSET_B)), "kaldırma");
  });

  section("L) Görsel yaşam döngüsü (galeri korunur)");
  await test("içerikte geçmeyen ama CANLI nota bağlı galeri görseli temizlik adayı DEĞİL", async () => {
    const G = id();
    await registerUpload(db, A, { id: G, storage_path: `${T1}/${A.userId}/${G}.png`, mime_type: "image/png", byte_size: 10 });
    await mustSave(A, { topics: [], blocks: [], links_add: [], links_remove: [], assets_set: [{ id: G, block_id: NOTE_F, caption: "galeri" }] });
    await q("update public.sifa_block_assets set created_at = now() - interval '60 days' where id = $1", [G]);
    const cand = (await q("select public.sifa_v2_gc_candidates(now() - interval '30 days', now() - interval '7 days', null, 1000) c")).rows[0].c;
    assert(!JSON.stringify(cand.assets ?? []).includes(G), "galeri görseli aday oldu");
    return "korundu";
  });
  await test("not çöpte saklama süresi dolunca not, kutuları ve görselleri aday olur; temizlik hepsini kaldırır", async () => {
    const NT = id(), BXT = id(), GT = id();
    await registerUpload(db, A, { id: GT, storage_path: `${T1}/${A.userId}/${GT}.png`, mime_type: "image/png", byte_size: 10 });
    await mustSave(A, { topics: [], blocks: [block({ id: NT, topic_id: ROOT_A, title: "Eski", sort_key: "y" }), block({ id: BXT, topic_id: ROOT_A, parent_block_id: NT, title: "k", sort_key: "a" })], links_add: [], links_remove: [], assets_set: [{ id: GT, block_id: BXT, caption: null }] });
    const n = await row("sifa_topic_blocks", NT);
    await mustSave(A, { topics: [], blocks: [block({ id: NT, topic_id: ROOT_A, title: "Eski", sort_key: "y", base_version: n.version, deleted_at: new Date().toISOString(), delete_batch_id: id() })], links_add: [], links_remove: [] });
    await q("update public.sifa_topic_blocks set deleted_at = now() - interval '40 days' where id = $1", [NT]);
    const cand = (await q("select public.sifa_v2_gc_candidates(now() - interval '30 days', now() - interval '7 days', $1::uuid, 1000) c", [T1])).rows[0].c;
    const s = JSON.stringify(cand);
    assert(s.includes(NT) && s.includes(BXT) && s.includes(GT), s.slice(0, 300));
    await q("select public.sifa_v2_gc_purge(now() - interval '30 days', $1::uuid, $2::uuid[])", [T1, [GT]]);
    assert(!(await row("sifa_topic_blocks", NT)) && !(await row("sifa_topic_blocks", BXT)) && !(await row("sifa_block_assets", GT)), "temizlenmedi");
  });

  section("M) Yetkiler");
  await test("tarayıcı rolleri tablolara ve fonksiyonlara erişemez; __apply hiçbir role açık değil", async () => {
    const r = (await q(`select
      has_table_privilege('anon','public.sifa_topic_blocks','SELECT') a1,
      has_table_privilege('authenticated','public.sifa_block_assets','SELECT') a2,
      has_function_privilege('anon','public.sifa_v2_load(uuid,uuid)','EXECUTE') f1,
      has_function_privilege('authenticated','public.sifa_v2__block_dead(uuid,timestamptz)','EXECUTE') f2,
      has_function_privilege('service_role','public.sifa_v2__apply(uuid,uuid,text,jsonb)','EXECUTE') f3,
      has_function_privilege('service_role','public.sifa_v2_load(uuid,uuid)','EXECUTE') s1,
      has_function_privilege('service_role','public.sifa_v2__block_dead(uuid,timestamptz)','EXECUTE') s2,
      has_table_privilege('service_role','public.sifa_topic_blocks','DELETE') d1,
      has_table_privilege('service_role','public.sifa_topic_blocks','UPDATE') d2`)).rows[0];
    assert(!r.a1 && !r.a2 && !r.f1 && !r.f2 && !r.f3 && r.s1 && r.s2 && !r.d1 && !r.d2, JSON.stringify(r));
  });
  await test("SECURITY DEFINER fonksiyonlarının search_path'i boş", async () => {
    const r = (await q(`select proname, proconfig from pg_proc where proname in ('sifa_v2_load','sifa_v2__block_dead','sifa_v2__asset_in_use') and prosecdef`)).rows;
    assert(r.length === 3 && r.every((x) => Array.isArray(x.proconfig) && x.proconfig.includes('search_path=""')), JSON.stringify(r));
  });

  section("N) Kullanıcı kotası YOK (Owner kararı F3-R1)");
  await test("migration kota/kullanım fonksiyonu tanımlamaz; F3 SQL'inde kota yok", async () => {
    const f = (await q("select count(*)::int n from pg_proc where proname ilike '%usage%' and pronamespace = 'public'::regnamespace and proname like 'sifa%'")).rows[0].n;
    assert(f === 0 && !/quota|kota|upload_usage/i.test(F3), `fonksiyon=${f}`);
  });

  section("O) Çakışma ve P) İzolasyon");
  await test("aynı nota iki pencereden kayıt → ikincisi 409 + çakışan kayıt listesi; hiçbir şey yazılmaz", async () => {
    const n = await row("sifa_topic_blocks", NOTE_A);
    await mustSave(A, { topics: [], blocks: [block({ id: NOTE_A, topic_id: TPL_KONU, title: "Pencere 1", base_version: n.version, content_json: n.content_json, sources: [] })], links_add: [], links_remove: [] });
    const r = await save(A, { topics: [], blocks: [block({ id: NOTE_A, topic_id: TPL_KONU, title: "Pencere 2", base_version: n.version })], links_add: [], links_remove: [] });
    assert(!r.ok && r.status === 409 && (r.conflicts ?? [])[0]?.id === NOTE_A && (await row("sifa_topic_blocks", NOTE_A)).title === "Pencere 1", JSON.stringify(r));
  });
  await test("farklı tenant uzmanı (C) A'nın kaydını göremez/değiştiremez", async () => {
    const ws = await load(C);
    const t = await row("sifa_topics", ROOT_A);
    const r = await save(C, { topics: [topic({ id: ROOT_A, title: "ele geçirme", base_version: t.version })], blocks: [], links_add: [], links_remove: [] });
    assert(ws.nodes.length === 0 && !r.ok && r.status === 404 && (await row("sifa_topics", ROOT_A)).title === "Migren", JSON.stringify(r));
  });
  await test("aynı adlı iki konu oluşturulabilir (mükerrer kısıtı YOK — son karar kullanıcıda)", async () => {
    await mustSave(A, { topics: [topic({ id: id(), title: "Migren", sort_key: "n" })], blocks: [], links_add: [], links_remove: [] });
    const n = (await load(A)).nodes.filter((x) => x.parentId === null && x.title === "Migren").length;
    assert(n === 2, String(n));
  });

  section("Q) Şema geri dönüşü (docs/sifa-rehberi-f3/geri-donus-sema.sql) ve yeniden ileri");
  await test("geri dönüş: veri ve eklenen sütunlar KALIR; eski fonksiyonlar döner; eski biçimli kayıt çalışır", async () => {
    const before = await oldColumnsChecksum();
    const nb = (await q("select count(*)::int n from public.sifa_topic_blocks where parent_block_id is not null")).rows[0].n;
    await q(readFileSync(path.resolve("docs/sifa-rehberi-f3/geri-donus-sema.sql"), "utf8"));
    assert((await oldColumnsChecksum()) === before, "geri dönüş veriyi değiştirdi");
    const cols = (await q("select count(*)::int n from information_schema.columns where table_schema='public' and column_name in ('node_kind','parent_block_id','content_updated_at')")).rows[0].n;
    const trg = (await q("select count(*)::int n from pg_trigger where tgname='sifa_blocks_guard_nest_trg'")).rows[0].n;
    const raw = (await q("select public.sifa_v2_load($1::uuid,$2::uuid) v", [A.tenantId, A.userId])).rows[0].v;
    assert(cols === 3 && trg === 0 && nb > 0 && !("node_kind" in (raw.topics[0] ?? {})), JSON.stringify({ cols, trg, nb }));
    const t = await row("sifa_topics", ROOT_A);
    await mustSave(A, { topics: [topic({ id: ROOT_A, title: "Migren", base_version: t.version })], blocks: [], links_add: [], links_remove: [] });
    return `${nb} içerik kutusu korunarak`;
  });
  await test("geri dönüşten sonra F3 yeniden uygulanır (ileri-geri-ileri; veri aynı)", async () => {
    const before = await oldColumnsChecksum();
    await q(F3);
    const kids = (await load(A)).blocks.filter((b) => b.parentBlockId).length;
    assert((await oldColumnsChecksum()) === before && kids > 0, "yeniden uygulama");
  });
} finally {
  await c.end();
  await epg.stop();
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
