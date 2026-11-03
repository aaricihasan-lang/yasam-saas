/**
 * Gökyüzü Atlası teknik izinleri — migration 20271230000000 provası (geçici gömülü PostgreSQL; prod'a temas YOK).
 * CI `astro-pro` işi bu dosyayı otomatik keşfeder; asıl prova scripts/astrology/pg/technique-grants.mjs'dedir
 * (fixture → migration 2 kez → assert: backfill, biçim CHECK, atomik kayıt fonksiyonu, denetim farkı, yetkiler, kısmi kayıt yok).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/pro-technique-grants-pg.harness.ts
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const r = spawnSync(process.execPath, [join(ROOT, "scripts", "astrology", "pg", "technique-grants.mjs")], { cwd: ROOT, encoding: "utf8", timeout: 6 * 60_000 });
process.stdout.write(r.stdout ?? "");
process.stderr.write(r.stderr ?? "");
const ok = r.status === 0 && /^1 PASS \/ 0 FAIL$/m.test(r.stdout ?? "");
console.log(ok ? "PASS migration 20271230000000 provası (backfill · CHECK · atomik kayıt · denetim · yetki)" : "FAIL migration 20271230000000 provası");
process.exit(ok ? 0 : 1);
