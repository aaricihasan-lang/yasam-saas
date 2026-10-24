/**
 * lib/kisisel-arsiv/archiveError.ts — Kişisel Arşiv beklenmeyen (DB/Storage) hata yanıtı (MEDIA-F3).
 *
 * Ham Postgres/PostgREST/Storage ayrıntısı (tablo/kolon, SQL kodu, girdi değeri) YANITA girmez.
 * Sunucuda lib/http/apiError `logServerError` ile yalnız route/eylem/opak ref/tenant + sürücü
 * message/code kaydedilir — ham hata nesnesi (details/hint, dosya yolu) ve kullanıcı içeriği LOGLANMAZ.
 *
 * Statü 500 korunur (gerçek sunucu hatası 4xx'e çevrilmez); yanıt şekli `{ ok:false, error, ref }`.
 * Kontrollü 4xx mesajları (kota, boyut, tür, sahiplik) bu helper'ın kapsamı DIŞINDADIR.
 */
import { NextResponse } from "next/server";
import { logServerError } from "@/lib/http/apiError";

export const ARCHIVE_SERVER_ERROR_MESSAGE = "İşlem tamamlanamadı. Lütfen yeniden deneyin.";

/** Hatayı yalnız sunucuda kontrollü loglar; yanıtta kullanılacak opak ref döner. */
export function logArchiveServerError(route: string, action: string, tenantId: string, cause: unknown): string {
  return logServerError({ route, action, tenantId, cause });
}

/** Beklenmeyen iç hata → kontrollü log + güvenli Türkçe 500 yanıtı. */
export function archiveServerErrorResponse(route: string, action: string, tenantId: string, cause: unknown): NextResponse {
  const ref = logArchiveServerError(route, action, tenantId, cause);
  return NextResponse.json({ ok: false, error: ARCHIVE_SERVER_ERROR_MESSAGE, ref }, { status: 500 });
}
