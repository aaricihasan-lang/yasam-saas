/**
 * KİŞİSEL DİJİTAL OFİS (P4) — renk / palet matematiği testleri (saf; DOM / ağ YOK).
 * Çalıştır: npx tsx scripts/workspace/palette.test.ts
 */
import {
  AA, AA_LARGE, contrast, ensureContrast, fixBrandContrast, grade, hexToRgb, hslToRgb, logoColorsFromPixels, luminance,
  makePalette, mixHex, palettesFromPixels, rgbToHex, rgbToHsl, suggestPalettes,
} from "../../lib/workspace/palette";
import { parseDesign } from "../../lib/workspace/schema";
import { checkDesignContrast, contrastRatio } from "../../lib/workspace/contrast";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

// ── Temel dönüşümler ──
ok(JSON.stringify(hexToRgb("#7c3aed")) === "[124,58,237]", "hexToRgb #7c3aed");
ok(JSON.stringify(hexToRgb("#fff")) === "[255,255,255]", "hexToRgb kısa yazım");
ok(rgbToHex([124, 58, 237]) === "#7c3aed", "rgbToHex");
ok(rgbToHex([300, -5, 12.6]) === "#ff000d", "rgbToHex sınırlar ve yuvarlama");
for (const hex of ["#7c3aed", "#a8761f", "#2f6b4f", "#17142b", "#ffffff", "#000000", "#b4235a"]) {
  ok(rgbToHex(hslToRgb(rgbToHsl(hexToRgb(hex)))) === hex, `hsl gidiş-dönüş ${hex}`);
}
ok(mixHex("#000000", "#ffffff", 0.5) === "#808080", "mixHex orta nokta");

// ── WCAG bilinen değerler ──
ok(near(luminance([255, 255, 255]), 1) && near(luminance([0, 0, 0]), 0), "parlaklık uçları");
ok(near(contrast("#000000", "#ffffff"), 21), "siyah/beyaz 21:1", contrast("#000000", "#ffffff"));
ok(near(contrast("#ffffff", "#ffffff"), 1), "aynı renk 1:1");
ok(near(contrast("#777777", "#ffffff"), 4.48, 0.01), "#777 / beyaz ≈ 4,48:1", contrast("#777777", "#ffffff"));
ok(near(contrast("#767676", "#ffffff"), 4.54, 0.01), "#767676 / beyaz ≈ 4,54:1 (AA sınırı)", contrast("#767676", "#ffffff"));
ok(near(contrast("#7c3aed", "#ffffff"), 5.7, 0.05), "#7c3aed / beyaz ≈ 5,7:1", contrast("#7c3aed", "#ffffff"));
ok(contrast("#123456", "#abcdef") === contrast("#abcdef", "#123456"), "kontrast simetrik");
for (const [a, b] of [["#7c3aed", "#f4effd"], ["#17142b", "#efe9e4"], ["#c99a3a", "#392e5e"]]) {
  ok(near(contrast(a, b), contrastRatio(a, b), 1e-9), `sunucu kontrast formülüyle aynı ${a}/${b}`);
}

// ── grade ──
ok(grade(21) === "AAA" && grade(7) === "AAA", "grade AAA");
ok(grade(4.5) === "AA" && grade(6.99) === "AA", "grade AA");
ok(grade(3) === "AA-large" && grade(4.49) === "AA-large", "grade büyük yazı");
ok(grade(2.99) === "fail", "grade yetersiz");

// ── ensureContrast ──
for (const [fg, bg, min] of [["#c4b5fd", "#ffffff", AA], ["#a8761f", "#f4effd", AA], ["#3b2f6b", "#392e5e", AA], ["#f1d293", "#f4efeb", 7], ["#7c3aed", "#7c3aed", AA_LARGE], ["#ffff00", "#ffffff", AA]] as const) {
  const r = ensureContrast(fg, bg, min);
  ok(contrast(r, bg) >= min, `ensureContrast ${fg} / ${bg} ≥ ${min}`, { r, ratio: contrast(r, bg) });
}
ok(ensureContrast("#17142b", "#ffffff") === "#17142b", "zaten yeterliyse renk değişmez");
const darkened = ensureContrast("#c4b5fd", "#ffffff");
ok(Math.abs(rgbToHsl(hexToRgb(darkened))[0] - rgbToHsl(hexToRgb("#c4b5fd"))[0]) < 6, "ensureContrast tonu korur", darkened);

