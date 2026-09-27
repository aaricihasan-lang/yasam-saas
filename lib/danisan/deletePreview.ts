/**
 * Danışan silme ÖNİZLEMESİ — hangi kayıtların (FK ON DELETE CASCADE ile) birlikte
 * silineceğini sayar. Saf orkestrasyon: `db` enjekte edilir (route + harness).
 *
 * Kaynak: .hardening/prod-tables.md "clients'a bağlı CASCADE" listesi (2026-09-27)
 * + client_stone_photos (client_stones üzerinden cascade) + Yaşam Hafızası rapor
 * snapshot'ları (migration 20270129000500 ile composite FK CASCADE).
 *
 * Numeroloji / Human Design / Refleksoloji / Biyoenerji kayıtları danışana FK ile
 * BAĞLI DEĞİLDİR → silinmez; onay ekranında ayrıca belirtilir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseClientNotes } from "@/lib/clientNotes";

/** Sayılan tablolar (anahtar = i18n `clients.detail.deletePreview.table.<key>`). */
export const DELETE_PREVIEW_TABLES: ReadonlyArray<{ key: string; table: string }> = [
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
  { key: "memorySnapshots", table: "yasam_hafizasi_report_snapshots" },
  { key: "memoryIndex", table: "yasam_hafizasi_client_index" },
  { key: "legacyGifts", table: "client_gifts" },
  { key: "legacyPhotos", table: "client_photos" },
  { key: "legacyTasks", table: "client_tasks" },
];

/** Danışana bağlı OLMAYAN (silinmeyen) modüller. */
export const UNLINKED_MODULES = ["Numeroloji", "Human Design", "Refleksoloji", "Biyoenerji"] as const;

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

  const counts = await Promise.all(
    DELETE_PREVIEW_TABLES.map(async ({ key, table }) => {
      try {
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

/** Yalnız sıfırdan büyük kalemler — onay mesajı için (sayılamayanlar `partial` ile bildirilir). */
export function nonZeroPreviewItems(preview: DeletePreview): Array<{ key: string; count: number }> {
  return preview.counts.filter((c): c is { key: string; count: number } => typeof c.count === "number" && c.count > 0);
}
