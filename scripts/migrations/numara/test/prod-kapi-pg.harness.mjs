// PRODUCTION UYGULAMA KAPISI — İZOLE PostgreSQL (embedded) + gerçek git defteri. Production / uzak DB YOK; sentetik nesneler.
// Kapsam: mutlu yol (Supabase schema_migrations biçimi) · tekrar uygulama · production geçmişi sonradan doldu (YSM01, DDL
// çalışmaz) · aynı sürüme eşzamanlı iki uygulama (tam biri) · farklı sürümler danışma kilidiyle SIRAYA · DDL hatası → tam geri
// alma · şema ön koşulu (YSM02) · DB COMMIT oldu + defter yazılamadı → uzlaştırma · kapı dışı production sürümü (UZLASMA) ·
// bozuk / kötü niyetli SQL · içerik / bağlama / iptal / proje kapıları · uygula-prod.mjs CLI (kuru çalıştırma + --uygula + DSN koruması).
// Çalıştırma: node scripts/migrations/numara/test/prod-kapi-pg.harness.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { ayir, blobIcerik, git, okuUzak, olayEkle, ayristir, durum, DEFAULTS } from "../defter.mjs";
import { GECMIS_SQL, hazirla, korumaliSql, prodSatirlari, uygula, uzlastir, IMZA_RE } from "../prod-kapi.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "..", "cli.mjs");
const UYGULA_CLI = path.resolve(HERE, "..", "uygula-prod.mjs");
const KOK = fs.mkdtempSync(path.join(os.tmpdir(), "mig-numara-pg-"));
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}${x ? ` — ${x}` : ""}`); };
const sh = (cwd, ...a) => git(cwd, a);
const yaz = (d, f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
const PROJE = "wctopfooajbpupeyukpd";

// ── Git: ana dal + tohumlu defter + ayırmalar + PR dalı (migration'lar commit edilmiş ve PR'a bağlanmış).
const UZAK = path.join(KOK, "sahip", "yasam.git");
fs.mkdirSync(path.dirname(UZAK), { recursive: true });
spawnSync("git", ["init", "--quiet", "--bare", "-b", "main", UZAK]);
const K = path.join(KOK, "k");
spawnSync("git", ["clone", "--quiet", UZAK, K]);
sh(K, "config", "user.name", "pg"); sh(K, "config", "user.email", "p@t");
yaz(K, "supabase/migrations/20280128000000_astro_analysis_result_parts.sql", "BEGIN;\nCOMMIT;\n");
sh(K, "add", "-A"); sh(K, "commit", "-q", "-m", "ana"); sh(K, "push", "-q", "origin", "main");
fs.writeFileSync(path.join(KOK, "prod.txt"), "20280128000000|astro_analysis_result_parts\n");
spawnSync(process.execPath, [CLI, "tohumla", "--prod-gecmis", path.join(KOK, "prod.txt")], { cwd: K });
sh(K, "checkout", "-q", "-b", "work/pg");
const govde = {
  mutlu: "CREATE TABLE public.t_mutlu (id int PRIMARY KEY);",
  prod_degisti: "CREATE TABLE public.t_prod_degisti (id int);",
  yaris_a: "CREATE TABLE public.t_yaris_a (id int);",
  seri_a: "CREATE TABLE public.t_seri_a (id int);\nSELECT pg_sleep(1.5);",
  seri_b: "CREATE TABLE public.t_seri_b (id int);",
  ddl_hata: "CREATE TABLE public.t_ddl_hata (id int);\nALTER TABLE public.yok_boyle_tablo ADD COLUMN x int;",
  onkosul_yok: "ALTER TABLE public.t_hic_yok ADD COLUMN y int;\nCREATE TABLE public.t_onkosul_yan (id int);",
  onkosul_var: "ALTER TABLE public.t_mutlu ADD COLUMN y int;",
  defter_kopuk: "CREATE TABLE public.t_defter_kopuk (id int);",
  icerik: "CREATE TABLE public.t_icerik (id int);",
  baglanmamis: "CREATE TABLE public.t_baglanmamis (id int);",
  iptal: "CREATE TABLE public.t_iptal (id int);",
  es_zamanli_ek: "CREATE INDEX CONCURRENTLY t_idx ON public.t_mutlu (id);",
  kucuk_commit: "CREATE TABLE public.t_kucuk_a (id int);\ncommit;\nCREATE TABLE public.t_kucuk_b (id int);",
  rollback_ici: "CREATE TABLE public.t_rb (id int);\nROLLBACK;\nBEGIN;\nDROP TABLE public.t_mutlu;",
  dolar_ici: "CREATE FUNCTION public.f_dolar() RETURNS int LANGUAGE plpgsql AS $f$\nBEGIN\n  RETURN 1; -- COMMIT; burada zararsız\nEND;\n$f$;",
  cli_kuru: "CREATE TABLE public.t_cli (id int);",
};
const onkosul = { onkosul_yok: "-- onkosul: to_regclass('public.t_hic_yok') IS NOT NULL\n", onkosul_var: "-- onkosul: to_regclass('public.t_mutlu') IS NOT NULL\n" };
const R = {};
for (const ad of Object.keys(govde)) R[ad] = ayir(K, { modul: "pg-test", ad, dal: "work/pg", refs: ["origin/main"] });
for (const [ad, g] of Object.entries(govde)) yaz(K, `supabase/migrations/${R[ad].dosya}`, `-- ${ad}\n${onkosul[ad] ?? ""}BEGIN;\n${g}\nCOMMIT;\n`);
// Sonrası artık: COMMIT'ten sonra deyim (malformed) — ayrı ayırma.
R.sonrasi = ayir(K, { modul: "pg-test", ad: "sonrasi", dal: "work/pg", refs: ["origin/main"] });
yaz(K, `supabase/migrations/${R.sonrasi.dosya}`, "BEGIN;\nCREATE TABLE public.t_sonrasi (id int);\nCOMMIT;\nDROP TABLE public.t_mutlu;\n");
sh(K, "add", "-A"); sh(K, "commit", "-q", "-m", "pr");
const bagla = (ad) => olayEkle(K, { olay: "bagla", surum: R[ad].surum, pr: 900, dal: "work/pg", depo: "sahip/yasam", sha256: blobIcerik(K, "HEAD", R[ad].dosya).sha256, commit: sh(K, "rev-parse", "HEAD").out.trim() });
for (const ad of Object.keys(R)) if (ad !== "baglanmamis") bagla(ad);
olayEkle(K, { olay: "iptal", surum: R.iptal.surum, neden: "test" });
fs.appendFileSync(path.join(K, "supabase/migrations", R.icerik.dosya), "-- sonradan\n"); // bağlandıktan SONRA değişti
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
  // Supabase CLI'nin production'daki tablo biçimi (PG 17.6 prod ile aynı sütunlar).
  await a.query("CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text, created_by text, idempotency_key text UNIQUE, rollback text[]);");
  await a.query("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20280128000000','astro_analysis_result_parts')");
  const varMi = async (t) => (await a.query("SELECT to_regclass($1) r", [`public.${t}`])).rows[0].r !== null;
  const gecmis = async (v) => (await a.query("SELECT count(*)::int n FROM supabase_migrations.schema_migrations WHERE version=$1", [v])).rows[0].n;
  const prodGecmis = async () => prodSatirlari((await a.query(GECMIS_SQL)).rows.map((r) => r.s).join("\n"));
  const YEREL = { rev: "HEAD", anaRef: "HEAD" }; // izole test: PR dalı "ana dal" yerine geçer (production'da origin/main zorunlu)
  // Gerçek uygulayıcı (psql -v ON_ERROR_STOP=1) hata anında oturumu kapatır → açık işlem geri alınır; pg istemcisinde bunu ROLLBACK taklit eder.
  const calistirIle = (c) => async (sql) => { try { await c.query(sql); } catch (err) { await c.query("ROLLBACK").catch(() => {}); throw err; } };
  const hata = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const durumu = (v) => durum(ayristir(okuUzak(K).text)).get(v);
  const uyg = async (ad, ek = {}) => uygula({ root: K, surum: R[ad].surum, beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: await prodGecmis(), calistir: calistirIle(a), ...YEREL, ...ek });

  // 1) Mutlu yol + Supabase biçimi
  const u = await uyg("mutlu");
  const satir = (await a.query("SELECT * FROM supabase_migrations.schema_migrations WHERE version=$1", [R.mutlu.surum])).rows[0];
  ok("mutlu yol: DDL + geçmiş kaydı aynı işlemde; defter 'uygulandi' + SHA + proje", (await varMi("t_mutlu")) && (await gecmis(R.mutlu.surum)) === 1 && durumu(R.mutlu.surum).durum === "uygulandi" && durumu(R.mutlu.surum).sha256 === u.sha256 && durumu(R.mutlu.surum).proje === PROJE);
  ok("Supabase schema_migrations biçimi: version + name (dosya adından) + statements = dosyanın tam metni + created_by imzası (PR + SHA-256)", satir.name === "mutlu" && satir.statements.length === 1 && satir.statements[0] === fs.readFileSync(path.join(K, "supabase/migrations", R.mutlu.dosya), "utf8") && IMZA_RE.exec(satir.created_by)?.[2] === u.sha256 && IMZA_RE.exec(satir.created_by)?.[1] === "900");
  let e = await hata(() => uyg("mutlu"));
  ok("aynı sürüm ikinci kez → RED (UYGULANMIS); DB'ye gidilmez", e?.kod === "UYGULANMIS");

  // 2) Production geçmişi kapı okumasından SONRA doldu (yarış) → işlem içi YSM01, DDL çalışmaz.
  const eskiGecmis = await prodGecmis();
  await a.query("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ($1,'baska_is')", [R.prod_degisti.surum]);
  e = await hata(() => uygula({ root: K, surum: R.prod_degisti.surum, beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: eskiGecmis, calistir: calistirIle(a), ...YEREL }));
  const ad2 = (await a.query("SELECT name FROM supabase_migrations.schema_migrations WHERE version=$1", [R.prod_degisti.surum])).rows[0].name;
  ok("geçmiş okumadan sonra doldu → işlem içi YSM01; tablo OLUŞMADI; başkasının kaydı korundu; defter 'uygulandi' YAZILMADI", e?.code === "YSM01" && !(await varMi("t_prod_degisti")) && ad2 === "baska_is" && durumu(R.prod_degisti.surum).durum !== "uygulandi", e?.message);
  await a.query("DELETE FROM supabase_migrations.schema_migrations WHERE version=$1", [R.prod_degisti.surum]); // izole test: sentetik satır geri alındı
  await a.query("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('20280128000050','kapi_disi_uygulama')");
  e = await hata(() => uyg("seri_b"));
  ok("production'da defterin bilmediği sürüm (kapı dışı uygulama) varken → UZLASMA, uygulama YOK", e?.kod === "UZLASMA" && !(await varMi("t_seri_b")), e?.message?.slice(0, 120));
  const uzSorun = uzlastir({ root: K, prodGecmis: await prodGecmis(), beklenenProje: PROJE });
  ok("uzlaştırma kapı dışı sürümü SORUN olarak raporlar, otomatik düzeltmez", uzSorun.sorun.some((x) => x.startsWith("20280128000050")) && uzSorun.tamamlanan.length === 0);
  await a.query("DELETE FROM supabase_migrations.schema_migrations WHERE version='20280128000050'");
  e = await hata(() => uygula({ root: K, surum: R.seri_b.surum, beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: [], calistir: calistirIle(a), ...YEREL }));
  ok("güncel production geçmişi okunmadan → PROD_OKUNMADI", e?.kod === "PROD_OKUNMADI");
  e = await hata(async () => uygula({ root: K, surum: R.seri_b.surum, beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: await prodGecmis(), calistir: calistirIle(a), rev: "HEAD" }));
  ok("varsayılan: SQL ana dala (origin/main) merge edilmemişse → MAIN_DEGIL (incelenmemiş dal SQL'i uygulanmaz)", e?.kod === "MAIN_DEGIL" && !(await varMi("t_seri_b")));

  // 3) Aynı sürüme EŞZAMANLI iki uygulama (ikinci: farklı içerikle aynı numarayı kullanmaya çalışan iş).
  const gecOnce = await prodGecmis(); // test 4 bu görüntüyü kullanır (test 3'ün doğrudan uygulaması deftere yazılmaz)
  const p = hazirla({ root: K, surum: R.yaris_a.surum, defterText: okuUzak(K).text, beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: await prodGecmis(), ...YEREL });
  const rakip = { ...p, ad: "rakip_is", ic: "\nCREATE TABLE public.t_yaris_rakip (id int);\n", sql: "-- rakip metni\n" };
  const [c1, c2] = [await baglan(), await baglan()];
  const sonuc = await Promise.allSettled([calistirIle(c1)(korumaliSql(p)), calistirIle(c2)(korumaliSql(rakip))]);
  const red = sonuc.find((s) => s.status === "rejected")?.reason;
  const t1 = await varMi("t_yaris_a"), t2 = await varMi("t_yaris_rakip");
  ok("aynı sürüme eşzamanlı iki uygulama → TAM BİRİ; diğeri kilit sonrası YSM01; tek tablo; geçmişte 1 satır", sonuc.filter((s) => s.status === "fulfilled").length === 1 && red?.code === "YSM01" && t1 !== t2 && (await gecmis(R.yaris_a.surum)) === 1, red?.message);

  // 4) Farklı sürümler eşzamanlı → danışma kilidi ile SIRAYLA.
  const gec = gecOnce;
  const pa = hazirla({ root: K, surum: R.seri_a.surum, defterText: okuUzak(K).text, beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: gec, ...YEREL });
  const pb = hazirla({ root: K, surum: R.seri_b.surum, defterText: okuUzak(K).text, beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: gec, ...YEREL });
  const [d1, d2] = [await baglan(), await baglan()];
  const zaman = {};
  const t0 = Date.now();
  await Promise.all([
    d1.query(korumaliSql(pa)).then(() => (zaman.a = Date.now() - t0)),
    new Promise((r) => setTimeout(r, 200)).then(() => d2.query(korumaliSql(pb))).then(() => (zaman.b = Date.now() - t0)),
  ]);
  ok("farklı sürümler eşzamanlı → danışma kilidiyle SIRAYA (B, A'nın 1,5 sn'lik işlemi bitmeden bitmedi); ikisi de uygulandı", zaman.b >= zaman.a && zaman.b >= 1400 && (await gecmis(R.seri_a.surum)) === 1 && (await gecmis(R.seri_b.surum)) === 1, JSON.stringify(zaman));

  // 4b) Doğrudan korumalı SQL ile uygulananlar deftere yazılmadı → kapı bir sonraki uygulamayı UZLASMA ile durdurur; uzlaştırma
  //     yalnız imzası + KAYITLI METNİ bağlı SHA ile eşleşenleri tamamlar (rakip kazandıysa onun kaydı içerik uyuşmazlığıyla SORUN).
  e = await hata(() => uyg("ddl_hata"));
  ok("deftere yazılmamış production uygulaması varken → UZLASMA ('pr' durumundaki sürüm production'da)", e?.kod === "UZLASMA");
  let uz = uzlastir({ root: K, prodGecmis: await prodGecmis(), beklenenProje: PROJE });
  const bekUz = [R.seri_a, R.seri_b, ...(t1 ? [R.yaris_a] : [])].map((x) => x.surum).sort().join(",");
  ok("uzlaştırma: imza + kayıtlı metin SHA'sı eşleşenler 'uygula'ya tamamlandı; rakibin (farklı metin) kaydı SORUN", uz.tamamlanan.slice().sort().join(",") === bekUz && uz.sorun.length === (t2 ? 1 : 0), JSON.stringify(uz));
  if (t2) { await a.query("DELETE FROM supabase_migrations.schema_migrations WHERE version=$1", [R.yaris_a.surum]); await a.query("DROP TABLE public.t_yaris_rakip"); } // izole test temizliği
  // Sahte imza (DB'ye yazabilen biri) ama kayıtlı metin farklı → uzlaştırma tamamlamaz.
  await a.query("INSERT INTO supabase_migrations.schema_migrations(version,name,statements,created_by) VALUES ($1,'icerik',ARRAY['sahte metin'],$2)", [R.icerik.surum, `migration-numara pr#900 sha256:${durumu(R.icerik.surum).sha256}`]);
  uz = uzlastir({ root: K, prodGecmis: await prodGecmis(), beklenenProje: PROJE });
  ok("sahte imza + farklı kayıtlı metin → uzlaştırma 'uygula' YAZMAZ, SORUN raporlar", uz.tamamlanan.length === 0 && uz.sorun.some((x) => x.startsWith(R.icerik.surum)) && durumu(R.icerik.surum).durum === "pr");
  await a.query("DELETE FROM supabase_migrations.schema_migrations WHERE version=$1", [R.icerik.surum]);

  // 5) DDL hatası → tam geri alma.
  e = await hata(() => uyg("ddl_hata"));
  ok("DDL ortasında hata → hiçbir iz yok (ilk tablo / geçmiş / defter)", !!e && !(await varMi("t_ddl_hata")) && (await gecmis(R.ddl_hata.surum)) === 0 && durumu(R.ddl_hata.surum).durum !== "uygulandi", e?.message?.slice(0, 80));
  // 6) Şema ön koşulları.
  e = await hata(() => uyg("onkosul_yok"));
  ok("ön koşul sağlanmadı → YSM02; gövde hiç çalışmadı (yan tablo yok)", e?.code === "YSM02" && !(await varMi("t_onkosul_yan")) && (await gecmis(R.onkosul_yok.surum)) === 0, e?.message);
  await uyg("onkosul_var");
  ok("ön koşul sağlandı → uygulandı", (await a.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='t_mutlu' AND column_name='y'")).rows[0].n === 1);
  // 7) DB COMMIT başarılı + defter yazımı başarısız (ağ) → uzlaştırma 'uygula'yı tamamlar; tekrar uygulama engellenir.
  e = await hata(async () => uygula({ root: K, surum: R.defter_kopuk.surum, beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: await prodGecmis(), calistir: calistirIle(a), defterText: okuUzak(K).text, cfg: { ...DEFAULTS, remote: "yok-boyle-uzak" }, ...YEREL }));
  ok("DB commit oldu, defter yazılamadı (AG) → tablo + geçmiş VAR, defter hâlâ 'pr' (atomik olmayan nokta açıkça görünür)", e?.kod === "AG" && (await varMi("t_defter_kopuk")) && (await gecmis(R.defter_kopuk.surum)) === 1 && durumu(R.defter_kopuk.surum).durum === "pr");
  e = await hata(() => uyg("defter_kopuk"));
  ok("bu durumda yeniden uygulama → PROD_DOLU (çift uygulama yok)", e?.kod === "PROD_DOLU");
  uz = uzlastir({ root: K, prodGecmis: await prodGecmis(), beklenenProje: PROJE });
  ok("uzlaştırma: defteri kopan uygulama (imza + kayıtlı metin eşleşti) 'uygula'ya tamamlandı; sorun yok", uz.tamamlanan.join(",") === R.defter_kopuk.surum && durumu(R.defter_kopuk.surum).durum === "uygulandi" && uz.sorun.length === 0, JSON.stringify(uz));
  ok("uzlaştırma tekrar → değişiklik yok (idempotent)", uzlastir({ root: K, prodGecmis: await prodGecmis(), beklenenProje: PROJE }).tamamlanan.length === 0);

  // 8) Kapılar + kötü niyetli / bozuk SQL (DB'ye gidilmeden).
  const kapiKodu = async (ad, ek = {}) => (await hata(() => uyg(ad, ek)))?.kod;
  ok("içerik PR'a bağlanan sürümden farklı → ICERIK", (await kapiKodu("icerik")) === "ICERIK");
  ok("PR'a bağlanmamış → BAGLANMAMIS", (await kapiKodu("baglanmamis")) === "BAGLANMAMIS");
  ok("iptal edilmiş numara → IPTAL", (await kapiKodu("iptal")) === "IPTAL");
  ok("yanlış Supabase projesi → PROJE", (await kapiKodu("cli_kuru", { gercekProje: "baskaprojeref00000000" })) === "PROJE");
  ok("CREATE INDEX CONCURRENTLY → ISLEM_DISI (Owner onaylı ayrı akış)", (await kapiKodu("es_zamanli_ek")) === "ISLEM_DISI");
  ok("küçük harf 'commit;' ile gövdede işlemi bölme girişimi → SQL_ISLEM", (await kapiKodu("kucuk_commit")) === "SQL_ISLEM" && !(await varMi("t_kucuk_a")));
  ok("gövdede ROLLBACK + BEGIN + yıkıcı deyim → SQL_ISLEM; t_mutlu yerinde", (await kapiKodu("rollback_ici")) === "SQL_ISLEM" && (await varMi("t_mutlu")));
  ok("COMMIT'ten sonra deyim → SQL_YAPI", (await kapiKodu("sonrasi")) === "SQL_YAPI" && (await varMi("t_mutlu")));
  await uyg("dolar_ici");
  ok("$f$ gövdesi içindeki 'COMMIT;' metni yanlış alarm vermez → uygulandı", (await a.query("SELECT count(*)::int n FROM pg_proc WHERE proname='f_dolar'")).rows[0].n === 1);
  e = await hata(async () => uygula({ root: K, surum: "20990101000000", beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: await prodGecmis(), calistir: calistirIle(a), ...YEREL }));
  ok("defterde ayrılmamış sürüm → AYIRMA", e?.kod === "AYIRMA");

  // 9) Tek güvenli uygulama yolu: uygula-prod.mjs (izole DSN).
  const dsn = `postgres://postgres:pw@localhost:${port}/postgres`;
  const cli = (...x) => spawnSync(process.execPath, [UYGULA_CLI, ...x, "--ana-ref", "HEAD"], { cwd: K, encoding: "utf8" });
  let c = cli("--surum", R.cli_kuru.surum, "--proje", PROJE, "--dsn", dsn, "--test-proje-kimligi", PROJE);
  ok("uygula-prod.mjs varsayılan KURU ÇALIŞTIRMA: kapılar PASS, veritabanına hiçbir şey yazılmadı", c.status === 0 && /KURU ÇALIŞTIRMA PASS/.test(c.stdout) && !(await varMi("t_cli")) && (await gecmis(R.cli_kuru.surum)) === 0, (c.stdout + c.stderr).trim().slice(0, 200));
  c = cli("--surum", R.cli_kuru.surum, "--proje", PROJE, "--dsn", dsn, "--test-proje-kimligi", "baskaproje");
  ok("uygula-prod.mjs yanlış proje → HATA [PROJE]", c.status === 2 && /PROJE/.test(c.stderr));
  c = cli("--surum", R.cli_kuru.surum, "--proje", PROJE, "--dsn", "postgres://u:p@db.ornek.supabase.co:5432/postgres");
  ok("uygula-prod.mjs --dsn uzak sunucu → RED (production yalnız --conn-mjs ile)", c.status === 2 && /yalnız yerel/.test(c.stderr));
  c = cli("--surum", R.cli_kuru.surum, "--proje", PROJE, "--dsn", dsn, "--test-proje-kimligi", PROJE, "--uygula");
  ok("uygula-prod.mjs --uygula: uygulandı + geçmiş + defter", c.status === 0 && (await varMi("t_cli")) && (await gecmis(R.cli_kuru.surum)) === 1 && durumu(R.cli_kuru.surum).durum === "uygulandi", (c.stdout + c.stderr).trim().slice(0, 200));
  c = cli("--surum", R.cli_kuru.surum, "--proje", PROJE, "--dsn", dsn, "--test-proje-kimligi", PROJE, "--uygula");
  ok("uygula-prod.mjs aynı sürüm tekrar → RED", c.status === 2 && /UYGULANMIS/.test(c.stderr));
  c = cli("uzlastir", "--proje", PROJE, "--dsn", dsn, "--test-proje-kimligi", PROJE);
  ok("uygula-prod.mjs uzlastir: tamamlanacak yok, sorun yok", c.status === 0 && /tamamlanan 0/.test(c.stdout) && /sorun 0/.test(c.stdout), c.stdout.trim());
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
