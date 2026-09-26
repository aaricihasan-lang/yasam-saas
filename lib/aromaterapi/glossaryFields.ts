/**
 * Aromaterapi Sözlük (glossary_terms) — sunucu tarafı yazılabilir alan whitelisti.
 *
 * `/api/aromaterapi/glossary` (POST) ve `/api/aromaterapi/glossary/[id]` (PATCH) paylaşır.
 * İstemci `tenant_id` / `id` / timestamps gibi alanları ENJEKTE EDEMEZ; yalnız aşağıdaki
 * yazılabilir alanlar DB'ye geçer (tenant_id daima oturumdan). oilFields.ts ile aynı
 * hafif (service_role + app-layer tenant filtre) yazma deseni.
 */

export const GLOSSARY_STATUS_VALUES = ["draft", "verified", "archived"] as const;

const GLOSSARY_REQUIRED_STRING_FIELDS = ["canonical_term_tr", "short_definition_tr"] as const;
const GLOSSARY_NULLABLE_STRING_FIELDS = ["canonical_term_en", "professional_definition_tr"] as const;

/**
 * İstemciden gelen ham gövdeyi güvenli, yazılabilir alan kümesine indirger.
 * Bilinmeyen alanlar (tenant_id, id, created_at…) tamamen düşer.
 *
 * Kısmi birleştirme: `opts.partial === true` (PATCH) iken YALNIZ gövdede BULUNAN
 * anahtarlar dahil edilir → gönderilmeyen alan DOKUNULMAZ. Açık temizleme yine çalışır:
 * nullable alan için `""`/null → NULL. Zorunlu alanlar (canonical_term_tr,
 * short_definition_tr) boş gelirse route 400 döndürür (DB CHECK'i de korur).
 */
export function pickWritableGlossaryFields(
  raw: unknown,
  opts?: { partial?: boolean },
): Record<string, unknown> {
  const b = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const partial = opts?.partial === true;

  for (const k of GLOSSARY_REQUIRED_STRING_FIELDS) {
    if (partial && !(k in b)) continue;
    const v = b[k];
    out[k] = typeof v === "string" ? v.trim() : "";
  }

  for (const k of GLOSSARY_NULLABLE_STRING_FIELDS) {
    if (partial && !(k in b)) continue;
    const v = b[k];
    const s = typeof v === "string" ? v.trim() : "";
    out[k] = s === "" ? null : s;
  }

  // status — allowlist; tam modda (create) verilmez/geçersizse 'draft'.
  if (!partial || "status" in b) {
    const s = typeof b.status === "string" ? b.status.trim() : "";
    out.status = (GLOSSARY_STATUS_VALUES as readonly string[]).includes(s) ? s : "draft";
  }

  return out;
}

/** Zorunlu alanlar dolu mu? (route ön-doğrulaması; DB CHECK'i de korur.) */
export function glossaryRequiredOk(fields: Record<string, unknown>, partial: boolean): boolean {
  if (!partial) {
    return (
      typeof fields.canonical_term_tr === "string" && fields.canonical_term_tr !== "" &&
      typeof fields.short_definition_tr === "string" && fields.short_definition_tr !== ""
    );
  }
  // Kısmi: gönderilen zorunlu alan boş olamaz (silinemez).
  if ("canonical_term_tr" in fields && fields.canonical_term_tr === "") return false;
  if ("short_definition_tr" in fields && fields.short_definition_tr === "") return false;
  return true;
}
