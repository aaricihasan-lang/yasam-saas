/**
 * ASTROLOJİ — SEMBOL / YAZI TİPİ harness'i (2026-10-14 owner kararı: sembol + Türkçe karşılık BİRLİKTE; Yunan harfleri
 * kaldırılmaz; PDF/Word'de kare, soru işareti, boş karakter OLMAZ).
 *
 *   1) symbolFontCoverage.ts = public/fonts TTF'lerinin GERÇEK cmap'i (kendi TTF cmap okuyucumuz; format 4 + 12).
 *   2) Uygulamada kullanılan HER glif (gezegen, burç, açı, ℞) + sabit yıldız Bayer/diğer adları + çark etiketleri rapor yazı
 *      tiplerinden birinde VAR ve doğru yazı tipine yönlenir (Geist'te yoksa A/B).
 *   3) Rapor modeli sembolü Türkçe adıyla birlikte üretir ("☉ Güneş", "♌ Aslan", "☌ Kavuşum", "γ Pegasi (Gamma Pegasi)").
 *   4) Gerçek PDF: sembol yazı tipleri gömülür ve sembollü metin çizilir; sembolsüz metnin satır kaydırması eskisiyle aynı.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/symbols.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ASPECT_GLYPHS, BODY_GLYPHS, SIGN_GLYPHS } from "@/lib/astrology/labels/tr";
import { FIXED_STAR_CATALOG, bayerBoth } from "@/lib/astrology/labels/fixedStars";
import { GEIST_RANGES, SYM_A_RANGES, SYM_B_RANGES } from "@/lib/astrology/report/symbolFontCoverage";
import { fontKeyOf, fontRuns, isRenderable, SYMBOL_FONT_FILES } from "@/lib/astrology/report/symbolFonts";
import { WHEEL_BODY_ABBR, WHEEL_FONT_STACK, WHEEL_LEGEND, WHEEL_SIGN_ABBR } from "@/lib/astrology/report/wheelSvg";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import type { AstroReport } from "@/lib/astrology/report/model";

const ROOT = join(__dirname, "..", "..");
const FONTS = join(ROOT, "public", "fonts");

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

/** Minimal TTF cmap okuyucu (format 4 + 12; Unicode alt tabloları). */
function cmapCodepoints(file: string): Set<number> {
  const b = readFileSync(file);
  const numTables = b.readUInt16BE(4);
  let cmapOff = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (b.toString("latin1", rec, rec + 4) === "cmap") cmapOff = b.readUInt32BE(rec + 8);
  }
  if (cmapOff < 0) throw new Error("cmap yok");
  const out = new Set<number>();
  const n = b.readUInt16BE(cmapOff + 2);
  for (let i = 0; i < n; i++) {
    const r = cmapOff + 4 + i * 8;
    const pid = b.readUInt16BE(r);
    const eid = b.readUInt16BE(r + 2);
    if (!(pid === 0 || (pid === 3 && (eid === 1 || eid === 10)))) continue;
    const st = cmapOff + b.readUInt32BE(r + 4);
    const fmt = b.readUInt16BE(st);
    if (fmt === 4) {
      const segX2 = b.readUInt16BE(st + 6);
      const ends = st + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = b.readUInt16BE(ends + s * 2);
        const start = b.readUInt16BE(starts + s * 2);
        const delta = b.readInt16BE(deltas + s * 2);
        const ro = b.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let g: number;
          if (ro === 0) g = (c + delta) & 0xffff;
          else {
            const gi = b.readUInt16BE(ranges + s * 2 + ro + (c - start) * 2);
            g = gi === 0 ? 0 : (gi + delta) & 0xffff;
          }
          if (g !== 0) out.add(c);
        }
      }
    } else if (fmt === 12) {
      const groups = b.readUInt32BE(st + 12);
      for (let gI = 0; gI < groups; gI++) {
        const o = st + 16 + gI * 12;
        const s0 = b.readUInt32BE(o);
        const e0 = b.readUInt32BE(o + 4);
        const g0 = b.readUInt32BE(o + 8);
        for (let c = s0; c <= e0; c++) if (g0 + (c - s0) !== 0) out.add(c);
      }
    }
  }
  return out;
}
const expand = (rs: readonly (readonly [number, number])[]) => {
  const s = new Set<number>();
  for (const [a, b] of rs) for (let c = a; c <= b; c++) s.add(c);
  return s;
};
const eqSet = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every((x) => b.has(x));
const noVs = (s: string) => s.replace(/[\uFE0E\uFE0F]/g, "");

const USED_GLYPHS = [
  ...Object.values(BODY_GLYPHS).map(noVs),
  ...Object.values(SIGN_GLYPHS).map(noVs),
  ...Object.values(ASPECT_GLYPHS),
  "℞",
  ...Object.values(WHEEL_BODY_ABBR),
  ...WHEEL_SIGN_ABBR,
];

