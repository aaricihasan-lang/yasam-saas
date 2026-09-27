import {
  NOTE_ATTACHMENT_MAX_BYTES,
  alignDataUrlMime,
  checkNoteAttachmentFile,
} from "@/lib/refleksoloji/notesValidation";
import type { NoteAttachment } from "../types";

/** Sunucu doğrulamasıyla PAYLAŞILAN sınır (bkz. lib/refleksoloji/notesValidation). */
export const MAX_ATTACHMENT_BYTES = NOTE_ATTACHMENT_MAX_BYTES;

export {
  NOTE_ATTACHMENT_ACCEPT as ATTACHMENT_ACCEPT,
} from "@/lib/refleksoloji/notesValidation";

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

/**
 * FA-03: seçilen dosyaları istemcide ön-kontrol eder (izinli tür + boyut) ve
 * data-URL'e çevirir. Uygun olmayanlar eklenmez; Türkçe hata mesajı döner.
 * (Sunucu yine her eki doğrular; bu yalnız erken ve anlaşılır geri bildirim.)
 */
export async function readNoteAttachments(
  files: File[],
  newId: () => string,
): Promise<{ added: NoteAttachment[]; errors: string[] }> {
  const added: NoteAttachment[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const check = checkNoteAttachmentFile({ name: file.name, type: file.type, size: file.size });
    if (!check.ok) {
      errors.push(check.message);
      continue;
    }
    try {
      const dataUrl = alignDataUrlMime(await readFileAsDataUrl(file), check.mime);
      added.push({
        id: newId(),
        displayName: file.name,
        fileName: file.name,
        mimeType: check.mime,
        size: file.size,
        dataUrl,
      });
    } catch {
      errors.push(`${file.name} okunamadı.`);
    }
  }
  return { added, errors };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
