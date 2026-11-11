/**
 * Akıllı CI F3 — çalışma zamanı yükleme izi (YALNIZ doğrulama aracı; normal CI testlerine YÜKLENMEZ).
 * `node --import=<bu dosya>` ile yüklenir; süreç boyunca depodan yüklenen her dosyayı (ESM + CommonJS) kaydeder ve çıkışta
 * GOLGE_IZ_DOSYA'ya ekler. Statik import grafiğinin (golge-graf.mjs) gerçekte yüklenenleri kapsayıp kapsamadığını ölçmek için.
 */
import fs from "node:fs";
import module from "node:module";
import { fileURLToPath } from "node:url";

const hedef = process.env.GOLGE_IZ_DOSYA;
const yuklenen = new Set();
const ekle = (u) => {
  try { const p = u.startsWith("file:") ? fileURLToPath(u) : u; if (p && !p.includes("node_modules")) yuklenen.add(p); } catch { /* yok */ }
};
if (hedef && typeof module.registerHooks === "function") {
  module.registerHooks({
    resolve(spec, ctx, next) { const r = next(spec, ctx); if (r?.url) ekle(r.url); return r; },
    load(url, ctx, next) { ekle(url); return next(url, ctx); },
  });
}
if (hedef) {
  process.on("exit", () => {
    try {
      const req = module.createRequire(import.meta.url);
      for (const k of Object.keys(req.cache ?? {})) ekle(k);
    } catch { /* yok */ }
    try { fs.appendFileSync(hedef, [...yuklenen].join("\n") + "\n"); } catch { /* yok */ }
  });
}
