/**
 * Şifa Rehberi V2 — şema taslağı doğrulaması (YEREL GEÇİCİ PostgreSQL; prod/ağ YOK).
 * Çalıştır: node scripts/sifa-rehberi-v2/schema.pg.mjs
 */
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";

const DATA_DIR = path.join(os.tmpdir(), `sifa-v2-pg-${process.pid}`);
// Sabit port başka oturumun gömülü PG'siyle çakışabilir → işletim sisteminden boş port al.
const PORT = Number(process.env.SIFA_V2_PG_PORT) || (await new Promise((res) => {
  const srv = net.createServer();
  srv.listen(0, "127.0.0.1", () => {
    const { port } = srv.address();
    srv.close(() => res(port));
  });
}));
const PW = "testpw";
const SQL = readFileSync(path.resolve("docs/sifa-rehberi-v2/schema-taslak.sql"), "utf8");

let pass = 0;
let fail = 0;
async function check(name, fn) {
  try {
    const d = await fn();
    pass++;
    console.log(`  ✓ ${name}${d ? ` — ${d}` : ""}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
async function rejects(c, sql, params, pattern) {
  try {
    await c.query("SAVEPOINT s");
    await c.query(sql, params);
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT s");
    if (pattern && !pattern.test(e.message)) throw new Error(`beklenmeyen hata: ${e.message}`);
    return e.message;
  }
  throw new Error("REDDEDİLMELİYDİ ama kabul edildi");
}

const epg = new EmbeddedPostgres({ databaseDir: DATA_DIR, user: "postgres", password: PW, port: PORT, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"] });
await epg.initialise();
await epg.start();
const c = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: PW, database: "postgres" });
await c.connect();
try {
  await c.query("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;");
  await check("Şema taslağı hatasız kuruluyor", async () => {
    await c.query(SQL);
  });
  await c.query("BEGIN");
  const T = crypto.randomUUID();
  const A = crypto.randomUUID(); // uzman A
  const B = crypto.randomUUID(); // uzman B
  const ins = async (owner, parent, title, key = "i") =>
    (await c.query("INSERT INTO sifa_topics (tenant_id, owner_user_id, parent_id, title, sort_key) VALUES ($1,$2,$3,$4,$5) RETURNING id", [T, owner, parent, title, key])).rows[0].id;

  const ak = await ins(A, null, "AKCİĞER");
  const rah = await ins(A, ak, "Rahatsızlıklar");
  const br = await ins(A, rah, "Bronşit");
  const bn = await ins(A, br, "Bronşit nedir?");
  const bOther = await ins(B, null, "B'nin konusu");

  await check("Döngü engeli: üst başlık kendi torununun altına taşınamaz", async () =>
    rejects(c, "UPDATE sifa_topics SET parent_id=$1 WHERE id=$2", [bn, ak], /sifa_topic_cycle/));
  await check("Kendi altına taşınamaz", async () => rejects(c, "UPDATE sifa_topics SET parent_id=$1 WHERE id=$1", [ak], /not_self|cycle/));
  await check("Uzman bazlı izolasyon: başka uzmanın konusunun altına başlık açılamaz (bileşik FK)", async () =>
    rejects(c, "INSERT INTO sifa_topics (tenant_id, owner_user_id, parent_id, title, sort_key) VALUES ($1,$2,$3,'x','i')", [T, A, bOther], /foreign key/));
  await check("Başka uzmanın konusuna kutu eklenemez", async () =>
    rejects(c, "INSERT INTO sifa_topic_blocks (tenant_id, owner_user_id, topic_id, title, sort_key) VALUES ($1,$2,$3,'k','i')", [T, A, bOther], /foreign key/));
  await check("Başka uzmanın konusuna bağlantı kurulamaz; kendine bağlantı yok", async () => {
    await rejects(c, "INSERT INTO sifa_topic_links (owner_user_id, from_topic_id, to_topic_id) VALUES ($1,$2,$3)", [A, ak, bOther], /foreign key/);
    await rejects(c, "INSERT INTO sifa_topic_links (owner_user_id, from_topic_id, to_topic_id) VALUES ($1,$2,$2)", [A, ak], /not_self/);
    await c.query("INSERT INTO sifa_topic_links (owner_user_id, from_topic_id, to_topic_id) VALUES ($1,$2,$3)", [A, ak, br]);
    await rejects(c, "INSERT INTO sifa_topic_links (owner_user_id, from_topic_id, to_topic_id) VALUES ($1,$2,$3)", [A, ak, br], /duplicate/);
  });
  await check("Derinlik tavanı 20: 20. seviye kabul, 21. RED; tavanı aşan taşıma RED", async () => {
    let parent = null;
    const chain = [];
    for (let i = 1; i <= 20; i++) {
      parent = await ins(A, parent, `Seviye ${i}`);
      chain.push(parent);
    }
    await rejects(c, "INSERT INTO sifa_topics (tenant_id, owner_user_id, parent_id, title, sort_key) VALUES ($1,$2,$3,'21','i')", [T, A, parent], /depth_exceeded/);
    // 4 seviyeli AKCİĞER ağacını 18. seviyenin altına taşımak → 18+4 > 20
    await rejects(c, "UPDATE sifa_topics SET parent_id=$1 WHERE id=$2", [chain[17], ak], /depth_exceeded/);
    return "OK";
  });
  await check("Kaynak DOI/URL ve görsel yolu sahiplik kuralları", async () => {
    const blk = (await c.query("INSERT INTO sifa_topic_blocks (tenant_id, owner_user_id, topic_id, title, sort_key) VALUES ($1,$2,$3,'Makale Notları','i') RETURNING id", [T, A, br])).rows[0].id;
    await rejects(c, "INSERT INTO sifa_block_sources (owner_user_id, block_id, kind, title, doi, sort_key) VALUES ($1,$2,'makale','x','11.1/bad','i')", [A, blk], /check/);
    await rejects(c, "INSERT INTO sifa_block_sources (owner_user_id, block_id, kind, title, url, sort_key) VALUES ($1,$2,'web','x','javascript:alert(1)','i')", [A, blk], /check/);
    await c.query("INSERT INTO sifa_block_sources (owner_user_id, block_id, kind, title, doi, sort_key) VALUES ($1,$2,'makale','x','10.1234/abc','i')", [A, blk]);
    await rejects(c, "INSERT INTO sifa_block_assets (tenant_id, owner_user_id, block_id, storage_path, mime_type, byte_size) VALUES ($1,$2,$3,$4,'image/png',10)", [T, A, blk, `${B}/x.png`], /path_owner/);
    await c.query("INSERT INTO sifa_block_assets (tenant_id, owner_user_id, block_id, storage_path, mime_type, byte_size) VALUES ($1,$2,$3,$4,'image/png',10)", [T, A, blk, `${A}/x.png`]);
  });
  await check("Hazır başlık: aynı yerde ikinci kopya RED; ad/yer/anahtar kilitli; tek başına silinemez", async () => {
    const insT = async (parent, title, key) =>
      (await c.query("INSERT INTO sifa_topics (tenant_id, owner_user_id, parent_id, title, sort_key, template_key) VALUES ($1,$2,$3,$4,'i',$5) RETURNING id", [T, A, parent, title, key])).rows[0].id;
    const grp = await insT(ak, "Belirtiler / Sebepler", "grup:belirtiler");
    const gen = await insT(grp, "Genel / Özet", "konu:genel_ozet");
    await rejects(c, "INSERT INTO sifa_topics (tenant_id, owner_user_id, parent_id, title, sort_key, template_key) VALUES ($1,$2,$3,'Genel / Özet','k','konu:genel_ozet')", [T, A, grp], /template_once/);
    await rejects(c, "UPDATE sifa_topics SET title='Başka' WHERE id=$1", [gen], /sifa_template_locked/);
    await rejects(c, "UPDATE sifa_topics SET parent_id=$1 WHERE id=$2", [ak, gen], /sifa_template_locked/);
    await rejects(c, "UPDATE sifa_topics SET template_key=NULL WHERE id=$1", [gen], /sifa_template_locked/);
    await rejects(c, "UPDATE sifa_topics SET template_key='konu:tibbi' WHERE id=$1", [bn], /sifa_template_locked/);
    await rejects(c, "UPDATE sifa_topics SET deleted_at=now(), delete_batch_id=gen_random_uuid() WHERE id=$1", [gen], /sifa_template_locked/);
    await rejects(c, "INSERT INTO sifa_topics (tenant_id, owner_user_id, parent_id, title, sort_key, template_key) VALUES ($1,$2,NULL,'x','i','grup:belirtiler')", [T, A], /template_not_root/);
    // altına kullanıcı başlığı + kutu serbest
    const child = await ins(A, gen, "Akciğer nedir?");
    await c.query("INSERT INTO sifa_topic_blocks (tenant_id, owner_user_id, topic_id, title, sort_key) VALUES ($1,$2,$3,'Doğrudan not','i')", [T, A, gen]);
    await c.query("INSERT INTO sifa_topic_blocks (tenant_id, owner_user_id, topic_id, title, sort_key) VALUES ($1,$2,$3,'Kutu A','i')", [T, A, child]);
    // üst konusuyla AYNI pakette silme serbest
    const batch = crypto.randomUUID();
    await c.query("SAVEPOINT b");
    try {
      // üst konu (kullanıcı başlığı) → grup → alt hazır başlık: hepsi aynı silme paketi
      for (const id of [ak, grp, gen]) {
        await c.query("UPDATE sifa_topics SET deleted_at=now(), delete_batch_id=$1 WHERE id=$2", [batch, id]);
      }
    } finally {
      await c.query("ROLLBACK TO SAVEPOINT b");
    }
    return "6 ihlal reddedildi; alt başlık/kutu ve paketli silme serbest";
  });
  await check("Yumuşak silme alanları birlikte zorunlu", async () =>
    rejects(c, "UPDATE sifa_topics SET deleted_at=now() WHERE id=$1", [bn], /delete_pair/));
  await check("Tarayıcı rolleri (anon/authenticated) tablolara erişemez", async () => {
    const r = await c.query(
      "SELECT bool_or(has_table_privilege('anon', t, 'SELECT') OR has_table_privilege('authenticated', t, 'SELECT')) AS any FROM unnest(ARRAY['sifa_topics','sifa_topic_blocks','sifa_block_sources','sifa_topic_links','sifa_block_assets']) t",
    );
    if (r.rows[0].any) throw new Error("yetki sızıyor");
  });
  await check("Performans: ~4.250 başlıklı ağaç + tek seviye okuma + tüm ağaç (özyinelemeli)", async () => {
    const owner = crypto.randomUUID();
    await c.query(
      `INSERT INTO sifa_topics (id, tenant_id, owner_user_id, parent_id, title, sort_key)
       SELECT gen_random_uuid(), $1, $2, NULL, 'Kök '||g, 'k'||lpad(g::text,4,'1')||'a' FROM generate_series(1,50) g`,
      [T, owner],
    );
    // her köke 3 seviye alt başlık: 50 kök × (4 + 16 + 64) ≈ 4.200 + 50
    for (let lvl = 0; lvl < 3; lvl++) {
      await c.query(
        `INSERT INTO sifa_topics (tenant_id, owner_user_id, parent_id, title, sort_key)
         SELECT $1, $2, p.id, p.title||'.'||g, 'a'||g FROM sifa_topics p, generate_series(1,4) g
         WHERE p.owner_user_id=$2 AND NOT EXISTS (SELECT 1 FROM sifa_topics x WHERE x.parent_id=p.id)`,
        [T, owner],
      );
    }
    await c.query("ANALYZE sifa_topics");
    const n = (await c.query("SELECT count(*)::int n FROM sifa_topics WHERE owner_user_id=$1", [owner])).rows[0].n;
    let t0 = performance.now();
    await c.query("SELECT id,title FROM sifa_topics WHERE owner_user_id=$1 AND parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_key", [owner]);
    const one = performance.now() - t0;
    t0 = performance.now();
    const all = await c.query(
      `WITH RECURSIVE t AS (SELECT id, parent_id, 1 d FROM sifa_topics WHERE owner_user_id=$1 AND parent_id IS NULL AND deleted_at IS NULL
         UNION ALL SELECT c.id, c.parent_id, t.d+1 FROM sifa_topics c JOIN t ON c.parent_id=t.id WHERE c.owner_user_id=$1 AND c.deleted_at IS NULL)
       SELECT count(*)::int n, max(d) d FROM t`,
      [owner],
    );
    const tree = performance.now() - t0;
    return `${n} başlık; kök seviyesi ${one.toFixed(1)} ms; tüm ağaç (${all.rows[0].n}, ${all.rows[0].d} seviye) ${tree.toFixed(1)} ms`;
  });
  await c.query("ROLLBACK");
} finally {
  await c.end();
  await epg.stop();
  try {
    rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* Windows EPERM — geçici klasör */
  }
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
