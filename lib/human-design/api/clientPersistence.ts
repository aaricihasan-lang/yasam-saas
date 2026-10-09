// Sprint-3 — human_design_clients güvenli kalıcılığı (server-only, service_role).
//
// Tüm işlemler:
//   • tenant_id + user_id YALNIZ guard'dan gelir (route katmanı verir); body'den GÜVENİLMEZ.
//   • Yazma alanları allow-list ile süzülür (tenant_id/user_id/id/zaman override edilemez).
//   • DELETE (owner kararı 2026-10-09): profil + bağlı analizler + Word raporları silinir
//     (sıralı, idempotent, yalnız kimlikle; bkz. deleteHdClient).
// HD engine/compute/BodyGraph matematiğine DOKUNMAZ — yalnız human_design_clients CRUD.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HumanDesignClient,
  HumanDesignClientInsert,
} from "@/lib/human-design/types";
import { hdSafeDbError } from "./safeError";
import { withTenant, tenantInsertPayload } from "./tenantScope";
import { HD_CONFLICT_CODE, HD_CONFLICT_MESSAGE } from "./optimistic";
import { HD_REPORT_SNAPSHOT_DIR, isOwnedChartImagePath, isOwnedReportSnapshotPath, isSafeStoragePath } from "./chartImagePath";
import { listClientImageObjects, removeHdStorageObjects, reportReferencedImagePaths } from "./hdStorage";

import { resolveHdBirthLocation } from "./hdBirthLocation";

const TABLE = "human_design_clients";

// Client'tan kabul edilecek alanlar (geri kalan her şey — tenant_id/user_id/id/created_at — yok sayılır).
export type HdClientEditable = Partial<Omit<HumanDesignClientInsert, "tenant_id" | "user_id">>;

const EDITABLE_KEYS: (keyof HumanDesignClient)[] = [
  "name",
  "birth_date",
  "birth_time",
  "birth_place",
  "chart_image_url",
  "external_chart_url",
  "notes",
];

function pick(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_KEYS) if (k in input) out[k] = input[k];
  return out;
}

// ── Yapılandırılmış doğum yeri (migration 20271008000000) ──────────────────────
// Konum kolonları istemciden DOĞRUDAN kabul edilmez. İstemci yalnız `birth_location_ref` gönderir
// (yerel konum kimliği veya sunucu-imzalı Roxy referansı); sunucu doğrular ve tz/koordinatı yazar.
//   • alan yok        → konum kolonlarına dokunulmaz (eski istemciler / eski danışanlar)
//   • null / ""       → konum kolonları temizlenir
//   • çözülemeyen ref → 400 (oynanmış/süresi geçmiş veri yazılmaz)
const LOCATION_COLUMNS = ["birth_location_id", "birth_location_label", "birth_timezone", "birth_latitude", "birth_longitude"] as const;

export function resolveClientLocationFields(
  input: Record<string, unknown>,
): { fields: Record<string, unknown> | null; error: string | null } {
  if (!("birth_location_ref" in input)) return { fields: null, error: null };
  const ref = input.birth_location_ref;
  if (ref === null || ref === "") {
    return { fields: Object.fromEntries(LOCATION_COLUMNS.map((c) => [c, null])), error: null };
  }
  const loc = resolveHdBirthLocation(ref);
  if (!loc) return { fields: null, error: "Doğum yeri doğrulanamadı. Lütfen listeden yeniden seçin." };
  return {
    fields: {
      birth_location_id: loc.id,
      birth_location_label: loc.label,
      birth_timezone: loc.timezone,
      birth_latitude: loc.latitude,
      birth_longitude: loc.longitude,
    },
    error: null,
  };
}

/** Migration henüz uygulanmadıysa (kolon yok) konum alanları atlanıp kayıt yine yapılır. */
function isMissingColumn(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42703" || err.code === "PGRST204" || /column .* does not exist|Could not find the .* column/i.test(err.message ?? "");
}

export async function listHdClients(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ rows: HumanDesignClient[]; error: string | null }> {
  const { data, error } = await withTenant(db.from(TABLE).select("*"), tenantId, "listHdClients")
    .order("created_at", { ascending: false });
  if (error) return { rows: [], error: hdSafeDbError("listHdClients", error) };
  return { rows: (data ?? []) as HumanDesignClient[], error: null };
}

export async function getHdClient(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ row: HumanDesignClient | null; error: string | null }> {
  const { data, error } = await withTenant(db.from(TABLE).select("*"), tenantId, "getHdClient")
    .eq("id", id)
    .maybeSingle();
  if (error) return { row: null, error: hdSafeDbError("getHdClient", error) };
  return { row: (data as HumanDesignClient | null) ?? null, error: null };
}

