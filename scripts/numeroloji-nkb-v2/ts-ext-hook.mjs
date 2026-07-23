/**
 * Node resolve hook (yalnız harness için): uzantısız relative import'lara mevcutsa `.ts`
 * ekler. Böylece ham Node, TS kaynak dosyalarının ("./knowledgeSections") extensionless
 * import'unu çözebilir (tsc/Next zaten çözer). Paket kurulumu YOK; test aracıdır.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
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
