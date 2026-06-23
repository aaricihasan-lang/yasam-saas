import {
  HD_KNOWLEDGE_CATEGORY_PREFIX,
  HUMAN_DESIGN_AUTHORITIES,
  HUMAN_DESIGN_CENTERS,
  HUMAN_DESIGN_CHANNELS,
  HUMAN_DESIGN_DEFINITIONS,
  HUMAN_DESIGN_GATES,
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

// -------------------------------------------------------
// Structured option helpers — Bilgi Bankası formu için
// -------------------------------------------------------

export type StructuredOption = { code: string; label: string };

/**
 * Yapısal kategoriler için önceden tanımlı seçenek listesi döner.
 * Serbest kategoriler (Stratejiler, Genel Notlar) için null döner.
 * Dönen code değerleri buildCodesFromChart() çıktısıyla birebir eşleşir.
 */
export function getStructuredCategoryOptions(category: string): StructuredOption[] | null {
  switch (category) {
    case "Tipler":
      return HUMAN_DESIGN_TYPES.map(({ code, label }) => ({ code, label }));
    case "Otoriteler":
      return HUMAN_DESIGN_AUTHORITIES.map(({ code, label }) => ({ code, label }));
    case "Profiller":
      return HUMAN_DESIGN_PROFILES.map(({ code, label }) => ({ code, label }));
    case "Tanımlar":
      return HUMAN_DESIGN_DEFINITIONS.map(({ code, label }) => ({ code, label }));
    case "Merkezler": {
      const result: StructuredOption[] = [];
      for (const { code, label } of HUMAN_DESIGN_CENTERS) {
        result.push({ code: `tanimli_${code}`, label: `Tanımlı — ${label}` });
        result.push({ code: `acik_${code}`,    label: `Açık — ${label}` });
      }
      return result;
    }
    case "Kanallar":
      // "34-57" → "34_57" — buildCodesFromChart ile aynı dönüşüm
      return HUMAN_DESIGN_CHANNELS.map(({ code, label }) => ({
        code: (code as string).replace(/-/g, "_"),
        label,
      }));
    case "Kapılar":
      return HUMAN_DESIGN_GATES.map(({ code, label }) => ({
        code: String(code),
        label,
      }));
    default:
      return null;
  }
}

/**
 * Yapısal kategori için prefix + rawValue şeklinde doğrudan kod üretir (slugify yok).
 * buildCodesFromChart() çıktısıyla eşleşen kodlar üretir.
 */
export function buildKnowledgeCodeFromValue(category: string, rawValue: string): string {
  const prefix = HD_KNOWLEDGE_CATEGORY_PREFIX[category as HdKnowledgeCategory] ?? "hd";
  return `${prefix}_${rawValue}`;
}

/**
 * Mevcut bir Bilgi Bankası kaydının code alanından structuredValue türetir.
 * Düzenleme formunda mevcut seçimin dropdown'da doğru gösterilmesi için kullanılır.
 */
export function deriveStructuredValue(category: string, code: string): string {
  const opts = getStructuredCategoryOptions(category);
  if (opts === null) return "";
  const prefix = HD_KNOWLEDGE_CATEGORY_PREFIX[category as HdKnowledgeCategory];
  if (!prefix) return "";
  const pfx = `${prefix}_`;
  if (!code.startsWith(pfx)) return "";
  const raw = code.slice(pfx.length);
  return opts.some((o) => o.code === raw) ? raw : "";
}
