#!/usr/bin/env node
/**
 * I18N-F1 — Çeviri kataloğu KALİTE KAPISI (ağ / DB / sır yok; CI regresyon listesinde koşar).
 *
 * FAIL kuralları:
 *   C1  Dil klasörleri aynı dosya kümesine sahip.
 *   C2  Her dosyada diller arası yaprak anahtar eşitliği (eksik / fazla anahtar yok).
 *   C3  Boş değer yok (bilinçli boşlar scripts/i18n/baseline/allowed-empty.json'da gerekçesiyle).
 *   C4  Aynı dildeki iki dosya aynı anahtarı tanımlamaz (birleştirme sırası anlam taşımaz).
 *   C5  Her değer ICU olarak ayrıştırılır (next-intl'in çalışma anındaki ayrıştırıcısıyla aynı sözdizimi).
 *   C6  Argüman / değişken / etiket kümesi diller arasında aynı ({name}, çoğul değişkeni, <b> etiketi).
 *   C7  Her plural / select ifadesinde `other` dalı var.
 *   C8  Kodda statik olarak kullanılan her anahtar katalogda var (t("x"), t.rich, t.has ile korunmuş olsa da).
 *   C9  Dinamik anahtarların (t(`ön.${x}`)) statik ön eki katalogda bir nesne olarak var.
 *   C10 Katalog kaydı (i18n/catalog.generated.ts) güncel ve lib/i18n/locales.ts ACTIVE_LOCALES ile uyumlu.
 * Bilgi (FAIL değil): korumasız dinamik anahtar listesi, kullanılmayan anahtar adayları.
 *
 * Kullanım: node scripts/i18n/catalog-check.mjs [--root <dizin>] [--json <çıktı>] [--quiet]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, TYPE } from "@formatjs/icu-messageformat-parser";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const ROOT = path.resolve(argVal("--root") ?? path.join(here, "..", ".."));
const QUIET = args.includes("--quiet");
const MSG = path.join(ROOT, "messages");
const CODE_DIRS = ["app", "components", "hooks", "lib"];

const failures = [];
const infos = [];
const fail = (rule, msg) => failures.push(`${rule} ${msg}`);

// ---------------------------------------------------------------- katalog
function leaves(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) leaves(v, key, out);
    else out.set(key, v);
  }
  return out;
}
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const locales = fs.readdirSync(MSG).filter((d) => fs.statSync(path.join(MSG, d)).isDirectory()).sort();
const filesBy = Object.fromEntries(locales.map((l) => [l, fs.readdirSync(path.join(MSG, l)).filter((f) => f.endsWith(".json")).sort()]));
const SOURCE = "tr";
if (!locales.includes(SOURCE)) fail("C1", "messages/tr yok");

const allowedEmptyPath = path.join(ROOT, "scripts", "i18n", "baseline", "allowed-empty.json");
const allowedEmpty = fs.existsSync(allowedEmptyPath) ? new Set(Object.keys(readJson(allowedEmptyPath).keys ?? {})) : new Set();
const allowedArgPath = path.join(ROOT, "scripts", "i18n", "baseline", "allowed-arg-diff.json");
const allowedArgDiff = fs.existsSync(allowedArgPath) ? new Set(Object.keys(readJson(allowedArgPath).keys ?? {})) : new Set();

for (const l of locales) {
  const a = new Set(filesBy[SOURCE]), b = new Set(filesBy[l]);
  for (const f of a) if (!b.has(f)) fail("C1", `${l}: ${f} eksik`);
  for (const f of b) if (!a.has(f)) fail("C1", `${l}: ${f} fazla (tr'de yok)`);
}

const merged = {}; // locale → Map(key → {value,file})
for (const l of locales) {
  merged[l] = new Map();
  for (const f of filesBy[l]) {
    let obj;
    try { obj = readJson(path.join(MSG, l, f)); } catch (e) { fail("C5", `${l}/${f}: JSON okunamadı — ${e.message}`); continue; }
    for (const [k, v] of leaves(obj)) {
      const prev = merged[l].get(k);
      if (prev) fail("C4", `${l}: "${k}" hem ${prev.file} hem ${f} içinde`);
      merged[l].set(k, { value: v, file: f });
    }
  }
}
// yaprak ↔ nesne çakışması (a.b hem metin hem nesne)
for (const l of locales) {
  for (const k of merged[l].keys()) {
    const parts = k.split(".");
    for (let i = 1; i < parts.length; i++) {
      const pre = parts.slice(0, i).join(".");
      if (merged[l].has(pre)) fail("C4", `${l}: "${pre}" hem metin hem nesne`);
    }
  }
}

function argsOf(ast, out = new Set()) {
  for (const el of ast) {
    if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time) out.add(`{${el.value}}`);
    if (el.type === TYPE.select || el.type === TYPE.plural) {
      out.add(`{${el.value}}`);
      for (const opt of Object.values(el.options)) argsOf(opt.value, out);
    }
    if (el.type === TYPE.tag) { out.add(`<${el.value}>`); argsOf(el.children, out); }
  }
  return out;
}
function checkOther(ast, where) {
  for (const el of ast) {
    if ((el.type === TYPE.select || el.type === TYPE.plural) && !el.options.other) fail("C7", `${where}: {${el.value}} ifadesinde "other" dalı yok`);
    if (el.type === TYPE.select || el.type === TYPE.plural) for (const opt of Object.values(el.options)) checkOther(opt.value, where);
    if (el.type === TYPE.tag) checkOther(el.children, where);
  }
}

const astCache = new Map();
for (const l of locales) {
  for (const [k, { value, file }] of merged[l]) {
    const where = `${l}/${file}:${k}`;
    if (value === "" || value === null || value === undefined) {
      if (!allowedEmpty.has(`${l}:${k}`)) fail("C3", `${where} boş`);
      continue;
    }
    // Metin dizileri (t.raw ile okunan madde listeleri) desteklenir: her öğe ayrı ayrı ICU denetiminden geçer.
    const items = Array.isArray(value) ? value : [value];
    if (Array.isArray(value)) {
      const srcVal = merged[SOURCE]?.get(k)?.value;
      if (Array.isArray(srcVal) && srcVal.length !== value.length) fail("C2", `${where} dizi uzunluğu tr ile farklı (${srcVal.length} ≠ ${value.length})`);
    }
    const asts = [];
    for (const [i, item] of items.entries()) {
      const w = Array.isArray(value) ? `${where}[${i}]` : where;
      if (typeof item !== "string") { fail("C5", `${w} metin değil (${typeof item})`); continue; }
      if (item === "" && !allowedEmpty.has(`${l}:${k}`)) fail("C3", `${w} boş`);
      try {
        const ast = parse(item);
        asts.push(...ast);
        checkOther(ast, w);
      } catch (e) { fail("C5", `${w} ICU ayrıştırılamadı — ${e.message}`); }
    }
    astCache.set(`${l}:${k}`, asts);
  }
}
for (const l of locales) {
  if (l === SOURCE) continue;
  for (const [k, { file }] of merged[SOURCE]) {
    if (!merged[l].has(k)) { fail("C2", `${l}/${file}: "${k}" eksik`); continue; }
    const a = astCache.get(`${SOURCE}:${k}`), b = astCache.get(`${l}:${k}`);
    if (a && b) {
      const sa = [...argsOf(a)].sort().join(","), sb = [...argsOf(b)].sort().join(",");
      if (sa !== sb && !allowedArgDiff.has(`${l}:${k}`)) fail("C6", `${l}/${file}:${k} argümanlar farklı — tr[${sa}] ${l}[${sb}]`);
    }
  }
  for (const [k, { file }] of merged[l]) if (!merged[SOURCE].has(k)) fail("C2", `${l}/${file}: "${k}" fazla (tr'de yok)`);
}

// ---------------------------------------------------------------- kod kullanımı
const sourceKeys = merged[SOURCE] ?? new Map();
const objectPrefixes = new Set();
for (const k of sourceKeys.keys()) { const p = k.split("."); for (let i = 1; i < p.length; i++) objectPrefixes.add(p.slice(0, i).join(".")); }
const existsLeaf = (k) => sourceKeys.has(k);
const existsAny = (k) => sourceKeys.has(k) || objectPrefixes.has(k);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}
function stripComments(src) {
  // Basit ve güvenli: blok yorumlar + satır başı/boşluk sonrası // yorumları (URL'lerdeki // dokunulmaz).
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[\s;{}()])\/\/.*$/gm, "$1");
}
const usedStatic = new Set();
const dynamicPrefixes = [];
const unguardedDynamic = [];
let codeFiles = 0;
for (const d of CODE_DIRS) {
  for (const file of walk(path.join(ROOT, d))) {
    const raw = fs.readFileSync(file, "utf8");
    if (!/useTranslations|getTranslations|createTranslator|getOutputTranslator/.test(raw)) continue;
    codeFiles++;
    const src = stripComments(raw);
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    // değişken → bağlandığı namespace kümesi (aynı adla birden çok bileşende yeniden tanımlanabilir)
    const ns = new Map();
    const bind = (v, n) => { if (!ns.has(v)) ns.set(v, new Set()); ns.get(v).add(n); };
    for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations|getOutputTranslator)\(\s*(?:[^,()]*,\s*)?(?:\{\s*(?:locale\s*:\s*[^,}]+,\s*)?namespace\s*:\s*)?["'`]([^"'`$]*)["'`]/g)) bind(m[1], m[2]);
    for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*\)/g)) bind(m[1], "");
    for (const [v, nsSet] of ns) {
      const call = `\\b${v}(?:\\.(rich|markup|raw|has))?\\(\\s*`;
      for (const m of src.matchAll(new RegExp(`${call}(["'])([^"'\\n]+)\\2`, "g"))) {
        const key = m[3];
        const candidates = [...nsSet].map((n) => (n ? `${n}.${key}` : key));
        const ok = m[1] === "raw" ? candidates.some(existsAny) : candidates.some(existsLeaf);
        candidates.forEach((c) => usedStatic.add(c));
        if (!ok) fail("C8", `${rel}: ${v}${m[1] ? "." + m[1] : ""}("${key}") → katalogda yok (ns: ${[...nsSet].join("|") || "(kök)"})`);
      }
      for (const m of src.matchAll(new RegExp(`${call}\`([^\`]*)\``, "g"))) {
        const tpl = m[2];
        if (!tpl.includes("${")) {
          const candidates = [...nsSet].map((n) => (n ? `${n}.${tpl}` : tpl));
          candidates.forEach((c) => usedStatic.add(c));
          if (!candidates.some(existsLeaf)) fail("C8", `${rel}: ${v}(\`${tpl}\`) → katalogda yok`);
          continue;
        }
        const staticPart = tpl.split("${")[0].replace(/\.$/, "");
        const candidates = [...nsSet].map((n) => [n, staticPart].filter(Boolean).join("."));
        candidates.forEach((c) => dynamicPrefixes.push(c));
        if (staticPart && !candidates.some((c) => objectPrefixes.has(c))) fail("C9", `${rel}: ${v}(\`${tpl}\`) → "${candidates.join("|")}" katalogda nesne değil`);
        // korunmuş mu? aynı satırda / hemen öncesinde .has( ile aynı şablon
        const lineStart = src.lastIndexOf("\n", m.index) + 1;
        const context = src.slice(Math.max(0, lineStart - 200), m.index + m[0].length + 200);
        if (m[1] !== "has" && !context.includes(`${v}.has(\``)) {
          const line = src.slice(0, m.index).split("\n").length;
          unguardedDynamic.push(`${rel}:${line} ${v}(\`${tpl}\`)`);
        }
      }
    }
  }
}
const isUsed = (k) => usedStatic.has(k) || dynamicPrefixes.some((p) => p && (k === p || k.startsWith(p + ".")));
const unused = [...sourceKeys.keys()].filter((k) => !isUsed(k));

// ---------------------------------------------------------------- kayıt (C10)
const gen = path.join(ROOT, "i18n", "catalog.generated.ts");
if (!fs.existsSync(gen)) fail("C10", "i18n/catalog.generated.ts yok");
else {
  const genSrc = fs.readFileSync(gen, "utf8");
  for (const l of locales) for (const f of filesBy[l]) if (!genSrc.includes(`"@/messages/${l}/${f}"`)) fail("C10", `kayıtta yok: messages/${l}/${f} (npm run i18n:catalog)`);
  for (const m of genSrc.matchAll(/"@\/messages\/(\w+)\/([^"]+)"/g)) if (!filesBy[m[1]]?.includes(m[2])) fail("C10", `kayıtta olup diskte olmayan: messages/${m[1]}/${m[2]}`);
}
const locSrc = fs.readFileSync(path.join(ROOT, "lib", "i18n", "locales.ts"), "utf8");
const active = (/ACTIVE_LOCALES\s*=\s*\[([^\]]*)\]/.exec(locSrc)?.[1] ?? "").match(/[a-z]{2}/g) ?? [];
for (const a of active) if (!locales.includes(a)) fail("C10", `ACTIVE_LOCALES "${a}" için messages/${a} yok`);
for (const l of locales) if (!active.includes(l)) fail("C10", `messages/${l} var ama ACTIVE_LOCALES'ta yok`);

// ---------------------------------------------------------------- rapor
infos.push(`diller: ${locales.join(", ")} · dosya/dil: ${filesBy[SOURCE].length} · anahtar (tr): ${sourceKeys.size}`);
infos.push(`taranan i18n'li kod dosyası: ${codeFiles} · statik anahtar kullanımı: ${usedStatic.size} · dinamik çağrı: ${dynamicPrefixes.length}`);
infos.push(`BİLGİ korumasız dinamik anahtar (t.has yok): ${unguardedDynamic.length}`);
infos.push(`BİLGİ kullanılmayan anahtar adayı (dinamik kullanım hariç tutuldu): ${unused.length}`);

const jsonOut = argVal("--json");
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ failures, infos, unguardedDynamic, unused }, null, 2));
if (!QUIET) {
  for (const i of infos) console.log(i);
  if (args.includes("--verbose")) { unguardedDynamic.forEach((u) => console.log("  ~", u)); }
}
if (failures.length) {
  for (const f of failures) console.error("FAIL", f);
  console.error(`\n❌ i18n katalog kapısı: ${failures.length} hata`);
  process.exit(1);
}
console.log("✅ i18n katalog kapısı: PASS (C1–C10)");
