import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * YEBS — FAZ API-TX ortak SERVIS çekirdeği (RPC yürütücü + canonical dönüş doğrulama).
 *
 * Entity-specific transition servisleri bu çekirdeği kullanır ama kendi stabil hata
 * kod union'larını KORUR (type safety). Çekirdek yalnız:
 *   - transition/verify RPC çağrısı
 *   - canonical dönüş şekli doğrulaması (tek object; array ise EXACT tek eleman)
 *   - ham RPC hata mesajının GÜVENLİ biçimde okunması (istemciye SIZDIRILMAZ)
 * yapar. Sınıflandırma (rawCode → typed code) entity servisinde kalır.
 *
 * Güvenlik: `import "server-only"`. Ham DB message/details/hint yalnız server log'a.
 */

/**
 * Transition RPC'leri canonical satırı (D1/D2/D3/D5/D6/D8 veya D7/D9) döndürür.
 * Servis katmanı için gereken asgari alanlar. Route dönüşü satırı OLDUĞU GİBİ taşır.
 */
export type YebsCanonicalRow = {
  id: string;
  status?: string;
  verification_status?: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

/** Canonical satırın en az beklenen alanları + geçerli string `id` taşıdığını doğrular. */
export function isCanonicalRow(value: unknown): value is YebsCanonicalRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.created_at === "string" &&
    typeof r.updated_at === "string"
  );
}

export type ExecuteTransitionResult =
  | { ok: true; row: YebsCanonicalRow }
  | { ok: false; rawCode: string };

/**
 * Transition/verify RPC'sini çağırır ve dönüşü doğrular. Ham hata mesajı YALNIZ
 * sınıflandırma için `rawCode` olarak döndürülür (istemciye gitmez; entity servisi
 * Set.has ile exact eşleştirir, tanınmazsa generic FAILED'e düşer).
 *
 * @param db      service_role client (route'un guard.db'si)
 * @param rpcName tam RPC adı (statik string; entity servisi sabit verir)
 * @param params  RPC parametreleri (p_actor_admin_id server-side güvenilir)
 */
export async function executeTransition(
  db: SupabaseClient,
  rpcName: string,
  params: Record<string, unknown>,
): Promise<ExecuteTransitionResult> {
  const { data, error } = await db.rpc(rpcName, params);

  if (error) {
    console.error(`[yebs] ${rpcName} RPC failed:`, error.message);
    return {
      ok: false,
      rawCode: typeof error.message === "string" ? error.message : "",
    };
  }

  let row: unknown = data;
  if (Array.isArray(data)) {
    if (data.length !== 1) {
      console.error(`[yebs] ${rpcName} beklenmeyen dönüş kardinalitesi:`, data.length);
      return { ok: false, rawCode: "" };
    }
    row = data[0];
  }

  if (!isCanonicalRow(row)) {
    console.error(`[yebs] ${rpcName} beklenmeyen dönüş biçimi`);
    return { ok: false, rawCode: "" };
  }

  return { ok: true, row };
}