function main() {
  t("kapsam tablosu = yazı tipi dosyalarının GERÇEK cmap'i (Geist, A, B) — sapma yok", () => {
    assert.ok(eqSet(expand(GEIST_RANGES), cmapCodepoints(join(FONTS, "Geist-Regular.ttf"))), "Geist kapsamı güncel değil");
    assert.ok(eqSet(expand(SYM_A_RANGES), cmapCodepoints(join(FONTS, SYMBOL_FONT_FILES.A))), "A kapsamı güncel değil");
    assert.ok(eqSet(expand(SYM_B_RANGES), cmapCodepoints(join(FONTS, SYMBOL_FONT_FILES.B))), "B kapsamı güncel değil");
  });

  t("tüm astroloji glifleri (☉…⚸, ♈…♓, ☌ ☍ △ □ ⚹ ⚺ ∠ ⚼ ⚻, ℞, çark etiketleri) bir rapor yazı tipinde VAR", () => {
    const missing = USED_GLYPHS.flatMap((g) => Array.from(g)).filter((ch) => !isRenderable(ch));
    assert.deepEqual(missing, []);
    // Geist'te olmayanlar sembol fontuna yönlenir (Geist'te olan △ Geist'te kalır).
    for (const ch of USED_GLYPHS.flatMap((g) => Array.from(g))) {
      const k = fontKeyOf(ch);
      if (k === "base") assert.ok(expand(GEIST_RANGES).has(ch.codePointAt(0)!), `${ch} Geist'te yok ama base'e yönlendi`);
    }
    assert.equal(fontKeyOf("⚹"), "B");
    assert.equal(fontKeyOf("☉"), "A");
    assert.equal(fontKeyOf("γ"), "A");
    assert.equal(fontKeyOf("ş"), "base");
    assert.equal(fontKeyOf("≤"), "base");
  });

  t("43 yıldızın Bayer adı + diğer adları + Sanskritçe çeviri yazısı (ṣ ṭ ā ī) çizilebilir; Yunan harfi KORUNUR", () => {
    const missing: string[] = [];
    for (const [id, c] of Object.entries(FIXED_STAR_CATALOG)) {
      for (const ch of Array.from(`${c.name} ${bayerBoth(c.bayer)} ${c.constellation} ${c.altNames.join(" ")}`)) if (!isRenderable(ch)) missing.push(`${id}:${ch}`);
      assert.ok(/[α-ωΑ-Ω]/.test(bayerBoth(c.bayer)), `${id}: Yunan harfi kayboldu`);
    }
    for (const ch of Array.from("Aṣṭamī Śukla Kṛṣṇa ṛ ṅ ñ ḥ ṃ")) if (!isRenderable(ch)) missing.push(ch);
    assert.deepEqual(missing, []);
    assert.equal(bayerBoth("γ Pegasi"), "γ Pegasi (Gamma Pegasi)");
    assert.equal(bayerBoth("α² Librae"), "α² Librae (Alpha-2 Librae)");
  });

  t("görünüm seçicisi (VS15/VS16) çıktıya girmez; ardışık parçalar doğru bölünür", () => {
    const runs = fontRuns(`${BODY_GLYPHS.sun} Güneş ⚹ Altmışlık`);
    assert.deepEqual(runs, [
      { font: "A", text: "☉" },
      { font: "base", text: " Güneş " },
      { font: "B", text: "⚹" },
      { font: "base", text: " Altmışlık" },
    ]);
  });

  t("çark: yazı tipi listesi sembol fontlarını içerir; açıklama her glifi Türkçe adıyla eşler", () => {
    assert.ok(WHEEL_FONT_STACK.includes("Yasam Astro Symbols A") && WHEEL_FONT_STACK.includes("Yasam Astro Symbols B"));
    for (const pair of ["☉ Güneş", "☽ Ay", "♇ Plüton", "⚷ Kiron", "⚸ Kara Ay Lilith", "℞ retro", "♈ Koç", "♓ Balık"]) assert.ok(WHEEL_LEGEND.includes(pair), pair);
  });

  t("gerçek PDF: sembol fontları gömülü; sembolsüz paragrafın satır kaydırması eski davranışla aynı", () => {
    const fontB64 = readFileSync(join(FONTS, "Geist-Regular.ttf")).toString("base64");
    const sym = { A: readFileSync(join(FONTS, SYMBOL_FONT_FILES.A)).toString("base64"), B: readFileSync(join(FONTS, SYMBOL_FONT_FILES.B)).toString("base64") };
    const report: AstroReport = {
      title: "Sembol testi",
      cover: { client: "Test", analysisDate: "14.10.2026", tradition: "Batı", technique: "Natal", options: "—" },
      blocks: [
        { kind: "heading", level: 3, text: "Regulus ☌ Kavuşum ☉ Güneş" },
        { kind: "table", table: { columns: ["Gezegen", "Burç", "Açı"], rows: [["☉ Güneş", "♌ Aslan 29°41′", "⚹ Altmışlık"], ["♇ Plüton", "γ Pegasi (Gamma Pegasi)", "℞ Retro"]] } },
        { kind: "para", text: "Sembolsüz uzun Türkçe paragraf: ğüşıöç İĞŞÜÖÇ ".repeat(12) },
      ],
      fileBase: "x",
      hasChart: false,
    } as unknown as AstroReport;
    const withSym = Buffer.from(buildAstroReportPdf(report, null, fontB64, sym)).toString("latin1");
    assert.ok(/\/BaseFont\s*\/[A-Z]*\+?YasamSymA|YasamSymA/.test(withSym), "A fontu gömülmedi");
    assert.ok(/YasamSymB/.test(withSym), "B fontu gömülmedi");
    // Sembolsüz metin: sembol fontuyla ve onsuz aynı sayfa sayısı (kaydırma eski davranış).
    const plain: AstroReport = { ...report, blocks: [report.blocks[2]] } as AstroReport;
    const a = Buffer.from(buildAstroReportPdf(plain, null, fontB64, sym)).toString("latin1");
    const b = Buffer.from(buildAstroReportPdf(plain, null, fontB64, null)).toString("latin1");
    const pages = (s: string) => (s.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    assert.equal(pages(a), pages(b));
  });

  console.log(`\nastrology symbols harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main();
