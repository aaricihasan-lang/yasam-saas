/**
 * Beslenme — kullanıcı yedeği (Ayarlar → Yedekle / Geri Yükle) kapsamındaki tablolar.
 * SAF sabit + yardımcılar (IO yok); /api/settings/backup ve /restore route'ları kullanır,
 * harness (scripts/beslenme-editability/backupHarness.mjs) migration şemasıyla eşleşmeyi ve
 * PGlite üzerinde yedek→geri yükleme gidiş-dönüşünü doğrular.
 *
 * SIRA = FK bağımlılık sırası (ebeveyn → çocuk). Geri yükleme bu sırayla yapılır; aksi halde
 * çocuk satır ebeveyninden önce gelip FK hatasıyla atlanır.
 *
 * KAPSAM: yalnız uzmanın kendi tenant verisi (tenant_id = oturum tenant'ı). SİSTEM kataloğu
 * (sentinel tenant) yedeğe GİRMEZ — herkes için ortak referanstır; uzmanın kişisel kopyaları
 * (origin_food_id) ve çalışma alanından kaldırdığı besinler (tenant_hidden) ise GİRER.
 * HARİÇ: nutrition_destructive_challenges (5 dk'lık güvenlik kaydı; iş verisi değil).
 */
export const NUTRITION_BACKUP_TABLES = [
  // Kaynak kataloğu (besin/rehber/değer bağlarının ebeveyni)
  "nutrition_sources",
  // Besinler + alt kayıtlar
  "nutrition_foods",
  "nutrition_food_nutrients",
  "nutrition_food_portions",
  "nutrition_food_external_refs",
  "nutrition_food_traditional",
  "nutrition_food_sources",
  "nutrition_food_tenant_hidden",
  // Rehber / Mizaç / Kan Grubu
  "nutrition_topics",
  "nutrition_topic_sections",
  "nutrition_topic_foods",
  "nutrition_topic_sources",
  // Planlar
  "nutrition_plans",
  "nutrition_plan_days",
  "nutrition_plan_meals",
  "nutrition_plan_items",
  "nutrition_plan_item_nutrients",
  // Şablonlar
  "nutrition_templates",
  "nutrition_template_meals",
  "nutrition_template_items",
  "nutrition_template_item_nutrients",
  // Danışan beslenme verisi (clients tablosundan SONRA geri yüklenir)
  "nutrition_client_profiles",
  "nutrition_client_measurements",
  "nutrition_client_allergens",
  "nutrition_client_food_preferences",
  "nutrition_plan_clients",
] as const;

export type NutritionBackupTable = (typeof NUTRITION_BACKUP_TABLES)[number];

/** Yedek dışı nutrition tabloları (gerekçeli) — harness kapsam kontrolü için. */
export const NUTRITION_BACKUP_EXCLUDED: Record<string, string> = {
  nutrition_destructive_challenges: "5 dakikalık tek kullanımlık güvenlik kaydı; iş verisi değil",
};

/** Sayfalı okuma için kararlı sıralama kolonu (id'siz tablo: bileşik PK'nın parçası). */
export function nutritionBackupOrderColumn(table: string): string {
  return table === "nutrition_food_tenant_hidden" ? "food_id" : "id";
}

/**
 * Geri yükleme sırası: verilen tablo adlarını kanonik listedeki sıraya dizer (kararlı; kanonik
 * listede olmayan ad en sona, kendi göreli sırasıyla). Kanonik liste = geri yükleme whitelist'i
 * (Danışan Yolculuğu → … → Beslenme) → clients, nutrition_client_* tablolarından ÖNCE gelir.
 */
export function orderTablesForRestore(names: readonly string[], canonical: readonly string[]): string[] {
  const idx = (t: string) => {
    const i = canonical.indexOf(t);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...names].map((n, i) => ({ n, i })).sort((a, b) => idx(a.n) - idx(b.n) || a.i - b.i).map((x) => x.n);
}
