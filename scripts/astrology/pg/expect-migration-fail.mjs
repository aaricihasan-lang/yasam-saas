#!/usr/bin/env node
/**
 * ASTROLOJİ AŞAMA 7A — beklenen-hata çalıştırıcısı (yalnız yerel embedded-postgres; prod'a temas YOK).
 *
 * pg-migration-check'i verilen argümanlarla çalıştırır ve şunları ŞART koşar:
 *   • en az bir "FAIL migration" satırı VE mesajında --expect metni (ör. "ASTRO 7A:"),
 *   • fixture satırlarının hepsi OK,
 *   • assert satırlarının hepsi OK (verinin korunduğunu doğrular).
 * Bu koşullarda çıkış kodu 0; aksi halde 1.
 *
 * Kullanım: node scripts/astrology/pg/expect-migration-fail.mjs --expect "ASTRO 7A:" <pg-migration-check argümanları>
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const argv = process.argv.slice(2);
const ei = argv.indexOf("--expect");
if (ei < 0 || !argv[ei + 1]) {
  console.error("expect-migration-fail: --expect <metin> gerekli");
  process.exit(1);
}
const expected = argv[ei + 1];
const pass = argv.filter((_, i) => i !== ei && i !== ei + 1);

const r = spawnSync(process.execPath, [path.join(root, "scripts", "final-hardening", "pg-migration-check.mjs"), ...pass], { cwd: root, encoding: "utf8" });
const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
process.stdout.write(out.replace(/RESULT: (PASS|FAIL)\s*$/m, "").trimEnd() + "\n");

const lines = out.split(/\r?\n/);
const migFail = lines.some((l, i) => l.startsWith("FAIL migration") && (l + (lines[i + 1] ?? "")).includes(expected));
const fixtureFail = lines.some((l) => l.startsWith("FAIL fixture"));
const assertFail = lines.some((l) => l.startsWith("FAIL assert"));
const assertOk = lines.some((l) => l.startsWith("OK   assert"));

const ok = migFail && !fixtureFail && !assertFail && assertOk;
console.log(ok ? `EXPECTED-FAIL: PASS (migration "${expected}" ile durdu; veri korundu)` : "EXPECTED-FAIL: FAIL");
process.exit(ok ? 0 : 1);
