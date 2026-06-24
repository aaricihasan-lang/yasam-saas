import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerDb } from "@/lib/supabase-server";

/**
 * Server-side demo hesap kontrolü.
 *
 * Demo korumaları çoğunlukla client-side (useDemoGuard + DemoGate). Bu helper,
 * API route'ları doğrudan çağrıldığında demo hesabın gerçek yazma / export /
 * upload / signed-url işlemi yapmasını sunucu seviyesinde engeller.
 *
 * `users.is_demo_account` DB'den okunur — client header/body'sine güvenilmez.
 * Boş userId → false (anonim/eksik kimlik ayrıca ele alınmalıdır).
 *
 * @param userId  Kontrol edilecek kullanıcı ID'si (genelde body/query'den gelir).
 * @param db      Varsa mevcut service-role client; verilmezse yeni client açılır.
 */
export async function isDemoAccountId(
  userId: string | null | undefined,
  db?: SupabaseClient,
): Promise<boolean> {
  const id = (userId ?? "").trim();
  if (!id) return false;

  let client = db;
  if (!client) {
    try {
      client = getServerDb();
    } catch {
      // Yapılandırma eksikse demo olduğunu doğrulayamayız; çağıran taraf
      // kendi 500'ünü zaten döndürecek. Burada engellemeyi atlamıyoruz.
      return false;
    }
  }

  const { data } = await client
    .from("users")
    .select("is_demo_account")
    .eq("id", id)
    .maybeSingle();

  return data?.is_demo_account === true;
}

/**
 * Tenant bazlı demo kontrolü — yalnızca `tenantId` taşıyan (userId taşımayan)
 * route'lar için. Demo hesap gerçek bir tenant'a sahip olduğundan, o tenant'ta
 * is_demo_account=true bir kullanıcı varsa tenant demo kabul edilir.
 *
 * @param tenantId Kontrol edilecek tenant ID'si.
 * @param db       Varsa mevcut service-role client.
 */
export async function isDemoTenantId(
  tenantId: string | null | undefined,
  db?: SupabaseClient,
): Promise<boolean> {
  const id = (tenantId ?? "").trim();
  if (!id) return false;

  let client = db;
  if (!client) {
    try {
      client = getServerDb();
    } catch {
      return false;
    }
  }

  const { data } = await client
    .from("users")
    .select("id")
    .eq("tenant_id", id)
    .eq("is_demo_account", true)
    .limit(1)
    .maybeSingle();

  return data != null;
}
