/**
 * l01-chart-lp*-{tr,en} ham yanıtlarından lucky-gemstones.json özetini üretir (kişisel veri YOK; yalnız LP → ilişkiler).
 * Biçim: { "<lifePath>": { tr: {...}, en: {...} } }
 * Kullanım: npx tsx scripts/numeroloji-klasik/live/cases/build-lucky-summary.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { QA_DIR } from "./common";

const LPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];
type Lucky = {
  gemstones: string[];
  colors: string[];
  rulingPlanet: string;
  element: string;
  day: string;
  compatibleNumbers?: number[];
  incompatibleNumbers?: number[];
};
const out: Record<string, { tr?: Lucky; en?: Lucky }> = {};
let missing = 0;
for (const lp of LPS) {
  const row: { tr?: Lucky; en?: Lucky } = {};
  for (const lang of ["tr", "en"] as const) {
    const f = path.join(QA_DIR, "raw", `l01-chart-lp${lp}-${lang}.json`);
    if (!existsSync(f)) {
      missing++;
      continue;
    }
    const body = JSON.parse(readFileSync(f, "utf8")).body;
    const observed = body?.coreNumbers?.lifePath?.number;
    if (observed !== lp) {
      console.log(`UYARI: LP${lp} ${lang} gözlenen=${observed}`);
      missing++;
      continue;
    }
    const la = body?.luckyAssociations;
    if (!la) {
      missing++;
      continue;
    }
    row[lang] = {
      gemstones: la.gemstones,
      colors: la.colors,
      rulingPlanet: la.rulingPlanet,
      element: la.element,
      day: la.day,
      compatibleNumbers: la.compatibleNumbers,
      incompatibleNumbers: la.incompatibleNumbers,
    };
  }
  out[String(lp)] = row;
}
const file = path.join(QA_DIR, "lucky-gemstones.json");
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`${file} yazıldı; eksik=${missing}`);
