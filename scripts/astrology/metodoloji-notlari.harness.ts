/**
 * Metodoloji notları (owner kararı 24.10.2026, madde 7) — YALNIZ metin; hesap/projeksiyon/şema değişmez. Kaynak: QA 40-sekiz-teknik
 * bağımsız doğrulaması (gerçek yanıtlar). Testler mevcut GERÇEK golden yanıtlarla (fixtures/golden), sağlayıcıya çağrı yok.
 *   A) Gun Milan: yöntem metni "klasik tablolarla" demez; Yoni/Vashya kaynak farkı ve Gana Rakshasa yön kuralı yazılı; ayanamsa
 *      derecesinin 1. roldeki kişinin doğum anına ait olduğu ve her kişinin kendi değeriyle hesaplandığı ekran + Word/PDF'te AYNI
 *   B) Arudha: çift lordlu burçta klasik lordun lord kendi burcunda olsa bile kullanıldığı (Jaimini kuralı uygulanmaz) ekran + rapor
 *   C) Forecast: transit Ay olaylarının kapsam dışı olduğu ekran + rapor; Ay evreleri ve tutulmalar kapsamda
 *   D) Dashakoot Rasi ve Shadbala metinleri bu PR'da DEĞİŞMEZ (ayrı araştırma); marka adı yok
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync as readFont } from "node:fs";
import { join as joinPath } from "node:path";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { projectRoxyVedicGunMilan, projectRoxyVedicManglik } from "@/lib/astrology/providers/roxy/vedicMatch";
import { combineGunMilan } from "@/lib/astrology/engine/vedicMatchTechniques";
import { projectRoxyVedicArudha } from "@/lib/astrology/providers/roxy/vedicHarita";
import { getTechnique } from "@/lib/astrology/engine/techniques";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { GUN_MILAN_METHOD_TEXT, gunMilanAyanamsaNote } from "@/lib/astrology/model/vedicMatch";
import { ARUDHA_METHOD_NOTE } from "@/lib/astrology/model/vedicHarita";
import { FORECAST_SCOPE_NOTE } from "@/lib/astrology/transitDetail";
import { GunMilanPanel } from "@/app/admin/astroloji/_components/VedicMatchPanels";
import { VedicArudhaPanel } from "@/app/admin/astroloji/_components/VedicHaritaPanels";
import { ForecastPanel } from "@/app/admin/astroloji/_components/TransitPanels";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const GDIR = join(__dirname, "fixtures", "golden");
const G = (n: string) => JSON.parse(readFileSync(join(GDIR, `${n}.json`), "utf8")) as { response: J };
let pass = 0, fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log(`PASS ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 4).join("\n     ")}`); }
}
const dec = (h: string) => h.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const ok = <T,>(r: { ok: boolean; technical?: T; errors?: string[] }) => { assert.ok(r.ok, (r.errors ?? []).join("; ")); return r.technical as T; };
const report = (technique: string, technical: J, params: J = {}) =>
  reportTexts(buildAstroReport({ id: "x", title: "x", technique, analysisAt: "2026-10-24T12:00:00Z", params, technical, method: {}, profile: { label: "Ayşe", partner: { label: "Mehmet" } } } as never)).join("\n");

const FONT_B64 = readFont(joinPath(process.cwd(), "public", "fonts", "Geist-Regular.ttf")).toString("base64");
async function wordPdf(r: J): Promise<{ docx: string; pdf: string }> {
  const zip = await JSZip.loadAsync(await renderAstroReportDocx(r, null, symbolFontBuffers()));
  const xml = await zip.file("word/document.xml")!.async("string");
  const docx = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(Buffer.from(buildAstroReportPdf(r, null, FONT_B64, symbolFontsBase64())))), { mergePages: true });
  return { docx, pdf: String(text).replace(/\s+/g, " ") };
}
async function main() {
  const gm = combineGunMilan([ok(projectRoxyVedicGunMilan(G("vedic-gun-milan").response, { ayanamsa: "lahiri" })), ok(projectRoxyVedicManglik(G("vedic-manglik-a").response, { ayanamsa: "lahiri" })), ok(projectRoxyVedicManglik(G("vedic-manglik-b").response, { ayanamsa: "lahiri" }))])!;

  await t("A Gun Milan yöntem metni: Yoni/Vashya kaynak farkı + Gana Rakshasa yön kuralı; 'klasik tablolarla' yok; mevcut Deva–Manushya ve Bhakoot notları korunur", () => {
    assert.doesNotMatch(GUN_MILAN_METHOD_TEXT, /klasik tablolarla/);
    assert.match(GUN_MILAN_METHOD_TEXT, /Yoni tablosu[^.;]*yayımlanmış tablolardan[^.;]*1–2 puan farklıdır/);
    assert.match(GUN_MILAN_METHOD_TEXT, /Vashya'da farklı sınıflar arasındaki puanların kaynağı belgelenmemiştir/);
    assert.match(GUN_MILAN_METHOD_TEXT, /Manushya–Rakshasa iki yönde de 1, Deva–Rakshasa iki yönde de 0/);
    assert.match(GUN_MILAN_METHOD_TEXT, /Deva–Manushya eşleşmesi iki yönde de 5/);
    assert.match(GUN_MILAN_METHOD_TEXT, /bazı ekoller 7 verir/);
  });
  await t("A Gun Milan ayanamsa: ekran + Word/PDF aynı açıklama (1. rol doğum anı; her kişi kendi doğum anı değeri) ve yöntem metni", () => {
    const html = dec(renderToStaticMarkup(createElement(GunMilanPanel as J, { t: gm, names: ["Ayşe", "Mehmet"] })));
    const note = gunMilanAyanamsaNote("Ayşe");
    assert.ok(html.includes(note), "ekranda ayanamsa notu");
    assert.match(html, /1\. rol doğum anı\)/);
    assert.ok(html.includes(GUN_MILAN_METHOD_TEXT), "ekranda yöntem metni");
    const s = report("vedic.gun_milan", gm);
    assert.ok(s.includes(note), "raporda ayanamsa notu");
    assert.ok(s.includes(GUN_MILAN_METHOD_TEXT), "raporda yöntem metni");
    const swapped = combineGunMilan([ok(projectRoxyVedicGunMilan(G("vedic-gun-milan-swap").response, { ayanamsa: "lahiri" })), ok(projectRoxyVedicManglik(G("vedic-manglik-b").response, { ayanamsa: "lahiri" })), ok(projectRoxyVedicManglik(G("vedic-manglik-a").response, { ayanamsa: "lahiri" }))])!;
    const sw = dec(renderToStaticMarkup(createElement(GunMilanPanel as J, { t: { ...swapped, order: "partner_first" }, names: ["Ayşe", "Mehmet"] })));
    assert.ok(sw.includes(gunMilanAyanamsaNote("Mehmet")), "rol takasında 1. rol = karşı taraf");
  });
  await t("B Arudha: klasik lord — lord kendi burcunda olsa bile; Jaimini kuralı uygulanmaz; ekran + rapor aynı", () => {
    assert.match(ARUDHA_METHOD_NOTE, /lord kendi burcunda olsa bile/);
    assert.match(ARUDHA_METHOD_NOTE, /Jaimini/);
    assert.match(ARUDHA_METHOD_NOTE, /10\. rashi alınır/, "mevcut istisna metni korunur");
    const ar = ok(projectRoxyVedicArudha(G("vedic-arudha").response, { ayanamsa: "lahiri" }));
    assert.ok(dec(renderToStaticMarkup(createElement(VedicArudhaPanel as J, { t: ar }))).includes(ARUDHA_METHOD_NOTE), "ekran");
    assert.ok(report("vedic.arudha", ar).includes(ARUDHA_METHOD_NOTE), "rapor");
  });
  await t("C Forecast: transit Ay olayları kapsam dışı (Ay evreleri/tutulmalar kapsamda) — ekran + rapor aynı", () => {
    assert.match(FORECAST_SCOPE_NOTE, /transit Ay'ın natal haritaya açıları ve Ay'ın burç girişleri bu takvimde yer almaz/);
    assert.match(FORECAST_SCOPE_NOTE, /Ay evreleri ve tutulmalar yer alır/);
    const FC = getTechnique("western.forecast")!;
    const CAL = { startDate: "2026-10-01", days: 90 };
    const UCTX = { birth: { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 }, birthUtc: "1990-07-15T11:30:00Z", partner: null } as never;
    const fc = (FC.project(FC.units(UCTX, CAL)[0], G("forecast").response, CAL) as J).technical;
    assert.ok(fc, "forecast golden projeksiyonu");
    assert.ok(dec(renderToStaticMarkup(createElement(ForecastPanel as J, { t: fc, options: CAL }))).includes(FORECAST_SCOPE_NOTE), "ekran");
    assert.ok(report("western.forecast", fc, CAL).includes(FORECAST_SCOPE_NOTE), "rapor");
  });
  await t("D marka yok; Dashakoot Rasi ve Shadbala metinleri bu PR kapsamında değil", () => {
    for (const x of [GUN_MILAN_METHOD_TEXT, gunMilanAyanamsaNote("X"), ARUDHA_METHOD_NOTE, FORECAST_SCOPE_NOTE]) assert.doesNotMatch(x, /roxy/i);
  });
  await t("E gerçek Word (.docx) ve PDF çıktısı: Gun Milan ayanamsa notu + Vashya notu", async () => {
    const r = buildAstroReport({ id: "x", title: "x", technique: "vedic.gun_milan", analysisAt: "2026-10-24T12:00:00Z", params: {}, technical: gm, method: {}, profile: { label: "Ayşe", partner: { label: "Mehmet" } } } as never);
    const { docx, pdf } = await wordPdf(r);
    for (const [ad, x] of [["Word", docx], ["PDF", pdf]] as const) {
      assert.ok(x.includes("1. roldeki kişinin (Ayşe) doğum anına aittir"), `${ad}: ayanamsa notu`);
      assert.ok(x.includes("Vashya'da farklı sınıflar arasındaki puanların kaynağı belgelenmemiştir"), `${ad}: Vashya notu`);
    }
  });
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main();
