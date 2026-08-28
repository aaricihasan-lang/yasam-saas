/**
 * Stones (Doğaltaş) i18n — AŞAMA 2A TR-baseline regression harness.
 *
 * Amaç: TR mevcut görünümünün i18n taşımasıyla BOZULMADIĞINI statik olarak
 * doğrulamak. Üç kapı:
 *   1. PARITY   — her stones*.json için TR ⟷ EN leaf-key eşitliği (missing/orphan 0)
 *                 ve EN value'larının 2A baseline'ında TR ile birebir aynı olması.
 *   2. KEY-EXISTS — extract edilen kaynak dosyalardaki her `t("key")` çağrısının
 *                 merged TR kataloğunda GERÇEKTEN var olması (eksik anahtar = boş
 *                 render = TR regresyonu). Dinamik (template) anahtarlar ayrı raporlanır.
 *   3. CANONICAL — query-coupled Türkçe literallerin kaynak kodda HÂLÂ ham string
 *                 olarak durması (yanlışlıkla t() içine alınmadığının kanıtı).
 *
 * Salt-okunur; exit 1 on any failure. Çalıştır: node scripts/stones-i18n-2a-harness.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TR_DIR = join(ROOT, "messages", "tr");
const EN_DIR = join(ROOT, "messages", "en");

let fail = 0;
const err = (m) => { console.log("  ❌ " + m); fail++; };
const ok = (m) => console.log("  ✅ " + m);

function leaves(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...leaves(v, p));
    else if (Array.isArray(v)) v.forEach((x, i) => out.push([`${p}[${i}]`, x]));
    else out.push([p, v]);
  }
  return out;
}
function deepMerge(target, source) {
  const out = { ...target };
  for (const k of Object.keys(source)) {
    const nv = source[k], pv = out[k];
    out[k] = nv && typeof nv === "object" && !Array.isArray(nv) && pv && typeof pv === "object" && !Array.isArray(pv)
      ? deepMerge(pv, nv) : nv;
  }
  return out;
}

const stonesFiles = readdirSync(TR_DIR).filter((f) => f === "stones.json" || f.startsWith("stones."));

// ---- GATE 1: PARITY (keys + 2A value identity) ----
console.log("\n[GATE 1] TR⟷EN parity (stones*.json)");
let mergedTr = {};
for (const f of stonesFiles) {
  const tr = JSON.parse(readFileSync(join(TR_DIR, f), "utf8"));
  let en;
  try { en = JSON.parse(readFileSync(join(EN_DIR, f), "utf8")); }
  catch { err(`${f}: EN eşi yok/parse edilemedi`); continue; }
  const trLeaves = leaves(tr), enLeaves = leaves(en);
  const trMap = new Map(trLeaves), enMap = new Map(enLeaves);
  const missing = [...trMap.keys()].filter((k) => !enMap.has(k));
  const orphan = [...enMap.keys()].filter((k) => !trMap.has(k));
  if (missing.length) err(`${f}: EN'de EKSİK (${missing.length}): ${missing.slice(0, 8).join(", ")}`);
  if (orphan.length) err(`${f}: EN'de FAZLA (${orphan.length}): ${orphan.slice(0, 8).join(", ")}`);
  // 2A: EN value == TR value (baseline copy). 2B'de bu kasıtlı değişecek; harness 2A içindir.
  let diff = 0;
  for (const [k, v] of trMap) if (enMap.has(k) && enMap.get(k) !== v) diff++;
  if (diff) err(`${f}: ${diff} EN value TR'den farklı (2A baseline EN=TR olmalı)`);
  if (!missing.length && !orphan.length && !diff) ok(`${f}  (${trMap.size} key, EN=TR baseline)`);
  mergedTr = deepMerge(mergedTr, tr);
}

// Flatten merged TR to a key-set for existence checks
const mergedKeys = new Set(leaves(mergedTr).map(([k]) => k));

// ---- GATE 2: KEY-EXISTS (every t("key") resolves) ----
console.log("\n[GATE 2] t(\"key\") çağrıları merged TR kataloğunda var mı");
const SRC_FILES = [
  "app/dogaltas/page.tsx",
  "app/dogaltas/layout.tsx",
  "app/dogaltas/dogaltas-kayit/page.tsx",
  "app/dogaltas/dogaltas-listesi/page.tsx",
  "app/dogaltas/dogaltas-listesi/[id]/page.tsx",
  "app/dogaltas/mineral-bankasi/page.tsx",
  "app/dogaltas/mineral-listesi/page.tsx",
  "app/dogaltas/mineral-listesi/[id]/page.tsx",
  "app/dogaltas/kombinasyon-olustur/page.tsx",
  "app/dogaltas/kombinasyonlar/page.tsx",
  "app/dogaltas/kombinasyonlar/[title]/page.tsx",
  "app/dogaltas/tas-bilgi-kutuphanesi/page.tsx",
  "app/dogaltas/components/DogaltasBreadcrumb.tsx",
  "app/dogaltas/components/DogaltasSectionShell.tsx",
  "app/dogaltas/components/DogaltasFontSizeControl.tsx",
  "app/dogaltas/components/DuplicateWarningModal.tsx",
  "app/dogaltas/components/MineralCombobox.tsx",
  "app/dogaltas/components/SaveCombinationModal.tsx",
  "app/dogaltas/components/StoneDetailDrawer.tsx",
  "app/dogaltas/components/StoneReaderModal.tsx",
];
let checked = 0, dynamic = 0;
for (const rel of SRC_FILES) {
  let src;
  try { src = readFileSync(join(ROOT, rel), "utf8"); } catch { continue; }
  // Map each translator VARIABLE to its exact stones scope:
  //   const <var> = useTranslations("stones.xxx")  /  = getTranslations("stones.xxx")
  const varScope = new Map();
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*["'`](stones[^"'`]*)["'`]\s*\)/g)) {
    varScope.set(m[1], m[2]);
  }
  if (varScope.size === 0) continue;
  // Only match EXACT translator variables (avoids false hits like tint("violet"), Intl…("tr-TR")).
  const vars = [...varScope.keys()].sort((a, b) => b.length - a.length).map((v) => v.replace(/[$]/g, "\\$"));
  const callRe = new RegExp(`\\b(${vars.join("|")})(?:\\.rich)?\\(\\s*(["'\`])([^"'\`]*)\\2`, "g");
  for (const m of src.matchAll(callRe)) {
    const [, v, quote, key] = m;
    if (quote === "`") { dynamic++; continue; } // template-literal (dynamic) key — verified manually
    checked++;
    const scope = varScope.get(v);
    if (!mergedKeys.has(`${scope}.${key}`)) err(`${rel}: ${v}("${key}") → ${scope}.${key} kataloğda YOK`);
  }
  // also count dynamic template calls of the form t(`...`)
  const dynMore = [...src.matchAll(new RegExp(`\\b(${vars.join("|")})(?:\\.rich)?\\(\\s*\``, "g"))].length;
  dynamic += Math.max(0, dynMore); // approximate; template keys are hand-checked
}
if (fail === 0) ok(`${checked} statik t() anahtarı doğrulandı (${dynamic} dinamik/template anahtar elle kontrol edilecek)`);
else console.log(`  (${checked} statik anahtar tarandı, ${dynamic} dinamik anahtar atlandı)`);

// ---- GATE 3: CANONICAL / query-coupled literals still hardcoded ----
console.log("\n[GATE 3] Query-coupled canonical literaller kaynak kodda ham string olarak duruyor mu");
const CANON = [
  ["app/dogaltas/dogaltas-kayit/page.tsx", ["Kök Çakra", "Genel Uyarı", "Hamilelik", "Mineraller", "Elementler"]],
  ["app/dogaltas/dogaltas-listesi/page.tsx", ["Kök", "Sakral", "Solar Pleksus"]],
  ["app/dogaltas/mineral-listesi/page.tsx", ["Kategorisiz"]],
  ["app/dogaltas/kombinasyonlar/page.tsx", ["İsimsiz"]],
  ["app/dogaltas/tas-bilgi-kutuphanesi/page.tsx", ["Tümü"]],
];
for (const [rel, lits] of CANON) {
  let src;
  try { src = readFileSync(join(ROOT, rel), "utf8"); } catch { err(`${rel}: okunamadı`); continue; }
  for (const lit of lits) {
    if (src.includes(`"${lit}"`) || src.includes(`'${lit}'`) || src.includes(`>${lit}<`)) ok(`${rel}: "${lit}" ham literal korunmuş`);
    else err(`${rel}: "${lit}" ham literal BULUNAMADI (query-coupled değer yanlışlıkla değişmiş olabilir)`);
  }
}

console.log("\n=== SONUÇ ===");
console.log(fail === 0 ? "✅ TÜM KAPILAR GEÇTİ" : `❌ ${fail} HATA`);
process.exit(fail === 0 ? 0 : 1);
