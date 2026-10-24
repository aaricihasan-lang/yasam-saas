/**
 * ΔT bilgi notu (owner kararı 24.10.2026) — 1800 öncesi / 2100 sonrası. YALNIZ bilgilendirme; hesap/önbellek/şema değişmez.
 *   A) eşikler ve metin: 1799 not, 1800 yok, 2100 yok, 2101 not; temkinli dil (kesin hata / kategorik "etkilenmez" yok); marka yok
 *   B) hedef yıllar GERÇEK parseOptions çıktısından okunur (transit, dönüş yılı/ayı, progresyon, takvim penceresi bitişi, KP aralığı,
 *      aylık Vedik, gezegen dönüşü); seçenek nesnesi değişmez
 *   C) Word/PDF modeli: doğum notu "Doğum verileri"nde (1. ve 2. kişi), hedef notu "Yöntem"de; normal tarihlerde not yok
 *   D) ekran (sunucu render): teknik sonuç alanı hedef notunu ve verilen doğum notlarını raporla AYNI metinle gösterir
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync as readFont } from "node:fs";
import { join as joinPath } from "node:path";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { deltaTBirthNotes, deltaTTargetNotes, deltaTTargetYears } from "@/lib/astrology/deltaTNotice";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { TechniqueTechnical } from "@/app/admin/astroloji/_components/TimingPanels";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let pass = 0, fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log(`PASS ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 4).join("\n     ")}`); }
}
const NOW = new Date("2026-10-24T12:00:00Z");
const opt = (id: string, raw: J) => {
  const o = getTechnique(id)!.parseOptions(raw, NOW);
  assert.ok(o, `${id}: seçenek geçersiz`);
  return o as J;
};
const rev = (birthDate: string) => ({ birthDate, birthTime: "12:00:00", timeKnown: true, utcOffsetSeconds: 0, latitude: 41, longitude: 29, locationLabel: "x", timezone: "UTC", revision: 1 });

const FONT_B64 = readFont(joinPath(process.cwd(), "public", "fonts", "Geist-Regular.ttf")).toString("base64");
async function wordPdf(r: J): Promise<{ docx: string; pdf: string }> {
  const zip = await JSZip.loadAsync(await renderAstroReportDocx(r, null, symbolFontBuffers()));
  const xml = await zip.file("word/document.xml")!.async("string");
  const docx = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(Buffer.from(buildAstroReportPdf(r, null, FONT_B64, symbolFontsBase64())))), { mergePages: true });
  return { docx, pdf: String(text).replace(/\s+/g, " ") };
}
async function main() {
  await t("A eşikler: 1799 geçmiş notu, 1800/2100 not yok, 2101 gelecek notu; metin temkinli, markasız", () => {
    assert.equal(deltaTBirthNotes("1799-12-31")[0]?.code, "delta_t_past");
    assert.deepEqual(deltaTBirthNotes("1800-01-01"), []);
    assert.deepEqual(deltaTBirthNotes("2100-12-31"), []);
    assert.equal(deltaTBirthNotes("2101-01-01")[0]?.code, "delta_t_future");
    assert.deepEqual(deltaTBirthNotes(null), []);
    const all = [...deltaTBirthNotes("1650-03-05"), ...deltaTBirthNotes("2450-01-01")].map((n) => n.text).join("\n");
    assert.match(all, /tahmin edilir ve belirsizlik taşır/);
    assert.match(all, /öngörüye dayanır/);
    assert.match(all, /yalnız bilgilendirme/);
    assert.doesNotMatch(all, /roxy/i);
    assert.doesNotMatch(all, /hatalı|yanlış|etkilenmez|bağlı değildir|kesinlikle/i, "kanıtı aşan / hata gibi ifade yok");
  });
  await t("B hedef yıllar gerçek parseOptions çıktısından", () => {
    assert.deepEqual(deltaTTargetYears(opt("western.transit", { atUtc: "2350-05-01T10:00", nodeType: "true" })), [2350]);
    assert.deepEqual(deltaTTargetYears(opt("western.solar_return", { returnYear: 1750, houseSystem: "placidus" })), [1750]);
    assert.deepEqual(deltaTTargetYears(opt("western.lunar_return", { month: "2200-03", houseSystem: "placidus" })), [2200]);
    assert.deepEqual(deltaTTargetYears(opt("western.progression", { targetDate: "2105-06-01", nodeType: "true" })), [2105]);
    const fc = deltaTTargetYears(opt("western.forecast", { startDate: "2100-12-20", days: 30 }));
    assert.ok(fc.includes(2100) && fc.includes(2101), `pencere bitişi sayılır: ${fc}`);
    assert.equal(deltaTTargetNotes(opt("western.forecast", { startDate: "2100-12-20", days: 30 }))[0]?.code, "delta_t_future");
    assert.deepEqual(deltaTTargetNotes(opt("western.forecast", { startDate: "2100-12-01", days: 31 })), [], "2100-12-31 bitiş → not yok");
    assert.deepEqual(deltaTTargetNotes(opt("western.transit", { atUtc: "2026-10-24T12:00", nodeType: "true" })), []);
    assert.deepEqual(deltaTTargetNotes({}), []);
    const kp = deltaTTargetYears(opt("kp.transit", { ayanamsa: "kp-newcomb", nodeType: "true", range: { startDate: "2099-12-30", days: 5, kinds: ["rasi"], planets: ["moon"] } }));
    assert.ok(kp.includes(2099) && kp.includes(2100), `KP aralığı: ${kp}`);
    assert.deepEqual(deltaTTargetYears(opt("western.planetary_return", { planet: "saturn", approxDate: "2140-02-01", houseSystem: "placidus" })), [2140]);
    assert.deepEqual(deltaTTargetNotes(opt("western.natal", { houseSystem: "placidus", nodeType: "true" })), [], "natal: hedef an yok");
  });
  await t("C Word/PDF: doğum notu Doğum verilerinde (1. ve 2. kişi), hedef notu Yöntem'de; normal tarihte not yok", () => {
    const rep = (birth: string, params: J, partner?: string) =>
      buildAstroReport({ id: "x", title: "x", technique: "western.transit", analysisAt: "2026-10-24T12:00:00Z", params, technical: null,
        profile: { label: "A", revision: rev(birth), ...(partner ? { partner: { label: "B", revision: rev(partner) } } : {}) } } as never);
    const r1 = rep("1705-12-27", { atUtc: "2350-01-01T00:00:00Z" }, "2450-03-12");
    const blocks = r1.blocks as J[];
    const iDog = blocks.findIndex((b) => b.kind === "heading" && b.text === "Doğum verileri");
    const iYon = blocks.findIndex((b) => b.kind === "heading" && b.text === "Yöntem");
    const notes = blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === "para" && String(b.text).startsWith("Uzak tarih notu"));
    const birth = notes.filter(({ b }) => b.text.includes("doğum tarihi"));
    const target = notes.filter(({ b }) => b.text.includes("analiz hedef tarihi"));
    assert.equal(birth.length, 2, "iki kişi için doğum notu");
    assert.ok(birth.every(({ i }) => i > iDog && i < iYon), "doğum notları Doğum verileri bölümünde");
    assert.equal(target.length, 1);
    assert.ok(target[0].i > iYon, "hedef notu Yöntem bölümünde");
    assert.equal(birth[0].b.text, deltaTBirthNotes("1705-12-27")[0].text, "rapor metni = ortak kaynak");
    const r2 = reportTexts(rep("1990-01-01", { atUtc: "2026-10-24T12:00:00Z" })).join("\n");
    assert.doesNotMatch(r2, /Uzak tarih notu/);
  });
  await t("D ekran: teknik sonuç alanı hedef notunu + verilen doğum notlarını raporla AYNI metinle gösterir", () => {
    const html = renderToStaticMarkup(createElement(TechniqueTechnical as J, {
      technique: "western.transit", technical: null, timeUnknownMasked: false, warnings: [], names: ["A", "B"],
      options: { atUtc: "2350-01-01T00:00:00Z", nodeType: "true" }, deltaTBirths: [{ who: null, birthDate: "1705-12-27" }, { who: "2. kişinin", birthDate: "1990-01-01" }],
    }));
    assert.match(html, /data-testid="astro-delta-t-notes"/);
    const decoded = html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    assert.ok(decoded.includes(deltaTTargetNotes({ atUtc: "2350-01-01T00:00:00Z" })[0].text), "hedef notu");
    assert.ok(decoded.includes(deltaTBirthNotes("1705-12-27")[0].text), "doğum notu");
    assert.equal((decoded.match(/Uzak tarih notu/g) ?? []).length, 2, "1990 doğumu için not yok");
    const none = renderToStaticMarkup(createElement(TechniqueTechnical as J, { technique: "western.transit", technical: null, timeUnknownMasked: false, warnings: [], names: ["A", "B"], options: { atUtc: "2026-01-01T00:00:00Z" } }));
    assert.doesNotMatch(none, /astro-delta-t-notes/);
  });
  await t("E gerçek Word (.docx) ve PDF çıktısı: doğum + hedef notu metinde; normal tarihte yok", async () => {
    const r = buildAstroReport({ id: "x", title: "x", technique: "western.transit", analysisAt: "2026-10-24T12:00:00Z", params: { atUtc: "2350-01-01T00:00" }, technical: null,
      profile: { label: "A", revision: rev("1705-12-27") } } as never);
    const { docx, pdf } = await wordPdf(r);
    for (const [ad, x] of [["Word", docx], ["PDF", pdf]] as const) {
      assert.ok(x.includes("1800 öncesi") && x.includes("tarihsel gözlem kayıtlarından tahmin edilir"), `${ad}: doğum notu`);
      assert.ok(x.includes("2100 sonrası") && x.includes("öngörüye dayanır"), `${ad}: hedef notu`);
    }
    const n = await wordPdf(buildAstroReport({ id: "x", title: "x", technique: "western.transit", analysisAt: "2026-10-24T12:00:00Z", params: { atUtc: "2026-01-01T00:00" }, technical: null, profile: { label: "A", revision: rev("1990-01-01") } } as never));
    assert.ok(!n.docx.includes("Uzak tarih notu") && !n.pdf.includes("Uzak tarih notu"), "normal tarihte not yok");
  });
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main();
