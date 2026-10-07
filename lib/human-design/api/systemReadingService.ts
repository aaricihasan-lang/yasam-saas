// HD "Sistem Yorumu" — kayıtlı haritadan güvenli okuma (YALNIZ SUNUCU, tenant-scoped).
//
// Kayıtlı provider_raw'dan whitelist DTO üretir. RoxyAPI ÇAĞRILMAZ (fallback çağrısı da YOK).
// Ham provider_raw hiçbir dönüş değerine konmaz. Yetki kontrolü route'tadır
// (human_design modülü + hd_system_reading alt-yetkisi).

import type { SupabaseClient } from "@supabase/supabase-js";
import { withTenant } from "./tenantScope";
import { hdSafeDbError } from "./safeError";
import { extractSystemReading, type SystemReadingDto } from "../providers/roxy/systemReading";
import { ROXY_PROVIDER_ID } from "../providers/roxy/config";

const TABLE = "human_design_charts";

export type SystemReadingResult =
  | { status: 200; body: { ok: true; available: true; data: SystemReadingDto } }
  | { status: 200; body: { ok: true; available: false } }
  | { status: 400 | 404 | 500; body: { ok: false; code: string; error: string } };

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

export async function getChartSystemReading(
  db: SupabaseClient,
  tenantId: string,
  id: string | null,
): Promise<SystemReadingResult> {
  if (!id || !ID_RE.test(id)) {
    return { status: 400, body: { ok: false, code: "INVALID_ID", error: "Geçerli bir harita kimliği gerekli." } };
  }
  // Tenant filtresi sorgunun kendisinde: başka tenant'ın kaydı "bulunamadı" ile aynı yanıtı alır
  // (varlık sızdırılmaz).
  const { data, error } = await withTenant(
    db.from(TABLE).select("id, source, provider, provider_raw"),
    tenantId,
    "getChartSystemReading",
  )
    .eq("id", id)
    .maybeSingle();
  if (error) return { status: 500, body: { ok: false, code: "DB_ERROR", error: hdSafeDbError("getChartSystemReading", error) } };
  if (!data) return { status: 404, body: { ok: false, code: "NOT_FOUND", error: "Kayıt bulunamadı." } };

  const row = data as { source: string | null; provider: string | null; provider_raw: unknown };
  // Manuel / dahili motor / provider_raw'ı olmayan kayıt → sistem yorumu YOK (uydurma ve
  // sağlayıcıya geri dönüş çağrısı yapılmaz).
  if (row.source !== "computed" || row.provider !== ROXY_PROVIDER_ID || row.provider_raw == null) {
    return { status: 200, body: { ok: true, available: false } };
  }
  const dto = extractSystemReading(row.provider_raw);
  if (!dto) return { status: 200, body: { ok: true, available: false } };
  return { status: 200, body: { ok: true, available: true, data: dto } };
}
