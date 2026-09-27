/**
 * FAZ1 FINAL HARDENING — PAKET WORD — GERÇEK DOCX harness (FA-02 / FA-16 / FA-26 / FA-41).
 *
 * Saf belge kurucularını sabit `now` + örnek veriyle çağırır → Packer.toBuffer → JSZip →
 * word/document.xml + footer XML metni üzerinde doğrular:
 *   - timestamptz → Europe/Istanbul: 07:00Z randevu "10:00" basılır, "07:00" basılmaz;
 *     01:30 (yerel) randevu kendi gününde gruplanır/filtrelenir; rapor tarihi + dosya adı yerel gün.
 *   - DATE / TEXT alanlar (stone_date, clients.dogum/gorusme, numerology birth_date) KAYMAZ.
 *   - Sade bilgilendirme notu (rapor sonu tam metin + footer kısa metin) + "Hazırlayan: <ad>".
 *   - İç notlar (ödev expert_note, Şifa "Uzman Notu") VARSAYILAN yok; opt-in ile var.
 *   - Kullanıcı yazımı korunur (title-case YOK), Türkçe karakterler bozulmaz.
 *
 * DB/ağ YOK. Saat-dilimi bağımsızlığı için İKİ ortamda koşulmalı (Git Bash TZ aktarmaz):
 *   PowerShell:  $env:TZ="UTC"; npx tsx scripts/final-hardening/word-tz.harness.ts
 *                $env:TZ="America/Los_Angeles"; npx tsx scripts/final-hardening/word-tz.harness.ts
 */
import JSZip from "jszip";
import { Packer, type Document } from "docx";
import { wellnessNote } from "@/lib/docx/reportDisclaimer";
import {
  buildClientFullReport,
  buildClientTabReport,
  buildClientDateRangeReport,
  filterClientDatasetByRange,
  type ClientDataset,
} from "@/app/api/clients/[id]/word-report/clientReportBuilder";
import { buildAjandaReportDoc, ajandaStatusLabel } from "@/app/api/ajanda/word-report/buildAjandaReport";
import { buildBioSessionReportDoc } from "@/app/api/biyoenerji/session-report/buildSessionReport";
import { buildStoneReportDoc, type StoneReportRow } from "@/app/api/dogaltas/stones/[id]/word-report/buildStoneReport";
import { buildSifaReportChildren, type WordGuideRaw, type WordSectionRow } from "@/lib/sifa-rehberi/wordDocument";
import { buildAromaDoc } from "@/lib/aromaterapi/report/document";
import { renderBlendFormula } from "@/lib/aromaterapi/report/render/blends";
import type { BlendExportRow } from "@/lib/aromaterapi/report/reads";
import { dateStamp, humanDate, reportFilename } from "@/lib/aromaterapi/report/theme";
import { buildNumerolojiWordChildren, packNumerolojiDocx } from "@/app/numeroloji/bilgi-bankasi/helpers/wordDocxBuild";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { buildFooter } from "@/lib/docx/reportHelpers";
import { Document as DocxDocument } from "docx";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: unknown, detail?: string): void {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ── DOCX → düz metin ──────────────────────────────────────────────────────────
function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
/** Paragraf başına w:t metinlerini birleştirir; paragraflar "\n" ile ayrılır. */
function xmlText(xml: string): string {
  return xml
    .split("</w:p>")
    .map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join(""))
    .join("\n");
}
type Unzipped = { doc: string; footer: string; raw: string };
async function unzipBuf(buf: Buffer | Uint8Array): Promise<Unzipped> {
  const zip = await JSZip.loadAsync(buf);
  const raw = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const footers = Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f));
  let footer = "";
  for (const f of footers) footer += xmlText((await zip.file(f)!.async("string"))) + "\n";
  return { doc: xmlText(raw), footer, raw };
}
async function render(doc: Document): Promise<Unzipped> {
  return unzipBuf(await Packer.toBuffer(doc));
}

const EXPERT = "Ayşe Öğretmen-Işık";
const HAZ = `Hazırlayan: ${EXPERT}`;
const NOW = new Date("2026-09-26T22:30:00Z"); // İstanbul: 27 Eylül 2026 01:30 (UTC'de hâlâ 26'sı)

