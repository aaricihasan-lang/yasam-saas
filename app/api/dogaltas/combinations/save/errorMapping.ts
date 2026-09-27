/**
 * POST /api/dogaltas/combinations/save — `create_combination_with_stones` RPC hata eşlemesi (SAF).
 *
 * RPC (20270124000000 + 20270128000000) bilinen iş kuralı ihlallerini sabit metinle
 * RAISE EXCEPTION eder. Bunlar kullanıcı/istemci kaynaklıdır → 4xx + sade Türkçe mesaj.
 * Bilinmeyen/altyapı hataları null döner → route mevcut serverErrorResponse (500, ham hata
 * sızdırmadan) yolunu kullanır. `[id]/route.ts` PATCH desenini izler (message.includes).
 */

export type CombinationSaveErrorMapping = {
  status: 400 | 409;
  code: string;
  error: string;
};

const KNOWN: ReadonlyArray<{ token: string; mapping: CombinationSaveErrorMapping }> = [
  {
    token: "stone_not_found_for_tenant",
    mapping: {
      status: 409,
      code: "stone_not_found",
      error: "Seçilen taşlardan biri bulunamadı veya bu hesaba ait değil. Listeyi yenileyip tekrar deneyin.",
    },
  },
  {
    token: "issue_required",
    mapping: { status: 400, code: "issue_required", error: "Kombinasyon adı zorunludur." },
  },
  {
    token: "snapshot_name_required",
    mapping: { status: 400, code: "snapshot_name_required", error: "Her taş için bir ad gereklidir." },
  },
  {
    token: "stones_must_be_array",
    mapping: { status: 400, code: "stones_must_be_array", error: "Taş listesi geçersiz." },
  },
  {
    token: "invalid_arguments",
    mapping: { status: 400, code: "invalid_arguments", error: "Kombinasyon bilgileri geçersiz." },
  },
];

/** RPC hatası → bilinen 4xx eşlemesi; bilinmiyorsa null (route 500 döner). */
export function mapCombinationSaveRpcError(error: unknown): CombinationSaveErrorMapping | null {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  if (!message) return null;
  for (const k of KNOWN) {
    if (message.includes(k.token)) return k.mapping;
  }
  return null;
}

/**
 * RPC başarı sonucu doğrulaması: `{ id: uuid }` bekler. Eksik/bozuk sonuç "başarı" SAYILMAZ
 * (sahte başarı yok) → null.
 */
export function extractCombinationId(data: unknown): string | null {
  const obj = Array.isArray(data) ? data[0] : data;
  if (!obj || typeof obj !== "object") return null;
  const id = (obj as { id?: unknown }).id;
  if (typeof id !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
