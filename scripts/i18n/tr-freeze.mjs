#!/usr/bin/env node
/**
 * I18N-F1 — TÜRKÇE KATALOG DONDURMA KAPISI (bağımsız Türkçe regresyon testi).
 *
 * Kaynak dil (tr) kataloğundaki MEVCUT her anahtarın değeri, onaylı taban çizgisiyle
 * (scripts/i18n/baseline/tr-catalog.json — anahtar → SHA-256 ilk 16 hex) BİREBİR aynı kalmalı.
 *   - Değeri değişen anahtar  → FAIL (Türkçe ekran metni sessizce değişmiş)
 *   - Silinen anahtar         → FAIL
 *   - YENİ anahtar            → serbest (bilgi olarak listelenir)
 * Owner onaylı bilinçli Türkçe metin değişikliğinde taban `--update` ile yenilenir; değişiklik
 * PR diff'inde görünür (sessiz gevşetme yok).
 *
 * Kullanım: node scripts/i18n/tr-freeze.mjs [--update]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = path.join(root, "scripts", "i18n", "baseline", "tr-catalog.json");
// --from <dizin>: tabanı başka bir checkout'un messages/tr klasöründen üret (ör. origin/main kopyası).
const fromIdx = process.argv.indexOf("--from");
const dir = fromIdx > 0 ? path.resolve(process.argv[fromIdx + 1]) : path.join(root, "messages", "tr");

function leaves(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) leaves(v, key, out);
    else out[key] = v;
  }
  return out;
}
const hash = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

const current = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  for (const [k, v] of Object.entries(leaves(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))))) current[k] = hash(v);
}

if (process.argv.includes("--update")) {
  const sorted = Object.fromEntries(Object.keys(current).sort().map((k) => [k, current[k]]));
  fs.writeFileSync(BASE, JSON.stringify({ aciklama: "Türkçe katalog taban çizgisi (anahtar → SHA-256/16). Yalnız Owner onaylı Türkçe metin değişikliğinde `node scripts/i18n/tr-freeze.mjs --update` ile yenilenir.", keys: sorted }, null, 1) + "\n");
  console.log(`taban yazıldı: ${Object.keys(sorted).length} anahtar`);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASE, "utf8")).keys;
const changed = [], removed = [], added = [];
for (const [k, h] of Object.entries(base)) {
  if (!(k in current)) removed.push(k);
  else if (current[k] !== h) changed.push(k);
}
for (const k of Object.keys(current)) if (!(k in base)) added.push(k);

console.log(`Türkçe taban: ${Object.keys(base).length} anahtar · güncel: ${Object.keys(current).length} · yeni: ${added.length}`);
for (const k of added) console.log(`  + ${k}`);
for (const k of changed) console.error(`FAIL değeri değişti: ${k}`);
for (const k of removed) console.error(`FAIL silindi: ${k}`);
if (changed.length || removed.length) {
  console.error(`\n❌ Türkçe dondurma kapısı: ${changed.length} değişen, ${removed.length} silinen anahtar`);
  process.exit(1);
}
console.log("✅ Türkçe dondurma kapısı: PASS (mevcut Türkçe metinler birebir)");
