#!/usr/bin/env node
/**
 * Bağımsız regresyon koşucusu — scripts/ci/regression-tests.json listesindeki testlerin TAMAMINI çalıştırır.
 *
 *   node scripts/ci/run-regression.mjs [--only <regex>]
 *
 * Değişiklik analizi, test seçimi, PR kapsam bildirimi, etiket veya envanter kuralı YOKTUR.
 * Her test:
 *   - sır/kimlik ortam değişkenleri SİLİNMİŞ ortamda,
 *   - ağ koruması (net-guard: yalnız 127.0.0.1) yüklü,
 *   - zaman aşımıyla
 * çalışır. Test, kendi sonucuna göre geçer: çıkış 0 + okunabilir özet satırı + FAIL=0 + PASS>0 +
 * atlanan bölüm yok + dış ağ denemesi yok. Zaman aşımı / sonuçsuz çökme bir kez yeniden denenir.
 * Korunan alan (HD/Atlas/Numeroloji/Kozmik) ve ertelenen grup (Backup/Usage360/HDAY) testleri
 * listeye girse bile süreç BAŞLATILMADAN reddedilir (Owner kararı).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CI_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(CI_DIR, "..", "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const only = arg("--only") ? new RegExp(arg("--only")) : null;

const SECRET_ENV = /(SUPABASE|ROXY|SERVICE_ROLE|DATABASE_URL|POSTGRES_URL|API_KEY|_TOKEN|TOKEN_|SECRET|PASSWORD|ANTHROPIC|OPENAI|GEMINI|DEEPL|GOOGLE_|VERCEL|INNGEST|RESEND|SMTP|AWS_|STRIPE|IYZICO|GH_|GITHUB_TOKEN|NPM_TOKEN)/i;
const KORUNAN_YOL_RE = /scripts\/(hd\d*[a-z0-9]*[-_/]|human-design|astrology|astroloji|numeroloji|nkb|cosmic)|\/(hd|human-design|numeroloji)-|\/(astro|astroloji|hd|numeroloji)\//i;
const ERTELENEN_YOL_RE = /backup|usage-?360|hday/i;

function cleanEnv(extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!SECRET_ENV.test(k)) env[k] = v;
  return { ...env, ...extra };
}

function commandFor(t) {
  if (/\.(mjs|cjs|js)$/.test(t.file) && !t.tsx) return ["node", t.file];
  return ["npx", "tsx", ...(t.tsconfig ? ["--tsconfig", t.tsconfig] : []), t.file];
}

/**
 * Test çıktısından PASS/FAIL sayısı. Tanınan biçimler (mevcut harness'ların GERÇEK çıktıları):
 *   "N PASS / M FAIL" · "PASS N  FAIL M" · "N passed, M failed" · JSON "pass": N … "fail": M
 *   · "N/M PASS" (pass/total) · "PASS: N FAIL: M"
 * Son eşleşen satır esas alınır. Tanınmazsa null (= sayılamaz → PASS SAYILMAZ).
 */
export function parseSummary(output) {
  const lines = output.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].replace(/\x1b\[[0-9;]*m/g, "");
    let m;
    if ((m = l.match(/(\d+)\s*PASS(?:ED)?\s*[/,;·|]\s*(\d+)\s*FAIL/i))) return { pass: +m[1], fail: +m[2], line: l.trim() };
    if ((m = l.match(/\bPASS(?:ED)?\s*[:=]?\s*(\d+)[\s,;|/·]+FAIL(?:ED)?\s*[:=]?\s*(\d+)/i))) return { pass: +m[1], fail: +m[2], line: l.trim() };
    if ((m = l.match(/(\d+)\s+passed[,;\s]+(\d+)\s+failed/i))) return { pass: +m[1], fail: +m[2], line: l.trim() };
    if ((m = l.match(/(\d+)\s+geçti[,;\s]+(\d+)\s+kaldı/i))) return { pass: +m[1], fail: +m[2], line: l.trim() };
    if ((m = l.match(/(\d+)\s+kontrol OK[,;\s]+(\d+)\s+FAIL/i))) return { pass: +m[1], fail: +m[2], line: l.trim() };
    if ((m = l.match(/\bPASS\s*\((\d+)\s*\/\s*(\d+)\)/))) return { pass: +m[1], fail: +m[2] - +m[1], line: l.trim() };
    if ((m = l.match(/(\d+)\s*\/\s*(\d+)\s+PASS\b/))) return { pass: +m[1], fail: +m[2] - +m[1], line: l.trim() };
  }
  const p = [...output.matchAll(/"pass"\s*:\s*(\d+)/g)].pop();
  const f = [...output.matchAll(/"fail"\s*:\s*(\d+)/g)].pop();
  if (p && f) return { pass: +p[1], fail: +f[1], line: `json pass=${p[1]} fail=${f[1]}` };
  return null;
}

/** Atlanma işaretleri (sayısı sıfırdan büyükse). "0 skipped" gibi sıfır değerler atlanma sayılmaz. */
export function skipMarkers(output) {
  const hits = [];
  for (const l of output.split(/\r?\n/)) {
    if (/\bATLANDI\b/.test(l)) hits.push(l.trim());
    else if (/\b([1-9]\d*)\s+(skipped|atlandı|atlanan)\b/i.test(l)) hits.push(l.trim());
    else if (/\[(SKIP|SKIPPED)\]/.test(l)) hits.push(l.trim());
  }
  return hits;
}

