/**
 * HD Bilgi Bankası — paylaşılan sunum sabitleri (tek kaynak).
 * Admin editörü (HdAdminContentEditor) ile aynı etiket sözleşmesini yansıtır.
 */
import type { HdEntityKind } from "@/lib/human-design/knowledge/expertReadTypes";

// Görünen adlar katalogda (I18N-F1-R5): hd.knowledge.canonical.kind.<tür>, .contentField.<alan>, .relation.<ilişki>.
// TR değerleri önceki sabit etiketlerle bayt-bayt aynı; anahtarlar / kodlar değişmedi.

export const KIND_ORDER: HdEntityKind[] = ["tip", "otorite", "kapi", "kanal"];

/** İçerik türüne özgü alanların (key → başlık) sözleşmesi. */
export const CONTENT_TYPE_FIELDS: Record<HdEntityKind, { key: string }[]> = {
  tip: [{ key: "strategy_text" }, { key: "signature_text" }, { key: "not_self_text" }],
  otorite: [{ key: "decision_mechanism" }, { key: "application_text" }, { key: "caution_notes" }],
  kapi: [{ key: "general_theme" }],
  kanal: [{ key: "full_channel_text" }, { key: "hanging_gate_context" }],
};

/** Bilinen kanıt ilişki türleri (görünen ad katalogda; bilinmeyen tür ham kodla gösterilir). */
export const RELATION_TYPES: ReadonlySet<string> = new Set(["supports", "contradicts", "school_specific", "background"]);
