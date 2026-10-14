/**
 * TEK MİNERAL Word raporu (POST /api/dogaltas/minerals/[id]/word-report) — regresyon harness'ı (2026-10-14).
 *
 * Sentetik veriyle (DB yok) gerçek saf oluşturucuyu (`buildMineralDetailDocument`) çalıştırır, DOCX'i
 * JSZip ile açar ve XML üzerinde SIKI doğrular:
 *   - İçindekiler DOLU: N>0 statik giriş, metinleri = bölüm başlıkları (sıra dahil),
 *   - her giriş w:hyperlink w:anchor → var olan yer imi; PAGEREF aynı sırada; yer imi id'leri benzersiz,
 *   - eski boş TOC alanı / SDT YOK, updateFields AÇIK,
 *   - sayfa sonu sayısı = 1 (yalnız kapak → özet); ayrı "RAPOR ÖZETİ" / boş İçindekiler sayfası YOK,
 *   - "İçeren Taşlar (N)" başlığı + w:tbl kompakt tablo (madde paragrafı DEĞİL), 0 ve 60 taş uç durumu,
 *   - veri kaybı yok: eski düzenin (dondurulmuş kopya) yazdığı HER metin yeni belgede de var,
 *   - kapak + alt bilgi XML'i eski düzenle BİREBİR aynı (premium tasarım korunur),
 *   - route kaynak kapıları (android/UUID/yetki/sanitize/Usage360) yerinde.
 * Opsiyonel: OUT_DIR verilirse DOCX'ler yazılır.
 *
 * Çalıştır: npx tsx scripts/final-a1/mineral-word/harness.ts
 */
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { Packer } from "docx";
import {
  buildMineralDetailDocument,
  type MineralRow,
} from "../../../app/api/dogaltas/minerals/[id]/word-report/mineralDetailDoc";
import { buildLegacyMineralDetailDocument } from "./legacyMineralDetailDoc";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const OUT_DIR = process.env.OUT_DIR;
const ROOT = path.resolve(__dirname, "../../..");
const TR = "ĞÜŞİÖÇ ğüşıöç";

const unesc = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
function xmlText(xml: string): string {
  return unesc(xml.replace(/<w:tab\/>/g, "\t").replace(/<[^>]+>/g, ""));
}
/** Tüm w:t çalıştırma metinleri (sırayla). */
function runs(xml: string): string[] {
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => unesc(m[1]!));
}
/** Gövdedeki üst-düzey paragraflar (tablo hücresi içindekiler dahil). */
function paragraphs(xml: string): string[] {
  return [...xml.matchAll(/<w:p>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>|<w:p [^>]*>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g)].map((m) => m[0]);
}

type Parsed = { doc: string; settings: string; footers: string[]; text: string; files: string[]; buf: Buffer };
async function parse(buf: Buffer): Promise<Parsed> {
  const zip = await JSZip.loadAsync(buf);
  const doc = await zip.file("word/document.xml")!.async("string");
  const settings = (await zip.file("word/settings.xml")?.async("string")) ?? "";
  const footerNames = Object.keys(zip.files).filter((f) => /^word\/footer\d*\.xml$/.test(f)).sort();
  const footers = await Promise.all(footerNames.map((f) => zip.file(f)!.async("string")));
  return { doc, settings, footers, text: xmlText(doc), files: Object.keys(zip.files), buf };
}

