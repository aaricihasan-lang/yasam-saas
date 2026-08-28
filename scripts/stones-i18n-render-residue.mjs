/**
 * Stones (Doğaltaş) i18n — RENDER-PATH Turkish residue scanner (AŞAMA 2D gate).
 *
 * Katalog değil, GERÇEK RENDER pozisyonlarında kalan system-owned Türkçe metni yakalar:
 *   - JSX text children:            >... Türkçe ...<
 *   - display attribute literalleri: placeholder= / title= / aria-label= / alt= / label= = "...Türkçe..."
 * KEEP olarak dışlanır: value= / name= / key= / id= / case/=== karşılaştırmaları / const veri /
 *   yorum satırları / t() anahtarları (zaten ASCII) / marka "Yaşam Sistemi".
 *
 * NOT kanıt DEĞİL bir tarama aracıdır: aday listeler; her aday elle sınıflanır. Ama
 * temiz kalması beklenen (intentional brand hariç) render-residue göstergesidir.
 * Salt-okunur. Çalıştır: node scripts/stones-i18n-render-residue.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const BASE = join(ROOT, "app", "dogaltas");
const TURK = /[çğıİöşüÇĞİÖŞÜ]/;
// marka + bilinen istisnalar (render'da Türkçe kalması kabul)
const ALLOW = [/Yaşam Sistemi/i, /YAŞAM SİSTEMİ/];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}
function allowed(s) { return ALLOW.some((r) => r.test(s)); }

const files = walk(BASE);
let hits = 0;
const rows = [];
for (const fp of files) {
  const rel = fp.replace(ROOT + "\\", "").replace(ROOT + "/", "").split("\\").join("/");
  const lines = readFileSync(fp, "utf8").split(/\r?\n/);
  let inBlockComment = false;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // yorum satırlarını atla (kaba)
    if (inBlockComment) { if (line.includes("*/")) inBlockComment = false; return; }
    if (trimmed.startsWith("//")) return;
    if (trimmed.startsWith("/*")) { if (!line.includes("*/")) inBlockComment = true; return; }
    if (trimmed.startsWith("*")) return;

    // 1) display attribute literalleri
    for (const m of line.matchAll(/\b(placeholder|title|aria-label|alt|label)\s*=\s*"([^"]*)"/g)) {
      const val = m[2];
      if (TURK.test(val) && !allowed(val)) { hits++; rows.push(`${rel}:${i + 1}  [attr ${m[1]}]  "${val}"`); }
    }
    // 2) JSX text children: >...Türkçe...<  (yalnız düz metin; {..} ifade içermeyen)
    for (const m of line.matchAll(/>([^<>{}]*[çğıİöşüÇĞİÖŞÜ][^<>{}]*)</g)) {
      const txt = m[1].trim();
      if (txt && !allowed(txt)) { hits++; rows.push(`${rel}:${i + 1}  [jsx-text]  "${txt}"`); }
    }
  });
}
console.log(`Scanned ${files.length} .tsx under app/dogaltas`);
console.log(`\n[RENDER-PATH TURKISH RESIDUE candidates] ${hits}`);
for (const r of rows) console.log("  ⚠️  " + r);
console.log(`\n=== ${hits === 0 ? "✅ CLEAN (no render-path Turkish residue)" : `${hits} candidate(s) — classify each`} ===`);
process.exit(hits === 0 ? 0 : 1);
