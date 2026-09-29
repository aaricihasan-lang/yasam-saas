/**
 * Admin'in KENDİ tenant'ı (kütüphane kaynağı) — SUNUCUDA çözülür.
 *
 * Admin içerik uçları (kütüphane listesi / toplu içe aktarma) istemciden gelen tenantId'ye
 * GÜVENMEZ: hedef/okuma tenant'ı daima verifyAdminRequest ile doğrulanmış adminin
 * users.tenant_id'sidir. Farklı bir tenant istenirse çağıran 403 döner. Böylece admin, bir
 * uzmanın çalışma alanındaki içerik başlıklarını okuyamaz veya oraya yazamaz
 * (gizlilik taahhüdü: yönetim tarafı uzman içeriğini görüntülemez).
 * Veri paylaşımı transferi (veri-paylasimi/transfer) aynı kuralı kendi içinde uygular.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveAdminOwnTenant(db: SupabaseClient, adminId: string): Promise<string | null> {
  const { data, error } = await db.from("users").select("tenant_id").eq("id", adminId).maybeSingle();
  if (error) return null;
  const tenantId = String((data as { tenant_id?: unknown } | null)?.tenant_id ?? "").trim();
  return UUID_RE.test(tenantId) ? tenantId : null;
}

/** Kendi tenant'ı dışındaki bir tenant istendiğinde dönen sabit yanıt (bilgi sızdırmaz). */
export function foreignTenantResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Yalnız yönetici kütüphane çalışma alanında işlem yapılabilir." },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

export function adminTenantMissingResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "Yönetici kütüphane çalışma alanı bulunamadı." },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
