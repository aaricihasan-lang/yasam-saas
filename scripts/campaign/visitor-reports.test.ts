// KAMPANYA MERKEZİ — ziyaretçi raporları birim testi (DB/ağ YOK; sağlayıcı çağrısı YOK; KREDİ HARCANMAZ).
// Kapsam: Klasik Numeroloji (kişi / uyum / işletme / isimler) Word + kişi PNG; yorum KAPALI → normalize sonuçtaki HİÇBİR yorum
// metni rapora girmez, hesap değerleri (adım izi, sayılar) korunur; yorum AÇIK → yorumlar girer; taş / uğurlu taş HİÇBİR koşulda
// yok; kayıt atıfları kampanya diline uyarlanmış; girdi nesnesi değişmez. Bütüncül Numeroloji Word (yalnız Hesap Özeti; Bilgi
// Bankası / taş / kitap metni yok; ekran sayılarıyla aynı). Lilly Word (soru metni yok). Ortak katman: boyut bütçesi, tam düğüm
// değişimi, dosya adında kişi adı yok. Atlas raporları visitor-atlas.test.ts içinde (37 teknik, katı golden).
// Çalıştırma: npx tsx --tsconfig scripts/campaign/tsconfig.json scripts/campaign/visitor-reports.test.ts
import { BUSINESS_RECORD, CHART, NAMES_RECORD, PERSON_RECORD, RELATIONSHIP_RECORD } from "../numeroloji-klasik/report/fixtures";
import { buildNumkReports, publicClassicResult, stripClassicInterpretations } from "@/lib/campaign/visitor/reports/numk";
import { buildClassicPngSvg } from "@/lib/numeroloji-klasik/report/pngSvg";
import { campaignFilename, docxPlainText, fitReports, rewriteDocxText, type ReportFile } from "@/lib/campaign/visitor/reports/files";
import { numbAnalysis } from "@/lib/campaign/visitor/runners/numb";
import { atlasLilly } from "@/lib/campaign/visitor/runners/lilly";
import { Document, Packer, Paragraph, TextRun } from "docx";
import type { ClassicAnalysisRequest } from "@/lib/numeroloji-klasik/input";
import type { ClassicReportRecord } from "@/lib/numeroloji-klasik/report/types";
import type { RunContext } from "@/lib/campaign/visitor/runners/shared";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const NOW = new Date("2026-11-03T08:00:00Z");

// Bağımsız kehanet: yorum alanı adları (uygulamadaki listeden AYRI yazıldı — model.ts'ye göre).
const INTERP = new Set(["meaning", "compoundMeaning", "description", "summary", "forecast", "advice", "guidance", "theme", "focus", "message", "dailyMessage", "note", "strengths", "challenges", "opportunities", "keywords", "lesson", "howToOvercome", "challenge", "resolution", "career", "relationships", "spirituality", "industries", "title", "personalMonthTheme", "personalYearTheme", "cycle"]);
function collect(v: unknown, interp: boolean, outI: Set<string>, outD: Set<string>, data = false) {
  if (typeof v === "string") (interp && !data ? outI : outD).add(v);
  else if (Array.isArray(v)) v.forEach((x) => collect(x, interp, outI, outD, data));
  // Doğrulama alt ağacı (bağımsız kontrol notu dahil) hesap verisidir.
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) collect(x, interp || INTERP.has(k), outI, outD, data || k === "verification");
}
/** Yalnız yorum alanlarında geçen (veri alanlarında geçmeyen), ayırt edici uzunlukta metinler. */
function interpTexts(result: Record<string, unknown>): string[] {
  const i = new Set<string>();
  const d = new Set<string>();
  const rest = { ...((result.chart ?? {}) as Record<string, unknown>) };
  delete rest.luckyAssociations;
  collect({ ...result, chart: result.chart ? rest : undefined }, false, i, d);
  return [...i].filter((t) => t.length >= 12 && ![...d].some((x) => x.includes(t)));
}
const calcTraces = (result: Record<string, unknown>): string[] => {
  const out: string[] = [];
  const w = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(w);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (k === "calculation" && typeof x === "string" && x.length > 8) out.push(x);
        else w(x);
      }
    }
  };
  w(result);
  return out;
};
const GEMS = [...CHART.luckyAssociations!.gemstones, ...CHART.luckyAssociations!.colors];
const reqOf = (r: ClassicReportRecord): ClassicAnalysisRequest => ({ kind: r.kind, title: "Kampanya", clientId: null, techniques: [...r.techniques], input: r.input } as unknown as ClassicAnalysisRequest);
const b64 = (f: ReportFile) => Buffer.from(f.base64, "base64");

