// GÖKYÜZÜ ATLASI — aylık efemeris (20280125000000: astro_sky_monthly_cache + astro_sky_monthly_ephemeris) GERÇEK PostgreSQL
// doğrulaması. YALNIZ yerel geçici embedded-postgres; production / staging / uzak DB YOK. Sentetik satırlar; çalışma sonunda geçici
// veritabanı dizini silinir.
// Kapsam: idempotency (2×), RLS + rol yetkileri (iki tablo), kolon düzeyi UPDATE, değişmezlik tetikleyicisi, tür ↔ zodyak ↔ ayanamsa
// CHECK'i (tropikal / sideral karışmaz), dönem / zaman / boyut CHECK'leri, save_request_id tekilliği, önbellek anahtarı biçimi ve
// tekilliği, 3000 tavanı (40 eşzamanlı bağlantı), başka uzman, hesap temizleme keşfi (tenant_id uuid) + tenant silme provası,
// BAŞARISIZ migration (ön koşul yok / uyumsuz aynı adlı tablo) → tam geri alma, mevcut veri aynen.
// Çalıştırma: node scripts/astrology/pg/monthly-ephemeris.mjs
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
  // Birlikte yaşama: Horary kayıt tablosu (aynı tavan fonksiyonunu kullanır) ÖNCE uygulanır; aylık efemeris SONRA ve Horary yeniden.
  MIG("20271210000000_astro_horary_questions.sql"),
];
const MONTHLY = MIG("20280125000000_astro_sky_monthly_ephemeris.sql");
const BOOT = `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$; CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;`;
const TA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const U = "c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7";
const U2 = "c6c6c6c6-c6c6-4c6c-8c6c-c6c6c6c6c6c6";
const N = 40;

