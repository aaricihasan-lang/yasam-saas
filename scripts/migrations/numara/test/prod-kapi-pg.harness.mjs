// PRODUCTION UYGULAMA KAPISI — İZOLE PostgreSQL (embedded) + gerçek git defteri. Production / uzak DB YOK; sentetik nesneler.
// Kapsam: mutlu yol · production geçmişi ayırmadan SONRA değişti (YSM01, DDL çalışmaz) · aynı sürüme eşzamanlı iki uygulama
// (tam biri) · farklı sürümler danışma kilidiyle SIRAYA girer · DDL hatası → geçmiş kaydı da yok · içerik / bağlama / iptal /
// proje / işlem-dışı komut kapıları.
// Çalıştırma: node scripts/migrations/numara/test/prod-kapi-pg.harness.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { ayir, blobIcerik, git, okuUzak, olayEkle, ayristir, durum } from "../defter.mjs";
import { hazirla, korumaliSql, uygula } from "../prod-kapi.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "cli.mjs");
const KOK = fs.mkdtempSync(path.join(os.tmpdir(), "mig-numara-pg-"));
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); };
const sh = (cwd, ...a) => git(cwd, a);
const yaz = (d, f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
const PROJE = "wctopfooajbpupeyukpd";

// ── Git: ana dal + defter + ayırmalar + PR dalı (migration'lar commit edilmiş ve 'bagla' ile SHA'ları işlenmiş).
const UZAK = path.join(KOK, "uzak.git");
spawnSync("git", ["init", "--quiet", "--bare", "-b", "main", UZAK]);
const K = path.join(KOK, "k");
spawnSync("git", ["clone", "--quiet", UZAK, K]);
sh(K, "config", "user.name", "pg");
sh(K, "config", "user.email", "p@t");
yaz(K, "supabase/migrations/20280128000000_astro_analysis_result_parts.sql", "BEGIN;\nCOMMIT;\n");
sh(K, "add", "-A"); sh(K, "commit", "-q", "-m", "ana"); sh(K, "push", "-q", "origin", "main");
spawnSync(process.execPath, [CLI, "tohumla"], { cwd: K });
const R = {};
for (const ad of ["mutlu", "prod_degisti", "yaris_a", "seri_a", "seri_b", "ddl_hata", "icerik", "baglanmamis", "iptal", "es_zamanli_ek"]) R[ad] = ayir(K, { modul: "pg-test", ad, dal: "work/pg", refs: ["origin/main"] });
const govde = {
  mutlu: "CREATE TABLE public.t_mutlu (id int PRIMARY KEY);",
  prod_degisti: "CREATE TABLE public.t_prod_degisti (id int);",
  yaris_a: "CREATE TABLE public.t_yaris_a (id int);",
  seri_a: "CREATE TABLE public.t_seri_a (id int);\nSELECT pg_sleep(1.5);",
  seri_b: "CREATE TABLE public.t_seri_b (id int);",
  ddl_hata: "CREATE TABLE public.t_ddl_hata (id int);\nALTER TABLE public.yok_boyle_tablo ADD COLUMN x int;",
  icerik: "CREATE TABLE public.t_icerik (id int);",
  baglanmamis: "CREATE TABLE public.t_baglanmamis (id int);",
  iptal: "CREATE TABLE public.t_iptal (id int);",
  es_zamanli_ek: "CREATE INDEX CONCURRENTLY t_idx ON public.t_mutlu (id);",
};
for (const [ad, g] of Object.entries(govde)) yaz(K, `supabase/migrations/${R[ad].dosya}`, `-- ${ad}\nBEGIN;\n${g}\nCOMMIT;\n`);
sh(K, "add", "-A"); sh(K, "commit", "-q", "-m", "pr");
for (const ad of Object.keys(govde)) if (ad !== "baglanmamis") olayEkle(K, { olay: "bagla", surum: R[ad].surum, dosya: R[ad].dosya, sha256: blobIcerik(K, "HEAD", R[ad].dosya).sha256 });
olayEkle(K, { olay: "iptal", surum: R.iptal.surum, neden: "test" });
// İçerik kapısı: bağlandıktan SONRA dosya değiştirilip commit edildi.
fs.appendFileSync(path.join(K, "supabase/migrations", R.icerik.dosya), "-- sonradan\n");
sh(K, "commit", "-qam", "icerik-degisti");

// ── İzole PostgreSQL
async function freePort() {
  for (let i = 0; i < 50; i++) {
    const p = 56000 + Math.floor(Math.random() * 2500);
    if (await new Promise((res) => { const s = net.createServer(); s.once("error", () => res(false)); s.listen(p, "127.0.0.1", () => s.close(() => res(true))); })) return p;
  }
  throw new Error("boş port yok");
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mig-numara-pgdb-")); fs.rmSync(dir, { recursive: true, force: true });
const port = await freePort();
const srv = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog() {}, onError() {} });
const conns = [];
const baglan = async () => { const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: "postgres" }); c.on("error", () => {}); await c.connect(); conns.push(c); return c; };
await srv.initialise(); await srv.start();
try {
  const a = await baglan();
  await a.query("CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text, created_by text, idempotency_key text, rollback text[]);");
  const varMi = async (t) => (await a.query("SELECT to_regclass($1) r", [`public.${t}`])).rows[0].r !== null;
  const gecmis = async (v) => (await a.query("SELECT count(*)::int n FROM supabase_migrations.schema_migrations WHERE version=$1", [v])).rows[0].n;
  // Gerçek uygulayıcı (psql -v ON_ERROR_STOP=1) hata anında oturumu kapatır → açık işlem geri alınır; pg istemcisinde bunu ROLLBACK taklit eder.
  const calistirIle = (c) => async (sql) => { try { await c.query(sql); } catch (err) { await c.query("ROLLBACK").catch(() => {}); throw err; } };
  const hata = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

  // 1) Mutlu yol
  const u = await uygula({ root: K, surum: R.mutlu.surum, beklenenProje: PROJE, gercekProje: PROJE, calistir: calistirIle(a), createdBy: "test" });
  const st1 = durum(ayristir(okuUzak(K).text)).get(R.mutlu.surum);
  ok("mutlu yol: DDL + geçmiş kaydı aynı işlemde; defter 'uygulandi' + SHA", (await varMi("t_mutlu")) && (await gecmis(R.mutlu.surum)) === 1 && st1.durum === "uygulandi" && st1.sha256 === u.sha256);
  // 1b) Aynı sürüm tekrar: defter kapısı
  let e = await hata(() => uygula({ root: K, surum: R.mutlu.surum, beklenenProje: PROJE, gercekProje: PROJE, calistir: calistirIle(a), createdBy: "test" }));
  ok("aynı sürüm ikinci kez → defter kapısı RED (UYGULANMIS); DB'ye gidilmez", e?.kod === "UYGULANMIS");

  // 2) Production geçmişi ayırmadan SONRA değişti (başka işlem bu sürümü yazdı) → YSM01, DDL çalışmaz, geçmiş değişmez.
  await a.query("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ($1,'baska_is')", [R.prod_degisti.surum]);
  e = await hata(() => uygula({ root: K, surum: R.prod_degisti.surum, beklenenProje: PROJE, gercekProje: PROJE, calistir: calistirIle(a), createdBy: "test" }));
  const ad2 = (await a.query("SELECT name FROM supabase_migrations.schema_migrations WHERE version=$1", [R.prod_degisti.surum])).rows[0].name;
  ok("production geçmişi sonradan doldu → YSM01 MIGRATION_SURUM_DOLU; tablo OLUŞMADI; geçmiş kaydı başkasınınki olarak kaldı; defter 'uygulandi' YAZILMADI", e?.code === "YSM01" && !(await varMi("t_prod_degisti")) && ad2 === "baska_is" && durum(ayristir(okuUzak(K).text)).get(R.prod_degisti.surum).durum !== "uygulandi", e?.message);

  // 3) Aynı sürüme EŞZAMANLI iki uygulama (iki ayrı bağlantı; ikinci, farklı içerikle aynı numarayı kullanmaya çalışan bir iş)
  const p = hazirla({ root: K, surum: R.yaris_a.surum, defterText: okuUzak(K).text, beklenenProje: PROJE, gercekProje: PROJE });
  const rakip = { ...p, ad: "rakip_is", ic: "\nCREATE TABLE public.t_yaris_rakip (id int);\n" };
  const [c1, c2] = [await baglan(), await baglan()];
  const sonuc = await Promise.allSettled([calistirIle(c1)(korumaliSql(p, { createdBy: "a" })), calistirIle(c2)(korumaliSql(rakip, { createdBy: "b" }))]);
  const basari = sonuc.filter((s) => s.status === "fulfilled").length;
  const red = sonuc.find((s) => s.status === "rejected")?.reason;
  const t1 = await varMi("t_yaris_a"), t2 = await varMi("t_yaris_rakip");
  ok("aynı sürüme eşzamanlı iki uygulama → TAM BİRİ başarılı; diğeri kilit sonrası YSM01; yalnız kazananın tablosu var; geçmişte 1 satır", basari === 1 && red?.code === "YSM01" && (t1 !== t2) && (await gecmis(R.yaris_a.surum)) === 1, red?.message);

  // 4) Farklı sürümler eşzamanlı: danışma kilidi → SIRAYLA (A uyurken B bekler), ikisi de başarılı.
  const pa = hazirla({ root: K, surum: R.seri_a.surum, defterText: okuUzak(K).text, beklenenProje: PROJE, gercekProje: PROJE });
  const pb = hazirla({ root: K, surum: R.seri_b.surum, defterText: okuUzak(K).text, beklenenProje: PROJE, gercekProje: PROJE });
  const [d1, d2] = [await baglan(), await baglan()];
  const zaman = {};
  const t0 = Date.now();
  await Promise.all([
    d1.query(korumaliSql(pa, { createdBy: "a" })).then(() => (zaman.a = Date.now() - t0)),
    new Promise((r) => setTimeout(r, 200)).then(() => d2.query(korumaliSql(pb, { createdBy: "b" }))).then(() => (zaman.b = Date.now() - t0)),
  ]);
  ok("farklı sürümler eşzamanlı → danışma kilidiyle SIRAYA girdi (B, A'nın 1,5 sn'lik işlemi bitmeden bitmedi); ikisi de uygulandı", zaman.b >= zaman.a && zaman.b >= 1400 && (await gecmis(R.seri_a.surum)) === 1 && (await gecmis(R.seri_b.surum)) === 1, JSON.stringify(zaman));

  // 5) DDL ortasında hata → işlemin tamamı geri alınır: tablo yok, geçmiş kaydı yok, defter 'uygulandi' yok.
  e = await hata(() => uygula({ root: K, surum: R.ddl_hata.surum, beklenenProje: PROJE, gercekProje: PROJE, calistir: calistirIle(a), createdBy: "test" }));
  ok("DDL hatası → hiçbir iz yok (tablo / geçmiş / defter)", !!e && !(await varMi("t_ddl_hata")) && (await gecmis(R.ddl_hata.surum)) === 0 && durum(ayristir(okuUzak(K).text)).get(R.ddl_hata.surum).durum !== "uygulandi", e?.message?.slice(0, 80));

  // 6) Kapılar (DB'ye gidilmeden)
  const kapiKodu = async (surum, ek = {}) => (await hata(() => uygula({ root: K, surum, beklenenProje: PROJE, gercekProje: PROJE, calistir: calistirIle(a), createdBy: "t", ...ek })))?.kod;
  ok("içerik PR'a bağlanan sürümden farklı → ICERIK", (await kapiKodu(R.icerik.surum)) === "ICERIK");
  ok("PR'a bağlanmamış (SHA yok) → BAGLANMAMIS", (await kapiKodu(R.baglanmamis.surum)) === "BAGLANMAMIS");
  ok("iptal edilmiş numara → IPTAL", (await kapiKodu(R.iptal.surum)) === "IPTAL");
  ok("yanlış Supabase projesi → PROJE", (await kapiKodu(R.seri_b.surum, { gercekProje: "baskaprojeref00000000" })) === "PROJE");
  ok("işlem içinde çalışamayan komut (CREATE INDEX CONCURRENTLY) → ISLEM_DISI (tek-işlem garantisi verilemez)", (await kapiKodu(R.es_zamanli_ek.surum)) === "ISLEM_DISI");
  ok("defterde ayrılmamış sürüm → AYIRMA", (await kapiKodu("20990101000000")) === "AYIRMA");
} catch (err) {
  fail++;
  console.log(`FAIL beklenmeyen hata: ${err.stack?.split("\n").slice(0, 4).join(" | ")}`);
} finally {
  await Promise.all(conns.map((c) => c.end().catch(() => {})));
  await srv.stop();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(KOK, { recursive: true, force: true });
}
console.log(`\nmigration-numara prod-kapısı (PostgreSQL) harness: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
