import {
  HD_KNOWLEDGE_CATEGORY_PREFIX,
  HUMAN_DESIGN_AUTHORITIES,
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_DEFINITIONS,
  HUMAN_DESIGN_PROFILES,
  HUMAN_DESIGN_TYPES,
  type HdKnowledgeCategory,
} from "./constants";

// -------------------------------------------------------
// Label çözücüler — code → okunabilir Türkçe etiket
// -------------------------------------------------------

export function hdTypeLabelFromCode(code: string | null | undefined): string {
  if (!code) return "—";
  return HUMAN_DESIGN_TYPES.find((t) => t.code === code)?.label ?? code;
}

export function hdAuthorityLabelFromCode(code: string | null | undefined): string {
  if (!code) return "—";
  return HUMAN_DESIGN_AUTHORITIES.find((a) => a.code === code)?.label ?? code;
}

export function hdProfileLabelFromCode(code: string | null | undefined): string {
  if (!code) return "—";
  return HUMAN_DESIGN_PROFILES.find((p) => p.code === code)?.label ?? code;
}

export function hdDefinitionLabelFromCode(code: string | null | undefined): string {
  if (!code) return "—";
  return HUMAN_DESIGN_DEFINITIONS.find((d) => d.code === code)?.label ?? code;
}

export function hdCenterLabelFromCode(code: string | null | undefined): string {
  if (!code) return "—";
  return HUMAN_DESIGN_CENTERS.find((c) => c.code === code)?.label ?? code;
}

export function hdChannelLabelFromCode(code: string | null | undefined): string {
  if (!code) return "—";
  return HUMAN_DESIGN_CHANNELS.find((ch) => ch.code === code)?.label ?? code;
}

export function hdGateLabelFromCode(gate: number | null | undefined): string {
  if (gate == null) return "—";
  return `${gate}. Kapı`;
}

// -------------------------------------------------------
// Bilgi Bankası kod üretici
// Örn: category="Kapılar", title="34. Kapı" → "kapi_34"
//      category="Tipler",  title="Generator" → "tip_generator"
// -------------------------------------------------------

const TR_MAP: Record<string, string> = {
  ğ: "g", Ğ: "G", ü: "u", Ü: "U", ş: "s", Ş: "S",
  ı: "i", İ: "I", ö: "o", Ö: "O", ç: "c", Ç: "C",
};

function slugify(text: string): string {
  return text
    .split("")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildKnowledgeCode(
  category: HdKnowledgeCategory | string,
  title: string,
): string {
  const prefix = HD_KNOWLEDGE_CATEGORY_PREFIX[category as HdKnowledgeCategory] ?? "hd";
  return `${prefix}_${slugify(title)}`;
}
