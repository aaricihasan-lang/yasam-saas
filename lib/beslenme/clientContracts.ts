/**
 * Beslenme FAZ 7 — Danışan (Class C) entegrasyonu SAF sözleşmeleri (server+client).
 * IO/DB YOK. Enum'lar + mass-assignment allowlist'leri + explicit SELECT kolonları
 * + RPC hata eşlemesi + BMI display hesabı. Klinik/tanısal alan YOK (§8).
 */

// ── Profil enum'ları (DB code canonical; UI TR label) ──
export const GOAL_TYPES = [
  "weight_loss", "weight_gain", "maintenance", "muscle_gain", "healthy_lifestyle", "other",
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];
export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  weight_loss: "Kilo Verme",
  weight_gain: "Kilo Alma",
  maintenance: "Koruma / Denge",
  muscle_gain: "Kas Kazanımı",
  healthy_lifestyle: "Sağlıklı Yaşam",
  other: "Diğer",
};

export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Hareketsiz",
  light: "Az Hareketli",
  moderate: "Orta Hareketli",
  active: "Hareketli",
  very_active: "Çok Hareketli",
};

export const PREFERENCE_STANCES = ["preferred", "avoided"] as const;
export type PreferenceStance = (typeof PREFERENCE_STANCES)[number];
export const PREFERENCE_STANCE_LABELS: Record<PreferenceStance, string> = {
  preferred: "Tercih Edilen",
  avoided: "Kaçınılan",
};

// ── Mizaç (clients.mizac canonical kodları) TR label — REUSE, yeniden saklanmaz ──
export const MIZAC_LABELS: Record<string, string> = {
  dem: "Dem (Sıcak-Yaş)",
  safra: "Safra (Sıcak-Kuru)",
  sovdavi: "Sevda (Soğuk-Kuru)",
  balgam: "Balgam (Soğuk-Yaş)",
};

// ── Explicit SELECT kolonları (select * YOK; migration şemasıyla birebir) ──
export const PROFILE_COLUMNS =
  "id, tenant_id, client_id, goal_type, goal_note, activity_level, dietary_pattern, " +
  "daily_meal_count, target_weight_kg, water_note, lifestyle_note, general_note, created_at, updated_at";
export const MEASUREMENT_COLUMNS =
  "id, tenant_id, client_id, measured_at, weight_kg, height_cm, waist_cm, hip_cm, note, created_at";
export const ALLERGEN_COLUMNS = "id, tenant_id, client_id, allergen_id, note, created_at";
export const PREFERENCE_COLUMNS = "id, tenant_id, client_id, stance, food_id, food_label, note, created_at";

// ── Mutation allowlist'leri (tenant_id/id/client_id ASLA body'den) ──
export const PROFILE_PUT_KEYS = [
  "goal_type", "goal_note", "activity_level", "dietary_pattern",
  "daily_meal_count", "target_weight_kg", "water_note", "lifestyle_note", "general_note",
] as const;
export const MEASUREMENT_POST_KEYS = ["measured_at", "weight_kg", "height_cm", "waist_cm", "hip_cm", "note"] as const;
export const PREFERENCE_POST_KEYS = ["stance", "food_id", "food_label", "note"] as const;

/** BMI = weight(kg) / (height(m))^2. Display-only (DB'de saklanmaz). Geçersiz → null. */
export function computeBmi(weightKg: unknown, heightCm: unknown): number | null {
  const w = typeof weightKg === "number" ? weightKg : Number(weightKg);
  const h = typeof heightCm === "number" ? heightCm : Number(heightCm);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const m = h / 100;
  const bmi = w / (m * m);
  if (!Number.isFinite(bmi)) return null;
  return Math.round(bmi * 10) / 10;
}

/** assign-client RPC SQLSTATE → HTTP eşlemesi (§11). */
export function mapAssignError(pgCode: string | undefined): { code: string; status: number } {
  switch (pgCode) {
    case "45014": return { code: "PLAN_NOT_FOUND", status: 404 };
    case "45020": return { code: "CLIENT_NOT_FOUND", status: 404 };
    case "45021": return { code: "PLAN_CLIENT_IMMUTABLE", status: 409 };
    case "45022": return { code: "PLAN_FAMILY_ARCHIVED", status: 409 };
    default: return { code: "ASSIGN_FAILED", status: 500 };
  }
}
