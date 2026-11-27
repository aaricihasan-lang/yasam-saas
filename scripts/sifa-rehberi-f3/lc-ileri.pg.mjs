// Şifa Rehberi — 20280124 İLERİ YÖNLÜ TELAFİ: gerçek DB-03 defter + gerçek uygulama kapısı (prod-kapi.mjs) + izole PostgreSQL.
// Production / uzak DB / gerçek defter YOK: geçici git deposu (çıplak "uzak" + klon) ve geçici veritabanları; SQL'ler bu deponun
// GERÇEK migration dosyaları. Sınanan: yanlış migration seçimi (20280124 hâlâ RED) · SQL yapısı · sıra (ön koşul YSM02) ·
// SHA-256 (bağlandıktan sonra değişen içerik RED) · tekrar uygulama · eşzamanlı iki uygulama (tam biri) · production'daki gibi
// şemada F3 + YH + ileri migration sonrası şema = taze kurulumun şeması · yayın hazırlık işareti yalnız üç migration tamamken · mevcut kayıtlar korunur · defter tutarlılığı (dogrula).
// Çalıştırma: node scripts/sifa-rehberi-f3/lc-ileri.pg.mjs
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { ayir, blobIcerik, git, okuUzak, olayEkle, ayristir, durum } from "../migrations/numara/defter.mjs";
import { GECMIS_SQL, hazirla, korumaliSql, prodSatirlari, uygula, sqlYapisi } from "../migrations/numara/prod-kapi.mjs";
import { ileriSql, LC_DOSYA } from "./gen-lc-ileri.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CLI = path.resolve(REPO, "scripts/migrations/numara/cli.mjs");
const KOK = fs.mkdtempSync(path.join(os.tmpdir(), "lc-ileri-"));
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) pass++; else fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}${!c && x ? ` — ${String(x).slice(0, 300)}` : ""}`); };
const sh = (cwd, ...a) => git(cwd, a);
const yaz = (d, f, t) => { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), t); };
const blob = (f) => spawnSync("git", ["show", `HEAD:${f}`], { cwd: REPO, encoding: "utf8" }).stdout;
const PROJE = "wctopfooajbpupeyukpd";
const CORE = "supabase/migrations/20280110000000_sifa_rehberi_v2_core.sql";
const F3 = "supabase/migrations/20280130000200_sifa_rehberi_f3.sql";
const YHF3 = "supabase/migrations/20280130000300_yh_sifa_f3_kutu_yayilimi.sql";
const ILERI_DOSYA = "supabase/migrations/20280130000400_sifa_v2_asset_lifecycle_ileri.sql";
// Production'daki YH altyapısı (gerçek migration'lar; ileri migration'ın ön koşulu YH kutu yayılımını ister).
const YH_CORE = ["20260710000000_yasam_hafizasi_index.sql", "20260712000000_yasam_hafizasi_lexical_infra.sql", "20260724000000_yh_search_candidates_rpc.sql",
  "20260815000000_yasam_hafizasi_outbox.sql", "20260901000000_yasam_hafizasi_reconcile_enqueue.sql", "20260927000000_yh_source_activation_control.sql"].map((f) => `supabase/migrations/${f}`);
const YH_SAHIP = "supabase/migrations/20280110000100_yh_owner_scope_sifa_v2.sql";

// ── Git: main = çekirdek + 20280124 (production geçmişinde YALNIZ çekirdek) → tohum; PR dalı F3 + ileri migration.
const UZAK = path.join(KOK, "sahip", "yasam.git");
fs.mkdirSync(path.dirname(UZAK), { recursive: true });
spawnSync("git", ["init", "--quiet", "--bare", "-b", "main", UZAK]);
const K = path.join(KOK, "k");
spawnSync("git", ["clone", "--quiet", UZAK, K]);
sh(K, "config", "user.name", "lc"); sh(K, "config", "user.email", "l@t"); sh(K, "config", "core.autocrlf", "false");
yaz(K, CORE, blob(CORE));
for (const f of [...YH_CORE, YH_SAHIP]) yaz(K, f, blob(f));
yaz(K, LC_DOSYA, blob(LC_DOSYA));
sh(K, "add", "-A"); sh(K, "commit", "-q", "-m", "ana"); sh(K, "push", "-q", "origin", "main");
const PROD_SURUMLER = [CORE, ...YH_CORE, YH_SAHIP].map((f) => { const m = /\/(\d{14})_(.+)\.sql$/.exec(f); return [m[1], m[2]]; });
fs.writeFileSync(path.join(KOK, "prod.txt"), PROD_SURUMLER.map(([v, a]) => `${v}|${a}`).join("\n") + "\n");
const tohum = spawnSync(process.execPath, [CLI, "tohumla", "--prod-gecmis", path.join(KOK, "prod.txt")], { cwd: K, encoding: "utf8" });
const st0 = durum(ayristir(okuUzak(K).text));
ok("tohum: 20280124 'gecmis prod:false', çekirdek 'gecmis prod:true' (production ile aynı tablo)", tohum.status === 0 && st0.get("20280124000000")?.gecmis && st0.get("20280124000000")?.prod === false && st0.get("20280110000000")?.prod === true, tohum.stderr);
sh(K, "checkout", "-q", "-b", "feat/sifa-rehberi-f3");
const RF3 = ayir(K, { modul: "sifa-rehberi", ad: "sifa_rehberi_f3", dal: "feat/sifa-rehberi-f3", refs: ["origin/main"] });
const RYH = ayir(K, { modul: "sifa-rehberi", ad: "yh_sifa_f3_kutu_yayilimi", dal: "feat/sifa-rehberi-f3", refs: ["origin/main"] });
const RIL = ayir(K, { modul: "sifa-rehberi", ad: "sifa_v2_asset_lifecycle_ileri", dal: "feat/sifa-rehberi-f3", refs: ["origin/main"] });
ok("merkezi defter iki YENİ numara verdi; ileri migration F3'ten SONRA sıralanır", Number(RIL.surum) > Number(RF3.surum) && Number(RF3.surum) > 20280124000000, `${RF3.surum} / ${RIL.surum}`);
yaz(K, `supabase/migrations/${RF3.dosya}`, blob(F3));
yaz(K, `supabase/migrations/${RYH.dosya}`, blob(YHF3));
const ILERI = ileriSql(blob(LC_DOSYA), RIL.dosya);
// Depodaki gerçek dosya (20280130000400) üreticinin çıktısıyla birebir (yalnız ilk satırdaki dosya adı farklı olabilir).
const GERCEK = fs.readFileSync(path.join(REPO, ILERI_DOSYA), "utf8").split(String.fromCharCode(13)).join("");
ok("depodaki 20280130000400 dosyası üretici betiğin çıktısıyla BİREBİR (elle değişiklik yok)", GERCEK === ileriSql(blob(LC_DOSYA), "20280130000400_sifa_v2_asset_lifecycle_ileri.sql"));
yaz(K, `supabase/migrations/${RIL.dosya}`, ILERI);
sh(K, "add", "-A"); sh(K, "commit", "-q", "-m", "pr");
const bagla = (r) => olayEkle(K, { olay: "bagla", surum: r.surum, pr: 875, dal: "feat/sifa-rehberi-f3", depo: "sahip/yasam", sha256: blobIcerik(K, "HEAD", r.dosya).sha256, commit: sh(K, "rev-parse", "HEAD").out.trim() });
bagla(RF3); bagla(RYH); bagla(RIL);
// Owner merge'ü (ana dala ileri sarma) — kapı yalnız main'deki SQL'i uygular.
sh(K, "checkout", "-q", "main"); sh(K, "merge", "-q", "--ff-only", "feat/sifa-rehberi-f3"); sh(K, "push", "-q", "origin", "main"); sh(K, "fetch", "-q", "origin");

ok("ileri migration kapının SQL yapı kuralını geçer (BEGIN;…COMMIT;, işlem denetimi yok)", (() => { try { sqlYapisi(ILERI); return true; } catch { return false; } })());
ok("20280124 dosyası kapının SQL yapı kuralını GEÇMEZ (SQL_YAPI) — geçmişi 'açmak' tek başına yetmezdi", (() => { try { sqlYapisi(blob(LC_DOSYA)); return false; } catch (e) { return e.kod === "SQL_YAPI"; } })());
ok("ileri migration 20280124'ün birebir kopyası DEĞİL (CI: aynı SQL başka numarayla yayımlanamaz) ama 4 gövde AYNEN",
  ILERI !== blob(LC_DOSYA) && ["sifa_v2_gc_candidates", "sifa_v2_gc_purge", "sifa_v2_trash_candidates", "sifa_v2_trash_purge"].every((f) => ILERI.includes(blob(LC_DOSYA).slice(blob(LC_DOSYA).indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`), blob(LC_DOSYA).indexOf("$$;", blob(LC_DOSYA).indexOf(`CREATE OR REPLACE FUNCTION public.${f}(`)) + 3))));