const watchdog = setTimeout(() => {
  console.error("FAIL monthly-ephemeris: 5 dakikalık süre aşıldı (askıda) — zorla çıkılıyor");
  process.exit(1);
}, 5 * 60_000);
watchdog.unref();
const opened = new Set();
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "astro-monthly-pg-"));
fs.rmSync(dataDir, { recursive: true, force: true });
const port = await freePort();
const server = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", `max_connections=${N + 20}`], onLog: () => {}, onError: () => {} });
const client = () => {
  const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" });
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
async function expectErr(c, sql, params, code, re) {
  await c.query("SAVEPOINT x");
  try {
    await c.query(sql, params);
    await c.query("RELEASE SAVEPOINT x");
    return { ok: false, got: "hata yok" };
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT x");
    return { ok: e.code === code && (!re || re.test(String(e.message))), got: `${e.code} ${String(e.message).slice(0, 90)}` };
  }
}
const T = "public.astro_sky_monthly_ephemeris";
const C = "public.astro_sky_monthly_cache";
const COLS = "(tenant_id, owner_user_id, title, kind, year, month, zodiac, ayanamsa, time_reference, source_endpoint, adapter_version, provider_api_version, methodology_version, snapshot_schema, result_snapshot, save_request_id)";
const INS = `INSERT INTO ${T} ${COLS} VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'/astrology/planets/monthly','monthly-ephemeris-1','v2@2.0.0','monthly-ephemeris-1@12utc',1,$10::jsonb,$11) RETURNING id, updated_at`;
const row = (o = {}) => [o.tenant ?? TA, o.owner ?? U, o.title ?? "Efemeris · Batı (Tropikal) · Kasım 2026", o.kind ?? "western", o.year ?? 2026, o.month ?? 11, o.zodiac ?? "tropical", o.ayanamsa === undefined ? null : o.ayanamsa, o.time ?? "12:00 UTC", o.snapshot ?? '{"days":[]}', o.req ?? crypto.randomUUID()];
const CINS = `INSERT INTO ${C} (cache_key, kind, year, month, provider, provider_api_version, adapter_version, endpoint, request, raw_response, technical) VALUES ($1,$2,$3,$4,'roxy','v2@2.0.0','monthly-ephemeris-1','/astrology/planets/monthly','{"year":2026,"month":11}'::jsonb,'{"days":[]}'::jsonb,'{"days":[]}'::jsonb)`;
const key = () => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

await server.initialise();
await server.start();
try {
  const admin = client();
  await admin.connect();
  await admin.query(BOOT);
  for (const f of BASE) await admin.query(fs.readFileSync(f, "utf8"));
  const sql = fs.readFileSync(MONTHLY, "utf8");
  await admin.query(sql);
  let second = true;
  try {
    await admin.query(sql);
  } catch {
    second = false;
  }
  check("M1 migration iki kez çalışır (idempotent)", second);
  let coexist = true;
  try {
    await admin.query(fs.readFileSync(MIG("20271210000000_astro_horary_questions.sql"), "utf8"));
  } catch {
    coexist = false;
  }
  const trg = (await admin.query("SELECT tgrelid::regclass::text t, tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('trg_astro_cap_horary','trg_astro_cap_sky_monthly','trg_astro_horary_questions_guard','trg_astro_sky_monthly_ephemeris_guard') ORDER BY 2")).rows;
  check("M1b birlikte yaşama: Horary migration'ı aylık efemeristen SONRA yeniden çalışır; iki modülün tetikleyicileri ayrı ve kendi tablolarında", coexist && trg.length === 4 && trg.every((r) => (r.tgname.includes("horary") ? r.t.endsWith("astro_horary_questions") : r.t.endsWith("astro_sky_monthly_ephemeris"))), JSON.stringify(trg));
  const cacheCols = (await admin.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='astro_sky_monthly_cache' ORDER BY ordinal_position")).rows.map((r) => r.column_name);
  const personal = cacheCols.filter((c) => /tenant|user|owner|profile|client|birth|name|email|phone|ip/.test(c));
  check("M1c önbellek tablosunda kişi / tenant / profil / danışan kolonu YOK (yalnız yıl-ay ve gök verisi)", personal.length === 0 && cacheCols.includes("cache_key"), cacheCols.join(","));
  const fk = (await admin.query("SELECT conrelid::regclass::text t FROM pg_constraint WHERE contype='f' AND (conrelid::regclass::text LIKE '%astro_sky%' OR confrelid::regclass::text LIKE '%astro_sky%')")).rows;
  check("M1d yeni tablolar başka hiçbir tabloya FK vermez/almaz (geri dönüş ve silme zinciri etkilenmez)", fk.length === 0, JSON.stringify(fk));

  // ── Yetkiler ──
  const priv = (await admin.query(`SELECT
      has_table_privilege('anon','${T}','SELECT') a_s, has_table_privilege('authenticated','${T}','SELECT') u_s, has_table_privilege('authenticated','${T}','INSERT') u_i,
      has_table_privilege('anon','${C}','SELECT') a_cs, has_table_privilege('authenticated','${C}','SELECT') u_cs,
      has_table_privilege('service_role','${T}','SELECT') s_s, has_table_privilege('service_role','${T}','INSERT') s_i, has_table_privilege('service_role','${T}','DELETE') s_d, has_table_privilege('service_role','${T}','TRUNCATE') s_t,
      has_column_privilege('service_role','${T}','title','UPDATE') s_u_title, has_column_privilege('service_role','${T}','result_snapshot','UPDATE') s_u_snap,
      has_column_privilege('service_role','${T}','kind','UPDATE') s_u_kind, has_column_privilege('service_role','${T}','owner_user_id','UPDATE') s_u_owner,
      has_table_privilege('service_role','${C}','SELECT') s_cs, has_table_privilege('service_role','${C}','INSERT') s_ci, has_table_privilege('service_role','${C}','UPDATE') s_cu, has_table_privilege('service_role','${C}','DELETE') s_cd,
      (SELECT relrowsecurity FROM pg_class WHERE oid='${T}'::regclass) rls, (SELECT relrowsecurity FROM pg_class WHERE oid='${C}'::regclass) crls,
      (SELECT count(*) FROM pg_policies WHERE tablename IN ('astro_sky_monthly_ephemeris','astro_sky_monthly_cache'))::int pol`)).rows[0];
  check("M2 anon / authenticated iki tabloda da hiçbir yetki yok", !priv.a_s && !priv.u_s && !priv.u_i && !priv.a_cs && !priv.u_cs);
  check("M3 kayıt: service_role SELECT + INSERT; DELETE / TRUNCATE YOK; UPDATE yalnız title (tür, sonuç, sahip güncellenemez)", priv.s_s && priv.s_i && !priv.s_d && !priv.s_t && priv.s_u_title && !priv.s_u_snap && !priv.s_u_kind && !priv.s_u_owner);
  check("M4 önbellek: service_role yalnız SELECT + INSERT (UPDATE / DELETE YOK)", priv.s_cs && priv.s_ci && !priv.s_cu && !priv.s_cd);
  check("M5 RLS iki tabloda etkin, politika yok", priv.rls === true && priv.crls === true && priv.pol === 0);
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE anon");
  const anonSel = await expectErr(admin, `SELECT 1 FROM ${C}`, [], "42501");
  await admin.query("ROLLBACK");
  check("M6 anon rolüyle önbellek okuma → 42501 (ham yanıt dışarı açık değil)", anonSel.ok, anonSel.got);

  // ── service_role kayıt akışı ──
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE service_role");
  check("M7 Batı kaydı (tropikal, ayanamsa yok)", (await admin.query(INS, row())).rowCount === 1);
  const rv = await admin.query(INS, row({ kind: "vedic", zodiac: "sidereal", ayanamsa: "lahiri", title: "Vedik" }));
  check("M8 Vedik kaydı (sideral + Lahiri)", rv.rowCount === 1);
  const mix1 = await expectErr(admin, INS, row({ kind: "western", zodiac: "sidereal", ayanamsa: "lahiri" }), "23514", /astro_sme_zodiac_chk/);
  const mix2 = await expectErr(admin, INS, row({ kind: "vedic", zodiac: "tropical" }), "23514", /astro_sme_zodiac_chk/);
  const mix3 = await expectErr(admin, INS, row({ kind: "vedic", zodiac: "sidereal", ayanamsa: "raman" }), "23514", /astro_sme_zodiac_chk/);
  const mix4 = await expectErr(admin, INS, row({ kind: "western", zodiac: "tropical", ayanamsa: "lahiri" }), "23514", /astro_sme_zodiac_chk/);
  check("M9 tropikal / sideral KARIŞAMAZ: Batı+sideral, Vedik+tropikal, Vedik+Raman, Batı+ayanamsa → CHECK", mix1.ok && mix2.ok && mix3.ok && mix4.ok, [mix1.got, mix2.got, mix3.got, mix4.got].join(" | "));
  const p1 = await expectErr(admin, INS, row({ year: 1599 }), "23514", /astro_sme_period_chk/);
  const p2 = await expectErr(admin, INS, row({ month: 13 }), "23514", /astro_sme_period_chk/);
  check("M10 dönem 1600–2600 / ay 1–12 dışı → CHECK", p1.ok && p2.ok, [p1.got, p2.got].join(" | "));
  const tm = await expectErr(admin, INS, row({ time: "00:00 UT" }), "23514", /astro_sme_time_chk/);
  check("M11 zaman referansı yalnız '12:00 UTC'", tm.ok, tm.got);
  const arr = await expectErr(admin, INS, row({ snapshot: "[1]" }), "23514", /astro_sme_snapshot_chk/);
  check("M12 anlık görüntü nesne değilse → CHECK", arr.ok, arr.got);
  const emptyT = await expectErr(admin, INS, row({ title: "  " }), "23514", /astro_sme_title_chk/);
  check("M13 boş başlık → CHECK", emptyT.ok, emptyT.got);
  const req = crypto.randomUUID();
  await admin.query(INS, row({ req }));
  const dup = await expectErr(admin, INS, row({ req }), "23505", /astro_sme_save_request_uq/);
  check("M14 aynı save_request_id ikinci kez → 23505 (idempotency)", dup.ok, dup.got);
  const id = rv.rows[0].id;
  const upSnap = await expectErr(admin, `UPDATE ${T} SET result_snapshot = '{}'::jsonb WHERE id = $1`, [id], "42501");
  check("M15 service_role anlık görüntüyü değiştiremez (kolon yetkisi 42501)", upSnap.ok, upSnap.got);
  const del = await expectErr(admin, `DELETE FROM ${T} WHERE id = $1`, [id], "42501");
  check("M16 service_role silemez (42501)", del.ok, del.got);
  const before = rv.rows[0].updated_at;
  const upT = await admin.query(`UPDATE ${T} SET title = 'Yeni başlık' WHERE id = $1 RETURNING updated_at, title`, [id]);
  check("M17 başlık güncellenebilir, updated_at ilerler", upT.rows[0].title === "Yeni başlık" && upT.rows[0].updated_at >= before);
  // Önbellek.
  const k = key();
  await admin.query(CINS, [k, "western", 2026, 11]);
  const cdup = await expectErr(admin, CINS, [k, "western", 2026, 11], "23505");
  const cbad = await expectErr(admin, CINS, ["ABC", "western", 2026, 11], "23514", /astro_smc_key_chk/);
  const ckind = await expectErr(admin, CINS, [key(), "hellenistic", 2026, 11], "23514", /astro_smc_kind_chk/);
  const cupd = await expectErr(admin, `UPDATE ${C} SET technical = '{}'::jsonb WHERE cache_key = $1`, [k], "42501");
  check("M18 önbellek: anahtar tekil (23505), 64 hex biçimi, tür CHECK, service_role güncelleyemez", cdup.ok && cbad.ok && ckind.ok && cupd.ok, [cdup.got, cbad.got, ckind.got, cupd.got].join(" | "));
  await admin.query("COMMIT");

  await admin.query("BEGIN");
  const supSnap = await expectErr(admin, `UPDATE ${T} SET result_snapshot = '{"x":1}'::jsonb WHERE id = $1`, [id], "P0001", /ASTRO_SKY_EPHEMERIS_IMMUTABLE/);
  const supKind = await expectErr(admin, `UPDATE ${T} SET year = 2027 WHERE id = $1`, [id], "P0001", /ASTRO_SKY_EPHEMERIS_IMMUTABLE/);
  const supOwner = await expectErr(admin, `UPDATE ${T} SET owner_user_id = $2 WHERE id = $1`, [id, U2], "P0001", /ASTRO_SKY_EPHEMERIS_IMMUTABLE/);
  await admin.query("COMMIT");
  check("M19 değişmezlik tetikleyicisi: süper kullanıcı da sonuç / dönem / sahip değiştiremez", supSnap.ok && supKind.ok && supOwner.ok, [supSnap.got, supKind.got, supOwner.got].join(" | "));

  // ── Tavan: 3000, 40 eşzamanlı bağlantı ──
  const have = Number((await admin.query(`SELECT count(*) n FROM ${T} WHERE tenant_id=$1 AND owner_user_id=$2`, [TA, U])).rows[0].n);
  await admin.query(
    `INSERT INTO ${T} ${COLS} SELECT $1,$2,'T'||g,'western',2026,11,'tropical',NULL,'12:00 UTC','/astrology/planets/monthly','monthly-ephemeris-1','v2@2.0.0','m',1,'{}'::jsonb,gen_random_uuid() FROM generate_series(1, $3::int) g`,
    [TA, U, 2999 - have],
  );
  const conns = [];
  for (let i = 0; i < N; i++) {
    const c = client();
    await c.connect();
    await c.query("SET ROLE service_role; SET statement_timeout = '30s'; SET lock_timeout = '30s'");
    conns.push(c);
  }
  await Promise.all(conns.map((c) => c.query("BEGIN")));
  const res = await Promise.allSettled(conns.map((c) => c.query(INS, row()).then(() => c.query("COMMIT")).catch(async (e) => {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  })));
  await Promise.all(conns.map((c) => c.end().catch(() => {})));
  conns.forEach((c) => opened.delete(c));
  const okN = res.filter((r) => r.status === "fulfilled").length;
  const capN = res.filter((r) => r.status === "rejected" && /ASTRO_RECORD_CAP:astro_sky_monthly_ephemeris:3000/.test(String(r.reason?.message))).length;
  const total = Number((await admin.query(`SELECT count(*) n FROM ${T} WHERE tenant_id=$1 AND owner_user_id=$2`, [TA, U])).rows[0].n);
  check(`M20 tavan−1'de ${N} eşzamanlı bağlantı → tam 1 başarı, tavan aşılmaz`, okN === 1 && capN === N - 1 && total === 3000, `başarılı ${okN}, tavan reddi ${capN}, son sayı ${total}`);
  await admin.query("BEGIN");
  await admin.query("SET LOCAL ROLE service_role");
  const o2 = await admin.query(INS, row({ owner: U2 }));
  await admin.query("COMMIT");
  check("M21 başka uzman tavandan etkilenmez", o2.rowCount === 1);

  // ── Hesap temizleme provası (admin_purge_archived_expert keşif kuralı: public, tenant_id uuid) ──
  const disc = await admin.query(`SELECT cl.relname FROM pg_class cl JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
     WHERE ns.nspname = 'public' AND cl.relkind IN ('r','p') AND NOT cl.relispartition AND a.atttypid = 'uuid'::regtype AND cl.relname IN ('astro_sky_monthly_ephemeris','astro_sky_monthly_cache') ORDER BY 1`);
  check("M22 temizleme keşfi kayıt tablosunu kapsar; tenant'sız önbellek (kişisel veri yok) kapsam dışı", disc.rowCount === 1 && disc.rows[0].relname === "astro_sky_monthly_ephemeris");
  await admin.query("BEGIN");
  await admin.query(`INSERT INTO ${T} ${COLS} VALUES ($1,$2,'B tenant','western',2026,11,'tropical',NULL,'12:00 UTC','/x','a','v','m',1,'{}'::jsonb,gen_random_uuid())`, [TB, U2]);
  const otherBefore = Number((await admin.query(`SELECT count(*) n FROM ${T} WHERE tenant_id <> $1`, [TA])).rows[0].n);
  await admin.query(`DELETE FROM ${T} WHERE tenant_id = $1`, [TA]);
  const leftA = Number((await admin.query(`SELECT count(*) n FROM ${T} WHERE tenant_id = $1`, [TA])).rows[0].n);
  const otherAfter = Number((await admin.query(`SELECT count(*) n FROM ${T} WHERE tenant_id <> $1`, [TA])).rows[0].n);
  await admin.query("ROLLBACK");
  check("M23 tenant silme döngüsü: A tenant'ında kayıt kalmaz, B etkilenmez (sentetik, geri alındı)", leftA === 0 && otherAfter === otherBefore && otherBefore >= 1, `A kalan ${leftA}, B önce ${otherBefore} sonra ${otherAfter}`);
  await admin.end();

  // ── BAŞARISIZ MIGRATION senaryoları (ayrı, boş veritabanları): dosya tek BEGIN…COMMIT → yarıda kalırsa HİÇBİR nesne kalmaz;
  //    mevcut kullanıcı tabloları ve satırları etkilenmez.
  const fresh = async (name) => {
    await (async () => {
      const a = client();
      await a.connect();
      await a.query(`CREATE DATABASE ${name}`);
      await a.end();
    })();
    const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: name });
    c.on("error", () => {});
    opened.add(c);
    await c.connect();
    await c.query(BOOT);
    return c;
  };
  const leftovers = async (c) =>
    (await c.query(`SELECT count(*)::int n FROM pg_class WHERE relname LIKE 'astro_sky_monthly%' OR relname LIKE 'astro_sm%_idx'`)).rows[0].n +
    (await c.query(`SELECT count(*)::int n FROM pg_proc WHERE proname = 'astro_sky_monthly_ephemeris_guard'`)).rows[0].n;
  // (a) Ön koşul eksik: astroloji temel migration'ları (tavan fonksiyonu astro_enforce_record_cap) uygulanmamış → tetikleyici kurulamaz.
  {
    const c = await fresh("mig_fail_a");
    await c.query("CREATE TABLE public.kullanici_verisi (id int PRIMARY KEY, ad text); INSERT INTO public.kullanici_verisi VALUES (1,'sentetik-ğüşİ')");
    let err = "";
    try {
      await c.query(sql);
    } catch (e) {
      err = `${e.code} ${String(e.message).slice(0, 80)}`;
      await c.query("ROLLBACK").catch(() => {});
    }
    const left = await leftovers(c);
    const user = (await c.query("SELECT ad FROM public.kullanici_verisi WHERE id = 1")).rows[0]?.ad;
    await c.end();
    opened.delete(c);
    check("M24 başarısız migration (ön koşul fonksiyonu yok) → hata + TAM geri alma: yeni tablo/indeks/fonksiyon kalmaz; mevcut kullanıcı verisi aynen", !!err && left === 0 && user === "sentetik-ğüşİ", `${err} | kalan nesne ${left}`);
  }
  // (b) Aynı adlı UYUMSUZ tablo önceden var (CREATE TABLE IF NOT EXISTS atlanır) → sonraki adım hata verir; eski tablo ve satırı korunur.
  {
    const c = await fresh("mig_fail_b");
    for (const f of BASE) await c.query(fs.readFileSync(f, "utf8"));
    await c.query("CREATE TABLE public.astro_sky_monthly_cache (cache_key text PRIMARY KEY, x int); INSERT INTO public.astro_sky_monthly_cache VALUES ('eski', 7)");
    let err = "";
    try {
      await c.query(sql);
    } catch (e) {
      err = `${e.code} ${String(e.message).slice(0, 80)}`;
      await c.query("ROLLBACK").catch(() => {});
    }
    const kept = (await c.query("SELECT x FROM public.astro_sky_monthly_cache WHERE cache_key = 'eski'")).rows[0]?.x;
    const eph = (await c.query("SELECT to_regclass('public.astro_sky_monthly_ephemeris') r")).rows[0].r;
    await c.end();
    opened.delete(c);
    check("M25 başarısız migration (uyumsuz aynı adlı tablo) → hata; kayıt tablosu oluşmaz; mevcut tablo + satır değişmeden kalır", !!err && kept === 7 && eph === null, `${err} | eski x=${kept}, kayıt tablosu ${eph}`);
  }
} catch (e) {
  fail++;
  console.log(`FAIL monthly-ephemeris: beklenmeyen hata — ${String(e?.message ?? e).slice(0, 300)}`);
} finally {
  await Promise.all([...opened].map((c) => Promise.race([c.end().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])));
  await server.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(`\nastrology monthly-ephemeris (PostgreSQL) harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
