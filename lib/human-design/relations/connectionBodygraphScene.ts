// Connection (iki kişilik ilişki) BODYGRAPH SAHNESİ — SAF (DOM yok, ağ yok, hesap yok).
//
// Görünüm: owner'ın KESİN premium referansı (2026-10-18, "Yaşam Sistemi Enerji Haritası") — cinsiyetsiz, ışıklı
// mavi-lila yarı saydam silüet; beyaz zemin, yumuşak ışık halesi ve ince yörünge halkaları; üç boyutlu kanal
// boruları (pasif: beyaz-gümüş; A: parlak elektrik mavisi; B: parlak turuncu); gölgeli merkezler; parlak dolgulu
// aktif kapılar; sağ üstte Yaşam Sistemi logosu. Referanstan YALNIZ estetik alınır.
//
// Teknik doğruluk: kanal / merkez / kapı geometrisi MÜHÜRLÜ V9 (connectionBodygraphGeometry.ts, otomatik; elle
// değişmez); ön katman ölçeklenmez. Veri YALNIZ kayıtlı + doğrulanmış Connection sonucu ve (varsa) kayıtlı bireysel
// aktif kapılar (compositeModel). Klasik kural: her aktif kapı kanalın KENDİ yarısını kişinin rengine boyar
// (A mavi, B turuncu, ikisi → mavi boru üzerinde turuncu şerit). İki yarısı boyalı + bağlantı türü işareti =
// TANIMLI kanal; tek yarısı boyalı = YARIM kanal. Entegrasyon ağında (10 · 20 · 34 · 57) her kapı kendi kolunu
// boyar; ortak gövde yalnız gövdeden geçen bir kanal tanımlıysa boyanır.
//
// TEK KAYNAK: her ilkel `cbgElements` ile SVG öğe tanımlarına çevrilir; tarayıcıdaki etkileşimli React SVG
// (ConnectionBodygraph.tsx) ve Word'deki sunucu PNG'si (connectionBodygraphSvg → resvg) AYNI tanımları çizer.
// Yazı kalınlığı ince eş renkli konturla verilir (sunucuda yalnız Regular font var → iki çıktı aynı görünür).

import { CHANNELS } from "../engine/channels";
import { APP_CENTER_TO_ENGINE_CENTER } from "../normalize/hdAppCodes";
import {
  CBG_CENTERS,
  CBG_GATE_R,
  CBG_GATES,
  CBG_NET_ARM_OF_GATE,
  CBG_NET_ARMS,
  CBG_NET_CHANNELS,
  CBG_PIPE_EDGE,
  CBG_PIPE_W,
  CBG_PIPES,
} from "./connectionBodygraphGeometry";
import type { CompositeChannelState, CompositeModel, Holder } from "./compositeModel";
import type { ConnectionDynamic, HdConnectionResult } from "./connection";

export type Pt = { x: number; y: number };
export { CBG_GATE_R };

/** Tuval (referans oranı 4:5): V9 ön katmanı (0..440 × 0..650) olduğu gibi; çevresinde silüet ve ışık. */
export const CBG_VIEW = { x: -80, y: -80, width: 602, height: 752 } as const;
export const CBG_VIEWBOX = `${CBG_VIEW.x} ${CBG_VIEW.y} ${CBG_VIEW.width} ${CBG_VIEW.height}`;

export const CBG_PERSON_COLOR = { A: "#2563eb", B: "#f97316" } as const;
export const CBG_DYNAMIC_SHAPE: Readonly<Record<ConnectionDynamic, "diamond" | "triangle" | "square" | "circle">> = {
  Electromagnetic: "diamond",
  Dominance: "triangle",
  Compromise: "square",
  Companionship: "circle",
};

/** Boru dış genişliği: referanstaki belirgin boru (V9 çiziminin 9.8'i yerine; güzergâh aynı). Çakışma testi bu değerle. */
export const CBG_PIPE_FULL = 12.8;
const FULL = CBG_PIPE_FULL;
const BODY_W = 9.8;
const SHINE_W = 3.6;
void CBG_PIPE_EDGE;
void CBG_PIPE_W;
/** Boru tonları: kenar (koyu), gövde, ışık yansıması (orta şerit). */
const TUBE = {
  passive: { edge: "#9ba8cd", body: "#e6eaf5", shine: "#ffffff", shineOpacity: 1 },
  A: { edge: "#0b3aa6", body: "#1f63e6", shine: "#9cc3ff", shineOpacity: 0.95 },
  B: { edge: "#c94a00", body: "#ff7a0f", shine: "#ffd7a8", shineOpacity: 0.95 },
} as const;
const INK = "#1e2a78";
const CENTER_STROKE = "#3346c6";
const GATE_STROKE = "#4a5ed3";

/** Logo: referanstaki gibi sağ üstte, başın yanında. */
export const CBG_LOGO = { x: 396, y: -60, width: 108, height: 81 } as const;

// ── Statik tanımlar (degrade, filtre) — kullanıcı verisi içermez ─────────────────────────────────────────────
export const CBG_DEFS =
  // zemin ışığı
  `<radialGradient id="cbgHalo" cx="0.5" cy="0.45" r="0.6"><stop offset="0" stop-color="#eaf0ff" stop-opacity="0.75"/><stop offset="0.6" stop-color="#f3f6ff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="cbgDot" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#cfdcfb"/><stop offset="1" stop-color="#cfdcfb" stop-opacity="0"/></radialGradient>` +
  // silüet: kenarlarda mavi-lila, merkezde ışıklı
  `<linearGradient id="cbgBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8d3f6"/><stop offset="0.5" stop-color="#d2dcf8"/><stop offset="1" stop-color="#dce4fa"/></linearGradient>` +
  `<radialGradient id="cbgBodyLight" cx="0.5" cy="0.36" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="0.6" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
  `<linearGradient id="cbgBodySide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9eb0ea" stop-opacity="0.55"/><stop offset="0.14" stop-color="#9eb0ea" stop-opacity="0"/><stop offset="0.86" stop-color="#9eb0ea" stop-opacity="0"/><stop offset="1" stop-color="#9eb0ea" stop-opacity="0.55"/></linearGradient>` +
  `<radialGradient id="cbgHead" cx="0.46" cy="0.38" r="0.62"><stop offset="0" stop-color="#e9eefd"/><stop offset="0.7" stop-color="#d1daf7"/><stop offset="1" stop-color="#bfcbf2"/></radialGradient>` +
  `<filter id="cbgSoft" x="-0.05" y="-0.05" width="1.1" height="1.1"><feGaussianBlur stdDeviation="0.9"/></filter>` +
  `<radialGradient id="cbgShoulder" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
  `<filter id="cbgGlow" x="-0.2" y="-0.2" width="1.4" height="1.4"><feGaussianBlur stdDeviation="9"/></filter>` +
  // boru gölgesi + merkez kabartması
  `<filter id="cbgPipeShadow" x="-0.1" y="-0.1" width="1.2" height="1.2"><feGaussianBlur stdDeviation="1.7"/></filter>` +
  `<filter id="cbgLift" x="-0.2" y="-0.2" width="1.4" height="1.4"><feDropShadow dx="0" dy="1.4" stdDeviation="1.6" flood-color="#1e2a78" flood-opacity="0.24"/></filter>` +
  `<linearGradient id="cbgCenterOpen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef1fb"/></linearGradient>` +
  `<linearGradient id="cbgCenterDef" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f3ff"/><stop offset="1" stop-color="#d9e0fd"/></linearGradient>` +
  // parlak kapı dolguları
  `<radialGradient id="cbgGateA" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#9cc2ff"/><stop offset="0.55" stop-color="#2f6cf0"/><stop offset="1" stop-color="#1640b8"/></radialGradient>` +
  `<radialGradient id="cbgGateB" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffd09c"/><stop offset="0.55" stop-color="#f97316"/><stop offset="1" stop-color="#c2410c"/></radialGradient>`;