// ── Piksel → palet ──
function pixels(colors: [number, number, number, number][], each = 400): { data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(colors.length * each * 4);
  let i = 0;
  for (const c of colors) for (let k = 0; k < each; k++) { data.set(c, i); i += 4; }
  return { data };
}
const purpleGold = pixels([[124, 58, 237, 255], [201, 154, 58, 255], [255, 255, 255, 255], [0, 0, 0, 0], [30, 25, 45, 255]]);
const lc = logoColorsFromPixels(purpleGold);
ok(lc.colors.length === 2, "iki doygun renk bulunur (beyaz / şeffaf dışlanır)", lc);
ok(lc.dark !== null, "koyu ipucu bulunur", lc);
ok(Math.abs(rgbToHsl(hexToRgb(lc.colors[0]))[0] - 262) < 8 || Math.abs(rgbToHsl(hexToRgb(lc.colors[1] ?? "#000000"))[0] - 262) < 8, "mor ton bulundu", lc);

const fixtures: Record<string, { data: Uint8ClampedArray }> = {
  "mor+altın": purpleGold,
  "tek renk kırmızı": pixels([[220, 30, 40, 255]]),
  "gri logo": pixels([[128, 128, 128, 255], [40, 40, 40, 255]]),
  "boş / şeffaf": pixels([[0, 0, 0, 0]]),
  "beyaz": pixels([[255, 255, 255, 255]]),
  "sarı (açık)": pixels([[250, 230, 20, 255]]),
  "koyu lacivert": pixels([[10, 20, 60, 255], [20, 40, 120, 255]]),
  "çok renkli": pixels([[230, 40, 40, 255], [40, 200, 60, 255], [40, 80, 230, 255], [250, 200, 0, 255]]),
};
for (const [name, px] of Object.entries(fixtures)) {
  const ps = palettesFromPixels(px);
  ok(ps.length === 3, `${name}: 3 palet`);
  ps.forEach((p, i) => {
    ok(contrast(p.ink, p.soft) >= AA, `${name} #${i + 1} (${p.name}): koyu yazı/zemin ≥ 4,5:1`, { p, r: contrast(p.ink, p.soft) });
    ok(contrast(p.accent, p.soft) >= AA, `${name} #${i + 1}: vurgu/zemin ≥ 4,5:1`, { p, r: contrast(p.accent, p.soft) });
    ok([p.accent, p.soft, p.ink, p.accent2].every((c) => /^#[0-9a-f]{6}$/.test(c)) && p.name.length > 0 && p.name.length <= 40, `${name} #${i + 1}: şema uyumlu renkler`, p);
    // Sunucu doğrulaması ve kontrast kapısı: palet tek başına kapıyı geçmeli.
    const d = parseDesign({ layout: "A", brand: p, bg: { mode: "theme", theme: "marka" } }, { allowAssets: true });
    ok(d.ok && checkDesignContrast(d.value).length === 0, `${name} #${i + 1}: sunucu şeması + kontrast kapısı geçer`, d.ok ? checkDesignContrast(d.value) : d);
  });
}
ok(suggestPalettes({ colors: [], dark: null }).map((p) => p.name).join("|") === "Nötr zarif|Sıcak altın|Serin lacivert", "renksiz logo: nötr / sıcak / serin öneriler");

// ── makePalette koyu ipucu çok açıksa bile güvenli ──
const pale = makePalette("Deneme", "#7c3aed", null, "#eeeeee");
ok(contrast(pale.ink, pale.soft) >= AA, "açık 'koyu ipucu' → yine ≥ 4,5:1", pale);

// ── fixBrandContrast ──
const bad = { name: "Özel", accent: "#e9d5ff", soft: "#f4effd", ink: "#d8d0e8", accent2: "#c99a3a" };
const fixed = fixBrandContrast(bad);
ok(contrast(fixed.ink, fixed.soft) >= AA && contrast(fixed.accent, fixed.soft) >= AA && fixed.soft === bad.soft, "otomatik düzeltme: vurgu + yazı AA, zemin aynı", fixed);
const good = { name: "İyi", accent: "#5b21b6", soft: "#f4effd", ink: "#17142b", accent2: "#c99a3a" };
ok(JSON.stringify(fixBrandContrast(good)) === JSON.stringify(good), "yeterli palet değişmez");

console.log(`\nworkspace palette test: ${pass} PASS / ${fail} FAIL`);
if (fail) process.exit(1);
