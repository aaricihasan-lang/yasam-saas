/**
 * Aromaterapi Bilgi Bankası (knowledge_articles) — sunucu tarafı yazılabilir alan whitelisti.
 *
 * `/api/aromaterapi/articles` (POST) ve `/api/aromaterapi/articles/[id]` (PATCH) paylaşır.
 * İstemci `tenant_id` / `id` / timestamps ENJEKTE EDEMEZ; yalnız yazılabilir alanlar geçer
 * (tenant_id daima oturumdan). oils/glossary ile aynı hafif yazma deseni.
 */

/** Serbest metin kategori; UI önerir ama DB CHECK yok. */
export const ARTICLE_CATEGORIES = [
  "genel",
  "kimyasal-bilesimler",
  "elde-etme",
  "etki-mekanizmasi",
  "klinik-uygulama",
] as const;

const ARTICLE_STRING_FIELDS = ["category", "title", "summary", "content", "source"] as const;

/**
 * İstemciden gelen ham gövdeyi güvenli, yazılabilir alan kümesine indirger.
 * Kısmi (PATCH): yalnız gövdede bulunan alanlar; tam (create): tüm alanlar + defaults.
 */
export function pickWritableArticleFields(
  raw: unknown,
  opts?: { partial?: boolean },
): Record<string, unknown> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const partial = opts?.partial === true;

  for (const k of ARTICLE_STRING_FIELDS) {
    if (partial && !(k in b)) continue;
    const v = b[k];
    out[k] = typeof v === "string" ? v.trim() : "";
  }
  if (!partial && !out.category) out.category = "genel";

  if (!partial || "sort_order" in b) {
    const v = b.sort_order;
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : 0;
    out.sort_order = Number.isInteger(n) && n >= 0 ? n : 0;
  }
  if (!partial || "is_active" in b) {
    out.is_active = typeof b.is_active === "boolean" ? b.is_active : true;
  }

  return out;
}

/** title zorunlu ve boş olamaz. */
export function articleRequiredOk(fields: Record<string, unknown>, partial: boolean): boolean {
  if (!partial) return typeof fields.title === "string" && fields.title !== "";
  if ("title" in fields && fields.title === "") return false;
  return true;
}
