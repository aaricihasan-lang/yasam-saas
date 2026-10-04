/**
 * ÜYE YÖNETİMİ 360° — ephemeral test veritabanı (embedded-postgres, 127.0.0.1; production'a SIFIR temas).
 *
 * FAZ 2 tabanı (scripts/uye-yonetimi-faz2/testDb.ts: users/tenants/sessions + üye RPC zinciri + M4 +
 * 360 zinciri — bkz. migrationChain.ts). Tüm kullanıcılar sentetiktir (ZZ_M360_*).
 */
import { startTestDb, type TestDb } from "../uye-yonetimi-faz2/testDb";

export { M360_MIGRATION, readMig } from "./migrationChain";

export async function startTestDb360(port: number, dirName: string): Promise<TestDb> {
  return startTestDb(port, dirName);
}
