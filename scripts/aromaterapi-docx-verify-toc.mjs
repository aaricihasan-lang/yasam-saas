// Cached TOC doğrulayıcı — Word COM finalize sonrası SAVED DOCX'te TOC'un
// cached sonucu (gerçek maddeler + PAGEREF sayfa numaraları) var mı?
// Field-only (boş cached) DOCX'te PAGEREF _Toc bookmark'ları YOKTUR.
//   node scripts/aromaterapi-docx-verify-toc.mjs <docx-path> [expectedEntryText...]
import JSZip from "jszip";
import { readFileSync } from "node:fs";

const path = process.argv[2];
const expected = process.argv.slice(3);
const zip = await JSZip.loadAsync(readFileSync(path));
const doc = await zip.file("word/document.xml").async("string");

// TOC cached entry sayısı = PAGEREF _Toc alanları (her TOC maddesi için bir tane)
const pagerefs = (doc.match(/PAGEREF\s+_Toc\d+/g) || []).length;
// TOC hyperlink anchor'ları (_Toc bookmark) — cached entry göstergesi
const tocBookmarks = new Set((doc.match(/_Toc\d+/g) || [])).size;
// Görünür metin (etiketleri sıyır)
const txt = doc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const foundExpected = expected.filter((e) => txt.includes(e));
const ok = pagerefs >= 2 && (expected.length === 0 || foundExpected.length === expected.length);

console.log(JSON.stringify({
  file: path.split(/[\\/]/).pop(),
  tocPageRefs: pagerefs,
  tocBookmarks,
  expectedFound: `${foundExpected.length}/${expected.length}`,
  missing: expected.filter((e) => !txt.includes(e)),
  CACHED_TOC_OK: ok,
}));
if (!ok) process.exit(1);
