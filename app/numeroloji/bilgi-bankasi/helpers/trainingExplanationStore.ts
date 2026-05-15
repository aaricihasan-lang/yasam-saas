/** Masaüstü eğitim/açıklama kayıtları — Kayıt Ekle/Düzenle ile doldurulacak (localStorage). */

export type TrainingExplanationEntry = {
  source: string;
  description: string;
  updated_at: string;
};

export type TrainingExplanationStore = Record<string, Record<string, TrainingExplanationEntry>>;

const STORAGE_KEY = "yasam-numeroloji-training-explanations";

function loadStore(): TrainingExplanationStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as TrainingExplanationStore;
  } catch {
    return {};
  }
}

export type TrainingExplanationRow = {
  category: string;
  value: string;
  entry: TrainingExplanationEntry;
};

/** Tüm açıklama kayıtlarını düz liste olarak döner (güncelleme tarihine göre yeni önce). */
export function listTrainingExplanationRows(): TrainingExplanationRow[] {
  const store = loadStore();
  const rows: TrainingExplanationRow[] = [];
  for (const [category, values] of Object.entries(store)) {
    for (const [value, entry] of Object.entries(values)) {
      rows.push({ category, value, entry });
    }
  }
  return rows.sort((a, b) => b.entry.updated_at.localeCompare(a.entry.updated_at));
}
