// Human Design — TANIMLI MERKEZ İÇ RENKLERİ (tek kaynak; SAF görsel eşleme, hesap yok).
//
// Kanonik eşleme (merkez → renk ailesi) HD'nin geleneksel BodyGraph renkleridir ve sabittir; rastgele değildir:
//   Baş = altın · Ajna = yeşil · Boğaz = kahverengi · G = altın · Kalp/Ego = kırmızı · Dalak = kahverengi ·
//   Solar Pleksus = kahverengi · Sakral = kırmızı · Kök = kahverengi.
// Doğrulama (2026-10-20): kullandığımız sağlayıcının resmî BodyGraph bileşeni (public/vendor/roxy-ui/0.48.0/bodygraph.js,
// MIT; "filled with its traditional color when defined") birebir bu eşlemeyi kullanır (head/g gold, ajna green,
// heart/sacral red, throat/spleen/solar-plexus/root brown); klasik BodyGraph geleneğiyle aynıdır.
// Tonlar premium tasarıma uyarlandı (üstten alta hafif degrade; alt durak sağlayıcı referans rengine yakın) ve her ailede
// merkez adı WCAG kontrastı degradenin iki ucunda da ≥ 4,5 olacak şekilde seçildi.
// Tanımsız (açık) merkez boyanmaz: mevcut açık stil (beyaz) aynen kalır. Kanal / kapı renkleri bu dosyada YOKTUR.

export type CenterColorFamily = "gold" | "green" | "red" | "brown";

/** Motor merkez adı → renk ailesi (lib/human-design/engine/channels CENTERS adlarıyla). */
export const CENTER_COLOR_FAMILY: Readonly<Record<string, CenterColorFamily>> = Object.freeze({
  Head: "gold",
  Ajna: "green",
  Throat: "brown",
  G: "gold",
  Heart: "red",
  Spleen: "brown",
  SolarPlexus: "brown",
  Sacral: "red",
  Root: "brown",
});

/** Aile → degrade (üst / alt), etiket rengi ve sağlayıcı referans rengi (yalnız belge / test). */
export const CENTER_FAMILY_STYLE: Readonly<Record<CenterColorFamily, { top: string; bottom: string; label: string; reference: string }>> = Object.freeze({
  gold: { top: "#f7d77a", bottom: "#e0a200", label: "#3a2a00", reference: "#e0a200" },
  green: { top: "#36871a", bottom: "#2a7a06", label: "#ffffff", reference: "#2f8f00" },
  red: { top: "#cf3632", bottom: "#b81c1c", label: "#ffffff", reference: "#c41f1f" },
  brown: { top: "#93673f", bottom: "#76502f", label: "#ffffff", reference: "#76502f" },
});

/**
 * Tanımlı merkez dolgu modu — TEK ANAHTAR. "canonical": merkez kimliğine göre sabit renk (doğru HD görünümü).
 * "uniform": 2026-10-20 öncesi tek tip soluk lavanta (geri dönüş; yalnız bu sabiti değiştir).
 */
export type CenterFillMode = "canonical" | "uniform";
export const HD_CENTER_FILL_MODE: CenterFillMode = "canonical";

const gradId = (f: CenterColorFamily) => `cbgCenter${f[0].toUpperCase()}${f.slice(1)}`;

/** SVG <defs> içine eklenecek dört aile degradesi. */
export const CENTER_FILL_DEFS = (Object.keys(CENTER_FAMILY_STYLE) as CenterColorFamily[])
  .map((f) => `<linearGradient id="${gradId(f)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CENTER_FAMILY_STYLE[f].top}"/><stop offset="1" stop-color="${CENTER_FAMILY_STYLE[f].bottom}"/></linearGradient>`)
  .join("");

/** Tanımlı merkezin dolgusu (canonical modda aile degradesi; bilinmeyen merkez / uniform modda null → eski dolgu). */
export function definedCenterFill(engineCenter: string, mode: CenterFillMode = HD_CENTER_FILL_MODE): string | null {
  const f = CENTER_COLOR_FAMILY[engineCenter];
  return mode === "canonical" && f ? `url(#${gradId(f)})` : null;
}

/** Tanımlı merkezin ADI için okunaklı renk (canonical modda); aksi hâlde null → mevcut mürekkep. */
export function definedCenterLabelColor(engineCenter: string, mode: CenterFillMode = HD_CENTER_FILL_MODE): string | null {
  const f = CENTER_COLOR_FAMILY[engineCenter];
  return mode === "canonical" && f ? CENTER_FAMILY_STYLE[f].label : null;
}
