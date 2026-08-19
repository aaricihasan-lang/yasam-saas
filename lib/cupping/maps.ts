/**
 * KUPA & HACAMAT — VÜCUT HARİTASI REGİSTRY'si (config, DB DEĞİL).
 *
 * Harita listesi motora hard-code DAĞITILMAZ; burada merkezî tanımlanır. Yeni bir
 * görünüm eklemek = bu diziye bir satır + bir silhouette component eklemek (motor/DB
 * değişmez). placement.map_key serbest metindir; bu registry görüntüleme/doğrulama
 * içindir. Silhouette çizimleri UI katmanındadır (app/dashboard/kupa/maps).
 *
 * SVG/vektörel sabit anatomik zemin kullanılır — FOTOĞRAF DEĞİL.
 */

export type CuppingMapGroup = "govde" | "bas" | "bacak";

export type CuppingMapDef = {
  key: string;
  label: string;
  group: CuppingMapGroup;
  /** Silhouette viewBox oranı (contain-rect hesabı için). */
  contentWidth: number;
  contentHeight: number;
  sortOrder: number;
};

export const CUPPING_MAP_GROUP_LABELS: Record<CuppingMapGroup, string> = {
  govde: "Gövde",
  bas: "Baş",
  bacak: "Bacak",
};

/** V1 başlangıç haritaları. Genişletilebilir — motor değişmez. */
export const CUPPING_BODY_MAPS: CuppingMapDef[] = [
  { key: "back_body", label: "Arka Vücut (Sırt)", group: "govde", contentWidth: 480, contentHeight: 820, sortOrder: 10 },
  { key: "front_body", label: "Ön Gövde (Göğüs-Karın)", group: "govde", contentWidth: 480, contentHeight: 820, sortOrder: 20 },
  { key: "head_front", label: "Baş — Ön", group: "bas", contentWidth: 480, contentHeight: 520, sortOrder: 30 },
  { key: "head_back", label: "Baş — Arka", group: "bas", contentWidth: 480, contentHeight: 520, sortOrder: 40 },
  { key: "head_left", label: "Baş — Sol Yan", group: "bas", contentWidth: 480, contentHeight: 520, sortOrder: 50 },
  { key: "head_right", label: "Baş — Sağ Yan", group: "bas", contentWidth: 480, contentHeight: 520, sortOrder: 60 },
  { key: "head_top", label: "Baş — Üst (Tepe)", group: "bas", contentWidth: 480, contentHeight: 520, sortOrder: 70 },
  { key: "legs_front", label: "Bacak — Ön", group: "bacak", contentWidth: 480, contentHeight: 760, sortOrder: 80 },
  { key: "legs_back", label: "Bacak — Arka", group: "bacak", contentWidth: 480, contentHeight: 760, sortOrder: 90 },
];

const MAP_BY_KEY = new Map(CUPPING_BODY_MAPS.map((m) => [m.key, m]));

export function getCuppingMap(key: string): CuppingMapDef | undefined {
  return MAP_BY_KEY.get(key);
}

export function isKnownCuppingMap(key: unknown): key is string {
  return typeof key === "string" && MAP_BY_KEY.has(key);
}

export const DEFAULT_CUPPING_MAP_KEY = "back_body";
