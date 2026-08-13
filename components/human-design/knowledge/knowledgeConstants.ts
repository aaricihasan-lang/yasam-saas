/**
 * HD Bilgi Bankası — paylaşılan sunum sabitleri (tek kaynak).
 * Admin editörü (HdAdminContentEditor) ile aynı etiket sözleşmesini yansıtır.
 */
import type { HdEntityKind } from "@/lib/human-design/knowledge/expertReadTypes";

export const KIND_LABELS: Record<HdEntityKind, string> = {
  tip: "Tip",
  otorite: "Otorite",
  kapi: "Kapı",
  kanal: "Kanal",
};

export const KIND_ORDER: HdEntityKind[] = ["tip", "otorite", "kapi", "kanal"];

/** İçerik türüne özgü alanların (key → başlık) sözleşmesi. */
export const CONTENT_TYPE_FIELDS: Record<HdEntityKind, { key: string; label: string }[]> = {
  tip: [
    { key: "strategy_text", label: "Strateji" },
    { key: "signature_text", label: "İmza" },
    { key: "not_self_text", label: "Yanlış-Benlik" },
  ],
  otorite: [
    { key: "decision_mechanism", label: "Karar Mekanizması" },
    { key: "application_text", label: "Uygulama" },
    { key: "caution_notes", label: "Dikkat Notları" },
  ],
  kapi: [{ key: "general_theme", label: "Genel Tema" }],
  kanal: [
    { key: "full_channel_text", label: "Tam Kanal Metni" },
    { key: "hanging_gate_context", label: "Tek Uçlu (Hanging Gate) Bağlam" },
  ],
};

export const RELATION_LABELS: Record<string, string> = {
  supports: "Destekler",
  contradicts: "Çelişir",
  school_specific: "Ekole özgü",
  background: "Arka plan",
};
