/**
 * F3B — Kademe B çıktılarını karşılaştırma için normalize eder (F3A normalizeDocx'in üstüne; yalnız test aracı).
 *
 * Kademe B belgelerinde BUGÜN de (main) her üretimde değişen, içerikle ilgisiz rastgele değerler vardır:
 *   - docx köprü ilişki kimlikleri (rId + rastgele 21 karakter; Yaşam Sistemi web bağlantısı) → "rId#N" (ilk görülme sırası)
 *   - gömülü yazı tipi gizleme anahtarı (fontTable w:fontKey GUID'i) ve buna bağlı odttf'nin ilk 32 baytı → anahtar sabitlenir,
 *     odttf gizlemesi anahtarla çözülüp asıl yazı tipi baytlarının SHA-256'sı kullanılır
 *   - jsPDF dosya kimliği (/ID [<…> <…>]) → sabit
 * Geri kalan HER bayt / XML karşılaştırılır.
 */
import JSZip from "jszip";
import { normalizeDocx, sha } from "../normalizeDocx";

export { sha };

const RANDOM_RID = /rId[A-Za-z0-9_-]{18,}/g;

/** ECMA-376 Bölüm 2 §… gömülü yazı tipi gizlemesi: ilk 32 bayt, GUID'den türeyen 16 baytlık anahtarla XOR. */
function deobfuscate(data: Buffer, guid: string): Buffer {
  const hex = guid.replace(/[{}-]/g, "");
  const key = Buffer.from(hex, "hex").reverse();
  const out = Buffer.from(data);
  for (let i = 0; i < 32 && i < out.length; i++) out[i] ^= key[i % 16]!;
  return out;
}

export async function normalizeKademeBDocx(buf: Buffer): Promise<Record<string, string>> {
  const parts = await normalizeDocx(buf);
  const zip = await JSZip.loadAsync(buf);
  // Yazı tipi: fontTable'daki embed r:id → font dosyası; anahtarla çözülen gerçek yazı tipi SHA'sı.
  const fontTable = parts["word/fontTable.xml"];
  const fontRels = parts["word/_rels/fontTable.xml.rels"];
  if (fontTable && fontRels) {
    const relTarget = new Map<string, string>();
    for (const m of fontRels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relTarget.set(m[1]!, m[2]!);
    for (const m of fontTable.matchAll(/<w:embed[A-Za-z]+ [^>]*r:id="([^"]+)"[^>]*w:fontKey="([^"]+)"|<w:embed[A-Za-z]+ [^>]*w:fontKey="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
      const rid = m[1] ?? m[4]!;
      const key = m[2] ?? m[3]!;
      const target = relTarget.get(rid);
      if (!target) continue;
      const file = zip.file(`word/${target}`);
      if (!file) continue;
      const real = deobfuscate(await file.async("nodebuffer"), key);
      parts[`word/${target}`] = `font-sha:${sha(real)}`;
    }
    parts["word/fontTable.xml"] = fontTable.replace(/w:fontKey="\{[0-9A-Fa-f-]+\}"/g, 'w:fontKey="{KEY}"');
  }
  // Rastgele köprü kimlikleri → ilk görülme sırasıyla sabit adlar (tüm parçalarda aynı eşleme).
  const map = new Map<string, string>();
  for (const k of Object.keys(parts).sort()) {
    parts[k] = parts[k]!.replace(RANDOM_RID, (id) => {
      if (!map.has(id)) map.set(id, `rId#${map.size + 1}`);
      return map.get(id)!;
    });
  }
  return parts;
}

/** jsPDF dosya kimliğini sabitler (CreationDate harness'ta saat sabitlenerek zaten aynıdır). */
export function normalizePdfBytes(buf: Buffer): Buffer {
  return Buffer.from(buf.toString("latin1").replace(/\/ID \[ ?<[0-9A-Fa-f]+> ?<[0-9A-Fa-f]+> ?\]/g, "/ID [ <0> <0> ]"), "latin1");
}
