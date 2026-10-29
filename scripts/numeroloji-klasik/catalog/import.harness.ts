/**
 * Klasik Numeroloji — katalog içe aktarıcı harness'i (geçici embedded-postgres; ağ YOK; prod/staging'e SIFIR temas).
 *
 * Doğrular: hedef kapısı (local-test + localhost), satır sayıları 12 + 43 + 24, idempotent upsert, eksik dosyada
 * hiç yazmama, payload'larda ham alan / sağlayıcı adı olmaması, katalog okuyucusunun (repository) satırları görmesi.
 * Ham yanıtlar repo DIŞINDAN okunur (C:/YasamSistemi-QA/...); yoksa harness "ATLANDI" der ve 1 ile çıkar.
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/catalog/import.harness.ts
 */
import Module from "node:module";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SERVICE_KEY, startAnamnezTestEnv } from "../../anamnez/testEnv";

const ROOT = path.resolve(__dirname, "../../..");
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

async function main(): Promise<void> {
  const realFetch = globalThis.fetch;
  const blocked: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    blocked.push(u.replace(/[?#].*$/, ""));
    throw new Error("ağ kilidi");
  }) as typeof fetch;

  const ci = await import("../../../lib/numeroloji-klasik/server/catalogImport");
  const { runCatalogImport } = await import("./import");
  if (!existsSync(ci.CATALOG_RAW_DIR_DEFAULT)) {
    console.log(`ATLANDI: ham yanıt klasörü yok (${ci.CATALOG_RAW_DIR_DEFAULT})`);
    process.exit(1);
  }

  console.log("— hedef kapısı (DB'siz)");
  const quiet = { log: () => undefined };
  const g1 = await runCatalogImport({ NUM_KLASIK_IMPORT_DB_URL: "postgres://u:p@127.0.0.1:5432/postgres" }, quiet);
  ok(!g1.ok && g1.written === 0, "NUM_KLASIK_IMPORT_TARGET yok → red");
  const g2 = await runCatalogImport({ NUM_KLASIK_IMPORT_TARGET: "LOCAL-TEST", NUM_KLASIK_IMPORT_DB_URL: "postgres://u:p@127.0.0.1:5432/postgres" }, quiet);
  ok(!g2.ok, "hedef bayrağı tam 'local-test' olmalı");
  const g3 = await runCatalogImport({ NUM_KLASIK_IMPORT_TARGET: "local-test", NUM_KLASIK_IMPORT_DB_URL: "postgres://u:p@db.abcdefgh.supabase.co:5432/postgres" }, quiet);
  ok(!g3.ok, "uzak host (supabase) → red");
  const g4 = await runCatalogImport({ NUM_KLASIK_IMPORT_TARGET: "local-test", NUM_KLASIK_IMPORT_DB_URL: "postgres://u:p@127.0.0.1.evil.example:5432/postgres" }, quiet);
  ok(!g4.ok, "127.0.0.1.evil.example → red");
  ok(!ci.assertLocalImportTarget({ NUM_KLASIK_IMPORT_TARGET: "local-test" }).ok, "URL yok → red");
  ok(ci.assertLocalImportTarget({ NUM_KLASIK_IMPORT_TARGET: "local-test", NUM_KLASIK_IMPORT_DB_URL: "postgresql://u:p@localhost:1/x" }).ok, "localhost kabul");

  console.log("— satır üretimi (saf)");
  const built = ci.buildCatalogRows();
  ok(built.problems.length === 0, "ham dosyalar sorunsuz normalize edildi", built.problems);
  const cnt = (k: string) => built.rows.filter((r) => r.kind === k).length;
  ok(cnt("pythagorean_meaning") === 12 && cnt("chaldean_compound") === 43 && cnt("lucky_association") === 24, "12 + 43 + 24 satır", { m: cnt("pythagorean_meaning"), c: cnt("chaldean_compound"), l: cnt("lucky_association") });
  const ser = JSON.stringify(built.rows);
  ok(!/roxy/i.test(ser), "payload'larda sağlayıcı adı yok");
  ok(!/"(rl|http|case|x-ratelimit[a-z-]*)"\s*:/.test(ser), "payload'larda ham yanıt kabı (http/rl/case) yok");
  const lucky1en = built.rows.find((r) => r.kind === "lucky_association" && r.number === 1 && r.lang === "en");
  const keys = Object.keys(lucky1en?.payload ?? {}).sort().join(",");
  ok(keys === "colors,compatibleNumbers,day,element,gemstones,incompatibleNumbers,rulingPlanet", "lucky payload anahtarları = migration CHECK listesi", keys);
  const summary = JSON.parse(readFileSync(path.join(ci.CATALOG_RAW_DIR_DEFAULT, "..", "lucky-gemstones.json"), "utf8")) as Record<string, Record<string, { gemstones: string[] }>>;
  ok(JSON.stringify(lucky1en?.payload.gemstones) === JSON.stringify(summary["1"].en.gemstones), "lucky 1/en taş adları özet dosyasıyla aynı");
  const missing = ci.buildCatalogRows({ fs: { readFile: (p) => readFileSync(p, "utf8"), exists: (p) => existsSync(p) && !p.endsWith("m02-cmp-23-tr.json") } });
  ok(missing.problems.some((p) => p.includes("m02-cmp-23-tr.json")) && missing.rows.length === 78, "eksik dosya raporlanır");

  console.log("— embedded PG");
  const MIGS = ["20271205000000_numerology_classic_core.sql"].map((f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
  const port = Number(process.env.NUMK_CATALOG_PG_PORT ?? 54597);
  const env = await startAnamnezTestEnv({ port, dirName: `num-klasik-catalog-${Date.now()}`, extraSql: MIGS });
  try {
    const url = `postgres://postgres:testpw@127.0.0.1:${port}/postgres`;
    const ienv = { NUM_KLASIK_IMPORT_TARGET: "local-test", NUM_KLASIK_IMPORT_DB_URL: url };
    const count = async () => (await env.su.query(`select kind, count(*)::int n from public.numerology_classic_catalog group by kind order by kind`)).rows as { kind: string; n: number }[];

    const r1 = await runCatalogImport(ienv, quiet);
    ok(r1.ok && r1.written === 79, "içe aktarma: 79 satır yazıldı", r1);
    const c1 = await count();
    ok(JSON.stringify(c1) === JSON.stringify([{ kind: "chaldean_compound", n: 43 }, { kind: "lucky_association", n: 24 }, { kind: "pythagorean_meaning", n: 12 }]), "DB satır sayıları 43 / 24 / 12", c1);
    const r2 = await runCatalogImport(ienv, quiet);
    const c2 = await count();
    ok(r2.ok && JSON.stringify(c2) === JSON.stringify(c1), "ikinci çalıştırma idempotent (upsert, çoğaltma yok)");
    const other = (await env.su.query(`select count(*)::int n from public.numerology_classic_analyses`)).rows[0].n;
    ok(other === 0, "başka tabloya yazılmadı");

    // Eksik dosya → hiç yazma yok (geçici boş klasörle)
    await env.su.query(`delete from public.numerology_classic_catalog`);
    const r3 = await runCatalogImport({ ...ienv, NUM_KLASIK_RAW_DIR: path.join(ROOT, "scripts", "numeroloji-klasik", "catalog", "__yok__") }, quiet);
    ok(!r3.ok && (await count()).length === 0, "ham klasör yok → hiçbir satır yazılmaz");
    await runCatalogImport(ienv, quiet);

    const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const repo = await import("../../../lib/numeroloji-klasik/server/repository");
    const e = await repo.getCatalogEntry(db, "lucky_association", 11, "en");
    ok(e.ok && Array.isArray((e.value.payload as { gemstones?: unknown }).gemstones), "repository.getCatalogEntry(lucky 11/en) okur");
    const l = await repo.listCatalog(db, "chaldean_compound", "tr");
    ok(l.ok && l.value.length === 43 && l.value[0].number === 10 && l.value[42].number === 52, "listCatalog(chaldean_compound) 10..52");
    const m = await repo.listCatalog(db, "pythagorean_meaning", "tr");
    ok(m.ok && m.value.length === 12 && m.value.every((x) => typeof (x.payload as { meaning?: { title?: unknown } }).meaning?.title === "string"), "anlam payload'ı başlık içerir");
  } finally {
    await env.stop();
    globalThis.fetch = realFetch;
  }
  ok(blocked.length === 0, "ağ kilidi: dış istek yok", blocked);
  console.log(`\n${pass} ✓ / ${fail} ✗`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("harness hatası:", e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
