import type { FootView } from "../types";

/**
 * Arka plan asset anahtarı = canonical görünüm (FootView). Ekole bağımsız:
 * selectedView DOĞRUDAN asset'i belirler; organ adı ASLA karışmaz.
 */
export type AtlasBackgroundKey = FootView; // "taban" | "yan_ic" | "yan_dis" | "el_avuc" | "el_sirt"

export const ATLAS_IMAGE_SRC: Record<AtlasBackgroundKey, string> = {
  taban: "/refleksoloji/klinik_taban.png",
  yan_ic: "/refleksoloji/klinik_yan_ic.png",
  yan_dis: "/refleksoloji/klinik_yan_dis.png",
  // El görselleri: tek fotoğrafta iki el (görselin SOLU = sol el, SAĞI = sağ el; anatomik).
  el_avuc: "/refleksoloji/el_avuc_sag_sol.png",
  el_sirt: "/refleksoloji/el_sirti_sag_sol.png",
};

/**
 * Görünüm → arka plan anahtarı. Artık BİRE BİR (organ parametresi YOK).
 * Organ-adı çıkarımı runtime'dan kaldırıldı; yan_ic/yan_dis ayrımı yalnız uzmanın
 * seçtiği `selectedView`'dan gelir. (Legacy belge dönüşümü: lib/refleksoloji/atlasNormalize.)
 */
export function resolveAtlasBackgroundKey(view: FootView): AtlasBackgroundKey {
  return view;
}

export function atlasBackgroundLabel(key: AtlasBackgroundKey): string {
  if (key === "taban") return "Taban Görünüm";
  if (key === "yan_ic") return "Yan İç Görünüm";
  if (key === "el_avuc") return "Avuç İçi Görünüm";
  if (key === "el_sirt") return "El Sırtı Görünüm";
  return "Yan Dış Görünüm";
}
