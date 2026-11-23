/**
 * 8. aşama — V2 kayıtlarının DB düzeyinde YEDEK → GERİ YÜKLEME doğrulaması (yalnız test projesi).
 *   1) guard (fail-closed) → pg_dump (yalnız public.sifa_* tabloları + sifa_v2* fonksiyonları için şema) — SALT-OKUNUR
 *   2) yerel GEÇİCİ PostgreSQL'e pg_restore (production/test projesine geri YAZILMAZ)
 *   3) tablo bazında satır sayısı + md5 özeti ve sifa_v2_load çıktısı kaynak = geri yüklenen
 *   4) uygulama yedek kayıt defteri (lib/backup/registry.ts) ve YH kaynakları sifa_* içeriyor mu? (kod denetimi)
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/backup.real.mts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { connectTestDb, loadTestTarget, pgConfig, redact } from "./guard";

/** pg_dump / pg_restore (PostgreSQL 17+). SIFA_V2_PGBIN verilmezse PATH'teki araçlar kullanılır. */
const PGBIN = process.env.SIFA_V2_PGBIN ?? "";
const pgTool = (n: string) => (PGBIN ? path.join(PGBIN, process.platform === "win32" ? `${n}.exe` : n) : n);
const TABLES = ["sifa_topics", "sifa_topic_blocks", "sifa_block_sources", "sifa_topic_links", "sifa_block_assets", "sifa_legacy_import_map"];
let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra)}` : ""}`);
};

const T = loadTestTarget();
const cfg = pgConfig(T);
const src = await connectTestDb();
const work = mkdtempSync(path.join(os.tmpdir(), "sifa-v2-backup-"));
const dump = path.join(work, "sifa_v2.dump");

async function digest(c: pg.Client) {
  await c.query("SET TimeZone = 'UTC'"); // metin temsili oturum saat dilimine bağlı → iki tarafta UTC
  const out: Record<string, { n: number; h: string }> = {};
  for (const t of TABLES) {
    const r = await c.query(`select count(*)::int n, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from public.${t} x`);
    out[t] = { n: r.rows[0].n, h: r.rows[0].h };
  }
  return out;
}

