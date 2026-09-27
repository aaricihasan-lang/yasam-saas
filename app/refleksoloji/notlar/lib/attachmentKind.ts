import type { NoteAttachment } from "../types";

/**
 * FA-03: not eki modeli YALNIZ görsel + PDF kabul eder (sunucu allow-list'i).
 * Eski "word/other" türleri kaldırıldı; bu türde eski bir kayıt varsa
 * "unsupported" olarak gösterilir (önizleme yok, yalnız indirme).
 */
export type AttachmentKind = "image" | "pdf" | "unsupported";

export function getAttachmentKind(file: NoteAttachment): AttachmentKind {
  const mime = (file.mimeType || "").toLowerCase();
  const names = `${file.fileName} ${file.displayName}`.toLowerCase();

  if (
    (mime.startsWith("image/") && mime !== "image/svg+xml") ||
    /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(names)
  ) {
    return "image";
  }

  if (mime === "application/pdf" || /\.pdf$/i.test(names)) {
    return "pdf";
  }

  return "unsupported";
}

export function attachmentTypeLabel(kind: AttachmentKind): string {
  switch (kind) {
    case "image":
      return "Görsel";
    case "pdf":
      return "PDF";
    default:
      return "Desteklenmeyen dosya";
  }
}

export function attachmentHasData(file: NoteAttachment): boolean {
  return Boolean(file.dataUrl?.trim());
}
