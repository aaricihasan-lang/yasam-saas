/**
 * KİŞİSEL DİJİTAL OFİS (P4) — fotoğraf okunabilirliği saf matematik testleri (DOM / ağ YOK).
 * Çalıştır: npx tsx scripts/workspace/photoReadability.test.ts
 */
import {
  photoReadability, worstRatio, ratioOf, scrimForTone, targetForText, SCRIM_CAP, SCRIM_DARK, SCRIM_LIGHT, type RGB, type TextSample,
} from "../../lib/workspace/photoReadability";
import { contrastRatio } from "../../lib/workspace/contrast";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

// Tekrarlanabilir sözde rastgele (mulberry32)
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fill = (n: number, c: RGB): RGB[] => Array.from({ length: n }, () => c);
const R = rng(42);
const BRIGHT: RGB[] = Array.from({ length: 150 }, () => [225 + R() * 30, 220 + R() * 35, 210 + R() * 45] as RGB); // gökyüzü / kar
const DARK: RGB[] = Array.from({ length: 150 }, () => [10 + R() * 30, 12 + R() * 30, 20 + R() * 30] as RGB); // gece
const BUSY: RGB[] = Array.from({ length: 150 }, () => [R() * 255, R() * 255, R() * 255] as RGB); // kalabalık sahne

const INK: TextSample = { color: [23, 20, 43], target: 4.5 };
const SOFT: TextSample = { color: [92, 88, 111], target: 4.5 };
const WHITE: TextSample = { color: [255, 255, 255], target: 4.5 };
const WHITE80: TextSample = { color: [255, 255, 255], alpha: 0.8, target: 4.5 };
const BIG_GOLD: TextSample = { color: [118, 86, 20], target: 3 };

// ── Yardımcılar ──
ok(Math.abs(ratioOf([0, 0, 0], [255, 255, 255]) - 21) < 1e-9, "siyah/beyaz = 21:1");
ok(Math.abs(ratioOf([23, 20, 43], [251, 250, 247]) - contrastRatio("#17142b", "#fbfaf7")) < 1e-9, "contrast.ts ile aynı formül");
ok(scrimForTone("light") === SCRIM_LIGHT && scrimForTone("dark") === SCRIM_DARK, "ton → katman rengi (açık krem / koyu mürekkep)");
ok(targetForText(15, 400) === 4.5 && targetForText(24, 400) === 3 && targetForText(19, 700) === 3 && targetForText(19, 600) === 4.5, "WCAG büyük yazı eşiği");

// ── Ölçülemeyen ──
for (const [label, input] of [
  ["piksel yok", { pixels: [], texts: [INK], scrim: SCRIM_LIGHT }],
  ["metin rengi yok", { pixels: BRIGHT, texts: [], scrim: SCRIM_LIGHT }],
  ["bozuk piksel", { pixels: [[NaN, 1, 2] as unknown as RGB], texts: [INK], scrim: SCRIM_LIGHT }],
  ["saydam metin", { pixels: BRIGHT, texts: [{ ...INK, alpha: 0 }], scrim: SCRIM_LIGHT }],
] as const) {
  const r = photoReadability(input as Parameters<typeof photoReadability>[0]);
  ok(r.status === "unmeasured" && r.ratio === null && r.ratioBefore === null && r.alpha === 0 && !r.reachable, `ölçülemedi: ${label} → "unmeasured" (geçti DEĞİL)`, r);
}

// ── Açık zemin + koyu yazı → katmansız geçer ──
const p1 = photoReadability({ pixels: BRIGHT, texts: [INK, SOFT], scrim: SCRIM_LIGHT });
ok(p1.status === "pass" && p1.alpha === 0 && (p1.ratio ?? 0) >= 4.5, "parlak fotoğraf + koyu yazı → pass, katman yok", p1);

