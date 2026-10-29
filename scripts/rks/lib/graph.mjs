/**
 * RKS-3 import bağımlılık grafiği (statik). Dosya adı benzerliği DEĞİL, gerçek
 * `import` / `export … from` / `import()` / `require()` ifadeleri izlenir.
 *   - `@/x` → depo kökü (tsconfig paths), göreli yollar, uzantı + index çözümlemesi.
 *   - Test kaynağındaki depo-yolu dizgileri (ör. "supabase/migrations/2027…sql",
 *     "app/api/…/route.ts") "okunan dosya" olarak eklenir (statik kapı / migration testleri).
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, toPosix } from "./common.mjs";

const EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx", ".json"];
const SRC_RE = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/;
const IMPORT_RES = [
  /\bimport\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\.resolve\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];
const REPO_PATH_RE = /['"`]((?:app|lib|components|hooks|shared|i18n|messages|supabase|data|public|proxy)\/[A-Za-z0-9_@()[\]\/.\-]+?\.(?:ts|tsx|js|mjs|json|sql|css))['"`]/g;
const MIGRATION_NAME_RE = /['"`](\d{14}_[a-z0-9_]+\.sql)['"`]/g;

function existsFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function resolveSpec(fromAbs, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.resolve(path.dirname(fromAbs), spec);
  else return null; // paket
  const noJs = base.replace(/\.(js|mjs|cjs)$/, "");
  const cands = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => noJs + e), ...EXTS.map((e) => path.join(base, "index" + e))];
  for (const c of cands) if (existsFile(c)) return c;
  return null;
}

export class ImportGraph {
  constructor() {
    this.edges = new Map(); // rel → Set(rel)
  }

  depsOf(rel) {
    if (this.edges.has(rel)) return this.edges.get(rel);
    const abs = path.join(ROOT, rel);
    const out = new Set();
    this.edges.set(rel, out);
    if (!SRC_RE.test(rel) || !existsFile(abs)) return out;
    const src = fs.readFileSync(abs, "utf8");
    for (const re of IMPORT_RES) {
      for (const m of src.matchAll(re)) {
        const r = resolveSpec(abs, m[1]);
        if (r) out.add(toPosix(path.relative(ROOT, r)));
      }
    }
    if (rel.startsWith("scripts/")) {
      for (const m of src.matchAll(REPO_PATH_RE)) {
        const p = m[1].startsWith("proxy") ? m[1] : m[1];
        if (existsFile(path.join(ROOT, p))) out.add(p);
      }
      for (const m of src.matchAll(MIGRATION_NAME_RE)) {
        const p = `supabase/migrations/${m[1]}`;
        if (existsFile(path.join(ROOT, p))) out.add(p);
      }
    }
    return out;
  }

  /** Giriş dosyasından ulaşılabilen bütün depo dosyaları (giriş dahil). */
  footprint(entry) {
    const seen = new Set([entry]);
    const stack = [entry];
    while (stack.length) {
      const cur = stack.pop();
      for (const d of this.depsOf(cur)) {
        if (!seen.has(d)) { seen.add(d); stack.push(d); }
      }
    }
    return seen;
  }
}
