/**
 * GİRİŞ GÜVENLİĞİ F2-K (A3) — NEGATİF KONTROL (yalnız test süreci).
 *
 * `F2K_A3_WITHOUT_FIX=1` iken bu süreçte `@/lib/auth/sessionCookie` YERİNE, `isAndroidAppRequest`'e A3 ÖNCESİ (main)
 * kuralı geri konmuş bir KOPYA yüklenir: tek başına `; wv)` VEYA tek başına `x-yasam-client: android` → token yolu.
 * Üretim kodunda hiçbir bayrak / dal YOKTUR (zayıflatıcı anahtar production'a girmez); kopya süreç boyunca
 * `scripts/giris-guvenligi/.a3-mutant-<pid>/` altında durur ve süreç çıkışında silinir (tsx yalnız proje içini derler).
 * Mutasyon uygulanamazsa (kaynak değişmişse) süreç DURUR — sessizce düzeltilmiş kodla koşup sahte PASS üretmez.
 *
 * Kullanım: route modülleri import edilmeden ÖNCE `installA3MutationIfRequested()` çağrılır.
 */
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const ANCHOR = `  if (resolveClientChannel(ua, hint, headers.get(REQUESTED_WITH_HEADER)) !== "android_app") return false;`;
const OLD_RULE = String.raw`  if (/;\s*wv\)/.test(ua) || String(hint ?? "").trim().toLowerCase() === "android") return androidAppSessionTransport(env) === "header"; // F2K_A3_WITHOUT_FIX`;

export function a3MutationRequested(): boolean {
  return process.env.F2K_A3_WITHOUT_FIX === "1";
}

/** İstenmişse mutasyonu kurar; kurulduysa true. Kurulamazsa süreç 2 ile çıkar. */
export function installA3MutationIfRequested(root: string = process.cwd()): boolean {
  if (!a3MutationRequested()) return false;
  const original = path.join(root, "lib", "auth", "sessionCookie.ts");
  const src = fs.readFileSync(original, "utf8").replace(/\r\n/g, "\n");
  if (src.split(ANCHOR).length !== 2) {
    console.error("F2K_A3_WITHOUT_FIX: mutasyon noktası bulunamadı (sessionCookie.ts değişmiş) — negatif kontrol KURULAMADI");
    process.exit(2);
  }
  const mutant = src.replace(ANCHOR, () => `${OLD_RULE}\n${ANCHOR}`);
  const dir = path.join(root, "scripts", "giris-guvenligi", `.a3-mutant-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  const mutantPath = path.join(dir, "sessionCookie.ts");
  fs.writeFileSync(mutantPath, mutant);
  process.on("exit", () => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* geçici kopya */ }
  });
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const norm = (p: string) => path.resolve(p).toLowerCase();
  const target = norm(original);
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    const resolved = orig.call(this, req, ...rest);
    return norm(resolved) === target ? mutantPath : resolved;
  };
  // ESM yolu (dinamik import): Node 22.15+/24 eş zamanlı çözümleme kancası.
  const reg = (Module as unknown as { registerHooks?: (h: { resolve: (s: string, c: unknown, n: (s: string, c?: unknown) => { url: string }) => { url: string } }) => void }).registerHooks;
  if (typeof reg === "function") {
    const mutantUrl = pathToFileURL(mutantPath).href;
    reg({
      resolve(specifier, context, next) {
        const r = next(specifier, context);
        try {
          if (r.url.startsWith("file:") && norm(fileURLToPath(r.url)) === target) return { ...r, url: mutantUrl };
        } catch { /* dosya dışı URL */ }
        return r;
      },
    });
  }
  console.log("NEGATİF KONTROL: A3 öncesi kural yüklendi (F2K_A3_WITHOUT_FIX=1) — güvenlik testlerinin FAIL vermesi BEKLENİR");
  return true;
}

/** Mutasyonun gerçekten yüklü olduğunu davranışla doğrular (tek başına istemci ipucu → Android sayılır). */
export async function assertA3MutationActive(): Promise<void> {
  const mod = (await import("@/lib/auth/sessionCookie")) as { isAndroidAppRequest?: (h: Headers, env?: Record<string, string | undefined>) => boolean };
  const h = new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0", "x-yasam-client": "android" });
  if (typeof mod.isAndroidAppRequest !== "function" || !mod.isAndroidAppRequest(h, {})) {
    console.error("F2K_A3_WITHOUT_FIX: mutasyon YÜKLENMEDİ (route'lar düzeltilmiş kodu kullanıyor) — negatif kontrol geçersiz");
    process.exit(2);
  }
}
