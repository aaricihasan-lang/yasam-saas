/**
 * Şifa Rehberi F3 — hazır başlık şablonu ve not türleri (onaylı F2 ile aynı ad, simge ve sıra).
 * TEK KAYNAK: lib/sifa-rehberi/topicTree.ts → lib/sifa-rehberi-v2/template.ts (25 hazır başlık; "grup:" / "konu:" anahtarları).
 */
import { TEMPLATE_ENTRIES } from "@/lib/sifa-rehberi-v2/template";

export type TemplateRow = { key: string; label: string; icon: string; parent: string | null };

export const TEMPLATE: TemplateRow[] = TEMPLATE_ENTRIES.filter((e) => /^(grup|konu):/.test(e.key)).map((e) => ({
  key: e.key,
  label: e.label,
  icon: e.icon,
  parent: e.parentKey,
}));

export const NOTE_TYPES = [
  { id: "bilimsel", label: "Bilimsel Araştırma" },
  { id: "geleneksel", label: "Geleneksel Yaklaşım" },
  { id: "dini", label: "Dinî Kaynak" },
  { id: "uzman", label: "Uzman Notu" },
  { id: "diger", label: "Diğer" },
] as const;
