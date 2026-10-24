#!/usr/bin/env node
/**
 * DB-02 (satış öncesi AŞAMA 1) — migration adlandırma/sıra koruması. Ağ/DB YOK.
 *
 * Geçmiş DEĞİŞTİRİLMEZ: mevcut 16 önek çakışması ve ileri tarihli adlar prod migration
 * geçmişinin parçasıdır; yeniden adlandırılmaz. Bu betik yalnız YENİ eklenen dosyaları kısıtlar:
 *   1) Ad biçimi: 14 haneli önek + "_" + [a-z0-9_] + .sql  (mevcut tek istisna: *.POSTDEPLOY.sql)
 *   2) Önek tekilliği: KNOWN_DUPLICATE_PREFIXES dışında aynı 14 haneli önek ikinci kez kullanılamaz.
 *   3) Sıra: --base <git-ref> verilirse, o ref'e göre EKLENEN her migration'ın öneki base'deki en büyük
 *      önekten BÜYÜK olmalıdır (aksi halde uygulama sırası geçmişin arasına düşer).
 *
 * Kullanım:  node scripts/ci/migration-naming-check.mjs [--base origin/main]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dir = path.join(root, "supabase", "migrations");
const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const baseRef = baseIdx >= 0 ? args[baseIdx + 1] : null;

/** 2026-10-20 itibarıyla geçmişte var olan önek çakışmaları (değiştirilmez, yalnız dondurulur). */
const KNOWN_DUPLICATE_PREFIXES = new Set([
  "20260625160000", "20260705120000", "20260724000000", "20260803000000", "20260925000000",
  "20260927000000", "20260928000000", "20260930000000", "20261001000000", "20261004000000",
  "20261217000000", "20261228000000", "20261228000100", "20270101000000", "20270111000000",
  "20270123000000",
]);
const NAME_RE = /^(\d{14})_[a-z0-9_]+(\.POSTDEPLOY)?\.sql$/;

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const errors = [];
const byPrefix = new Map();
for (const f of files) {
  const m = NAME_RE.exec(f);
  if (!m) { errors.push(`Ad biçimi geçersiz: ${f}`); continue; }
  byPrefix.set(m[1], [...(byPrefix.get(m[1]) ?? []), f]);
}
for (const [prefix, list] of byPrefix) {
  if (list.length > 1 && !KNOWN_DUPLICATE_PREFIXES.has(prefix)) {
    errors.push(`Önek çakışması (yeni): ${prefix} → ${list.join(", ")}`);
  }
}

if (baseRef) {
  let baseFiles = [];
  let added = [];
  try {
    baseFiles = execFileSync("git", ["ls-tree", "--name-only", `${baseRef}:supabase/migrations`], { cwd: root, encoding: "utf8" })
      .split("\n").filter((f) => f.endsWith(".sql"));
    const baseSet = new Set(baseFiles);
    added = files.filter((f) => !baseSet.has(f));
  } catch (e) {
    errors.push(`Base ref okunamadı (${baseRef}): ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  }
  const maxBase = baseFiles.map((f) => (NAME_RE.exec(f) ?? [])[1]).filter(Boolean).sort().at(-1) ?? "";
  for (const f of added) {
    const p = (NAME_RE.exec(f) ?? [])[1] ?? "";
    if (p && p <= maxBase) errors.push(`Sıra: yeni migration ${f} öneki base'deki en büyük önekten (${maxBase}) büyük olmalı`);
  }
  console.log(`Base ${baseRef}: ${baseFiles.length} migration, eklenen ${added.length}${added.length ? ": " + added.join(", ") : ""}`);
}

console.log(`Migration: ${files.length} dosya, ${byPrefix.size} önek, bilinen çakışma ${KNOWN_DUPLICATE_PREFIXES.size}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log("RESULT: PASS");
