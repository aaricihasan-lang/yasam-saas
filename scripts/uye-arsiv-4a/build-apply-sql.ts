/**
 * AŞAMA 4a — production uygulama SQL'ini ve kuru prova SQL'ini dosyaya üretir (hiçbir veritabanına bağlanmaz).
 *   <out>/apply-20280101000600.sql      : BEGIN; gövde; ledger INSERT; COMMIT;   (tek atomik işlem)
 *   <out>/rehearsal-20280101000600.sql  : BEGIN; gövde; ledger INSERT; ROLLBACK; (COMMIT içermez)
 *   <out>/manifest.json                 : kaynak dosya + üretilen dosyaların SHA-256'ları
 * Çalıştır: npx tsx scripts/uye-arsiv-4a/build-apply-sql.ts <çıktı-dizini>
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractMigrationBody, normalizeStatement, splitTopLevel } from "./migrationBody";
import { buildApplyText, buildRehearsalText, MIG_CREATED_BY, MIG_NAME, MIG_VERSION } from "./applyText";

const out = process.argv[2];
if (!out) { console.error("çıktı dizini gerekli"); process.exit(1); }
mkdirSync(out, { recursive: true });
const file = path.join(process.cwd(), "supabase/migrations", `${MIG_VERSION}_${MIG_NAME}.sql`);
const src = readFileSync(file, "utf8");
const { body } = extractMigrationBody(src);
const apply = buildApplyText(body);
const rehearsal = buildRehearsalText(body);
const tx = (t: string) => splitTopLevel(t).map((s) => normalizeStatement(s.text)).filter((x) => /^(BEGIN|COMMIT|ROLLBACK|END|ABORT|START TRANSACTION|SAVEPOINT|RELEASE)\b/.test(x));
if (JSON.stringify(tx(apply)) !== JSON.stringify(["BEGIN;", "COMMIT;"])) throw new Error(`uygulama metni işlem ifadeleri: ${tx(apply)}`);
if (JSON.stringify(tx(rehearsal)) !== JSON.stringify(["BEGIN;", "ROLLBACK;"])) throw new Error(`prova metni işlem ifadeleri: ${tx(rehearsal)}`);
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
writeFileSync(path.join(out, `apply-${MIG_VERSION}.sql`), apply);
writeFileSync(path.join(out, `rehearsal-${MIG_VERSION}.sql`), rehearsal);
const manifest = {
  migration: `supabase/migrations/${MIG_VERSION}_${MIG_NAME}.sql`,
  migrationSha256: sha(src),
  applySha256: sha(apply),
  rehearsalSha256: sha(rehearsal),
  ledger: { version: MIG_VERSION, name: MIG_NAME, created_by: MIG_CREATED_BY },
  applyTx: tx(apply),
  rehearsalTx: tx(rehearsal),
};
writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
