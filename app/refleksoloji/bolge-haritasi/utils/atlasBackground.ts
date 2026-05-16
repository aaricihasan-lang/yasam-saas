import type { FootView } from "../types";

export type AtlasBackgroundKey = "taban" | "yan_dis" | "yan_ic";

export const ATLAS_IMAGE_SRC: Record<AtlasBackgroundKey, string> = {
  taban: "/refleksoloji/klinik_taban.png",
  yan_dis: "/refleksoloji/klinik_yan_dis.png",
  yan_ic: "/refleksoloji/klinik_yan_ic.png",
};

/** Masaüstü: Rahim / Prostat / Mesane → yan iç görünüm */
export function isInnerYanOrgan(organ: string): boolean {
  const n = organ.trim().toLocaleLowerCase("tr");
  return n.includes("mesane") || n.includes("rahim") || n.includes("prostat");
}

export function resolveAtlasBackgroundKey(
  footView: FootView,
  selectedOrgan: string | null,
): AtlasBackgroundKey {
  if (footView === "taban") return "taban";
  if (selectedOrgan && isInnerYanOrgan(selectedOrgan)) return "yan_ic";
  return "yan_dis";
}

export function atlasBackgroundLabel(key: AtlasBackgroundKey): string {
  if (key === "taban") return "Taban Görünüm";
  if (key === "yan_ic") return "Yan İç Görünüm";
  return "Yan Dış Görünüm";
}
