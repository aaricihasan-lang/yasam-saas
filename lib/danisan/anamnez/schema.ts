/**
 * Anamnez şablon registry'si + "efektif form" (kanonik şablon ⊕ danışana özel fark).
 * SAF: client + server + harness import eder.
 */
import { STD_V1 } from "./template/stdV1";
import { STD_V1_CATALOG, type TemplateCatalog } from "./template/stdV1.i18n";
import type {
  AnamnezSectionKey,
  AnamnezTemplate,
  CustomField,
  FormCustom,
  TemplateField,
  TemplateSection,
} from "./types";

export type AnamnezLocale = "tr" | "en";

/** Yeni anamnezlerin başladığı güncel kanonik sürüm. */
export const CURRENT_TEMPLATE_VERSION = "std-v1";

const TEMPLATES: Readonly<Record<string, { template: AnamnezTemplate; catalog: Readonly<Record<AnamnezLocale, TemplateCatalog>> }>> = {
  "std-v1": { template: STD_V1, catalog: STD_V1_CATALOG },
};

export function isKnownTemplateVersion(version: unknown): version is string {
  return typeof version === "string" && Object.prototype.hasOwnProperty.call(TEMPLATES, version);
}

export function getTemplate(version: string): AnamnezTemplate {
  const t = TEMPLATES[version];
  if (!t) throw new Error(`Bilinmeyen anamnez şablon sürümü: ${version}`);
  return t.template;
}

export function getCatalog(version: string, locale: AnamnezLocale): TemplateCatalog {
  const t = TEMPLATES[version];
  if (!t) throw new Error(`Bilinmeyen anamnez şablon sürümü: ${version}`);
  return t.catalog[locale] ?? t.catalog.tr;
}

export function normalizeLocale(value: unknown): AnamnezLocale {
  return value === "en" ? "en" : "tr";
}

/** Şablondaki tüm kanonik alanlar (key → alan + bölüm). */
export function templateFieldIndex(version: string): Map<string, { field: TemplateField; section: TemplateSection }> {
  const m = new Map<string, { field: TemplateField; section: TemplateSection }>();
  for (const section of getTemplate(version).sections) {
    for (const field of section.fields) m.set(field.key, { field, section });
  }
  return m;
}

// ─── Efektif form ────────────────────────────────────────────────────────────

/** Görünen/gizli alan tanımı: kanonik veya danışana özel. */
export type EffectiveField =
  | { kind: "template"; key: string; field: TemplateField; labelOverride: string | null; hidden: boolean }
  | { kind: "custom"; key: string; custom: CustomField; hidden: boolean };

export type EffectiveSection = {
  key: AnamnezSectionKey;
  optional: boolean;
  /** optional bölüm bu anamnezde etkin mi (optional değilse her zaman true). */
  enabled: boolean;
  /** Şablon sırası + bölüm sonunda eklenen özel alanlar. */
  fields: EffectiveField[];
};

export function effectiveSections(version: string, custom: FormCustom): EffectiveSection[] {
  const hidden = new Set(custom.hidden);
  const enabled = new Set(custom.enabledSections);
  return getTemplate(version).sections.map((s) => {
    const fields: EffectiveField[] = s.fields.map((f) => ({
      kind: "template" as const,
      key: f.key,
      field: f,
      labelOverride: custom.labels[f.key] ?? null,
      hidden: hidden.has(f.key),
    }));
    for (const c of custom.custom) {
      if (c.section === s.key) fields.push({ kind: "custom", key: c.key, custom: c, hidden: hidden.has(c.key) });
    }
    return { key: s.key, optional: s.optional === true, enabled: s.optional ? enabled.has(s.key) : true, fields };
  });
}

/** Tüm geçerli alan anahtarları (kanonik + özel) → tip bilgisi (doğrulama için). */
export function allFieldKeys(version: string, custom: FormCustom): Set<string> {
  const keys = new Set(templateFieldIndex(version).keys());
  for (const c of custom.custom) keys.add(c.key);
  return keys;
}

/** Alanın görüntülenen başlığı (override > katalog; özel alan → kendi etiketi). */
export function fieldLabel(f: EffectiveField, catalog: TemplateCatalog): string {
  if (f.kind === "custom") return f.custom.label;
  return f.labelOverride ?? catalog.fields[f.key]?.label ?? f.key;
}

/** Tek/çoklu seçim seçenekleri (kanonik: option set; özel: kendi seçenekleri). */
export function fieldOptions(
  f: EffectiveField,
  template: AnamnezTemplate,
  catalog: TemplateCatalog,
): Array<{ key: string; label: string }> {
  if (f.kind === "custom") return f.custom.options ?? [];
  const setKey = f.field.options;
  if (!setKey) return [];
  const keys = template.optionSets[setKey] ?? [];
  const labels = catalog.options[setKey] ?? {};
  return keys.map((k) => ({ key: k, label: labels[k] ?? k }));
}

export function optionSetLabels(
  template: AnamnezTemplate,
  catalog: TemplateCatalog,
  setKey: string | undefined,
): Array<{ key: string; label: string }> {
  if (!setKey) return [];
  const keys = template.optionSets[setKey] ?? [];
  const labels = catalog.options[setKey] ?? {};
  return keys.map((k) => ({ key: k, label: labels[k] ?? k }));
}

/** Kanonik şablonun sıralı-anahtarlı JSON gösterimi (hash kilidi için; harness sha256 alır). */
export function canonicalTemplateJson(version: string): string {
  const t = TEMPLATES[version];
  if (!t) throw new Error(`Bilinmeyen anamnez şablon sürümü: ${version}`);
  return stableStringify({ template: t.template, catalog: t.catalog });
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}