// ── Silüet (arka katman) — owner'ın referans görselinden ÖLÇÜLDÜ (2026-10-18) ─────────────────────────────────
// Kaynak: "Yaşam Sistemi Enerji Haritası.png" (1122×1402). Referans karesi tuvalle tek ölçekte örtüşür:
// u = 220 + (px − 559.5)·0.5371, v = 22 + (py − 188)·0.5371 (BAŞ tepesi ↔ 22, KÖK tabanı ↔ 631.6). Figürün sol dış
// hattı, omuz üst kenarı (sütun taraması) ve kol–gövde boşluğu pikselden ölçüldü, ölçüm gürültüsü yumuşatıldı, sağ hat
// aynalandı (referans simetrik). Gölgelendirme: kenarda ışık, içte koyu şerit, merkezde açık ton, altta beyaza solma.
// Owner işareti: kol–gövde ayrımı dış hattın açıldığı hizadan (ref y≈1004) başlar. Üretici: scratchpad bg-drafts/v15.ts.
// Ön katmana etkisi YOK (yalnız bu grup).
const BODY =
  "M 220.0 -65.0 C 217.7 -64.6 210.6 -63.3 206.5 -62.4 C 202.4 -61.5 198.6 -60.5 195.4 -59.5 C 192.2 -58.5 189.7 -57.5 187.5 -56.4 C 185.3 -55.4 183.6 -54.3 182.0 -53.2 C 180.3 -52.1 179.0 -51.0 177.7 -50.0 C 176.3 -48.9 175.2 -47.8 174.0 -46.7 C 172.9 -45.7 171.8 -44.6 170.8 -43.5 C 169.8 -42.5 168.9 -41.4 168.0 -40.3 C 167.1 -39.2 166.3 -38.2 165.5 -37.1 C 164.8 -36.0 164.0 -34.9 163.3 -33.9 C 162.6 -32.8 162.0 -31.7 161.3 -30.6 C 160.7 -29.6 160.0 -28.5 159.5 -27.4 C 158.9 -26.3 158.4 -25.3 157.9 -24.2 C 157.4 -23.1 157.0 -22.0 156.5 -21.0 C 156.1 -19.9 155.8 -18.8 155.4 -17.7 C 155.0 -16.7 154.7 -15.6 154.4 -14.5 C 154.1 -13.4 153.8 -12.4 153.5 -11.3 C 153.3 -10.2 153.0 -9.2 152.8 -8.1 C 152.5 -7.0 152.3 -5.9 152.1 -4.9 C 151.9 -3.8 151.7 -2.7 151.6 -1.6 C 151.4 -0.6 151.3 0.5 151.2 1.6 C 151.1 2.7 151.1 3.7 151.0 4.8 C 150.9 5.9 150.9 7.0 150.7 8.0 C 150.6 9.1 150.5 10.2 150.3 11.3 C 150.2 12.3 150.0 13.4 149.8 14.5 C 149.6 15.6 149.5 16.6 149.1 17.7 C 148.8 18.8 148.4 19.9 147.8 20.9 C 147.2 22.0 146.4 23.1 145.6 24.1 C 144.7 25.2 143.5 26.3 142.7 27.4 C 141.9 28.4 141.3 29.5 140.9 30.6 C 140.5 31.7 140.4 32.7 140.4 33.8 C 140.4 34.9 140.7 36.0 141.0 37.0 C 141.2 38.1 141.4 39.2 141.7 40.3 C 141.9 41.3 142.2 42.4 142.5 43.5 C 142.8 44.6 143.0 45.6 143.6 46.7 C 144.3 47.8 145.1 48.9 146.2 49.9 C 147.3 51.0 148.6 52.1 150.0 53.2 C 151.5 54.2 153.5 55.3 154.9 56.4 C 156.3 57.4 157.4 58.5 158.4 59.6 C 159.3 60.7 160.1 61.7 160.7 62.8 C 161.2 63.9 161.4 65.0 161.7 66.0 C 162.1 67.1 162.4 68.2 162.7 69.3 C 163.1 70.3 163.4 71.4 163.7 72.5 C 164.0 73.6 164.3 74.6 164.6 75.7 C 165.0 76.8 165.3 77.9 165.7 78.9 C 166.1 80.0 166.5 81.1 166.9 82.2 C 167.3 83.2 167.7 84.3 168.1 85.4 C 168.5 86.5 168.9 87.5 169.4 88.6 C 169.8 89.7 170.2 90.7 170.7 91.8 C 171.1 92.9 171.7 94.0 172.0 95.0 C 172.4 96.1 172.7 97.2 172.8 98.3 C 173.0 99.3 173.0 100.4 172.8 101.5 C 172.7 102.6 172.3 103.6 172.0 104.7 C 171.8 105.8 171.5 106.9 171.3 107.9 C 171.2 109.0 171.0 110.1 171.0 111.2 C 170.9 112.2 171.0 113.3 171.0 114.4 C 171.1 115.5 171.2 116.5 171.2 117.6 C 171.3 118.7 171.3 119.8 171.3 120.8 C 171.4 121.9 171.4 123.0 171.4 124.0 C 171.4 125.1 171.4 126.2 171.4 127.3 C 171.4 128.3 171.4 129.4 171.4 130.5 C 171.4 131.6 171.4 132.6 171.4 133.7 C 171.4 134.8 171.4 135.9 171.3 136.9 C 171.3 138.0 171.3 139.1 171.2 140.2 C 171.2 141.2 171.1 142.3 171.0 143.4 C 170.9 144.5 170.9 145.6 170.7 146.6 C 170.4 147.6 170.1 148.7 169.4 149.5 C 168.6 150.4 167.6 151.2 166.2 151.9 C 164.8 152.5 163.9 152.1 161.2 153.6 C 158.5 155.1 152.0 159.5 149.8 161.0 C 147.6 162.4 148.5 161.7 147.8 162.1 C 147.1 162.5 146.8 162.6 145.7 163.2 C 144.5 163.9 142.3 165.2 140.8 166.0 C 139.3 166.8 138.1 167.3 136.5 168.1 C 135.0 168.8 133.3 169.6 131.5 170.4 C 129.7 171.2 127.6 172.1 125.6 173.0 C 123.5 173.9 121.4 174.8 119.1 175.7 C 116.9 176.6 114.5 177.5 112.1 178.4 C 109.6 179.4 107.1 180.3 104.5 181.3 C 101.9 182.3 99.3 183.2 96.6 184.2 C 94.0 185.2 91.3 186.2 88.6 187.2 C 86.0 188.1 83.3 189.1 80.7 190.1 C 78.1 191.1 75.5 192.0 73.1 193.0 C 70.6 194.0 68.2 195.0 65.8 196.0 C 63.5 197.0 61.3 198.0 59.1 199.1 C 57.0 200.1 54.9 201.2 52.9 202.3 C 51.0 203.4 49.1 204.6 47.3 205.8 C 45.5 207.0 43.8 208.3 42.1 209.7 C 40.5 211.1 38.9 212.6 37.4 214.2 C 35.9 215.8 34.4 217.5 33.0 219.3 C 31.6 221.1 30.3 223.0 29.0 225.1 C 27.7 227.1 26.4 229.3 25.2 231.5 C 24.0 233.8 22.9 236.1 21.8 238.6 C 20.8 241.0 19.8 243.5 18.8 246.1 C 17.9 248.6 17.0 251.2 16.2 253.8 C 15.4 256.5 14.7 259.1 14.1 261.7 C 13.4 264.3 12.9 266.9 12.4 269.4 C 11.9 271.9 11.5 274.4 11.2 276.8 C 10.9 279.2 10.6 281.5 10.4 283.8 C 10.2 286.0 10.1 288.2 10.0 290.3 C 9.9 292.3 9.8 294.3 9.8 296.2 C 9.8 298.1 9.9 299.9 9.9 301.7 C 10.0 303.5 10.1 305.1 10.1 306.8 C 10.2 308.4 10.3 310.0 10.4 311.6 C 10.5 313.1 10.7 314.6 10.8 316.1 C 10.9 317.6 10.9 319.1 11.0 320.6 C 11.1 322.0 11.2 323.5 11.2 324.9 C 11.3 326.4 11.3 327.8 11.3 329.2 C 11.4 330.7 11.4 332.1 11.3 333.5 C 11.3 335.0 11.3 336.4 11.2 337.8 C 11.2 339.2 11.1 340.7 11.0 342.1 C 10.9 343.5 10.8 345.0 10.7 346.4 C 10.6 347.8 10.5 349.3 10.3 350.7 C 10.2 352.1 10.0 353.6 9.8 355.0 C 9.7 356.4 9.5 357.9 9.3 359.3 C 9.1 360.7 8.9 362.2 8.7 363.6 C 8.5 365.0 8.3 366.5 8.1 367.9 C 7.8 369.3 7.6 370.8 7.4 372.2 C 7.2 373.6 7.0 375.1 6.7 376.5 C 6.5 377.9 6.3 379.4 6.1 380.8 C 5.8 382.2 5.6 383.6 5.4 385.1 C 5.2 386.5 5.0 387.9 4.8 389.4 C 4.6 390.8 4.4 392.2 4.2 393.7 C 4.0 395.1 3.9 396.5 3.7 398.0 C 3.5 399.4 3.4 400.8 3.2 402.3 C 3.1 403.7 3.0 405.1 2.9 406.6 C 2.8 408.0 2.7 409.4 2.6 410.9 C 2.5 412.3 2.5 413.7 2.4 415.2 C 2.4 416.6 2.3 418.0 2.3 419.5 C 2.3 420.9 2.3 422.3 2.4 423.8 C 2.4 425.2 2.4 426.6 2.5 428.0 C 2.5 429.5 2.6 430.9 2.6 432.3 C 2.7 433.8 2.7 435.2 2.8 436.6 C 2.8 438.1 2.9 439.5 2.9 440.9 C 2.9 442.4 2.9 443.8 2.9 445.2 C 2.8 446.7 2.8 448.1 2.7 449.5 C 2.5 451.0 2.4 452.4 2.2 453.8 C 2.0 455.3 1.7 456.7 1.4 458.1 C 1.1 459.6 0.8 461.0 0.3 462.4 C -0.1 463.9 -0.6 465.3 -1.1 466.7 C -1.6 468.2 -2.2 469.6 -2.9 471.0 C -3.5 472.4 -4.2 473.9 -4.9 475.3 C -5.6 476.7 -6.4 478.2 -7.1 479.6 C -7.9 481.0 -8.7 482.5 -9.4 483.9 C -10.2 485.3 -11.0 486.8 -11.8 488.2 C -12.5 489.6 -13.3 491.1 -14.0 492.5 C -14.8 493.9 -15.5 495.4 -16.2 496.8 C -16.9 498.2 -17.5 499.7 -18.1 501.1 C -18.8 502.5 -19.4 504.0 -19.9 505.4 C -20.5 506.8 -21.0 508.3 -21.5 509.7 C -22.0 511.1 -22.4 512.6 -22.9 514.0 C -23.3 515.4 -23.7 516.8 -24.1 518.3 C -24.4 519.7 -24.8 521.1 -25.1 522.6 C -25.4 524.0 -25.7 525.4 -26.0 526.9 C -26.3 528.3 -26.6 529.7 -26.8 531.2 C -27.1 532.6 -27.3 534.0 -27.5 535.5 C -27.8 536.9 -28.0 538.3 -28.2 539.8 C -28.4 541.2 -28.6 542.6 -28.8 544.1 C -28.9 545.5 -29.1 546.9 -29.3 548.4 C -29.5 549.8 -29.6 551.2 -29.8 552.7 C -30.0 554.1 -30.1 555.5 -30.3 557.0 C -30.5 558.4 -30.6 559.8 -30.8 561.2 C -30.9 562.7 -31.1 564.1 -31.3 565.6 C -31.4 567.0 -31.6 568.4 -31.7 569.9 C -31.9 571.3 -32.1 572.8 -32.3 574.2 C -32.4 575.7 -32.6 577.2 -32.8 578.6 C -33.0 580.1 -33.2 581.6 -33.3 583.1 C -33.5 584.6 -33.7 586.0 -33.9 587.6 C -34.1 589.2 -34.3 591.0 -34.5 592.6 C -34.7 594.2 -34.9 595.8 -35.1 597.4 C -35.3 599.0 -35.4 600.0 -35.6 602.0 C -35.9 604.0 -36.3 607.9 -36.5 609.6 C -36.7 611.4 -36.7 611.5 -36.8 612.5 C -36.9 613.5 -36.7 611.0 -37.1 615.7 C -37.6 620.4 -38.7 631.0 -39.7 640.7 C -40.6 650.5 -44.3 668.5 -42.9 674.0 C -41.5 679.6 -35.0 680.3 -31.1 674.0 C -27.2 667.8 -21.6 643.5 -19.3 636.4 C -17.1 629.4 -18.2 633.2 -17.7 631.7 C -17.2 630.2 -17.0 630.0 -16.1 627.4 C -15.2 624.7 -13.3 619.0 -12.2 615.9 C -11.1 612.9 -10.4 611.4 -9.5 609.0 C -8.5 606.7 -7.6 604.3 -6.6 601.9 C -5.6 599.4 -4.5 596.7 -3.5 594.4 C -2.4 592.0 -1.5 589.8 -0.5 587.6 C 0.5 585.3 1.5 583.1 2.5 580.8 C 3.5 578.6 4.4 576.3 5.4 574.1 C 6.3 571.8 7.3 569.6 8.1 567.3 C 9.0 565.0 9.9 562.8 10.7 560.4 C 11.5 558.1 12.3 555.8 13.0 553.3 C 13.7 550.9 14.4 548.5 15.0 546.0 C 15.6 543.6 16.1 541.2 16.5 538.5 C 16.9 535.9 17.2 533.0 17.4 530.4 C 17.6 527.7 17.8 525.1 17.9 522.5 C 18.0 520.0 18.2 518.2 17.9 515.0 C 17.7 511.9 16.7 506.4 16.4 503.8 C 16.1 501.1 16.2 500.8 16.0 499.2 C 15.9 497.7 16.9 501.0 15.4 494.5 C 13.9 488.0 5.4 460.6 7.0 460.3 C 8.7 459.9 21.7 486.3 25.1 492.5 C 28.5 498.6 26.6 495.5 27.2 497.0 C 27.9 498.4 27.9 498.8 29.1 501.3 C 30.3 503.8 32.9 509.0 34.2 512.0 C 35.5 515.0 35.9 516.7 36.8 519.2 C 37.6 521.6 38.4 524.1 39.1 526.7 C 39.9 529.3 40.7 532.1 41.2 534.6 C 41.8 537.2 42.2 539.5 42.5 542.0 C 42.8 544.4 43.1 546.8 43.2 549.2 C 43.3 551.5 43.4 553.9 43.3 556.2 C 43.3 558.5 43.1 560.7 42.9 563.0 C 42.7 565.2 42.4 567.5 42.0 569.7 C 41.7 571.9 41.3 574.1 40.8 576.3 C 40.4 578.5 39.9 580.8 39.4 583.0 C 38.9 585.2 38.3 587.5 37.8 589.7 C 37.3 591.9 36.8 594.1 36.3 596.4 C 35.8 598.8 35.3 601.4 34.9 603.8 C 34.4 606.2 34.0 608.6 33.6 610.9 C 33.2 613.2 32.9 614.7 32.6 617.7 C 32.3 620.7 31.9 626.3 31.7 628.8 C 31.4 631.4 31.4 631.6 31.2 633.1 C 31.1 634.6 31.1 630.8 30.8 637.7 C 30.6 644.5 -1.9 668.0 29.6 674.0 C 61.1 680.1 156.5 674.0 220.0 674.0 C 283.5 674.0 378.9 680.1 410.4 674.0 C 441.9 668.0 409.4 644.5 409.2 637.7 C 408.9 630.8 408.9 634.6 408.8 633.1 C 408.6 631.6 408.6 631.4 408.3 628.8 C 408.1 626.3 407.7 620.7 407.4 617.7 C 407.1 614.7 406.8 613.2 406.4 610.9 C 406.0 608.6 405.6 606.2 405.1 603.8 C 404.7 601.4 404.2 598.8 403.7 596.4 C 403.2 594.1 402.7 591.9 402.2 589.7 C 401.7 587.5 401.1 585.2 400.6 583.0 C 400.1 580.8 399.6 578.5 399.2 576.3 C 398.7 574.1 398.3 571.9 398.0 569.7 C 397.6 567.5 397.3 565.2 397.1 563.0 C 396.9 560.7 396.7 558.5 396.7 556.2 C 396.6 553.9 396.7 551.5 396.8 549.2 C 396.9 546.8 397.2 544.4 397.5 542.0 C 397.8 539.5 398.2 537.2 398.8 534.6 C 399.3 532.1 400.1 529.3 400.9 526.7 C 401.6 524.1 402.4 521.6 403.2 519.2 C 404.1 516.7 404.5 515.0 405.8 512.0 C 407.1 509.0 409.7 503.8 410.9 501.3 C 412.1 498.8 412.1 498.4 412.8 497.0 C 413.4 495.5 411.5 498.6 414.9 492.5 C 418.3 486.3 431.3 459.9 433.0 460.3 C 434.6 460.6 426.1 488.0 424.6 494.5 C 423.1 501.0 424.1 497.7 424.0 499.2 C 423.8 500.8 423.9 501.1 423.6 503.8 C 423.3 506.4 422.3 511.9 422.1 515.0 C 421.8 518.2 422.0 520.0 422.1 522.5 C 422.2 525.1 422.4 527.7 422.6 530.4 C 422.8 533.0 423.1 535.9 423.5 538.5 C 423.9 541.2 424.4 543.6 425.0 546.0 C 425.6 548.5 426.3 550.9 427.0 553.3 C 427.7 555.8 428.5 558.1 429.3 560.4 C 430.1 562.8 431.0 565.0 431.9 567.3 C 432.7 569.6 433.7 571.8 434.6 574.1 C 435.6 576.3 436.5 578.6 437.5 580.8 C 438.5 583.1 439.5 585.3 440.5 587.6 C 441.5 589.8 442.4 592.0 443.5 594.4 C 444.5 596.7 445.6 599.4 446.6 601.9 C 447.6 604.3 448.5 606.7 449.5 609.0 C 450.4 611.4 451.1 612.9 452.2 615.9 C 453.3 619.0 455.2 624.7 456.1 627.4 C 457.0 630.0 457.2 630.2 457.7 631.7 C 458.2 633.2 457.1 629.4 459.3 636.4 C 461.6 643.5 467.2 667.8 471.1 674.0 C 475.0 680.3 481.5 679.6 482.9 674.0 C 484.3 668.5 480.6 650.5 479.7 640.7 C 478.7 631.0 477.6 620.4 477.1 615.7 C 476.7 611.0 476.9 613.5 476.8 612.5 C 476.7 611.5 476.7 611.4 476.5 609.6 C 476.3 607.9 475.9 604.0 475.6 602.0 C 475.4 600.0 475.3 599.0 475.1 597.4 C 474.9 595.8 474.7 594.2 474.5 592.6 C 474.3 591.0 474.1 589.2 473.9 587.6 C 473.7 586.0 473.5 584.6 473.3 583.1 C 473.2 581.6 473.0 580.1 472.8 578.6 C 472.6 577.2 472.4 575.7 472.3 574.2 C 472.1 572.8 471.9 571.3 471.7 569.9 C 471.6 568.4 471.4 567.0 471.3 565.6 C 471.1 564.1 470.9 562.7 470.8 561.2 C 470.6 559.8 470.5 558.4 470.3 557.0 C 470.1 555.5 470.0 554.1 469.8 552.7 C 469.6 551.2 469.5 549.8 469.3 548.4 C 469.1 546.9 468.9 545.5 468.8 544.1 C 468.6 542.6 468.4 541.2 468.2 539.8 C 468.0 538.3 467.8 536.9 467.5 535.5 C 467.3 534.0 467.1 532.6 466.8 531.2 C 466.6 529.7 466.3 528.3 466.0 526.9 C 465.7 525.4 465.4 524.0 465.1 522.6 C 464.8 521.1 464.4 519.7 464.1 518.3 C 463.7 516.8 463.3 515.4 462.9 514.0 C 462.4 512.6 462.0 511.1 461.5 509.7 C 461.0 508.3 460.5 506.8 459.9 505.4 C 459.4 504.0 458.8 502.5 458.1 501.1 C 457.5 499.7 456.9 498.2 456.2 496.8 C 455.5 495.4 454.8 493.9 454.0 492.5 C 453.3 491.1 452.5 489.6 451.8 488.2 C 451.0 486.8 450.2 485.3 449.4 483.9 C 448.7 482.5 447.9 481.0 447.1 479.6 C 446.4 478.2 445.6 476.7 444.9 475.3 C 444.2 473.9 443.5 472.4 442.9 471.0 C 442.2 469.6 441.6 468.2 441.1 466.7 C 440.6 465.3 440.1 463.9 439.7 462.4 C 439.2 461.0 438.9 459.6 438.6 458.1 C 438.3 456.7 438.0 455.3 437.8 453.8 C 437.6 452.4 437.5 451.0 437.3 449.5 C 437.2 448.1 437.2 446.7 437.1 445.2 C 437.1 443.8 437.1 442.4 437.1 440.9 C 437.1 439.5 437.2 438.1 437.2 436.6 C 437.3 435.2 437.3 433.8 437.4 432.3 C 437.4 430.9 437.5 429.5 437.5 428.0 C 437.6 426.6 437.6 425.2 437.6 423.8 C 437.7 422.3 437.7 420.9 437.7 419.5 C 437.7 418.0 437.6 416.6 437.6 415.2 C 437.5 413.7 437.5 412.3 437.4 410.9 C 437.3 409.4 437.2 408.0 437.1 406.6 C 437.0 405.1 436.9 403.7 436.8 402.3 C 436.6 400.8 436.5 399.4 436.3 398.0 C 436.1 396.5 436.0 395.1 435.8 393.7 C 435.6 392.2 435.4 390.8 435.2 389.4 C 435.0 387.9 434.8 386.5 434.6 385.1 C 434.4 383.6 434.2 382.2 433.9 380.8 C 433.7 379.4 433.5 377.9 433.3 376.5 C 433.0 375.1 432.8 373.6 432.6 372.2 C 432.4 370.8 432.2 369.3 431.9 367.9 C 431.7 366.5 431.5 365.0 431.3 363.6 C 431.1 362.2 430.9 360.7 430.7 359.3 C 430.5 357.9 430.3 356.4 430.2 355.0 C 430.0 353.6 429.8 352.1 429.7 350.7 C 429.5 349.3 429.4 347.8 429.3 346.4 C 429.2 345.0 429.1 343.5 429.0 342.1 C 428.9 340.7 428.8 339.2 428.8 337.8 C 428.7 336.4 428.7 335.0 428.7 333.5 C 428.6 332.1 428.6 330.7 428.7 329.2 C 428.7 327.8 428.7 326.4 428.8 324.9 C 428.8 323.5 428.9 322.0 429.0 320.6 C 429.1 319.1 429.1 317.6 429.2 316.1 C 429.3 314.6 429.5 313.1 429.6 311.6 C 429.7 310.0 429.8 308.4 429.9 306.8 C 429.9 305.1 430.0 303.5 430.1 301.7 C 430.1 299.9 430.2 298.1 430.2 296.2 C 430.2 294.3 430.1 292.3 430.0 290.3 C 429.9 288.2 429.8 286.0 429.6 283.8 C 429.4 281.5 429.1 279.2 428.8 276.8 C 428.5 274.4 428.1 271.9 427.6 269.4 C 427.1 266.9 426.6 264.3 425.9 261.7 C 425.3 259.1 424.6 256.5 423.8 253.8 C 423.0 251.2 422.1 248.6 421.2 246.1 C 420.2 243.5 419.2 241.0 418.2 238.6 C 417.1 236.1 416.0 233.8 414.8 231.5 C 413.6 229.3 412.3 227.1 411.0 225.1 C 409.7 223.0 408.4 221.1 407.0 219.3 C 405.6 217.5 404.1 215.8 402.6 214.2 C 401.1 212.6 399.5 211.1 397.9 209.7 C 396.2 208.3 394.5 207.0 392.7 205.8 C 390.9 204.6 389.0 203.4 387.1 202.3 C 385.1 201.2 383.0 200.1 380.9 199.1 C 378.7 198.0 376.5 197.0 374.2 196.0 C 371.8 195.0 369.4 194.0 366.9 193.0 C 364.5 192.0 361.9 191.1 359.3 190.1 C 356.7 189.1 354.0 188.1 351.4 187.2 C 348.7 186.2 346.0 185.2 343.4 184.2 C 340.7 183.2 338.1 182.3 335.5 181.3 C 332.9 180.3 330.4 179.4 327.9 178.4 C 325.5 177.5 323.1 176.6 320.9 175.7 C 318.6 174.8 316.5 173.9 314.4 173.0 C 312.4 172.1 310.3 171.2 308.5 170.4 C 306.7 169.6 305.0 168.8 303.5 168.1 C 301.9 167.3 300.7 166.8 299.2 166.0 C 297.7 165.2 295.5 163.9 294.3 163.2 C 293.2 162.6 292.9 162.5 292.2 162.1 C 291.5 161.7 292.4 162.4 290.2 161.0 C 288.0 159.5 281.5 155.1 278.8 153.6 C 276.1 152.1 275.2 152.5 273.8 151.9 C 272.4 151.2 271.4 150.4 270.6 149.5 C 269.9 148.7 269.6 147.6 269.3 146.6 C 269.1 145.6 269.1 144.5 269.0 143.4 C 268.9 142.3 268.8 141.2 268.8 140.2 C 268.7 139.1 268.7 138.0 268.7 136.9 C 268.6 135.9 268.6 134.8 268.6 133.7 C 268.6 132.6 268.6 131.6 268.6 130.5 C 268.6 129.4 268.6 128.3 268.6 127.3 C 268.6 126.2 268.6 125.1 268.6 124.0 C 268.6 123.0 268.6 121.9 268.7 120.8 C 268.7 119.8 268.7 118.7 268.8 117.6 C 268.8 116.5 268.9 115.5 269.0 114.4 C 269.0 113.3 269.1 112.2 269.0 111.2 C 269.0 110.1 268.8 109.0 268.7 107.9 C 268.5 106.9 268.2 105.8 268.0 104.7 C 267.7 103.6 267.3 102.6 267.2 101.5 C 267.0 100.4 267.0 99.3 267.2 98.3 C 267.3 97.2 267.6 96.1 268.0 95.0 C 268.3 94.0 268.9 92.9 269.3 91.8 C 269.8 90.7 270.2 89.7 270.6 88.6 C 271.1 87.5 271.5 86.5 271.9 85.4 C 272.3 84.3 272.7 83.2 273.1 82.2 C 273.5 81.1 273.9 80.0 274.3 78.9 C 274.7 77.9 275.0 76.8 275.4 75.7 C 275.7 74.6 276.0 73.6 276.3 72.5 C 276.6 71.4 276.9 70.3 277.3 69.3 C 277.6 68.2 277.9 67.1 278.3 66.0 C 278.6 65.0 278.8 63.9 279.3 62.8 C 279.9 61.7 280.7 60.7 281.6 59.6 C 282.6 58.5 283.7 57.4 285.1 56.4 C 286.5 55.3 288.5 54.2 290.0 53.2 C 291.4 52.1 292.7 51.0 293.8 49.9 C 294.9 48.9 295.7 47.8 296.4 46.7 C 297.0 45.6 297.2 44.6 297.5 43.5 C 297.8 42.4 298.1 41.3 298.3 40.3 C 298.6 39.2 298.8 38.1 299.0 37.0 C 299.3 36.0 299.6 34.9 299.6 33.8 C 299.6 32.7 299.5 31.7 299.1 30.6 C 298.7 29.5 298.1 28.4 297.3 27.4 C 296.5 26.3 295.3 25.2 294.4 24.1 C 293.6 23.1 292.8 22.0 292.2 20.9 C 291.6 19.9 291.2 18.8 290.9 17.7 C 290.5 16.6 290.4 15.6 290.2 14.5 C 290.0 13.4 289.8 12.3 289.7 11.3 C 289.5 10.2 289.4 9.1 289.3 8.0 C 289.1 7.0 289.1 5.9 289.0 4.8 C 288.9 3.7 288.9 2.7 288.8 1.6 C 288.7 0.5 288.6 -0.6 288.4 -1.6 C 288.3 -2.7 288.1 -3.8 287.9 -4.9 C 287.7 -5.9 287.5 -7.0 287.2 -8.1 C 287.0 -9.2 286.7 -10.2 286.5 -11.3 C 286.2 -12.4 285.9 -13.4 285.6 -14.5 C 285.3 -15.6 285.0 -16.7 284.6 -17.7 C 284.2 -18.8 283.9 -19.9 283.5 -21.0 C 283.0 -22.0 282.6 -23.1 282.1 -24.2 C 281.6 -25.3 281.1 -26.3 280.5 -27.4 C 280.0 -28.5 279.3 -29.6 278.7 -30.6 C 278.0 -31.7 277.4 -32.8 276.7 -33.9 C 276.0 -34.9 275.2 -36.0 274.5 -37.1 C 273.7 -38.2 272.9 -39.2 272.0 -40.3 C 271.1 -41.4 270.2 -42.5 269.2 -43.5 C 268.2 -44.6 267.1 -45.7 266.0 -46.7 C 264.8 -47.8 263.7 -48.9 262.3 -50.0 C 261.0 -51.0 259.7 -52.1 258.0 -53.2 C 256.4 -54.3 254.7 -55.4 252.5 -56.4 C 250.3 -57.5 247.8 -58.5 244.6 -59.5 C 241.4 -60.5 237.6 -61.5 233.5 -62.4 C 229.4 -63.3 222.3 -64.6 220.0 -65.0 Z";

