/**
 * DOCX golden normalizasyonu — parça bazında SHA-256.
 * (#855 `scripts/i18n/reports-golden/normalize.ts` ile BİREBİR kopya; #855 birleşince oraya yönlendirilir.)
 *
 * Maskelenen (zamana/rastgeleliğe bağlı) alanlar: docProps/core.xml `dcterms:created|modified`,
 * `cp:revision`, `w:rsid*`, `w14:paraId|textId`, rastgele köprü ilişki kimlikleri (`rId<nanoid>`). Medya dosyaları içerik SHA'sıyla karşılaştırılır.
 * Geri kalan her bayt (metin, stil, sayfa geometrisi, alan kodları) kilitlidir.
 */
import { createHash } from "node:crypto";
import JSZip from "jszip";

export const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");

export function normalizeXml(path: string, xml: string): string {
  let s = xml;
  if (path === "docProps/core.xml") {
    s = s
      .replace(/<dcterms:created[^>]*>[^<]*<\/dcterms:created>/g, "<dcterms:created/>")
      .replace(/<dcterms:modified[^>]*>[^<]*<\/dcterms:modified>/g, "<dcterms:modified/>")
      .replace(/<cp:revision>[^<]*<\/cp:revision>/g, "<cp:revision/>");
  }
  return s
    .replace(/\sw:rsid\w*="[^"]*"/g, "")
    .replace(/\sw14:(paraId|textId)="[^"]*"/g, "")
    // docx `ExternalHyperlink` ilişkileri rastgele kimlik alır (rIdxxxxxxxx-…); sıradan rId1…rIdN korunur.
    .replace(/rId[a-z0-9_-]{12,}/g, "rId#");
}

export type DocxParts = { parts: Record<string, string>; xml: Record<string, string> };

export async function docxParts(buffer: Buffer | Uint8Array): Promise<DocxParts> {
  const zip = await JSZip.loadAsync(buffer);
  const parts: Record<string, string> = {};
  const xml: Record<string, string> = {};
  for (const name of Object.keys(zip.files).sort()) {
    const f = zip.files[name]!;
    if (f.dir) continue;
    if (/\.(xml|rels)$/.test(name)) {
      const text = normalizeXml(name, await f.async("string"));
      xml[name] = text;
      parts[name] = sha(text);
    } else {
      parts[name] = sha(await f.async("uint8array"));
    }
  }
  return { parts, xml };
}

/** Tüm parçaların tek özet SHA'sı (ad + parça SHA, sıralı). */
export function digest(parts: Record<string, string>): string {
  return sha(Object.keys(parts).sort().map((k) => `${k}=${parts[k]}`).join("\n"));
}

/** w:t metin düğümleri (XML varlıkları çözülmüş). */
export function textNodes(xml: string): string[] {
  const out: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]!.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"));
  return out;
}
