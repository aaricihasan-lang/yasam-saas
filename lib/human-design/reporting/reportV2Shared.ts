// HD AŞAMA 4B — profesyonel Word v2: istemci + sunucu ORTAK sabitleri (SAF; node/DB importu YOK).

/** Uzmanın seçebileceği yorum kaynakları (istemci seçimi YETKİ DEĞİLDİR; sunucu doğrular). */
export type HdCommentarySelection = "expert" | "system" | "both";
export const HD_COMMENTARY_SELECTIONS: readonly HdCommentarySelection[] = ["expert", "system", "both"];

export function parseCommentarySelection(v: unknown): HdCommentarySelection | null {
  return typeof v === "string" && (HD_COMMENTARY_SELECTIONS as readonly string[]).includes(v)
    ? (v as HdCommentarySelection)
    : null;
}

/** İndirme yanıtı başlığı: Sistem Yorumu güncel yetki nedeniyle çıkarıldıysa "system-reading". */
export const HD_REPORT_REDACTED_HEADER = "X-HD-Report-Redacted";