// ─── Fixture ───
function mineral(opts: { stones?: number; empty?: boolean; name?: string } = {}): MineralRow {
  const stones = opts.stones ?? 12;
  if (opts.empty) {
    return {
      id: "00000000-0000-4000-8000-000000000001", name: opts.name ?? "ZZ_Boş Mineral",
      aciklama: null, kategori: null, source_id: null,
      fiziksel: null, zihinsel: [], fizyoloji: null, eksiklik_belirtileri: null, fazlalik_belirtileri: null,
      doz_asimi: null, iceren_taslar: [], organ_etkileri: null, cakralar: null, created_at: null,
    };
  }
  return {
    id: "00000000-0000-4000-8000-000000000002",
    name: opts.name ?? `ZZ_Magnezyum Şifa ${TR}`,
    aciklama: `Magnezyum açıklaması — kas, sinir ve enerji metabolizması. ${TR}`,
    kategori: "Makro Mineral ç",
    source_id: "Kaynak Ü-42",
    fiziksel: ["Fiziksel A — kas gevşemesi", "Fiziksel B — kemik yoğunluğu"],
    zihinsel: ["Zihinsel A — sakinlik", "Zihinsel B — odak"],
    fizyoloji: ["Fizyoloji A — ATP üretimi"],
    eksiklik_belirtileri: ["Eksiklik A — kramp", "Eksiklik B — uykusuzluk"],
    fazlalik_belirtileri: ["Fazlalık A — ishal"],
    doz_asimi: ["Doz aşımı A — hipotansiyon"],
    iceren_taslar: Array.from({ length: stones }, (_, k) => `Taş-${String(k + 1).padStart(2, "0")} Ametist %${(k * 7) % 100}`),
    organ_etkileri: ["Organ A — kalp", "Organ B — böbrek"],
    cakralar: ["Çakra A — Kalp", "Çakra B — Solar Pleksus"],
    created_at: "2026-10-07T09:00:00.000Z",
  };
}

function expectedTitles(m: MineralRow): string[] {
  const t: string[] = ["1. Genel Bilgiler"];
  if (m.aciklama?.trim()) t.push("Açıklama");
  t.push("2. Mineral Özellikleri");
  const has = (a: string[] | null) => (Array.isArray(a) ? a : []).filter(Boolean).length > 0;
  if (has(m.fiziksel)) t.push("Fiziksel Özellikler");
  if (has(m.zihinsel)) t.push("Zihinsel Etkiler");
  if (has(m.fizyoloji)) t.push("Fizyoloji");
  if (has(m.eksiklik_belirtileri)) t.push("Eksiklik Belirtileri");
  if (has(m.fazlalik_belirtileri)) t.push("Fazlalık Belirtileri");
  if (has(m.doz_asimi)) t.push("Doz Aşımı");
  const sc = (m.iceren_taslar ?? []).filter((x) => typeof x === "string" && x.trim()).length;
  if (sc) t.push(`İçeren Taşlar (${sc})`);
  if (has(m.organ_etkileri)) t.push("Organ Etkileri");
  if (has(m.cakralar)) t.push("Çakralar");
  return t;
}

/** Word TOC alan talimatı (docx TableOfContents → `TOC \h \o "1-2"`). */
const TOC_FIELD_RE = /<w:instrText[^>]*>\s*TOC\b/;
const BREAK_RE = /<w:pageBreakBefore\/>|<w:pageBreakBefore w:val="(?:true|1)"\/>|<w:br w:type="page"\/>/g;
/** Eski düzende değişen/kaldırılan YALNIZ sunum metinleri (alan etiketi/değeri DEĞİL). */
const LEGACY_PRESENTATION_ONLY = new Set([
  "RAPOR ÖZETİ",   // → "Rapor Özeti" (kompakt özet başlığı)
  "İÇİNDEKİLER",   // → "İçindekiler" (statik TOC başlığı)
  "Not: Belge düzenlenirse İçindekiler alanını Word üzerinden güncelleyebilirsiniz.",
  "·",             // madde imi öneki (İçeren Taşlar artık tablo; diğer listelerde aynen duruyor)
]);

