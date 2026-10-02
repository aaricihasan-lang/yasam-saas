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
 * TEK notu doğrular (FA-03: not-başına doğrulama). Geçerliyse null.
 * Bozuk bir not artık TÜM toplu senkronu 422 ile düşürmez; yalnız o not
 * `{outcome:"rejected", reason}` alır, diğerleri işlenir.
 */
export function validateSingleNote(n: unknown, i = 0): NoteValidationError | null {
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
  return null;
}

/** Toplu gövde zarfı (not SAYISI) — aşımı tüm istek için 413. */
export function validateNoteBatchEnvelope(notes: unknown[]): NoteValidationError | null {
  if (notes.length > NOTE_LIMITS.MAX_NOTES) {
    return { status: 413, message: "Çok fazla not (sınır aşıldı)." };
  }
  return null;
}

/**
 * Gelen not listesini doğrular. Geçerliyse null; değilse İLK hatanın {status,message}'ı.
 * Geriye dönük uyumluluk içindir — route artık not-başına `validateSingleNote` kullanır.
 */
export function validateIncomingNotes(notes: unknown[]): NoteValidationError | null {
  const env = validateNoteBatchEnvelope(notes);
  if (env) return env;
  for (let i = 0; i < notes.length; i++) {
    const err = validateSingleNote(notes[i], i);
    if (err) return err;
  }
  return null;
}

// ─── İstemci ön-kontrolü (sunucuyla PAYLAŞILAN allow-list) ───────────────────

/**
 * RF-04: istemci dosya boyutu sınırı (ikili). Not, ekleriyle birlikte TEK istekte
 * gönderilir ve ekler base64'e çevrilir (×4/3). Platform istek gövdesi sınırı ≈4.5 MB
 * (Vercel Functions; canlıda 3.46 MB PNG → 4.62 MB PUT → 413 ölçüldü). 3 MB ikili ek
 * ≈ 4.0 MB base64 + JSON → güvenlik payıyla sınırın altında kalır.
 */
export const NOTE_ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;

/** RF-04: bir notun TÜM eklerinin toplam ikili boyutu (not tek istekte gider). */
export const NOTE_ATTACHMENTS_TOTAL_MAX_BYTES = 3 * 1024 * 1024;

/**
 * RF-04: tek senkron isteğinin güvenli üst sınırı (JSON, bayt). Bunu aşan not
 * gönderilmeden yerelde "çok büyük" olarak işaretlenir (diğer notlar etkilenmez).
 */
export const NOTE_SYNC_REQUEST_SAFE_BYTES = 4_200_000;

/** Ek olarak kabul edilen MIME türleri (sunucu doğrulamasıyla AYNI liste). */
export const NOTE_ATTACHMENT_ALLOWED_MIME: readonly string[] = [
  ...ALLOWED_IMAGE_MIME,
  ...ALLOWED_DOC_MIME,
];

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  pdf: "application/pdf",
};

/** `<input type="file" accept>` değeri — yalnız izinli görsel + PDF. */
export const NOTE_ATTACHMENT_ACCEPT = [
  ...Object.keys(EXT_TO_MIME).map((e) => `.${e}`),
  ...NOTE_ATTACHMENT_ALLOWED_MIME,
].join(",");

/**
 * Dosyanın MIME'ını çözer: tarayıcı türü izinliyse o; tür boşsa uzantıdan (bazı
 * tarayıcılar HEIC/PDF için boş tür verir). İzinsizse null.
 */
export function resolveNoteAttachmentMime(fileName: string, browserType: string): string | null {
  const t = (browserType || "").trim().toLowerCase();
  if (t && isAllowedMime(t)) return t;
  if (t && t !== "application/octet-stream") return null;
  const ext = /\.([a-z0-9]+)$/i.exec(fileName || "")?.[1]?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? null;
}

/**
 * İstemci ön-kontrolü: tür + boyut. Geçerliyse `{ok:true, mime}`; değilse Türkçe hata.
 * Sunucu yine her eki doğrular (istemci kontrolü güvenlik değildir).
 */
export function checkNoteAttachmentFile(file: {
  name: string;
  type: string;
  size: number;
}): { ok: true; mime: string } | { ok: false; message: string } {
  const mime = resolveNoteAttachmentMime(file.name, file.type);
  if (!mime) {
    return {
      ok: false,
      message: `${file.name}: desteklenmeyen dosya türü. Yalnız görsel (PNG, JPG, WEBP, GIF, HEIC…) ve PDF eklenebilir.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, message: `${file.name} boş bir dosya.` };
  }
  if (file.size > NOTE_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      message: `${file.name} çok büyük (en fazla 3 MB). Görseli küçültüp/sıkıştırıp tekrar deneyin.`,
    };
  }
  return { ok: true, mime };
}

/**
 * RF-04: notun mevcut ekleri + yeni dosya toplamı sınırı aşıyor mu (istemci, istek
 * GÖNDERİLMEDEN). Aşıyorsa Türkçe hata mesajı; değilse null.
 */
export function checkNoteAttachmentsTotal(existingBytes: number, addBytes: number, fileName: string): string | null {
  if (existingBytes + addBytes <= NOTE_ATTACHMENTS_TOTAL_MAX_BYTES) return null;
  return `${fileName} eklenemedi: bir notun eklerinin toplamı en fazla 3 MB olabilir. Daha küçük bir dosya seçin veya ekleri ayrı notlara bölün.`;
}

/** FileReader data-URL'inin MIME önekini çözülen izinli MIME ile hizalar (boş tür → uzantı). */
export function alignDataUrlMime(dataUrl: string, mime: string): string {
  return dataUrl.replace(/^data:[^;,]*;base64,/i, `data:${mime};base64,`);
}
