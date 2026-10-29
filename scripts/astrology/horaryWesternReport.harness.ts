/**
 * GÖKYÜZÜ ATLASI — Batı Horary (William Lilly) Word / PDF raporu. Gerçek hesaplama (runWesternHorary) → rapor modeli → GERÇEK
 * docx (JSZip ile açılır) ve GERÇEK PDF (unpdf ile metin çıkarılır). Beklentiler sonuç nesnesinden bağımsız biçimlendirilir
 * (ev başlangıçları ve gezegen boylamları rapor metninde birebir aranır). Ağ / veritabanı / ücretli çağrı YOK.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/horaryWesternReport.harness.ts
 */
import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractText, getDocumentProxy } from "unpdf";
import { runWesternHorary, type WesternHoraryResult } from "@/lib/astrology/horary/westernRun";
import { buildHoraryReport, horaryFileBase } from "@/lib/astrology/horary/westernReport";
import { renderHoraryReport } from "@/lib/astrology/horary/westernReportService";
import { reportTexts } from "@/lib/astrology/report/model";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    process.stderr.write(`FAIL ${name}\n  ${(e as Error).stack ?? String(e)}\n`);
  }
}
const IST = { label: "İstanbul, Türkiye", timezone: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784 };
const GEN = "2026-10-29T12:00:00.000Z";
const SIGN_TR = ["Koç", "Boğa", "İkizler", "Yengeç", "Aslan", "Başak", "Terazi", "Akrep", "Yay", "Oğlak", "Kova", "Balık"];
/** Bağımsız biçimleme: "12°34′ <glif> Burç" içinden derece-dakika + burç adı. */
const degSign = (lon: number) => {
  const n = ((lon % 360) + 360) % 360;
  const d = n % 30;
  let deg = Math.floor(d);
  let min = Math.round((d - deg) * 60);
  if (min === 60) {
    min = 0;
    deg += 1;
  }
  return { dm: `${deg}°${String(min).padStart(2, "0")}′`, sign: SIGN_TR[Math.floor(n / 30)] };
};
const norm = (x: string) => x.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");

