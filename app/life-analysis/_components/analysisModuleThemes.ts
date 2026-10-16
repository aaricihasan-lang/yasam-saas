/**
 * Yaşam Analiz Merkezi modül kartları — MERKEZÎ tema (2026-10-16, owner referans görselleri A/B/C).
 *
 * Kart renkleri / zemin / çerçeve / gölge / ışıma / ikon kutusu / başlık vurgusu YALNIZ burada tanımlanır.
 * Yapı (radius, boşluk, tipografi ölçüsü, 3D hover, hareket azaltma) AnalysisModuleCard.module.css'te; dekor
 * çizimleri moduleArtwork.tsx'te. Sayfalar yalnız `variant` + metin + adres verir.
 *
 * Her alan CSS custom property olarak karta basılır (--amc-*); yeni modül = buraya yeni bir variant.
 */

export type AnalysisModuleVariant = "numerology" | "humanDesign" | "skyAtlas";

/** Başlıkta altın/vurgu tonu alacak kelime: "Gökyüzü Atlası" → ilk, "Human Design" → son, "Numeroloji" → yok. */
export type TitleAccent = "none" | "first" | "last";

export interface AnalysisModuleTheme {
  /** Kart zemini (katmanlı gradient). */
  surface: string;
  /** Metnin okunduğu sol bölgeyi dekordan ayıran perde (okunabilirlik). */
  scrim: string;
  /** İnce çerçeve rengi. */
  border: string;
  /** Üst kenar parlaması (cam kenar hissi). */
  edgeHighlight: string;
  /** Dinlenme ve hover gölgesi. */
  shadow: string;
  shadowHover: string;
  /** İmlecin altında beliren yumuşak ışık. */
  glare: string;
  eyebrow: string;
  title: string;
  /** Vurgulu kelime için gradient (background-clip: text). */
  titleAccentFill: string;
  titleAccent: TitleAccent;
  body: string;
  iconSurface: string;
  iconBorder: string;
  iconShadow: string;
  iconColor: string;
  focusRing: string;
}

