/**
 * Node resolve hook (YALNIZ harness) — iki iş:
 *   1) `server-only` → boş modül stub'ı (Next dışında Node bu paketi çözemez; side-effect import).
 *   2) uzantısız relative import → mevcutsa `.ts` (Node 24 native type-stripping ile çalışır).
 * Paket kurulumu YOK; test aracıdır. tsc/Next zaten gerçek çözümü yapar.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,", shortCircuit: true };
  }
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExt = /\.[mc]?[jt]s$|\.json$/.test(specifier);
  if (isRelative && !hasExt && context.parentURL) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return { url: candidate.href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
