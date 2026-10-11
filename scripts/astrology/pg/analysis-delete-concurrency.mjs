// ASTROLOJİ — A ("yalnızca analizleri sil") ve B ("danışanı sil") silmelerinin EŞZAMANLI işlemlerle güvenliği
// (yalnız yerel embedded-postgres; prod / uzak DB / Roxy YOK).
//   1) Kayıt sürerken A → kayıt bitene kadar bekler, sonra eskimiş onay (40001), hiçbir analiz silinmez.
//   2) Aynı onayla iki A aynı anda → tam 1 başarı, diğeri 40001; silinen sayı bir kez.
//   3) Aynı profilde A ile B aynı anda → tam 1 başarı; diğeri 40001 / P0002; yarım durum yok.
//   4) Farklı profillerde N paralel A → hepsi başarılı, başka profiller etkilenmez.
// Çalıştırma: node scripts/astrology/pg/analysis-delete-concurrency.mjs
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
  ...[
    "000000_astrology_foundation",
    "000100_astrology_kb_analyses",
    "000200_astrology_timing_relationship",
    "000300_astrology_owner_isolation",
    "000400_astrology_client_list",
    "000500_astrology_profile_delete",
    "000600_astrology_record_caps",
    "000700_astrology_kb_snapshot_cleanup",
    "000800_astrology_analysis_delete",
  ].map(MIG),
];
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`;
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "c8c8c8c8-c8c8-4c8c-8c8c-c8c8c8c8c8c8";
const N = 12;

const watchdog = setTimeout(() => {
  console.error("FAIL analysis-delete-concurrency: 5 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
  process.exit(1);
}, 5 * 60_000);
watchdog.unref();
const opened = new Set();

async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = 56000 + Math.floor(Math.random() * 3000);
    const ok = await new Promise((res) => {
      const s = net.createServer();
      s.once("error", () => res(false));
      s.listen(p, "127.0.0.1", () => s.close(() => res(true)));
    });
    if (ok) return p;
  }
  throw new Error("boş port yok");
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "astro-adel-"));
fs.rmSync(dataDir, { recursive: true, force: true });
const port = await freePort();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", `max_connections=${N + 20}`], onLog: () => {}, onError: () => {} });
const client = () => {
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
  c.on("error", () => {});
  opened.add(c);
  return c;
};
const svc = async () => {
  const c = client();
  await c.connect();
  await c.query("SET ROLE service_role; SET statement_timeout = '30s'; SET lock_timeout = '30s'");
  return c;
};
const closeAll = async () => {
  await Promise.all([...opened].map((c) => Promise.race([c.end().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])));
  opened.clear();
};
let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const code = (r) => (r.status === "rejected" ? String(r.reason?.code ?? r.reason?.message).slice(0, 40) : "ok");

await server.initialise();
await server.start();
try {
  const admin = client();
  await admin.connect();
  await admin.query(BOOT);
  for (const f of SQL) await admin.query(fs.readFileSync(f, "utf8"));
  await admin.query("SET ROLE service_role");
  const mkProfile = async (label) =>
    (await admin.query(`SELECT public.astro_profile_create($1,$2,NULL,$3,'1990-01-01',NULL,false,'unknown',NULL,'Bursa',40.2,29.0,'Europe/Istanbul','auto',10800,'1990-01-01T09:00:00Z') AS r`, [TA, U, label])).rows[0].r.profile_id;
  const SAVE = `SELECT public.astro_analysis_save_v2($1,$2,$3,1,NULL,NULL,NULL,'western.natal',$4, gen_random_uuid(),'{}','{}','{}','{}','[]',false,NULL,'{}','[]')`;
  const save = (c, pid, title) => c.query(SAVE, [TA, U, pid, title]);
  const expected = async (ids) =>
    (await admin.query(
      `SELECT jsonb_agg(jsonb_build_object('id', id, 'current_revision', current_revision, 'updated_ms', updated_ms, 'own', own_analysis_count, 'shared', shared_preserved_count)) e FROM public.astro_profile_delete_preview($1,$2,$3)`,
      [TA, U, ids],
    )).rows[0].e;
  const count = async (pid) => Number((await admin.query(`SELECT count(*) n FROM public.astro_analyses WHERE profile_id = $1`, [pid])).rows[0].n);
  const exists = async (pid) => Number((await admin.query(`SELECT count(*) n FROM public.astro_birth_profiles WHERE id = $1`, [pid])).rows[0].n) === 1;

  // 1) Kayıt sürerken A.
  {
    const p = await mkProfile("K1");
    for (let i = 0; i < 3; i++) await save(admin, p, `a${i}`);
    const exp = await expected([p]);
    const c1 = await svc();
    const c2 = await svc();
    await c1.query("BEGIN");
    await save(c1, p, "eşzamanlı kayıt"); // profil satırında FOR KEY SHARE tutulur
    const del = c2.query("SELECT public.astro_profile_analyses_delete($1,$2,$3)", [TA, U, JSON.stringify(exp)]).then(
      () => ({ status: "fulfilled" }),
      (e) => ({ status: "rejected", reason: e }),
    );
    await sleep(400);
    // pg_stat_activity sorgu metnini service_role göremez → ayrı postgres bağlantısıyla ölç.
    const mon = client();
    await mon.connect();
    const waiting = Number((await mon.query(`SELECT count(*) n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE '%astro_profile_analyses_delete($1%'`)).rows[0].n);
    await mon.end();
    opened.delete(mon);
    await c1.query("COMMIT");
    const r = await del;
    const n = await count(p);
    check("kayıt sürerken A: bekler, sonra eskimiş onay", waiting === 1 && code(r) === "40001" && n === 4, `kilit bekleyen ${waiting}, sonuç ${code(r)}, kalan analiz ${n}/4`);
  }

  // 2) Aynı onayla iki A aynı anda.
  {
    const p = await mkProfile("K2");
    for (let i = 0; i < 5; i++) await save(admin, p, `b${i}`);
    const exp = JSON.stringify(await expected([p]));
    const cs = await Promise.all([svc(), svc()]);
    await Promise.all(cs.map((c) => c.query("BEGIN")));
    const res = await Promise.allSettled(
      cs.map((c) =>
        c
          .query("SELECT public.astro_profile_analyses_delete($1,$2,$3) r", [TA, U, exp])
          .then((x) => c.query("COMMIT").then(() => x.rows[0].r))
          .catch(async (e) => {
            await c.query("ROLLBACK").catch(() => {});
            throw e;
          }),
      ),
    );
    const ok = res.filter((r) => r.status === "fulfilled");
    const stale = res.filter((r) => code(r) === "40001").length;
    const n = await count(p);
    check("aynı onayla iki A", ok.length === 1 && stale === 1 && Number(ok[0].value.deleted_analyses) === 5 && n === 0 && (await exists(p)), `başarılı ${ok.length}, 40001 ${stale}, silinen ${ok[0]?.value?.deleted_analyses}, kalan ${n}, profil duruyor`);
  }

  // 3) Aynı profilde A ile B aynı anda (her iki sıralama).
  for (const order of ["A→B", "B→A"]) {
    const p = await mkProfile(`K3 ${order}`);
    for (let i = 0; i < 2; i++) await save(admin, p, `c${i}`);
    const exp = JSON.stringify(await expected([p]));
    const fns = order === "A→B" ? ["astro_profile_analyses_delete", "astro_profile_delete"] : ["astro_profile_delete", "astro_profile_analyses_delete"];
    const cs = await Promise.all([svc(), svc()]);
    await cs[0].query("BEGIN");
    const first = cs[0].query(`SELECT public.${fns[0]}($1,$2,$3)`, [TA, U, exp]);
    await first;
    const second = cs[1].query(`SELECT public.${fns[1]}($1,$2,$3)`, [TA, U, exp]).then(
      () => ({ status: "fulfilled" }),
      (e) => ({ status: "rejected", reason: e }),
    );
    await sleep(300);
    await cs[0].query("COMMIT");
    const r2 = await second;
    const n = await count(p);
    const ex = await exists(p);
    const consistent = order === "A→B" ? ex && n === 0 && code(r2) === "40001" : !ex && n === 0 && (code(r2) === "P0002" || code(r2) === "40001");
    check(`A ile B aynı anda (${order})`, consistent, `ikinci işlem ${code(r2)}, profil ${ex ? "duruyor" : "silindi"}, kalan analiz ${n}`);
  }

  // 4) Farklı profillerde N paralel A + seçilmeyen profil etkilenmez.
  {
    const ps = [];
    for (let i = 0; i < N; i++) {
      const p = await mkProfile(`P${i}`);
      await save(admin, p, "x");
      await save(admin, p, "y");
      ps.push(p);
    }
    const bystander = await mkProfile("seyirci");
    await save(admin, bystander, "kalmalı");
    const exps = await Promise.all(ps.map((p) => expected([p])));
    const cs = await Promise.all(ps.map(() => svc()));
    const res = await Promise.allSettled(cs.map((c, i) => c.query("SELECT public.astro_profile_analyses_delete($1,$2,$3) r", [TA, U, JSON.stringify(exps[i])])));
    const ok = res.filter((r) => r.status === "fulfilled").length;
    const left = Number((await admin.query(`SELECT count(*) n FROM public.astro_analyses WHERE profile_id = ANY($1)`, [ps])).rows[0].n);
    const kept = Number((await admin.query(`SELECT count(*) n FROM public.astro_birth_profiles WHERE id = ANY($1)`, [ps])).rows[0].n);
    const by = await count(bystander);
    check(`${N} paralel A (farklı profiller)`, ok === N && left === 0 && kept === N && by === 1, `başarılı ${ok}/${N}, kalan analiz ${left}, profil ${kept}/${N}, seyirci analizi ${by}/1`);
  }
  await admin.end();
} catch (e) {
  fail++;
  console.log(`FAIL analysis-delete-concurrency: beklenmeyen hata — ${String(e?.message ?? e).slice(0, 200)}`);
} finally {
  await closeAll();
  await server.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\nastrology analysis-delete-concurrency: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
