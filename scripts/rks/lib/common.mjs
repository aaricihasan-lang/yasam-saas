/**
 * RKS-3 ortak yardımcılar: glob eşleme, git farkı, test özet satırı ayrıştırma.
 * Harici bağımlılık YOK (yalnız Node yerleşik modülleri).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const RKS_DIR = path.join(ROOT, "scripts", "rks");

export function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

export const toPosix = (p) => p.split(path.sep).join("/");

/**
 * ÇALIŞTIRMA YASAĞI (Owner kararı): korunan alanlar (HD / Atlas / Numeroloji / Kozmik) ve ertelenen
 * gruplar (Backup / Usage360 / HDAY). Desen tam yol üzerinde uygulanır (hd-, hd_, hd2c-, astro/ …);
 * Refleksoloji "atlas"ı kapsam DIŞIDIR.
 */
export const KORUNAN_YOL_RE = /scripts\/(hd\d*[a-z0-9]*[-_/]|human-design|astrology|astroloji|numeroloji|nkb|cosmic)|\/(hd|human-design|numeroloji)-|\/(astro|astroloji|hd|numeroloji)\//i;
export const ERTELENEN_YOL_RE = /backup|usage-?360|hday/i;

let _inv;
function inventoryClasses() {
  if (_inv === undefined) {
    try { _inv = new Map(readJson("scripts/rks/inventory.json").tests.map((t) => [t.file, t.sinif])); } catch { _inv = null; }
  }
  return _inv;
}

/**
 * Bir test dosyasının çalıştırılması yasak mı? Yasaksa nedeni döner (süreç BAŞLATILMADAN önce).
 *   - Yol korunan/ertelenen desene uyuyorsa → yasak (depo içi veya dışı fark etmez).
 *   - Depo içi dosya envanterde B-OWNER / C / ARAC ise → yasak.
 *   - requireA: depo içi dosya envanterde A değilse → yasak (CI kapısı yalnız A çalıştırır).
 */
export function forbiddenReason(file, { requireA = false } = {}) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  const rel = toPosix(path.relative(ROOT, abs));
  const inRepo = !rel.startsWith("..") && !path.isAbsolute(rel);
  // Depo içinde göreli yol (klon dizininin adı karar vermez), depo dışında tam yol denetlenir.
  const target = inRepo ? rel : toPosix(abs);
  if (KORUNAN_YOL_RE.test(target)) return "korunan alan (HD/Atlas/Numeroloji/Kozmik) — çalıştırma yasağı";
  if (ERTELENEN_YOL_RE.test(target)) return "ertelenen grup (Backup/Usage360/HDAY) — çalıştırma yasağı";
  if (!inRepo) return null; // depo dışı sentetik dosya (öz-test)
  const sinif = inventoryClasses()?.get(rel);
  if (sinif && ["B-OWNER", "C", "ARAC"].includes(sinif)) return `envanter sınıfı ${sinif} — çalıştırma yasağı`;
  if (requireA && sinif !== "A") return `envanterde A değil (${sinif ?? "kayıtsız"}) — CI yalnız A çalıştırır`;
  return null;
}

/** Basit glob → RegExp: `**` (dizinler dahil), `*` (tek seviye), `?`. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(file, globs) {
  return (globs ?? []).some((g) => globToRegExp(g).test(file));
}

export function git(args, opts = {}) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}

/** base...head (merge-base) farkı: [{status, file, oldFile?}] — silinen/yeniden adlandırılan dahil. */
export function changedFiles(base, head = "HEAD") {
  const out = git(["diff", "--name-status", "-M", `${base}...${head}`]);
  const rows = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0][0];
    if (status === "R" || status === "C") rows.push({ status, file: parts[2], oldFile: parts[1] });
    else rows.push({ status, file: parts[1] });
  }
  return rows;
}

export function fileAt(ref, file) {
  try {
    return git(["show", `${ref}:${file}`], { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
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

/** Test kaynak kodundaki assertion çağrısı sayısı (assertion azaltma denetimi için yaklaşık sayaç). */
export function countAssertions(src) {
  if (!src) return 0;
  const re = /\b(?:ok|check|expect|assert(?:\.[a-zA-Z]+)?|eq|equal|deepEqual|strictEqual|same|truthy|H\.ok|t\.(?:ok|is|equal|deepEqual))\s*\(/g;
  return (src.match(re) ?? []).length;
}
