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
import { hdSafeDbError } from "./safeError";
import { withTenant, tenantInsertPayload } from "./tenantScope";
import { manualChartIdFor, isUniqueViolation, sameInstant } from "./deterministicId";
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

  const payload = tenantInsertPayload(tenantId, {
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
  });

  const { data, error } = await db.from(TABLE).insert(payload).select("id").single();
  if (error || !data) {
    return { ok: false, status: 500, code: "DB_INSERT_FAILED", error: error ? hdSafeDbError("saveComputedChart", error) : "Kayıt oluşturulamadı." };
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
  let q = withTenant(db.from(TABLE).select(LIST_COLS), tenantId, "listComputedCharts").eq("source", SOURCE);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) return { rows: [], error: hdSafeDbError("listComputedCharts", error) };
  return { rows: (data ?? []) as unknown as ChartListRow[], error: null };
}

export async function getComputedChart(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ row: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await withTenant(db.from(TABLE).select("*"), tenantId, "getComputedChart")
    .eq("source", SOURCE)
    .eq("id", id)
    .maybeSingle();
  if (error) return { row: null, error: hdSafeDbError("getComputedChart", error) };
  return { row: (data as Record<string, unknown> | null) ?? null, error: null };
}

/**
 * Chart→Canonical kişisel bilgi paneli için TENANT-GÜVENLİ kaynak okuma.
 * Kaynak (manual/computed) FARK ETMEZ — yalnız tenant + id ile eşleşir (cross-tenant
 * IDOR yok). Yalnız normalizeChart/personalKnowledge için gereken scalar kolonlar
 * döner; computed_result jsonb çekilmez (derived scalars yeterlidir).
 */
export async function getChartKnowledgeSource(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{
  row: { id: string; source: string | null; type_code: string | null; authority_code: string | null; gates: number[] | null; channels: string[] | null } | null;
  error: string | null;
}> {
  const { data, error } = await withTenant(db.from(TABLE).select("id, source, type_code, authority_code, gates, channels"), tenantId, "getChartKnowledgeSource")
    .eq("id", id)
    .maybeSingle();
  if (error) return { row: null, error: hdSafeDbError("getChartKnowledgeSource", error) };
  return { row: (data as { id: string; source: string | null; type_code: string | null; authority_code: string | null; gates: number[] | null; channels: string[] | null } | null) ?? null, error: null };
}

/**
 * FAZ 2 Profesyonel Word — TENANT-GÜVENLİ chart + danışan okuma (rapor snapshot'ı için).
 * Kaynak (manual/computed) FARK ETMEZ; yalnız tenant + id ile eşleşir (cross-tenant IDOR
 * yok). personalKnowledge için scalar kolonlar + danışan kimlik/doğum + owned görsel path'i
 * döner. computed_result jsonb çekilmez. MUTATION YOK.
 */
export type ChartForReport = {
  id: string;
  source: string | null;
  type_code: string | null;
  authority_code: string | null;
  gates: number[] | null;
  channels: string[] | null;
  /** Özet tablo etiketleri için (manuel haritada dolu olabilir; computed'da null). */
  profile_code?: string | null;
  definition_code?: string | null;
  active_centers?: string[] | null;
  client_id: string | null;
  client_name: string | null;
  birth_date: string | null;
  birth_time: string | null;
  birth_place: string | null;
  /** Danışan kaydından (varsa) — ad + doğum + owned görsel storage path'i. */
  client: {
    id: string;
    name: string;
    birth_date: string | null;
    birth_time: string | null;
    birth_place: string | null;
    chart_image_url: string | null;
  } | null;
};

export async function getChartWithClientForReport(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ row: ChartForReport | null; error: string | null }> {
  const { data, error } = await withTenant(
    db.from(TABLE).select(
      "id, source, type_code, authority_code, profile_code, definition_code, active_centers, gates, channels, client_id, client_name, birth_date, birth_time, birth_place",
    ),
    tenantId,
    "getChartWithClientForReport",
  )
    .eq("id", id)
    .maybeSingle();
  if (error) return { row: null, error: hdSafeDbError("getChartWithClientForReport", error) };
  if (!data) return { row: null, error: null };

  const chart = data as Omit<ChartForReport, "client">;
  let client: ChartForReport["client"] = null;
  if (chart.client_id) {
    const { data: cli, error: cErr } = await withTenant(
      db.from("human_design_clients").select(
        "id, name, birth_date, birth_time, birth_place, chart_image_url",
      ),
      tenantId,
      "getChartWithClientForReport.client",
    )
      .eq("id", chart.client_id)
      .maybeSingle();
    if (cErr) return { row: null, error: hdSafeDbError("getChartWithClientForReport.client", cErr) };
    client = (cli as ChartForReport["client"]) ?? null;
  }
  return { row: { ...chart, client }, error: null };
}

export async function deleteComputedChart(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  // false-success koruması: yalnız kendi tenant'ının computed satırı silinir.
  const { data, error } = await withTenant(db.from(TABLE).delete(), tenantId, "deleteComputedChart")
    .eq("source", SOURCE)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: hdSafeDbError("deleteComputedChart", error) };
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
  const { data, error } = await withTenant(db.from("human_design_clients").select("id"), tenantId, "clientInTenant")
    .eq("id", clientId)
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
    withTenant(db.from(TABLE).select("*"), tenantId, "listManualChartsWithClients.charts")
      .or(MANUAL_FILTER)
      .order("created_at", { ascending: false }),
    withTenant(
      db.from("human_design_clients").select(
        "id, name, birth_date, birth_time, birth_place, external_chart_url",
      ),
      tenantId,
      "listManualChartsWithClients.clients",
    ),
  ]);
  if (chartsRes.error) return { rows: [], error: hdSafeDbError("listManualChartsWithClients.charts", chartsRes.error) };
  if (clientsRes.error) return { rows: [], error: hdSafeDbError("listManualChartsWithClients.clients", clientsRes.error) };

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

