// Human Design Variables — KALICI sonuç deposu (public.human_design_chart_variables; migration 20271105000000).
// YALNIZ sunucu (service_role) + ZORUNLU tenant filtresi. Tenant kimliği her zaman oturumdan (ctx) gelir.
//
//   • Okuma: (tenant, analiz, cache_key) tam eşleşmesi + satır meta verisinin (adapter / politika / girdi kimliği / UTC ofseti; doğum anı yalnız anahtarın özetinde)
//     yeniden karşılaştırılması. Satırın içeriği burada YORUMLANMAZ; servis, sağlayıcı yanıtına uyguladığı denetimlerin
//     AYNISINI uygular (fail-closed). Tutarsız satır "bozuk" sayılır, kullanılmaz.
//   • Yazma: yalnız denetimden geçmiş sağlayıcı yanıtı. Eşzamanlı yazımda benzersizlik çakışması = başka örnek yazdı (sorun yok).
//     Bozuk satır, aynı anahtarla GÜNCELLENİR. Analizin eski anahtarlı satırları (eski doğum anı / adapter) temizlenir.
//   • YALNIZ tablonun kendisi yoksa (migration henüz uygulanmamış) servis bugünkü davranışa (süreç içi önbellek) düşer;
//     eksik sütun dahil diğer tüm DB / şema hataları "hata"dır (okumada ücretli çağrı yapılmaz).

import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantInsertPayload, withTenant } from "../api/tenantScope";
import { isUniqueViolation } from "../api/deterministicId";
import { ROXY_PROVIDER_ID } from "../providers/roxy/config";
import { ROXY_VARIABLES_ADAPTER_VERSION, ROXY_VARIABLES_ENDPOINT } from "./roxyVariablesClient";

export const VARIABLES_TABLE = "human_design_chart_variables";

export type VariablesStoreKey = {
  tenantId: string;
  chartId: string;
  cacheKey: string;
  nodeType: string;
  lang: string;
  chartInputHash: string | null;
  utcOffsetSeconds: number;
};

export type StoreRead =
  | { kind: "hit"; raw: unknown }
  | { kind: "miss" }
  | { kind: "corrupt"; reason: string }
  | { kind: "missing_table" }
  | { kind: "error"; error: unknown };

export type StoreWrite = { kind: "saved" } | { kind: "exists" } | { kind: "missing_table" } | { kind: "error"; error: unknown };

type DbErr = { code?: string; message?: string } | null | undefined;

/**
 * YALNIZ bu tablonun kendisi yok → migration henüz uygulanmamış (servis bugünkü davranışa düşer).
 *   • Kod ŞART: 42P01 (Postgres: tablo yok) veya PGRST205 (PostgREST: tablo şema önbelleğinde yok).
 *   • Mesaj bu tabloyu ADIYLA anmalı (başka tablonun — ör. tetikleyicideki human_design_charts — yokluğu sayılmaz).
 *   • Eksik / yanlış SÜTUN (42703, PGRST204), yetki, bağlantı vb. her şey "hata"dır → servis durur, ücretli çağrı YAPILMAZ.
 *     (Tablo var ama şeması kaymışsa kalıcı depoyu sessizce kapatıp her örnekte yeniden ücretli çağrı yapmak yasaktır.)
 */
export function isVariablesTableMissing(err: DbErr): boolean {
  if (!err || (err.code !== "42P01" && err.code !== "PGRST205")) return false;
  const m = err.message ?? "";
  return new RegExp(`(relation|table) ["'](public\\.)?${VARIABLES_TABLE}["']`, "i").test(m);
}

const COLS = "chart_id, cache_key, provider, endpoint, adapter_version, node_type, lang, chart_input_hash, utc_offset_seconds, result";
type Row = {
  chart_id: string;
  cache_key: string;
  provider: string;
  endpoint: string;
  adapter_version: string;
  node_type: string;
  lang: string;
  chart_input_hash: string | null;
  utc_offset_seconds: number;
  result: unknown;
};

