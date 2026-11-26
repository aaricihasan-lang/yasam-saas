// GÖKYÜZÜ ATLASI — analiz parça sınırı migration'ı (20280126000000) GERÇEK PostgreSQL doğrulaması.
// YALNIZ yerel geçici embedded-postgres; production / uzak DB YOK. Sentetik satırlar; çalışma sonunda geçici dizin silinir.
// Kapsam: ESKİ şemada 11 parça RED (hatanın DB kanıtı) · mevcut kayıtlar birebir korunur (md5) · migration 2× (idempotent) ·
// yeni şemada 11/15/16 KABUL, 17 RED · diğer koşullar (params nesne + ≤16 KiB) aynen · en büyük gerçekçi KP Transit anlık
// görüntüsü (15 parça / 14 parça 92 gün) kayıt boyut kısıtını geçer · 12 eşzamanlı aynı istek → tek satır · başka tenant RED ·
// geri dönüş >10 parçalı satır varken reddedilir · ön koşulsuz veritabanında migration tamamen geri alınır.
// Çalıştırma: node scripts/astrology/pg/analysis-parts.mjs [anlık-görüntü-klasörü]  (npm run test:astrology:analysis-parts-pg)
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MIG = (f) => path.join(REPO, "supabase/migrations", f);
const BASE = [
  path.join(REPO, "scripts/astrology/pg/astrology-fixture.sql"),
  path.join(REPO, "scripts/astrology/pg/astrology-7b-fixture.sql"),
  ...["000000_astrology_foundation", "000100_astrology_kb_analyses", "000200_astrology_timing_relationship", "000300_astrology_owner_isolation", "000400_astrology_client_list", "000500_astrology_profile_delete", "000600_astrology_record_caps", "000700_astrology_kb_snapshot_cleanup", "000800_astrology_analysis_delete"].map((f) => MIG(`20271101${f}.sql`)),
];
const PARTS = MIG("20280126000000_astro_analysis_result_parts.sql");
// Anlık görüntü klasörü verilmezse üretici (sentetik sağlayıcı, ağ/ücret YOK) geçici klasöre çalıştırılır.
let SNAP_DIR = process.argv[2] ?? "";
if (!SNAP_DIR) {
  SNAP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "astro-parts-snap-"));
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, [path.join(REPO, "node_modules/tsx/dist/cli.mjs"), "--tsconfig", path.join(REPO, "scripts/astrology/tsconfig.json"), path.join(REPO, "scripts/astrology/pg/kp-transit-max-snapshot.ts"), SNAP_DIR], { cwd: REPO, stdio: ["ignore", "inherit", "inherit"] });
}
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`;
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U = "99999999-9999-4999-8999-999999999999";
const UB = "98989898-9898-4898-8898-989898989898";
const CX = "44444444-4444-4444-8444-444444444444";
const N = 12;

const watchdog = setTimeout(() => {
  console.error("FAIL analysis-parts: 5 dakikalık süre aşıldı — zorla çıkılıyor");
  process.exit(1);
}, 5 * 60_000);
watchdog.unref();
async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = 56000 + Math.floor(Math.random() * 2500);
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once("error", () => res(false));
      s.listen(p, "127.0.0.1", () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error("boş port yok");
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "astro-parts-pg-"));
fs.rmSync(dataDir, { recursive: true, force: true });
const port = await freePort();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", `max_connections=${N + 20}`], onLog: () => {}, onError: () => {} });
const opened = new Set();
const client = (database = "postgres") => {
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database });
  c.on("error", () => {});
  opened.add(c);
  return c;
};
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function tryq(c, sql, params) {
  await c.query("SAVEPOINT x");
  try {
    const r = await c.query(sql, params);
    await c.query("RELEASE SAVEPOINT x");
    return { ok: true, r };
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT x");
    return { ok: false, code: e.code, msg: String(e.message).slice(0, 120) };
  }
}
const ids = (n) => Array.from({ length: n }, () => crypto.randomUUID());
const SAVE = `SELECT public.astro_analysis_save_v2($1::uuid, $2::uuid, $3::uuid, 1, NULL, NULL, $4::uuid[], 'kp.transit', $5, $6::uuid, $7::jsonb, '{"label":"Sentetik"}'::jsonb, '{}'::jsonb, $8::jsonb, '[]'::jsonb, false, NULL, '{}'::jsonb, '[]'::jsonb) AS r`;
const save = (c, { tenant = TA, user = U, profile, n, title = "Sentetik KP", req = crypto.randomUUID(), params = '{"range":{}}', technical = "{}", resultIds }) =>
  tryq(c, SAVE, [tenant, user, profile, resultIds ?? ids(n), title, req, params, technical]);
const ROWS_MD5 = `SELECT count(*)::int n, md5(coalesce(string_agg(to_jsonb(a)::text, '|' ORDER BY id), '')) h FROM public.astro_analyses a`;

await server.initialise();
await server.start();
try {
  const admin = client();
  await admin.connect();
  await admin.query(BOOT);
  for (const f of BASE) await admin.query(fs.readFileSync(f, "utf8"));
  const prof = await admin.query(`SELECT public.astro_profile_create($1, $2, $3, 'Sentetik KP', '1990-07-15', '14:30', true, 'exact_record', NULL, 'İstanbul', 41.0, 29.0, 'Europe/Istanbul', 'auto', 10800, '1990-07-15T11:30:00Z') AS r`, [TA, U, CX]);
  const P = prof.rows[0].r.profile_id;
  await admin.query("BEGIN");

  // ── ESKİ ŞEMA (hatanın gerçek DB kanıtı) + mevcut kayıtlar ─────────────────────────────────────────────────
  const old10 = await save(admin, { profile: P, n: 10, title: "eski 10 parça" });
  const old11 = await save(admin, { profile: P, n: 11, title: "eski 11 parça" });
  check("ESKİ ŞEMA: 10 parça kaydedilir, 11 parça 23514 astro_an_params_chk ile REDDEDİLİR (canlıdaki hata)", old10.ok && !old11.ok && old11.code === "23514" && /astro_an_params_chk/.test(old11.msg), old11.msg);
  for (const n of [1, 3, 5]) await save(admin, { profile: P, n, title: `mevcut ${n} parça` });
  await admin.query("COMMIT");
  const before = (await admin.query(ROWS_MD5)).rows[0];
  const conBefore = (await admin.query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname='astro_an_params_chk'`)).rows[0].d;

  // ── MIGRATION (2×) ──────────────────────────────────────────────────────────────────────────────────────────
  const sql = fs.readFileSync(PARTS, "utf8");
  await admin.query(sql);
  let second = true;
  try {
    await admin.query(sql);
  } catch {
    second = false;
  }
  check("migration iki kez çalışır (idempotent)", second);
  const conAfter = (await admin.query(`SELECT pg_get_constraintdef(oid) d, convalidated v FROM pg_constraint WHERE conname='astro_an_params_chk'`)).rows[0];
  check("kısıt: yalnız parça sınırı 10 → 16; diğer koşullar aynen; mevcut satırlarla DOĞRULANMIŞ", conAfter.d === conBefore.replace("<= 10", "<= 16") && conAfter.v === true, conAfter.d);
  const after = (await admin.query(ROWS_MD5)).rows[0];
  check("mevcut analiz kayıtları birebir korunur (sayı + md5)", after.n === before.n && after.h === before.h, `${before.n} satır`);

  await admin.query("BEGIN");
  const r = {};
  for (const n of [11, 14, 15, 16, 17]) r[n] = await save(admin, { profile: P, n, title: `yeni ${n} parça` });
  check("YENİ ŞEMA: 11 / 14 / 15 / 16 parça KABUL; 17 parça 23514 RED", r[11].ok && r[14].ok && r[15].ok && r[16].ok && !r[17].ok && r[17].code === "23514", r[17].msg ?? "");
  const card = (await admin.query(`SELECT cardinality(result_ids) c FROM public.astro_analyses WHERE title='yeni 15 parça'`)).rows[0]?.c;
  check("15 parçalı kayıtta result_ids 15 eleman (kesilmedi), result_id NULL (çok parçalı)", card === 15);
  const big = await save(admin, { profile: P, n: 3, params: JSON.stringify({ pad: "x".repeat(17000) }) });
  const arr = await save(admin, { profile: P, n: 3, params: "[]" });
  check("diğer koşullar korunur: technique_params > 16 KiB RED, nesne olmayan params RED", !big.ok && big.code === "23514" && !arr.ok && arr.code === "23514");
  if (SNAP_DIR) {
    for (const [file, n] of [["kp15-7gun-60dk.json", 15], ["kp14-92gun.json", 14]]) {
      const tech = fs.readFileSync(path.join(SNAP_DIR, file), "utf8");
      const s = await save(admin, { profile: P, n, title: `max ${file}`, technical: tech });
      const sz = s.ok ? (await admin.query(`SELECT pg_column_size(technical_snapshot) z FROM public.astro_analyses WHERE title=$1`, [`max ${file}`])).rows[0].z : null;
      check(`en büyük gerçekçi anlık görüntü ${file} (${n} parça, ${tech.length} B JSON) kaydedilir; depolanan ${sz} B ≤ 1 MiB`, s.ok && sz <= 1048576, s.msg ?? "");
    }
  }
  const other = await save(admin, { tenant: TB, user: UB, profile: P, n: 15 });
  check("başka tenant'ın uzmanı bu profile 15 parçalı kayıt YAZAMAZ", !other.ok, `${other.code} ${other.msg}`);
  await admin.query("COMMIT");

  // ── Eşzamanlılık: aynı save_request_id ile 12 bağlantı → tek satır, hepsi aynı kimlik ──────────────────────
  const req = crypto.randomUUID();
  const rid = ids(15);
  const conns = await Promise.all(Array.from({ length: N }, async () => {
    const c = client();
    await c.connect();
    return c;
  }));
  const outs = await Promise.all(conns.map((c) => c.query(SAVE, [TA, U, P, rid, "eşzamanlı 15", req, '{"range":{}}', "{}"]).then((x) => x.rows[0].r.analysis_id).catch((e) => `HATA ${e.code}`)));
  const rows = (await admin.query(`SELECT count(*)::int n FROM public.astro_analyses WHERE save_request_id=$1`, [req])).rows[0].n;
  // Veritabanı düzeyi: tek satır; kazananlar aynı kimlik; yarışı kaybedenler YALNIZ 23505 (astro_an_request_key) alır —
  // uygulama katmanı (saveAnalysis) 23505'i aynı istek kimliğindeki mevcut kayda çevirir (transit03 P5).
  const okIds = outs.filter((x) => !String(x).startsWith("HATA"));
  const errs = outs.filter((x) => String(x).startsWith("HATA"));
  check(`${N} eşzamanlı aynı istek (15 parça) → TEK satır; başarılı yanıtlar aynı kimlik; kaybedenler yalnız 23505 (uygulama mevcut kaydı döndürür)`, rows === 1 && new Set(okIds).size === 1 && errs.every((x) => x === "HATA 23505"), `başarılı ${okIds.length}, 23505 ${errs.length}`);
  await Promise.all(conns.map((c) => c.end()));
  conns.forEach((c) => opened.delete(c));

  // ── Geri dönüş: >10 parçalı satır varken eski kısıt kurulamaz (sessiz veri kaybı yok) ────────────────────
  await admin.query("BEGIN");
  const rb = await tryq(admin, `ALTER TABLE public.astro_analyses DROP CONSTRAINT astro_an_params_chk, ADD CONSTRAINT astro_an_params_chk CHECK (jsonb_typeof(technique_params) = 'object' AND pg_column_size(technique_params) <= 16384 AND cardinality(result_ids) <= 10)`);
  await admin.query("ROLLBACK");
  check("geri dönüş SQL'i >10 parçalı kayıt varken 23514 ile reddedilir (kayıtlar korunur; önce Owner kararı gerekir)", !rb.ok && rb.code === "23514", rb.msg ?? "");
  await admin.end();
  opened.delete(admin);

  // ── Ön koşulsuz veritabanı: migration hata verir, hiçbir şey değişmez ──────────────────────────────────────
  const a2 = client();
  await a2.connect();
  await a2.query("CREATE DATABASE bos_db");
  await a2.end();
  opened.delete(a2);
  const e = client("bos_db");
  await e.connect();
  let err = "";
  try {
    await e.query(sql);
  } catch (x) {
    err = String(x.message).slice(0, 90);
    await e.query("ROLLBACK").catch(() => {});
  }
  const t = (await e.query(`SELECT to_regclass('public.astro_analyses') r`)).rows[0].r;
  check("ön koşulsuz veritabanında migration açık hatayla durur, nesne oluşturmaz", !!err && t === null, err);
  await e.end();
  opened.delete(e);
} catch (e) {
  fail++;
  console.log(`FAIL analysis-parts: beklenmeyen hata — ${String(e?.message ?? e).slice(0, 300)}`);
} finally {
  await Promise.all([...opened].map((c) => Promise.race([c.end().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])));
  await server.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\nastrology analysis-parts (PostgreSQL) harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
