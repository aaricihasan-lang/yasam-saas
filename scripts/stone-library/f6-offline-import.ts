/**
 * Doğaltaş Kütüphanesi F6-A — GÜVENİLİR ÇEVRİMDIŞI KRİSTAL AKTARIMI (owner bilgisayarından, elle).
 *
 * Neden ayrı betik: web uygulamasının (service_role) ham sağlayıcı yanıtı yazma yetkisi KALDIRILDI. Ham yanıt yalnız
 * `stone_library_importer` rolüyle ve DB'de önceden ayrılmış + tüketilmemiş çağrıya bağlı olarak yazılabilir; böylece
 * owner oturumu ele geçirilse bile keyfi "sağlayıcı yanıtı" üretilemez.
 *
 * Kimlikler (ikisi birden gerekir):
 *   • NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → paket aç / çağrı ayır / kayıt (owner RPC'leri; owner DB'de yeniden doğrulanır)
 *   • IMPORTER_DATABASE_URL → YALNIZ `stone_library_importer` rolünün üyesi olan AYRI giriş rolü (postgres / service_role DEĞİL).
 *     Production'da bu rol owner onayıyla ayrıca oluşturulur (bkz. F6 production planı); bu betik rol OLUŞTURMAZ.
 * Ücretli çağrı: yalnız --confirm-paid-calls bayrağı + --credit-cap ile. Varsayılan: hiçbir şey yapmadan çıkar.
 *
 * Çalıştır (örnek; yalnız owner onayından sonra):
 *   STONE_LIBRARY_OWNER_ID=<owner uuid> STONE_LIBRARY_SOURCE_ID=<kaynak uuid> STONE_LIBRARY_TERMS_SHA256=<64 hex> ROXY_API_KEY=… \
 *   IMPORTER_DATABASE_URL=postgres://<aktarım rolü>@… npx tsx scripts/stone-library/f6-offline-import.ts --credit-cap 200 --confirm-paid-calls
 */
import "../hd-analysis-word-flow/env";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { runCrystalImport, type RawPutArgs } from "../../lib/stone-library/import/runner";
import { CRYSTALS_DEFAULT_BASE_URL } from "../../lib/stone-library/import/roxyCrystalsClient";
import { IMPORT_MAX_CREDITS_PER_RUN, IMPORT_QUOTA_FLOOR } from "../../lib/stone-library/import/limits";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main() {
  const confirm = process.argv.includes("--confirm-paid-calls");
  const cap = Number(arg("--credit-cap"));
  const owner = process.env.STONE_LIBRARY_OWNER_ID ?? "";
  const source = process.env.STONE_LIBRARY_SOURCE_ID ?? "";
  const license = process.env.STONE_LIBRARY_LICENSE_GRANT_ID ?? "";
  const terms = process.env.STONE_LIBRARY_TERMS_SHA256 ?? "";
  const importerUrl = process.env.IMPORTER_DATABASE_URL ?? "";
  if (!confirm) return console.log("Ücretli çağrı onayı yok (--confirm-paid-calls). Hiçbir işlem yapılmadı.");
  if (!Number.isInteger(cap) || cap < 1 || cap > IMPORT_MAX_CREDITS_PER_RUN) return console.log(`--credit-cap 1–${IMPORT_MAX_CREDITS_PER_RUN} olmalı. DURDU.`);
  if (!UUID_RE.test(owner) || !UUID_RE.test(source) || (license && !UUID_RE.test(license)) || !/^[0-9a-f]{64}$/.test(terms)) return console.log("Owner / kaynak / lisans / şartlar SHA eksik. DURDU.");
  if (!importerUrl || /\/\/(postgres|supabase_admin|service_role)[:@]/i.test(importerUrl)) return console.log("IMPORTER_DATABASE_URL ayrı aktarım rolü olmalı (postgres / service_role değil). DURDU.");
  if (!process.env.ROXY_API_KEY) return console.log("Sağlayıcı anahtarı yok. DURDU.");

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
  const imp = new pg.Client({ connectionString: importerUrl });
  await imp.connect();
  const roles = await imp.query(`select pg_has_role(current_user, 'stone_library_importer', 'USAGE') as member, (select rolsuper from pg_roles where rolname = current_user) as su`);
  if (!roles.rows[0]?.member || roles.rows[0]?.su) {
    await imp.end();
    return console.log("Bağlantı rolü stone_library_importer üyesi değil ya da süper kullanıcı. DURDU.");
  }
  const writeRaw = async (a: RawPutArgs): Promise<string> => {
    await imp.query("begin");
    try {
      await imp.query("set local role stone_library_importer");
      const r = await imp.query("select public.stone_library_raw_put($1,$2,$3,$4,$5,$6,$7::jsonb) as id",
        [a.p_actor, a.p_batch_id, a.p_external_id, a.p_lang, a.p_endpoint, a.p_http_status, JSON.stringify(a.p_payload)]);
      await imp.query("commit");
      return String(r.rows[0].id);
    } catch (e) {
      await imp.query("rollback");
      throw e;
    }
  };
  try {
    const summary = await runCrystalImport({
      db, actor: owner, sourceId: source, licenseGrantId: license || null, writeRaw,
      client: { baseUrl: (process.env.ROXY_API_BASE_URL ?? CRYSTALS_DEFAULT_BASE_URL).trim(), apiKey: process.env.ROXY_API_KEY },
      includeImages: !!license, includeBirthstones: true, includeVocabLists: true, forceRefetch: process.argv.includes("--force-refetch"),
      creditCap: cap, allowanceRemaining: cap, quotaFloor: IMPORT_QUOTA_FLOOR, termsSha256: terms,
    });
    const { details: _d, ...rest } = summary;
    void _d;
    console.log(JSON.stringify(rest, null, 1));
  } finally {
    await imp.end().catch(() => undefined);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
