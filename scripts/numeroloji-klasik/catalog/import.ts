/**
 * Klasik Numeroloji — sabit kataloğu YEREL TEST veritabanına içe aktarır (çevrimdışı; ağ çağrısı YOK).
 *
 * Çalıştır (yalnız yerel):
 *   NUM_KLASIK_IMPORT_TARGET=local-test \
 *   NUM_KLASIK_IMPORT_DB_URL=postgres://postgres:pw@127.0.0.1:54595/postgres \
 *   [NUM_KLASIK_RAW_DIR=C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/raw] \
 *   npx tsx scripts/numeroloji-klasik/catalog/import.ts [--dry-run]
 *
 * Beklenen: pythagorean_meaning 12 + chaldean_compound 43 + lucky_association 24 = 79 satır.
 * Eksik / normalize edilemeyen dosya varsa HİÇBİR satır yazılmaz (çıkış kodu 1).
 *
 * PRODUCTION İÇE AKTARIMI = OWNER ADIMI. Bu betik production'a yazmayı bilinçli olarak reddeder
 * (host localhost değilse çalışmaz). Owner için önerilen yol: bu betikle yerel test DB'sine aktarıp
 * `select kind, number, lang, payload, spec_version from public.numerology_classic_catalog` çıktısından
 * idempotent bir upsert SQL'i üretmek, gözden geçirip owner onayıyla production'da çalıştırmak
 * (yalnız numerology_classic_catalog; migration 20271205000000 production'a uygulandıktan sonra).
 */
import pg from "pg";
import { assertLocalImportTarget, buildCatalogRows, CATALOG_EXPECTED, CATALOG_RAW_DIR_DEFAULT, upsertCatalogRows } from "../../../lib/numeroloji-klasik/server/catalogImport";

export async function runCatalogImport(env: Record<string, string | undefined> = process.env, opts: { dryRun?: boolean; log?: (s: string) => void } = {}): Promise<{ ok: boolean; written: number; counts: Record<string, number>; problems: string[] }> {
  const log = opts.log ?? ((s: string) => console.log(s));
  const target = assertLocalImportTarget(env);
  if (!target.ok) {
    log(`REDDEDİLDİ: ${target.reason}`);
    return { ok: false, written: 0, counts: {}, problems: [target.reason] };
  }
  const { rows, problems } = buildCatalogRows({ rawDir: env.NUM_KLASIK_RAW_DIR ?? CATALOG_RAW_DIR_DEFAULT });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  for (const [k, n] of Object.entries(CATALOG_EXPECTED)) if ((counts[k] ?? 0) !== n) problems.push(`${k}: ${counts[k] ?? 0} satır (beklenen ${n})`);
  log(`katalog satırları: ${JSON.stringify(counts)}`);
  if (problems.length) {
    for (const p of problems) log(`  sorun: ${p}`);
    log("HİÇBİR satır yazılmadı.");
    return { ok: false, written: 0, counts, problems };
  }
  if (opts.dryRun) return { ok: true, written: 0, counts, problems };
  const client = new pg.Client({ connectionString: target.url });
  await client.connect();
  try {
    const written = await upsertCatalogRows((sql, params) => client.query(sql, params), rows);
    log(`yazıldı: ${written} satır (upsert)`);
    return { ok: true, written, counts, problems };
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runCatalogImport(process.env, { dryRun: process.argv.includes("--dry-run") })
    .then((r) => process.exit(r.ok ? 0 : 1))
    .catch((e) => {
      console.error("içe aktarma hatası:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    });
}
