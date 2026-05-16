import type { NoteAttachment } from "../types";

export type AttachmentKind = "image" | "pdf" | "word" | "other";

export function getAttachmentKind(file: NoteAttachment): AttachmentKind {
  const mime = (file.mimeType || "").toLowerCase();
  const names = `${file.fileName} ${file.displayName}`.toLowerCase();

  if (
    mime.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif)$/i.test(names)
  ) {
    return "image";
  }

  if (mime === "application/pdf" || /\.pdf$/i.test(names)) {
    return "pdf";
  }

  if (
    mime.includes("word") ||
    mime.includes("msword") ||
    mime.includes("wordprocessingml") ||
    /\.(doc|docx)$/i.test(names)
  ) {
    return "word";
  }

  return "other";
}

export function attachmentTypeLabel(kind: AttachmentKind): string {
  switch (kind) {
    case "image":
      return "Görsel";
    case "pdf":
      return "PDF";
    case "word":
      return "Word";
    default:
      return "Dosya";
  }
}

export function attachmentHasData(file: NoteAttachment): boolean {
  return Boolean(file.dataUrl?.trim());
}