async function runCase(label: string, m: MineralRow) {
  const buf = await Packer.toBuffer(buildMineralDetailDocument(m, "ZZ_Uzman Ş"));
  const p = await parse(buf);
  const legacy = await parse(await Packer.toBuffer(buildLegacyMineralDetailDocument(m, "ZZ_Uzman Ş")));
  const titles = expectedTitles(m);

  // ── Geçerli DOCX + ayarlar
  check(`${label}: document.xml var`, p.files.includes("word/document.xml"));
  check(`${label}: updateFields açık`, /<w:updateFields(?: w:val="(true|1)")?\/>/.test(p.settings));
  check(`${label}: eski boş TOC alanı yok`, !TOC_FIELD_RE.test(p.doc));
  check(`${label}: TOC SDT yok`, !/<w:sdt>|<w:sdt /.test(p.doc));
  check(`${label}: (kontrol) eski düzende boş TOC alanı VARDI`, TOC_FIELD_RE.test(legacy.doc) && /<w:sdt>/.test(legacy.doc));
  check(`${label}: "RAPOR ÖZETİ" ayrı sayfası yok`, !p.text.includes("RAPOR ÖZETİ"));
  check(`${label}: Rapor Özeti + İçindekiler başlıkları var`, p.text.includes("Rapor Özeti") && p.text.includes("İçindekiler"));

  // ── İçindekiler: girişler, bağlantılar, yer imleri
  const anchors = [...p.doc.matchAll(/<w:hyperlink [^>]*w:anchor="([^"]+)"/g)].map((x) => x[1]!);
  const pagerefs = [...p.doc.matchAll(/PAGEREF ([A-Za-z0-9_]+) \\h/g)].map((x) => x[1]!);
  const bookmarks = [...p.doc.matchAll(/<w:bookmarkStart [^>]*w:name="([^"]+)"/g)].map((x) => x[1]!);
  check(`${label}: TOC giriş sayısı N>0 ve = başlık sayısı (${titles.length})`, anchors.length > 0 && anchors.length === titles.length, `anchor=${anchors.length}`);
  check(`${label}: PAGEREF sırası = anchor sırası`, pagerefs.length === anchors.length && JSON.stringify(pagerefs) === JSON.stringify(anchors));
  check(`${label}: yer imi sayısı = TOC giriş sayısı`, bookmarks.length === anchors.length, `bm=${bookmarks.length}`);
  check(`${label}: yer imleri benzersiz`, new Set(bookmarks).size === bookmarks.length);
  const bmIds = [...p.doc.matchAll(/<w:bookmarkStart [^>]*w:id="(\d+)"/g)].map((x) => x[1]!);
  const endIds = [...p.doc.matchAll(/<w:bookmarkEnd w:id="(\d+)"/g)].map((x) => x[1]!);
  check(`${label}: yer imi w:id benzersiz (OOXML)`, new Set(bmIds).size === bmIds.length && bmIds.length === bookmarks.length);
  check(`${label}: bookmarkStart/End eşleşir`, JSON.stringify(bmIds) === JSON.stringify(endIds));
  const bmSet = new Set(bookmarks);
  check(`${label}: her TOC hedefinin yer imi var`, anchors.every((a) => bmSet.has(a)), anchors.filter((a) => !bmSet.has(a)).join(","));
  check(`${label}: yer imi sırası = TOC sırası`, JSON.stringify(bookmarks) === JSON.stringify(anchors));
  check(`${label}: yer imi adları Word kuralına uygun`, bookmarks.every((b) => b.length <= 40 && /^[A-Za-z][A-Za-z0-9_]*$/.test(b)));
  const tocTitles = [...p.doc.matchAll(/<w:hyperlink [^>]*w:anchor="[^"]+"[^>]*>([\s\S]*?)<\/w:hyperlink>/g)].map((x) => xmlText(x[1]!));
  check(`${label}: TOC metinleri = bölüm başlıkları (sıra dahil)`, JSON.stringify(tocTitles) === JSON.stringify(titles),
    `toc=${JSON.stringify(tocTitles)} beklenen=${JSON.stringify(titles)}`);
  // TOC gövdeden ÖNCE; her yer imi gerçek Heading paragrafında ve metni başlıkla aynı
  const firstAnchorPos = p.doc.indexOf("<w:hyperlink ");
  const firstBmPos = p.doc.indexOf("<w:bookmarkStart ");
  check(`${label}: İçindekiler gövdeden önce`, firstAnchorPos > 0 && firstAnchorPos < firstBmPos);
  const paras = paragraphs(p.doc);
  for (let i = 0; i < anchors.length; i++) {
    const para = paras.find((x) => x.includes(`w:name="${anchors[i]}"`));
    const isHeading = !!para && /<w:pStyle w:val="Heading[123]"\/>/.test(para);
    check(`${label}: "${titles[i]}" gerçek Heading + yer imli`, isHeading && xmlText(para!).trim() === titles[i], para ? xmlText(para).trim() : "paragraf yok");
  }
  const h1Count = paras.filter((x) => /<w:pStyle w:val="Heading1"\/>/.test(x)).length;
  check(`${label}: H1 sayısı = 2 (Genel Bilgiler + Mineral Özellikleri)`, h1Count === 2, `h1=${h1Count}`);
  check(`${label}: H1 rengi korunur (064e3b)`, (p.doc.match(/<w:color w:val="064e3b"\/>/g) ?? []).length >= 3);

  // ── Sayfa sonları: yalnız kapak → özet (1); eski düzen 3 idi
  const breaks = (p.doc.match(BREAK_RE) ?? []).length;
  const legacyBreaks = (legacy.doc.match(BREAK_RE) ?? []).length;
  check(`${label}: sayfa sonu = 1 (kapak→özet+İçindekiler)`, breaks === 1, `breaks=${breaks}`);
  check(`${label}: (kontrol) eski düzen 3 sayfa sonu`, legacyBreaks === 3, `legacy=${legacyBreaks}`);
  // Özet ile İçindekiler arasında sayfa sonu yok
  const sumPos = p.doc.indexOf(">Rapor Özeti<");
  const tocPos = p.doc.indexOf(">İçindekiler<");
  check(`${label}: özet ve İçindekiler aynı sayfa akışında`, sumPos > 0 && tocPos > sumPos && !BREAK_RE.test(p.doc.slice(sumPos, tocPos)));
  BREAK_RE.lastIndex = 0;
  // Boş paragraf yığını yok (gövdede art arda ≥3 boş paragraf → neredeyse boş sayfa riski)
  const bodyXml = p.doc.slice(sumPos);
  check(`${label}: gövdede art arda boş paragraf yığını yok`, !/(<w:p>(?:<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*<\/w:pPr>)?<\/w:p>\s*){3,}/.test(bodyXml));

  // ── İçeren Taşlar
  const stones = (m.iceren_taslar ?? []).map((s) => s.trim()).filter(Boolean);
  if (stones.length) {
    const head = `İçeren Taşlar (${stones.length})`;
    check(`${label}: "${head}" başlığı`, p.text.includes(head));
    // Gövdedeki başlık (TOC girişi değil): yer imli Heading paragrafı
    const headPara = paragraphs(p.doc).find((x) => /<w:bookmarkStart /.test(x) && xmlText(x).trim() === head);
    const headPos = headPara ? p.doc.indexOf(headPara) + headPara.length : -1;
    const tblStart = p.doc.indexOf("<w:tbl>", headPos);
    const tblEnd = p.doc.indexOf("</w:tbl>", tblStart);
    const between = p.doc.slice(headPos, tblStart);
    check(`${label}: başlığın hemen ardından w:tbl`, headPos > 0 && tblStart >= headPos && between.trim() === "" && paragraphs(between).length === 0, `headPos=${headPos} tbl=${tblStart} arada=${between.slice(0, 120)}`);
    const tbl = p.doc.slice(tblStart, tblEnd);
    const cellTexts = runs(tbl);
    check(`${label}: tablo tüm taşları içerir (${stones.length})`, JSON.stringify(cellTexts) === JSON.stringify(stones), `hücre=${cellTexts.length}`);
    const rowCount = (tbl.match(/<w:tr>|<w:tr /g) ?? []).length;
    check(`${label}: 4 sütun → ${Math.ceil(stones.length / 4)} satır`, rowCount === Math.ceil(stones.length / 4), `satır=${rowCount}`);
    const colCount = (tbl.match(/<w:gridCol /g) ?? []).length;
    check(`${label}: sütun sayısı = min(4, N)`, colCount === Math.min(4, stones.length), `sütun=${colCount}`);
    const bulletStones = paragraphs(p.doc).filter((x) => runs(x)[0] === "·  " && stones.includes(runs(x)[1]?.trim() ?? ""));
    check(`${label}: taşlar madde paragrafı DEĞİL`, bulletStones.length === 0, `madde=${bulletStones.length}`);
    const allRuns = runs(p.doc);
    check(`${label}: her taş belgede tam 1 kez`, stones.every((s) => allRuns.filter((r) => r === s).length === 1));
    // Eski düzen N ayrı madde paragrafıydı (kontrol)
    const legacyBullets = paragraphs(legacy.doc).filter((x) => runs(x)[0] === "·  " && stones.includes(runs(x)[1]?.trim() ?? ""));
    check(`${label}: (kontrol) eski düzende ${stones.length} madde paragrafı`, legacyBullets.length === stones.length);
  } else {
    check(`${label}: taş yoksa "İçeren Taşlar" başlığı/tablosu yok`, !p.text.includes("İçeren Taşlar"));
  }

  // ── Veri kaybı yok: tüm alan değerleri + eski düzenin tüm metinleri
  const vals = [
    m.name || "İsimsiz Mineral", m.aciklama?.trim(), m.kategori, m.source_id,
    ...(m.fiziksel ?? []), ...(m.zihinsel ?? []), ...(m.fizyoloji ?? []), ...(m.eksiklik_belirtileri ?? []),
    ...(m.fazlalik_belirtileri ?? []), ...(m.doz_asimi ?? []), ...(m.iceren_taslar ?? []),
    ...(m.organ_etkileri ?? []), ...(m.cakralar ?? []),
  ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  const missingVals = vals.filter((v) => !p.text.includes(v.trim()));
  check(`${label}: tüm alan değerleri belgede (${vals.length})`, missingVals.length === 0, missingVals.slice(0, 3).join(" | "));
  const legacyRuns = [...new Set(runs(legacy.doc).map((r) => r.trim()).filter(Boolean))];
  const lost = legacyRuns.filter((r) => !LEGACY_PRESENTATION_ONLY.has(r) && !p.text.includes(r));
  check(`${label}: eski düzenin her etiket/değer metni korunur (${legacyRuns.length})`, lost.length === 0, lost.slice(0, 5).join(" | "));
  // Etiket/değer çokluğu: eski belgede geçen her metin yeni belgede en az aynı sayıda (taş/önek hariç)
  const count = (arr: string[], s: string) => arr.filter((x) => x === s).length;
  const newRunsT = runs(p.doc).map((r) => r.trim());
  const oldRunsT = runs(legacy.doc).map((r) => r.trim());
  const fewer = legacyRuns.filter((r) => !LEGACY_PRESENTATION_ONLY.has(r) && r !== "İçeren Taşlar" && count(newRunsT, r) < count(oldRunsT, r));
  check(`${label}: hiçbir etiket/değer tekrar sayısı azalmaz`, fewer.length === 0, fewer.slice(0, 5).join(" | "));
  check(`${label}: Bilgilendirme + Hazırlayan`, p.text.includes("Bilgilendirme") && p.text.includes("Hazırlayan: ZZ_Uzman Ş"));
  if (!vals.some((v) => v !== (m.name || "İsimsiz Mineral") && v !== m.kategori && v !== m.source_id)) {
    check(`${label}: boş içerik notu`, p.text.includes("Bu mineral kaydında henüz içerik girilmemiş."));
  }

  // ── Premium tasarım korunur: kapak XML'i + alt bilgi eski düzenle birebir
  const coverNew = p.doc.slice(p.doc.indexOf("<w:body>"), p.doc.search(BREAK_RE));
  BREAK_RE.lastIndex = 0;
  const coverOld = legacy.doc.slice(legacy.doc.indexOf("<w:body>"), legacy.doc.search(BREAK_RE));
  BREAK_RE.lastIndex = 0;
  check(`${label}: kapak XML'i eski düzenle birebir`, coverNew.length > 500 && coverNew.slice(0, coverNew.lastIndexOf("<w:p>")) === coverOld.slice(0, coverOld.lastIndexOf("<w:p>")));
  check(`${label}: alt bilgi XML'i eski düzenle birebir`, p.footers.length > 0 && JSON.stringify(p.footers) === JSON.stringify(legacy.footers));
  check(`${label}: üst bilgi eklenmedi (tasarım değişmedi)`, !p.files.some((f) => /^word\/header\d*\.xml$/.test(f)) || p.files.filter((f) => /header/.test(f)).length === legacy.files.filter((f) => /header/.test(f)).length);

  if (OUT_DIR) fs.writeFileSync(path.join(OUT_DIR, `mineral-detail-${label}.docx`), buf);
  return p;
}

function routeSourceChecks() {
  const src = fs.readFileSync(path.join(ROOT, "app/api/dogaltas/minerals/[id]/word-report/route.ts"), "utf8");
  // 2026-10-14 owner kararı: Word Android dahil tüm cihazlarda açık (HD + Astroloji hariç) →
  // kapsam içi Word route'larında androidWordGuard YOK (bkz. scripts/final-hardening/output-visibility.harness.ts §F).
  check("route: Android Word engeli yok (2026-10-14 kararı)", !/androidWordGuard|isAndroidUserAgent/.test(src));
  check("route: UUID doğrulaması", src.includes("if (!isUuid(mineralId))"));
  check("route: requireDogaltasReportAccess", src.includes("requireDogaltasReportAccess(req)") && src.includes("if (!auth.ok) return auth.response;"));
  check("route: tenant filtresi", src.includes('.eq("tenant_id", tenantId)'));
  check("route: sanitizeXmlDeep + sanitizeMineralRowsForReport(", src.includes("sanitizeXmlDeep(") && src.includes("sanitizeMineralRowsForReport("));
  check("route: saf oluşturucu kullanılır", src.includes("buildMineralDetailDocument(mineral, expertDisplayName(auth.profile))"));
  check("route: eski boş TOC/özet sayfası yok", !src.includes("buildTOCPage") && !src.includes("buildStatsPage"));
  const tb = src.indexOf("Packer.toBuffer(doc)");
  const tu = src.indexOf("trackUsage(usageGuard");
  check("route: Usage360 olayı docx üretildikten SONRA", tb > 0 && tu > tb);
  check("route: dosya adı + içerik tipi", src.includes("mineral-${nameSlug}-${dateSlug}.docx") && src.includes("wordprocessingml.document"));
}

async function main() {
  if (OUT_DIR) fs.mkdirSync(OUT_DIR, { recursive: true });
  routeSourceChecks();
  const full = await runCase("full", mineral());
  check("full: Türkçe karakterler", full.text.includes(TR));
  await runCase("zero-stones", mineral({ stones: 0 }));
  await runCase("sixty-stones", mineral({ stones: 60 }));
  await runCase("one-stone", mineral({ stones: 1 }));
  await runCase("empty", mineral({ empty: true }));
  await runCase("nameless", mineral({ name: "" }));
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
