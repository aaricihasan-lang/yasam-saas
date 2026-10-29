"use client";

// Owner liste durumu (arama / filtre / sekme URL'de; kaydırma konumu oturum deposunda). Kişi ve aile sayfasından
// geri dönüşte liste aynı yerden açılır. Depo erişilemezse (gizli pencere vb.) yalnız varsayılan listeye dönülür.
export const OWNER_LIST_PATH = "/admin/hd-egitim-haritalari";
const RETURN_KEY = "yasam.hdEdu.ownerList.return";
const SCROLL_KEY = "yasam.hdEdu.ownerList.scroll";

export function saveListReturn(): void {
  try {
    sessionStorage.setItem(RETURN_KEY, `${window.location.pathname}${window.location.search}`);
    sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY)));
  } catch { /* depo yok → varsayılan */ }
}

export function readListReturn(): string {
  try {
    const v = sessionStorage.getItem(RETURN_KEY);
    if (v && v.startsWith(OWNER_LIST_PATH) && !v.includes("//")) return v;
  } catch { /* depo yok */ }
  return OWNER_LIST_PATH;
}

/** Liste yüklendikten sonra BİR kez çağrılır: kayıtlı kaydırma konumuna döner ve kaydı siler. */
export function restoreListScroll(): void {
  try {
    const y = Number(sessionStorage.getItem(SCROLL_KEY));
    sessionStorage.removeItem(SCROLL_KEY);
    if (Number.isFinite(y) && y > 0) requestAnimationFrame(() => window.scrollTo({ top: y }));
  } catch { /* depo yok */ }
}
