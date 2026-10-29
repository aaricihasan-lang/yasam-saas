/**
 * AŞAMA 2 / W1 — Danışan Yolculuğu Word raporları (BUG-005, DY-02, DY-001…DY-014) harness'ı.
 *
 * A) SAF builder → GERÇEK DOCX (document.xml incelenir): tam / kısmi / boş danışan, Özel Rapor,
 *    Ücretlendirme seçili-değil, HD donmuş snapshot gövdesi, kapak + logo, İçindekiler YOK,
 *    Türkçe karakter, sabit düzen tablo genişlikleri, boş sayfa / zorunlu sayfa sonu, kaynak
 *    verinin değişmemesi, sekme / tek analiz / tarih aralığı / toplu modları.
 * B) GERÇEK route + GERÇEK Postgres (embedded; PROD'A SIFIR TEMAS; ZZ_ sentetik): GET seçenekleri,
 *    Tam/Özel, HD bağı (journey_client_id) + izin, tenant izolasyonu, DY-02 alt sorgu hatası → 500
 *    (docx üretilmez), rapor üretimi sonrası DB satırlarının değişmemesi.
 *
 * Çalıştır: npx tsx scripts/asama2-w1/harness.ts [--out <klasör>]   (DOCX çıktıları görsel kontrol için)
 */
