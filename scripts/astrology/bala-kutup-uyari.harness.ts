/**
 * Shadbala / Bhava Bala kutup günü / gecesi UYARISI (24.10.2026, owner talimatı madde 5) — YALNIZ sunum; hesap DEĞİŞMEZ.
 *   A) doğuş/batış ↔ bağımsız DE440 + Skyfield (fixtures/bala-kutup/sun-day-skyfield.json; 9 enlem × 2024, 2 günde bir; kulminasyon
 *      irtifası + ikiye bölme, QA 61-bala-kutup/ref_gun.py): eşik yakını (nearThreshold) dışında varlık farkı 0; anlar ≤ 4 dk
 *   B) 24 GERÇEK sağlayıcı yanıtı (fixtures/bala-kutup/gercek-yanitlar.json): uyarı YALNIZ Tromsø 21.06.2024 (kutup günü) Shadbala +
 *      Bhava Bala vakalarında; 64,15°K yaz ortası (23:50, gün batımı sonrası) ve diğer 21 vaka uyarısız (yanlış alarm 0)
 *   C) Vedik gün kuralı (sentetik doğum anı; beklenenler Skyfield ile, QA 61-bala-kutup/kural-c*.json): batış sonrası + ertesi gün
 *      kutup gecesi → uyarı; doğuş öncesi + önceki gün kutup gecesi → uyarı; gündüz ve tanımlı gece → yok
 *   D) ekran (sunucu render): uyarı yalnız koşulda; uyarı dışında işaretleme BİREBİR aynı (sayısal tablo değişmez)
 *   E) Word/PDF: aynı metin; koşul yoksa yok; sayısal satırlar teknik veriyle aynı
 *   F) projeksiyon/teknik veri değişmez (uyarı teknik veriye yazılmaz); diğer teknikler ve eksik veri → uyarı yok
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { balaPolarBirth, balaPolarNotice, sunDay, BALA_POLAR_NOTICE, type BalaBirthMoment } from "@/lib/astrology/balaPolarNotice";
import { projectRoxyVedicShadbala } from "@/lib/astrology/providers/roxy/vedic";
import { projectRoxyVedicBhavaBala } from "@/lib/astrology/providers/roxy/vedicHarita";
import { buildAstroReport, reportTexts } from "@/lib/astrology/report/model";
import { renderAstroReportDocx } from "@/lib/astrology/report/docx";
import { buildAstroReportPdf } from "@/lib/astrology/report/pdf";
import { symbolFontBuffers, symbolFontsBase64 } from "@/lib/astrology/report/symbolFontData";
import { TechniqueTechnical } from "@/app/admin/astroloji/_components/TimingPanels";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const DIR = join(__dirname, "fixtures", "bala-kutup");
const REAL: J[] = JSON.parse(readFileSync(join(DIR, "gercek-yanitlar.json"), "utf8"));
const SKY: J[] = JSON.parse(readFileSync(join(DIR, "sun-day-skyfield.json"), "utf8"));
const FONT_B64 = readFileSync(join(process.cwd(), "public", "fonts", "Geist-Regular.ttf")).toString("base64");
let pass = 0, fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log(`PASS ${name}`); } catch (e) { fail++; console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 4).join("\n     ")}`); }
}
const moment = (c: J): BalaBirthMoment => ({ birthDate: c.birth.date, birthTime: c.birth.time, timezone: c.birth.tz, latitude: c.birth.lat, longitude: c.birth.lon });
const project = (c: J) => {
  const r = c.technique === "vedic.shadbala" ? projectRoxyVedicShadbala(c.raw, { ayanamsa: "lahiri" }) : projectRoxyVedicBhavaBala(c.raw, { ayanamsa: "lahiri" });
  assert.ok(r.ok, `${c.id}: projeksiyon ${r.ok ? "" : r.errors.join("; ")}`);
  return (r as J).technical as J;
};
const POLAR_IDS = new Set(["vedic_shadbala-s7", "bala61-bhava_bala-s7"]);
const NOTICE_RE = /<p [^>]*data-testid="astro-bala-polar-notice"[^>]*>[^<]*<\/p>/;
const ssr = (technique: string, technical: J, birthMoment: BalaBirthMoment | null) =>
  renderToStaticMarkup(createElement(TechniqueTechnical as never, { technique, technical, timeUnknownMasked: false, warnings: [], names: ["A", "B"], options: { ayanamsa: "lahiri" }, birthMoment } as never));
const report = (c: J, technical: J) =>
  buildAstroReport({
    id: "x", title: "x", technique: c.technique, analysisAt: "2026-10-24T12:00:00Z", technical, params: { ayanamsa: "lahiri" }, method: { timeUnknownMasked: false, warnings: [] },
    profile: { label: "Sentetik", revision: { revision: 1, birthDate: c.birth.date, birthTime: `${c.birth.time}:00`, timeKnown: true, timezone: c.birth.tz, latitude: c.birth.lat, longitude: c.birth.lon, locationLabel: c.birth.label, timeAccuracyLabel: "Kesin" } },
  } as never);
async function pdfText(buf: Buffer) { const { text } = await extractText(await getDocumentProxy(new Uint8Array(buf)), { mergePages: true }); return (text as string).replace(/\s+/g, " "); }
async function docxText(buf: Buffer) { const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string"); return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ").replace(/\s+/g, " "); }

async function main() {
  await t("A doğuş/batış ↔ DE440 + Skyfield (kulminasyon + ikiye bölme): eşik yakını dışında varlık farkı 0; anlar ≤ 4 dk", () => {
    let wrong = 0, near = 0, nearWrong = 0, maxMin = 0;
    for (const r of SKY) {
      const k = sunDay(r.date, r.off, r.lat, r.lon)!;
      if (k.nearThreshold) near++;
      for (const [mine, sky] of [[k.sunriseUtcMs, r.sunrise], [k.sunsetUtcMs, r.sunset]] as [number | null, string | null][]) {
        if ((mine === null) !== (sky === null)) { if (k.nearThreshold) nearWrong++; else wrong++; continue; }
        if (mine !== null && sky !== null) maxMin = Math.max(maxMin, Math.abs(mine - Date.parse(sky)) / 60000);
      }
    }
    console.log(`     ${SKY.length} gün (${SKY.length * 2} olay) · eşik yakını ${near} gün (bunlarda farklı ${nearWrong}) · yanlış ${wrong} · en büyük an farkı ${maxMin.toFixed(2)} dk`);
    assert.equal(wrong, 0);
    assert.ok(maxMin <= 4, `an farkı ${maxMin} dk`);
    assert.ok(near <= SKY.length * 0.03, "eşik yakını %3'ü aşmamalı");
  });
  await t("B 24 gerçek yanıt: uyarı yalnız Tromsø 21.06.2024 kutup günü (Shadbala + Bhava Bala); diğer 22 vaka uyarısız", () => {
    assert.equal(REAL.length, 24);
    for (const c of REAL) assert.equal(balaPolarBirth(moment(c)), POLAR_IDS.has(c.id), c.id);
    assert.ok(REAL.some((c) => c.id === "vedic_shadbala-s6" && c.birth.lat > 64 && c.birth.date.endsWith("06-21")), "64,15°K yaz ortası vakası mevcut");
  });
  await t("C Vedik gün kuralı (beklenenler DE440 + Skyfield kesin referansıyla; QA 61-bala-kutup/kural-c-kesin.json; Tromsø yerel saat)", () => {
    const T = { latitude: 69.6492, longitude: 18.9553, timezone: "Europe/Oslo" };
    // Kesin referans: 25.11.2024 doğuş 10:49 batış 12:12 · 26.11 doğuş 11:05 batış 11:56 · 27.11–14.01 doğuş/batış YOK · 15.01 doğuş 11:46
    // batış 12:01 · 16.05 doğuş 01:25, batış 17.05 00:12 · 17.05 doğuş 01:08, batış YOK (kutup günü 26.07 00:23 batışına dek) · 15.05 normal.
    const c: [string, string, boolean, string][] = [
      ["2024-11-25", "11:30", false, "gündüz"],
      ["2024-11-25", "20:00", false, "gece 26.11 11:05 doğuşuyla biter → tanımlı"],
      ["2024-11-26", "20:00", true, "batış sonrası; gece doğuşla bitmez (kutup gecesi)"],
      ["2024-12-21", "12:00", true, "kutup gecesi"],
      ["2024-01-15", "05:00", true, "doğuş öncesi; gece bir batışla başlamaz (kutup gecesi)"],
      ["2024-01-15", "11:55", false, "kutup gecesi sonrası ilk kısa gündüz"],
      ["2024-01-16", "05:00", false, "doğuş öncesi; gece 15.01 12:01 batışıyla başlar → tanımlı"],
      ["2024-05-15", "12:00", false, "kutup günü öncesi normal gün"],
      ["2024-05-16", "23:45", false, "batış 00:12'de → hâlâ gündüz"],
      ["2024-05-17", "00:30", false, "16.05 batışı (00:12) ile 17.05 doğuşu (01:08) arasındaki tanımlı gece"],
      ["2024-05-17", "12:00", true, "doğuş var, batış yok → gündüz kapanmıyor"],
      ["2024-05-18", "12:00", true, "kutup günü"],
      ["2024-03-20", "12:00", false, "ekinoks"],
    ];
    for (const [d, h, want, why] of c) assert.equal(balaPolarBirth({ ...T, birthDate: d, birthTime: h }), want, `${d} ${h}: ${why}`);
    assert.equal(balaPolarBirth({ birthDate: "2024-12-21", birthTime: "12:00", latitude: -77.85, longitude: 166.67, timezone: "Antarctica/McMurdo" }), true, "güney yarımküre kutup günü");
    assert.equal(balaPolarBirth({ birthDate: "2024-06-21", birthTime: "12:00", latitude: 65.0, longitude: 25.47, timezone: "Europe/Helsinki" }), false, "65°K gündönümü (kutup dairesi altı)");
    assert.equal(balaPolarBirth({ birthDate: "2045-06-21", birthTime: "23:50", latitude: 64.1466, longitude: -21.9426, timezone: "Atlantic/Reykjavik" }), false, "64,15°K yaz ortası, batış 00:03 → gündüz");
  });
  await t("D ekran: uyarı yalnız koşulda; uyarı dışındaki işaretleme BİREBİR aynı; doğum verisi yoksa eski görünüm", () => {
    for (const c of REAL) {
      const tech = project(c);
      const withM = ssr(c.technique, tech, moment(c)), none = ssr(c.technique, tech, null);
      assert.equal(NOTICE_RE.test(none), false, `${c.id}: doğum verisi yokken uyarı olmamalı`);
      if (POLAR_IDS.has(c.id)) {
        assert.ok(NOTICE_RE.test(withM), `${c.id}: uyarı yok`);
        assert.ok(withM.includes(BALA_POLAR_NOTICE[c.technique as "vedic.shadbala"].slice(0, 60)), `${c.id}: metin`);
        assert.equal(withM.replace(NOTICE_RE, ""), none, `${c.id}: uyarı dışı işaretleme değişmemeli`);
      } else assert.equal(withM, none, `${c.id}: koşul yokken işaretleme birebir aynı olmalı`);
      assert.ok(!/roxy/i.test(withM), "marka adı yok");
    }
  });
  await t("E Word/PDF: kutup vakasında aynı uyarı (Shadbala + Bhava Bala); koşul yoksa yok; sayısal satırlar teknik veriyle aynı", async () => {
    for (const c of REAL.filter((x) => POLAR_IDS.has(x.id) || x.id.endsWith("-s6"))) {
      const tech = project(c);
      const r = report(c, tech);
      const txt = reportTexts(r).join("\n");
      const notice = BALA_POLAR_NOTICE[c.technique as "vedic.shadbala" | "vedic.bhava_bala"];
      assert.equal(txt.includes(notice), POLAR_IDS.has(c.id), `${c.id}: rapor metni`);
      const docx = await docxText(await renderAstroReportDocx(r, null, symbolFontBuffers()));
      const pdf = await pdfText(Buffer.from(buildAstroReportPdf(r, null, FONT_B64, symbolFontsBase64())));
      const probe = "klasik tanımla hesaplanamaz";
      assert.equal(docx.includes(probe), POLAR_IDS.has(c.id), `${c.id}: Word`);
      assert.equal(pdf.includes(probe), POLAR_IDS.has(c.id), `${c.id}: PDF`);
      if (c.technique === "vedic.shadbala") for (const p of tech.planets) assert.ok(txt.includes(p.totalRupas.toFixed(2).replace(".", ",")) || txt.includes(p.totalRupas.toFixed(2)), `${c.id}: ${p.id} toplam rupa raporda`);
      else for (const b of tech.bhavas) assert.ok(txt.includes(b.totalRupas.toFixed(2).replace(".", ",")) || txt.includes(b.totalRupas.toFixed(2)), `${c.id}: ev ${b.house} toplam rupa raporda`);
    }
  });
  await t("F teknik veri değişmez (uyarı teknik veriye yazılmaz); diğer teknikler, saat yok, geçersiz saat dilimi → uyarı yok", () => {
    for (const c of REAL) assert.ok(!JSON.stringify(project(c)).includes("polar"), `${c.id}: teknik veride kutup alanı olmamalı`);
    const s7 = moment(REAL.find((c) => c.id === "vedic_shadbala-s7"));
    assert.ok(balaPolarNotice("vedic.shadbala", s7) && balaPolarNotice("vedic.bhava_bala", s7));
    for (const other of ["vedic.d1", "vedic.ashtakavarga", "vedic.upagraha", "western.natal"]) assert.equal(balaPolarNotice(other, s7), null, other);
    assert.equal(balaPolarNotice("vedic.shadbala", { ...s7, birthTime: null }), null);
    assert.equal(balaPolarNotice("vedic.shadbala", { ...s7, timezone: "Yok/Boyle" }), null);
    assert.equal(balaPolarNotice("vedic.shadbala", null), null);
    const r = resolveAstroBirthTime("2024-06-21", "12:00", "Europe/Oslo");
    assert.equal(balaPolarBirth({ ...s7, timezone: null, utcOffsetSeconds: r.kind === "ok" ? r.offsetSeconds : null }), true, "ofsetle aynı karar");
  });
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
void main();