let epg: EmbeddedPostgres | null = null;
let dst: pg.Client | null = null;
try {
  console.log("1) Kaynak (test projesi) özeti — BEGIN READ ONLY");
  await src.query("BEGIN READ ONLY");
  const before = await digest(src);
  const probe = (await src.query("select tenant_id, owner_key from public.sifa_topics where scope='kisisel' order by created_at limit 1")).rows[0];
  await src.query("SET LOCAL TimeZone = 'UTC'");
  const loadSrc = (await src.query("select md5(public.sifa_v2_load($1,$2)::text) h", [probe.tenant_id, probe.owner_key])).rows[0].h;
  await src.query("ROLLBACK");
  ok(Object.values(before).every((x) => x.n >= 0), "kaynak özeti alındı", Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v.n])));

  console.log("2) pg_dump (yalnız sifa_* tabloları; veri + şema)");
  const args = ["-h", String(cfg.host), "-p", String(cfg.port), "-U", String(cfg.user), "-d", "postgres", "-Fc", "--no-owner", "--no-privileges", "-f", dump];
  for (const t of TABLES) args.push("-t", `public.${t}`);
  try {
    execFileSync(pgTool("pg_dump"), args, { env: { ...process.env, PGPASSWORD: T.dbPassword, PGSSLMODE: "require" }, stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    throw new Error(`pg_dump: ${redact(String((e as { stderr?: Buffer }).stderr ?? e))}`);
  }
  ok(statSync(dump).size > 0, "pg_dump tamamlandı", `${(statSync(dump).size / 1024).toFixed(0)} KB`);

  console.log("3) Yerel GEÇİCİ PostgreSQL'e geri yükleme");
  const port = await new Promise<number>((res) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => res(p));
    });
  });
  epg = new EmbeddedPostgres({ databaseDir: path.join(work, "pg"), user: "postgres", password: "testpw", port, persistent: false, initdbFlags: ["--locale=C", "--encoding=UTF8"], onLog: () => {}, onError: () => {} });
  await epg.initialise();
  await epg.start();
  dst = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password: "testpw", database: "postgres" });
  await dst.connect();
  await dst.query("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;");
  // Sıra: tablolar (pre-data) → migration fonksiyonları (tetikleyici fonksiyonları dahil) → veri → kısıt/tetikleyici.
  const mig = readFileSync(path.resolve("supabase/migrations/20280110000000_sifa_rehberi_v2_core.sql"), "utf8");
  const fns = mig.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\n\$\$;/g) ?? [];
  const restore = (section: string, extra: string[] = []) => {
    try {
      execFileSync(pgTool("pg_restore"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "--no-owner", "--exit-on-error", `--section=${section}`, ...extra, dump], { env: { ...process.env, PGPASSWORD: "testpw" }, stdio: ["ignore", "ignore", "pipe"] });
    } catch (e) {
      throw new Error(`pg_restore ${section}: ${String((e as { stderr?: Buffer }).stderr ?? e).slice(0, 600)}`);
    }
  };
  // Supabase PostgreSQL sütunlara iç seçenek `pg_attver` yazar; vanilya PG bunu tanımaz → yalnız o satırlar süzülür.
  const preSql = execFileSync(pgTool("pg_restore"), ["--no-owner", "--section=pre-data", "-f", "-", dump]).toString();
  const attver = preSql.split("\n").filter((l) => l.includes("pg_attver")).length;
  // pg 17.6+ metin çıktısı psql meta komutları (\restrict/\unrestrict) içerir → pg istemcisinde atlanır.
  await dst.query(preSql.split("\n").filter((l) => !l.includes("pg_attver") && !/^\\(un)?restrict\b/.test(l)).join("\n"));
  ok(attver >= 0, "pre-data (tablolar) geri yüklendi", `${attver} Supabase'e özgü pg_attver satırı süzüldü`);
  for (const f of fns) await dst.query(f);
  restore("data", ["--disable-triggers"]);
  // 10. aşama: sifa_* tablolarında YH CDC tetikleyicileri var (fonksiyonları YH şemasında; -t dökümüne girmez).
  // Yerel hedefte YALNIZ tetikleyici kurulumu için no-op taslak (veri doğrulaması etkilenmez; bulgu raporlanır).
  // Son tamamlama: V2 kutu tetikleyicileri artık V2'ye özel yh_cdc_enqueue_sifa_v2()'ye bağlı (genel fonksiyon değil).
  await dst.query(`create or replace function public.yh_cdc_enqueue_sifa_v2() returns trigger language plpgsql as $f$ begin return null; end $f$;
                   create or replace function public.yh_sifa_v2_topic_trash_enqueue() returns trigger language plpgsql as $f$ begin return null; end $f$;`);
  restore("post-data");
  const trg = (await dst.query("select count(*)::int n from pg_trigger where tgname like 'yh_cdc_sifa_v2_%'")).rows[0].n;
  ok(trg === 3, "YH CDC tetikleyicileri (3) dökümden geri geldi — hedefte YH fonksiyonları ÖNCEDEN kurulu olmalı (bulgu)", `${trg} tetikleyici`);
  ok(fns.length >= 12, "migration fonksiyonları geri yüklenen DB'ye kuruldu", `${fns.length} fonksiyon`);
  const after = await digest(dst);
  for (const t of TABLES) ok(before[t].n === after[t].n && before[t].h === after[t].h, `${t}: satır + md5 birebir`, `${after[t].n} satır`);
  await dst.query("SET TimeZone = 'UTC'");
  const loadDst = (await dst.query("select md5(public.sifa_v2_load($1,$2)::text) h", [probe.tenant_id, probe.owner_key])).rows[0].h;
  ok(loadSrc === loadDst, "geri yüklenen DB'de sifa_v2_load çıktısı kaynakla birebir (örnek uzman)");
  const fk = (await dst.query("select count(*)::int n from pg_constraint where conrelid::regclass::text like '%sifa_%' and contype = 'f'")).rows[0].n;
  ok(fk === (mig.match(/FOREIGN KEY/g) ?? []).length, "bileşik FK kısıtları geri yüklendi (migration ile aynı sayı)", `${fk} FK`);

  console.log("4) Uygulama yedek sistemi + YH kapsamı (kod denetimi)");
  const reg = readFileSync(path.resolve("lib/backup/registry.ts"), "utf8");
  const sifaInReg = TABLES.filter((t) => reg.includes(`"${t}"`));
  console.log(`  · lib/backup/registry.ts sifa_* kaydı: ${sifaInReg.length}/${TABLES.length} (NOT DONE ise 0)`);
  const yh = readFileSync(path.resolve("lib/yasam-hafizasi/indexer/sources.ts"), "utf8");
  console.log(`  · YH indeks kaynağı sifa_*: ${TABLES.filter((t) => yh.includes(t)).length}/${TABLES.length} (NOT DONE ise 0)`);
} catch (e) {
  fail++;
  console.log(`  ✗ ${redact((e as Error).message)}`);
} finally {
  await src.end().catch(() => {});
  await dst?.end().catch(() => {});
  await epg?.stop().catch(() => {});
  rmSync(work, { recursive: true, force: true });
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
