/**
 * Danışan silme ÖNİZLEMESİ — hangi kayıtların (FK ON DELETE CASCADE ile) birlikte
 * silineceğini sayar. Saf orkestrasyon: `db` enjekte edilir (route + harness).
 *
 * Kaynak: .hardening/prod-tables.md "clients'a bağlı CASCADE" listesi (2026-09-27)
 * + client_stone_photos (client_stones üzerinden cascade) + Yaşam Hafızası rapor
 * snapshot'ları (migration 20270129000500 ile composite FK CASCADE).
 *
 * Numeroloji / Refleksoloji / Biyoenerji kayıtları danışana FK ile BAĞLI DEĞİLDİR → silinmez;
 * onay ekranında ayrıca belirtilir.
 *
 * HUMAN DESIGN (AŞAMA 3C, migration 20271010000100): danışana BAĞLANMIŞ HD profili bileşik FK
 * (ON DELETE CASCADE) ile silinir; profilin BEFORE DELETE trigger'ı o profile ait haritaları
 * (provider_raw dahil) ve raporları aynı transaction'da siler. Bağlanmamış HD kayıtları etkilenmez.
 * Sayım: hdProfiles / hdCharts / hdReports.
 *
 * BESLENME PLANLARI: nutrition_plan_clients bağı clients FK ile cascade silinir ve AFTER DELETE
 * trigger'ı (nutrition_plan_clients_cascade_plans, migration 20270102000400 — "client silinince
 * bound plan ANONİM kalmaz") o plan ailesinin TÜM revizyonlarını (gün/öğün/kalemleriyle) siler.
 * Bu yüzden yalnız "bağlantı" değil: plan AİLESİ sayısı (nutritionPlans) + toplam REVİZYON sayısı
 * (nutritionPlanRevisions; danışana bağlı ailelerin nutrition_plans satırları) gösterilir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseClientNotes } from "@/lib/clientNotes";
import { countHdForJourneyClient } from "@/lib/human-design/api/journeyLink";

/**
 * Sayılan tablolar (anahtar = i18n `clients.detail.deletePreview.table.<key>`).
 * `via: "planFamily"` → satır client_id ile değil, danışana bağlı plan AİLELERİ
 * (nutrition_plan_clients.plan_family_id) üzerinden sayılır (tenant-scoped).
 */
export const DELETE_PREVIEW_TABLES: ReadonlyArray<{ key: string; table: string; via?: "planFamily" | "hdJourney" }> = [
  { key: "appointments", table: "appointments" },
  { key: "sessions", table: "client_sessions" },
  { key: "homeworks", table: "client_homeworks" },
  { key: "charges", table: "client_charges" },
  { key: "stones", table: "client_stones" },
  { key: "stonePhotos", table: "client_stone_photos" },
  { key: "analyses", table: "client_analyses" },
  { key: "combinations", table: "client_combinations" },
  { key: "chakraRecords", table: "client_chakra_records" },
  { key: "planetRecords", table: "client_planet_records" },
  { key: "cuppingAdvice", table: "cupping_client_advice" },
  { key: "nutritionProfile", table: "nutrition_client_profiles" },
  { key: "nutritionAllergens", table: "nutrition_client_allergens" },
  { key: "nutritionPreferences", table: "nutrition_client_food_preferences" },
  { key: "nutritionMeasurements", table: "nutrition_client_measurements" },
  { key: "nutritionPlans", table: "nutrition_plan_clients" },
  { key: "nutritionPlanRevisions", table: "nutrition_plans", via: "planFamily" },
  { key: "memorySnapshots", table: "yasam_hafizasi_report_snapshots" },
  { key: "memoryIndex", table: "yasam_hafizasi_client_index" },
  { key: "legacyGifts", table: "client_gifts" },
  { key: "legacyPhotos", table: "client_photos" },
  { key: "legacyTasks", table: "client_tasks" },
  // Anamnez V1 (migration 20270202000000; composite FK CASCADE). Belgeler Storage'dan da silinir.
  { key: "anamneses", table: "client_anamneses" },
  { key: "anamnesisFiles", table: "client_anamnesis_attachments" },
  // Human Design (AŞAMA 3C): danışana BAĞLI HD profili + o profile ait analizler/raporlar
  // (bileşik FK CASCADE + BEFORE DELETE trigger). Sayım bağlı profil üzerinden (tenant-scoped).
  { key: "hdProfiles", table: "human_design_clients", via: "hdJourney" },
  { key: "hdCharts", table: "human_design_charts", via: "hdJourney" },
  { key: "hdReports", table: "human_design_reports", via: "hdJourney" },
];

