#!/usr/bin/env node
/**
 * DY premium — "yalnız görünüm değişti" denetleyicisi.
 *
 * Verilen her dosya için origin/main (veya --base) sürümü ile çalışma kopyasını TypeScript AST'sine çevirir,
 * ardından şunları NORMALLEŞTİRİR (karşılaştırma dışı bırakır):
 *   - JSX `className` ve `style` öznitelikleri,
 *   - yalnız sınıf listesi taşıyan dize sabitleri (ör. `const inputCls = "w-full ..."`) — Tailwind belirteç deseni,
 *   - `@/app/_premium/...` ve `lucide-react` importları, salt-dekor `aria-hidden` ikon öğeleri (lucide bileşenleri).
 * Kalan her fark (olay bağlayıcısı, koşul, veri, metin, API çağrısı, yeni öğe) RAPORLANIR ve çıkış kodu 1 olur.
 * Bilinçli JSX yerleşim farkları (öğe taşıma/sarma) için --allow <dosya:not> ile gerekçe yazılır; yine listelenir.
 *
 * Kullanım: node scripts/dy-premium/presentation-guard.mjs [--base origin/main] <dosya...>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const args = process.argv.slice(2);
let base = "origin/main";
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--base") base = args[++i];
  else files.push(args[i]);
}

const CLASSY = /^[\s\w:\-[\]/.%#(),!&>*=+'"@~]*$/;
const TW_TOKEN = /(^|\s)(?:[a-z]+:)*-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|min-w|min-h|max-w|max-h|text|bg|border|rounded|shadow|flex|grid|gap|items|justify|font|leading|tracking|ring|from|to|via|opacity|inline|block|hidden|overflow|truncate|whitespace|cursor|transition|duration|hover|focus|space|divide|z|top|left|right|bottom|inset|absolute|relative|fixed|sticky|col|row|self|place|shrink|grow|backdrop|blur|outline|accent|underline|uppercase|sr|select|resize|object|aspect|line|ease|scale|translate|origin|order|list)(?:-|$|\s|\[)/;

function isClassString(text) {
  const t = text.trim();
  if (!t || !CLASSY.test(t)) return false;
  return t.split(/\s+/).filter((x) => TW_TOKEN.test(" " + x)).length >= Math.max(1, Math.ceil(t.split(/\s+/).length * 0.6));
}

function normalize(src, fileName) {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lucide = new Set();
  const transformer = (ctx) => {
    const visit = (node) => {
      if (ts.isImportDeclaration(node)) {
        const m = node.moduleSpecifier.text;
        if (m === "lucide-react") {
          node.importClause?.namedBindings?.elements?.forEach((e) => lucide.add(e.name.text));
          return undefined;
        }
        if (m.startsWith("@/app/_premium/")) return undefined;
      }
      if (ts.isJsxAttribute(node) && ["className", "style"].includes(node.name.getText?.(sf) ?? node.name.text)) return undefined;
      if (ts.isJsxSelfClosingElement(node) && lucide.has(node.tagName.getText(sf))) return ts.factory.createJsxText("", false);
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isClassString(node.text)) {
        return ts.factory.createStringLiteral("§CLS§");
      }
      return ts.visitEachChild(node, visit, ctx);
    };
    return (n) => ts.visitNode(n, visit);
  };
  const out = ts.transform(sf, [transformer]).transformed[0];
  const printed = ts.createPrinter({ removeComments: true }).printFile(out);
  return printed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && l !== "{\"\"}" && l !== "§CLS§");
}

function lcsDiff(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push("- " + a[i++]);
    else out.push("+ " + b[j++]);
  }
  while (i < n) out.push("- " + a[i++]);
  while (j < m) out.push("+ " + b[j++]);
  return out;
}

let bad = 0;
for (const f of files) {
  let before = "";
  try { before = execFileSync("git", ["show", `${base}:${f}`], { encoding: "utf8", maxBuffer: 64 << 20 }); }
  catch { console.log(`• ${f}: tabanda yok (yeni dosya) — atlandı`); continue; }
  const after = readFileSync(f, "utf8");
  const d = lcsDiff(normalize(before, f), normalize(after, f));
  if (d.length === 0) console.log(`✓ ${f}: yalnız görünüm farkı`);
  else {
    bad++;
    console.log(`✗ ${f}: ${d.length} görünüm-dışı satır farkı`);
    for (const l of d.slice(0, 80)) console.log("    " + l.slice(0, 220));
  }
}
process.exit(bad ? 1 : 0);
