// ASTROLOJİ 9B-P3-01 — kayıt tavanının EŞZAMANLI isteklerle aşılamadığının kanıtı (yalnız yerel embedded-postgres;
// prod / uzak DB / Roxy YOK). Tavan−1 kayıttayken N ayrı bağlantı aynı anda birer kayıt ekler → tam 1 başarı, aşım 0.
// Çalıştırma: node scripts/astrology/pg/cap-concurrency.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIG = (f) => path.join(REPO, "supabase/migrations", `20271101${f}.sql`);
const SQL = [
  path.join(REPO, "scripts/astrology/pg/astrology-fixture.sql"),
  path.join(REPO, "scripts/astrology/pg/astrology-7b-fixture.sql"),
  ...["000000_astrology_foundation", "000100_astrology_kb_analyses", "000200_astrology_timing_relationship", "000300_astrology_owner_isolation", "000400_astrology_client_list", "000500_astrology_profile_delete", "000600_astrology_record_caps"].map(MIG),
];
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`;
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7";
const N = 40;

// Bekçi: hiçbir durumda süresiz asılı kalmasın (9B: düşük bellekte initdb max_connections'ı düşük seçince bağlantılar
// reddedilmiş, açık kalan bağlantılar yüzünden server.stop() sonsuza dek beklemişti).
const watchdog = setTimeout(() => {
  console.error("FAIL cap-concurrency: 5 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
  process.exit(1);
}, 5 * 60_000);
watchdog.unref();
const opened = new Set();

async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = 59000 + Math.floor(Math.random() * 3000);
    const ok = await new Promise((res) => { const s = net.createServer(); s.once("error", () => res(false)); s.listen(p, "127.0.0.1", () => s.close(() => res(true))); });
    if (ok) return p;
  }
  throw new Error("boş port yok");
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "astro9b-cap-"));
fs.rmSync(dataDir, { recursive: true, force: true });
const port = await freePort();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", `max_connections=${N + 20}`], onLog: () => {}, onError: () => {} });
const client = () => {
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  c.on("error", () => {}); // bağlantı düşerse süreci çökertmesin; sonuç kontrolü raporlar
  opened.add(c);
  return c;
};
const closeAll = async () => {
  await Promise.all([...opened].map((c) => Promise.race([c.end().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])));
  opened.clear();
};
let pass = 0;
let fail = 0;
const check = (name, ok, detail) => { (ok ? pass++ : fail++); console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`); };

await server.initialise();
await server.start();
try {
  const admin = client();
  await admin.connect();
  await admin.query(BOOT);
  for (const f of SQL) await admin.query(fs.readFileSync(f, "utf8"));
  await admin.query("SET ROLE service_role");
  const pr = await admin.query(`SELECT public.astro_profile_create($1,$2,NULL,'Kök','1990-01-01',NULL,false,'unknown',NULL,'Bursa',40.2,29.0,'Europe/Istanbul','auto',10800,'1990-01-01T09:00:00Z') AS r`, [TA, U]);
  const pid = pr.rows[0].r.profile_id;
  await admin.query(`INSERT INTO public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key, title, body) SELECT $1, $2, 'western', 'planet_in_sign:sun:cancer', 'K' || g, 'g' FROM generate_series(1, 999) g`, [TA, U]);
  await admin.query(`SELECT public.astro_profile_create($1,$2,NULL,'P' || g,'1990-01-01',NULL,false,'unknown',NULL,'Bursa',40.2,29.0,'Europe/Istanbul','auto',10800,'1990-01-01T09:00:00Z') FROM generate_series(1, 1998) g`, [TA, U]);
  await admin.query(`SELECT public.astro_analysis_save_v2($1,$2,$3,1,NULL,NULL,NULL,'western.natal','A' || g, gen_random_uuid(),'{}','{}','{}','{}','[]',false,NULL,'{}','[]') FROM generate_series(1, 2999) g`, [TA, U, pid]);

  const scenarios = [
    ["Bilgi Bankası (1000)", "astro_kb_entries", 1000, `INSERT INTO public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key, title, body) VALUES ($1, $2, 'western', 'planet_in_sign:sun:cancer', 'yarış', 'g')`, () => [TA, U]],
    ["Doğum profili (2000)", "astro_birth_profiles", 2000, `SELECT public.astro_profile_create($1,$2,NULL,'yarış','1990-01-01',NULL,false,'unknown',NULL,'Bursa',40.2,29.0,'Europe/Istanbul','auto',10800,'1990-01-01T09:00:00Z')`, () => [TA, U]],
    ["Kayıtlı analiz (3000)", "astro_analyses", 3000, `SELECT public.astro_analysis_save_v2($1,$2,$3,1,NULL,NULL,NULL,'western.natal','yarış', gen_random_uuid(),'{}','{}','{}','{}','[]',false,NULL,'{}','[]')`, () => [TA, U, pid]],
  ];
  for (const [label, table, cap, sql, params] of scenarios) {
    const conns = [];
    for (let i = 0; i < N; i++) {
      const c = client();
      await c.connect();
      await c.query("SET ROLE service_role; SET statement_timeout = '30s'; SET lock_timeout = '30s'");
      conns.push(c);
    }
    // Hepsi aynı anda: önce işlemi aç, sonra eklemeleri birlikte gönder.
    await Promise.all(conns.map((c) => c.query("BEGIN")));
    const res = await Promise.allSettled(conns.map((c) => c.query(sql, params()).then(() => c.query("COMMIT")).catch(async (e) => { await c.query("ROLLBACK").catch(() => {}); throw e; })));
    await Promise.all(conns.map((c) => c.end().catch(() => {})));
    conns.forEach((c) => opened.delete(c));
    const ok = res.filter((r) => r.status === "fulfilled").length;
    const capErr = res.filter((r) => r.status === "rejected" && /ASTRO_RECORD_CAP/.test(String(r.reason?.message))).length;
    const other = res.filter((r) => r.status === "rejected" && !/ASTRO_RECORD_CAP/.test(String(r.reason?.message))).map((r) => String(r.reason?.message).slice(0, 80));
    const n = Number((await admin.query(`SELECT count(*) n FROM public.${table} WHERE tenant_id = $1 AND owner_user_id = $2`, [TA, U])).rows[0].n);
    check(`${label}: tavan−1'de ${N} eşzamanlı bağlantı`, ok === 1 && capErr === N - 1 && other.length === 0 && n === cap, `başarılı ${ok}, tavan reddi ${capErr}, başka hata ${other.length}${other.length ? ` (${other[0]})` : ""}, son sayı ${n} (aşım ${n - cap})`);
  }
  // Başka uzman aynı anda etkilenmez (kendi kilidi).
  const other = "c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6";
  const r2 = await admin.query(`INSERT INTO public.astro_kb_entries (tenant_id, owner_user_id, tradition, topic_key, title, body) VALUES ($1, $2, 'western', 'planet_in_sign:sun:cancer', 'diğer', 'g') RETURNING id`, [TA, other]);
  check("başka uzman tavandan etkilenmez", r2.rowCount === 1, "1 kayıt eklendi");
  await admin.end();
} catch (e) {
  fail++;
  console.log(`FAIL cap-concurrency: beklenmeyen hata — ${String(e?.message ?? e).slice(0, 200)}`);
} finally {
  await closeAll();
  await server.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\nastrology cap-concurrency: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