/**
 * Bir danışanın manuel haritasını getir (tenant + client_id + YALNIZ manuel/legacy satır).
 *
 * P1-2: Geçmişte eşzamanlı ilk kayıtlarla aynı danışana birden çok manuel satır
 * oluşabildi; `.maybeSingle()` bu durumda PGRST116 → 500 veriyordu ve danışan kullanılamaz
 * hâle geliyordu. Artık deterministik sıra (en son güncellenen) + limit 1 okunur: eski
 * yinelenen satırlar SİLİNMEZ (veri kaybı yok) ama danışan çalışmaya devam eder.
 */
export async function getManualChartByClient(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<{ row: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await withTenant(db.from(TABLE).select("*"), tenantId, "getManualChartByClient")
    .eq("client_id", clientId)
    .or(MANUAL_FILTER)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return { row: null, error: hdSafeDbError("getManualChartByClient", error) };
  const rows = (data ?? []) as Record<string, unknown>[];
  return { row: rows[0] ?? null, error: null };
}

export type SaveManualChartResult = {
  ok: boolean;
  error: string | null;
  id?: string | null;
  updatedAt?: string | null;
  /** HTTP durum ipucu (409 = eşzamanlı değişiklik çakışması). */
  status?: number;
  code?: string;
};

export const HD_CHART_CONFLICT_MESSAGE =
  "Bu harita başka bir oturumda değiştirildi. Son hâlini görmek için Yenile'ye basıp tekrar deneyin.";

/**
 * Manuel harita upsert (danışan başına TEK satır) + IDOR guard + iyimser eşzamanlılık.
 *
 * Tekillik (P1-2, şema değişikliği gerekmez): yeni satırın id'si (tenant, client)'tan
 * deterministik türetilir → eşzamanlı ikinci INSERT PRIMARY KEY ile reddedilir (23505) ve
 * güncellemeye döner. 12 paralel ilk kayıt → tek satır.
 *
 * Eşzamanlılık (P2-9): `expectedUpdatedAt` VERİLİRSE (UI her zaman verir):
 *   • null  = "yüklediğimde harita yoktu" → bu arada başka oturum oluşturduysa 409.
 *   • string = yüklenen satırın updated_at'i → satır değiştiyse/silindiyse 409.
 *   Güncelleme ayrıca okunan updated_at ile koşullu yapılır (okuma-yazma arası yarış → 409).
 * Verilmezse (eski istemci / doğrudan API) son-yazan-kazanır davranışı korunur (geriye uyum).
 */
export async function saveManualChart(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  values: Record<string, unknown>,
  opts: { expectedUpdatedAt?: string | null } = {},
): Promise<SaveManualChartResult> {
  if (!clientId) return { ok: false, error: "client_id gerekli.", status: 400 };
  if (!(await clientInTenant(db, clientId, tenantId))) {
    return { ok: false, error: "Danışan bu hesaba ait değil.", status: 400 };
  }
  const checkVersion = opts.expectedUpdatedAt !== undefined;
  const expected = opts.expectedUpdatedAt ?? null;
  const conflict = (): SaveManualChartResult => ({ ok: false, error: HD_CHART_CONFLICT_MESSAGE, status: 409, code: "CONFLICT" });

  const current = await getManualChartByClient(db, tenantId, clientId);
  // Okuma hatası YUTULMAZ: aksi hâlde INSERT dalına düşülüp yinelenen satır oluşurdu.
  if (current.error) return { ok: false, error: current.error, status: 500 };
  const existing = current.row as { id: string; updated_at?: string | null } | null;

  const payload = {
    client_id: clientId,
    ...pickManual(values),
    updated_at: new Date().toISOString(),
  };

  async function updateExisting(row: { id: string; updated_at?: string | null }, cas: boolean): Promise<SaveManualChartResult> {
    let q = withTenant(db.from(TABLE).update(payload), tenantId, "saveManualChart.update").eq("id", row.id);
    if (cas && row.updated_at) q = q.eq("updated_at", row.updated_at);
    const { data, error } = await q.select("id, updated_at");
    if (error) return { ok: false, error: hdSafeDbError("saveManualChart.update", error), status: 500 };
    const out = (data ?? []) as { id: string; updated_at: string | null }[];
    if (out.length === 0) return cas ? conflict() : { ok: false, error: "Harita bulunamadı.", status: 404 };
    return { ok: true, error: null, id: out[0].id, updatedAt: out[0].updated_at ?? null };
  }

  if (existing && existing.id) {
    if (checkVersion && (expected === null || !sameInstant(existing.updated_at ?? null, expected))) return conflict();
    return updateExisting(existing, checkVersion);
  }

  // Yüklenirken bir satır vardı ama artık yok → başka oturumda silinmiş.
  if (checkVersion && expected !== null) return conflict();

  // id döner → UI kayıt sonrası "Profesyonel Word oluştur" CTA'sını bu haritaya bağlar.
  const id = manualChartIdFor(tenantId, clientId);
  const { data: inserted, error } = await db
    .from(TABLE)
    .insert(tenantInsertPayload(tenantId, { id, ...payload }))
    .select("id, updated_at")
    .maybeSingle();
  if (!error) {
    const row = inserted as { id?: string; updated_at?: string | null } | null;
    return { ok: true, error: null, id: row?.id ?? id, updatedAt: row?.updated_at ?? null };
  }
  if (!isUniqueViolation(error)) {
    return { ok: false, error: hdSafeDbError("saveManualChart.insert", error), status: 500 };
  }
  // Eşzamanlı ilk kayıt: satırı başka istek oluşturdu (PRIMARY KEY tekilliği).
  if (checkVersion) return conflict();
  return updateExisting({ id }, false);
}

/** Manuel harita güncelle (id ile) — additif PATCH desteği. */
export async function updateManualChartById(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  const fields = { ...pickManual(values), updated_at: new Date().toISOString() };
  const { data, error } = await withTenant(db.from(TABLE).update(fields), tenantId, "updateManualChartById")
    .eq("id", id)
    .or(MANUAL_FILTER)
    .select("id");
  if (error) return { ok: false, error: hdSafeDbError("updateManualChartById", error) };
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
  const { error } = await withTenant(db.from(TABLE).delete(), tenantId, "deleteManualChart")
    .eq("id", id);
  return { ok: !error, error: error ? hdSafeDbError("deleteManualChart", error) : null };
}

/** Bir danışanın manuel haritalarını sil (tenant-scoped, yalnız manuel satırlar). */
export async function deleteManualChartsByClient(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await withTenant(db.from(TABLE).delete(), tenantId, "deleteManualChartsByClient")
    .eq("client_id", clientId)
    .or(MANUAL_FILTER);
  return { ok: !error, error: error ? hdSafeDbError("deleteManualChartsByClient", error) : null };
}
