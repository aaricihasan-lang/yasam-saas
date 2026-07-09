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

// =========================================================================
// Sprint-3 Aşama 2 — MANUEL/legacy harita (source IS NULL | 'manual') erişimi.
//
// Yukarıdaki computed akışı (saveComputedChart/list/get/deleteComputedChart)
// DEĞİŞMEZ. Buradaki fonksiyonlar yalnız manuel satırlarla ilgilenir ve
// mevcut anon helper'ların (hdCharts.ts / hdKayitliHaritalar.ts) davranışını
// birebir yansıtır — yalnız erişim service_role'a taşınır.
// Engine/compute/BodyGraph/SVG matematiğine DOKUNMAZ — saf veri CRUD.
// =========================================================================

// Manuel listede yalnız hesaplanmamış satırlar: source null VEYA 'manual'.
const MANUAL_FILTER = "source.is.null,source.eq.manual";

export type ManualChartValues = {
  type_code: string | null;
  authority_code: string | null;
  profile_code: string | null;
  definition_code: string | null;
  active_centers: string[];
  open_centers: string[];
  gates: number[];
  channels: string[];
  notes: string | null;
};

// client'tan kabul edilen alanlar (tenant_id/client_id/id/source/zaman override edilemez).
const MANUAL_VALUE_KEYS: (keyof ManualChartValues)[] = [
  "type_code",
  "authority_code",
  "profile_code",
  "definition_code",
  "active_centers",
  "open_centers",
  "gates",
  "channels",
  "notes",
];

function pickManual(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of MANUAL_VALUE_KEYS) if (k in input) out[k] = input[k];
  return out;
}

async function clientInTenant(
  db: SupabaseClient,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("human_design_clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

export type ManualChartWithClient = Record<string, unknown> & {
  client: Record<string, unknown> | null;
};

/** Kayıtlı Haritalar listesi (manuel/legacy) + danışan join — listChartsWithClients aynısı. */
export async function listManualChartsWithClients(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ rows: ManualChartWithClient[]; error: string | null }> {
  const [chartsRes, clientsRes] = await Promise.all([
    db
      .from(TABLE)
      .select("*")
      .eq("tenant_id", tenantId)
      .or(MANUAL_FILTER)
      .order("created_at", { ascending: false }),
    db
      .from("human_design_clients")
      .select("id, name, birth_date, birth_time, birth_place, external_chart_url")
      .eq("tenant_id", tenantId),
  ]);
  if (chartsRes.error) return { rows: [], error: chartsRes.error.message };
  if (clientsRes.error) return { rows: [], error: clientsRes.error.message };

  const map = new Map(
    (clientsRes.data ?? []).map((c) => [(c as { id: string }).id, c as Record<string, unknown>]),
  );
  const rows: ManualChartWithClient[] = (chartsRes.data ?? []).map((ch) => {
    const chart = ch as Record<string, unknown>;
    const cid = chart.client_id as string | null;
    return { ...chart, client: cid ? map.get(cid) ?? null : null };
  });
  return { rows, error: null };
}

/** Bir danışanın manuel haritasını getir — loadClientChart aynısı (tenant+client_id). */
export async function getManualChartByClient(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<{ row: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  return { row: (data as Record<string, unknown> | null) ?? null, error: null };
}

/** Manuel harita upsert (client başına tek satır) — saveClientChart aynısı + IDOR guard. */
export async function saveManualChart(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  if (!clientId) return { ok: false, error: "client_id gerekli." };
  if (!(await clientInTenant(db, clientId, tenantId))) {
    return { ok: false, error: "Danışan bu hesaba ait değil." };
  }

  const { data: existing } = await db
    .from(TABLE)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId)
    .maybeSingle();

  const payload = {
    tenant_id: tenantId,
    client_id: clientId,
    ...pickManual(values),
    updated_at: new Date().toISOString(),
  };

  if (existing && (existing as { id?: string }).id) {
    const { error } = await db
      .from(TABLE)
      .update(payload)
      .eq("id", (existing as { id: string }).id)
      .eq("tenant_id", tenantId);
    return { ok: !error, error: error?.message ?? null };
  }
  const { error } = await db.from(TABLE).insert(payload);
  return { ok: !error, error: error?.message ?? null };
}

/** Manuel harita güncelle (id ile) — additif PATCH desteği. */
export async function updateManualChartById(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  const fields = { ...pickManual(values), updated_at: new Date().toISOString() };
  const { data, error } = await db
    .from(TABLE)
    .update(fields)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .or(MANUAL_FILTER)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil." };
  }
  return { ok: true, error: null };
}

/** Manuel harita sil (id ile) — deleteHdChart aynısı (tenant-scoped). */
export async function deleteManualChart(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await db
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  return { ok: !error, error: error?.message ?? null };
}

/** Bir danışanın manuel haritalarını sil (tenant-scoped, yalnız manuel satırlar). */
export async function deleteManualChartsByClient(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await db
    .from(TABLE)
    .delete()
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .or(MANUAL_FILTER);
  return { ok: !error, error: error?.message ?? null };
}
