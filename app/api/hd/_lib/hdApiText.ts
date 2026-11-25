/**
 * Human Design API yanıtlarındaki kullanıcıya görünen hata metinleri — İSTEK DİLİNDE (I18N-F1-R5 HD).
 *
 * Sözleşme: durum kodu ve `code` alanı dil-bağımsız kalır; yalnız `error` metni isteğin etkin dilinden gelir.
 * Kaynak dilde (tr; yayın kapısı kapalıyken HER istek) metin katalogdaki `hd.apiErrors.<anahtar>` değeridir ve
 * eski sabit Türkçe metinle BAYT-BİREBİR aynıdır. lib/i18n/serverMessages.requestTranslator istisna fırlatmaz:
 * çerez yoksa / çevirici kurulamazsa kaynak dil metni döner. Kontrol akışı bu metne BAĞLANMAZ.
 */
import type { NextRequest } from "next/server";
import { requestTranslator } from "@/lib/i18n/serverMessages";

export function hdApiText(req: unknown, key: string): string {
  return requestTranslator(req as Pick<NextRequest, "cookies"> | null, "hd.apiErrors")(key);
}

/** ICU argümanlı sürüm (argümanlar null/undefined OLMAMALI). */
export function hdApiTextWith(req: unknown, key: string, values: Record<string, string | number>): string {
  return requestTranslator(req as Pick<NextRequest, "cookies"> | null, "hd.apiErrors")(key, values);
}