console.log(`\n[ortam] process TZ=${process.env.TZ ?? "(yok)"} · Intl=${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

async function main(): Promise<void> {
  // ════════ 1) DY — tam danışan raporu ═════════════════════════════════════════
  console.log("\n── DY tam rapor ──");
  const dy: ClientDataset = {
    client: {
      id: "c1", ad: "Ayşe Çiğdem", soyad: "McDonald Öztürk-Işık", telefon: "0555",
      dogum: "1990-03-15", gorusme: "27.09.2026", burc: "Balık", kan: "A Rh+", mizac: "sovdavi",
      profile_image_url: null,
    },
    notes: { saglik_notu: "Şeker hastalığı yok.", adres: "İzmir", oneriler: "Günlük yürüyüş.", notlar: null },
    appointments: [
      { id: "a1", title: "BEYİN KANAMASI takibi", notes: null, appointment_date: "2026-09-27T07:00:00Z", status: "bekliyor" },
      { id: "a2", title: "Gece görüşmesi", notes: null, appointment_date: "2026-09-26T22:30:00Z", status: "tamamlandi" },
    ],
    stones: [{ id: "s1", stone_name: "iolit", stone_type: "Taşıma", stone_date: "2026-09-27", created_at: "2026-09-27T09:00:00Z" }],
    sessions: [{ id: "se1", session_date: "2026-09-27", session_type: "Enerji Seansı", duration_minutes: 45, created_at: "2026-09-27T09:00:00Z" }],
    homeworks: [{
      id: "h1", title: "Nefes çalışması", homework_type: "Günlük", description: "Sabah 5 dk.",
      start_date: "2026-09-27", end_date: "2026-10-04", status: "devam",
      expert_note: "GIZLI_UZMAN_NOTU_XYZ", client_feedback: "İyi geldi.", created_at: "2026-09-27T09:00:00Z",
    }],
    analyses: [{ id: "an1", analysis_type: "chakra", analysis_data: null, note: "Analiz notu", created_at: "2026-09-26T22:22:00Z" }],
    charges: [{ id: "ch1", charge_date: "2026-09-27", category: "session", detail: "Seans", amount: 1500, created_at: "2026-09-27T09:00:00Z" }],
  };
  const full = buildClientFullReport({ data: dy, profileImg: null }, { now: NOW, expertName: EXPERT });
  const fr = await render(full.doc);
  check("DY: randevu 07:00Z → '27.09.2026 10:00'", fr.doc.includes("27.09.2026 10:00"));
  check("DY: '07:00' HİÇ basılmaz", !fr.doc.includes("07:00"));
  check("DY: gece randevusu kendi gününde '27.09.2026 01:30' (26.09 22:30 değil)", fr.doc.includes("27.09.2026 01:30") && !fr.doc.includes("26.09.2026 22:30"));
  check("DY: analiz 22:22Z → '27.09.2026 01:22'", fr.doc.includes("27.09.2026 01:22") && !fr.doc.includes("22:22"));
  check("DY: rapor tarihi yerel gün '27 Eylül 2026'", fr.doc.includes("Oluşturulma Tarihi: 27 Eylül 2026"));
  check("DY: dosya adı yerel gün (…-2026-09-27.docx)", full.filename.endsWith("-2026-09-27.docx"), full.filename);
  check("DY: DATE stone_date kaymaz '27.09.2026'", /Tarih27\.09\.2026/.test(fr.doc.replace(/\n/g, "")));
  check("DY: TEXT dogum ISO → '15.03.1990' (kaymaz)", fr.doc.includes("15.03.1990"));
  check("DY: TEXT gorusme 'GG.AA.YYYY' aynen", fr.doc.includes("27.09.2026"));
  check("DY: bilgilendirme tam metni var", fr.doc.includes(wellnessNote("danisan").full));
  check("DY: footer kısa not var", fr.footer.includes(wellnessNote("danisan").short));
  check(`DY: "${HAZ}" var`, fr.doc.includes(HAZ));
  check("DY: expert_note VARSAYILAN yok", !fr.doc.includes("GIZLI_UZMAN_NOTU_XYZ") && !fr.doc.includes("Uzman Notu"));
  check("DY: danışan geri bildirimi korunur", fr.doc.includes("İyi geldi."));
  check("DY: kullanıcı yazımı korunur (BEYİN KANAMASI)", fr.doc.includes("BEYİN KANAMASI takibi"));
  check("DY: ad title-case'e zorlanmaz (McDonald)", fr.doc.includes("McDonald Öztürk-Işık") && !fr.doc.includes("Mcdonald"));
  check("DY: taş adı yazıldığı gibi (iolit)", fr.doc.includes("iolit") && !fr.doc.includes("Iolit"));
  check("DY: mizaç kodu etikete çevrilir (Sovdavi)", fr.doc.includes("Sovdavi") && !/Mizaçsovdavi/.test(fr.doc.replace(/\n/g, "")));
  check("DY: Türkçe karakterler bozulmaz", fr.doc.includes("Ayşe Çiğdem") && fr.doc.includes("Şeker hastalığı") && fr.doc.includes("İzmir") && !/Ä|Å|Ã/.test(fr.doc));

  const fullOptIn = await render(buildClientFullReport({ data: dy, profileImg: null }, { now: NOW, expertName: EXPERT, includeExpertNotes: true }).doc);
  check("DY: includeExpertNotes=true → expert_note VAR", fullOptIn.doc.includes("GIZLI_UZMAN_NOTU_XYZ") && fullOptIn.doc.includes("Uzman Notu"));

  const tabHw = await render(buildClientTabReport({ tab: "odevler", client: dy.client, notes: dy.notes, rows: dy.homeworks }, { now: NOW, expertName: EXPERT }).doc);
  check("DY sekme(odevler): expert_note varsayılan yok", !tabHw.doc.includes("GIZLI_UZMAN_NOTU_XYZ"));
  check("DY sekme(odevler): not + Hazırlayan var", tabHw.doc.includes(wellnessNote("danisan").full) && tabHw.doc.includes(HAZ));
  const tabHwOpt = await render(buildClientTabReport({ tab: "odevler", client: dy.client, notes: dy.notes, rows: dy.homeworks }, { now: NOW, includeExpertNotes: true }).doc);
  check("DY sekme(odevler): opt-in → expert_note var", tabHwOpt.doc.includes("GIZLI_UZMAN_NOTU_XYZ"));
  const noName = await render(buildClientTabReport({ tab: "genel", client: dy.client, notes: dy.notes, rows: [] }, { now: NOW }).doc);
  check("DY: uzman adı yoksa 'Hazırlayan' satırı basılmaz", !noName.doc.includes("Hazırlayan"));

  // Tarih aralığı filtresi — yerel takvim günü
  const r27 = filterClientDatasetByRange(dy, "2026-09-27", "2026-09-27");
  check("DY aralık: 01:30 (yerel 27'si) randevusu 27–27 aralığında", r27.appointments.some((a) => a.id === "a2"));
  const r26 = filterClientDatasetByRange(dy, "2026-09-26", "2026-09-26");
  check("DY aralık: 01:30 randevusu 26–26 aralığında DEĞİL", !r26.appointments.some((a) => a.id === "a2"));
  check("DY aralık: 22:22Z analiz yerel 27'sinde", r27.analyses.length === 1 && r26.analyses.length === 0);
  check("DY aralık: DATE stone_date kaymaz (27'de)", r27.stones.length === 1 && r26.stones.length === 0);
  const dr = buildClientDateRangeReport({ data: r27, drStart: "2026-09-27", drEnd: "2026-09-27", profileImg: null }, { now: NOW, expertName: EXPERT });
  const drx = await render(dr.doc);
  check("DY aralık: sınır etiketi kaymaz '27 Eylül 2026'", drx.doc.includes("27 Eylül 2026 — 27 Eylül 2026"));
  check("DY aralık: not + Hazırlayan + expert_note yok", drx.doc.includes(wellnessNote("danisan").full) && drx.doc.includes(HAZ) && !drx.doc.includes("GIZLI_UZMAN_NOTU_XYZ"));

  // ════════ 2) Ajanda ════════════════════════════════════════════════════════
  console.log("\n── Ajanda ──");
  const AJ_NOW = new Date("2026-09-26T21:30:00Z"); // İstanbul 27 Eylül 00:30
  const aj = buildAjandaReportDoc({
    appointments: [
      { id: "1", title: "Sabah görüşmesi", notes: null, appointment_date: "2026-09-27T07:00:00Z", created_at: "2026-09-01T00:00:00Z", client_id: "c1", status: "bekliyor" },
      { id: "2", title: "Gece görüşmesi", notes: null, appointment_date: "2026-09-26T22:30:00Z", created_at: "2026-09-01T00:00:00Z", client_id: null, status: "bekliyor" },
      { id: "3", title: "Geçmiş görüşme", notes: null, appointment_date: "2026-09-26T10:00:00Z", created_at: "2026-09-01T00:00:00Z", client_id: null, status: "bekliyor" },
    ],
    clientMap: new Map([["c1", "Ayşe Çiğdem"]]),
    exportMode: "all",
    expertName: EXPERT,
    now: AJ_NOW,
  });
  const ajx = await render(aj.doc);
  check("Ajanda: 07:00Z → '27.09.2026 10:00'", ajx.doc.includes("27.09.2026 10:00"));
  check("Ajanda: '07:00' basılmaz", !ajx.doc.includes("07:00"));
  const idx27 = ajx.doc.indexOf("27 Eylül 2026 Pazar");
  const idx26 = ajx.doc.indexOf("26 Eylül 2026 Cumartesi");
  const idx0130 = ajx.doc.indexOf("27.09.2026 01:30");
  check("Ajanda: gün başlıkları yerel (26 Cumartesi, 27 Pazar)", idx26 >= 0 && idx27 > idx26, `26@${idx26} 27@${idx27}`);
  check("Ajanda: 01:30 randevu 27 Eylül başlığı altında", idx0130 > idx27 && !ajx.doc.includes("26.09.2026 22:30"));
  check("Ajanda: geçmiş + bekliyor → 'Sonuç girilmedi'", ajx.doc.includes("Sonuç girilmedi"));
  check("Ajanda: gelecek bekliyor → 'Bekliyor' (türetilmiş durum saf)", ajandaStatusLabel("bekliyor", "2026-09-27T07:00:00Z", AJ_NOW) === "Bekliyor" && ajandaStatusLabel("bekliyor", "2026-09-26T10:00:00Z", AJ_NOW) === "Sonuç girilmedi" && ajandaStatusLabel("tamamlandi", "2026-09-26T10:00:00Z", AJ_NOW) === "Tamamlandı");
  check("Ajanda: rapor tarihi yerel '27 Eylül 2026'", ajx.doc.includes("Oluşturulma Tarihi: 27 Eylül 2026"));
  check("Ajanda: dosya adı yerel gün", aj.filename === "ajanda-all-2026-09-27.docx", aj.filename);
  check("Ajanda: Hazırlayan (özet tablosunda)", /Hazırlayan\n?Ayşe Öğretmen-Işık/.test(ajx.doc));
  const ajRange = buildAjandaReportDoc({ appointments: [], clientMap: new Map(), exportMode: "weekly", dateRange: { start: "2026-09-21", end: "2026-09-27" }, now: AJ_NOW });
  const ajRx = await render(ajRange.doc);
  check("Ajanda: tarih aralığı (DATE) kaymaz '21.09.2026 – 27.09.2026'", ajRx.doc.includes("21.09.2026 – 27.09.2026"));

  // ════════ 3) Biyoenerji seans ═════════════════════════════════════════════
  console.log("\n── Biyoenerji seans ──");
  const bio = buildBioSessionReportDoc({
    sessions: [{ id: "b1", tenant_id: "t", title: "Kök çakra dengeleme", content: "Şifa çalışması.", category: "Çakra", source: null, note: "Günlük tekrar.", created_at: "2026-09-26T22:22:00Z" }],
    exportMode: "single",
    expertName: EXPERT,
    now: NOW,
  });
  const biox = await render(bio.doc);
  check("Biyoenerji: 22:22Z → '27.09.2026 01:22'", biox.doc.includes("27.09.2026 01:22") && !biox.doc.includes("22:22"));
  check("Biyoenerji: bilgilendirme tam + footer kısa", biox.doc.includes(wellnessNote("biyoenerji").full) && biox.footer.includes(wellnessNote("biyoenerji").short));
  check("Biyoenerji: Hazırlayan", biox.doc.includes(HAZ));
  check("Biyoenerji: dosya adı yerel gün", bio.filename.endsWith("-2026-09-27.docx"), bio.filename);
  check("Biyoenerji: Türkçe karakter", biox.doc.includes("Kök çakra dengeleme") && biox.doc.includes("Şifa çalışması."));

  // ════════ 4) Doğaltaş taş ═════════════════════════════════════════════════
  console.log("\n── Doğaltaş taş ──");
  const stone: StoneReportRow = {
    id: "st1", tenant_id: "t", stone_name: "iolit", short_description: "Mavi-mor ışıltılı taş.", general_info: null,
    source_note: null, physical_effects: null, spiritual_effects: "Sezgiyi destekler.", other_effects: null,
    warning_text: null, warning_tags: null, feng_shui: null, meditation: null, care: null, application: null,
    chakras: ["Üçüncü Göz"], assignments: null, images: null, created_at: "2026-09-26T21:10:00Z", updated_at: null,
  };
  const st = buildStoneReportDoc({ stone, imageBuf: null, isLibrary: false, expertName: EXPERT, now: NOW });
  const stx = await render(st.doc);
  check("Doğaltaş: kayıt tarihi 21:10Z → yerel '27.09.2026'", stx.doc.includes("27.09.2026") && !stx.doc.includes("26.09.2026"));
  check("Doğaltaş: kapak TR büyük harf 'İOLİT' (IOLIT değil)", stx.doc.includes("İOLİT") && !stx.doc.includes("IOLIT"));
  check("Doğaltaş: bilgilendirme tam + footer kısa", stx.doc.includes(wellnessNote("dogaltas").full) && stx.footer.includes(wellnessNote("dogaltas").short));
  check("Doğaltaş: Hazırlayan", stx.doc.includes(HAZ));
  check("Doğaltaş: dosya adı yerel gün", st.filename === "dogaltas-iolit-2026-09-27.docx", st.filename);

  // ════════ 5) Şifa Rehberi ═════════════════════════════════════════════════
  console.log("\n── Şifa Rehberi ──");
  const sec = (p: Partial<WordSectionRow>): WordSectionRow => ({
    id: "sec" + Math.random().toString(36).slice(2), guide_id: "g1", section_type: "reasons", mode: null, title: null,
    note: null, source: null, source_kind: null, expert_note: null, attention: null, sort_order: null,
    created_at: "2026-01-01T00:00:00Z", images: null, ...p,
  });
  const guide = (secs: WordSectionRow[]): WordGuideRaw => ({
    id: "g1", name: "Baş ağrısı", category: "Nöroloji", symptoms: "Zonklama", created_at: "2026-09-26T21:30:00Z", updated_at: null,
    general_summary: null, medical_causes: null, subconscious_causes: null, temperament_causes: null, other_causes: null,
    iridology_match: null, hand_analysis_match: null, cupping_leech: null, reflexology: null, diet_recommendations: null,
    herbal_methods: null, stone_recommendations: null, aromatherapy: null, meditation: null, breathwork: null, bioenergy: null,
    massage: null, daily_routine: null, sleep_routine: null, supportive_alternative_methods: null, islamic_recommendations: null,
    images: null, healing_guide_sections: secs,
  });
  const sifaGuides = [guide([sec({ note: "Stres kaynaklı gerginlik.", expert_note: "GIZLI_SIFA_UZMAN" }), sec({ section_type: "diet", expert_note: "YALNIZ_UZMAN_BOLUMU" })])];
  const sifaDoc = (children: ReturnType<typeof buildSifaReportChildren>) =>
    new DocxDocument({ sections: [{ properties: {}, footers: { default: buildFooter("Şifa Rehberi Raporu · Yaşam Sistemi", { note: "sifa" }) }, children }] });
  const sf = await render(sifaDoc(buildSifaReportChildren({ guides: sifaGuides, exportMode: "single", today: "27 Eylül 2026", wellnessNote: true, expertName: EXPERT })));
  check("Şifa: kayıt tarihi 21:30Z → yerel '27 Eylül 2026'", sf.doc.includes("27 Eylül 2026") && !sf.doc.includes("26 Eylül 2026"));
  check("Şifa: 'Uzman Notu' VARSAYILAN yok", !sf.doc.includes("GIZLI_SIFA_UZMAN") && !sf.doc.includes("Uzman Notu"));
  check("Şifa: yalnız-uzman-notu bölümü (hariçken) hiç basılmaz", !sf.doc.includes("YALNIZ_UZMAN_BOLUMU") && !sf.doc.includes("Diyet"));
  check("Şifa: normal içerik korunur", sf.doc.includes("Stres kaynaklı gerginlik."));
  check("Şifa: bilgilendirme tam + footer kısa + Hazırlayan", sf.doc.includes(wellnessNote("sifa").full) && sf.footer.includes(wellnessNote("sifa").short) && sf.doc.includes(HAZ));
  const sfOpt = await render(sifaDoc(buildSifaReportChildren({ guides: sifaGuides, exportMode: "single", today: "27 Eylül 2026", includeExpertNotes: true })));
  check("Şifa: includeExpertNotes=true → Uzman Notu var", sfOpt.doc.includes("GIZLI_SIFA_UZMAN") && sfOpt.doc.includes("YALNIZ_UZMAN_BOLUMU"));

  // ════════ 6) Aromaterapi karışım ══════════════════════════════════════════
  console.log("\n── Aromaterapi karışım ──");
  const blend: BlendExportRow = {
    id: "b", tenant_id: "t", name: "Sakinleştirici Karışım", notes: "Akşam kullanımı.", carrier_oil_id: null,
    carrier_oil_name: "Jojoba", bottle_ml: 30, dilution_percent: 2, drops_per_ml: 20, total_drops: 12,
    items: [{ oil_id: "o1", oil_name: "Lavanta", latin_name: "Lavandula angustifolia", oil_type: "essential", drops: 6, is_photosensitive: false, contraindications: "", safety_notes: "" }],
    is_active: true, created_at: "2026-09-26T21:40:00Z", updated_at: null,
  };
  const ar = await unzipBuf(await buildAromaDoc({
    coverTitle2: "KARIŞIM REÇETESİ", coverSubtitle: blend.name, reportName: "Karışım", stats: [],
    body: renderBlendFormula(blend, "h2"), expertName: EXPERT, frontMatter: "none", date: NOW,
  }));
  check("Aroma: kapak tarihi yerel '27 Eylül 2026'", ar.doc.includes("27 Eylül 2026") && humanDate(NOW) === "27 Eylül 2026");
  check("Aroma: dateStamp yerel gün (2026-09-27)", dateStamp(NOW) === "2026-09-27" && reportFilename(["Karışım"], NOW).endsWith("_2026-09-27.docx"));
  check("Aroma: snapshot tarihi (created_at 21:40Z) yerel gün", ar.doc.includes("2026-09-27") && !ar.doc.includes("2026-09-26"));
  check("Aroma: bilgilendirme tam + footer kısa", ar.doc.includes(wellnessNote("aromaterapi").full) && ar.footer.includes(wellnessNote("aromaterapi").short));
  check("Aroma: Hazırlayan + Türkçe", ar.doc.includes(HAZ) && ar.doc.includes("Sakinleştirici Karışım"));
  const arOff = await unzipBuf(await buildAromaDoc({
    coverTitle2: "X", coverSubtitle: "x", reportName: "x", stats: [], body: renderBlendFormula(blend, "h2"), frontMatter: "none", date: NOW, wellnessNote: false,
  }));
  check("Aroma: wellnessNote:false → eski çıktı (not yok)", !arOff.doc.includes("Bilgilendirme") && !arOff.footer.includes(wellnessNote("aromaterapi").short));

  // ════════ 7) Numeroloji ══════════════════════════════════════════════════
  console.log("\n── Numeroloji ──");
  const motor = hesaplaNumeroloji({ firstName: "Ayşe", lastName: "YILMAZ", birthDate: "15.03.1990" });
  const row = { id: "r1", name: "Ayşe", surname: "YILMAZ", birth_date: "1990-03-15", created_at: "2026-09-26T22:22:00Z", analysis_data: { version: 1, motor, summary: "Özet." } };
  const shared = { knowledgeRows: [], entries: [], sourceLabelById: new Map<string, string>(), stoneRows: [] };
  const sections = { summary: false, plain: true, detailed: false, tas: false, zamanlama: false } as Parameters<typeof buildNumerolojiWordChildren>[1];
  const { children, anyContent } = buildNumerolojiWordChildren([row], sections, shared, new Map(), null, NOW);
  check("Numeroloji: içerik üretildi", anyContent);
  const nx = await unzipBuf(await packNumerolojiDocx(children, "Ayşe YILMAZ", { expertName: EXPERT }));
  check("Numeroloji: analiz 22:22Z → '27.09.2026 01:22'", nx.doc.includes("27.09.2026 01:22") && !nx.doc.includes("22:22"));
  check("Numeroloji: rapor tarihi yerel '27 Eylül 2026'", nx.doc.includes("27 Eylül 2026"));
  check("Numeroloji: TEXT doğum ISO → '15.03.1990' (kaymaz)", nx.doc.includes("15.03.1990"));
  check("Numeroloji: bilgilendirme tam + footer kısa", nx.doc.includes(wellnessNote("numeroloji").full) && nx.footer.includes(wellnessNote("numeroloji").short));
  check("Numeroloji: Hazırlayan + Türkçe", nx.doc.includes(HAZ) && nx.doc.includes("Ayşe YILMAZ"));
}

main()
  .then(() => {
    console.log(`\nword-tz harness: ${pass} PASS / ${fail} FAIL`);
    if (fail > 0) {
      console.log("FAILURES:\n - " + failures.join("\n - "));
      process.exit(1);
    }
  })
  .catch((e) => {
    console.error("HARNESS CRASH:", e);
    process.exit(1);
  });