export async function readStoredVariables(db: SupabaseClient, k: VariablesStoreKey): Promise<StoreRead> {
  const { data, error } = await withTenant(db.from(VARIABLES_TABLE).select(COLS), k.tenantId, "variables.store.read")
    .eq("chart_id", k.chartId)
    .eq("cache_key", k.cacheKey)
    .maybeSingle();
  if (error) return isVariablesTableMissing(error) ? { kind: "missing_table" } : { kind: "error", error };
  if (!data) return { kind: "miss" };
  const r = data as Row;
  // Anahtar bu alanları zaten içerir; yine de satır içeriği bağımsız olarak doğrulanır (elle düzenleme / bozulma).
  if ((r.chart_id ?? "").toLowerCase() !== k.chartId) return { kind: "corrupt", reason: "chart" };
  if (r.provider !== ROXY_PROVIDER_ID || r.endpoint !== ROXY_VARIABLES_ENDPOINT || r.adapter_version !== ROXY_VARIABLES_ADAPTER_VERSION) return { kind: "corrupt", reason: "adapter" };
  if (r.node_type !== k.nodeType || r.lang !== k.lang) return { kind: "corrupt", reason: "policy" };
  if ((r.chart_input_hash ?? null) !== k.chartInputHash) return { kind: "corrupt", reason: "input" };
  if (r.utc_offset_seconds !== k.utcOffsetSeconds) return { kind: "corrupt", reason: "birth" };
  if (typeof r.result !== "object" || r.result === null || Array.isArray(r.result)) return { kind: "corrupt", reason: "result" };
  return { kind: "hit", raw: r.result };
}

export async function writeStoredVariables(
  db: SupabaseClient,
  k: VariablesStoreKey,
  raw: unknown,
  userId: string,
  opts: { replace: boolean; nowIso: string },
): Promise<StoreWrite> {
  const fields = {
    provider: ROXY_PROVIDER_ID,
    endpoint: ROXY_VARIABLES_ENDPOINT,
    adapter_version: ROXY_VARIABLES_ADAPTER_VERSION,
    node_type: k.nodeType,
    lang: k.lang,
    chart_input_hash: k.chartInputHash,
    utc_offset_seconds: k.utcOffsetSeconds,
    result: raw,
  };
  let out: StoreWrite;
  if (opts.replace) {
    // Bozuk satırın üzerine yaz (aynı anahtar). Satır bu arada silindiyse ekle.
    const { data, error } = await withTenant(db.from(VARIABLES_TABLE).update({ ...fields, created_by: userId, updated_at: opts.nowIso }), k.tenantId, "variables.store.replace")
      .eq("chart_id", k.chartId)
      .eq("cache_key", k.cacheKey)
      .select("cache_key");
    if (error) return isVariablesTableMissing(error) ? { kind: "missing_table" } : { kind: "error", error };
    out = (data ?? []).length > 0 ? { kind: "saved" } : await insertRow();
  } else {
    out = await insertRow();
  }
  if (out.kind === "saved") {
    // Aynı analizin eski anahtarlı satırları (eski doğum anı / adapter / politika) — hiçbir zaman eşleşmezler; temizlik en iyi çaba.
    await withTenant(db.from(VARIABLES_TABLE).delete(), k.tenantId, "variables.store.prune")
      .eq("chart_id", k.chartId)
      .neq("cache_key", k.cacheKey);
  }
  return out;

  async function insertRow(): Promise<StoreWrite> {
    const { error } = await db.from(VARIABLES_TABLE).insert(
      tenantInsertPayload(k.tenantId, { chart_id: k.chartId, cache_key: k.cacheKey, ...fields, created_by: userId, created_at: opts.nowIso, updated_at: opts.nowIso }),
    );
    if (!error) return { kind: "saved" };
    if (isUniqueViolation(error)) return { kind: "exists" };
    return isVariablesTableMissing(error) ? { kind: "missing_table" } : { kind: "error", error };
  }
}
