/**
 * nutrition_replace_client_allergens RPC hatası → API kodu (SAF; ham DB mesajı sızdırılmaz).
 * RPC hiç yoksa (migration 20270129000600 uygulanmamış) → 503; eski yarım-yıkıcı yola
 * sessiz geri dönüş YOK.
 */
export function mapReplaceAllergensError(err: { code?: string | null; message?: string | null }): {
  status: number;
  code: string;
} {
  const code = err.code ?? "";
  const msg = err.message ?? "";
  if (code === "PGRST202" || code === "42883") return { status: 503, code: "ALLERGEN_RPC_MISSING" };
  if (msg.includes("client_not_found_for_tenant")) return { status: 404, code: "CLIENT_NOT_FOUND" };
  if (msg.includes("unknown_allergen")) return { status: 400, code: "UNKNOWN_ALLERGEN" };
  if (msg.includes("too_many_allergens")) return { status: 400, code: "TOO_MANY" };
  if (msg.includes("custom_too_long")) return { status: 400, code: "CUSTOM_TOO_LONG" };
  if (msg.includes("bad_allergen_id")) return { status: 400, code: "BAD_ALLERGEN_ID" };
  if (msg.includes("bad_allergen_item") || msg.includes("items_must_be_array") || code === "23514") {
    return { status: 400, code: "BAD_ALLERGEN_ITEM" };
  }
  // 23505 = partial-unique (custom) veya standart UNIQUE dup (RPC dedup ettiği için beklenmez).
  if (code === "23505") return { status: 409, code: "CUSTOM_DUPLICATE" };
  return { status: 500, code: "ALLERGEN_SAVE_FAILED" };
}
