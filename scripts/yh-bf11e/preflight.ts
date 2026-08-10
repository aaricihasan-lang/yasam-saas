/**
 * BF-11E — Kontrollü Kaynak Aktivasyon PREFLIGHT üreticisi (SALT-OKUNUR; DB YOK).
 *
 * Aktivasyon matrisinden, production activation kararı öncesi Supabase SQL Editor'da
 * ELLE çalıştırılacak SALT-OKUNUR preflight SQL bloklarını üretir. Bu script DB'ye
 * BAĞLANMAZ, hiçbir mutation üretmez; yalnız SELECT-only metin yazar.
 *
 *   npm run yh:bf11e:preflight            → tüm kaynaklar
 *   npm run yh:bf11e:preflight <sourceKey> → tek kaynak
 */
import { YH_ACTIVATION_MATRIX } from "@/lib/yasam-hafizasi/activation/activationMatrix";
import { buildPreflightSql, buildActivationTemplate } from "@/lib/yasam-hafizasi/activation/activationPlan";

function main(): void {
  const filter = process.argv[2];
  const entries = filter
    ? YH_ACTIVATION_MATRIX.filter((e) => e.sourceKey === filter)
    : YH_ACTIVATION_MATRIX;

  if (entries.length === 0) {
    process.stdout.write(`Bilinmeyen sourceKey: ${filter}\n`);
    process.exit(1);
  }

  process.stdout.write("-- =============================================================\n");
  process.stdout.write("-- YAŞAM HAFIZASI BF-11E PREFLIGHT (SALT-OKUNUR; production'da ELLE çalıştırın)\n");
  process.stdout.write("-- Bu script hiçbir DB bağlantısı yapmaz; aşağıdaki SQL SELECT-only'dir.\n");
  process.stdout.write("-- =============================================================\n\n");

  for (const e of entries) {
    process.stdout.write(buildPreflightSql(e));
    process.stdout.write("\n\n");
    process.stdout.write(buildActivationTemplate(e));
    process.stdout.write("\n\n-- ---------------------------------------------------------\n\n");
  }
}

main();