export const ANALYSIS_MODULE_THEMES: Record<AnalysisModuleVariant, AnalysisModuleTheme> = {
  // A — açık lila / mor / altın; sakin, rafine.
  numerology: {
    surface:
      "radial-gradient(ellipse 60% 95% at 88% 50%, rgba(124,82,214,0.55), transparent 70%)," +
      "radial-gradient(ellipse 40% 55% at 70% 100%, rgba(240,200,140,0.35), transparent 70%)," +
      "linear-gradient(118deg, #fbf8ff 0%, #f3ecff 42%, #d9c9f6 72%, #8b6bd1 100%)",
    scrim: "linear-gradient(90deg, rgba(251,248,255,0.92) 0%, rgba(247,242,255,0.7) 45%, rgba(247,242,255,0) 70%)",
    border: "rgba(167,139,250,0.38)",
    edgeHighlight: "rgba(255,255,255,0.9)",
    shadow: "0 18px 40px -26px rgba(76,29,149,0.45), 0 2px 6px -2px rgba(76,29,149,0.12)",
    shadowHover: "0 30px 56px -28px rgba(76,29,149,0.55), 0 4px 12px -4px rgba(76,29,149,0.16)",
    glare: "rgba(255,255,255,0.55)",
    eyebrow: "#7c3aed",
    title: "#2a1150",
    titleAccentFill: "linear-gradient(180deg, #3b1873, #2a1150)",
    titleAccent: "none",
    body: "#4b3f63",
    iconSurface: "linear-gradient(145deg, #8b5cf6 0%, #5b21b6 100%)",
    iconBorder: "rgba(255,255,255,0.75)",
    iconShadow: "0 10px 22px -10px rgba(91,33,182,0.7), inset 0 1px 0 rgba(255,255,255,0.35)",
    iconColor: "#ffffff",
    focusRing: "#7c3aed",
  },
  // B — petrol yeşili / turkuaz / altın; teknolojik ama yumuşak.
  humanDesign: {
    surface:
      "radial-gradient(ellipse 55% 90% at 82% 45%, rgba(45,190,160,0.42), transparent 70%)," +
      "radial-gradient(ellipse 50% 60% at 0% 100%, rgba(120,220,190,0.22), transparent 70%)," +
      "linear-gradient(120deg, #06302d 0%, #0a3f3b 45%, #0f5a51 78%, #127163 100%)",
    scrim: "linear-gradient(90deg, rgba(6,44,41,0.85) 0%, rgba(7,52,48,0.55) 45%, rgba(7,52,48,0) 70%)",
    border: "rgba(134,239,212,0.22)",
    edgeHighlight: "rgba(190,255,236,0.35)",
    shadow: "0 18px 40px -24px rgba(4,60,52,0.7), 0 2px 6px -2px rgba(4,60,52,0.2)",
    shadowHover: "0 30px 56px -26px rgba(4,80,68,0.75), 0 4px 12px -4px rgba(4,60,52,0.25)",
    glare: "rgba(160,255,225,0.16)",
    eyebrow: "#7ee0c3",
    title: "#f6fbf9",
    titleAccentFill: "linear-gradient(180deg, #f8dfa6 0%, #d6a75a 100%)",
    titleAccent: "last",
    body: "rgba(232,246,241,0.92)",
    iconSurface: "linear-gradient(145deg, rgba(20,110,96,0.95) 0%, rgba(6,48,44,0.95) 100%)",
    iconBorder: "rgba(134,239,212,0.35)",
    iconShadow: "0 10px 22px -10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.18)",
    iconColor: "#e9c57f",
    focusRing: "#e9c57f",
  },
  // C — lacivert / gece mavisi / altın; en derin, yine de dengeli.
  skyAtlas: {
    surface:
      "radial-gradient(ellipse 60% 95% at 85% 45%, rgba(99,62,190,0.55), transparent 70%)," +
      "radial-gradient(ellipse 55% 60% at 5% 5%, rgba(76,52,160,0.35), transparent 70%)," +
      "linear-gradient(125deg, #0a0e2c 0%, #141a4a 60%, #1d1450 100%)",
    scrim: "linear-gradient(90deg, rgba(10,14,44,0.85) 0%, rgba(14,18,56,0.55) 45%, rgba(14,18,56,0) 70%)",
    border: "rgba(196,181,253,0.22)",
    edgeHighlight: "rgba(214,204,255,0.35)",
    shadow: "0 18px 40px -22px rgba(30,20,90,0.75), 0 2px 6px -2px rgba(30,20,90,0.25)",
    shadowHover: "0 30px 56px -24px rgba(60,40,160,0.8), 0 4px 12px -4px rgba(30,20,90,0.3)",
    glare: "rgba(200,190,255,0.14)",
    eyebrow: "#b9a8f5",
    title: "#ffffff",
    titleAccentFill: "linear-gradient(180deg, #fbe3b0 0%, #d9a95a 100%)",
    titleAccent: "first",
    body: "rgba(240,238,255,0.92)",
    iconSurface: "linear-gradient(145deg, #7c4ddb 0%, #3b237f 100%)",
    iconBorder: "rgba(214,204,255,0.4)",
    iconShadow: "0 10px 22px -10px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.22)",
    iconColor: "#f5d08a",
    focusRing: "#d9b56f",
  },
};

/** Tema → kart elemanına basılan CSS değişkenleri (AnalysisModuleCard.module.css bunları okur). */
export function themeCssVars(theme: AnalysisModuleTheme): Record<`--amc-${string}`, string> {
  return {
    "--amc-surface": theme.surface,
    "--amc-scrim": theme.scrim,
    "--amc-border": theme.border,
    "--amc-edge": theme.edgeHighlight,
    "--amc-shadow": theme.shadow,
    "--amc-shadow-hover": theme.shadowHover,
    "--amc-glare": theme.glare,
    "--amc-eyebrow": theme.eyebrow,
    "--amc-title": theme.title,
    "--amc-title-accent": theme.titleAccentFill,
    "--amc-body": theme.body,
    "--amc-icon-surface": theme.iconSurface,
    "--amc-icon-border": theme.iconBorder,
    "--amc-icon-shadow": theme.iconShadow,
    "--amc-icon-color": theme.iconColor,
    "--amc-focus": theme.focusRing,
  };
}
