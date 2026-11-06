/**
 * KİŞİSEL DİJİTAL OFİS (P4) — fotoğraf üzerindeki metnin okunabilirliği (SAF matematik; DOM / ağ YOK).
 *
 * Girdi: metin bloğunun ARKASINDA kalan (zaten var olan katmanlarla birleştirilmiş) fotoğraf pikselleri, metnin gerçekte
 * kullanılan renk(ler)i ve hedef oranı (4,5 normal / 3 büyük yazı), katman (scrim) rengi.
 * Çıktı: katmansız en kötü durum oranı (ortalama DEĞİL — varsayılan %90 yüzdelik en kötü piksel) ve hedefe ulaşan EN DÜŞÜK
 * katman yoğunluğu (0–0,85 tavan). Fotoğrafın kendisi değiştirilmez; katman yalnız metnin arkasına konur.
 *
 * Durumlar:
 *  - "pass"         ölçüldü, katman gerekmeden ≥ hedef
 *  - "fixed"        ölçüldü, en düşük yeterli katman uygulandı, ≥ hedef
 *  - "insufficient" ölçüldü, tavanda bile hedefe ulaşılamıyor (çağıran ayrıca yazı gölgesi ekler ve bildirir)
 *  - "unmeasured"   piksel yok / tuval okunamadı / fotoğraf yüklenmedi → ASLA geçti olarak gösterilmez
 */

export type RGB = readonly [number, number, number];

export type ReadabilityStatus = "pass" | "fixed" | "insufficient" | "unmeasured";

/** Metin rengi: alpha < 1 ise (ör. rgb(255 255 255 / 0.8)) arka planla karışmış hâli ölçülür. */
export type TextSample = { color: RGB; alpha?: number; target: number };

export type ReadabilityInput = {
  pixels?: readonly RGB[];
  texts?: readonly TextSample[];
  scrim: RGB;
  /** En yüksek katman yoğunluğu (varsayılan 0,85). */
  cap?: number;
  /** En kötü durum yüzdeliği (varsayılan 0,9 → piksellerin %90'ı bu orandan iyi). */
  percentile?: number;
  /** Yoğunluk arama adımı (varsayılan 0,01). */
  step?: number;
  /** Hedefe eklenecek güvenlik payı (varsayılan 0). */
  margin?: number;
};

export type ReadabilityResult = {
  status: ReadabilityStatus;
  /** Uygulanan katmanla en kötü durum oranı (en sıkı hedefe sahip metinler); ölçülmediyse null. */
  ratio: number | null;
  /** Katmansız en kötü durum oranı; ölçülmediyse null. */
  ratioBefore: number | null;
  /** Uygulanacak katman yoğunluğu (0 = katman yok). */
  alpha: number;
  /** Raporlanan oranın hedefi (metinlerdeki en sıkı hedef). */
  target: number;
  /** Tavan içinde hedefe ulaşılabiliyor mu. */
  reachable: boolean;
  samples: number;
};

export const SCRIM_CAP = 0.85;
/** Açık ton → krem/beyaz katman; koyu ton → derin mürekkep katman (personal.module.css katmanlarıyla aynı renkler). */
export const SCRIM_LIGHT: RGB = [251, 250, 247];
export const SCRIM_DARK: RGB = [18, 13, 36];
export function scrimForTone(tone: "light" | "dark"): RGB {
  return tone === "dark" ? SCRIM_DARK : SCRIM_LIGHT;
}

