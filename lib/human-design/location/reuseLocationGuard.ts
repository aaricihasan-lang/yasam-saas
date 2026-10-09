// HD — kayıtlı Roxy analizinin YENİDEN KULLANIMINDA doğum yeri koruması (server-only).
//
// input_hash (dolayısıyla kayıt kimliği) konum KİMLİĞİNİ değil yalnız saat dilimi + koordinatı
// içerir (sözleşme mühürlü; değişmez). Aynı danışan + aynı tarih/saat + AYNI hesap koordinatı ama
// FARKLI doğum yeri seçilirse servis eski kaydı "reused" döndürür → kullanıcı başka yer etiketli
// analizi açardı. Bu koruma o durumda 409 döndürür: kayıt değişmez, Roxy çağrılmaz, hash değişmez.
// Aynı yer (birebir kimlik veya doğrulanmış takma ad: eski Roxy/il kimliği ↔ yeni ilçe) → geçer.
// Eski kayıtta location_id yoksa (konum kimliği öncesi kayıt) karşılaştırılamaz → mevcut davranış.

import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant } from "@/lib/human-design/api/tenantScope";
import { resolveHdBirthLocation } from "@/lib/human-design/api/hdBirthLocation";
import { isUuid } from "@/lib/human-design/api/deterministicId";
import { sameHdLocationId } from "./trDistrictIndex";

export const LOCATION_MISMATCH_CODE = "SAVED_ANALYSIS_OTHER_PLACE";

export type ReuseGuardResult =
  | { ok: true }
  | { ok: false; status: 409; body: { ok: false; code: typeof LOCATION_MISMATCH_CODE; error: string; existingId: string } };

/** İstekteki konum seçiminin kimliği (sunucuda çözülür; istemci koordinatı kullanılmaz). */
async function requestedLocationId(db: SupabaseClient, tenantId: string, clientId: string, rawLoc: unknown): Promise<string | null> {
  if (rawLoc === "client") {
    const { data } = await withTenant(db.from("human_design_clients").select("id, birth_location_id"), tenantId, "roxy.reuseGuard.client")
      .eq("id", clientId)
      .maybeSingle();
    return (data as { birth_location_id: string | null } | null)?.birth_location_id ?? null;
  }
  if (typeof rawLoc === "string" && rawLoc.startsWith("chart:")) {
    const chartId = rawLoc.slice("chart:".length);
    if (!isUuid(chartId)) return null;
    const { data } = await withTenant(db.from("human_design_charts").select("id, client_id, location_id"), tenantId, "roxy.reuseGuard.prev")
      .eq("id", chartId)
      .eq("client_id", clientId)
      .maybeSingle();
    return (data as { location_id: string | null } | null)?.location_id ?? null;
  }
  return resolveHdBirthLocation(rawLoc)?.id ?? null;
}

export async function guardReusedChartLocation(
  db: SupabaseClient,
  tenantId: string,
  rawBody: unknown,
  reusedChartId: string,
): Promise<ReuseGuardResult> {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
  const { data, error } = await withTenant(db.from("human_design_charts").select("id, location_id, birth_place"), tenantId, "roxy.reuseGuard.chart")
    .eq("id", reusedChartId)
    .maybeSingle();
  if (error || !data) return { ok: true }; // servis kaydı zaten buldu; okuma hatası mevcut davranışı bozmaz
  const row = data as { location_id: string | null; birth_place: string | null };
  if (!row.location_id) return { ok: true };
  const wanted = await requestedLocationId(db, tenantId, clientId, body.location_id);
  if (!wanted || sameHdLocationId(wanted, row.location_id)) return { ok: true };
  const place = row.birth_place ? `“${row.birth_place}”` : "başka bir doğum yeri";
  return {
    ok: false,
    status: 409,
    body: {
      ok: false,
      code: LOCATION_MISMATCH_CODE,
      error: `Bu danışan için aynı doğum tarihi ve saatiyle ${place} adına kayıtlı bir analiz bulunuyor ve seçtiğiniz yer aynı hesap koordinatına denk geliyor. Yanlış doğum yeriyle analiz açılmaması için işlem durduruldu; kayıtlı analizi Kayıtlı Haritalar'dan açabilirsiniz.`,
      existingId: reusedChartId,
    },
  };
}
