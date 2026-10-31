#!/usr/bin/env node
/**
 * Gökyüzü Atlası — YENİ PROFESYONEL MOTORLAR (lib/astrology/pro/**) test koşucusu. CI işi `astro-pro` ve `npm run test:astrology:pro`.
 *
 * scripts/astrology/ altındaki `pro-*.harness.ts` dosyalarının HEPSİNİ keşfeder ve sırayla çalıştırır (yeni motor PR'ları merge
 * edildikçe package.json / ci.yml değişmeden kapsama girer → dört PR arasında ortak dosya çakışması olmaz).
 * Her test:
 *   - sır/kimlik ortam değişkenleri (ROXY_API_KEY dahil) SİLİNMİŞ ortamda,
 *   - ağ koruması (scripts/ci/net-guard.mjs: yalnız yerel adres) yüklü,
 *   - zaman aşımıyla
 * çalışır. Geçme ölçütü: çıkış kodu 0 + çıktıda en az bir "PASS" + dış ağ denemesi yok. Hiçbir test atlanmaz ve yeniden denenmez.
 * Roxy'ye ÇAĞRI YAPMAZ: pro-* testleri kayıtlı fixture'larla çevrimdışıdır.
 *
 *   node scripts/astrology/pro-run-all.mjs [--only <regex>]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const only = arg("--only") ? new RegExp(arg("--only")) : null;
const TIMEOUT_MS = 10 * 60 * 1000;
const SECRET_ENV = /(SUPABASE|ROXY|SERVICE_ROLE|DATABASE_URL|POSTGRES_URL|API_KEY|_TOKEN|TOKEN_|SECRET|PASSWORD|ANTHROPIC|OPENAI|GEMINI|DEEPL|GOOGLE_|VERCEL|INNGEST|RESEND|SMTP|AWS_|STRIPE|IYZICO|GH_|GITHUB_TOKEN|NPM_TOKEN)/i;

const files = fs.readdirSync(HERE).filter((f) => /^pro-.+\.harness\.ts$/.test(f)).filter((f) => !only || only.test(f)).sort();
if (!files.length) {
  console.error("pro-run-all: hiç pro-*.harness.ts bulunamadı");
  process.exit(1);
}
const netLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "astro-pro-")), "net.log");
const guard = pathToFileURL(path.join(ROOT, "scripts", "ci", "net-guard.mjs")).href;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !SECRET_ENV.test(k)));
env.CI_NET_LOG = netLog;
env.NODE_OPTIONS = `${env.NODE_OPTIONS ? env.NODE_OPTIONS + " " : ""}--import=${guard}`;
const tsx = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

function run(file) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let out = "";
    const child = spawn(process.execPath, [tsx, "--tsconfig", "scripts/astrology/tsconfig.json", path.join("scripts", "astrology", file)], { cwd: ROOT, env, windowsHide: true });
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d; process.stdout.write(d); });
    child.stderr.on("data", (d) => { out += d; process.stderr.write(d); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ file, code, ms: Date.now() - t0, passLines: (out.match(/^\s*PASS\b/gm) ?? []).length, failLines: (out.match(/^\s*FAIL\b/gm) ?? []).length });
    });
  });
}

const results = [];
for (const f of files) {
  console.log(`\n=== ${f} ===`);
  results.push(await run(f));
}
const net = fs.existsSync(netLog) ? fs.readFileSync(netLog, "utf8").trim() : "";
console.log("\n=== pro-run-all özeti ===");
let bad = 0;
for (const r of results) {
  const ok = r.code === 0 && r.passLines > 0 && r.failLines === 0;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} ${r.file} (çıkış ${r.code}, PASS satırı ${r.passLines}, FAIL satırı ${r.failLines}, ${(r.ms / 1000).toFixed(1)} sn)`);
}
if (net) {
  bad++;
  console.log(`FAIL dış ağ denemesi engellendi:\n${net}`);
}
console.log(`SONUÇ pro-run-all: ${results.length - bad} / ${results.length} dosya geçti`);
process.exit(bad ? 1 : 0);
