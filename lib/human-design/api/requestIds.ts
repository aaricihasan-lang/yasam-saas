// HD-27 — istek kimliği doğrulaması (server-only, SAF).
//
// Geçersiz biçimli kimlik (UUID değil) veritabanına HİÇ gönderilmez: Postgres `22P02`
// hatası 500'e ve sahte "action_failed" kullanım olayına dönüşüyordu. Artık tek tip
// 400 `INVALID_ID` döner; geçerli biçimli ama bu tenant'ta olmayan kimlik ise ilgili
// uçta 404 olarak kalır (varlık sızdırılmaz).

import { NextResponse } from "next/server";
import { isUuid } from "./deterministicId";

export { isUuid };

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Değer verilmemişse (null/boş) true; verilmişse UUID olmalı. */
export function isOptionalUuid(v: string | null | undefined): boolean {
  return v === null || v === undefined || v === "" || isUuid(v);
}

/** Tek tip 400 yanıtı. `field` yalnız alan adıdır (değer yansıtılmaz). */
export function invalidIdResponse(field: string): NextResponse {
  return NextResponse.json(
    { ok: false, code: "INVALID_ID", error: `Geçersiz ${field}.` },
    { status: 400, headers: NO_STORE },
  );
}
