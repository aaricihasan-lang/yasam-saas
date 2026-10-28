#!/usr/bin/env node
/**
 * RKS-3 envanter üretici: statik tarama (inventory-scan.mjs) + çalışma zamanı kanıtı
 * (verify-candidates.mjs) → scripts/rks/inventory.json.
 *
 *   node scripts/rks/build-inventory.mjs --scan <scan.json> --verify <verify.json>
 *
 * A sınıfı YALNIZ şu kanıtla verilir: main üzerinde izole çalıştırmada çıkış 0, okunabilir özet,
 * FAIL=0, PASS>0, atlanma yok, ağ ihlali yok (net-guard), çalışma ağacında yan etki yok.
 * minPass = gözlenen PASS sayısı (düşürülmesi 'rks-envanter-onayli' Owner etiketi ister).
 * Main'de FAIL veren test A YAPILMAZ ve bilinen-FAIL'e OTOMATİK EKLENMEZ (Owner kararı).
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, parseSummary, readJson } from "./lib/common.mjs";

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const scan = JSON.parse(fs.readFileSync(arg("--scan"), "utf8"));
const ver = JSON.parse(fs.readFileSync(arg("--verify"), "utf8"));
const vmap = new Map(ver.results.map((r) => [r.file, r]));
const pkg = readJson("package.json");
const RKS2 = new Set((pkg.scripts["test:urun-stok:regression"].match(/scripts\/[^\s&]+/g) ?? []));
const ASAMA1 = new Set((pkg.scripts["test:asama1"].match(/scripts\/[^\s&]+/g) ?? []));
const TOOL_RE = /(\/run-all\.mjs|\/pg-migration-check\.mjs|\/drift\/compare\.mjs|\/migration-naming-check\.mjs|\/cli\.ts|backfill|preflight|build(Dogaltas)?SeedSql|\.i18n-parity-audit)/i;

const tests = [];
for (const e of scan.entries) {
  const id = e.file.replace(/^scripts\//, "").replace(/\.(ts|mts|cts|mjs|cjs|js)$/, "");
  // Modül ataması: testin doğrudan import ettiği modüller (dolaylı bağımlılıklar footprint ile seçilir).
  const moduller = e.dogrudanModuller ?? e.moduller.map((m) => m.id);
  const ortam = e.sinyaller.postgrest ? "postgres+postgrest" : e.sinyaller.postgres ? "postgres" : "birim/sahte";
  const base = { id, file: e.file, moduller, ortam, npmScripts: e.npmScripts, ...(e.runner?.tsx ? { tsx: true } : {}), ...(e.runner?.tsconfig ? { tsconfig: e.runner.tsconfig } : {}) };
  if (e.onSinif !== "ADAY") { tests.push({ ...base, sinif: e.onSinif, neden: e.neden.join("; ") }); continue; }
  if (TOOL_RE.test(e.file)) { tests.push({ ...base, sinif: "ARAC", neden: "Test değil: koşucu/üretici/araç (yazma yapabilir) — çalıştırılmadı" }); continue; }
  const r0 = vmap.get(e.file);
  // Özet, kaydedilen son çıktı satırlarından güncel ayrıştırıcıyla yeniden okunur (biçim desteği genişlediğinde).
  const r = r0 && !r0.summary ? { ...r0, summary: parseSummary(r0.tail.join("\n")) } : r0;
  if (!r) { tests.push({ ...base, sinif: "B", neden: "Çalışma zamanı doğrulaması yapılmadı" }); continue; }
  // Doğrulama sırasında RKS-3 dosyaları eşzamanlı düzenlendiği için bu yollar yan etki sayılmaz.
  const yanEtki = (r.yanEtki ?? []).filter((x) => !/scripts\/rks\/|\.github\/workflows\/ci\.yml|package\.json$/.test(x));
  const kanit = { cikis: r.code, sure: r.secs, ozet: r.summary?.line ?? null };
  let neden = null;
  if (r.net.length) neden = `Dış ağ erişimi denedi (net-guard engelledi): ${r.net[0]}`;
  else if (r.timedOut) neden = "Zaman aşımı (240 sn)";
  else if (r.skips.length) neden = `Atlanan bölüm bildiriyor: ${r.skips[0]}`;
  else if (yanEtki.length) neden = `Çalışma ağacında yan etki: ${yanEtki.slice(0, 3).join(", ")}`;
  else if (!r.summary) neden = r.code === 0 ? "Özet satırı yok — PASS/FAIL sayısı doğrulanamıyor" : `Çalışmadı / çöktü (çıkış ${r.code})`;
  else if (r.summary.fail > 0) neden = `Bugünkü main'de FAIL: ${r.summary.pass} PASS / ${r.summary.fail} FAIL (bayat test veya gerçek hata — Owner incelemesi)`;
  else if (r.code !== 0) neden = `FAIL=0 ama çıkış kodu ${r.code}`;
  else if (r.summary.pass < 1) neden = "Sıfır assertion";
  if (neden) { tests.push({ ...base, sinif: "B", neden, kanit }); continue; }
  tests.push({
    ...base,
    sinif: "A",
    calistiran: RKS2.has(e.file) ? "rks2" : ASAMA1.has(e.file) ? "asama1" : "rks3",
    minPass: r.summary.pass,
    timeoutSec: Math.max(60, Math.ceil(r.secs * 4) + 30),
    kanit,
  });
}
tests.sort((a, b) => a.file.localeCompare(b.file));
const say = tests.reduce((a, t) => ((a[t.sinif] = (a[t.sinif] ?? 0) + 1), a), {});
const out = {
  version: 1,
  aciklama: "RKS-3 merkezî test envanteri. A = izole çalıştırmayla doğrulanmış güvenli test (CI'da seçilerek koşar); B = inceleme gerekli (otomatik çalıştırılmaz); B-OWNER = korunan alan (HD/Atlas/Numeroloji/Kozmik), yalnız salt envanter; C = yasak/ertelenmiş (production, gerçek hesap, Backup/Usage360/HDAY); ARAC = test değil.",
  dogrulama: { head: ver.head, tarih: new Date().toISOString().slice(0, 10), ortam: "temiz worktree, sır içermeyen ortam, net-guard ağ koruması, yerel embedded-postgres + PostgREST 12.2.3" },
  sayim: say,
  tests,
};
fs.writeFileSync(path.join(ROOT, "scripts/rks/inventory.json"), JSON.stringify(out, null, 1) + "\n");
console.log("inventory.json yazıldı:", say);
