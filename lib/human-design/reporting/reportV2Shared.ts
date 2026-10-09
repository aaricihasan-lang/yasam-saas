// HD AŞAMA 4B — profesyonel Word v2: istemci + sunucu ORTAK sabitleri (SAF; node/DB importu YOK).

/**
 * Uzmanın Word raporuna eklemeyi seçtiği içerik (istemci seçimi YETKİ DEĞİLDİR; sunucu doğrular).
 *   none   → yalnız teknik harita içeriği (VARSAYILAN; seçim gönderilmezse de bu)
 *   expert → + "Bilgi ve Açıklamalar" (uzmanın kendi Bilgi Bankası'ndaki eşleşen kayıtlar)
 *   system → + Sistem Yorumu (yalnız yetki + kayıtlı veri varsa)
 *   both   → ikisi
 * "Özel Çalışma Notları" (expert_notes) HİÇBİR seçimle rapora girmez (sunucu kuralı).
 */
export type HdCommentarySelection = "none" | "expert" | "system" | "both";
export const HD_COMMENTARY_SELECTIONS: readonly HdCommentarySelection[] = ["none", "expert", "system", "both"];

export function parseCommentarySelection(v: unknown): HdCommentarySelection | null {
  return typeof v === "string" && (HD_COMMENTARY_SELECTIONS as readonly string[]).includes(v)
    ? (v as HdCommentarySelection)
    : null;
}

/** İki onay kutusu → seçim (Word içerik seçimi penceresi). */
export function commentaryFromFlags(knowledge: boolean, system: boolean): HdCommentarySelection {
  if (knowledge && system) return "both";
  if (knowledge) return "expert";
  if (system) return "system";
  return "none";
}

/** "Raporu Hazırlayan" azami uzunluğu (istemci alanı + sunucu sanitize ortak). */
export const HD_PREPARED_BY_MAX = 120;

/** İndirme yanıtı başlığı: Sistem Yorumu güncel yetki nedeniyle çıkarıldıysa "system-reading". */
export const HD_REPORT_REDACTED_HEADER = "X-HD-Report-Redacted";
