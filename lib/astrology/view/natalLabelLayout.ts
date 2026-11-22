// Astroloji — NATAL ÇARK ETİKET DÜZENİ (G2; SAF, istemci güvenli; ağ / DB / sağlayıcı çağrısı YOK).
//
// Onaylı tasarım: G1-R4-S2 (C:\YasamSistemi-Gorsel-Tasarim\natal-burc-derece\r4s2). Bu modül yalnız "etiketin NEREYE yazılacağını"
// ve "hangi değerin nasıl sunulacağını" seçer; hiçbir astronomik değer hesaplanmaz, yuvarlanmaz, değiştirilmez.
//
//   • Dört satırlı etiket (Ayrıntılı): gezegen / derece (+℞) / burç / dakika. Sade: gezegen / derece / dakika.
//   • Etiket merkezi gövdenin KENDİ burç diliminde kalır (sınırdan ≥ 0,6°) → başka burçta izlenimi oluşmaz.
//   • Bir burç dilimine okunur boyutta sığmayan küme (kapasite aşımı, > 6° kaydırma, dilim taşması, aralık ihlali) → o burcun
//     İÇİNDE tek grup etiketi (G2: Ayrıntılı ve Sade düzende).
//   • Anlamsal yakınlaştırma: çark büyüdükçe yazı ölçeği K (≤ 1) küçülür → ekranda yazı boyu sabit, burç diliminde yer açılır ve
//     gruplar gerçekten tekil etiketlere ayrılır (yalnız SVG'yi büyütmek değil).
//   • Saat bilinmiyor: Ay çarkta HİÇ çizilmez (12:00 varsayımındaki burç dilimine konmaz, gruplara sayılmaz); diğer gövdeler "≈"
//     (yerel 12:00 varsayımı). İç teknik veri değişmez.

import { SIGN_IDS, type BodyId, type SignId } from "../model/western";
import type { NatalLabelPref, NatalWheelMode } from "./natalWheelDisplay";

/** Owner metni (G1-R4-S2): saat bilinmiyorken Ay için çark dışı açıklama. */
export const MOON_UNKNOWN_TEXT = "Ay'ın kesin burcu ve derecesi, doğum saati bilinmediği için doğrulanamıyor.";
/** Owner kararı (G2): Gezegenler tablosundaki Ay satırı. */
export const MOON_UNKNOWN_ROW = "Doğum saati bilinmediği için konumu belirsiz";
/** Diğer gövdelerin saat bilinmiyorken değerleri. */
export const NOON_ASSUMPTION = "12:00 varsayımı";
export const TIME_UNKNOWN_ASSUMED_NOTE = "Doğum saati bilinmiyor: “≈” değerler yerel 12:00 varsayımıdır, kesin değildir.";

/** Etiket tercihi: "Moda göre" (Temel → sade, Profesyonel → ayrıntılı) / Sade / Ayrıntılı. */
export function labelsDetailed(pref: NatalLabelPref, mode: NatalWheelMode): boolean {
  return pref === "detailed" || (pref === "auto" && mode === "pro");
}

export const norm = (d: number) => ((d % 360) + 360) % 360;
export const adist = (a: number, b: number) => Math.min(norm(a - b), norm(b - a));
const dif = (a: number, b: number) => ((a - b + 540) % 360) - 180;
/** Sıralı iki etiket arasındaki ileri aralık; eşit konumdaki kayan nokta artığı (−1e-14 → ~360°) 0 sayılır. */
const fwdGap = (a: number, b: number) => {
  const g = norm(b - a);
  return g > 360 - 1e-9 ? 0 : g;
};
export const signIndexOf = (lon: number) => Math.floor(norm(lon) / 30) % 12;

/** Çark ölçüleri (NatalWheel ile aynı; ürün geometrisi KORUNUR). */
export const WHEEL = { SIZE: 604, C: 302, R_OUT: 272, R_SIGN_IN: 238, RULER_W: 11, R_HOUSE_NUM: 136, R_ASPECT: 122 } as const;

