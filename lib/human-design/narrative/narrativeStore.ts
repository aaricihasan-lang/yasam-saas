// HD ANLATI — KALICI dil başına anlatı deposu (public.human_design_chart_narratives; migration TASLAĞI hd-anlati-*).
// YALNIZ sunucu (service_role) + ZORUNLU tenant filtresi (withTenant). Tenant kimliği her zaman oturumdan gelir.
//
//   • Okuma: (tenant, harita, cache_key) tam eşleşmesi + satır meta verisinin bağımsız karşılaştırması. İçerik burada
//     yorumlanmaz; servis sağlayıcı yanıtına uyguladığı denetimin AYNISINI uygular (fail-closed).
//   • Yazma: yalnız EKLEME (insert). human_design_charts'a ASLA yazılmaz. Benzersizlik çakışması = başka örnek yazdı.
//   • Tablo yoksa (migration uygulanmamış): okuma "kayıt yok", yazma "missing_table" — ücretli çağrı YAPILMAZ (servis
//     üretimi tablo yokken baştan reddeder; çağrı yapılıp sonuç atılmaz).

import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantInsertPayload, withTenant } from "../api/tenantScope";
import { isUniqueViolation } from "../api/deterministicId";
import { ROXY_ADAPTER_VERSION, ROXY_BODYGRAPH_ENDPOINT, ROXY_PROVIDER_ID } from "../providers/roxy/config";
import { HD_NARRATIVE_TABLE, HD_NARRATIVE_VERSION } from "./narrativeConfig";

export type HdNarrativeStoreKey = {
  tenantId: string;
  chartId: string;
  cacheKey: string;
  lang: string;
  nodeType: string;
  chartInputHash: string | null;
  /** Anlatının doğrulandığı kayıtlı haritanın kanonik özeti (hdCanonicalSha). */
  canonicalSha: string;
};

export type HdNarrativeRead =
  | { kind: "hit"; raw: unknown }
  | { kind: "miss" }
  | { kind: "corrupt"; reason: string }
  | { kind: "missing_table" }
  | { kind: "error"; error: unknown };

export type HdNarrativeWrite = { kind: "saved" } | { kind: "exists" } | { kind: "missing_table" } | { kind: "error"; error: unknown };

type DbErr = { code?: string; message?: string } | null | undefined;

/** YALNIZ bu tablonun kendisi yok (42P01 / PGRST205 + mesajda tablo adı). Diğer her hata "hata"dır. */
export function isNarrativeTableMissing(err: DbErr): boolean {
  if (!err || (err.code !== "42P01" && err.code !== "PGRST205")) return false;
  return new RegExp(`(relation|table) ["'](public\\.)?${HD_NARRATIVE_TABLE}["']`, "i").test(err.message ?? "");
}

const COLS = "chart_id, cache_key, provider, endpoint, adapter_version, narrative_version, node_type, lang, chart_input_hash, canonical_sha, provider_raw";
type Row = {
  chart_id: string;
  cache_key: string;
  provider: string;
  endpoint: string;
  adapter_version: string;
  narrative_version: string;
  node_type: string;
  lang: string;
  chart_input_hash: string | null;
  canonical_sha: string;
  provider_raw: unknown;
};

export async function readStoredNarrative(db: SupabaseClient, k: HdNarrativeStoreKey): Promise<HdNarrativeRead> {
  const { data, error } = await withTenant(db.from(HD_NARRATIVE_TABLE).select(COLS), k.tenantId, "narrative.store.read")
    .eq("chart_id", k.chartId)
    .eq("cache_key", k.cacheKey)
    .maybeSingle();
  if (error) return isNarrativeTableMissing(error) ? { kind: "missing_table" } : { kind: "error", error };
  if (!data) return { kind: "miss" };
  const r = data as Row;
  if ((r.chart_id ?? "").toLowerCase() !== k.chartId) return { kind: "corrupt", reason: "chart" };
  if (r.provider !== ROXY_PROVIDER_ID || r.endpoint !== ROXY_BODYGRAPH_ENDPOINT || r.adapter_version !== ROXY_ADAPTER_VERSION) {
    return { kind: "corrupt", reason: "adapter" };
  }
  if (r.narrative_version !== HD_NARRATIVE_VERSION) return { kind: "corrupt", reason: "version" };
  if (r.lang !== k.lang || r.node_type !== k.nodeType) return { kind: "corrupt", reason: "policy" };
  if ((r.chart_input_hash ?? null) !== k.chartInputHash) return { kind: "corrupt", reason: "input" };
  if (r.canonical_sha !== k.canonicalSha) return { kind: "corrupt", reason: "canonical" };
  if (typeof r.provider_raw !== "object" || r.provider_raw === null || Array.isArray(r.provider_raw)) return { kind: "corrupt", reason: "raw" };
  return { kind: "hit", raw: r.provider_raw };
}

/** Yalnız EKLEME. Var olan satır GÜNCELLENMEZ (bozuk satır gösterilmez; temizlik Owner/yönetici işi — otomatik silme yok). */
export async function insertStoredNarrative(db: SupabaseClient, k: HdNarrativeStoreKey, raw: unknown, userId: string): Promise<HdNarrativeWrite> {
  const payload = tenantInsertPayload(k.tenantId, {
    chart_id: k.chartId,
    cache_key: k.cacheKey,
    provider: ROXY_PROVIDER_ID,
    endpoint: ROXY_BODYGRAPH_ENDPOINT,
    adapter_version: ROXY_ADAPTER_VERSION,
    narrative_version: HD_NARRATIVE_VERSION,
    node_type: k.nodeType,
    lang: k.lang,
    chart_input_hash: k.chartInputHash,
    canonical_sha: k.canonicalSha,
    provider_raw: raw,
    created_by: userId,
  });
  const { error } = await db.from(HD_NARRATIVE_TABLE).insert(payload);
  if (!error) return { kind: "saved" };
  if (isNarrativeTableMissing(error)) return { kind: "missing_table" };
  if (isUniqueViolation(error)) return { kind: "exists" };
  return { kind: "error", error };
}

/** Tablo var mı (üretimden ÖNCE: tablo yokken ücretli çağrı yapılıp sonuç atılmasın). */
export async function narrativeStoreAvailable(db: SupabaseClient, tenantId: string): Promise<"ok" | "missing_table" | "error"> {
  const { error } = await withTenant(db.from(HD_NARRATIVE_TABLE).select("cache_key"), tenantId, "narrative.store.probe").limit(1);
  if (!error) return "ok";
  return isNarrativeTableMissing(error) ? "missing_table" : "error";
}
