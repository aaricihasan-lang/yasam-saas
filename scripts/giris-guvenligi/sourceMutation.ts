/**
 * GİRİŞ GÜVENLİĞİ — NEGATİF KONTROL için kaynak mutasyonu (yalnız test süreci; a3Mutation.ts ile aynı yöntem).
 *
 * İstenen ortam değişkeni "1" iken, bu süreçte verilen kaynak dosyası YERİNE, tek bir noktası eski / zayıf kurala
 * döndürülmüş bir KOPYA yüklenir. Üretim kodunda hiçbir bayrak / dal YOKTUR; kopya `scripts/giris-guvenligi/.mut-<pid>/`
 * altında durur ve süreç çıkışında silinir. Mutasyon noktası bulunamazsa süreç 2 ile DURUR (sahte PASS üretmez).
 *
 * Kullanım: route / lib modülleri import edilmeden ÖNCE çağrılır.
 */
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

export type SourceMutation = { envVar: string; file: string; anchor: string; replacement: string; label: string };

const installed: string[] = [];

/** İstenmiş mutasyonları kurar; kurulanların etiketlerini döndürür. */
export function installSourceMutations(muts: SourceMutation[], root: string = process.cwd()): string[] {
  const active = muts.filter((m) => process.env[m.envVar] === "1");
  if (!active.length) return [];
  const dir = path.join(root, "scripts", "giris-guvenligi", `.mut-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  process.on("exit", () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* geçici kopya */ }
  });
  const norm = (p: string) => path.resolve(p).toLowerCase();
  const map = new Map<string, string>();
  active.forEach((m, i) => {
    const original = path.join(root, m.file);
    const src = fs.readFileSync(original, "utf8").replace(/\r\n/g, "\n");
    if (src.split(m.anchor).length !== 2) {
      console.error(`${m.envVar}: mutasyon noktası bulunamadı (${m.file} değişmiş) — negatif kontrol KURULAMADI`);
      process.exit(2);
    }
    const mutantPath = path.join(dir, `${i}-${path.basename(original)}`);
    fs.writeFileSync(mutantPath, src.replace(m.anchor, () => m.replacement));
    map.set(norm(original), mutantPath);
    installed.push(m.label);
    console.log(`NEGATİF KONTROL: ${m.label} (${m.envVar}=1) — güvenlik testlerinin FAIL vermesi BEKLENİR`);
  });
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    const resolved = orig.call(this, req, ...rest);
    return map.get(norm(resolved)) ?? resolved;
  };
  const reg = (Module as unknown as { registerHooks?: (h: { resolve: (s: string, c: unknown, n: (s: string, c?: unknown) => { url: string }) => { url: string } }) => void }).registerHooks;
  if (typeof reg === "function") {
    reg({
      resolve(specifier, context, next) {
        const r = next(specifier, context);
        try {
          if (r.url.startsWith("file:")) {
            const hit = map.get(norm(fileURLToPath(r.url)));
            if (hit) return { ...r, url: pathToFileURL(hit).href };
          }
        } catch { /* dosya dışı URL */ }
        return r;
      },
    });
  }
  return [...installed];
}