export type LabelProfile = "screen" | "compact";
export type LabelGeo = {
  pad: number;
  minSep: number;
  /** g: glif, d: derece, s: burç, m: dakika yarıçapı. */
  tier: { g: number; d: number; s: number; m: number };
  f: { g: number; v: number; d: number; s: number; m: number; cusp: number; cuspSign: number; plateT: number; plateV: number };
};

/** R4 profilleri: screen = masaüstü (dört satır); compact = dar görünüm (gezegen + burç; derece/dakika dokunarak / yakınlaştırarak). */
export const LABEL_GEO: Record<LabelProfile, LabelGeo> = {
  screen: { pad: 60, minSep: 9.5, tier: { g: 212, d: 195, s: 181, m: 168 }, f: { g: 21, v: 15, d: 10.5, s: 14, m: 8.5, cusp: 9.5, cuspSign: 12, plateT: 10.5, plateV: 9.5 } },
  compact: { pad: 60, minSep: 13.5, tier: { g: 210, d: 178, s: 178, m: 178 }, f: { g: 21, v: 15, d: 10.5, s: 14, m: 8.5, cusp: 9.5, cuspSign: 12, plateT: 10.5, plateV: 9.5 } },
};

export const LABEL_VIEWBOX = WHEEL.SIZE + 2 * LABEL_GEO.screen.pad;

/** Anlamsal yakınlaştırma: yazı / aralık ölçeği K ile küçülür; yarıçaplar (geometri) AYNI kalır. */
export function scaleLabelGeo(G0: LabelGeo, K: number): LabelGeo {
  if (K >= 0.999) return G0;
  const t = G0.tier;
  const sc = (r: number) => t.g - (t.g - r) * K;
  const f = Object.fromEntries(Object.entries(G0.f).map(([k, v]) => [k, v * K])) as LabelGeo["f"];
  return { ...G0, f, minSep: G0.minSep * K, tier: { g: t.g, d: sc(t.d), s: sc(t.s), m: sc(t.m) } };
}

/**
 * Görüntüleme ölçeği → etiket profili ve K. `wheelPx`: çarkın yerleşim (dönüşüm öncesi) piksel boyu; `scale`: görüntüleyicinin
 * yakınlaştırması. Ölçek 1'de (sığdır) K = 1 → onaylı R4 düzeni; yakınlaştırınca yazı ekranda ~1 birim = 1 px tutulur.
 */
export function semanticZoom(wheelPx: number, scale: number): { eff: number; compact: boolean; K: number } {
  const eff = (wheelPx / LABEL_VIEWBOX) * scale;
  const compact = wheelPx > 0 && eff < 0.7;
  const K = compact || scale <= 1.01 ? 1 : eff > 1.15 ? Math.max(0.25, Math.round((1 / eff) * 20) / 20) : 1;
  return { eff, compact, K };
}

export type LabelItem = { id: string; lon: number };
export type LabelGroup = { sign: SignId; ids: string[]; mid: number };

/** Etiketin kendi burç dilimi içindeki izinli aralığı (burç başından derece). Varsayılan 0,6–29,4. */
export type LabelBounds = (x: LabelItem) => { lo: number; hi: number };
const DEFAULT_BOUNDS: LabelBounds = () => ({ lo: 0.6, hi: 29.4 });

