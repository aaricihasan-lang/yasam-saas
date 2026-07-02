// FAZ 9B — Hesaplanmış HD haritalarının güvenli kalıcılığı (server-only).
//
// Tüm işlemler:
//   • tenant_id + user_id YALNIZ guard'dan gelir (route katmanı verir).
//   • source='computed' ile İZOLE — mevcut manuel ('manual') satırlara DOKUNMAZ.
//   • recompute-on-save: client'ın computed_result'ına GÜVENİLMEZ; sunucu
//     handleCompute ile yeniden hesaplar (karar 1).
// Engine/compute matematiği ve handleCompute/validateBirthInput MANTIĞI değişmez;
// yalnız yeniden kullanılır.

import type { SupabaseClient } from "@supabase/supabase-js";
import { handleCompute } from "./handleCompute";
import { deriveChartColumns } from "./deriveChartColumns";
import type { HdChartResult } from "../engine";

const TABLE = "human_design_charts";
const SOURCE = "computed";

export type SaveComputedBody = {
  date: string;
  time: string;
  timezone: string;
  client_id?: string | null;
  client_name?: string | null;
  birth_place?: string | null;
  location_id?: string | null;
  notes?: string | null;
};

export type SaveComputedResult =
  | { ok: true; id: string }
  | { ok: false; status: number; code: string; error: string };

export async function saveComputedChart(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  body: SaveComputedBody,
): Promise<SaveComputedResult> {
  // recompute-on-save — sunucu doğrular + hesaplar (client verisine güvenilmez)
  const computed = handleCompute({ date: body.date, time: body.time, timezone: body.timezone });
  if (!computed.body.ok) {
    return { ok: false, status: computed.status, code: computed.body.code, error: computed.body.error };
  }

  const result: HdChartResult = computed.body.data;
  const derived = deriveChartColumns(result);

  const payload = {
    tenant_id: tenantId,
    user_id: userId,
    client_id: body.client_id ?? null,
    client_name: body.client_name ?? null,
    source: SOURCE,
    birth_date: body.date,
    birth_time: body.time,
    birth_place: body.birth_place ?? null,
    timezone: body.timezone,
    location_id: body.location_id ?? null,
    input: { date: body.date, time: body.time, timezone: body.timezone },
    computed_result: result,
    notes: body.notes ?? null,
    ...derived,
  };

  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error || !data) {
    return { ok: false, status: 500, code: "DB_INSERT_FAILED", error: error?.message ?? "Kayıt oluşturulamadı." };
  }
  return { ok: true, id: (data as { id: string }).id };
}

export type ChartListRow = {
  id: string;
  client_id: string | null;
  client_name: string | null;
  birth_date: string | null;
  birth_place: string | null;
  timezone: string | null;
  type_code: string | null;
  authority_code: string | null;
  profile_code: string | null;
  definition_code: string | null;
  source: string | null;
  created_at: string;
};

const LIST_COLS =
  "id,client_id,client_name,birth_date,birth_place,timezone,type_code,authority_code,profile_code,definition_code,source,created_at";

export async function listComputedCharts(
  db: SupabaseClient,
  tenantId: string,
  opts: { clientId?: string } = {},
): Promise<{ rows: ChartListRow[]; error: string | null }> {
  let q = db.from(TABLE).select(LIST_COLS).eq("tenant_id", tenantId).eq("source", SOURCE);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as ChartListRow[], error: null };
}

export async function getComputedChart(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ row: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("source", SOURCE)
    .eq("id", id)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: (data as Record<string, unknown> | null) ?? null, error: null };
}

export async function deleteComputedChart(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  // false-success koruması: yalnız kendi tenant'ının computed satırı silinir.
  const { data, error } = await db
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("source", SOURCE)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Silinecek kayıt bulunamadı veya erişim izniniz yok." };
  }
  return { ok: true, error: null };
}