async function main() {
  const run = runWesternHorary({ date: "2026-10-29", time: "14:30", place: IST, quesitedHouse: 7 });
  assert.ok(run.ok);
  const R: WesternHoraryResult = run.result;
  const Q = "DEMO — Bu ortaklık teklifi gerçekleşecek mi?";

  await t("RP1 model: DEMO uyarısı ilk blok, kapakta DEMO; soru yalnız verildiyse; dosya adı ASCII, soru metni içermez", () => {
    const withQ = buildHoraryReport(R, { question: Q, demo: true, generatedAt: GEN });
    const noQ = buildHoraryReport(R, { question: null, demo: false, generatedAt: GEN });
    assert.ok(withQ.blocks[0].kind === "para" && /^DEMO/.test(withQ.blocks[0].text));
    assert.equal(withQ.cover.client, "DEMO girdisi");
    assert.ok(reportTexts(withQ).some((x) => x.includes(Q)));
    assert.ok(!reportTexts(noQ).some((x) => x.includes("ortaklık teklifi")));
    assert.ok(!reportTexts(noQ).some((x) => /DEMO/.test(x)), "DEMO olmayan raporda DEMO metni olmamalı");
    assert.match(withQ.fileBase, /^[A-Za-z0-9-]+$/);
    assert.equal(withQ.fileBase, "Horary-William-Lilly-2026-10-29-1430-DEMO");
    assert.equal(horaryFileBase(R, false), "Horary-William-Lilly-2026-10-29-1430");
  });

  await t("RP2 model: hüküm dili YOK (evet/hayır kararı, 'gerçekleşir/gerçekleşmez', 'olumlu/olumsuz sonuç'); aday grupları motor kayıt sayısıyla birebir", () => {
    const rep = buildHoraryReport(R, { question: null, demo: false, generatedAt: GEN });
    const all = reportTexts(rep).join("\n");
    assert.ok(!/gerçekleş(ir|mez|ecek)|olumlu sonuç|olumsuz sonuç|kesin hüküm|cevap: (evet|hayır)/i.test(all));
    const bullets = (title: string) => {
      const i = rep.blocks.findIndex((b) => b.kind === "heading" && b.text === title);
      const nb = rep.blocks[i + 1];
      return nb && nb.kind === "bullets" ? nb.items.filter((x) => x !== "Yok.").length : -1;
    };
    const cand = R.pairs.reduce((n, p) => n + p.analysis.interpositions.filter((x) => x.kind !== "unresolved").length + (p.analysis.refranation ? 1 : 0), 0);
    const unr = R.pairs.reduce((n, p) => n + p.analysis.interpositions.filter((x) => x.kind === "unresolved").length, 0);
    const trs = R.pairs.reduce((n, p) => n + p.analysis.translations.length + p.analysis.collections.length, 0);
    assert.equal(bullets("Aday — kaynak tanımına uyan olay"), cand);
    assert.equal(bullets("Sınıflandırılamayan — kaynak bu durumu çözmüyor"), unr);
    assert.equal(bullets("Klasik şartları sağlanan") + bullets("Şartı eksik, kesintili veya sırası/hareketi belirsiz — geçerli sonuç değil"), trs);
  });

  const docx = await renderHoraryReport(R, "docx", { question: Q, demo: true, generatedAt: GEN });
  const zip = await JSZip.loadAsync(Buffer.from(docx.bytes));
  const xml = await zip.file("word/document.xml")!.async("string");
  const dtext = norm([...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" "));

  await t("RP3 Word: gerçek .docx (zip + word/document.xml), çark PNG gömülü, dosya adı ve tür doğru", async () => {
    assert.equal(docx.contentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(docx.filename, "Horary-William-Lilly-2026-10-29-1430-DEMO.docx");
    assert.ok(docx.hasChart);
    const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && f.endsWith(".png"));
    assert.ok(media.length >= 1, "çark görseli gömülü olmalı");
    assert.ok((await zip.file(media[0])!.async("uint8array")).byteLength > 20_000, "çark PNG'si boş olmamalı");
  });

  await t("RP4 Word içeriği gerçek hesaplamayla eşleşir: UTC, göstergeler, 12 ev başlangıcı ve 7 gezegen boylamı (bağımsız biçimleme), bölüm başlıkları, DEMO ve soru", () => {
    assert.ok(dtext.includes("2026-10-29 11:30:00 UTC"));
    for (const lon of R.chart.cusps) {
      const x = degSign(lon);
      assert.ok(dtext.includes(x.dm) && dtext.includes(x.sign), `ev başlangıcı ${x.dm} ${x.sign}`);
    }
    for (const p of R.chart.planets) assert.ok(dtext.includes(degSign(p.lon).dm), `${p.planet} ${degSign(p.lon).dm}`);
    for (const h of ["Soru ve hesaplama bilgileri", "Horary çarkı", "Göstergeler", "Ay'ın durumu", "Gezegenler, asal ve arızi asalet", "Regiomontanus ev başlangıçları", "Kabul (reception) ilişkileri", "Orb içindeki açılar", "Olay çizelgesi", "Işık aktarımı, toplanma, engelleme, hüsran ve refranation", "Radikallik ve dikkat noktaları", "Kaynak ve metodoloji"])
      assert.ok(dtext.includes(h), `başlık: ${h}`);
    assert.ok(dtext.includes("Satürn") && dtext.includes("Güneş") && dtext.includes("7. ev"));
    assert.ok(dtext.includes("DEMO") && dtext.includes("ortaklık teklifi"));
    assert.ok(dtext.includes("Christian Astrology (1647)"));
  });

  await t("RP5 PDF: gerçek PDF (%PDF, metin çıkarılabilir), çark görseli var, içerik Word ile aynı kaynaktan (UTC, ev başlangıçları, başlıklar, DEMO)", async () => {
    const pdf = await renderHoraryReport(R, "pdf", { question: Q, demo: true, generatedAt: GEN });
    assert.equal(pdf.contentType, "application/pdf");
    assert.equal(Buffer.from(pdf.bytes.slice(0, 5)).toString("latin1"), "%PDF-");
    assert.ok(pdf.bytes.byteLength > 60_000, `PDF boyutu ${pdf.bytes.byteLength}`);
    assert.ok(Buffer.from(pdf.bytes).toString("latin1").includes("/Subtype /Image"), "çark görseli PDF'te olmalı");
    const { text, totalPages } = await extractText(await getDocumentProxy(new Uint8Array(pdf.bytes)), { mergePages: true });
    const ptext = norm(String(text));
    assert.ok(totalPages >= 3, `sayfa ${totalPages}`);
    assert.ok(ptext.includes("11:30:00 UTC"), "UTC");
    for (const lon of R.chart.cusps.slice(0, 4)) assert.ok(ptext.includes(degSign(lon).dm), `ev ${degSign(lon).dm}`);
    for (const h of ["Soru ve hesaplama bilgileri", "Göstergeler", "Regiomontanus ev başlangıçları", "Radikallik ve dikkat noktaları"]) assert.ok(ptext.includes(h), `başlık: ${h}`);
    assert.ok(ptext.includes("DEMO"));
    console.log(`  bilgi: PDF ${totalPages} sayfa, ${(pdf.bytes.byteLength / 1024).toFixed(0)} KB · Word ${(docx.bytes.byteLength / 1024).toFixed(0)} KB`);
  });

  await t("RP6 soru metni işaretlenmezse Word'de YOK; DEMO olmayan raporda DEMO yok", async () => {
    const d = await renderHoraryReport(R, "docx", { question: null, demo: false, generatedAt: GEN });
    const z = await JSZip.loadAsync(Buffer.from(d.bytes));
    const tx = norm([...(await z.file("word/document.xml")!.async("string")).matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" "));
    assert.ok(!tx.includes("ortaklık teklifi"));
    assert.ok(!tx.includes("DEMO"));
    assert.equal(d.filename, "Horary-William-Lilly-2026-10-29-1430.docx");
  });

  console.log(`\nastrology horary-western-report (Word/PDF) harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