export const CBG_SILHOUETTE_MARKUP =
  `<g data-cbg-silhouette=""><defs><clipPath id="sRclip"><path d="${BODY}"/></clipPath><linearGradient id="sR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d5dffa"/><stop offset="0.45" stop-color="#d0dbf8"/><stop offset="1" stop-color="#d8e1fa"/></linearGradient><radialGradient id="sRl" cx="0.5" cy="0.42" r="0.45"><stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient><linearGradient id="sRfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.92"/></linearGradient><filter id="sRb" x="-0.1" y="-0.1" width="1.2" height="1.2"><feGaussianBlur stdDeviation="9"/></filter><filter id="sRs" x="-0.05" y="-0.05" width="1.1" height="1.1"><feGaussianBlur stdDeviation="1"/></filter><filter id="sRg" x="-0.2" y="-0.2" width="1.4" height="1.4"><feGaussianBlur stdDeviation="10"/></filter></defs><g filter="url(#sRg)" opacity="0.5"><path d="${BODY}" fill="none" stroke="#c3d0f6" stroke-width="14"/></g><g filter="url(#sRs)"><path d="${BODY}" fill="url(#sR)"/><g clip-path="url(#sRclip)"><g filter="url(#sRb)"><path d="${BODY}" fill="none" stroke="#b2c2f0" stroke-width="40" stroke-opacity="0.55"/></g><path d="${BODY}" fill="url(#sRl)"/></g><path d="${BODY}" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-opacity="0.7"/></g><rect x="-80" y="628" width="602" height="52" fill="url(#sRfade)"/></g>`;

