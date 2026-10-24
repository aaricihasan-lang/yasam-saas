/**
 * Dashakoot + Papasamyam ayanamsa etiketi (owner talimatı 24.10.2026, madde 7) — YALNIZ metin; hesap/projeksiyon/şema değişmez.
 * Ölçülen gerçek (QA 62-eslesme-etiket, bağımsız DE440 + Lahiri IAU1976): çerçevedeki tek ayanamsa derecesi person1'in (1. rol)
 * doğum anına aittir (Dashakoot 42/42 ≤0,007″, Papasamyam 6/6 ≤0,003″); her kişi KENDİ doğum anının Lahiri değeriyle hesaplanır
 * (ayırt edici vakalar: Dashakoot 3/3, Papasamyam 4/4; karşı kişinin ayanamsası hipotezi 0/3, 0/4).
 *   A) Dashakoot: ekran başlığı "1. rol doğum anı" + not; Word/PDF Ayanamsa satırı aynı not; rol takasında 1. rol = karşı taraf
 *   B) Papasamyam: aynı (not Lagna, Ay, Venüs ve malefik konumlarını anar)
 *   C) Hesap değişmez (golden toplamları aynen); metinde marka adı yok; Gun Milan ile aynı cümle kalıbı
 * Gerçek GOLDEN yanıtlar (fixtures/golden); sağlayıcıya çağrı yok.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { projectRoxyVedicDashakoot, projectRoxyVedicPapasamyam } from "@/lib/astrology/providers/roxy/vedicPorutham";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import * as PM from "@/lib/astrology/model/vedicPorutham";
import { DashakootPanel, PapasamyamPanel } from "@/app/admin/astroloji/_components/VedicPoruthamPanels";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const GDIR = join(__dirname, "fixtures", "golden");
const G = (n: string) => JSON.parse(readFileSync(join(GDIR, `${n}.json`), "utf8")) as { response: J };
let pass = 0, fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log(`PASS ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 4).join("\n     ")}`); }
}
const dec = (h: string) => h.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const ok = <T,>(r: { ok: boolean; technical?: T; errors?: string[] }) => { assert.ok(r.ok, (r.errors ?? []).join("; ")); return r.technical as T; };
/** Henüz yoksa (düzeltme öncesi) testler FAIL sayılır; modül yüklenmesi bozulmaz. */
const noteFn = (): ((kind: "dashakoot" | "papasamyam", firstRole: string) => string) => {
  const f = (PM as J).poruthamAyanamsaNote;
  assert.equal(typeof f, "function", "poruthamAyanamsaNote tanımlı değil");
  return f;
};
const buildR = (technique: string, technical: J) =>
  buildAstroReport({ id: "x", title: "x", technique, analysisAt: "2026-10-24T12:00:00Z", params: {}, technical, method: {}, profile: { label: "Ayşe", partner: { label: "Mehmet" } } } as never);
const FONT_B64 = readFileSync(join(process.cwd(), "public", "fonts", "Geist-Regular.ttf")).toString("base64");
async function wordPdf(r: J): Promise<{ docx: string; pdf: string }> {
  const zip = await JSZip.loadAsync(await renderAstroReportDocx(r, null, symbolFontBuffers()));
  const xml = await zip.file("word/document.xml")!.async("string");
  const docx = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(Buffer.from(buildAstroReportPdf(r, null, FONT_B64, symbolFontsBase64())))), { mergePages: true });
  return { docx, pdf: String(text).replace(/\s+/g, " ") };
}
const squash = (s: string) => s.replace(/\s+/g, "");

async function main() {
  const dk = ok(projectRoxyVedicDashakoot(G("vedic-dashakoot").response, { ayanamsa: "lahiri" })) as J;
  const dkSwap = { ...(ok(projectRoxyVedicDashakoot(G("vedic-dashakoot-swap").response, { ayanamsa: "lahiri" })) as J), order: "partner_first" };
  const ps = ok(projectRoxyVedicPapasamyam(G("vedic-papasamyam").response, { ayanamsa: "lahiri" })) as J;
  const psSwap = { ...(ok(projectRoxyVedicPapasamyam(G("vedic-papasamyam-swap").response, { ayanamsa: "lahiri" })) as J), order: "partner_first" };

  for (const [kind, Panel, tech, swap, id] of [
    ["dashakoot", DashakootPanel, dk, dkSwap, "vedic.dashakoot"],
    ["papasamyam", PapasamyamPanel, ps, psSwap, "vedic.papasamyam"],
  ] as const) {
    await t(`${kind}: ekran başlığı derecenin 1. rol doğum anına ait olduğunu söyler + açıklama notu`, () => {
      const note = noteFn()(kind, "Ayşe");
      const html = dec(renderToStaticMarkup(createElement(Panel as J, { t: tech, names: ["Ayşe", "Mehmet"] })));
      assert.match(html, /1\. rol doğum anı\)/, "başlıkta '1. rol doğum anı'");
      assert.ok(html.includes(note), "ekranda not");
      assert.ok(html.includes(`data-testid="astro-${kind}-ayanamsa-note"`), "not test kimliği");
    });
    await t(`${kind}: rol takasında not 1. roldeki kişiyi (karşı taraf) anar`, () => {
      const html = dec(renderToStaticMarkup(createElement(Panel as J, { t: swap, names: ["Ayşe", "Mehmet"] })));
      assert.ok(html.includes(noteFn()(kind, "Mehmet")), "takasta 1. rol = Mehmet");
    });
    await t(`${kind}: rapor modeli Ayanamsa satırı aynı notu taşır`, () => {
      const s = reportTexts(buildR(id, tech)).join("\n");
      assert.ok(s.includes(noteFn()(kind, "Ayşe")), "raporda not");
    });
    await t(`${kind}: gerçek Word (.docx) ve PDF metninde not`, async () => {
      const note = squash(noteFn()(kind, "Ayşe"));
      const { docx, pdf } = await wordPdf(buildR(id, tech));
      assert.ok(squash(docx).includes(note), "Word metninde not");
      assert.ok(squash(pdf).includes(note), "PDF metninde not");
    });
  }
  await t("not içeriği: Dashakoot Ay konumunu, Papasamyam Lagna/Ay/Venüs ve malefikleri anar; Gun Milan ile aynı kalıp; marka yok", () => {
    const d = noteFn()("dashakoot", "X"), p = noteFn()("papasamyam", "X");
    for (const s of [d, p]) {
      assert.match(s, /^Gösterilen ayanamsa derecesi 1\. roldeki kişinin \(X\) doğum anına aittir; her kişinin /);
      assert.match(s, /kendi doğum anının ayanamsa değeriyle hesaplanır\.$/);
      assert.doesNotMatch(s, /roxy/i);
    }
    assert.match(d, /Ay konumu/);
    assert.match(p, /Lagna, Ay, Venüs ve malefik gezegen konumları/);
  });
  await t("hesap değişmez: golden toplamları aynen (Dashakoot 7/10, takas 6/10; Papasamyam 3,75 / 2,75)", () => {
    assert.equal(dk.total, 7);
    assert.equal(dkSwap.total, 6);
    assert.equal(ps.person1.total, 3.75);
    assert.equal(ps.person2.total, 2.75);
  });
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
