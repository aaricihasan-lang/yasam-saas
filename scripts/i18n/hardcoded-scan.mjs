#!/usr/bin/env node
/**
 * I18N-F1 — KULLANICIYA GÖRÜNÜR SABİT METİN DEDEKTÖRÜ + CIRCIR (ratchet) KAPISI.
 *
 * TypeScript AST'si üzerinden (yorumlar doğal olarak dışarıda) şunları sayar:
 *   jsx-text   JSX metin düğümü (en az iki harf; dilden bağımsız → ASCII Türkçe "Kaydet"/"Mineraller" de yakalanır)
 *   jsx-attr   kullanıcıya görünen JSX özniteliği (placeholder, title, aria-label, alt, label …) sabit metni
 *   tr-string  Türkçe harf (çğıöşüİ…) içeren string / template literal (hata mesajı, toast, rapor metni, sabit dizi …)
 * Hariç: import/export yolları, tip konumundaki literaller, console.* argümanları, çeviri çağrısının anahtar
 * argümanı (t("x")), nesne anahtarları, marka allowlist'i ve aynı / önceki satırda
 * `i18n-ignore: <gerekçe>` yorumu olan kanonik değerler (DB değeri, hesaplama kimliği vb.).
 * Kapsam: scripts/i18n/scope.json (Owner'a özel yönetim ekranları kapsam dışı — Owner kararı A2).
 *
 * Kullanım:
 *   node scripts/i18n/hardcoded-scan.mjs                  → özet
 *   node scripts/i18n/hardcoded-scan.mjs --report         → modül bazında envanter
 *   node scripts/i18n/hardcoded-scan.mjs --check          → CI: hiçbir dosyada taban üstüne çıkılamaz,
 *                                                           tabanda olmayan dosya 0 olmalı
 *   node scripts/i18n/hardcoded-scan.mjs --update         → tabanı yaz (yalnız koordinatör; PR'da görünür)
 *   --file <yol> (tekrarlanabilir)                        → yalnız verilen dosyaları tara (negatif testler)
 *   --root <dizin> / --baseline <dosya> / --json <çıktı>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const argAll = (f) => args.flatMap((a, i) => (a === f ? [args[i + 1]] : []));
const ROOT = path.resolve(argVal("--root") ?? path.join(here, "..", ".."));
const BASELINE = path.resolve(argVal("--baseline") ?? path.join(ROOT, "scripts", "i18n", "baseline", "hardcoded.json"));
const scope = JSON.parse(fs.readFileSync(path.join(here, "scope.json"), "utf8"));

const TR_CHARS = /[çğıöşüÇĞİÖŞÜâîûÂÎÛ]/;
const LETTERS2 = /\p{L}.*\p{L}/u;
const USER_ATTRS = new Set(["placeholder", "title", "aria-label", "alt", "label", "aria-description", "aria-placeholder", "aria-valuetext", "aria-roledescription", "summary", "helperText", "description", "emptyText", "confirmText", "cancelText"]);
const TRANSLATOR_FN = /^(t|t[A-Z]\w*|t[a-z]{1,2}|tc|tf|tl|td|translate|getTranslations|useTranslations)$/;
const brand = new RegExp(`^(?:${scope.brandAllowlist.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`);

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
function inScope(r) {
  if (scope.excludeFiles.includes(r)) return false;
  if (/(^|\/)(__tests__|__mocks__)\//.test(r) || /\.(test|spec)\.[tj]sx?$/.test(r) || r.endsWith(".d.ts")) return false;
  if (scope.expertFacingUnderAdmin.some((p) => r.startsWith(p))) return true;
  if (scope.ownerOnly.some((p) => r.startsWith(p))) return false;
  return true;
}
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

function ignoredLine(lines, line) {
  return /i18n-ignore/.test(lines[line] ?? "") || /i18n-ignore/.test(lines[line - 1] ?? "");
}

export function scanSource(fileName, text) {
  const kind = fileName.endsWith("x") ? ts.ScriptKind.TSX : fileName.endsWith(".mjs") || fileName.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const lines = text.split(/\r?\n/);
  const hits = [];
  let ignored = 0;
  const add = (node, cat, value) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    if (ignoredLine(lines, line)) { ignored++; return; }
    hits.push({ line: line + 1, cat, value: value.replace(/\s+/g, " ").trim().slice(0, 90) });
  };
  const isTranslatorArg = (node) => {
    const p = node.parent;
    if (!p || !ts.isCallExpression(p) || p.arguments[0] !== node) return false;
    let callee = p.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      if (["rich", "markup", "raw", "has"].includes(callee.name.text)) callee = callee.expression;
      else if (ts.isIdentifier(callee.expression) && callee.expression.text === "console") return true;
    }
    return ts.isIdentifier(callee) && TRANSLATOR_FN.test(callee.text);
  };
  const inConsole = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && ts.isIdentifier(p.expression.expression) && p.expression.expression.text === "console") return true;
      if (ts.isBlock(p) || ts.isSourceFile(p)) return false;
    }
    return false;
  };
  const inTypePosition = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isLiteralTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p)) return true;
      if (ts.isBlock(p) || ts.isSourceFile(p) || ts.isExpressionStatement(p)) return false;
    }
    return false;
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const v = node.getText(sf).trim();
      if (LETTERS2.test(v) && !brand.test(v)) add(node, "jsx-text", v);
    } else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf);
      const v = node.initializer.text;
      if (USER_ATTRS.has(name) && LETTERS2.test(v) && !brand.test(v.trim())) { add(node, "jsx-attr", `${name}="${v}"`); return; }
      if (TR_CHARS.test(v)) { add(node, "tr-string", v); return; }
      return;
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const v = node.text;
      const p = node.parent;
      const skip =
        !TR_CHARS.test(v) || brand.test(v.trim()) ||
        ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) ||
        (ts.isPropertyAssignment(p) && p.name === node) || ts.isPropertySignature(p) ||
        ts.isJsxAttribute(p) || isTranslatorArg(node) || inConsole(node) || inTypePosition(node) ||
        (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === "require");
      if (!skip) add(node, "tr-string", v);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { hits, ignored };
}

function moduleOf(r) {
  const p = r.split("/");
  if (p[0] === "app" && p[1] === "api") return `api/${p[2] ?? ""}${p[2] === "admin" && p[3] ? "/" + p[3] : ""}`;
  if (p[0] === "app" && p[1] === "admin") return `admin/${p[2] ?? ""}`;
  if (p[0] === "app" && p[1] === "dashboard") return `dashboard/${p[2] && !p[2].includes(".") ? p[2] : "_root"}`;
  if (p[0] === "app") return `app/${p[1] && !p[1].includes(".") ? p[1] : "_root"}`;
  if (p[0] === "lib" || p[0] === "components") return `${p[0]}/${p[1] && !p[1].includes(".") ? p[1] : "_root"}`;
  return p[0];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const only = argAll("--file").map((f) => path.resolve(ROOT, f));
  const files = only.length ? only : scope.roots.flatMap((r) => walk(path.join(ROOT, r)));
  const counts = {};
  const detail = {};
  let ignoredTotal = 0;
  for (const f of files) {
    const r = rel(f);
    if (!only.length && !inScope(r)) continue;
    const { hits, ignored } = scanSource(f, fs.readFileSync(f, "utf8"));
    ignoredTotal += ignored;
    if (hits.length) { counts[r] = hits.length; detail[r] = hits; }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const byCat = {};
  for (const hs of Object.values(detail)) for (const h of hs) byCat[h.cat] = (byCat[h.cat] ?? 0) + 1;

  if (argVal("--json")) fs.writeFileSync(argVal("--json"), JSON.stringify({ total, byCat, counts, detail }, null, 1));
  if (args.includes("--update")) {
    const sorted = Object.fromEntries(Object.keys(counts).sort().map((k) => [k, counts[k]]));
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, JSON.stringify({ aciklama: "I18N-F1 sabit metin tabanı (dosya → sayı). CI'da hiçbir dosya bu sayıyı AŞAMAZ; tabanda olmayan dosya 0 olmalı. Düşüş serbesttir — çeviri sonrası `npm run i18n:hardcoded:update` ile taban aşağı çekilir. Artış ancak Owner onayıyla güncellenir ve PR diff'inde görünür.", total, files: sorted }, null, 1) + "\n");
    console.log(`taban yazıldı: ${Object.keys(sorted).length} dosya, ${total} metin`);
    process.exit(0);
  }
  if (args.includes("--report")) {
    const mods = {};
    for (const [r, n] of Object.entries(counts)) { const m = moduleOf(r); mods[m] = mods[m] ?? { files: 0, strings: 0 }; mods[m].files++; mods[m].strings += n; }
    for (const [m, v] of Object.entries(mods).sort((a, b) => b[1].strings - a[1].strings)) console.log(`${String(v.strings).padStart(6)}  ${String(v.files).padStart(4)} dosya  ${m}`);
  }
  console.log(`sabit metin: ${total} (${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(", ")}) · ${Object.keys(counts).length} dosya · i18n-ignore ile hariç: ${ignoredTotal}`);

  if (args.includes("--check")) {
    const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")).files : {};
    const over = [];
    let canLower = 0;
    for (const [r, n] of Object.entries(counts)) {
      const b = base[r] ?? 0;
      if (n > b) over.push({ r, n, b });
    }
    for (const [r, b] of Object.entries(base)) if ((counts[r] ?? 0) < b) canLower++;
    if (over.length) {
      for (const o of over) {
        console.error(`FAIL ${o.r}: ${o.n} sabit metin (taban ${o.b}) — yeni çevrilmemiş metin eklenmiş`);
        const known = new Set();
        for (const h of detail[o.r].slice(0, 400)) if (known.size < 6 && !known.has(h.value)) { known.add(h.value); console.error(`     ${o.r}:${h.line} [${h.cat}] ${h.value}`); }
      }
      console.error(`\n❌ sabit metin kapısı: ${over.length} dosyada artış. Metni t() ile kataloğa taşıyın; kanonik değerse aynı satıra "i18n-ignore: <gerekçe>" yorumu ekleyin.`);
      process.exit(1);
    }
    console.log(`✅ sabit metin kapısı: PASS (artış yok${canLower ? `; ${canLower} dosyada taban aşağı çekilebilir` : ""})`);
  }
}
