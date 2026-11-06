/**
 * KİŞİSEL DİJİTAL OFİS (P4) — masaüstü tasarımını mobile uyarlama (saf; Owner kararı 2026-11-02).
 *
 * Ortak değerler (düzen, metinler, renkler/palet, arka plan modu, tema, fotoğraf, kullanım alanı, katman) tek tasarımda
 * zaten ortaktır. Cihaza özel olanlar yalnız:
 *   - logo.layout.desktop / logo.layout.mobile (bölge, konum, boyut)
 *   - bg.focus / bg.mobileFocus (+ bg.separateMobile)
 * "Evet, mobilde de uygula" → masaüstü değerleri mobile UYARLANIR; koordinatlar körü körüne kopyalanmaz:
 *   - Bölge mobilin güvenli karşılığına çevrilir: mobilde karşılama bandı, modül başlığı yanı ve sağ sütun üstü dar ve
 *     metinle dolu olduğundan logo P0'ın mobil varsayılanı olan ÜST ŞERİDE alınır; sayfa altı imza şeridi korunur;
 *     C fotoğraf çerçevesi yalnız C + fotoğrafta korunur.
 *   - Boyut bölge genişliğine oranlı saklandığı için mobil bölge darlığına göre büyütülür ve güvenli aralığa sıkıştırılır;
 *     son sığdırma (metinden kaçma, en küçük 36 px, bölge dışına taşmama) çizimde lib/workspace/logoPlacement ile yapılır.
 *   - Fotoğraf odağı mobilde masaüstüyle aynı noktayı izler (separateMobile=false); kırpım mobil oranına göre yeniden hesaplanır.
 * Serbest Yerleştir (KDO-05, 2026-11-02):
 *   - Sayfa çerçevesi ("page"): yatay oran AYNEN, üstten uzaklık karşılama bölgesindeyse (≤ FREE_ADAPT_TOP px) aynen;
 *     daha aşağıdaysa (masaüstünde sağ sütun / modüller arası) mobilde içerik tek sütuna dizildiği için o nokta kartların
 *     üstüne düşer → mobil varsayılan (üst araç satırı hizası). Boyut mobil darlığına göre büyütülür ve sıkıştırılır.
 *   - Sol menü çerçevesi ("side"): mobilde sol menü çekmecedir (ana ekranda görünmez) → mobil varsayılan.
 *   - Son sığdırma (engelden kaçma, en küçük 36 px, çerçeve dışına çıkmama) çizimde solveFreeLogo ile yapılır.
 * Yeni görsel yüklenmez; şema değişmez (P1 şeması geriye uyumlu, migration yok).
 */
import { DEFAULT_LOGO_DESKTOP, DEFAULT_LOGO_MOBILE, type LogoPlacement, type WorkspaceDesign } from "./schema";

/** Mobil bölge, masaüstündeki karşılığına göre kabaca bu kadar dar: oransal genişlik bununla büyütülür. */
const ZONE_WIDTH_RATIO: Record<LogoPlacement["zone"], number> = { hero: 2.2, cerceve: 1.6, toolbar: 2.4, sec: 1.6, rightTop: 1.1, footer: 2, page: 2.6, side: 1 };
/** Masaüstünde bu kadar üstte (px) bırakılan logo mobilde de aynı yükseklikte kalır (karşılama / araç satırı bölgesi). */
export const FREE_ADAPT_TOP = 420;
export const MOBILE_W_MIN = 0.18;
export const MOBILE_W_MAX = 0.6;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const samePlace = (a: LogoPlacement, b: LogoPlacement) => a.zone === b.zone && a.x === b.x && a.y === b.y && a.w === b.w;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Bu tasarım için mobilde kullanılabilen bölge. */
export function mobileZone(zone: LogoPlacement["zone"], d: Pick<WorkspaceDesign, "layout" | "bg">): LogoPlacement["zone"] {
  if (zone === "page" || zone === "side") return "page";
  if (zone === "footer") return "footer";
  if (zone === "cerceve" && d.layout === "C" && d.bg.mode === "photo") return "cerceve";
  return "toolbar";
}

/** Mobil üst şerit: P0 mobil varsayılanı (ortalı, şerit genişliğine göre çözücü küçültür). */
const MOBILE_TOOLBAR: LogoPlacement = { zone: "toolbar", x: 0.5, y: 0.5, w: 1 };

export function adaptPlacementToMobile(p: LogoPlacement, d: Pick<WorkspaceDesign, "layout" | "bg">): LogoPlacement {
  // Önerilen masaüstü konumu ↔ önerilen mobil konum (yeni logoda gereksiz "mobilde de uygula?" sorusu çıkmaz).
  if (samePlace(p, DEFAULT_LOGO_DESKTOP)) return { ...DEFAULT_LOGO_MOBILE };
  if (p.zone === "side" || (p.zone === "page" && !(p.y <= FREE_ADAPT_TOP))) return { ...DEFAULT_LOGO_MOBILE };
  if (p.zone === "page") {
    const w = Math.min(MOBILE_W_MAX, Math.max(MOBILE_W_MIN, p.w * ZONE_WIDTH_RATIO.page));
    return { zone: "page", x: round3(clamp01(p.x)), y: Math.max(0, Math.round(p.y)), w: round3(w) };
  }
  const zone = mobileZone(p.zone, d);
  if (zone === "toolbar") return { ...MOBILE_TOOLBAR };
  const w = Math.min(MOBILE_W_MAX, Math.max(MOBILE_W_MIN, p.w * ZONE_WIDTH_RATIO[p.zone]));
  return { zone, x: round3(clamp01(p.x)), y: round3(clamp01(p.y)), w: round3(w) };
}

/** Masaüstü ile mobil cihaza özel değerler farklı mı? (Uygula sırasında soru sorulup sorulmayacağı.) */
export function deviceSettingsDiffer(d: WorkspaceDesign): boolean {
  const logoMatters = d.logo.assetId !== null && d.logo.visible;
  const logoDiff = logoMatters && JSON.stringify(adaptPlacementToMobile(d.logo.layout.desktop, d)) !== JSON.stringify(d.logo.layout.mobile);
  const focusDiff = d.bg.mode === "photo" && d.bg.photoAssetId !== null && d.bg.separateMobile
    && (d.bg.focus.x !== d.bg.mobileFocus.x || d.bg.focus.y !== d.bg.mobileFocus.y);
  return logoDiff || focusDiff;
}

/** "Evet, mobilde de uygula": yeni nesne döner (girdi değişmez). */
export function applyDesktopToMobile(d: WorkspaceDesign): WorkspaceDesign {
  const next: WorkspaceDesign = JSON.parse(JSON.stringify(d));
  next.logo.layout.mobile = adaptPlacementToMobile(d.logo.layout.desktop, d);
  next.bg.separateMobile = false;
  next.bg.mobileFocus = { ...d.bg.focus };
  return next;
}

/** Arayüzde gösterilecek ayrım (ortak / cihaza özel). */
export const SHARED_SETTINGS = ["Ofis düzeni (A/B/C)", "Karşılama metinleri", "Marka renkleri ve palet", "Arka plan: tema veya fotoğraf", "Fotoğrafın kullanım alanı ve kaydırma", "Fotoğraf çerçevesi: Sığdır / Doldur ve boyut", "Katman ve yumuşatma", "Logo görseli ve zemini"] as const;
export const DEVICE_SETTINGS = ["Logonun serbest konumu ve boyutu", "Fotoğrafın odak noktası"] as const;
