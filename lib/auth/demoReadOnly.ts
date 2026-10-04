/**
 * DEMO VİTRİN — sunucu tarafı SALT-OKUNUR yanıtı (tek kaynak).
 *
 * Demo vitrin hesabı (users.is_demo_account=true) gerçek uzman ekranlarını kullanır; her yazma
 * ucu (POST/PUT/PATCH/DELETE, storage upload/delete, toplu silme) bu yanıtla 403 döner ve
 * VERİTABANINA/STORAGE'A HİÇBİR ŞEY YAZMAZ. Eski "200 { ok:true, demo:true }" sahte-başarı
 * yanıtı kullanılmaz: istemci başarı sanıp yanlış durum göstermesin.
 *
 * `demo: true` bayrağı korunur → mevcut istemci akışları (json.demo) demo durumunu tanır.
 */
import { NextResponse } from "next/server";

export const DEMO_READONLY_CODE = "DEMO_READONLY";
export const DEMO_READONLY_ERROR =
  "Demo hesabı salt okunurdur; kaydetme, düzenleme, silme ve dosya yükleme işlemleri bu hesapta çalışmaz.";

export function demoReadOnlyResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, demo: true, code: DEMO_READONLY_CODE, error: DEMO_READONLY_ERROR },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
