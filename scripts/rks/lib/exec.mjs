/**
 * RKS-3 izole test yürütücü: tek bir test komutunu
 *   - sır/kimlik ortam değişkenleri SİLİNMİŞ ortamda,
 *   - ağ koruması (net-guard) yüklü,
 *   - zaman aşımıyla
 * çalıştırır; çıkış kodu, süre, özet (PASS/FAIL), atlanma işaretleri ve ağ ihlallerini döndürür.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, RKS_DIR, forbiddenReason, parseSummary, skipMarkers } from "./common.mjs";

const SECRET_ENV = /(SUPABASE|ROXY|SERVICE_ROLE|DATABASE_URL|POSTGRES_URL|API_KEY|_TOKEN|TOKEN_|SECRET|PASSWORD|ANTHROPIC|OPENAI|GEMINI|DEEPL|GOOGLE_|VERCEL|INNGEST|RESEND|SMTP|AWS_|STRIPE|IYZICO|GH_|GITHUB_TOKEN|NPM_TOKEN)/i;

export function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!SECRET_ENV.test(k)) env[k] = v;
  return { ...env, ...extra };
}

export function commandFor(entry) {
  if (entry.cmd) return entry.cmd;
  const f = entry.file;
  if (/\.(mjs|cjs|js)$/.test(f) && !entry.tsx) return ["node", f];
  return ["npx", "tsx", ...(entry.tsconfig ? ["--tsconfig", entry.tsconfig] : []), f];
}

export function runTest(entry, { timeoutSec = 300, postgrestBin = process.env.POSTGREST_BIN } = {}) {
  // Çalıştırma yasağı: korunan/ertelenen alan veya B-OWNER/C/ARAC (CI'da ayrıca A olmayan) → süreç BAŞLATILMAZ.
  const refused = forbiddenReason(entry.file, { requireA: entry.requireA === true });
  if (refused) return Promise.resolve({ code: null, timedOut: false, secs: 0, summary: null, skips: [], net: [], tail: [], refused });
  return new Promise((resolve) => {
    const netLog = path.join(os.tmpdir(), `rks-net-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`);
    const guard = pathToFileURL(path.join(RKS_DIR, "net-guard.mjs")).href;
    const env = cleanEnv({
      RKS_NET_LOG: netLog,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + " " : ""}--import=${guard}`,
      NEXT_TELEMETRY_DISABLED: "1",
      ...(postgrestBin ? { POSTGREST_BIN: postgrestBin } : {}),
      ...(entry.env ?? {}),
    });
    const [cmd, ...args] = commandFor(entry);
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
    }, (entry.timeoutSec ?? timeoutSec) * 1000);
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

/**
 * Sonucu sınıflandır: PASS | YENI-FAIL | BILINEN-FAIL | ALTYAPI (sonuç alınamadı) | ATLANDI | SAYILAMADI | AG-IHLALI.
 * ALTYAPI/ATLANDI/SAYILAMADI/AG-IHLALI ASLA PASS sayılmaz.
 */
export function judge(entry, r, known) {
  if (r.refused) return { durum: "YASAK-RED", ok: false, neden: `çalıştırılmadı: ${r.refused}` };
  if (r.net.length) return { durum: "AG-IHLALI", ok: false, neden: r.net[0] };
  if (r.timedOut) return { durum: "ALTYAPI", ok: false, neden: "zaman aşımı" };
  if (r.skips.length && !entry.atlamaIzinli) return { durum: "ATLANDI", ok: false, neden: r.skips[0] };
  if (!r.summary) return { durum: r.code === 0 ? "SAYILAMADI" : "ALTYAPI", ok: false, neden: `özet satırı yok (çıkış ${r.code})` };
  const { pass, fail } = r.summary;
  const min = entry.minPass ?? 1;
  if (fail === 0 && r.code === 0) {
    if (pass < min) return { durum: "YENI-FAIL", ok: false, neden: `PASS ${pass} < alt sınır ${min} (assertion kaybı / sıfır test)` };
    return { durum: "PASS", ok: true, neden: `${pass} PASS` };
  }
  if (fail === 0 && r.code !== 0) return { durum: "YENI-FAIL", ok: false, neden: `FAIL=0 ama çıkış kodu ${r.code}` };
  if (known && fail <= known.maxFail && pass >= min && (!known.sonGecerlilik || new Date(known.sonGecerlilik) >= new Date()))
    return { durum: "BILINEN-FAIL", ok: true, neden: `${fail} FAIL ≤ kayıtlı ${known.maxFail} (${known.neden})` };
  return { durum: "YENI-FAIL", ok: false, neden: `${pass} PASS / ${fail} FAIL` };
}