/** Danışana bağlı OLMAYAN (silinmeyen) modüller. */
export const UNLINKED_MODULES = ["Numeroloji", "Refleksoloji", "Biyoenerji"] as const;

export type DeletePreviewNotes = {
  noteCount: number;
  saglikNotu: boolean;
  adres: boolean;
  oneriler: boolean;
};

export type DeletePreview = {
  counts: Array<{ key: string; count: number | null }>;
  notes: DeletePreviewNotes;
  unlinkedModules: string[];
  /** Bazı sayımlar alınamadıysa true (UI "en az" ifadesi + tam liste yedeği). */
  partial: boolean;
};

function filled(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export async function collectDeletePreview(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<DeletePreview> {
  let partial = false;

  const hdCounts = countHdForJourneyClient(db, tenantId, clientId).catch(() => null);
  const counts = await Promise.all(
    DELETE_PREVIEW_TABLES.map(async ({ key, table, via }) => {
      try {
        if (via === "hdJourney") {
          const hd = await hdCounts;
          if (hd === null) {
            partial = true;
            return { key, count: null };
          }
          return { key, count: key === "hdProfiles" ? hd.profiles : key === "hdCharts" ? hd.charts : hd.reports };
        }
        if (via === "planFamily") {
          const n = await countPlanRevisionsForClient(db, tenantId, clientId);
          if (n === null) partial = true;
          return { key, count: n };
        }
        const { count, error } = await db
          .from(table)
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("client_id", clientId);
        if (error) {
          partial = true;
          return { key, count: null };
        }
        return { key, count: typeof count === "number" ? count : 0 };
      } catch {
        partial = true;
        return { key, count: null };
      }
    }),
  );

  const notes: DeletePreviewNotes = { noteCount: 0, saglikNotu: false, adres: false, oneriler: false };
  try {
    const { data, error } = await db
      .from("client_notes")
      .select("notlar, saglik_notu, adres, oneriler")
      .eq("tenant_id", tenantId)
      .eq("client_id", clientId);
    if (error) partial = true;
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      notes.noteCount += parseClientNotes((row.notlar as string | null) ?? null).length;
      notes.saglikNotu ||= filled(row.saglik_notu);
      notes.adres ||= filled(row.adres);
      notes.oneriler ||= filled(row.oneriler);
    }
  } catch {
    partial = true;
  }

  return { counts, notes, unlinkedModules: [...UNLINKED_MODULES], partial };
}

/**
 * Danışana bağlı plan ailelerinin TOPLAM revizyon sayısı (danışan silinince hepsi silinir).
 * Tenant-scoped: aile listesi ve revizyonlar yalnız bu tenant'tan okunur. Hata → null (partial).
 */
async function countPlanRevisionsForClient(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<number | null> {
  const { data, error } = await db
    .from("nutrition_plan_clients")
    .select("plan_family_id")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);
  if (error) return null;
  const families = [...new Set(((data ?? []) as Array<{ plan_family_id: string }>).map((r) => r.plan_family_id))];
  if (families.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < families.length; i += 200) {
    const { count, error: cErr } = await db
      .from("nutrition_plans")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("plan_family_id", families.slice(i, i + 200));
    if (cErr || typeof count !== "number") return null;
    total += count;
  }
  return total;
}

/** Yalnız sıfırdan büyük kalemler — onay mesajı için (sayılamayanlar `partial` ile bildirilir). */
export function nonZeroPreviewItems(preview: DeletePreview): Array<{ key: string; count: number }> {
  return preview.counts.filter((c): c is { key: string; count: number } => typeof c.count === "number" && c.count > 0);
}