ok("ileri migration __block_dead / __asset_in_use TANIMLAMAZ (F3'ün güncel tanımını ezmez)", !/FUNCTION public\.sifa_v2__block_dead|FUNCTION public\.sifa_v2__asset_in_use/.test(ILERI));

// ── İzole PostgreSQL: "prod" (production'daki gibi: yalnız çekirdek) + "prod2" (eşzamanlılık) + "taze" (CI / yeni ortam)
const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
const dir = path.join(KOK, "pg");
const srv = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "pw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog() {}, onError() {} });
const conns = [];
const baglan = async (db = "postgres") => { const c = new pg.Client({ host: "localhost", port, user: "postgres", password: "pw", database: db }); c.on("error", () => {}); await c.connect(); conns.push(c); return c; };
await srv.initialise(); await srv.start();
const IMZA = `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')|' || md5(regexp_replace(p.prosrc, '\\s+', ' ', 'g')) || '|' || p.prosecdef || '|' || coalesce(array_to_string(p.proconfig, ','), '') || '|' || has_function_privilege('service_role', p.oid, 'EXECUTE') || '|' || has_function_privilege('anon', p.oid, 'EXECUTE') || '|' || has_function_privilege('authenticated', p.oid, 'EXECUTE') s
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'sifa%' order by 1`;
const imza = async (c) => (await c.query(IMZA)).rows.map((r) => r.s);
const kur = async (c, prodGibi) => {
  await c.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF; END $$;");
  await c.query(`CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto;
    GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
    CREATE TABLE IF NOT EXISTS public.tenants (id uuid primary key, name text); CREATE TABLE IF NOT EXISTS public.users (id uuid primary key, tenant_id uuid, role text, active boolean default true, full_name text);
    CREATE TABLE IF NOT EXISTS public.stone_exclusions (tenant_id text, stone_id uuid);`);
  for (const f of YH_CORE) await c.query(blob(f));
  await c.query(blob(CORE));
  await c.query(blob(YH_SAHIP));
  if (prodGibi) {
    await c.query("CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text, created_by text, idempotency_key text UNIQUE, rollback text[]);");
    for (const [v, ad] of PROD_SURUMLER) await c.query("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ($1,$2)", [v, ad]);
    // production'daki gibi mevcut kayıt (1 konu + 1 not) — korunmalı
    await c.query(`INSERT INTO public.sifa_topics(id, tenant_id, owner_key, scope, title, sort_key) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','kisisel','Mevcut konu','m');
      INSERT INTO public.sifa_topic_blocks(id, tenant_id, owner_key, scope, topic_id, title, content_text, sort_key) VALUES ('bbbbbbbb-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','kisisel','aaaaaaaa-0000-4000-8000-000000000001','Mevcut not','metin','m');`);
  }
};
const veri = async (c) => (await c.query("select md5(string_agg(row_to_json(t)::text, ',' order by id)) h from (select id, title, sort_key, deleted_at from public.sifa_topics union all select id, title, sort_key, deleted_at from public.sifa_topic_blocks) t")).rows[0].h;
try {
  const a = await baglan();
  await kur(a, true);
  const yonetici = await baglan();
  await yonetici.query("CREATE DATABASE prod2"); await yonetici.query("CREATE DATABASE taze"); await yonetici.query("CREATE DATABASE taze_ilerisiz");
  const b = await baglan("prod2"); await kur(b, true);
  const t = await baglan("taze"); const t0 = await baglan("taze_ilerisiz");
  for (const c of [t, t0]) { await kur(c, false); await c.query(blob(LC_DOSYA)); await c.query(blob(F3)); await c.query(blob(YHF3)); }
  await t.query(ILERI); // taze ortam: sırayla hepsi (CI / yeni proje)
  const prodGecmis = async (c) => prodSatirlari((await c.query(GECMIS_SQL)).rows.map((r) => r.s).join("\n"));
  const calistirIle = (c) => async (sql) => { try { await c.query(sql); } catch (err) { await c.query("ROLLBACK").catch(() => {}); throw err; } };
  const hata = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
  const uyg = async (c, surum, ek = {}) => uygula({ root: K, surum, beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: await prodGecmis(c), calistir: calistirIle(c), ...ek });
  const durumu = (v) => durum(ayristir(okuUzak(K).text)).get(v);
  const gecmis = async (c, v) => (await c.query("SELECT count(*)::int n FROM supabase_migrations.schema_migrations WHERE version=$1", [v])).rows[0].n;
  const fn = async (c, n) => (await c.query("SELECT to_regprocedure($1) r", [n])).rows[0].r !== null;
  const veri0 = await veri(a);
  const imza0 = await imza(a);

  // 1) Yanlış migration seçimi: dondurulmuş 20280124 hâlâ uygulanamaz (başka hiçbir geçmiş sürüm açılmadı).
  let e = await hata(() => uyg(a, "20280124000000"));
  ok("yanlış seçim: 20280124 kapıdan → RED (AYIRMA); şema / geçmiş değişmedi", e?.kod === "AYIRMA" && JSON.stringify(await imza(a)) === JSON.stringify(imza0) && (await gecmis(a, "20280124000000")) === 0, e?.message);
  e = await hata(() => uyg(a, "20280110000000"));
  ok("yanlış seçim: production'daki çekirdek sürüm → RED (geçmiş sürümler topluca açılmaz)", ["AYIRMA", "PROD_DOLU"].includes(e?.kod), e?.kod);

  // 2) Sıra: ileri migration F3'ten ÖNCE → ön koşul YSM02, hiçbir şey uygulanmaz.
  e = await hata(() => uyg(a, RIL.surum));
  ok("sıra: ileri migration F3'ten önce → YSM02 (ön koşul); fonksiyon yok, geçmiş kaydı yok, defter 'uygulandi' değil", e?.code === "YSM02" && !(await fn(a, "public.sifa_v2_gc_candidates(timestamptz,timestamptz,uuid,integer)")) && (await gecmis(a, RIL.surum)) === 0 && durumu(RIL.surum).durum === "pr", e?.message);

  // 3) SHA-256: bağlandıktan sonra main'de değişen içerik → RED.
  fs.appendFileSync(path.join(K, "supabase/migrations", RIL.dosya), "-- sonradan değişti\n");
  sh(K, "commit", "-qam", "kurcalama"); sh(K, "push", "-q", "origin", "main"); sh(K, "fetch", "-q", "origin");
  e = await hata(() => hazirla({ root: K, surum: RIL.surum, defterText: okuUzak(K).text, beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: [{ surum: "20280110000000", ad: "x" }] }));
  ok("SHA-256: bağlandıktan sonra değişen ileri migration → RED (ICERIK)", e?.kod === "ICERIK", e?.message);
  sh(K, "revert", "--no-edit", "HEAD"); sh(K, "push", "-q", "origin", "main"); sh(K, "fetch", "-q", "origin");

  // 4) Doğru sıra: F3 → YH → ileri migration (kapı, production'daki gibi şema).
  const hazirMi = async (c) => (await c.query("select to_regprocedure('public.sifa_v2_f3_hazir()') is not null v")).rows[0].v;
  const u1 = await uyg(a, RF3.surum);
  ok("F3 kapıdan uygulandı (20280124 olmadan da kurulur); geçmiş + defter 'uygulandi'", (await gecmis(a, RF3.surum)) === 1 && durumu(RF3.surum).durum === "uygulandi" && durumu(RF3.surum).sha256 === u1.sha256);
  e = await hata(() => uyg(a, RIL.surum));
  ok("sıra: ileri migration YH'den önce (yalnız F3 tamam) → YSM02; hazırlık işareti YOK", e?.code === "YSM02" && !(await hazirMi(a)), e?.message);
  await uyg(a, RYH.surum);
  ok("YH kutu yayılımı kapıdan uygulandı; hazırlık işareti hâlâ YOK (Şifa kapalı kalır)", (await gecmis(a, RYH.surum)) === 1 && !(await hazirMi(a)));
  const u2 = await uyg(a, RIL.surum);
  ok("ileri migration kapıdan uygulandı; 4 fonksiyon kuruldu; geçmiş + defter 'uygulandi' + imza (PR + SHA)", (await gecmis(a, RIL.surum)) === 1 && durumu(RIL.surum).durum === "uygulandi" && durumu(RIL.surum).sha256 === u2.sha256 && (await fn(a, "public.sifa_v2_gc_purge(timestamptz,uuid,uuid[])")));
  await a.query("SET ROLE service_role");
  const hz = (await a.query("SELECT public.sifa_v2_f3_hazir() h")).rows[0].h;
  await a.query("RESET ROLE");
  const hzAnon = (await a.query("select has_function_privilege('anon','public.sifa_v2_f3_hazir()','EXECUTE') a, has_function_privilege('authenticated','public.sifa_v2_f3_hazir()','EXECUTE') b")).rows[0];
  ok("üç migration tamam → hazırlık işareti sifa_v2_f3_hazir() = true (yalnız service_role çağırabilir)", hz === true && !hzAnon.a && !hzAnon.b);

  // 5) Tekrar uygulama
  e = await hata(() => uyg(a, RIL.surum));
  ok("tekrar uygulama → RED (UYGULANMIS); şema değişmez", e?.kod === "UYGULANMIS");

  // 6) Production uyumluluğu: son şema = taze kurulum (20280124 + F3 + ileri) = taze kurulum (ilerisiz); mevcut kayıtlar aynen.
  const [ip, it, it0] = [await imza(a), await imza(t), await imza(t0)];
  ok("production yolu (çekirdek → F3 → YH → ileri) sonrası TÜM sifa fonksiyonları taze kurulumla BİREBİR (gövde + güvenlik + yetki)", JSON.stringify(ip) === JSON.stringify(it), JSON.stringify(ip.filter((x) => !it.includes(x))));
  ok("taze ortamda ileri migration yalnız hazırlık işaretini ekler; diğer TÜM fonksiyonlar 20280124 + F3 ile aynı", JSON.stringify(it.filter((x) => !x.startsWith("sifa_v2_f3_hazir("))) === JSON.stringify(it0) && it.some((x) => x.startsWith("sifa_v2_f3_hazir(")));
  ok("mevcut kayıtlar (konu + not) birebir korundu", (await veri(a)) === veri0);
  await a.query("SET ROLE service_role");
  const tc = await hata(() => a.query("SELECT * FROM public.sifa_v2_trash_candidates(now() - interval '30 days')"));
  const gc = await hata(() => a.query("SELECT * FROM public.sifa_v2_gc_candidates(now() - interval '30 days', now() - interval '1 day', NULL, 10)"));
  await a.query("RESET ROLE");
  ok("yaşam döngüsü fonksiyonları service_role ile çalışır (F3 yardımcılarıyla)", !tc && !gc, (tc ?? gc)?.message);
  const anon = (await a.query("select has_function_privilege('anon','public.sifa_v2_gc_purge(timestamptz,uuid,uuid[])','EXECUTE') a, has_function_privilege('authenticated','public.sifa_v2_trash_purge(timestamptz,uuid[])','EXECUTE') b")).rows[0];
  ok("tarayıcı rolleri yeni fonksiyonları çağıramaz", !anon.a && !anon.b);

  // 7) Eşzamanlılık: aynı sürüme iki uygulama (prod2: F3 kapıdan geçmiş hâlde) → tam biri.
  await b.query(blob(F3));
  await b.query(blob(YHF3));
  await b.query("INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ($1,'sifa_rehberi_f3'), ($2,'yh_sifa_f3_kutu_yayilimi')", [RF3.surum, RYH.surum]);
  // İleri migration'ın 'uygula' olayı OLMAYAN defter görüntüsü (= uygulamadan önceki an); dosyaya yazılmaz.
  const NL = String.fromCharCode(10);
  const oncesi = okuUzak(K).text.split(NL).filter((l) => !(l.includes('"olay":"uygula"') && l.includes(`"surum":"${RIL.surum}"`))).join(NL);
  const pIl = hazirla({ root: K, surum: RIL.surum, defterText: oncesi, beklenenProje: PROJE, gercekProje: PROJE, prodGecmis: await prodGecmis(b) });
  const [c1, c2] = [await baglan("prod2"), await baglan("prod2")];
  const sonuc = await Promise.allSettled([calistirIle(c1)(korumaliSql(pIl)), calistirIle(c2)(korumaliSql(pIl))]);
  const red = sonuc.find((s) => s.status === "rejected")?.reason;
  ok("eşzamanlı iki uygulama → TAM BİRİ; diğeri danışma kilidi sonrası YSM01; geçmişte 1 satır", sonuc.filter((s) => s.status === "fulfilled").length === 1 && red?.code === "YSM01" && (await gecmis(b, RIL.surum)) === 1, red?.message);
  ok("eşzamanlılık sonrası şema da taze kurulumla birebir", JSON.stringify(await imza(b)) === JSON.stringify(it));

  // 8) Defter tutarlılığı: 20280124 HÂLÂ dondurulmuş; tüm geçmiş doğrulanır (elle düzenleme yok).
  const dg = spawnSync(process.execPath, [CLI, "dogrula"], { cwd: K, encoding: "utf8" });
  const st = durum(ayristir(okuUzak(K).text));
  ok("defter: dogrula PASS; 20280124 'gecmis prod:false' DEĞİŞMEDİ; F3 + YH + ileri 'uygulandi'", dg.status === 0 && st.get("20280124000000").gecmis && st.get("20280124000000").prod === false && [RF3, RYH, RIL].every((r) => st.get(r.surum).durum === "uygulandi"), dg.stderr || dg.stdout);
} catch (err) {
  fail++;
  console.log(`FAIL BEKLENMEYEN — ${err.stack ?? err}`);
} finally {
  for (const c of conns) await c.end().catch(() => {});
  await srv.stop().catch(() => {});
  try { fs.rmSync(KOK, { recursive: true, force: true }); } catch { /* Windows kilidi */ }
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