/** Zemin: ışık halesi + ince yörünge halkaları ve noktalar (referanstaki derinlik). */
const ORBIT_C = { x: 220, y: 300 };
const ORBIT_R = [258, 292];
const ORBIT_DOTS: Array<[number, number]> = [[0, 198], [0, 342], [1, 222], [1, 318], [0, 262], [0, 278]];
export const CBG_BACKDROP_MARKUP =
  `<g data-cbg-backdrop="">` +
  `<ellipse cx="220" cy="300" rx="380" ry="420" fill="url(#cbgHalo)"/>` +
  ORBIT_R.map((r, i) => `<circle cx="${ORBIT_C.x}" cy="${ORBIT_C.y}" r="${r}" fill="none" stroke="#d6e0f8" stroke-width="${i ? 0.6 : 0.9}" stroke-opacity="0.9"/>`).join("") +
  ORBIT_DOTS.map(([ri, deg]) => {
    const a = (deg * Math.PI) / 180;
    const x = (ORBIT_C.x + ORBIT_R[ri] * Math.cos(a)).toFixed(1);
    const y = (ORBIT_C.y + ORBIT_R[ri] * Math.sin(a)).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="7" fill="url(#cbgDot)"/><circle cx="${x}" cy="${y}" r="2.6" fill="#e6edfd" stroke="#c4d2f6" stroke-width="0.6"/>`;
  }).join("") +
  `</g>`;

// ── Sahne ilkelleri ─────────────────────────────────────────────────────────────────────────────────────
export type Tone = "passive" | "A" | "B";
export type CbgPrim =
  | { k: "rect" }
  | { k: "backdrop" }
  | { k: "silhouette" }
  | { k: "shadows"; routes: string[] }
  | { k: "pipe"; points: string; part: "edge" | "body" | "shine"; cap: "butt" | "round" }
  | { k: "fill"; points: string; tone: "A" | "B"; stripe?: boolean; chs: string[] }
  | { k: "tick"; points: string; chs: string[] }
  | { k: "slot" }
  | { k: "marker"; d: string; ch: string; shape: "diamond" | "triangle" | "square" | "circle" }
  | { k: "center"; engine: string; points: string; defined: boolean }
  | { k: "text"; x: number; y: number; text: string; size: number; fill: string; spacing?: number; stroke: number; role: "center" | "gate" }
  | { k: "gate"; gate: number; x: number; y: number; holder: Holder | null }
  | { k: "logo" };

/** Grafiğe giren durum (kayıtlı sonuçtan; uydurma yok). */
export type CbgState = {
  gates: Record<number, Holder | null>;
  channels: Record<string, CompositeChannelState>;
  definedCenters: Set<string>;
  /** Yarım kanal / kişilerin tüm kapıları biliniyor mu (kaynak bireysel veri)? */
  full: boolean;
};

/** Tam model (kayıtlı bireysel kapılar + kayıtlı sonuç, birebir doğrulanmış). */
export function cbgStateFromModel(m: CompositeModel): CbgState {
  return {
    gates: m.gates,
    channels: m.channels,
    definedCenters: new Set(m.centers.filter((c) => c.defined).map((c) => APP_CENTER_TO_ENGINE_CENTER[c.code])),
    full: true,
  };
}

/** Yalnız kayıtlı sonuç (bireysel kaynak yoksa): tanımlı kanallar ve kapıları; yarım kanal bilinmez → çizilmez. */
export function cbgStateFromResult(r: HdConnectionResult): CbgState {
  const gates: Record<number, Holder | null> = {};
  for (let g = 1; g <= 64; g++) gates[g] = null;
  const merge = (cur: Holder | null, h: Holder): Holder => (!cur || cur === h ? h : "both");
  const channels: Record<string, CompositeChannelState> = {};
  for (const ch of CHANNELS) channels[ch.id] = { id: ch.id, state: "none" };
  for (const c of r.channels) {
    const lo = Math.min(c.gateA, c.gateB);
    const hi = Math.max(c.gateA, c.gateB);
    const h = (g: number): Holder | null => {
      const a = c.personAGates.includes(g);
      const b = c.personBGates.includes(g);
      return a && b ? "both" : a ? "A" : b ? "B" : null;
    };
    for (const g of [lo, hi]) {
      const x = h(g);
      if (x) gates[g] = x === "both" ? "both" : merge(gates[g], x);
    }
    const hA = h(lo);
    const hB = h(hi);
    if (hA && hB) channels[c.id] = { id: c.id, state: "defined", dynamic: c.dynamic, holderA: hA, holderB: hB, personAGates: [...c.personAGates], personBGates: [...c.personBGates] };
  }
  return {
    gates,
    channels,
    definedCenters: new Set(r.centers.filter((c) => c.defined).map((c) => APP_CENTER_TO_ENGINE_CENTER[c.code])),
    full: false,
  };
}

// ── Geometri yardımcıları ───────────────────────────────────────────────────────────────────────────────
const parse = (s: string): Pt[] => s.split(" ").map((q) => {
  const [x, y] = q.split(",");
  return { x: Number(x), y: Number(y) };
});
const f2 = (n: number) => n.toFixed(2);
const fmt = (p: Pt[]) => p.map((q) => `${f2(q.x)},${f2(q.y)}`).join(" ");
const plen = (p: Pt[]) => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return s;
};
function pointAt(p: Pt[], d: number): Pt {
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    const s = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (acc + s >= d) {
      const t = s ? (d - acc) / s : 0;
      return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * t, y: p[i - 1].y + (p[i].y - p[i - 1].y) * t };
    }
    acc += s;
  }
  return p[p.length - 1];
}
/** Yay uzunluğu aralığı [a, b] (ortak uç noktalar dahil). */
function slice(p: Pt[], a: number, b: number): Pt[] {
  const out: Pt[] = [pointAt(p, a)];
  let acc = 0;
  for (let i = 1; i < p.length; i++) {
    acc += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    if (acc > a && acc < b) out.push(p[i]);
  }
  out.push(pointAt(p, b));
  return out;
}
/** Yay uzunluğunun ortasından ikiye böl (ortak orta nokta iki yarıda da var). */
function splitHalf(p: Pt[]): [Pt[], Pt[], Pt] {
  const L = plen(p);
  return [slice(p, 0, L / 2), slice(p, L / 2, L), pointAt(p, L / 2)];
}
const join = (...parts: Pt[][]) =>
  parts.reduce<Pt[]>((acc, part) => {
    for (const q of part) {
      const l = acc.at(-1);
      if (!l || Math.hypot(q.x - l.x, q.y - l.y) > 1e-6) acc.push(q);
    }
    return acc;
  }, []);

const PIPE_PTS = new Map(CBG_PIPES.map(([id, s]) => [id, parse(s)]));
const ARM_PTS = new Map(CBG_NET_ARMS.map(([id, s]) => [id as string, parse(s)]));
const GATE_PT = new Map(CBG_GATES.map(([g, x, y]) => [g, { x, y }]));
const rev = (p: Pt[]) => [...p].reverse();

/** Kanalın tam güzergâhı (küçük kapı → büyük kapı). Etkileşim yüzeyi ve işaret konumu için. */
export function cbgChannelRoute(id: string): Pt[] {
  const p = PIPE_PTS.get(id);
  if (p) return p;
  const arms = CBG_NET_CHANNELS[id];
  if (!arms) return [];
  const [lo] = id.split("-").map(Number);
  // V9 ile aynı birleştirme: kollar düğüme doğru, gövde M→J; yön küçük kapıdan başlayacak biçimde düzeltilir.
  const seq = id === "10-20" ? [ARM_PTS.get("kol10")!, rev(ARM_PTS.get("kol20")!)] : id === "34-57" ? [rev(ARM_PTS.get("kol34")!), ARM_PTS.get("kol57")!] : arms.map((a) => ARM_PTS.get(a)!);
  const route = join(...seq);
  const start = GATE_PT.get(lo)!;
  return Math.hypot(route[0].x - start.x, route[0].y - start.y) > 0.01 ? rev(route) : route;
}
export const CBG_CHANNEL_IDS: readonly string[] = CHANNELS.map((c) => c.id);

const MARKER_GAP = 14;
const MARKER_GATE_GAP = CBG_GATE_R + 7;
/** Ortaya en yakın, başka işarete / kapıya çakışmayan konum (yoksa en ferah aday). */
function markerSpot(route: Pt[], placed: Pt[], gates: Pt[]): Pt {
  const L = plen(route);
  let best: Pt = pointAt(route, L / 2);
  let bestScore = -Infinity;
  for (const t of [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68, 0.26, 0.74, 0.2, 0.8]) {
    const q = pointAt(route, L * t);
    const dm = Math.min(Infinity, ...placed.map((p) => Math.hypot(p.x - q.x, p.y - q.y)));
    const dg = Math.min(...gates.map((p) => Math.hypot(p.x - q.x, p.y - q.y)));
    if (dm >= MARKER_GAP && dg >= MARKER_GATE_GAP) return q;
    const score = Math.min(dm / MARKER_GAP, dg / MARKER_GATE_GAP);
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  return best;
}

function markerPath(shape: "diamond" | "triangle" | "square" | "circle", x: number, y: number, s = 4.6): string {
  const n = (v: number) => +v.toFixed(2);
  switch (shape) {
    case "diamond": return `M ${n(x)} ${n(y - s)} L ${n(x + s)} ${n(y)} L ${n(x)} ${n(y + s)} L ${n(x - s)} ${n(y)} Z`;
    case "triangle": return `M ${n(x)} ${n(y - s)} L ${n(x + s)} ${n(y + s * 0.8)} L ${n(x - s)} ${n(y + s * 0.8)} Z`;
    case "square": { const q = s * 0.8; return `M ${n(x - q)} ${n(y - q)} H ${n(x + q)} V ${n(y + q)} H ${n(x - q)} Z`; }
    default: { const r = s * 0.85; return `M ${n(x - r)} ${n(y)} A ${n(r)} ${n(r)} 0 1 0 ${n(x + r)} ${n(y)} A ${n(r)} ${n(r)} 0 1 0 ${n(x - r)} ${n(y)} Z`; }
  }
}

/** Bir kanal yarısını kişi rengine boyayan dolgu(lar). Ortak kapı: mavi boru + turuncu şeritler. */
function fills(points: Pt[], h: Holder, chs: string[]): CbgPrim[] {
  const s = fmt(points);
  if (h === "both") return [{ k: "fill", points: s, tone: "A", chs }, { k: "fill", points: s, tone: "B", stripe: true, chs }];
  return [{ k: "fill", points: s, tone: h, chs }];
}

function halfHolders(st: CompositeChannelState): [Holder | null, Holder | null] {
  if (st.state === "defined" || st.state === "half") return [st.holderA, st.holderB];
  return [null, null];
}

const TICK_HALF = 1.1;

export function buildConnectionBodygraphScene(state: CbgState): CbgPrim[] {
  const out: CbgPrim[] = [{ k: "rect" }, { k: "backdrop" }, { k: "silhouette" }];
  // Boru gölgesi (tüm kanallar, tek katman)
  out.push({ k: "shadows", routes: [...CBG_PIPES.map(([, s]) => s), ...CBG_NET_ARMS.map(([, s]) => s)] });
  const pipe = (s: string): CbgPrim[] => [
    { k: "pipe", points: s, part: "edge", cap: "butt" },
    { k: "pipe", points: s, part: "body", cap: "butt" },
    { k: "pipe", points: s, part: "shine", cap: "butt" },
  ];
  const pipeFills = (id: string): CbgPrim[] => {
    const st = state.channels[id];
    const [hLo, hHi] = halfHolders(st);
    if (!hLo && !hHi) return [];
    const route = PIPE_PTS.get(id)!;
    const [a, b] = splitHalf(route);
    const L = plen(route);
    return [
      ...(hLo ? fills(a, hLo, [id]) : []),
      ...(hHi ? fills(b, hHi, [id]) : []),
      // yarı sınırı: ince beyaz ayraç (referanstaki gibi; iki yarı okunur)
      { k: "tick", points: fmt(slice(route, L / 2 - TICK_HALF, L / 2 + TICK_HALF)), chs: [id] },
    ];
  };

  // 1) 26-44 en altta (eksen borularının arkasından geçer) — V9 sırası.
  const pipeString = new Map(CBG_PIPES);
  out.push(...pipe(pipeString.get("26-44")!), ...pipeFills("26-44"));

  // 2) Entegrasyon ağı: önce tüm kenarlar, sonra gövdeler, sonra ışık (düğümde kesintisiz), sonra kişi renkleri.
  for (const part of ["edge", "body", "shine"] as const) for (const [, s] of CBG_NET_ARMS) out.push({ k: "pipe", points: s, part, cap: "round" });
  const netIds = Object.keys(CBG_NET_CHANNELS);
  const armChs = (arm: string, gate: number) => netIds.filter((id) => CBG_NET_CHANNELS[id].includes(arm) && id.split("-").map(Number).includes(gate));
  for (const [gate, arm] of Object.entries(CBG_NET_ARM_OF_GATE)) {
    const g = Number(gate);
    const h = state.gates[g];
    const inUse = netIds.some((id) => id.split("-").map(Number).includes(g) && state.channels[id].state !== "none");
    if (h && inUse) out.push(...fills(ARM_PTS.get(arm)!, h, armChs(arm, g)));
  }
  // Gövde: yalnız gövdeden geçen tanımlı kanal(lar) varsa; üst yarı 10/20 kapısının, alt yarı 34/57 kapısının sahibi.
  const merge = (cur: Holder | null, h: Holder): Holder => (!cur || cur === h ? h : "both");
  let up: Holder | null = null;
  let down: Holder | null = null;
  const trunkChs: string[] = [];
  for (const id of ["10-34", "10-57", "20-34", "20-57"]) {
    const st = state.channels[id];
    if (st.state !== "defined") continue;
    trunkChs.push(id);
    up = merge(up, st.holderA);
    down = merge(down, st.holderB);
  }
  if (up && down) {
    const [a, b] = splitHalf(ARM_PTS.get("govde")!);
    out.push(...fills(a, up, trunkChs), ...fills(b, down, trunkChs));
  }

  // 3) Diğer kanallar (V9 sırası): boru + kişi renkleri.
  for (const [id, s] of CBG_PIPES) {
    if (id === "26-44") continue;
    out.push(...pipe(s), ...pipeFills(id));
  }

  // 4) Seçim vurgusu + etkileşim yuvası.
  out.push({ k: "slot" });

  // 5) Tanımlı kanalların bağlantı türü işareti (çakışmasız).
  const placed: Pt[] = [];
  const gatePts = CBG_GATES.map(([, x, y]) => ({ x, y }));
  for (const id of CBG_CHANNEL_IDS) {
    const st = state.channels[id];
    if (st.state !== "defined") continue;
    const m = markerSpot(cbgChannelRoute(id), placed, gatePts);
    placed.push(m);
    out.push({ k: "marker", d: markerPath(CBG_DYNAMIC_SHAPE[st.dynamic], m.x, m.y), ch: id, shape: CBG_DYNAMIC_SHAPE[st.dynamic] });
  }

  // 6) Merkezler + adlar.
  for (const c of CBG_CENTERS) {
    out.push({ k: "center", engine: c.engine, points: c.points, defined: state.definedCenters.has(c.engine) });
    c.label.forEach((t, i) =>
      out.push({ k: "text", x: c.labelAt[0], y: +(c.labelAt[1] + (i - (c.label.length - 1) / 2) * 8.4).toFixed(1), text: t, size: c.label.length > 1 ? 6.2 : 7.4, fill: INK, spacing: 0.5, stroke: 0.32, role: "center" }),
    );
  }
  // 7) Kapılar.
  for (const [g, x, y] of CBG_GATES) {
    const h = state.gates[g] ?? null;
    out.push({ k: "gate", gate: g, x, y, holder: h });
    out.push({ k: "text", x, y: +(y + 2.35).toFixed(2), text: String(g), size: 6.4, fill: h ? "#ffffff" : INK, stroke: 0.18, role: "gate" });
  }
  out.push({ k: "logo" });
  return out;
}

// ── İlkel → SVG öğe tanımları (React ve sunucu ORTAK) ───────────────────────────────────────────────────────
export type CbgEl = { tag: "rect" | "polyline" | "path" | "polygon" | "circle" | "text" | "image" | "g"; attrs: Record<string, string | number>; text?: string; raw?: string };

const SHADOW_STYLE = { stroke: "#1e2a6e", opacity: 0.2, width: 12.5, dy: 1.9 };

export function cbgElements(p: CbgPrim, logoHref: string | null): CbgEl[] {
  switch (p.k) {
    case "rect":
      return [{ tag: "rect", attrs: { x: CBG_VIEW.x, y: CBG_VIEW.y, width: CBG_VIEW.width, height: CBG_VIEW.height, fill: "#ffffff" } }];
    case "backdrop":
      return [{ tag: "g", attrs: {}, raw: CBG_BACKDROP_MARKUP }];
    case "silhouette":
      return [{ tag: "g", attrs: {}, raw: CBG_SILHOUETTE_MARKUP }];
    case "shadows":
      return [{ tag: "g", attrs: { filter: "url(#cbgPipeShadow)", transform: `translate(0 ${SHADOW_STYLE.dy})`, opacity: SHADOW_STYLE.opacity }, raw: p.routes.map((s) => `<polyline points="${s}" fill="none" stroke="${SHADOW_STYLE.stroke}" stroke-width="${SHADOW_STYLE.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join("") }];
    case "pipe": {
      const t = TUBE.passive;
      const stroke = p.part === "edge" ? t.edge : p.part === "body" ? t.body : t.shine;
      const w = p.part === "edge" ? FULL : p.part === "body" ? BODY_W : SHINE_W;
      return [{ tag: "polyline", attrs: { points: p.points, fill: "none", stroke, strokeWidth: w, strokeLinecap: p.cap, strokeLinejoin: "round" } }];
    }
    case "fill": {
      const t = TUBE[p.tone];
      const dash: Record<string, string> = p.stripe ? { strokeDasharray: "5 5" } : {};
      // Çizgili (ortak kapı) şerit kenar çizmez: alttaki mavi borunun kenarı korunur.
      const els: CbgEl[] = [];
      if (!p.stripe) els.push({ tag: "polyline", attrs: { points: p.points, fill: "none", stroke: t.edge, strokeWidth: FULL, strokeLinecap: "butt", strokeLinejoin: "round" } });
      els.push({ tag: "polyline", attrs: { points: p.points, fill: "none", stroke: t.body, strokeWidth: BODY_W, strokeLinecap: "butt", strokeLinejoin: "round", ...dash } });
      els.push({ tag: "polyline", attrs: { points: p.points, fill: "none", stroke: t.shine, strokeOpacity: t.shineOpacity, strokeWidth: SHINE_W, strokeLinecap: "butt", strokeLinejoin: "round", ...dash } });
      return els;
    }
    case "tick":
      return [{ tag: "polyline", attrs: { points: p.points, fill: "none", stroke: "#ffffff", strokeWidth: FULL - 0.6, strokeLinecap: "butt" } }];
    case "slot":
      return [];
    case "marker":
      return [{ tag: "path", attrs: { d: p.d, fill: "#ffffff", stroke: INK, strokeWidth: 0.9, strokeLinejoin: "round" } }];
    case "center":
      return [{ tag: "polygon", attrs: { points: p.points, fill: p.defined ? "url(#cbgCenterDef)" : "url(#cbgCenterOpen)", stroke: CENTER_STROKE, strokeWidth: p.defined ? 2.1 : 1.8, strokeLinejoin: "round", filter: "url(#cbgLift)" } }];
    case "text":
      return [{
        tag: "text",
        attrs: { x: p.role === "gate" ? f2(p.x) : p.x.toFixed(1), y: p.role === "gate" ? f2(p.y) : p.y.toFixed(1), fontSize: p.size, ...(p.spacing ? { letterSpacing: p.spacing } : {}), textAnchor: "middle", fill: p.fill, stroke: p.fill, strokeWidth: p.stroke, strokeLinejoin: "round" },
        text: p.text,
      }];
    case "gate": {
      const r = CBG_GATE_R;
      const x = f2(p.x);
      const y = f2(p.y);
      if (p.holder === "both") {
        return [
          { tag: "path", attrs: { d: `M ${x} ${f2(p.y - r)} A ${r} ${r} 0 0 0 ${x} ${f2(p.y + r)} Z`, fill: "url(#cbgGateA)" } },
          { tag: "path", attrs: { d: `M ${x} ${f2(p.y - r)} A ${r} ${r} 0 0 1 ${x} ${f2(p.y + r)} Z`, fill: "url(#cbgGateB)" } },
          { tag: "circle", attrs: { cx: x, cy: y, r, fill: "none", stroke: "#ffffff", strokeWidth: 0.8 } },
        ];
      }
      if (p.holder) return [{ tag: "circle", attrs: { cx: x, cy: y, r, fill: p.holder === "A" ? "url(#cbgGateA)" : "url(#cbgGateB)", stroke: "#ffffff", strokeWidth: 0.8 } }];
      return [{ tag: "circle", attrs: { cx: x, cy: y, r, fill: "#ffffff", stroke: GATE_STROKE, strokeWidth: 0.95 } }];
    }
    case "logo":
      return logoHref ? [{ tag: "image", attrs: { href: logoHref, x: CBG_LOGO.x, y: CBG_LOGO.y, width: CBG_LOGO.width, height: CBG_LOGO.height, preserveAspectRatio: "xMidYMid meet" } }] : [];
  }
}