import Module from "node:module";
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { NextRequest } from "next/server";
import { Packer, type Document } from "docx";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const ROOT = process.cwd();
const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out");
if (OUT) mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: unknown, msg: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}${detail === undefined ? "" : " — " + JSON.stringify(detail).slice(0, 400)}`); }
}

function unescapeXml(s: string) { return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }

type Parsed = { xml: string; text: string; media: string[]; zip: JSZip };
async function parse(buf: Buffer): Promise<Parsed> {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const text = xml.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("")).join("\n");
  const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/"));
  return { xml, text, media, zip };
}
async function render(doc: Document, name: string): Promise<Parsed> {
  const buf = await Packer.toBuffer(doc);
  if (OUT) writeFileSync(path.join(OUT, `${name}.docx`), buf);
  return parse(buf);
}
const lines = (p: Parsed) => p.text.split("\n").map((l) => l.trim()).filter(Boolean);
const hasLine = (p: Parsed, re: RegExp) => lines(p).some((l) => re.test(l));
/** Yalnız bölüm başlıkları (Heading1) metinleri. */
function headings1(p: Parsed): string[] {
  return p.xml.split("</w:p>").filter((x) => /<w:pStyle w:val="Heading1"\/>/.test(x))
    .map((x) => Array.from(x.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => unescapeXml(m[1]!)).join("").trim());
}
/** Tüm tabloların sabit düzen + gridCol toplamı ≤ basılabilir genişlik mi? (DY tabloları) */
function tableCheck(p: Parsed): { tables: number; fixed: number; maxGrid: number } {
  const tbls = p.xml.split("<w:tbl>").slice(1);
  let fixed = 0;
  let maxGrid = 0;
  for (const t of tbls) {
    if (/<w:tblLayout w:type="fixed"\/>/.test(t)) fixed++;
    const grid = t.split("</w:tblGrid>")[0] ?? "";
    const sum = Array.from(grid.matchAll(/<w:gridCol w:w="(\d+)"/g)).reduce((s, m) => s + Number(m[1]), 0);
    maxGrid = Math.max(maxGrid, sum);
  }
  return { tables: tbls.length, fixed, maxGrid };
}
const countRe = (s: string, re: RegExp) => (s.match(re) ?? []).length;

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o as object)) deepFreeze(v); }
  return o;
}

// 1×1 PNG (analiz görseli taklidi)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const NOW = new Date("2026-10-22T09:00:00.000Z");
const TR = "çğıöşü ÇĞİÖŞÜ";

async function main() {
  const B = await import("../../app/api/clients/[id]/word-report/clientReportBuilder");
  const { loadHdReportLogo } = await import("../../lib/human-design/reporting/reportBrandAssets");
  const logo = await loadHdReportLogo();
  ok(!!logo, "Onaylı logo asset'i okunur (public/assets/yasam-sistemi-chart-logo.png)");
  const logoSha = createHash("sha256").update(readFileSync(path.join(ROOT, "public/assets/yasam-sistemi-chart-logo.png"))).digest("hex");

  type DS = Parameters<typeof B.buildClientFullReport>[0]["data"];
  const chakraPartial = {
    before_energy_ruhsal: { mark: "+3", male: "40", female: "60" },
    before_energy_zihinsel: { mark: "", male: "", female: "" },
    before_chakra_kalp: { mark: "-2", male: "", female: "55" },
    after_chakra_kalp: { mark: "+1", male: "", female: "" },
  };
  const FULL: DS = {
    client: { id: "c-full", ad: "Ayşe Gülçiçek", soyad: "Özdemir-Karaağaçlıoğlu", telefon: "0555 000 00 01", dogum: "1990-03-15", gorusme: "2026-09-01", burc: "Balık", kan: "A Rh+", mizac: "sovdavi" },
    notes: { saglik_notu: `Sağlık notu ${TR}`, adres: "İzmir, Karşıyaka", oneriler: "Günlük yürüyüş", notlar: "Genel not satırı 1\nGenel not satırı 2" },
    appointments: [
      { id: "a1", title: "İlk görüşme", notes: "Tanışma", appointment_date: "2026-09-01T07:00:00Z", status: "tamamlandi" },
      { id: "a2", title: "Kontrol", notes: null, appointment_date: "2026-11-01T07:00:00Z", status: "bekliyor" },
    ],
    stones: [
      { id: "s1", stone_name: "Ametist", stone_type: "Taşıma", usage_area: "Boyunda", stone_date: "2026-09-02", created_at: "2026-09-02T10:00:00Z" },
      { id: "s2", created_at: "2026-09-03T10:00:00Z" },
    ],
    sessions: [
      { id: "se1", session_date: "2026-09-05", session_type: "Enerji Seansı", duration_minutes: 45, session_note: "Seans notu", actions_done: "Arınma", created_at: "2026-09-05T10:00:00Z" },
      { id: "se2", session_date: "2026-12-30", session_type: "PLANLI_GELECEK_SEANS", duration_minutes: 30, created_at: "2026-09-06T10:00:00Z" },
      { id: "se3", session_date: "2026-09-07", created_at: "2026-09-07T10:00:00Z" },
    ],
    homeworks: [{ id: "h1", title: "Nefes çalışması", homework_type: "Günlük", description: "Her sabah 10 dk", start_date: "2026-09-05", end_date: "2026-09-20", status: "devam", expert_note: "GIZLI_UZMAN_NOTU", client_feedback: "İyi geldi", created_at: "2026-09-05T10:00:00Z" }],
    analyses: [
      { id: "an1", analysis_type: "chakra", analysis_data: { values: chakraPartial }, note: "Çakra notu", created_at: "2026-09-05T11:00:00Z" },
      { id: "an2", analysis_type: "chakra", analysis_data: { values: { before_energy_ruhsal: { mark: "", male: "", female: "" } } }, note: null, created_at: "2026-09-06T11:00:00Z" },
      { id: "an3", analysis_type: "planet", analysis_data: { values: { before_kalp_GÜNEŞ: "+2", before_kalp_AY: "-1" } }, note: null, created_at: "2026-09-07T11:00:00Z" },
      { id: "an4", analysis_type: "bodymap", analysis_data: null, note: null, created_at: "2026-09-08T11:00:00Z", image_url: "x" },
    ],
    charges: [{ id: "ch1", charge_date: "2026-09-05", category: "session", detail: "Seans ücreti", amount: 1500, payment_status: "paid", created_at: "2026-09-05T10:00:00Z" }],
  };
  const fullImgs = [null, null, null, PNG];
  const before = JSON.stringify(FULL);
  deepFreeze(FULL);

  console.log("\n── A) SAF builder → gerçek DOCX");
  // 1) Tam Rapor
  const full = await render(B.buildClientFullReport({ data: FULL, profileImg: null, analysisImages: fullImgs }, { now: NOW, expertName: "Uzman Hasan Örnek", logo }).doc, "01-tam-rapor");
  const h = headings1(full);
  ok(JSON.stringify(h) === JSON.stringify(["1. Danışan Bilgileri", "2. Notlar", "3. Seanslar", "4. Randevular", "5. Taş Önerileri", "6. Ödevler", "7. Analizler", "8. Danışan Yolculuğu"]), // H-10: kayıtlı analiz seçilmedi → Numeroloji bölümü yok
    "DY-001/BUG-005 Tam Rapor: bölümler kesintisiz numaralı, yalnız verisi olanlar", h);
  ok(!hasLine(full, /Ücretlendirme/) && !full.text.includes("1.500"), "DY-008 Tam Rapor: Ücretlendirme varsayılan HARİÇ");
  ok(!/İÇİNDEKİLER|İçindekiler/i.test(full.text) && !/TOC \\/.test(full.xml) && !full.xml.includes("w:sdt"), "DY-013: İçindekiler / TOC alanı YOK");
  ok(full.media.length >= 1 && (await Promise.all(full.media.map(async (m) => createHash("sha256").update(await full.zip.file(m)!.async("nodebuffer")).digest("hex")))).includes(logoSha),
    "DY-014 kapak: onaylı logo BAYT-BAYT aynı gömülü (değişiklik yok)");
  ok(hasLine(full, /^DANIŞAN DOSYASI$/) && hasLine(full, /Ayşe Gülçiçek Özdemir-Karaağaçlıoğlu/) && hasLine(full, /Rapor Tarihi:/) && hasLine(full, /Uzman:\s+Uzman Hasan Örnek/),
    "Kapak: rapor adı + danışan adı + rapor tarihi + uzman");
  ok(full.text.includes(TR) && full.text.includes("Özdemir-Karaağaçlıoğlu"), "Türkçe karakterler korunur");
  ok(!full.text.includes("Bilgi girilmemiş") && !full.text.includes("Henüz"), "DY-001/012: boş alan/boş bölüm yer tutucusu YOK");
  ok(!full.text.includes("PLANLI_GELECEK_SEANS") && countRe(full.text, /^\d+\. (Enerji Seansı|Seans)\s/gm) === 1, "DY-003: gelecek tarihli + içeriksiz seans rapora girmez");
  ok(!full.text.includes("Zihinsel Enerji Bedeni") && full.text.includes("Ruhsal Enerji Bedeni") && !full.text.includes("Kök Çakrası"), "DY-003: ölçülmemiş enerji bedeni / çakra satırı yok");
  ok(countRe(full.text, /^\d+\. Çakra Analizi/gm) === 1, "DY-003: boş çakra şeması (an2) rapora girmez", lines(full).filter((l) => /Çakra/.test(l)));
  ok(full.text.includes("+3") && full.text.includes("55") && full.text.includes("+2"), "DY-002/005: kayıtlı değerler AYNEN aktarılır (yeniden hesap yok)");
  ok(!full.text.includes("GIZLI_UZMAN_NOTU"), "FA-26: uzman iç notu varsayılan HARİÇ");
  ok(!full.xml.includes("w:orient=\"landscape\"") && full.media.length >= 2, "DY-010: görsel analiz dikey sayfada tam genişlik (yatay bölüm/boş sayfa yok)");
  const tc = tableCheck(full);
  ok(tc.tables > 0 && tc.fixed === tc.tables && tc.maxGrid <= 9638, "DY-002/004/011: tüm tablolar sabit düzen, tam genişlik ≤ 9638 twip", tc);
  ok(countRe(full.xml, /<w:pageBreakBefore\/>/g) === 0, "DY-010: gövdede zorunlu sayfa sonu yok (kapak ayrı bölüm)", countRe(full.xml, /<w:pageBreakBefore\/>/g));
  ok(JSON.stringify(FULL) === before, "Kaynak danışan verisi rapor üretiminde DEĞİŞMEZ (deep-freeze + JSON eşit)");

  // 4–5) Ücretlendirme seçili / Özel Rapor
  const withCh = await render(B.buildClientFullReport({ data: FULL, profileImg: null, analysisImages: fullImgs }, { now: NOW, logo, sections: [...B.DEFAULT_FULL_SECTIONS, "ucretlendirme"] }).doc, "02-tam-ucretli");
  ok(headings1(withCh).at(-1) === "9. Ücretlendirme" /* H-10: Numeroloji Özeti yok → numara bir azaldı */ && withCh.text.includes("1.500 ₺") && withCh.text.includes("Ödendi"), "DY-008: Ücretlendirme yalnız seçilince eklenir (tutar + ödeme durumu)", headings1(withCh));
  const custom = await render(B.buildClientFullReport({ data: FULL, profileImg: null, analysisImages: fullImgs }, { now: NOW, logo, sections: ["seanslar", "analizler"], variant: "custom" }).doc, "03-ozel-rapor");
  ok(JSON.stringify(headings1(custom)) === JSON.stringify(["1. Danışan Bilgileri", "2. Seanslar", "3. Analizler"]) && custom.text.includes("Özel Rapor"), "DY-008 Özel Rapor: yalnız seçilen bölümler", headings1(custom));
  ok(custom.text.includes("Sağlık notu") && custom.text.includes("İzmir"), "DY-012: Özel Raporda da dolu genel bilgiler var");
  ok(normalizeOk(B), "normalizeReportSections: bilinmeyen anahtar atılır, sıra sabit");

  // 2) Kısmi dolu
  const PARTIAL: DS = { client: { id: "c-p", ad: "Mehmet", soyad: "Kısmi", telefon: "0555 1" }, notes: null, appointments: [], stones: [], homeworks: [], analyses: [], charges: [],
    sessions: [{ id: "x", session_date: "2026-09-01", session_type: "Görüşme", created_at: "2026-09-01T10:00:00Z" }] };
  const partial = await render(B.buildClientFullReport({ data: PARTIAL, profileImg: null }, { now: NOW, logo }).doc, "04-kismi");
  ok(JSON.stringify(headings1(partial)) === JSON.stringify(["1. Danışan Bilgileri", "2. Seanslar", "3. Danışan Yolculuğu"]), "Kısmi danışan: yalnız dolu bölümler", headings1(partial));
  ok(!hasLine(partial, /^Burç|^Kan Grubu|^Doğum Tarihi|^Sağlık Notu|^Adres/) && hasLine(partial, /^Telefon$/), "DY-012: boş kimlik alanları gizlenir, dolu olan görünür");
  ok(!partial.text.includes("Numeroloji"), "Doğum tarihi yoksa Numeroloji bölümü yok");

  // 3) Boş danışan
  const EMPTY: DS = { client: { id: "c-e", ad: "Boş", soyad: "Danışan" }, notes: null, appointments: [], stones: [], sessions: [], homeworks: [], analyses: [], charges: [] };
  const empty = await render(B.buildClientFullReport({ data: EMPTY, profileImg: null }, { now: NOW, logo }).doc, "05-bos");
  ok(JSON.stringify(headings1(empty)) === JSON.stringify(["1. Danışan Bilgileri"]) && countRe(empty.xml, /<w:pageBreakBefore\/>/g) === 0 && countRe(empty.xml, /<w:sectPr/g) === 2,
    "DY-001/010: boş danışan → kapak + tek bilgi bölümü (boş sayfa/bölüm yok)", { h: headings1(empty), sect: countRe(empty.xml, /<w:sectPr/g) });
  ok(countRe(empty.xml, /<w:tbl>/g) === 0, "Boş danışan: boş tablo/özet kartı üretilmez");

  // 6) HD donmuş snapshot gövdesi
  const hdSnap = await buildHdSnapshot();
  const { buildHdReportV2Children } = await import("../../lib/human-design/reporting/wordReportV2");
  const hdBody = buildHdReportV2Children(hdSnap as never, { bodygraphImage: null, logo: null, expertName: null }).body;
  const withHd = await render(B.buildClientFullReport({ data: FULL, profileImg: null, analysisImages: fullImgs, hd: { children: hdBody, generatedAt: "2026-10-09T09:00:00.000Z" } }, { now: NOW, logo }).doc, "06-tam-hd");
  ok(headings1(withHd).includes("8. Human Design") && withHd.text.includes("Human Design modülündeki kayıtlı profesyonel rapordan"), "DY-007: HD bölümü donmuş snapshot'tan eklenir", headings1(withHd));
  ok(withHd.text.includes("Merkezler") && withHd.text.includes("Kapılar"), "DY-007: HD içerik (merkez/kapı) aktarılır");
  ok(!withHd.text.includes("OZEL-NOT-ASLA-RAPORDA-OLMAMALI"), "HD uzman özel notu sızmaz");
  ok(!/İÇİNDEKİLER/i.test(withHd.text), "HD ekli raporda da İçindekiler yok");
  const noHdSel = await render(B.buildClientFullReport({ data: FULL, profileImg: null, analysisImages: fullImgs, hd: { children: hdBody } }, { now: NOW, logo, sections: ["seanslar"], variant: "custom" }).doc, "07-ozel-hdsiz");
  ok(!noHdSel.text.includes("Human Design"), "Özel Rapor: HD seçilmezse eklenmez");

  // Sekme raporları (DY-012/013/014)
  for (const tab of B.CLIENT_REPORT_TABS) {
    const rows = ({ randevular: FULL.appointments, taslar: FULL.stones, seanslar: FULL.sessions, ucretlendirme: FULL.charges, odevler: FULL.homeworks, analizler: FULL.analyses } as Record<string, unknown[]>)[tab] ?? [];
    const p = await render(B.buildClientTabReport({ tab, client: FULL.client, notes: FULL.notes, rows: rows as never, analysisImages: tab === "analizler" ? fullImgs : [] }, { now: NOW, logo, expertName: "Uzman Hasan Örnek" }).doc, `10-sekme-${tab}`);
    const hh = headings1(p);
    ok(hh[0] === "1. Danışan Bilgileri" && p.text.includes("Sağlık notu") && p.text.includes("0555 000 00 01") && !/İÇİNDEKİLER/i.test(p.text) && p.media.length >= 1,
      `DY-012/013/014 sekme "${tab}": kapak+logo, dolu genel bilgiler, İçindekiler yok`, hh);
  }
  const emptyTab = await render(B.buildClientTabReport({ tab: "randevular", client: FULL.client, notes: FULL.notes, rows: [] }, { now: NOW, logo }).doc, "11-sekme-bos");
  ok(emptyTab.text.includes("Bu bölümde kayıtlı veri bulunmuyor.") && countRe(emptyTab.xml, /<w:pageBreakBefore\/>/g) === 0, "Boş sekme: tek satır bilgi, boş sayfa yok");

  // Tek analiz
  const single = await render(B.buildClientSingleAnalysisReport({ client: FULL.client, notes: FULL.notes, analysis: FULL.analyses[0]!, imageBuf: null }, { now: NOW, logo }).doc, "12-tek-analiz");
  ok(headings1(single)[0] === "1. Danışan Bilgileri" && single.text.includes("+3") && single.text.includes("Analiz Raporu"), "Tek analiz: kapak + danışan bilgileri + analiz tabloları");

  // Tarih aralığı
  const ranged = B.filterClientDatasetByRange(FULL, "2026-09-05", "2026-09-05");
  const dr = await render(B.buildClientDateRangeReport({ data: ranged, drStart: "2026-09-05", drEnd: "2026-09-05", profileImg: null }, { now: NOW, logo }).doc, "13-tarih-araligi");
  ok(!headings1(dr).some((x) => /Ücretlendirme|Human Design|Numeroloji/.test(x)) && dr.text.includes("Tarih Aralığı"), "Tarih aralığı: Ücretlendirme varsayılan hariç, HD/Numeroloji yok", headings1(dr));
  const drCh = await render(B.buildClientDateRangeReport({ data: ranged, drStart: "2026-09-05", drEnd: "2026-09-05", profileImg: null }, { now: NOW, logo, sections: [...B.DEFAULT_FULL_SECTIONS, "ucretlendirme"] }).doc, "14-tarih-araligi-ucretli");
  ok(headings1(drCh).some((x) => /Ücretlendirme/.test(x)), "Tarih aralığı: Ücretlendirme seçilince eklenir");

  // Toplu
  const bulk = await render(B.buildClientsBulkFullReport([{ data: FULL, profileImg: null, analysisImages: fullImgs }, { data: PARTIAL, profileImg: null }], { now: NOW, logo }).doc, "15-toplu");
  ok(bulk.text.includes("Danışan 1 / 2") && bulk.text.includes("Danışan 2 / 2") && countRe(bulk.xml, /<w:pageBreakBefore\/>/g) === 2 && !/İÇİNDEKİLER/i.test(bulk.text), "Toplu: her danışan yeni sayfada, İçindekiler yok");

  // Uzun rapor: 40 seans + 30 analiz — tablolar ve sayfalar taşmaz
  const LONG: DS = { ...EMPTY, client: { ...FULL.client }, notes: FULL.notes,
    sessions: Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, session_date: "2026-09-01", session_type: `Seans ${i}`, session_note: "Uzun not ".repeat(40), created_at: "2026-09-01T10:00:00Z" })),
    analyses: Array.from({ length: 30 }, (_, i) => ({ id: `la${i}`, analysis_type: "chakra", analysis_data: { values: chakraPartial }, created_at: "2026-09-01T10:00:00Z" })) };
  const long = await render(B.buildClientFullReport({ data: LONG, profileImg: null }, { now: NOW, logo }).doc, "16-uzun");
  const lt = tableCheck(long);
  ok(lt.fixed === lt.tables && lt.maxGrid <= 9638 && countRe(long.text, /^\d+\. Seans \d+/gm) === 40, "Uzun rapor: 40 seans + 30 analiz eksiksiz, tablolar sabit genişlik", lt);

  // DY-02 birim: depolama hatası yutulmaz, "nesne yok" görselsiz devam
  const D = await import("../../app/api/clients/[id]/word-report/clientReportData");
  const fakeDb = (err: unknown) => ({ storage: { from: () => ({ download: async () => ({ data: null, error: err }) }) } }) as never;
  ok(await D.downloadAnalysisImage(fakeDb({ statusCode: "404", message: "Object not found" }), "t", "c", "a") === null, "DY-02: depolama 'nesne yok' → görselsiz devam");
  let threw = false;
  try { await D.downloadAnalysisImage(fakeDb({ statusCode: "500", message: "internal" }), "t", "c", "a"); } catch (e) { threw = D.isClientReportReadError(e); }
  ok(threw, "DY-02: depolama sunucu hatası → ClientReportReadError (sessiz eksik rapor yok)");

  await routeTests(hdSnap);
}

function normalizeOk(B: typeof import("../../app/api/clients/[id]/word-report/clientReportBuilder")): boolean {
  const r = B.normalizeReportSections(["ucretlendirme", "x", "seanslar", 5, "notlar"]);
  return JSON.stringify(r) === JSON.stringify(["notlar", "seanslar", "ucretlendirme"]) && B.normalizeReportSections("x") === null;
}

async function buildHdSnapshot(): Promise<Record<string, unknown>> {
  const { normalizeRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/normalize");
  const { validateRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/schema");
  const { extractSystemReading } = await import("../../lib/human-design/providers/roxy/systemReading");
  const V2 = await import("../../lib/human-design/reporting/reportSnapshotV2");
  const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8")) as Record<string, unknown>;
  const v = validateRoxyBodygraph(FIXTURE);
  if (!v.ok) throw new Error("HD fixture geçersiz");
  const n = normalizeRoxyBodygraph(v.value, { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.87, longitude: 32.48, nodeType: "true", lang: "tr", birthUtcIso: "2018-07-20T16:00:00.000Z" });
  if (!n.ok) throw new Error("HD normalize başarısız");
  return V2.buildReportSnapshotV2({
    generatedAt: "2026-10-09T09:00:00.000Z", chartId: "ch-zz-w1", source: "computed", provider: "roxyapi",
    client: { name: "ZZ Ayşe Gülçiçek", birthDate: "1990-03-15", birthTime: "10:00:00", birthPlace: "İzmir, Türkiye", timezone: "Europe/Istanbul" },
    codes: n.codes, computed: n.chart, requested: "system", systemReadingPermitted: true, systemReading: extractSystemReading(FIXTURE),
    expertRecords: [{ category: "Tipler", title: "ZZ", code: "tip_x", content: "ZZ içerik", is_active: true, expert_notes: "OZEL-NOT-ASLA-RAPORDA-OLMAMALI" }] as never,
    bodygraph: { status: "missing" }, chartImage: null,
  } as never) as unknown as Record<string, unknown>;
}

// ─── B) Gerçek route + gerçek Postgres ───────────────────────────────────────

type Opt = {
  counts?: Record<string, number>;
  humanDesign?: { permitted?: boolean; reports?: { id: string }[] };
  numerology?: { savedAnalysisLink?: boolean };
  ref?: unknown;
};

async function routeTests(hdSnap: Record<string, unknown>) {
  console.log("\n── B) Gerçek route + embedded Postgres (prod'a sıfır temas)");
  const { SERVICE_KEY, ANON_KEY, startDyTestEnv, seedDyUser, seedRichClient } = await import("../wt7/dyTestEnv");
  const env = await startDyTestEnv({ port: 54521, dirName: "asama2-w1-pgdata" });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  try {
    await su.query(`
      create table if not exists public.human_design_clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, name text, birth_date text, journey_client_id uuid, created_at timestamptz default now());
      create table if not exists public.human_design_reports (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, client_id uuid, chart_id uuid, title text,
        report_kind text, schema_version text, snapshot jsonb, created_at timestamptz default now());
      grant select, insert, update, delete on all tables in schema public to service_role;`);
    const A = await seedDyUser(su, "A");
    const Bu = await seedDyUser(su, "B");
    const NOHD = await seedDyUser(su, "NOHD");
    await su.query(`update public.users set module_permissions=$2 where id=$1`, [A.id, JSON.stringify({ clients: true, human_design: true, hd_system_reading: true })]);
    await su.query(`update public.users set module_permissions=$2, tenant_id=$3 where id=$1`, [NOHD.id, JSON.stringify({ clients: true }), A.tenant]);
    const ca = await seedRichClient(su, A.tenant, 1);
    const cb = await seedRichClient(su, Bu.tenant, 2);
    const hdA = (await su.query(`insert into public.human_design_clients(tenant_id, name, journey_client_id) values ($1,'ZZ HD A',$2) returning id`, [A.tenant, ca])).rows[0].id as string;
    const repA = (await su.query(`insert into public.human_design_reports(tenant_id, client_id, title, report_kind, schema_version, snapshot) values ($1,$2,'ZZ HD',$3,'hd-report-2',$4) returning id`,
      [A.tenant, hdA, "canonical", JSON.stringify(hdSnap)])).rows[0].id as string;
    const hdB = (await su.query(`insert into public.human_design_clients(tenant_id, name, journey_client_id) values ($1,'ZZ HD B',$2) returning id`, [Bu.tenant, cb])).rows[0].id as string;
    const repB = (await su.query(`insert into public.human_design_reports(tenant_id, client_id, title, report_kind, schema_version, snapshot) values ($1,$2,'ZZ HD B','canonical','hd-report-2',$3) returning id`,
      [Bu.tenant, hdB, JSON.stringify(hdSnap)])).rows[0].id as string;

    const route = await import("../../app/api/clients/[id]/word-report/route");
    const bulk = await import("../../app/api/clients/word-report-bulk/route");
    const req = (url: string, method: string, u: { id: string; token: string }, body?: unknown) =>
      new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token }, body: body === undefined ? undefined : JSON.stringify(body) });
    const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
    const asDoc = async (r: Response) => parse(Buffer.from(await r.arrayBuffer()));

    const dbHash = async () => (await su.query(`select md5(string_agg(t, '|' order by t)) h from (
      select 'c'||row_to_json(x)::text t from public.clients x union all select 'n'||row_to_json(x)::text from public.client_notes x
      union all select 'a'||row_to_json(x)::text from public.appointments x union all select 's'||row_to_json(x)::text from public.client_stones x
      union all select 'se'||row_to_json(x)::text from public.client_sessions x union all select 'h'||row_to_json(x)::text from public.client_homeworks x
      union all select 'an'||row_to_json(x)::text from public.client_analyses x union all select 'ch'||row_to_json(x)::text from public.client_charges x
      union all select 'hd'||row_to_json(x)::text from public.human_design_reports x) q`)).rows[0].h as string;
    const h0 = await dbHash();

    // GET seçenekleri
    let r = await route.GET(req(`/api/clients/${ca}/word-report`, "GET", A), ctx(ca));
    let j = (await r.json()) as Opt;
    ok(r.status === 200 && j.counts?.seanslar === 1 && j.counts?.ucretlendirme === 2 && j.humanDesign?.permitted === true && j.humanDesign?.reports?.[0]?.id === repA && j.numerology?.savedAnalysisLink === false,
      "GET: bölüm sayıları + bağlı HD raporu + Numeroloji bağ durumu", j);
    r = await route.GET(req(`/api/clients/${ca}/word-report`, "GET", NOHD), ctx(ca));
    j = (await r.json()) as Opt;
    ok(r.status === 200 && j.humanDesign?.permitted === false && j.humanDesign?.reports?.length === 0, "GET: HD izni yoksa HD raporu listelenmez", j.humanDesign);
    r = await route.GET(req(`/api/clients/${cb}/word-report`, "GET", A), ctx(cb));
    ok(r.status === 404, "8) Tenant: başka tenant'ın danışanı GET → 404", r.status);

    // Tam rapor (HD dahil, ücret hariç)
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, {}), ctx(ca));
    ok(r.status === 200 && r.headers.get("content-type")?.includes("wordprocessingml"), "Route Tam Rapor 200 DOCX", r.status);
    let d = await asDoc(r);
    ok(headings1(d).some((x) => /Human Design$/.test(x)) && !headings1(d).some((x) => /Ücretlendirme/.test(x)) && !/İÇİNDEKİLER/i.test(d.text), "Route Tam: HD (bağlı snapshot) var, Ücretlendirme yok, İçindekiler yok", headings1(d));
    ok(!d.text.includes("GIZLI_UZMAN_NOTU_1"), "Route: uzman iç notu varsayılan hariç");
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, { includeCharges: true }), ctx(ca));
    d = await asDoc(r);
    ok(headings1(d).some((x) => /Ücretlendirme/.test(x)), "Route Tam + includeCharges: Ücretlendirme eklenir");
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, { reportKind: "custom", sections: ["seanslar"] }), ctx(ca));
    d = await asDoc(r);
    ok(JSON.stringify(headings1(d)) === JSON.stringify(["1. Danışan Bilgileri", "2. Seanslar"]), "Route Özel Rapor: yalnız seçilen bölüm", headings1(d));
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", NOHD, {}), ctx(ca));
    d = await asDoc(r);
    ok(r.status === 200 && !d.text.includes("Human Design"), "Route: HD izni olmayan kullanıcıda HD bölümü YOK");
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, { hdReportId: repB }), ctx(ca));
    ok(r.status === 404, "8) Tenant: başka tenant'ın HD raporu seçilemez (404)", r.status);
    r = await route.POST(req(`/api/clients/${cb}/word-report`, "POST", A, {}), ctx(cb));
    ok(r.status === 404, "8) Tenant: başka tenant'ın danışanı POST → 404", r.status);
    r = await route.POST(req(`/api/clients/not-a-uuid/word-report`, "POST", A, {}), ctx("not-a-uuid"));
    ok(r.status === 404, "Geçersiz danışan kimliği → 404 (DB'ye gitmez)", r.status);
    for (const tab of ["genel", "randevular", "taslar", "seanslar", "ucretlendirme", "odevler", "analizler"]) {
      r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, { exportMode: "tab", tabName: tab }), ctx(ca));
      d = r.status === 200 ? await asDoc(r) : ({ text: "" } as Parsed);
      ok(r.status === 200 && d.text.includes("İzmir 1") && !/İÇİNDEKİLER/i.test(d.text), `Route sekme "${tab}": 200 + genel bilgiler`, r.status);
    }
    // DY-04 (owner 30.10): bu fixture'da danışan notu YOK → boş Word üretilmez; anlaşılır uyarı (422).
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, { exportMode: "tab", tabName: "notlar" }), ctx(ca));
    {
      const jb = r.status === 422 ? (await r.json()) as { code?: string; error?: string } : {};
      ok(r.status === 422 && jb.code === "REPORT_EMPTY" && /kayıt bulunmuyor/.test(String(jb.error)), `Route sekme "notlar" (kayıt yok): boş Word yok → 422 + uyarı`, r.status);
    }
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, { exportMode: "date-range", dateRange: { start: "2026-09-27", end: "2026-09-27" } }), ctx(ca));
    d = await asDoc(r);
    ok(r.status === 200 && !headings1(d).some((x) => /Ücretlendirme/.test(x)), "Route tarih aralığı: Ücretlendirme varsayılan hariç");
    const anId = (await su.query(`select id from public.client_analyses where client_id=$1 limit 1`, [ca])).rows[0].id as string;
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, { exportMode: "single-analysis", analysisId: anId }), ctx(ca));
    ok(r.status === 200, "Route tek analiz 200", r.status);
    r = await bulk.POST(req(`/api/clients/word-report-bulk`, "POST", A, { exportMode: "selected", clientIds: [ca] }));
    ok(r.status === 200, "Toplu rota 200 (yeni düzen)", r.status);
    if (r.status === 200) await r.arrayBuffer();

    ok((await dbHash()) === h0, "14) Rapor üretimi kaynak kayıtları DEĞİŞTİRMEZ (tüm DY + HD tabloları md5 aynı)");

    // DY-02: alt sorgu GERÇEK hatası → 500, docx YOK
    await su.query(`revoke select on public.client_homeworks from service_role`);
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, {}), ctx(ca));
    j = (await r.json().catch(() => ({}))) as Opt;
    ok(r.status === 500 && !r.headers.get("content-type")?.includes("wordprocessingml") && typeof j.ref === "string" && !JSON.stringify(j).includes("permission"),
      "DY-02: ödev sorgusu hata → Tam Rapor 500 (eksik Word üretilmez, ham DB hatası sızmaz)", { s: r.status, j });
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, { exportMode: "tab", tabName: "odevler" }), ctx(ca));
    ok(r.status === 500, "DY-02: sekme (ödevler) sorgu hatası → 500", r.status);
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, { exportMode: "date-range", dateRange: { start: "2026-01-01", end: "2026-12-31" } }), ctx(ca));
    ok(r.status === 500, "DY-02: tarih aralığı sorgu hatası → 500", r.status);
    r = await route.GET(req(`/api/clients/${ca}/word-report`, "GET", A), ctx(ca));
    ok(r.status === 500, "DY-02: GET seçenekleri sorgu hatası → 500", r.status);
    await su.query(`grant select on public.client_homeworks to service_role`);
    await su.query(`revoke select on public.client_notes from service_role`);
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, { exportMode: "tab", tabName: "genel" }), ctx(ca));
    ok(r.status === 500, "DY-02: notlar sorgusu hata → sekme 'genel' 500", r.status);
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, { exportMode: "single-analysis", analysisId: anId }), ctx(ca));
    ok(r.status === 500, "DY-02: tek analiz modunda notlar hatası → 500", r.status);
    await su.query(`grant select on public.client_notes to service_role`);
    await su.query(`revoke select on public.human_design_reports from service_role`);
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, {}), ctx(ca));
    ok(r.status === 500, "DY-02: HD rapor okuma hatası → 500 (HD sessizce düşmez)", r.status);
    await su.query(`grant select on public.human_design_reports to service_role`);
    r = await route.POST(req(`/api/clients/${ca}/word-report`, "POST", A, {}), ctx(ca));
    ok(r.status === 200, "Yetki geri verilince rapor yine 200", r.status);
    if (r.status === 200) await r.arrayBuffer();
  } finally {
    await env.stop();
  }
}

main()
  .catch((e) => { fail++; console.error(e); })
  .finally(() => {
    console.log(`\nAŞAMA 2 / W1 harness: ${pass} PASS / ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  });
