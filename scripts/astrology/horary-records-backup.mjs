#!/usr/bin/env node
// GÖKYÜZÜ ATLASI — William Lilly Horary kayıtları (astro_horary_questions) için TENANT BAZLI bağımsız yedek / geri yükleme aracı.
// OWNER'IN AÇIKÇA ÇALIŞTIRDIĞI operatör aracıdır; hiçbir otomatik yedek akışına, uygulama route'una ya da zamanlayıcıya bağlı DEĞİL.
// Uygulama içi yedek politikası (OWNER_PILOT_EXCLUDED_TABLES) DEĞİŞMEZ. Çekirdek: scripts/astrology/pg/horaryRecordsBackupCore.mjs.
//
// Kullanım (bağlantı yalnız ortam değişkeninden; komut satırında / günlükte sır yok):
//   HORARY_BACKUP_DATABASE_URL=postgres://… node scripts/astrology/horary-records-backup.mjs export  --tenant <uuid> --file <yol.json>
//   HORARY_BACKUP_DATABASE_URL=postgres://… node scripts/astrology/horary-records-backup.mjs restore --tenant <uuid> --file <yol.json> [--dry-run]
// Geri yükleme önce --dry-run ile denenmelidir. Çıktı: yalnız sayılar ve kayıt kimlikleri (soru metni / sonuç yazılmaz).
import fs from "node:fs";
import pg from "pg";
import { exportTenant, restoreTenant } from "./pg/horaryRecordsBackupCore.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const arg = (k) => {
  const i = rest.indexOf(k);
  return i >= 0 ? rest[i + 1] : undefined;
};
const url = process.env.HORARY_BACKUP_DATABASE_URL;
const tenant = arg("--tenant");
const file = arg("--file");
if (!["export", "restore"].includes(cmd) || !tenant || !file || !url) {
  console.error("Kullanım: HORARY_BACKUP_DATABASE_URL=… node scripts/astrology/horary-records-backup.mjs export|restore --tenant <uuid> --file <yol> [--dry-run]");
  process.exit(2);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  if (cmd === "export") {
    if (fs.existsSync(file)) throw new Error("Hedef dosya zaten var (üzerine yazılmaz).");
    const out = await exportTenant(client, tenant);
    fs.writeFileSync(file, JSON.stringify(out), { flag: "wx", mode: 0o600 });
    console.log(`dışa aktarıldı: ${out.count} kayıt · manifest ${out.manifest.slice(0, 16)}…`);
  } else {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const r = await restoreTenant(client, data, tenant, { dryRun: rest.includes("--dry-run") });
    console.log(`${r.dryRun ? "DENEME (yazılmadı)" : "geri yüklendi"}: eklenen ${r.inserted} · aynı olduğu için atlanan ${r.skippedIdentical} · danışanı bulunamayıp bağlantısı boşaltılan ${r.clientNulled.length} · hedefte bulunmayan uzman ${r.missingOwners.length}`);
  }
} catch (e) {
  console.error(`HATA: ${String(e?.message ?? e).split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