// ── SVG metni (Word / dışa aktarım) ─────────────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const KEEP_CAMEL = new Set(["preserveAspectRatio", "viewBox"]);
const kebab = (k: string) => (KEEP_CAMEL.has(k) ? k : k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
export function cbgElToSvg(e: CbgEl): string {
  const attrs = Object.entries(e.attrs).map(([k, v]) => ` ${kebab(k)}="${esc(String(v))}"`).join("");
  if (e.raw !== undefined) return `<${e.tag}${attrs}>${e.raw}</${e.tag}>`;
  if (e.text !== undefined) return `<${e.tag}${attrs}>${esc(e.text)}</${e.tag}>`;
  return `<${e.tag}${attrs}/>`;
}

export function connectionBodygraphSvg(prims: CbgPrim[], opts: { logoHref: string | null; fontFamily: string; width?: number; height?: number }): string {
  const o: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CBG_VIEWBOX}"${opts.width ? ` width="${opts.width}"` : ""}${opts.height ? ` height="${opts.height}"` : ""} font-family="${esc(opts.fontFamily)}">`,
    `<defs>${CBG_DEFS}</defs>`,
  ];
  for (const p of prims) for (const e of cbgElements(p, opts.logoHref)) o.push(cbgElToSvg(e));
  o.push("</svg>");
  return o.join("\n");
}
