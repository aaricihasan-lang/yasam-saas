// Gökyüzü Araçları sayfasındaki Atlas menüsü (Yeni Analiz · Analiz Arşivi · Bilgi Bankası) açık bir hedeftir: tıklanınca bu
// anahtara hedef görünümün hash'i yazılır, Atlas sayfası ilk açılışta yalnız AYNI hash için görünümü geri yükler (bir kez okunur
// ve silinir). Dışarıdan diğer girişlerde (dashboard, eski adres) ana ekran açılma kuralı (UAT 2026-10-12 madde G) değişmez.
export const ATLAS_NAV_TARGET_KEY = "atlas.navTarget";

export function consumeAtlasNavTarget(hash: string): boolean {
  try {
    const want = sessionStorage.getItem(ATLAS_NAV_TARGET_KEY);
    if (want === null) return false;
    sessionStorage.removeItem(ATLAS_NAV_TARGET_KEY);
    return want !== "" && `#${want}` === hash;
  } catch {
    return false;
  }
}