/** Tek kademe yerleşim: komşular itilir, etiket kendi burç diliminde (izinli aralıkta) kalır. */
export function placeLabels(items: readonly LabelItem[], sep: number, bounds: LabelBounds = DEFAULT_BOUNDS): Map<string, number> {
  const disp = new Map(items.map((x) => [x.id, x.lon]));
  const clamp = (x: LabelItem) => {
    const start = Math.floor(norm(x.lon) / 30) * 30;
    const { lo: blo, hi: bhi } = bounds(x);
    const dl = dif(disp.get(x.id)!, x.lon);
    const lo = start + blo - norm(x.lon);
    const hi = start + bhi - norm(x.lon);
    const cc = Math.max(lo, Math.min(hi, Math.max(Math.min(lo, 0), Math.min(Math.max(hi, 0), dl))));
    if (Math.abs(cc - dl) > 1e-9) {
      disp.set(x.id, x.lon + cc);
      return true;
    }
    return false;
  };
  for (let it = 0; it < 300; it++) {
    let moved = false;
    for (const x of items) if (clamp(x)) moved = true;
    const order = [...items].sort((a, b) => norm(disp.get(a.id)!) - norm(disp.get(b.id)!));
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      const b = order[(i + 1) % order.length];
      if (a.id === b.id) continue;
      const gap = fwdGap(disp.get(a.id)!, disp.get(b.id)!);
      if (gap < sep) {
        const push = (sep - gap) / 2 + 0.05;
        disp.set(a.id, disp.get(a.id)! - push);
        disp.set(b.id, disp.get(b.id)! + push);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return disp;
}

/**
 * Grup etiketi kutusu (çarktaki çizimle AYNI ölçüler): merkez yarıçapı, genişlik, yükseklik. Dar profilde "♌ 3" (sabit kutu),
 * ekranda "♌ 3 nokta" + semboller (üye sayısıyla genişler; K ile ölçeklenir).
 */
export function groupBox(n: number, profile: LabelProfile, K: number) {
  if (profile === "compact") return { r: LABEL_GEO.compact.tier.g - 8, w: 68, h: 40 };
  return { r: 190, w: Math.max(70, n * 15 + 16) * K, h: 44 * K };
}
/** Grup kutusunun açısal yarı genişliği (iç kenarda, derece). */
export function groupHalfDeg(n: number, profile: LabelProfile, K: number) {
  const b = groupBox(n, profile, K);
  return (Math.atan2(b.w / 2, b.r - b.h / 2) * 180) / Math.PI;
}

/**
 * Gruplama + yerleşim (R3/R4 kuralı, G2'de iki düzene de uygulanır). Bir burç diliminde: kapasite aşımı, tek kademede > 6° (dar
 * görünüm 8°) kaydırma, etiketin kendi diliminden taşması ya da komşu etiketle aralığın korunamaması → o burç gruplanır; burcunda
 * tek kalan gövde sorun çıkarıyorsa onu iten komşu burç kümesi gruplanır. Son durumda her tekil etiket kendi burç diliminde ve
 * komşusundan en az `sep` uzaktadır (aksi hâlde grup). Sade düzen de aynı aralığı kullanır (derece satırı ℞ / ≈ ile genişler;
 * ürünün önceki 7,5° glif aralığı derece yazılarını çakıştırıyordu — G2 tarayıcı ölçümü).
 */
export function layoutLabels(all: readonly LabelItem[], opt: { detailed: boolean; profile: LabelProfile; K: number; assumed?: boolean }) {
  const G = scaleLabelGeo(LABEL_GEO[opt.profile], opt.K);
  // Saat bilinmiyor: derece satırı "≈" ile genişler → aralık %12 artar (G2 tarayıcı taraması: aksi hâlde komşu yazılar değiyordu).
  const sep = G.minSep * (opt.assumed ? 1.12 : 1);
  let items = [...all];
  const groups: LabelGroup[] = [];
  const cap = Math.floor((30 - 1.2) / sep) + 1;
  const bySign = new Map<number, LabelItem[]>();
  for (const x of items) {
    const k = signIndexOf(x.lon);
    if (!bySign.has(k)) bySign.set(k, []);
    bySign.get(k)!.push(x);
  }
  for (const [k, xs] of bySign) if (xs.length > cap) groups.push({ sign: SIGN_IDS[k], ids: xs.map((x) => x.id), mid: k * 30 + 15 });
  let grouped = new Set(groups.flatMap((g) => g.ids));
  items = items.filter((x) => !grouped.has(x.id));
  const MAX_SHIFT = opt.profile === "compact" ? 8 : 6;
  // Komşu burçtaki grup kutusu burç sınırına yaklaşır → bu burcun etiketleri kutunun kenarından en az yarım etiket uzak durur.
  const boundsFor = (): LabelBounds => {
    const half = new Map(groups.map((g) => [SIGN_IDS.indexOf(g.sign), groupHalfDeg(g.ids.length, opt.profile, opt.K)]));
    return (x) => {
      const k = signIndexOf(x.lon);
      const prev = half.get((k + 11) % 12);
      const next = half.get((k + 1) % 12);
      return {
        lo: prev === undefined ? 0.6 : Math.max(0.6, prev - 15 + sep / 2 + 0.5),
        hi: next === undefined ? 29.4 : Math.min(29.4, 45 - next - sep / 2 - 0.5),
      };
    };
  };
  for (let round = 0; round < 24; round++) {
    const bounds = boundsFor();
    const d0 = placeLabels(items, sep, bounds);
    const worst = new Map<number, number>();
    const mark = (k: number, score: number) => {
      if (score > (worst.get(k) ?? 0)) worst.set(k, score);
    };
    for (const x of items) {
      const k = signIndexOf(x.lon);
      const sh = adist(d0.get(x.id)!, x.lon);
      if (sh > MAX_SHIFT) mark(k, sh);
      const off = norm(d0.get(x.id)! - k * 30);
      const b = bounds(x);
      if (off < b.lo - 1e-6 || off > b.hi + 1e-6) mark(k, 100);
    }
    const order = [...items].sort((a, b) => norm(d0.get(a.id)!) - norm(d0.get(b.id)!));
    if (order.length > 1)
      for (let i = 0; i < order.length; i++) {
        const a = order[i];
        const b = order[(i + 1) % order.length];
        if (fwdGap(d0.get(a.id)!, d0.get(b.id)!) < sep - 0.05) {
          mark(signIndexOf(a.lon), 50);
          mark(signIndexOf(b.lon), 50);
        }
      }
    if (!worst.size) break;
    let k = [...worst.entries()].sort((a, b) => b[1] - a[1])[0][0];
    let xs = items.filter((x) => signIndexOf(x.lon) === k);
    if (xs.length < 2) {
      const me = xs[0];
      const others = items.filter((x) => x.id !== me.id).sort((p, q) => adist(p.lon, me.lon) - adist(q.lon, me.lon));
      if (!others.length) break;
      const kn = signIndexOf(others[0].lon);
      const xn = items.filter((x) => signIndexOf(x.lon) === kn);
      // Komşu burçta da tek gövde varsa (iki tekil etiket sınırın iki yanında): bu gövde kendi burcunda tek üyeli grup olur.
      if (xn.length >= 2) {
        k = kn;
        xs = xn;
      }
    }
    groups.push({ sign: SIGN_IDS[k], ids: xs.map((x) => x.id), mid: k * 30 + 15 });
    grouped = new Set(groups.flatMap((g) => g.ids));
    items = items.filter((x) => !grouped.has(x.id));
  }
  const disp = placeLabels(items, sep, boundsFor());
  return { G, sep, groups, singles: items, disp };
}

// ─── Kesinlik kuralı (G1-R4-S1/S2) ─────────────────────────────────────────────

/** exact: saat biliniyor · assumed: saat bilinmiyor, Ay dışı (≈ 12:00) · unknown: saat bilinmiyor, Ay (burç / derece YOK). */
export type PositionStatus = "exact" | "assumed" | "unknown";

/** Etiket anahtarı: gövde kimliği ya da özel nokta "x:vertex" / "x:fortune". */
export function positionStatus(timeUnknown: boolean, key: string): PositionStatus {
  return !timeUnknown ? "exact" : key === "moon" ? "unknown" : "assumed";
}

/** Saat bilinmiyorken çarka girmeyen gövde (Ay). Özel noktalar zaten maskelidir (teknik veride yok). */
export function drawnOnWheel(timeUnknown: boolean, id: BodyId | string): boolean {
  return !(timeUnknown && id === "moon");
}
