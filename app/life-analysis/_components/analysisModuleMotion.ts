/**
 * Yaşam Analiz Merkezi modül kartları — MERKEZÎ hareket ayarları (2026-10-17).
 *
 * Tüm kartların sürekli dekor animasyonu, hızı, 3D eğimi, parallax derinliği, ışıma yoğunluğu ve hover
 * yükselişi YALNIZ buradan yönetilir. Değerler karta CSS değişkeni / data-* olarak basılır; animasyon
 * tanımları (keyframes) AnalysisModuleCard.module.css'te, hangi dekorun hangi animasyonu kullandığı
 * moduleArtwork.tsx'te. Hepsini tek yerden kapatmak için: `ambient: false` (ve istenirse `tilt: false`).
 *
 * Animasyonlar YALNIZ dekoratiftir: sayı, merkez, kanal veya gezegen konumları hiçbir hesaplamayı / gerçek
 * transit ya da astronomik konumu temsil etmez. "Hareketi azalt" açıksa CSS hepsini (eğim dahil) kapatır.
 */

export interface AnalysisCardMotion {
  /** Sürekli dekor animasyonları (dönen halkalar, parıltılar, süzülen küreler…). */
  ambient: boolean;
  /** Fareyle 3D eğim + katman parallax'ı. */
  tilt: boolean;
  /** Animasyon hız çarpanı (1 = varsayılan; 0.5 = iki kat yavaş). */
  speed: number;
  /** En fazla eğim (derece). */
  tiltMaxX: number;
  tiltMaxY: number;
  /** Katman parallax çarpanı (0 = katmanlar kaymaz; 1 = varsayılan derinlik). */
  parallax: number;
  /** Işıma / parlama yoğunluk çarpanı (0–1 önerilir). */
  glow: number;
  /** Hover'da kartın yükselişi (px). */
  hoverLiftPx: number;
}

export const ANALYSIS_CARD_MOTION: AnalysisCardMotion = {
  ambient: true,
  tilt: true,
  speed: 1,
  tiltMaxX: 3.5,
  tiltMaxY: 4.5,
  parallax: 1,
  glow: 1,
  hoverLiftPx: 4,
};

export function motionCssVars(m: AnalysisCardMotion): Record<`--amc-${string}`, string> {
  return {
    "--amc-speed": String(Math.max(m.speed, 0.05)),
    "--amc-parallax": String(m.tilt ? m.parallax : 0),
    "--amc-glow": String(m.glow),
    "--amc-lift-hover": `${-Math.abs(m.hoverLiftPx)}px`,
  };
}
