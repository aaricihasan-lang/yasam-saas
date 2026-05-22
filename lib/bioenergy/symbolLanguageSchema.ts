/**
 * bioenergy_symbols — Supabase canlı şema (select * limit 1 ile doğrulandı).
 * Olmayan kolonlar: note, subconscious_message, symbol_name, subconscious, description
 */
export const BIOENERGY_SYMBOLS_TABLE_COLUMNS = [
  "id",
  "tenant_id",
  "symbol",
  "title",
  "category",
  "meaning",
  "source",
  "created_at",
] as const;

export type BioenergySymbolsColumn = (typeof BIOENERGY_SYMBOLS_TABLE_COLUMNS)[number];

export const BIOENERGY_SYMBOLS_TEXT_SEARCH_COLUMNS = [
  "symbol",
  "title",
  "category",
  "meaning",
  "source",
] as const satisfies readonly BioenergySymbolsColumn[];

export const BIOENERGY_SYMBOLS_LIST_SELECT = BIOENERGY_SYMBOLS_TABLE_COLUMNS.join(", ");

const SCHEMA_LOG_KEY = "__yasam_bioenergy_symbols_schema_logged__";

/** İlk yüklemede konsola gerçek kolon listesini yazar (tahmin yok). */
export function logBioenergySymbolsSchemaOnce(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { [SCHEMA_LOG_KEY]?: boolean };
  if (w[SCHEMA_LOG_KEY]) return;
  w[SCHEMA_LOG_KEY] = true;
  console.log(
    "[bioenergy_symbols] doğrulanmış kolonlar:",
    BIOENERGY_SYMBOLS_TABLE_COLUMNS.join(", "),
  );
}
