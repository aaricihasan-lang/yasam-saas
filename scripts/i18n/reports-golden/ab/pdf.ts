/**
 * I18N rapor golden (grup A+B) — jsPDF çıktıları için normalizasyon + çizilen metnin yakalanması.
 *
 * normalizePdf: zamana/rastgeleliğe bağlı alanlar maskelenir (`/CreationDate`, `/ModDate`, `/ID [...]`);
 * kalan her bayt (içerik akışları, yazı tipi, sayfa geometrisi) kilitlidir.
 * capturePdfText: üretim süresince oluşturulan her jsPDF örneğinin `text()` çağrıları kaydedilir
 * (Identity-H gömülü yazı tipinde PDF'ten metin çıkarmak yerine çizilen metnin kendisi denetlenir).
 */
import { createRequire } from "node:module";

const req = createRequire(__filename);

export function normalizePdf(buf: Buffer): string {
  return buf
    .toString("latin1")
    .replace(/\/CreationDate \([^)]*\)/g, "/CreationDate ()")
    .replace(/\/ModDate \([^)]*\)/g, "/ModDate ()")
    .replace(/\/ID \[\s*<[0-9A-Fa-f]*>\s*<[0-9A-Fa-f]*>\s*\]/g, "/ID []");
}

type JsPdfCtor = new (...a: unknown[]) => { text: (...a: unknown[]) => unknown };

export async function capturePdfText<T>(fn: () => Promise<T>): Promise<{ result: T; texts: string[] }> {
  const mod = req("jspdf") as { jsPDF: JsPdfCtor };
  const Orig = mod.jsPDF;
  const texts: string[] = [];
  function Patched(this: unknown, ...a: unknown[]) {
    const inst = new Orig(...a);
    const origText = inst.text.bind(inst);
    inst.text = (t: unknown, ...rest: unknown[]) => {
      if (Array.isArray(t)) texts.push(...t.map(String));
      else texts.push(String(t));
      return origText(t, ...rest);
    };
    return inst;
  }
  Object.setPrototypeOf(Patched, Orig);
  (Patched as unknown as { prototype: unknown }).prototype = Orig.prototype;
  mod.jsPDF = Patched as unknown as JsPdfCtor;
  try {
    const result = await fn();
    return { result, texts };
  } finally {
    mod.jsPDF = Orig;
  }
}
