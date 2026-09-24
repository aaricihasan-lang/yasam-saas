import { NextResponse } from "next/server";

/**
 * Refleksoloji API'leri için ORTAK hata yanıtı yardımcıları (REF-016).
 *
 * Amaç: istemciye ham Supabase/Postgres `error.message` (tablo/kolon/22P02/stack)
 * SIZDIRMAMAK. Teknik ayrıntı yalnız sunucu logunda kalır; istemci generic mesaj alır.
 *
 * ⚠️ Loglama: yalnız DB hata özeti (code + message) + kısa bağlam yazılır.
 *   Not içeriği, ek (attachment) verisi, token vb. GİZLİ veri ASLA loglanmaz.
 */

function briefDbError(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown };
    const code = typeof e.code === "string" ? e.code : "";
    const msg = typeof e.message === "string" ? e.message : "";
    return [code, msg].filter(Boolean).join(" ").slice(0, 300);
  }
  return String(error).slice(0, 300);
}

/**
 * Sunucu (500) hatası: teknik ayrıntıyı loglar, istemciye generic mesaj döner.
 * @param context kısa bağlam etiketi (ör. "atlas.PUT") — yalnız server logunda.
 */
export function jsonServerError(context: string, error: unknown): NextResponse {
  console.error(`[refleksoloji] ${context}: ${briefDbError(error)}`);
  return NextResponse.json(
    { ok: false, error: "İşlem tamamlanamadı. Lütfen tekrar deneyin." },
    { status: 500 },
  );
}
