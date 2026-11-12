/**
 * AŞAMA 4a — depo migration zincirinden (4a ÖNCESİ) değiştirilecek fonksiyonların gövde parmak izleri.
 * prod-readonly-check.sql aynı ifadeyi canlıda hesaplar → eşitse migration'daki CREATE OR REPLACE gövdeleri
 * canlı gövdelerin birebir devamıdır (sürüklenme yok). Production'a temas YOK (embedded PG).
 *
 * Çalıştır: npx tsx scripts/uye-arsiv-4a/repo-fingerprints.ts
 */
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { readMig } from "../uye-yonetimi-360/migrationChain";
import { FINGERPRINT_FUNCTIONS } from "./fingerprintList";

async function main(): Promise<void> {
  const port = 58000 + Math.floor(Math.random() * 900);
  const db = await startTestDb(port, `uye-arsiv-4a-fp-${port}`);
  try {
    for (const f of [
      "20271009100000_admin_purge_archived_expert.sql",
      "20271230000000_astrology_technique_grants.sql",
      "20280101000000_trial7_self_trial.sql",
      "20280101000100_trial7_claims_retention.sql",
      "20280101000200_trial7_admin_trial_approval.sql",
      "20280101000300_admin_legacy_package_repair.sql",
      "20280101000400_admin_owner_notifications.sql",
      "20280101000500_admin_list_members_v2.sql",
    ]) await db.su.query(readMig(f));
    const rows = (await db.su.query(
      `select p.oid::regprocedure::text sig, md5(replace(p.prosrc, chr(13), '')) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname = any($1) order by 1`, [FINGERPRINT_FUNCTIONS])).rows;
    for (const r of rows) console.log(`${r.sig}\t${r.h}`);
  } finally {
    await db.stop();
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
