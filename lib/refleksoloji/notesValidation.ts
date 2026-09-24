/**
 * Refleksoloji Klinik Notlar — SUNUCU TARAFI runtime doğrulama (REF-009 / REF-017).
 *
 * İstemci doğrulaması güvenlik değildir. Bu modül /api/refleksoloji/notes PUT
 * gövdesini sunucuda sınırlar: payload boyutu, not/ek sayıları, MIME allow-list,
 * data: URL şeması ve MIME↔prefix tutarlılığı. Limitler mevcut istemci davranışıyla
 * (per-file 4MB) uyumlu, gereksiz dar değil.
 *
 * Tehlikeli türler (image/svg+xml, text/html, application/xhtml+xml, javascript:)
 * REDDEDİLİR — not eki modeli yalnız raster görsel + PDF önizler.
 */

// ─── Limitler ────────────────────────────────────────────────────────────────
export const NOTE_LIMITS = {
  MAX_NOTES: 5000, // tenant başına makul üst sınır (tam liste PUT edilir)
  MAX_TITLE_LEN: 500,
  MAX_CONTENT_LEN: 100_000,
  MAX_DATE_LEN: 40,
  MAX_ATTACHMENTS_PER_NOTE: 20,
  MAX_FILENAME_LEN: 300,
  // 4MB ikili ek ≈ 5.33MB base64; başlık + güvenlik payı ile 6MB.
  MAX_ATTACHMENT_DATAURL_BYTES: 6 * 1024 * 1024,
  MAX_ATTACHMENTS_TOTAL_BYTES_PER_NOTE: 40 * 1024 * 1024,
  // Tüm PUT gövdesi (JSON) için kaba üst sınır.
  MAX_BODY_BYTES: 60 * 1024 * 1024,
} as const;

// İzinli MIME'lar: tüm raster image/* + PDF. SVG (script taşır) HARİÇ.
const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/heic",
  "image/heif",
  "image/avif",
]);
const ALLOWED_DOC_MIME = new Set(["application/pdf"]);

function isAllowedMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIME.has(mime) || ALLOWED_DOC_MIME.has(mime);
}

export type NoteValidationError = { status: 413 | 422; message: string };

/** İstemci ekinin data: URL'i ile beyan edilen MIME tutarlı mı + izinli mi. */
function validateAttachment(
  att: unknown,
  noteIdx: number,
): NoteValidationError | null {
  if (!att || typeof att !== "object") {
    return { status: 422, message: "Geçersiz ek verisi." };
  }
  const a = att as Record<string, unknown>;

  const fileName =
    typeof a.fileName === "string"
      ? a.fileName
      : typeof a.displayName === "string"
        ? a.displayName
        : "";
  if (fileName.length > NOTE_LIMITS.MAX_FILENAME_LEN) {
    return { status: 422, message: "Ek dosya adı çok uzun." };
  }

  const mimeType =
    typeof a.mimeType === "string"
      ? a.mimeType
      : typeof a.type === "string"
        ? a.type
        : "";
  const dataUrl = typeof a.dataUrl === "string" ? a.dataUrl : "";

  // Boş dataUrl (ör. yalnız meta taşıyan legacy kayıt) — MIME kontrolü ek yoksa atlanır.
  if (!dataUrl) return null;

  // Yalnız data: base64 şeması. javascript:/http(s):/blob: reddedilir.
  const m = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,/i.exec(dataUrl);
  if (!m) {
    return { status: 422, message: `Ek #${noteIdx + 1}: desteklenmeyen ek biçimi.` };
  }
  const urlMime = m[1].toLowerCase();

  if (!isAllowedMime(urlMime)) {
    return { status: 422, message: "İzin verilmeyen dosya türü (yalnız görsel ve PDF)." };
  }
  // Beyan edilen MIME varsa data: URL MIME'ı ile tutarlı olmalı (spoof engeli).
  if (mimeType && mimeType.toLowerCase() !== urlMime && !isAllowedMime(mimeType.toLowerCase())) {
    return { status: 422, message: "Ek MIME türü tutarsız." };
  }

  if (dataUrl.length > NOTE_LIMITS.MAX_ATTACHMENT_DATAURL_BYTES) {
    return { status: 413, message: "Ek dosya boyutu sınırı aşıldı." };
  }
  return null;
}

/**
 * Gelen not listesini doğrular. Geçerliyse null; değilse {status,message}.
 * Not: id/title zorunlu değildir (üst katman zaten filtreler); burada içerik SINIRLARI
 * ve ek GÜVENLİĞİ zorlanır.
 */
export function validateIncomingNotes(notes: unknown[]): NoteValidationError | null {
  if (notes.length > NOTE_LIMITS.MAX_NOTES) {
    return { status: 413, message: "Çok fazla not (sınır aşıldı)." };
  }

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (!n || typeof n !== "object") {
      return { status: 422, message: "Geçersiz not verisi." };
    }
    const note = n as Record<string, unknown>;

    if (typeof note.title === "string" && note.title.length > NOTE_LIMITS.MAX_TITLE_LEN) {
      return { status: 422, message: "Not başlığı çok uzun." };
    }
    if (typeof note.content === "string" && note.content.length > NOTE_LIMITS.MAX_CONTENT_LEN) {
      return { status: 422, message: "Not içeriği çok uzun." };
    }
    if (typeof note.date === "string" && note.date.length > NOTE_LIMITS.MAX_DATE_LEN) {
      return { status: 422, message: "Geçersiz tarih." };
    }

    if (note.attachments !== undefined) {
      if (!Array.isArray(note.attachments)) {
        return { status: 422, message: "Geçersiz ek listesi." };
      }
      if (note.attachments.length > NOTE_LIMITS.MAX_ATTACHMENTS_PER_NOTE) {
        return { status: 413, message: "Bir notta çok fazla ek var." };
      }
      let totalBytes = 0;
      for (const att of note.attachments) {
        const err = validateAttachment(att, i);
        if (err) return err;
        if (att && typeof att === "object") {
          const dataUrl = (att as { dataUrl?: unknown }).dataUrl;
          if (typeof dataUrl === "string") totalBytes += dataUrl.length;
        }
      }
      if (totalBytes > NOTE_LIMITS.MAX_ATTACHMENTS_TOTAL_BYTES_PER_NOTE) {
        return { status: 413, message: "Not eklerinin toplam boyutu sınırı aşıyor." };
      }
    }
  }
  return null;
}