export async function insertHdClient(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  input: Record<string, unknown>,
): Promise<{ id: string | null; error: string | null }> {
  const name = String(input.name ?? "").trim();
  if (!name) return { id: null, error: "İsim alanı zorunludur." };

  const loc = resolveClientLocationFields(input);
  if (loc.error) return { id: null, error: loc.error };
  const base = {
    ...pick(input),
    name,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  let { data, error } = await db.from(TABLE).insert(tenantInsertPayload(tenantId, { ...base, ...(loc.fields ?? {}) })).select("id").single();
  if (error && loc.fields && isMissingColumn(error)) {
    ({ data, error } = await db.from(TABLE).insert(tenantInsertPayload(tenantId, base)).select("id").single());
  }
  if (error || !data) {
    return { id: null, error: error ? hdSafeDbError("insertHdClient", error) : "Kayıt oluşturulamadı." };
  }
  return { id: (data as { id: string }).id, error: null };
}

export async function updateHdClient(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  input: Record<string, unknown>,
  opts: { expectedUpdatedAt?: string } = {},
): Promise<{ ok: boolean; error: string | null; status?: number; code?: string; updatedAt?: string | null }> {
  const loc = resolveClientLocationFields(input);
  if (loc.error) return { ok: false, error: loc.error, status: 400 };
  const base = { ...pick(input), updated_at: new Date().toISOString() };

  // P2-9: beklenen sürüm verildiyse koşullu (atomik) güncelleme — başka oturum ezilmez.
  const run = (fields: Record<string, unknown>) => {
    let q = withTenant(db.from(TABLE).update(fields), tenantId, "updateHdClient").eq("id", id);
    if (opts.expectedUpdatedAt) q = q.eq("updated_at", opts.expectedUpdatedAt);
    return q.select("id, updated_at");
  };
  let { data, error } = await run({ ...base, ...(loc.fields ?? {}) });
  if (error && loc.fields && isMissingColumn(error)) ({ data, error } = await run(base));
  if (error) return { ok: false, error: hdSafeDbError("updateHdClient", error) };
  if (!data || data.length === 0) {
    if (opts.expectedUpdatedAt) {
      const { row } = await getHdClient(db, tenantId, id);
      if (row) return { ok: false, error: HD_CONFLICT_MESSAGE, status: 409, code: HD_CONFLICT_CODE };
    }
    return { ok: false, error: "Kayıt bulunamadı veya bu tenant'a ait değil.", status: 404 };
  }
  return { ok: true, error: null, updatedAt: (data[0] as { updated_at?: string | null }).updated_at ?? null };
}

export type DeleteHdClientResult = {
  ok: boolean;
  error: string | null;
  status?: number;
  code?: string;
  /** Silinen Human Design analizi (harita) ve Word/rapor sayısı. */
  deletedAnalyses?: number;
  deletedReports?: number;
  /** Silme tamam; ancak bazı yan temizlikler başarısız (loglandı). */
  warnings?: string[];
};

/** Profil silinmeden ÖNCE kesin belirlenen kayıtlar (yalnız profil + tenant kimliğiyle). */
export type HdClientDeletePlan = {
  chartIds: string[];
  reportIds: string[];
  /** Silinecek raporların kendilerine ait donmuş BodyGraph/görsel dosyaları. */
  reportImagePaths: string[];
  /** Bu profilin analizine bağlı ama BAŞKA profile ait rapor — silinmez, yalnız raporlanır. */
  keptForeignReports: number;
};

type ReportLinkRow = { id: string; client_id: string | null; chart_id: string | null; storagePath?: string | null };

/**
 * Silme planı (salt okunur). Silinecekler:
 *   • analizler: human_design_charts.client_id = profil (manuel/eski kayıtlar dahil; bağımsız
 *     analizler — client_id NULL — ve başka profillerin analizleri ASLA);
 *   • raporlar: client_id = profil, YA DA client_id NULL olup bu profilin bir analizine bağlı olanlar.
 *     Başka profile ait rapor bu profilin analizine bağlı görünse bile silinmez (keptForeignReports).
 * İsim/doğum benzerliği KULLANILMAZ; her sorgu tenant-scoped.
 */
export async function planHdClientDelete(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ plan: HdClientDeletePlan | null; error: string | null }> {
  const { data: chartRows, error: chartErr } = await withTenant(
    db.from("human_design_charts").select("id"), tenantId, "planHdClientDelete.charts",
  ).eq("client_id", id);
  if (chartErr) return { plan: null, error: hdSafeDbError("planHdClientDelete.charts", chartErr) };
  const chartIds = ((chartRows ?? []) as { id: string }[]).map((r) => r.id);

  const cols = "id, client_id, chart_id, snapshot->chartImage->>storagePath";
  const { data: byClient, error: rcErr } = await withTenant(
    db.from("human_design_reports").select(cols), tenantId, "planHdClientDelete.reports",
  ).eq("client_id", id);
  if (rcErr) return { plan: null, error: hdSafeDbError("planHdClientDelete.reports", rcErr) };
  let byChart: ReportLinkRow[] = [];
  if (chartIds.length > 0) {
    const { data, error } = await withTenant(
      db.from("human_design_reports").select(cols), tenantId, "planHdClientDelete.chartReports",
    ).in("chart_id", chartIds);
    if (error) return { plan: null, error: hdSafeDbError("planHdClientDelete.chartReports", error) };
    byChart = (data ?? []) as unknown as ReportLinkRow[];
  }

  const reports = new Map<string, ReportLinkRow>();
  let keptForeignReports = 0;
  for (const r of (byClient ?? []) as unknown as ReportLinkRow[]) reports.set(r.id, r);
  for (const r of byChart) {
    if (reports.has(r.id)) continue;
    if (r.client_id === null) reports.set(r.id, r);
    else if (r.client_id !== id) keptForeignReports++;
  }
  const reportImagePaths: string[] = [];
  for (const r of reports.values()) {
    const p = typeof r.storagePath === "string" ? r.storagePath.trim() : "";
    // Yalnız BU rapora ait donmuş kopya ({tenant}/report-snapshots/{raporId}.*) ya da bu profilin klasörü.
    if (isOwnedReportSnapshotPath(p, tenantId) && p.startsWith(`${tenantId}/${HD_REPORT_SNAPSHOT_DIR}/${r.id}.`)) reportImagePaths.push(p);
    else if (isOwnedChartImagePath(p, tenantId, id) && isSafeStoragePath(p)) reportImagePaths.push(p);
  }
  return { plan: { chartIds, reportIds: [...reports.keys()], reportImagePaths, keptForeignReports }, error: null };
}

/** Silme onayı öncesi gösterilecek KESİN sayılar (salt okunur). */
export async function previewHdClientDelete(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: boolean; error: string | null; status?: number; analyses?: number; reports?: number; journeyLinked?: boolean }> {
  const { row: client, error: readErr } = await getHdClient(db, tenantId, id);
  if (readErr) return { ok: false, error: readErr, status: 500 };
  if (!client) return { ok: false, error: "Danışan bulunamadı veya bu tenant'a ait değil.", status: 404 };
  const { plan, error } = await planHdClientDelete(db, tenantId, id);
  if (!plan) return { ok: false, error, status: 500 };
  return {
    ok: true, error: null, analyses: plan.chartIds.length, reports: plan.reportIds.length,
    journeyLinked: !!(client as { journey_client_id?: string | null }).journey_client_id,
  };
}

/**
 * Human Design profil silme (OWNER KARARI 2026-10-09): profil + ona bağlı TÜM Human Design
 * analizleri + bu analizlere/profile bağlı Word raporları kalıcı olarak silinir.
 * (Önceki P1-3 davranışı raporları korurdu; owner kararıyla değişti.)
 *
 * Güvenlik / tutarlılık (migration GEREKTİRMEZ; her adım tenant-scoped, yalnız kimlikle):
 *   1) Profil bu tenant'ta yoksa 404 — hiçbir şey silinmez.
 *   2) Plan: silinecek analiz/rapor kimlikleri kesin belirlenir (planHdClientDelete).
 *   3) `expect` (onay penceresinde gösterilen sayılar) verildiyse ve şimdi DAHA FAZLA kayıt varsa
 *      (arada yeni analiz/rapor oluştu) 409 — kullanıcının görmediği kayıt silinmez.
 *   4) Raporlar → 5) analizler → (profilde kalan analiz varsa 409, profil korunur) → 6) profil.
 *      Ara adım hatasında profil YERİNDE kalır; aynı "Sil" tekrar denendiğinde kalanlar tamamlanır
 *      (her adım idempotent). Profil en son silinir → yetim analiz/rapor kalmaz.
 *   7) Storage (DB'den SONRA): profil klasörü (başka raporun hâlâ kullandığı nesne hariç) + silinen
 *      raporların kendi donmuş görselleri. Hata DB'yi geri almaz → uyarı + `[hd-storage-cleanup-failed]`.
 * Danışan Yolculuğu: merkezî danışan (clients) SİLİNMEZ; bağ profil satırıyla birlikte kalkar.
 * Başka modül tablolarına dokunulmaz.
 */
export async function deleteHdClient(
  db: SupabaseClient,
  tenantId: string,
  id: string,
  opts: { expect?: { analyses: number; reports: number } } = {},
): Promise<DeleteHdClientResult> {
  const { row: client, error: readErr } = await getHdClient(db, tenantId, id);
  if (readErr) return { ok: false, error: readErr, status: 500 };
  if (!client) return { ok: false, error: "Danışan bulunamadı veya bu tenant'a ait değil.", status: 404 };

  const { plan, error: planErr } = await planHdClientDelete(db, tenantId, id);
  if (!plan) return { ok: false, error: planErr, status: 500 };
  const changed = (): DeleteHdClientResult => ({
    ok: false, status: 409, code: "DELETE_SCOPE_CHANGED",
    error: "Bu profile bağlı kayıtlar onaydan sonra değişti. Hiçbir şey silinmedi; lütfen silmeyi yeniden onaylayın.",
  });
  if (opts.expect && (plan.chartIds.length > opts.expect.analyses || plan.reportIds.length > opts.expect.reports)) {
    return changed();
  }
  const partial = (what: string): DeleteHdClientResult => ({
    ok: false, status: 500, code: "DELETE_INCOMPLETE",
    error: `${what} Profil silinmedi; "Sil" ile tekrar deneyebilirsiniz (kalan kayıtlar tamamlanır).`,
  });

  if (plan.reportIds.length > 0) {
    const { error } = await withTenant(db.from("human_design_reports").delete(), tenantId, "deleteHdClient.reports")
      .in("id", plan.reportIds);
    if (error) {
      console.error("[hd-client-delete] raporlar silinemedi:", hdSafeDbError("deleteHdClient.reports", error));
      return partial("Word raporları silinemedi; hiçbir kayıt silinmedi.");
    }
  }

  if (plan.chartIds.length > 0) {
    const del = () => withTenant(db.from("human_design_charts").delete(), tenantId, "deleteHdClient.charts")
      .eq("client_id", id).in("id", plan.chartIds);
    let chartErr = (await del()).error;
    if (chartErr) chartErr = (await del()).error;
    if (chartErr) {
      console.error(`[hd-client-delete] ${plan.chartIds.length} analiz silinemedi:`, hdSafeDbError("deleteHdClient.charts", chartErr));
      return partial("Word raporları silindi ancak analizler silinemedi.");
    }
  }

  // Arada (plan sonrası) profile yeni analiz eklendiyse profil SİLİNMEZ (yetim analiz kalmasın).
  const { count: leftCharts, error: leftErr } = await withTenant(
    db.from("human_design_charts").select("id", { count: "exact", head: true }), tenantId, "deleteHdClient.charts.left",
  ).eq("client_id", id);
  if (leftErr) return partial("Analizlerin silindiği doğrulanamadı.");
  if ((leftCharts ?? 0) > 0) return changed();

  const { data: delRows, error: delErr } = await withTenant(db.from(TABLE).delete(), tenantId, "deleteHdClient")
    .eq("id", id)
    .select("id");
  if (delErr || !delRows || delRows.length === 0) {
    if (delErr) console.error("[hd-client-delete] profil silinemedi:", hdSafeDbError("deleteHdClient", delErr));
    return delErr ? partial("Analizler ve raporlar silindi ancak profil silinemedi.") : { ok: false, error: "Danışan bulunamadı.", status: 404 };
  }

  const warnings: string[] = [];
  if (plan.keptForeignReports > 0) warnings.push("foreign_reports_kept");
  // Görsel klasörü — başka (silinmemiş) bir raporun hâlâ kullandığı nesne silinmez.
  const prefix = `${tenantId}/${id}/`;
  let removable: string[] = plan.reportImagePaths.filter((p) => !p.startsWith(prefix));
  const listed = await listClientImageObjects(db, tenantId, id);
  if (listed.error) {
    console.error(`[hd-storage-cleanup-failed] client-delete list: ${listed.error}`);
    warnings.push("storage_cleanup_failed");
  } else if (listed.paths.length > 0) {
    const refs = await reportReferencedImagePaths(db, tenantId, prefix);
    if (refs.error) {
      // Referans bilinmiyorsa güvenli taraf: profil klasörünü SİLME (başka rapor görseli kaybolmasın).
      console.error(`[hd-storage-cleanup-failed] client-delete refs: ${refs.error}`);
      warnings.push("storage_cleanup_failed");
    } else {
      removable = removable.concat(listed.paths.filter((p) => !refs.paths.has(p)));
    }
  }
  if (removable.length > 0) {
    const rm = await removeHdStorageObjects(db, removable, "client-delete");
    if (!rm.ok && !warnings.includes("storage_cleanup_failed")) warnings.push("storage_cleanup_failed");
  }

  return { ok: true, error: null, deletedAnalyses: plan.chartIds.length, deletedReports: plan.reportIds.length, warnings };
}