function runTest(t) {
  if (KORUNAN_YOL_RE.test(t.file)) return Promise.resolve({ refused: "korunan alan (HD/Atlas/Numeroloji/Kozmik) — çalıştırma yasağı" });
  if (ERTELENEN_YOL_RE.test(t.file)) return Promise.resolve({ refused: "ertelenen grup (Backup/Usage360/HDAY) — çalıştırma yasağı" });
  return new Promise((resolve) => {
    const netLog = path.join(os.tmpdir(), `ci-net-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`);
    const guard = pathToFileURL(path.join(CI_DIR, "net-guard.mjs")).href;
    const env = cleanEnv({
      CI_NET_LOG: netLog,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + " " : ""}--import=${guard}`,
      NEXT_TELEMETRY_DISABLED: "1",
      ...(process.env.POSTGREST_BIN ? { POSTGREST_BIN: process.env.POSTGREST_BIN } : {}),
    });
    const [cmd, ...args] = commandFor(t);
    const t0 = Date.now();
    const child = spawn(cmd, args, { cwd: ROOT, env, shell: process.platform === "win32", windowsHide: true });
    let out = "";
    const add = (b) => { out += b.toString(); if (out.length > 4_000_000) out = out.slice(-2_000_000); };
    child.stdout.on("data", add);
    child.stderr.on("data", add);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
        else child.kill("SIGKILL");
      } catch { /* yok */ }
    }, (t.timeoutSec ?? 300) * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      let net = [];
      try { net = fs.readFileSync(netLog, "utf8").split(/\r?\n/).filter(Boolean); fs.rmSync(netLog, { force: true }); } catch { /* yok */ }
      resolve({
        code: timedOut ? null : code,
        timedOut,
        secs: +((Date.now() - t0) / 1000).toFixed(1),
        summary: parseSummary(out),
        skips: skipMarkers(out),
        net,
        tail: out.split(/\r?\n/).filter((l) => l.trim()).slice(-12),
      });
    });
  });
}

/** Sonuç: ok + kısa neden. Altyapı (zaman aşımı / sonuçsuz çökme) ayrıca işaretlenir (bir kez yeniden denenir). */
function judge(r) {
  if (r.refused) return { ok: false, infra: false, neden: `çalıştırılmadı: ${r.refused}` };
  if (r.net.length) return { ok: false, infra: false, neden: `dış ağ denemesi: ${r.net[0]}` };
  if (r.timedOut) return { ok: false, infra: true, neden: "zaman aşımı" };
  if (r.skips.length) return { ok: false, infra: false, neden: `atlanan bölüm: ${r.skips[0]}` };
  if (!r.summary) return { ok: false, infra: r.code !== 0, neden: `özet satırı yok (çıkış ${r.code})` };
  const { pass, fail } = r.summary;
  if (fail !== 0) return { ok: false, infra: false, neden: `${pass} PASS / ${fail} FAIL` };
  if (r.code !== 0) return { ok: false, infra: false, neden: `FAIL=0 ama çıkış kodu ${r.code}` };
  if (pass < 1) return { ok: false, infra: false, neden: "sıfır assertion" };
  return { ok: true, infra: false, neden: `${pass} PASS` };
}

async function main() {
  const list = JSON.parse(fs.readFileSync(path.join(CI_DIR, "regression-tests.json"), "utf8")).tests;
  const tests = list.filter((t) => !only || only.test(t.file));
  const missing = tests.filter((t) => !fs.existsSync(path.join(ROOT, t.file)));
  const t0 = Date.now();
  const rows = [];
  for (const t of tests) {
    if (missing.includes(t)) { rows.push({ file: t.file, ok: false, neden: "dosya yok", secs: 0 }); console.log(`FAIL ${t.file} — dosya yok`); continue; }
    let r = await runTest(t);
    let j = judge(r);
    let retried = false;
    if (j.infra) { retried = true; r = await runTest(t); j = judge(r); }
    rows.push({ file: t.file, ok: j.ok, neden: j.neden, secs: r.secs ?? 0 });
    console.log(`${j.ok ? "PASS" : "FAIL"} ${t.file} — ${j.neden} (${r.secs ?? 0}s${retried ? ", yeniden denendi" : ""})`);
    if (!j.ok) for (const l of r.tail ?? []) console.log(`    │ ${l}`);
  }
  const secs = +((Date.now() - t0) / 1000).toFixed(1);
  const failed = rows.filter((x) => !x.ok);
  const md = [
    `## Regresyon testleri — ${failed.length ? "❌ BAŞARISIZ" : "✅ GEÇTİ"}`,
    `Çalışan test: **${rows.length}** / listede ${list.length}${only ? ` (filtre: ${only})` : ""} · ${secs} sn · başarısız: **${failed.length}**`,
    failed.length ? "\n| Test | Neden |\n|---|---|\n" + failed.map((x) => `| ${x.file} | ${x.neden} |`).join("\n") : "",
  ].filter(Boolean).join("\n");
  console.log("\n" + md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  for (const f of failed) console.log(`::error::Regresyon: ${f.file} — ${f.neden}`);
  if (tests.length === 0) { console.log("::error::Regresyon: çalışacak test yok"); process.exit(1); }
  process.exit(failed.length ? 1 : 0);
}

await main();