const LIN = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return t;
})();
function chan(v: number): number {
  const c = Math.min(255, Math.max(0, v)) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function luminance(c: RGB): number {
  const f = (v: number) => (Number.isInteger(v) && v >= 0 && v <= 255 ? LIN[v] : chan(v));
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
export function ratioOf(a: RGB, b: RGB): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** sRGB uzayında "over" karışımı (tarayıcıların katman birleştirmesiyle aynı): a üzerine b, yoğunluk t. */
export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function validRgb(c: unknown): c is RGB {
  return Array.isArray(c) && c.length >= 3 && [0, 1, 2].every((i) => Number.isFinite(c[i]));
}

/** Tek metin rengi için, verilen katman yoğunluğunda yüzdelik en kötü oran. */
export function worstRatio(pixels: readonly RGB[], text: TextSample, scrim: RGB, alpha: number, percentile = 0.9): number {
  const ta = text.alpha === undefined ? 1 : Math.min(1, Math.max(0, text.alpha));
  const rs = new Float64Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    const bg = alpha > 0 ? mixRgb(pixels[i], scrim, alpha) : pixels[i];
    const fg = ta < 1 ? mixRgb(bg, text.color, ta) : text.color;
    rs[i] = ratioOf(fg, bg);
  }
  rs.sort();
  const idx = Math.max(0, Math.min(rs.length - 1, Math.floor((rs.length - 1) * (1 - percentile))));
  return rs[idx];
}

type Group = { pixels: readonly RGB[]; texts: readonly TextSample[] };
type Eval = { ok: boolean; ratio: number };
function evaluate(groups: readonly Group[], scrim: RGB, alpha: number, p: number, margin: number, strict: number): Eval {
  let ok = true;
  let ratio = Infinity;
  for (const g of groups) {
    for (const t of g.texts) {
      const r = worstRatio(g.pixels, t, scrim, alpha, p);
      if (r < t.target + margin) ok = false;
      if (t.target === strict && r < ratio) ratio = r;
    }
  }
  return { ok, ratio };
}

const round2 = (v: number) => Math.round(v * 100) / 100;
/** Oran raporu aşağı yuvarlanır (4,497 asla "4,5" görünmez). */
const floor2 = (v: number) => Math.floor(v * 100 + 1e-9) / 100;

const cleanTexts = (ts: readonly TextSample[] | undefined) =>
  (ts ?? []).filter((t) => t && validRgb(t.color) && Number.isFinite(t.target) && t.target > 0 && (t.alpha === undefined || t.alpha > 0));

/**
 * Tek piksel kümesi (pixels + texts) ya da metin öğesi başına ayrı kümeler (groups: her metin kendi satırlarının altındaki
 * piksellerle ölçülür). Katman tek yoğunluktur: bütün kümeler aynı anda hedefe ulaşmalıdır.
 */
export function photoReadability(input: ReadabilityInput & { groups?: readonly Group[] }): ReadabilityResult {
  const cap = Math.min(1, Math.max(0, input.cap ?? SCRIM_CAP));
  const p = Math.min(1, Math.max(0, input.percentile ?? 0.9));
  const step = input.step && input.step > 0 ? input.step : 0.01;
  const margin = Math.max(0, input.margin ?? 0);
  const raw: readonly Group[] = input.groups ?? [{ pixels: input.pixels ?? [], texts: input.texts ?? [] }];
  const groups = raw
    .map((g) => ({ pixels: (g.pixels ?? []).filter(validRgb), texts: cleanTexts(g.texts) }))
    .filter((g) => g.pixels.length > 0 && g.texts.length > 0);
  const allTexts = groups.flatMap((g) => g.texts);
  const target = allTexts.length ? Math.max(...allTexts.map((t) => t.target)) : 4.5;
  const samples = groups.reduce((s, g) => s + g.pixels.length, 0);
  if (!groups.length || !validRgb(input.scrim)) {
    return { status: "unmeasured", ratio: null, ratioBefore: null, alpha: 0, target, reachable: false, samples: 0 };
  }
  const before = evaluate(groups, input.scrim, 0, p, margin, target);
  const base = { ratioBefore: floor2(before.ratio), target, samples };
  if (before.ok) return { status: "pass", ratio: floor2(before.ratio), alpha: 0, reachable: true, ...base };
  const n = Math.round(cap / step);
  for (let i = 1; i <= n; i++) {
    const a = Math.min(cap, i * step);
    const e = evaluate(groups, input.scrim, a, p, margin, target);
    if (e.ok) return { status: "fixed", ratio: floor2(e.ratio), alpha: round2(a), reachable: true, ...base };
  }
  const atCap = evaluate(groups, input.scrim, cap, p, margin, target);
  return { status: "insufficient", ratio: floor2(atCap.ratio), alpha: round2(cap), reachable: false, ...base };
}

/** WCAG büyük yazı: ≥ 24 px veya ≥ 18,66 px ve kalın (≥ 700). */
export function targetForText(fontSizePx: number, fontWeight: number): number {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
}
