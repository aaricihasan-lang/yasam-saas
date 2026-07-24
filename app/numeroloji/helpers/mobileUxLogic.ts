/**
 * NUM-MOB-1 — Numeroloji mobil UX SAF mantığı (React/DB yok; harness ile test edilir).
 * - Mobil kayıt kimliği (Analiz Türü + Değer birleşik).
 * - Mobil iki-aşamalı silme state machine (gate1 → gate2 → "SİL" doğrulaması).
 * - Mobil/masaüstü dışa-aktarma (Word/PNG) görünürlük kararı.
 * - Tam ekran görsel rapor viewer aç/kapat state'i.
 * Hiçbir yerde delete API/DB sözleşmesi yoktur; yalnız saf davranış.
 */

// ── Mobil kayıt kimliği ───────────────────────────────────────────────────────

/**
 * Mobil kayıt kartı kimliği: "Ana Kulvar — 3", "Yan Kulvar — 5".
 * Değer yoksa yalnız analiz türü; tür yoksa değer; ikisi de yoksa güvenli fallback.
 */
export function mobileKayitKimligi(input: {
  analizTuru?: string | null;
  deger?: string | null;
}): string {
  const tur = (input.analizTuru ?? "").trim();
  const deger = (input.deger ?? "").trim();
  if (tur && deger) return `${tur} — ${deger}`;
  if (tur) return tur;
  if (deger) return deger;
  return "Kayıt";
}

// ── Mobil iki-aşamalı silme state machine ────────────────────────────────────

/** İkinci kapıda birebir yazılması gereken doğrulama metni. */
export const SILME_ONAY_METNI = "SİL";

export type SilmeAsama = "kapali" | "onay1" | "onay2";
export type SilmeState = { asama: SilmeAsama; dogrulama: string };

export const SILME_KAPALI: SilmeState = { asama: "kapali", dogrulama: "" };

/** Silme akışını başlat → birinci onay kapısı (API çağrısı YOK). */
export function silmeBaslat(): SilmeState {
  return { asama: "onay1", dogrulama: "" };
}

/** Birinci onaydan ikinci (yıkıcı) onaya geç. onay1 dışındaki durumlar değişmez. */
export function silmeIleri(s: SilmeState): SilmeState {
  return s.asama === "onay1" ? { asama: "onay2", dogrulama: "" } : s;
}

/** İkinci kapıda yazılan doğrulama metnini güncelle. */
export function silmeMetinGuncelle(s: SilmeState, metin: string): SilmeState {
  return { ...s, dogrulama: metin };
}

/** İptal → kapalı + doğrulama metni temizlenir (yazılan metin sızmaz). */
export function silmeIptal(): SilmeState {
  return { asama: "kapali", dogrulama: "" };
}

/**
 * Nihai silme düğmesi aktif mi? YALNIZ ikinci kapıda ve metin "SİL" ile birebir
 * eşleşiyorsa true. Baş/son boşluk toleranslı; büyük/küçük harf birebir.
 */
export function silmeOnaylanabilir(s: SilmeState): boolean {
  return s.asama === "onay2" && s.dogrulama.trim() === SILME_ONAY_METNI;
}

// ── Viewport tabanlı mobil kararı (PWA'dan BAĞIMSIZ) ─────────────────────────

/** Tailwind `md` breakpoint eşiği: bu genişlik ve altı mobildir (0–767 px). */
export const MOBILE_MAX_WIDTH = 767;

/**
 * Salt viewport genişliğine göre mobil mi? PWA/standalone durumu DİKKATE ALINMAZ
 * (masaüstü PWA mobil sayılmaz). CSS `md:` breakpoint'i ile birebir hizalıdır.
 */
export function isMobileViewport(width: number): boolean {
  return width <= MOBILE_MAX_WIDTH;
}

// ── Mobil/masaüstü dışa-aktarma görünürlüğü ──────────────────────────────────

/**
 * Word/PNG gibi dışa-aktarma kontrolleri görünür mü?
 * Mobilde (isMobile=true) GİZLİ; masaüstünde görünür.
 */
export function disariAktarmaGorunur(isMobile: boolean): boolean {
  return !isMobile;
}

// ── Tam ekran görsel rapor viewer ────────────────────────────────────────────

/** Viewer aç/kapat toggle'ı: mevcut duruma göre tersini döndürür. */
export function viewerToggle(open: boolean): boolean {
  return !open;
}

// ── NUM-MOB-2-FIX2: Numeroloji mobil yüzey (kutu vs düz) karar modeli ─────────

/** Numeroloji içerik yüzeyi türleri (kart üreten wrapper'lar). */
export type NumerolojiSurfaceType =
  | "result-section"
  | "knowledge-note"
  | "summary-section"
  | "relationship-result"
  | "home-business-result"
  | "saved-analysis-row"
  | "module-launcher"
  | "stone-assignment-state";

/** Yüzey kararı: mobilde düz (module-launcher → düz satır), md+'da mevcut kart. */
export type SurfaceDecision = "flat" | "flat-row" | "existing-card";

/**
 * Bir içerik yüzeyinin viewport'a göre kutulu mu düz mü olacağını verir.
 * Mobil (≤767): tüm içerik yüzeyleri kutusuz; module-launcher düz navigasyon satırı.
 * Masaüstü (≥768): mevcut kart tasarımı korunur.
 * (İşlevsel öğeler — input/button/dialog/uyarı/gerçek rapor görseli — bu modelin
 *  dışındadır; sınırlarını her zaman korur.)
 */
export function resolveNumerolojiSurface(
  viewportWidth: number,
  surfaceType: NumerolojiSurfaceType,
): SurfaceDecision {
  if (!isMobileViewport(viewportWidth)) return "existing-card";
  return surfaceType === "module-launcher" ? "flat-row" : "flat";
}

// ── NUM-MOB-2-FIX2: Görsel rapor viewer kontrol modeli ───────────────────────

export type ViewerControls = {
  /** Üstte sabit kapatma şeridi görünür mü? (mobilde ASLA) */
  topCloseVisible: boolean;
  /** Rapor üzerinde yüzen kapatma düğmesi görünür mü? (mobilde ASLA) */
  floatingCloseVisible: boolean;
  /** Tam ekran tema kontrol çubuğu görünür mü? (mobilde ASLA) */
  themeControlsVisible: boolean;
  /** Rapor sonrası normal-akış "Kapat" düğmesi görünür mü? (mobilde HER ZAMAN) */
  footerCloseVisible: boolean;
  /** Kapatma kontrolünün yerleşimi. */
  closePlacement: "after-report" | "floating";
};

/**
 * Viewer kapatma/kontrol yerleşimi. Mobil: yalnız rapordan SONRA normal-akış Kapat;
 * üst/floating close ve tema çubuğu yok. Masaüstü: mevcut yüzen X + tema kontrolü.
 */
export function resolveViewerControls(viewportWidth: number): ViewerControls {
  if (isMobileViewport(viewportWidth)) {
    return {
      topCloseVisible: false,
      floatingCloseVisible: false,
      themeControlsVisible: false,
      footerCloseVisible: true,
      closePlacement: "after-report",
    };
  }
  return {
    topCloseVisible: false,
    floatingCloseVisible: true,
    themeControlsVisible: true,
    footerCloseVisible: false,
    closePlacement: "floating",
  };
}
