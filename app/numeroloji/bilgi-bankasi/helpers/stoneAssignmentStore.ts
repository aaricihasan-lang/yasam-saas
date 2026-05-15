/** Masaüstü stone_assignment_store.py yapısına uygun yerel depolama (localStorage). */

export type StoneAssignmentEntry = {
  reason: string;
  stones: string[];
  updated_at: string;
};

/** { [category]: { [value]: StoneAssignmentEntry } } */
export type StoneAssignmentStore = Record<string, Record<string, StoneAssignmentEntry>>;

const STORAGE_KEY = "yasam-numeroloji-stone-assignments";

function loadStore(): StoneAssignmentStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as StoneAssignmentStore;
  } catch {
    return {};
  }
}

function persistStore(store: StoneAssignmentStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export type SaveStoneAssignmentInput = {
  category: string;
  value: string;
  reason: string;
  stones: string[];
};

export function saveStoneAssignment(input: SaveStoneAssignmentInput): StoneAssignmentEntry {
  const { category, value, reason, stones } = input;
  const store = loadStore();
  if (!store[category]) store[category] = {};
  const entry: StoneAssignmentEntry = {
    reason: reason.trim(),
    stones,
    updated_at: new Date().toISOString(),
  };
  store[category][value] = entry;
  persistStore(store);
  return entry;
}

export function getStoneAssignment(category: string, value: string): StoneAssignmentEntry | null {
  if (!category || !value) return null;
  return loadStore()[category]?.[value] ?? null;
}

/** Virgül, nokta, noktalı virgül ve satır sonuna göre parçalar; Türkçe baş harf büyütür. */
export function normalizeStoneList(input: string): string[] {
  if (!input.trim()) return [];
  return input
    .split(/[,;.\n\r]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((stone) => {
      const first = stone.charAt(0).toLocaleUpperCase("tr-TR");
      return `${first}${stone.slice(1)}`;
    });
}

export function stonesToTextarea(stones: string[]): string {
  return stones.join("\n");
}

export type StoneAssignmentRow = {
  category: string;
  value: string;
  entry: StoneAssignmentEntry;
};

/** Tüm doğaltaş atama kayıtlarını düz liste olarak döner (güncelleme tarihine göre yeni önce). */
export function listStoneAssignmentRows(): StoneAssignmentRow[] {
  const store = loadStore();
  const rows: StoneAssignmentRow[] = [];
  for (const [category, values] of Object.entries(store)) {
    for (const [value, entry] of Object.entries(values)) {
      rows.push({ category, value, entry });
    }
  }
  return rows.sort((a, b) => b.entry.updated_at.localeCompare(a.entry.updated_at));
}
