/**
 * Biyoenerji güvenli API — kaynak (tablo) yapılandırması.
 * Sunucu tarafında kullanılır (verifyUserRequest + service_role). İstemciden
 * doğrudan tablo erişimi yerine /api/biyoenerji/[resource] üzerinden gider.
 */

export type BioResourceConfig = {
  table: string;
  /** ilike araması yapılacak metin kolonları */
  search: readonly string[];
  /** liste sıralama kolonu */
  orderCol: string;
  orderAsc: boolean;
  /** insert/update'te kabul edilen kolonlar (tenant_id/id/created_at asla) */
  write: readonly string[];
};

export const BIO_RESOURCES: Record<string, BioResourceConfig> = {
  sessions: {
    table: "bioenergy_sessions",
    search: ["title", "content", "category", "source", "note"],
    orderCol: "created_at",
    orderAsc: false,
    write: ["title", "content", "category", "source", "note"],
  },
  "energy-bodies": {
    table: "bioenergy_energy_bodies",
    search: ["source_uid", "genel_tanim", "gorevi", "bozulma", "onerilen_taslar", "not_text"],
    orderCol: "source_uid",
    orderAsc: true,
    write: ["source_uid", "genel_tanim", "gorevi", "bozulma", "onerilen_taslar", "not_text"],
  },
  "subconscious-causes": {
    table: "bioenergy_subconscious_causes",
    search: ["title", "category", "content", "note_text"],
    orderCol: "title",
    orderAsc: true,
    write: ["source_uid", "title", "category", "content", "note_text"],
  },
  imaginations: {
    table: "bioenergy_imaginations",
    search: ["title", "category", "text", "notes", "source"],
    orderCol: "title",
    orderAsc: true,
    write: ["source_id", "title", "category", "text", "notes", "source"],
  },
  symbols: {
    table: "bioenergy_symbols",
    search: ["symbol", "title", "category", "meaning", "source"],
    orderCol: "title",
    orderAsc: true,
    write: ["symbol", "title", "category", "meaning", "source"],
  },
  chakras: {
    table: "bioenergy_chakras",
    search: ["name", "organs", "glands", "color", "stones", "causes", "physical", "mental", "notes"],
    orderCol: "name",
    orderAsc: true,
    write: ["source_uid", "name", "organs", "glands", "color", "stones", "causes", "physical", "mental", "notes"],
  },
};

export function getBioResource(resource: string): BioResourceConfig | null {
  return Object.prototype.hasOwnProperty.call(BIO_RESOURCES, resource)
    ? BIO_RESOURCES[resource]
    : null;
}

/** ilike araması için güvenli terim — PostgREST or() filtresini bozacak karakterleri çıkarır */
export function sanitizeBioSearch(term: string | null | undefined): string {
  return (term ?? "").replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** Body'den yalnız izinli kolonları al (tenant_id/id/created_at vb. dışlanır) */
export function pickWritableBioFields(
  cfg: BioResourceConfig,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of cfg.write) {
    if (Object.prototype.hasOwnProperty.call(body, col)) out[col] = body[col];
  }
  return out;
}
