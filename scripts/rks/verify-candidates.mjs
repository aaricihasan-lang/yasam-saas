#!/usr/bin/env node
/**
 * RKS-3 çalışma zamanı doğrulaması (envanter kanıtı üretir; CI'da ÇALIŞMAZ).
 *
 *   node scripts/rks/verify-candidates.mjs --scan <scan.json> --out <sonuc.json> [--only <regex>]
 *
 * inventory-scan.mjs çıktısındaki ADAY testleri sırayla, sır içermeyen ortamda ve net-guard
 * ağ koruması altında çalıştırır. Her test için çıkış kodu, süre, özet, atlanma işaretleri, ağ
 * ihlali ve çalışma ağacında bıraktığı yan etkiyi (git status farkı) kaydeder.
 * B-OWNER / B / C sınıfları ÇALIŞTIRILMAZ.
 */
import fs from "node:fs";
import { git } from "./lib/common.mjs";
import { runTest } from "./lib/exec.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const scan = JSON.parse(fs.readFileSync(arg("--scan"), "utf8"));
const OUT = arg("--out");
const only = arg("--only") ? new RegExp(arg("--only")) : null;

// Test değil, araç/koşucu (yazma veya üretim yapabilir) — çalıştırılmaz.
const TOOL_RE = /(\/run-all\.mjs|\/pg-migration-check\.mjs|\/drift\/compare\.mjs|\/migration-naming-check\.mjs|\/cli\.ts|backfill|preflight|build(Dogaltas)?SeedSql|\.i18n-parity-audit)/i;

const status = () => new Set(git(["status", "--porcelain", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean));
const results = [];
const list = scan.entries.filter((e) => e.onSinif === "ADAY" && !TOOL_RE.test(e.file) && (!only || only.test(e.file)));
console.log(`${list.length} aday test izole çalıştırılacak`);
let i = 0;
for (const e of list) {
  i++;
  const before = status();
  const r = await runTest({ file: e.file, timeoutSec: 240, tsx: e.runner?.tsx, tsconfig: e.runner?.tsconfig });
  const after = status();
  const yanEtki = [...after].filter((x) => !before.has(x));
  results.push({ file: e.file, ...r, yanEtki });
  const s = r.summary ? `${r.summary.pass}/${r.summary.fail}` : "özet-yok";
  console.log(`[${i}/${list.length}] ${r.code === 0 ? "ok " : "ERR"} ${s.padEnd(9)} ${String(r.secs).padStart(6)}s ${r.net.length ? "NET!" : ""}${r.skips.length ? "SKIP!" : ""}${yanEtki.length ? "YANETKI!" : ""} ${e.file}`);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ head: git(["rev-parse", "HEAD"]).trim(), results }, null, 1));
}
