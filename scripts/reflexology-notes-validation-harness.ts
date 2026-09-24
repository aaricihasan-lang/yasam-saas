/**
 * Refleksoloji — Klinik Notlar sunucu-tarafı doğrulama harness'i (REF-009 / REF-017).
 *
 * SAF birim testi: validateIncomingNotes limit/MIME/data-URL kurallarını doğrular.
 * Prod/DB'ye DOKUNMAZ. Çalıştır: npm run refleksoloji:notes-validation:harness
 */
import {
  validateIncomingNotes,
  NOTE_LIMITS,
} from "../lib/refleksoloji/notesValidation";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

function note(over: Record<string, unknown> = {}) {
  return { id: "n1", title: "Not", date: "2026-01-01", content: "x", attachments: [], ...over };
}
function img(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    fileName: "x.png",
    mimeType: "image/png",
    dataUrl: "data:image/png;base64,AAAA",
    ...over,
  };
}

console.log("REF-009/017 — notes validation");

// 1) Geçerli not + izinli ek → ok (null)
check("valid note + image attachment → ok", validateIncomingNotes([note({ attachments: [img()] })]) === null);

// 2) Boş liste → ok (silme AYRI; boş liste tek başına geçerli)
check("empty array → ok", validateIncomingNotes([]) === null);

// 3) PDF eki → ok
check("pdf attachment → ok", validateIncomingNotes([note({ attachments: [img({ fileName: "d.pdf", mimeType: "application/pdf", dataUrl: "data:application/pdf;base64,AAAA" })] })]) === null);

// 4) Çok fazla not → 413
{
  const many = Array.from({ length: NOTE_LIMITS.MAX_NOTES + 1 }, (_, i) => note({ id: `n${i}` }));
  check("too many notes → 413", validateIncomingNotes(many)?.status === 413);
}

// 5) Başlık çok uzun → 422
check("title too long → 422", validateIncomingNotes([note({ title: "a".repeat(NOTE_LIMITS.MAX_TITLE_LEN + 1) })])?.status === 422);

// 6) İçerik çok uzun → 422
check("content too long → 422", validateIncomingNotes([note({ content: "a".repeat(NOTE_LIMITS.MAX_CONTENT_LEN + 1) })])?.status === 422);

// 7) attachments dizi değil → 422
check("attachments not array → 422", validateIncomingNotes([note({ attachments: "nope" })])?.status === 422);

// 8) Nota çok fazla ek → 413
{
  const atts = Array.from({ length: NOTE_LIMITS.MAX_ATTACHMENTS_PER_NOTE + 1 }, (_, i) => img({ id: `a${i}` }));
  check("too many attachments → 413", validateIncomingNotes([note({ attachments: atts })])?.status === 413);
}

// 9) SVG (script taşır) → 422
check("svg attachment → 422", validateIncomingNotes([note({ attachments: [img({ mimeType: "image/svg+xml", dataUrl: "data:image/svg+xml;base64,AAAA" })] })])?.status === 422);

// 10) text/html data url → 422
check("html data url → 422", validateIncomingNotes([note({ attachments: [img({ mimeType: "text/html", dataUrl: "data:text/html;base64,AAAA" })] })])?.status === 422);

// 11) javascript: şeması (data: değil) → 422
check("javascript: scheme → 422", validateIncomingNotes([note({ attachments: [img({ dataUrl: "javascript:alert(1)" })] })])?.status === 422);

// 12) Aşırı büyük ek → 413
check("oversized dataUrl → 413", validateIncomingNotes([note({ attachments: [img({ dataUrl: "data:image/png;base64," + "A".repeat(NOTE_LIMITS.MAX_ATTACHMENT_DATAURL_BYTES + 10) })] })])?.status === 413);

// 13) Boş dataUrl (legacy meta) → ok (ek kontrolü atlanır)
check("empty dataUrl (legacy) → ok", validateIncomingNotes([note({ attachments: [img({ dataUrl: "" })] })]) === null);

// 14) MIME↔dataURL prefix: beyan farklı ama ikisi de izinli → ok (lenient)
check("declared jpeg but url png (both allowed) → ok", validateIncomingNotes([note({ attachments: [img({ mimeType: "image/jpeg", dataUrl: "data:image/png;base64,AAAA" })] })]) === null);

// 15) Dosya adı çok uzun → 422
check("filename too long → 422", validateIncomingNotes([note({ attachments: [img({ fileName: "a".repeat(NOTE_LIMITS.MAX_FILENAME_LEN + 1) })] })])?.status === 422);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