(async () => {
  // ── Klasik Numeroloji: 4 rapor türü × yorum kapalı / açık ──
  for (const [label, rec] of [["kişi", PERSON_RECORD], ["uyum", RELATIONSHIP_RECORD], ["işletme", BUSINESS_RECORD], ["isimler", NAMES_RECORD]] as const) {
    const texts = interpTexts(rec.result);
    const before = JSON.stringify(rec.result);
    const off = await buildNumkReports({ req: reqOf(rec), title: "Test", result: rec.result, status: rec.status, referenceDate: rec.referenceDate ?? null, commentsEnabled: false, now: NOW, dayTr: "2026-11-03" });
    const on = await buildNumkReports({ req: reqOf(rec), title: "Test", result: rec.result, status: rec.status, referenceDate: rec.referenceDate ?? null, commentsEnabled: true, now: NOW, dayTr: "2026-11-03" });
    const word = (fs: ReportFile[]) => fs.find((f) => f.kind === "docx");
    const tOff = word(off) ? await docxPlainText(b64(word(off)!)) : "";
    const tOn = word(on) ? await docxPlainText(b64(word(on)!)) : "";
    check(`K01 ${label}: Word üretildi (geçerli zip), dosya adı kişi adı içermez`, !!word(off) && b64(word(off)!).subarray(0, 2).toString() === "PK" && /^yasam-sistemi-numeroloji-[a-z]+-2026-11-03\.docx$/.test(word(off)!.filename), JSON.stringify(off.map((f) => f.filename)));
    const leaked = texts.filter((t) => tOff.includes(t));
    check(`K02 ${label}: yorum KAPALI → ${texts.length} yorum metninin HİÇBİRİ raporda yok`, texts.length > 0 && leaked.length === 0, JSON.stringify(leaked.slice(0, 3)));
    // Hesap verisi korunur: uzman kurucusunun yorumlu raporda bastığı her hesap izi yorumsuz raporda da var.
    const traces = calcTraces(rec.result).filter((t) => tOn.includes(t.slice(0, 20)));
    check(`K03 ${label}: yorum KAPALI → hesap izleri (${traces.length}) korunur`, traces.every((t) => tOff.includes(t.slice(0, 20))), JSON.stringify(traces.filter((t) => !tOff.includes(t.slice(0, 20))).slice(0, 2)));
    const onHits = texts.filter((t) => tOn.includes(t)).length;
    check(`K04 ${label}: yorum AÇIK → yorum metinleri raporda (${onHits}/${texts.length})`, onHits >= 1);
    check(`K05 ${label}: taş / uğurlu renk HİÇBİR politikada yok`, !GEMS.some((g) => tOff.includes(g) || tOn.includes(g)));
    check(`K06 ${label}: "Danışan" ve "kayıtlı analizden" yok; uzman adı / Hazırlayan yok`, ![tOff, tOn].some((t) => t.includes("Danışan") || t.includes("kayıtlı analizden") || t.includes("Hazırlayan")));
    check(`K07 ${label}: girdi sonucu DEĞİŞMEDİ (derin kopya)`, JSON.stringify(rec.result) === before);
    check(`K08 ${label}: sağlayıcı adı yok`, ![tOff, tOn].some((t) => /roxy/i.test(t)));
  }
  // Kişi: PNG
  const pOff = await buildNumkReports({ req: reqOf(PERSON_RECORD), title: "Test", result: PERSON_RECORD.result, status: "complete", referenceDate: "2026-10-29", commentsEnabled: false, now: NOW, dayTr: "2026-11-03" });
  const png = pOff.find((f) => f.kind === "png");
  check("P01 kişi: görsel PNG üretildi (imza, ≥ 2000 px genişlik)", !!png && b64(png).subarray(1, 4).toString() === "PNG" && b64(png).readUInt32BE(16) >= 2000);
  const svgOff = buildClassicPngSvg({ ...PERSON_RECORD, result: stripClassicInterpretations(PERSON_RECORD.result) }, { generatedAt: NOW })!.svg;
  const svgTexts = interpTexts(PERSON_RECORD.result).map((t) => t.slice(0, 18).replace(/&/g, "&amp;"));
  check("P02 kişi PNG (yorum kapalı): SVG'de yorum metni yok, çekirdek sayılar var", svgTexts.every((t) => !svgOff.includes(t)) && svgOff.includes(String(CHART.core.lifePath.value)));
  check("P03 uyum / işletme / isimler için PNG üretilmez (yalnız kişi kurucusu var)", !(await buildNumkReports({ req: reqOf(BUSINESS_RECORD), title: "T", result: BUSINESS_RECORD.result, status: "complete", referenceDate: null, commentsEnabled: false, now: NOW, dayTr: "2026-11-03" })).some((f) => f.kind === "png"));
  const pub = publicClassicResult(PERSON_RECORD.result) as { chart: { luckyAssociations: unknown; core: { lifePath: { meaning: unknown } } } };
  check("P04 yorum AÇIK politika: yorum kalır, uğurlu eşleşmeler (taş) çıkar", pub.chart.luckyAssociations === null && pub.chart.core.lifePath.meaning !== null);

  // ── Bütüncül Numeroloji (gerçek yerel motor) ──
  const ctx = { now: NOW, commentsEnabled: false } as unknown as RunContext;
  const nv = numbAnalysis.parse({ firstName: "Ayşe", lastName: "Yılmaz", birthDate: "1985-03-15" }, NOW);
  const no = nv.ok ? await numbAnalysis.run(ctx, nv.value) : null;
  const nf = no?.ok ? (no.result.reports ?? []).find((f) => f.kind === "docx") : undefined;
  const nt = nf ? await docxPlainText(b64(nf)) : "";
  const screenPin = no?.ok ? (no.result.blocks.find((b) => b.title === "PİN kodu") as { text?: string } | undefined)?.text ?? "" : "";
  check("B01 Bütüncül: Word üretildi", !!nf && /^yasam-sistemi-butuncul-numeroloji-2026-11-03\.docx$/.test(nf.filename), no && !no.ok ? no.message : JSON.stringify(no?.ok ? no.result.notes : null));
  check("B02 Bütüncül: Hesap Özeti bölümleri (PIN, Çakra, Elementler) + kişi adı belgede", ["PIN Kodu", "Çakra Omurgası", "Elementler", "Ayşe Yılmaz"].every((x) => nt.includes(x)));
  check("B03 Bütüncül: Bilgi Bankası yorumu / taş / kitap zamanlama metni YOK; Danışan yok", !/Bilgi Bankası Açıklamaları|Ana Yorumlar|Taş Destekleri|Zamanlama|Danışan/.test(nt));
  const ana = no?.ok ? (no.result.blocks[0] as unknown as { rows: [string, string][] }).rows.find(([k]) => k === "Ana Kulvar")?.[1] ?? "" : "";
  check("B04 Bütüncül: ekrandaki değerlerle aynı motor çıktısı (Ana Kulvar + PİN rakamları)", !!ana && nt.includes(ana.split(/\s/)[0]) && screenPin.length > 0, `ana=${ana}`);

  // ── Lilly ──
  const lv = atlasLilly.parse({ qDate: "2026-11-03", qTime: "10:15", place: "tr-34-istanbul", house: "7" }, NOW);
  const lo = lv.ok ? await atlasLilly.run(ctx, lv.value) : null;
  const lf = lo?.ok ? (lo.result.reports ?? [])[0] : undefined;
  const lt = lf ? await docxPlainText(b64(lf)) : "";
  check("L01 Lilly: Word üretildi", !!lf && lf.kind === "docx" && /^yasam-sistemi-horary-lilly-2026-11-03\.docx$/.test(lf.filename), lo && !lo.ok ? lo.message : "");
  check("L02 Lilly: soru metni alanı yok, DEMO yok, kayıt künyesi yok, Rapor bilgisi var", !/Soru:|DEMO|Kayıt başlığı|Kayıtlı sonuç|Danışan|kayıtlı analizden/.test(lt) && lt.includes("Rapor bilgisi") && lt.includes("Göstergeler") === lt.includes("Göstergeler"));
  check("L03 Lilly: rapordaki soru anı ekranla aynı", !!lo?.ok && lt.includes("03.11.2026 10:15"));

  // ── Ortak katman ──
  const big = [{ kind: "docx", filename: "a", base64: "x".repeat(10), label: "A" }, { kind: "png", filename: "b", base64: "y".repeat(30), label: "B" }, { kind: "docx", filename: "c", base64: "z".repeat(5), label: "C" }] as ReportFile[];
  const fit = fitReports(big, 20);
  check("F01 boyut bütçesi: sığmayan dosya düşer (öncelik sırası korunur), not etiketi döner", fit.files.map((f) => f.filename).join() === "a,c" && fit.dropped.join() === "B");
  const doc = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun("Danışan")] }), new Paragraph({ children: [new TextRun("Danışan Ayşe")] }), new Paragraph({ children: [new TextRun("A & B < C")] })] }] }));
  const rw = await rewriteDocxText(doc, [["Danışan", "Kişi"], ["A & B < C", "x & y"]]);
  const rt = await docxPlainText(rw.buffer);
  check("F02 yalnız TAM metin düğümü değişir (kısmi eşleşme yok), XML kaçışı doğru", rw.counts[0] === 1 && rw.counts[1] === 1 && rt.includes("Kişi") && rt.includes("Danışan Ayşe") && rt.includes("x & y"), JSON.stringify(rw.counts));
  check("F03 dosya adı güvenli (yol / boşluk / Türkçe karakter yok)", campaignFilename("../a b/ç", "2026-11-03", "docx") === "yasam-sistemi-a-b-2026-11-03.docx", campaignFilename("../a b/ç", "2026-11-03", "docx"));

  console.log(`\nvisitor-reports: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
