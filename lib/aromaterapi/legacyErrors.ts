import { NextResponse } from "next/server";

/**
 * Aromaterapi V2 — legacy Oils/Blends route ailesi için güvenli DB-hata yanıtı.
 *
 * Ham Supabase/Postgres hatası (message/detail/hint/code/stack) İSTEMCİYE SIZMAZ:
 * teknik ayrıntı yalnız `console.error` ile server log'una düşer; istemci sabit,
 * güvenli Türkçe genel mesaj + uygun HTTP status alır.
 *
 * Modern C3C route'ları readErrors/writeErrors stable-code sözleşmesini kullanır;
 * bu helper yalnız henüz modernize edilmemiş legacy aileyi (oils, oils/[id],
 * admin/oils, blends, blends/[id]) aynı güvenlik seviyesine çıkarır. İstemci
 * sözleşmesi `{ ok:false, error:string }` biçiminde KORUNUR (legacy UI'yı bozmaz).
 */
export function legacyDbErrorResponse(
  scope: string,
  error: unknown,
  message = "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
  status = 500,
): NextResponse {
  console.error(`[aromaterapi:${scope}]`, error);
  return NextResponse.json({ ok: false, error: message }, { status });
}