// ── Parlak zemin + beyaz yazı (koyu ton) → koyu katman ile düzelir, en düşük yoğunluk ──
const p2 = photoReadability({ pixels: BRIGHT, texts: [WHITE, WHITE80], scrim: SCRIM_DARK });
ok(p2.status === "fixed" && p2.alpha > 0 && p2.alpha <= SCRIM_CAP && (p2.ratio ?? 0) >= 4.5, "parlak fotoğraf + beyaz yazı → fixed (koyu katman)", p2);
ok((p2.ratioBefore ?? 99) < 4.5, "katmansız oran hedefin altında raporlanır", p2);
{
  const below = Math.round((p2.alpha - 0.01) * 100) / 100;
  const worstBelow = Math.min(...[WHITE, WHITE80].map((t) => worstRatio(BRIGHT, t, SCRIM_DARK, below)));
  ok(worstBelow < 4.5, "katman en düşük: 0,01 eksiği hedefe ulaşmaz", { below, worstBelow });
}

// ── Koyu zemin + koyu yazı (açık ton) → krem katman ──
const p3 = photoReadability({ pixels: DARK, texts: [INK], scrim: SCRIM_LIGHT });
ok(p3.status === "fixed" && (p3.ratio ?? 0) >= 4.5 && p3.alpha < SCRIM_CAP, "koyu fotoğraf + koyu yazı → fixed (krem katman)", p3);
const p3b = photoReadability({ pixels: DARK, texts: [WHITE], scrim: SCRIM_DARK });
ok(p3b.status === "pass" && p3b.alpha === 0, "koyu fotoğraf + beyaz yazı → pass", p3b);

// ── Kalabalık sahne: ortalama değil yüzdelik en kötü ──
const mean: RGB = [0, 1, 2].map((i) => BUSY.reduce((s, c) => s + c[i], 0) / BUSY.length) as unknown as RGB;
const p4 = photoReadability({ pixels: BUSY, texts: [INK], scrim: SCRIM_LIGHT });
ok(p4.status === "fixed" && (p4.ratio ?? 0) >= 4.5, "kalabalık fotoğraf → fixed", p4);
ok((p4.ratioBefore ?? 99) < ratioOf(INK.color, mean), "en kötü durum ortalamadan kötü (ortalama yanıltmaz)", { before: p4.ratioBefore, mean: ratioOf(INK.color, mean) });
{
  // %10 kadar çok koyu piksel: yüzdelik bunları yakalar
  const mostly = [...fill(85, [245, 245, 245]), ...fill(15, [5, 5, 5])];
  const r = photoReadability({ pixels: mostly, texts: [INK], scrim: SCRIM_LIGHT });
  ok(r.status === "fixed" && r.alpha >= 0.5, "piksellerin %15'i koyuysa (yüzdelik içinde) katman gerekir", r);
  const few = [...fill(97, [245, 245, 245]), ...fill(3, [5, 5, 5])];
  const r2 = photoReadability({ pixels: few, texts: [INK], scrim: SCRIM_LIGHT });
  ok(r2.status === "pass", "tek tük (%3) koyu piksel %90 yüzdelikte sonucu bozmaz", r2);
}

// ── Monotonluk: tona uygun yazıda yoğunluk arttıkça oran düşmez ──
{
  let mono = true;
  let prev = -1;
  for (let a = 0; a <= SCRIM_CAP + 1e-9; a += 0.05) {
    const r = worstRatio(BUSY, INK, SCRIM_LIGHT, a);
    if (r + 1e-9 < prev) mono = false;
    prev = r;
  }
  ok(mono, "krem katman + koyu yazı: oran yoğunlukla monoton artar");
  let monoD = true;
  prev = -1;
  for (let a = 0; a <= SCRIM_CAP + 1e-9; a += 0.05) {
    const r = worstRatio(BUSY, WHITE, SCRIM_DARK, a);
    if (r + 1e-9 < prev) monoD = false;
    prev = r;
  }
  ok(monoD, "koyu katman + beyaz yazı: oran yoğunlukla monoton artar");
}
// Daha zorlu fotoğraf daha fazla katman ister
{
  const mid = Array.from({ length: 100 }, () => [110, 110, 110] as RGB);
  const darker = Array.from({ length: 100 }, () => [60, 60, 60] as RGB);
  const a1 = photoReadability({ pixels: mid, texts: [INK], scrim: SCRIM_LIGHT }).alpha;
  const a2 = photoReadability({ pixels: darker, texts: [INK], scrim: SCRIM_LIGHT }).alpha;
  ok(a2 > a1 && a1 > 0, "koyulaştıkça gereken krem katman artar", { a1, a2 });
  const tighter = photoReadability({ pixels: mid, texts: [INK], scrim: SCRIM_LIGHT, margin: 0.5 }).alpha;
  ok(tighter >= a1, "güvenlik payı yoğunluğu azaltmaz", { a1, tighter });
}

