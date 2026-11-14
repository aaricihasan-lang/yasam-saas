#!/usr/bin/env node
/**
 * Gökyüzü Atlası — `npm run test:astrology` zincirinin CI koşucusu (KOD-01, 14.11.2026). CI işi `astro-regresyon`.
 *
 * package.json'daki `test:astrology` betiğini " && " ile komutlara ayırır (tek doğruluk kaynağı: yeni harness package.json'a
 * eklendiğinde bu dosya değişmeden kapsama girer) ve zincirin dışında tutulan ek astroloji betiklerini (EXTRA_SCRIPTS) ekler.
 * `&&` zincirinden farkı: ilk FAIL'de DURMAZ — her komut ayrı çalışır ve sonuç tek tek raporlanır (bir kırık testin arkasındaki
 * onlarca harness'ın sessizce koşmaması engellenir). Hiçbir komut yeniden denenmez.
 * Her komut:
 *   - sır/kimlik ortam değişkenleri (ROXY_API_KEY dahil) SİLİNMİŞ ortamda,
 *   - ağ koruması (scripts/ci/net-guard.mjs: yalnız yerel adres) yüklü,
 *   - zaman aşımıyla
 * çalışır. Geçme ölçütü: çıkış kodu 0 + dış ağ denemesi yok. Roxy'ye ÇAĞRI YAPMAZ (harness'lar kayıtlı fixture / sahte arka uç kullanır).
 *
 *   node scripts/astrology/astrology-run-all.mjs [--only <regex>] [--json <dosya>]
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const only = arg("--only") ? new RegExp(arg("--only")) : null;
const jsonOut = arg("--json");
const TIMEOUT_MS = 12 * 60 * 1000;
const SECRET_ENV = /(SUPABASE|ROXY|SERVICE_ROLE|DATABASE_URL|POSTGRES_URL|API_KEY|_TOKEN|TOKEN_|SECRET|PASSWORD|ANTHROPIC|OPENAI|GEMINI|DEEPL|GOOGLE_|VERCEL|INNGEST|RESEND|SMTP|AWS_|STRIPE|IYZICO|GH_|GITHUB_TOKEN|NPM_TOKEN)/i;
/** `test:astrology` zincirinde OLMAYAN ama ağsız/sırsız koşabilen astroloji betikleri. */
const EXTRA_SCRIPTS = ["test:astrology:transit02", "test:astrology:transit03"];

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const chain = String(pkg.scripts?.["test:astrology"] ?? "")
  .split(" && ")
  .map((c) => c.trim())
  .filter(Boolean);
if (!chain.length) {
  console.error("astrology-run-all: package.json içinde test:astrology bulunamadı");
  process.exit(1);
}
const commands = [...chain, ...EXTRA_SCRIPTS.filter((s) => pkg.scripts?.[s]).map((s) => `npm run ${s}`)].filter((c) => !only || only.test(c));

const netLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "astro-reg-")), "net.log");
const guard = pathToFileURL(path.join(ROOT, "scripts", "ci", "net-guard.mjs")).href;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !SECRET_ENV.test(k)));
// `npm run` gibi: package.json komutlarındaki `tsx` vb. yerel ikililer node_modules/.bin'den bulunur (Windows'ta anahtar "Path").
const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
env[pathKey] = `${path.join(ROOT, "node_modules", ".bin")}${path.delimiter}${env[pathKey] ?? ""}`;
env.CI_NET_LOG = netLog;
// CSS modülü yükleyicisi: UI bileşeni içe aktaran harness'lar `*.module.css` yüzünden çökmesin (css-module-stub.cjs başlığı).
const cssStub = path.join(ROOT, "scripts", "astrology", "css-module-stub.cjs").replace(/\\/g, "/");
env.NODE_OPTIONS = `${env.NODE_OPTIONS ? env.NODE_OPTIONS + " " : ""}--import=${guard} --require=${cssStub}`;
const label = (c) => c.replace("tsx --tsconfig scripts/astrology/tsconfig.json ", "").replace(/^node scripts\/final-hardening\/pg-migration-check\.mjs .*$/, "pg-migration-check (astrology-assert / phase2 / phase3)");

function run(cmd) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let tail = "";
    const child = spawn(cmd, { cwd: ROOT, env, shell: true, windowsHide: true });
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    const take = (d) => {
      tail = (tail + d).slice(-4000);
    };
    child.stdout.on("data", (d) => {
      take(d);
      process.stdout.write(d);
    });
    child.stderr.on("data", (d) => {
      take(d);
      process.stderr.write(d);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ cmd: label(cmd), code: code ?? (signal ? `sinyal ${signal}` : null), ms: Date.now() - t0, tail });
    });
  });
}

const results = [];
for (const c of commands) {
  console.log(`\n=== ${label(c)} ===`);
  results.push(await run(c));
}
const net = fs.existsSync(netLog) ? fs.readFileSync(netLog, "utf8").trim() : "";
console.log("\n=== astrology-run-all özeti ===");
let bad = 0;
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} ${r.cmd} (çıkış ${r.code}, ${(r.ms / 1000).toFixed(1)} sn)`);
}
if (net) {
  bad++;
  console.log(`FAIL dış ağ denemesi engellendi:\n${net}`);
}
console.log(`SONUÇ astrology-run-all: ${results.length - bad} / ${results.length} komut geçti · ${bad} başarısız`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ results: results.map(({ tail, ...r }) => ({ ...r, tail: r.code === 0 ? undefined : tail })), net }, null, 1));
process.exit(bad ? 1 : 0);
