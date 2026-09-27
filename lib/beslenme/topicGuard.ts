import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rehber alt kayıt (bölüm / besin bağı / kaynak bağı) mutasyonları için parent kapısı.
 * Rehber bu tenant'a ait VE aktif olmalı. Beslenme'de kullanıcıya yönelik arşiv kaldırıldı;
 * geçmişten kalan is_active=false (legacy) rehberin alt kayıtları API üzerinden de
 * DEĞİŞTİRİLEMEZ (UI gizlemesine güvenilmez). Yoksa/pasifse → false (route 404 döner).
 */
export async function isActiveTopicInTenant(db: SupabaseClient, tenantId: string, topicId: string): Promise<boolean> {
  const { data } = await db
    .from("nutrition_topics")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", topicId)
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}
