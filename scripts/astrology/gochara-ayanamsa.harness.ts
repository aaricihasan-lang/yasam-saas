/**
 * Gochara ayanamsa (24.10.2026, owner kararı) — GERÇEK iki sağlayıcı yanıtı (aynı transit anı 2026-10-24T12:00 UTC; doğum 1900 ve 2020).
 *   Ölçülen gerçek: transit gezegenlerinin sidereal boylamı TRANSİT anının Lahiri değeriyle hesaplanır (doğum yılından bağımsız;
 *   bağımsız NAIF DE440 + Skyfield ile ≤0,2″). Yanıttaki frame.ayanamsaDegrees ise DOĞUM anının Lahiri değeridir (natal liste için).
 *   Hata: ekran ve Word/PDF bu doğum-anı değerini Gochara başlığında transit için kullanılmış gibi gösteriyordu ("Lahiri (sabit, 23°…)").
 *   A) konum/rashi/nakshatra/kaksha/ev doğum yılından bağımsız; çerçeve ayanamsası farklı (doğum anı)
 *   B) bağımsız beklenen değerler (fixture'daki Python hesabı) ile transit boylamları ≤1″; çerçeve = Lahiri(doğum) ≤0,01″
 *   C) rapor: ayanamsa satırı değerin DOĞUM anına ait olduğunu ve transit konumlarının transit anının Lahiri'siyle hesaplandığını söyler
 *   D) ekran (sunucu render): aynı açıklama; değer "transit ayanamsası" gibi sunulmaz
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectRoxyVedicTransit } from "@/lib/astrology/providers/roxy/vedic";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { VedicTransitPanel } from "@/app/admin/astroloji/_components/VedicExtraPanels";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DIR = join(__dirname, "fixtures", "gochara-ayanamsa");
const F = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8")) as { opts: J; response: J; expectIndependent: J };
const ad = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180) * 3600;
let pass = 0, fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log(`PASS ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 4).join("\n     ")}`); }
}
const proj = (n: string) => {
  const g = F(n);
  const r = projectRoxyVedicTransit(g.response, g.opts);
  assert.ok(r.ok, r.ok ? "" : r.errors.join("; "));
  return { g, tech: (r as J).technical as J };
};

async function main() {
  await t("A aynı transit anı, doğum 1900 ↔ 2020: transit boylam/rashi/kaksha/ev BİREBİR aynı; çerçeve ayanamsası farklı (doğum anı)", () => {
    const a = proj("E1-dogum1900").tech, b = proj("E1-dogum2020").tech;
    for (const x of a.transits) {
      const y = b.transits.find((z: J) => z.id === x.id);
      assert.equal(x.longitude, y.longitude, x.id);
      assert.equal(x.rashi, y.rashi, x.id);
      assert.equal(x.kaksha.number, y.kaksha.number, x.id);
    }
    assert.ok(Math.abs(a.frame.ayanamsaDegrees - b.frame.ayanamsaDegrees) > 1.5, "çerçeve ayanamsası doğum yılına göre değişmeli (doğum anı değeri)");
  });
  await t("B bağımsız (DE440/Skyfield, Lahiri IAU1976): transit boylamları = tropikal − Lahiri(TRANSİT) ≤1″; çerçeve = Lahiri(DOĞUM) ≤0,01″", () => {
    for (const n of ["E1-dogum1900", "E1-dogum2020"]) {
      const { g, tech } = proj(n);
      for (const [id, lon] of Object.entries(g.expectIndependent.transitSidereal as Record<string, number>)) {
        const x = tech.transits.find((z: J) => z.id === id);
        assert.ok(ad(x.longitude, lon) <= 1, `${n} ${id}: ${x.longitude} ↔ ${lon}`);
      }
      assert.ok(ad(tech.frame.ayanamsaDegrees, g.expectIndependent.lahiriBirth) <= 0.01, `${n}: çerçeve doğum anı Lahiri değil`);
      assert.ok(ad(tech.frame.ayanamsaDegrees, g.expectIndependent.lahiriTransit) > 60, `${n}: çerçeve transit anı değeriyle karışmamalı`);
    }
  });
  await t("C Word/PDF: Gochara ayanamsa satırı değerin DOĞUM anına ait olduğunu ve transit konumlarının transit anının Lahiri değeriyle hesaplandığını yazar", () => {
    const { tech } = proj("E1-dogum1900");
    const s = reportTexts(buildAstroReport({ id: "x", title: "x", technique: "vedic.transit", analysisAt: "2026-10-24T12:00:00Z", technical: tech, params: {} } as never)).join("\n");
    assert.ok(s.includes("bu teknikte sabit"), "mevcut ifade korunur");
    assert.ok(s.includes("doğum anına aittir"), "değerin doğum anına ait olduğu yazmalı");
    assert.ok(s.includes("transit anının Lahiri değeriyle"), "transit konumlarının ayanamsası yazmalı");
  });
  await t("D ekran (sunucu render): Gochara başlığı aynı açıklamayı taşır; doğum anı değeri transit için 'sabit' değer gibi sunulmaz", () => {
    const { tech } = proj("E1-dogum1900");
    const html = renderToStaticMarkup(createElement(VedicTransitPanel, { t: tech }));
    assert.ok(html.includes("transit anının Lahiri değeriyle"), "ekran açıklaması");
    assert.ok(html.includes("doğum anı"), "değerin doğum anına ait olduğu");
    assert.ok(!/Lahiri\s*\(sabit,\s*\d/.test(html), "eski yanıltıcı biçim kalmamalı");
  });
  console.log(`\ngochara-ayanamsa harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
void main();
