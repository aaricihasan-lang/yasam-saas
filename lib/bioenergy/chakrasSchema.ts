/**
 * bioenergy_chakras — Supabase canlı şema (select * limit 1 ile doğrulandı).
 */
export const BIOENERGY_CHAKRAS_TABLE_COLUMNS = [
  "id",
  "tenant_id",
  "source_uid",
  "name",
  "organs",
  "glands",
  "color",
  "stones",
  "causes",
  "physical",
  "mental",
  "notes",
  "created_at",
] as const;

export type BioenergyChakrasColumn = (typeof BIOENERGY_CHAKRAS_TABLE_COLUMNS)[number];

/** Liste kartı — ağır metin alanları detayda */
export const BIOENERGY_CHAKRAS_LIST_COLUMNS = [
  "id",
  "tenant_id",
  "source_uid",
  "name",
  "organs",
  "color",
  "stones",
  "causes",
  "notes",
  "created_at",
] as const satisfies readonly BioenergyChakrasColumn[];

export const BIOENERGY_CHAKRAS_TEXT_SEARCH_COLUMNS = [
  "name",
  "organs",
  "glands",
  "color",
  "stones",
  "causes",
  "physical",
  "mental",
  "notes",
] as const satisfies readonly BioenergyChakrasColumn[];

export const BIOENERGY_CHAKRAS_LIST_SELECT = BIOENERGY_CHAKRAS_LIST_COLUMNS.join(", ");
export const BIOENERGY_CHAKRAS_DETAIL_SELECT = BIOENERGY_CHAKRAS_TABLE_COLUMNS.join(", ");

const SCHEMA_LOG_KEY = "__yasam_bioenergy_chakras_schema_logged__";

export function logBioenergyChakrasSchemaOnce(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { [SCHEMA_LOG_KEY]?: boolean };
  if (w[SCHEMA_LOG_KEY]) return;
  w[SCHEMA_LOG_KEY] = true;
  console.log(
    "[bioenergy_chakras] doğrulanmış kolonlar:",
    BIOENERGY_CHAKRAS_TABLE_COLUMNS.join(", "),
  );
}
