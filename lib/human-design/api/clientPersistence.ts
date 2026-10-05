// Sprint-3 — human_design_clients güvenli kalıcılığı (server-only, service_role).
//
// Tüm işlemler:
//   • tenant_id + user_id YALNIZ guard'dan gelir (route katmanı verir); body'den GÜVENİLMEZ.
//   • Yazma alanları allow-list ile süzülür (tenant_id/user_id/id/zaman override edilemez).
//   • DELETE (P1-3): raporlar KORUNUR (client bağı koparılır), danışan + haritaları silinir,
//     görsel klasörü temizlenir; ara adım hatasında telafi (raporlar geri bağlanır).
// HD engine/compute/BodyGraph matematiğine DOKUNMAZ — yalnız human_design_clients CRUD.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HumanDesignClient,
  HumanDesignClientInsert,
} from "@/lib/human-design/types";
import { hdSafeDbError } from "./safeError";
import { withTenant, tenantInsertPayload } from "./tenantScope";
import { HD_CONFLICT_CODE, HD_CONFLICT_MESSAGE } from "./optimistic";
import { detachReportsFromClient, reattachReportsToClient } from "./reportPersistence";
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
  /** Korunan (danışan bağı koparılan) rapor sayısı. */
  preservedReports?: number;
  /** Silme tamam; ancak bazı yan temizlikler başarısız (loglandı). */
  warnings?: string[];
};

/**
 * P1-3 — Danışan silme: RAPORLAR KORUNUR, telafi edici sıralı işlem.
 *
 * Eski davranış raporları (profesyonel donmuş raporlar dahil) uyarısız ve atomik olmayan
 * 3 ayrı DELETE ile siliyordu. Yeni sıra (her adım tenant-scoped):
 *   1) Danışan var mı (tenant) → yoksa 404.
 *   2) Danışanın harita id'leri okunur.
 *   3) Raporların danışan bağı koparılır (client_id = NULL) — veri silinmez.
 *   4) Danışan silinir. Hata → 3. adım GERİ ALINIR (raporlar yeniden bağlanır) → hiçbir şey
 *      silinmemiş, tutarlı durum.
 *   5) Haritalar silinir (yeniden denemeli). Hata → danışan zaten silindi; harita satırları
 *      Kayıtlı Haritalar'da kalır (veri kaybı yok), uyarı döner + loglanır.
 *   6) Görsel klasörü temizlenir; hâlâ bir rapor snapshot'ının kullandığı nesne KORUNUR.
 *      Storage hatası DB'yi geri almaz → yeniden deneme + `[hd-storage-cleanup-failed]` log.
 * Raporlar silinmediği için hiçbir adımda geri alınamaz veri kaybı oluşmaz.
 */
export async function deleteHdClient(
  db: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<DeleteHdClientResult> {
  const { row: client, error: readErr } = await getHdClient(db, tenantId, id);
  if (readErr) return { ok: false, error: readErr, status: 500 };
  if (!client) return { ok: false, error: "Danışan bulunamadı veya bu tenant'a ait değil.", status: 404 };

  const { data: chartRows, error: chartReadErr } = await withTenant(
    db.from("human_design_charts").select("id"), tenantId, "deleteHdClient.charts.read",
  ).eq("client_id", id);
  if (chartReadErr) return { ok: false, error: hdSafeDbError("deleteHdClient.charts.read", chartReadErr), status: 500 };
  const chartIds = ((chartRows ?? []) as { id: string }[]).map((r) => r.id);

  const detached = await detachReportsFromClient(db, tenantId, id);
  if (detached.error) return { ok: false, error: detached.error, status: 500 };

  const { data: delRows, error: delErr } = await withTenant(db.from(TABLE).delete(), tenantId, "deleteHdClient")
    .eq("id", id)
    .select("id");
  if (delErr || !delRows || delRows.length === 0) {
    await reattachReportsToClient(db, tenantId, id, detached.ids);
    return {
      ok: false,
      error: delErr ? hdSafeDbError("deleteHdClient", delErr) : "Danışan silinemedi.",
      status: delErr ? 500 : 404,
    };
  }

  const warnings: string[] = [];
  if (chartIds.length > 0) {
    let chartErr = (await withTenant(db.from("human_design_charts").delete(), tenantId, "deleteHdClient.charts").in("id", chartIds)).error;
    if (chartErr) {
      chartErr = (await withTenant(db.from("human_design_charts").delete(), tenantId, "deleteHdClient.charts.retry").in("id", chartIds)).error;
    }
    if (chartErr) {
      console.error(`[hd-client-delete] ${chartIds.length} harita silinemedi:`, hdSafeDbError("deleteHdClient.charts", chartErr));
      warnings.push("charts_cleanup_failed");
    }
  }

  // Görsel klasörü (P2-10) — rapor snapshot'ının hâlâ kullandığı nesne silinmez.
  const prefix = `${tenantId}/${id}/`;
  const listed = await listClientImageObjects(db, tenantId, id);
  if (listed.error) {
    console.error(`[hd-storage-cleanup-failed] client-delete list: ${listed.error}`);
    warnings.push("storage_cleanup_failed");
  } else if (listed.paths.length > 0) {
    const refs = await reportReferencedImagePaths(db, tenantId, prefix);
    if (refs.error) {
      // Referans bilinmiyorsa güvenli taraf: SİLME (rapor görseli kaybolmasın), logla.
      console.error(`[hd-storage-cleanup-failed] client-delete refs: ${refs.error}`);
      warnings.push("storage_cleanup_failed");
    } else {
      const removable = listed.paths.filter((p) => !refs.paths.has(p));
      const rm = await removeHdStorageObjects(db, removable, "client-delete");
      if (!rm.ok) warnings.push("storage_cleanup_failed");
    }
  }

  return { ok: true, error: null, preservedReports: detached.ids.length, warnings };
}