// ── Büyük yazı hedefi 3:1 ──
{
  const px = fill(50, [200, 200, 200]);
  const big = photoReadability({ pixels: px, texts: [BIG_GOLD], scrim: SCRIM_LIGHT });
  const small = photoReadability({ pixels: px, texts: [{ ...BIG_GOLD, target: 4.5 }], scrim: SCRIM_LIGHT });
  ok(big.target === 3 && small.target === 4.5 && big.alpha <= small.alpha, "büyük yazı (3:1) daha az katmanla yetinir", { big, small });
  const mixed = photoReadability({ pixels: px, texts: [BIG_GOLD, INK], scrim: SCRIM_LIGHT });
  ok(mixed.target === 4.5, "karışık metinde raporlanan hedef en sıkı hedef (4,5)", mixed);
}

// ── Tavan: ulaşılamaz → insufficient ──
{
  // Beyaz yazı + krem katman: katman ancak kötüleştirir
  const r = photoReadability({ pixels: BRIGHT, texts: [WHITE], scrim: SCRIM_LIGHT });
  ok(r.status === "insufficient" && !r.reachable && r.alpha === SCRIM_CAP && (r.ratio ?? 99) < 4.5, "uyumsuz renk → insufficient, tavan uygulanır, oran dürüst", r);
  const lowCap = photoReadability({ pixels: DARK, texts: [INK], scrim: SCRIM_LIGHT, cap: 0.2 });
  ok(lowCap.status === "insufficient" && lowCap.alpha === 0.2, "düşük tavan aşılmaz", lowCap);
  const r2 = photoReadability({ pixels: DARK, texts: [INK], scrim: SCRIM_LIGHT });
  ok(r2.alpha <= SCRIM_CAP, "yoğunluk asla 0,85'i aşmaz", r2);
}

// ── Saydam yazı rengi zemine karışarak ölçülür ──
{
  const px = fill(40, [120, 120, 120]);
  const full = worstRatio(px, WHITE, SCRIM_DARK, 0);
  const faded = worstRatio(px, WHITE80, SCRIM_DARK, 0);
  ok(faded < full, "rgb(255 255 255 / 0.8) tam beyazdan düşük oran verir", { full, faded });
}

// ── Raporlanan oran aşağı yuvarlanır ──
{
  const r = photoReadability({ pixels: BUSY, texts: [INK], scrim: SCRIM_LIGHT });
  const exact = worstRatio(BUSY, INK, SCRIM_LIGHT, r.alpha);
  ok((r.ratio ?? 0) <= exact + 1e-9 && (r.ratio ?? 0) >= 4.5, "oran aşağı yuvarlanır, hedefin altına düşmez", { r: r.ratio, exact });
}

// ── Metin başına kümeler: tek katman yoğunluğu hepsini karşılar ──
{
  const g = photoReadability({ scrim: SCRIM_LIGHT, groups: [{ pixels: BRIGHT, texts: [INK] }, { pixels: BUSY, texts: [SOFT] }] });
  const onlyBusy = photoReadability({ pixels: BUSY, texts: [SOFT], scrim: SCRIM_LIGHT });
  ok(g.status === "fixed" && g.alpha === onlyBusy.alpha && g.samples === BRIGHT.length + BUSY.length, "kümeler: en zorlu küme yoğunluğu belirler", { g, onlyBusy });
  const empty = photoReadability({ scrim: SCRIM_LIGHT, groups: [{ pixels: [], texts: [INK] }] });
  ok(empty.status === "unmeasured", "boş kümeler → unmeasured", empty);
}

console.log(`\nworkspace photoReadability test: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
