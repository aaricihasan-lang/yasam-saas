/**
 * Klasik Numeroloji · Word raporu harness'i (ağ / DB / sağlayıcı çağrısı YOK).
 *
 *   (1) Sentetik fikstürlerden TÜM rapor türleri + varyantları üretilir, docx açılır (JSZip) ve denetlenir:
 *       başlıklar / sayılar, sağlayıcı adı yok (tüm parçalarda), <script yok, taş kaynak adı sızmıyor,
 *       bilgilendirme notu var, usta sayı + karmik borç rozetleri var, karşılaştırmada birleşik sayı yok,
 *       Türkçe karakterler bozulmamış, aynı rapor tarihi → aynı XML (deterministik).
 *   (2) QA klasöründeki ham yanıtlar varsa normalize edilip bellekte gerçekçi kayıt kurulur ve aynı denetimler
 *       uygulanır (klasör yoksa SKIP).
 *   (3) Owner incelemesi için örnek .docx dosyaları (yalnız sentetik veri) QA klasörüne yazılır.
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/report/docx.harness.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import {
  buildBusinessReport,
  buildComparisonReport,
  buildNamesReport,
  buildPersonReport,
  buildRelationshipReport,
  buildStonesReport,
  CLASSIC_REPORT_FOOTER,
  COMPARISON_NO_MERGE_NOTE,
  parsePersonReportGroups,
  SAME_NAME_DIFFERENT_FORMULA,
  STONE_REPORT_DISCLAIMER,
  toReportRecord,
} from "../../../lib/numeroloji-klasik/report/docx";
import { asciiFold, buildReportFilename, contentDisposition, REPORT_FILENAME_MAX, slugifyTitle } from "../../../lib/numeroloji-klasik/report/filename";
import { safeText, safeTrace } from "../../../lib/numeroloji-klasik/report/sanitize";
import { normalizeEndpointResponse } from "../../../lib/numeroloji-klasik/normalize";
import type { ClassicEndpointId } from "../../../lib/numeroloji-klasik/endpoints";
import type { ClassicReportRecord } from "../../../lib/numeroloji-klasik/report/types";
import { wellnessNote } from "../../../lib/docx/reportDisclaimer";
import { alignRecords, type Alignment } from "../../../lib/numeroloji-klasik/compare/align";
import type { ComparisonInput } from "../../../lib/numeroloji-klasik/report/types";

// Derleme denetimi: compare/align.ts çıktısı rapor girdisine doğrudan atanabilir (tsc ile denetlenir).
export const __alignmentAssignable = (x: Alignment): ComparisonInput => x;
import {
  BUSINESS_RECORD,
  COMPARISON,
  FAKE_STONE_SOURCE,
  GEN_AT,
  NAMES_RECORD,
  PERSON_RECORD,
  RELATIONSHIP_RECORD,
  STONES,
} from "./fixtures";

let checks = 0;
let failures = 0;
function check(ok: boolean, label: string, detail?: unknown): void {
  checks++;
  if (ok) {
    if (process.argv.includes("--verbose")) console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail !== undefined ? `\n    ${typeof detail === "string" ? detail.slice(0, 400) : JSON.stringify(detail).slice(0, 400)}` : ""}`);
  }
}

const QA_DIR = process.env.NUM_KLASIK_LIVE_DIR ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29";
const RAW_DIR = path.join(QA_DIR, "raw");
const OUT_DIR = path.join(QA_DIR, "word-ornek");

type Unzipped = { parts: Record<string, string>; doc: string; text: string; paras: string[] };

function decodeXmlText(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

async function unzip(buf: Buffer): Promise<Unzipped> {
  const zip = await JSZip.loadAsync(buf);
  const parts: Record<string, string> = {};
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name];
    if (!f.dir) parts[name] = await f.async("string");
  }
  const doc = parts["word/document.xml"] ?? "";
  const paras = (doc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) => decodeXmlText((p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")));
  return { parts, doc, text: paras.join("\n"), paras };
}

const MOJIBAKE = /Ã.|Ä.|Å.|Ã¼|â€|�/;
const MEDICAL_CLAIM = /tedavi eder|iyileştirir|şifa verir|hastalığı geçirir|ilaç yerine/i;
const MERGED = /birleşik sonuç|ortak sayı|birleştirilmiş sayı|ortalama sayı|merged|combined/i;

async function commonChecks(label: string, buf: Buffer, opts: { stones?: boolean; leakTerms?: string[] } = {}): Promise<Unzipped> {
  check(Buffer.isBuffer(buf) && buf.length > 2000 && buf.subarray(0, 2).toString("latin1") === "PK", `${label}: geçerli docx (zip) üretildi`, buf.length);
  const u = await unzip(buf);
  check(!!u.parts["word/document.xml"], `${label}: word/document.xml var`);
  const all = Object.values(u.parts).join("\n");
  check(!/roxy/i.test(all), `${label}: hiçbir parçada sağlayıcı adı yok`, (all.match(/.{40}roxy.{40}/i) ?? [])[0]);
  check(!/<script/i.test(u.text) && !/&lt;script/i.test(all) && !/<script/i.test(all), `${label}: <script yok`);
  check(!/https?:\/\//i.test(u.text), `${label}: metinde URL yok`);
  check(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(u.text), `${label}: metinde uuid yok`);
  for (const t of [FAKE_STONE_SOURCE, "Kristalvadisi", ...(opts.leakTerms ?? [])]) check(!all.includes(t), `${label}: taş kaynak adı sızmıyor (${t.slice(0, 20)})`);
  check(u.text.includes("Bilgilendirme") && u.text.includes(wellnessNote("numeroloji").full), `${label}: bilgilendirme notu var`);
  const footer = Object.entries(u.parts).filter(([k]) => /word\/footer\d*\.xml$/.test(k)).map(([, v]) => decodeXmlText(v)).join("");
  check(footer.includes(CLASSIC_REPORT_FOOTER), `${label}: alt bilgide uyarı notu var`);
  check(/PAGE/.test(footer), `${label}: alt bilgide sayfa numarası var`);
  check(!MOJIBAKE.test(u.text), `${label}: mojibake yok`, (u.text.match(/.{20}(Ã.|Ä.|Å.|â€|�).{20}/) ?? [])[0]);
  check(/[İıŞşğĞ]/.test(u.text), `${label}: Türkçe karakterler korunmuş`);
  check(!MEDICAL_CLAIM.test(u.text), `${label}: tıbbi iddia yok`);
  if (opts.stones) check(u.text.includes(STONE_REPORT_DISCLAIMER), `${label}: taş uyarısı (sembolik / tıbbi değil) var`);
  check(/Yaşam Sistemi/.test(Object.entries(u.parts).filter(([k]) => /word\/header\d*\.xml$/.test(k)).map(([, v]) => v).join("")), `${label}: üst bilgi var`);
  check(u.parts["docProps/core.xml"]?.includes("2026-10-29T10:30:00Z") ?? false, `${label}: core.xml tarihi enjekte edilen rapor tarihi`);
  return u;
}

async function determinism(label: string, make: () => Promise<Buffer>): Promise<void> {
  const [a, b] = [await unzip(await make()), await unzip(await make())];
  const same = Object.keys(a.parts).every((k) => a.parts[k] === b.parts[k]) && Object.keys(a.parts).length === Object.keys(b.parts).length;
  check(same, `${label}: aynı girdi + aynı tarih → aynı XML (deterministik)`, Object.keys(a.parts).filter((k) => a.parts[k] !== b.parts[k]));
}

const samples: [string, Buffer][] = [];

async function main(): Promise<void> {
  // ── 0) Saf yardımcılar ──
  check(safeText("a <script>alert(1)</script> b") === "a b", "sanitize: script + içeriği silinir", safeText("a <script>alert(1)</script> b"));
  check(!/roxy/i.test(safeText("Kaynak: RoxyAPI ve roxy-v2 servisi")), "sanitize: sağlayıcı adı düşer", safeText("Kaynak: RoxyAPI ve roxy-v2 servisi"));
  check(safeText("bkz https://x.example/a?b=1 son") === "bkz son", "sanitize: URL düşer", safeText("bkz https://x.example/a?b=1 son"));
  check(safeText("x".repeat(500), 100).length === 100 && safeText("x".repeat(500), 100).endsWith("…"), "sanitize: uzunluk sınırı");
  check(safeText("a\u0007b\u202Ec\uFFFE") === "abc", "sanitize: kontrol / yön karakterleri silinir");
  check(safeText("İşığın Ğ ş ü") === "İşığın Ğ ş ü", "sanitize: Türkçe harfler korunur");
  check(safeTrace("Month: 2, Day: 2, Year: 1960; Vowels: E=5; Life Path 11 + Expression 11") === "Ay: 2, Gün: 2, Yıl: 1960; Sesli harfler: E=5; Yaşam Yolu 11 + İfade 11", "sanitize: hesap izi Türkçeleşir", safeTrace("Month: 2, Day: 2, Year: 1960; Vowels: E=5; Life Path 11 + Expression 11"));
  check(asciiFold("İĞÜŞÖÇ ığüşöç") === "IGUSOC igusoc", "filename: ASCII katlama", asciiFold("İĞÜŞÖÇ ığüşöç"));
  const fn = buildReportFilename("kisi", "Ayşe Örnek — Kişisel Analiz / <x>", "2026-10-29T10:30:00Z");
  check(fn === "Klasik-Numeroloji-Ayse-Ornek-Kisisel-Analiz-x-2026-10-29.docx", "filename: Türkçe başlık güvenli ad", fn);
  const longFn = buildReportFilename("karsilastirma", "Ç".repeat(300), "2026-10-29");
  check(longFn.length <= REPORT_FILENAME_MAX && longFn.endsWith("2026-10-29.docx"), `filename: en çok ${REPORT_FILENAME_MAX} karakter`, longFn);
  check(buildReportFilename("isletme", "", null) === "Klasik-Numeroloji-Isletme.docx", "filename: boş başlık → yalnız önek", buildReportFilename("isletme", "", null));
  check(/^[A-Za-z0-9._-]+$/.test(buildReportFilename("tas", "../../etc/passwd\u0000 :*?\"<>|", "2026-10-29")), "filename: yol / ayrılmış karakter yok", buildReportFilename("tas", "../../etc/passwd\u0000 :*?\"<>|", "2026-10-29"));
  check(slugifyTitle(42) === "", "filename: metin olmayan başlık → boş");
  check(contentDisposition(fn).startsWith('attachment; filename="Klasik-Numeroloji-Ayse'), "filename: Content-Disposition", contentDisposition(fn));
  check(JSON.stringify(parsePersonReportGroups(["core", "x", "core", "stones", 5])) === '["core","stones"]', "include doğrulaması: bilinmeyen / tekrar atılır");
  const rr = toReportRecord({ id: "a", kind: "person", title: "T", input: {}, techniques: ["core"], status: "partial", result: { chart: {} }, provider_meta: { provider: "roxy", reference_date: "2026-10-01", failed: ["bridge"] }, methodology_version: "m1", api_schema_version: "s1", created_at: "2026-10-01T00:00:00Z" });
  check(rr.referenceDate === "2026-10-01" && rr.failed?.[0] === "bridge" && !JSON.stringify(rr).includes("roxy"), "toReportRecord: provider_meta'dan yalnız tarih + başarısız etiketler", rr);

  // ── 1) Kişi raporu: üç varyant ──
  for (const variant of ["summary", "technical", "full"] as const) {
    const make = () => buildPersonReport(PERSON_RECORD, { variant, stones: STONES, generatedAt: GEN_AT, expertName: "Uzman Şebnem Işık" });
    const buf = await make();
    samples.push([`kisi-${variant}.docx`, buf]);
    const u = await commonChecks(`kişi/${variant}`, buf, { stones: true });
    const t = u.text;
    for (const h of ["KLASİK NUMEROLOJİ RAPORU", "Özet", "Pisagor Çekirdek Sayılar — Pisagor (Batı)", "Karmik Dersler ve Karmik Borçlar", "Zamanlama — Zirveler, Zorluklar ve Kişisel Döngüler", "Köprü Sayıları", "İsim Harfleri", "Gizli Tutku ve Bilinçaltı Benlik", "Doğum Günü Profili", "Olgunluk Durumu", "Kalde İsim Analizi — Kalde (Cheiro)", "İki Sistem Karşılaştırması", "Uğurlu İlişkiler", "Numeroloji – Doğaltaş", "Yöntem Notu"]) {
      check(t.includes(h), `kişi/${variant}: başlık "${h}"`);
    }
    check(t.includes("Usta sayı"), `kişi/${variant}: usta sayı rozeti`);
    check(t.includes("Karmik borç 16"), `kişi/${variant}: karmik borç rozeti`);
    check(t.includes("Klasik yöntem yorumu"), `kişi/${variant}: "Klasik yöntem yorumu" başlığı`);
    check(t.includes("Pisagor (Batı)") && t.includes("Kalde (Cheiro)"), `kişi/${variant}: yöntem adları`);
    check(t.includes("numk-method-1") && t.includes("numerology-openapi-2.0.0"), `kişi/${variant}: metodoloji + şema sürümü`);
    check(t.includes("29 Ekim 2026"), `kişi/${variant}: rapor tarihi`);
    check(t.includes("Hazırlayan: Uzman Şebnem Işık"), `kişi/${variant}: hazırlayan`);
    check(t.includes("29.10.2026"), `kişi/${variant}: kişisel gün hedef tarihi`);
    check(/0–33 yaş/.test(t) && /52 yaş ve sonrası/.test(t) && /Tüm yaşam boyunca/.test(t), `kişi/${variant}: zirve / zorluk yaş aralıkları`);
    check(t.includes("Sayı 4") && /0 · Eksik/.test(t), `kişi/${variant}: karmik ders ızgarası (1–9, eksikler işaretli)`);
    check(t.includes("Yaşam Yolu ↔ İfade"), `kişi/${variant}: köprü etiketleri Türkçe`);
    check(t.includes("1. Haritanın önerdiği taşlar") && t.includes("2. Titreşim eşleşmesi") && t.includes("3. Gezegen ilişkisi"), `kişi/${variant}: üç taş kaynağı ayrı`);
    check(/Birebir eşleşme/.test(t) && /Kök sayı üzerinden/.test(t), `kişi/${variant}: titreşim birebir ↔ kök ayrı`);
    check(t.includes("Ametist") && t.includes("Sedef") && t.includes("Akuamarin"), `kişi/${variant}: taş adları`);
    check(t.includes("Bu metin kaynaklıdır"), `kişi/${variant}: kirli yorum metni temizlenerek korunur`, (t.match(/Bu metin.{0,40}/) ?? [])[0]);
    const tracePresent = t.includes("Nasıl Hesaplandı?");
    const verifyPresent = t.includes("Doğrulama") && t.includes("Bağımsız hesapla doğrulandı");
    if (variant === "summary") {
      check(!tracePresent, "kişi/summary: hesap izi YOK");
      check(!t.includes("Bağımsız hesapla doğrulandı"), "kişi/summary: doğrulama rozetleri YOK");
    } else {
      check(tracePresent, `kişi/${variant}: "Nasıl Hesaplandı?" izleri var`);
      check(verifyPresent, `kişi/${variant}: doğrulama durumu var`);
      check(t.includes("Bağımsız hesapla uyuşmuyor") && t.includes("Bağımsız hesap: 5"), `kişi/${variant}: uyuşmazlık + bağımsız değer`);
      check(t.includes("Yöntem notu (Pisagor (Batı))"), `kişi/${variant}: yöntem notları`);
      check(t.includes("Ay: 11") && !/\bMonth\b/.test(t), `kişi/${variant}: hesap izi Türkçeleşmiş`);
    }
    if (variant === "full") check(t.includes("Ruhsallık:") && t.includes("Kariyer:"), "kişi/full: tüm yorum alanları");
    await determinism(`kişi/${variant}`, make);
  }

  // include filtresi
  {
    const u = await unzip(await buildPersonReport(PERSON_RECORD, { variant: "summary", include: ["core", "timing"], generatedAt: GEN_AT }));
    check(u.text.includes("Pisagor Çekirdek Sayılar") && u.text.includes("Zamanlama"), "include: seçilen gruplar var");
    check(!u.text.includes("Kalde İsim Analizi") && !u.text.includes("Köprü Sayıları") && !u.text.includes("Numeroloji – Doğaltaş"), "include: seçilmeyen gruplar yok");
    const f = await unzip(await buildPersonReport(PERSON_RECORD, { variant: "full", include: ["core"], generatedAt: GEN_AT }));
    check(f.text.includes("Kalde İsim Analizi") && f.text.includes("Köprü Sayıları"), "full: include yok sayılır, tüm teknikler");
    check(!f.text.includes("Numeroloji – Doğaltaş"), "full: taş sonucu verilmezse taş bölümü yok");
  }
  // eksik veri / kısmi kayıt dayanıklılığı
  {
    const partial: ClassicReportRecord = { ...PERSON_RECORD, status: "partial", failed: ["bridge"], result: { chaldean: PERSON_RECORD.result.chaldean } };
    const u = await commonChecks("kişi/kısmi", await buildPersonReport(partial, { variant: "technical", generatedAt: GEN_AT }));
    check(u.text.includes("Kısmi analiz") && u.text.includes("Köprü sayıları"), "kısmi: başarısız teknik notu");
    check(u.text.includes("Kalde İsim Analizi") && !u.text.includes("Pisagor Çekirdek Sayılar"), "kısmi: yalnız mevcut bölümler");
    const empty = await unzip(await buildPersonReport({ ...PERSON_RECORD, result: {} }, { variant: "full", generatedAt: GEN_AT }));
    check(empty.text.includes("tam numeroloji haritası bulunmuyor"), "boş sonuç: çökmeden boş rapor");
  }

  // ── 2) Diğer raporlar ──
  {
    const make = () => buildStonesReport(PERSON_RECORD, STONES, { generatedAt: GEN_AT });
    const buf = await make();
    samples.push(["dogaltas.docx", buf]);
    const u = await commonChecks("taş", buf, { stones: true });
    check(u.text.includes("NUMEROLOJİ – DOĞALTAŞ RAPORU") && u.text.includes("Haritanın önerdiği") && u.text.includes("Gezegen ilişkisi"), "taş: başlıklar");
    check(u.text.includes("Tatlı Su İncisi") && u.text.includes("Birden çok aday"), "taş: belirsiz adaylar uzman seçimine bırakılır");
    check(u.text.includes("Kütüphanede bulunamadı"), "taş: eşleşmeyen ad metin olarak");
    check(!u.text.includes("ay-tasi") && !u.text.includes("tatli-su-incisi"), "taş: iç anahtar (slug) gösterilmez");
    await determinism("taş", make);
    const off = await unzip(await buildStonesReport(PERSON_RECORD, { ...STONES, libraryAvailable: false, groups: [] }, { generatedAt: GEN_AT }));
    check(off.text.includes("Taş kütüphanesi bu raporda kullanılamadı"), "taş: kütüphane kapalı yedek mod notu");
  }
  {
    const make = () => buildRelationshipReport(RELATIONSHIP_RECORD, { generatedAt: GEN_AT });
    const buf = await make();
    samples.push(["iliski.docx", buf]);
    const u = await commonChecks("ilişki", buf);
    check(u.text.includes("NUMEROLOJİK UYUM RAPORU") && u.text.includes("%85") && u.text.includes("Oldukça Uyumlu"), "ilişki: genel uyum");
    check(u.text.includes("Şükrü Deneme") && u.text.includes("%90"), "ilişki: kişiler + sayı uyumu");
    check(u.text.includes("Usta sayı"), "ilişki: usta sayı rozeti (11)");
    await determinism("ilişki", make);
  }
  {
    const make = () => buildBusinessReport(BUSINESS_RECORD, { generatedAt: GEN_AT });
    const buf = await make();
    samples.push(["isletme.docx", buf]);
    const u = await commonChecks("işletme", buf);
    check(u.text.includes("İŞLETME ADI ANALİZİ") && u.text.includes("Mükemmel") && u.text.includes("Müneccimlerin Tacı") && u.text.includes("Jüpiter"), "işletme: değerlendirme + bileşik ad + gezegen");
    check(u.text.includes("Nasıl Hesaplandı?") && u.text.includes("Kalde (Cheiro)"), "işletme: hesap izi + yöntem");
    await determinism("işletme", make);
  }
  {
    const make = () => buildNamesReport(NAMES_RECORD, { generatedAt: GEN_AT });
    const buf = await make();
    samples.push(["isimler.docx", buf]);
    const u = await commonChecks("isimler", buf);
    check(u.text.includes("Ilgın Deniz") && u.text.includes("Şule Ağaç") && u.text.includes("Aday: Şule Ağaç"), "isimler: adaylar + ayrıntı bölümleri");
    check(u.text.includes("Aynı kök") && u.text.includes("Farklı"), "isimler: iki sistem uyum durumu");
    check(u.text.includes("Kısmi analiz"), "isimler: kısmi kayıt notu");
    check(!MERGED.test(u.text), "isimler: birleşik sayı yok");
    await determinism("isimler", make);
  }
  {
    const make = () => buildComparisonReport(COMPARISON, { generatedAt: GEN_AT, expertName: "Uzman Şebnem Işık" });
    const buf = await make();
    samples.push(["karsilastirma.docx", buf]);
    const u = await commonChecks("karşılaştırma", buf, { stones: true });
    const t = u.text;
    check(t.includes("Bütüncül Numeroloji (A)") && t.includes("Klasik Numeroloji (B)"), "karşılaştırma: iki yöntem adı");
    const ia = u.paras.findIndex((p) => p.trim() === "Bütüncül Numeroloji (A)");
    const ib = u.paras.findIndex((p) => p.trim() === "Klasik Numeroloji (B)");
    const ic = u.paras.findIndex((p) => p.includes("Kavram Eşleştirme Tablosu"));
    check(ia > 0 && ib > ia && ic > ib, "karşılaştırma: A ve B ayrı bölümler, sonra kavram tablosu", { ia, ib, ic });
    check(t.includes(SAME_NAME_DIFFERENT_FORMULA), "karşılaştırma: “Aynı ad, farklı formül” işareti");
    check(t.includes("Kavram Sözlüğü") && t.includes("Ş, Ğ, İ harflerinin değerleri farklıdır"), "karşılaştırma: sözlük açıklaması");
    check(t.includes("PİN Kodu") && t.includes("Çakra omurgası") && t.includes("Köprü Sayıları") && t.includes("Kalde bileşik sayı"), "karşılaştırma: yalnız-A / yalnız-B listeleri");
    check(t.includes("atanan") && t.includes("haritanın önerdiği") && t.includes("türetilmiş (titreşim / gezegen)") && t.includes("Sitrin"), "karşılaştırma: taşlar üç sütun");
    check(t.includes("Her iki yöntemde de geçen taşlar: Ametist (bileklik)"), "karşılaştırma: ortak taşlar");
    check(t.includes(COMPARISON_NO_MERGE_NOTE), "karşılaştırma: birleştirme yok notu");
    check(!MERGED.test(t), "karşılaştırma: birleşik / ortak sayı alanı YOK");
    check(t.includes("11/2 (kök 2)") && t.includes("Karmik borç 16") && t.includes("Usta sayı"), "karşılaştırma: A gösterimi + B rozetleri");
    check(t.includes("Bir tarafta yok") && t.includes("Aynı değer") && t.includes("Aynı kök"), "karşılaştırma: ilişki etiketleri Türkçe");
    check(t.includes("Zirve Yılları ↔ Zirveler — 2. dönem"), "karşılaştırma: dönem sırası");
    check(t.includes("PİN Kodu — bu kayıtta mevcut") && t.includes("Kalde bileşik sayı — bu kayıtta yok"), "karşılaştırma: yalnız-taraf mevcut/yok işareti");
    check(t.includes("Ametist (bileklik)") && t.includes("Sitrin (kütle)") && t.includes("Akuamarin (gezegen)") && t.includes("Sedef (titreşim (kök))") && t.includes("İnci (belirsiz ad)"), "karşılaştırma: taş köken etiketleri");
    const inote = u.paras.findIndex((p) => p.includes("Uzman Notu"));
    const istones = u.paras.findIndex((p) => p.includes("Doğaltaş — Üç Kaynak Ayrı"));
    check(inote > istones && inote > ic && u.paras.slice(inote).some((p) => p.includes("danışanla birlikte değerlendirilecek")), "karşılaştırma: uzman notu en sonda", { inote, istones });
    await determinism("karşılaştırma", make);
  }

  // gerçek hizalayıcı çıktısı (mevcut taraf yok → eksik taraf notu)
  {
    const al = alignRecords(null, { chart: PERSON_RECORD.result.chart as never, stones: STONES });
    const buf = await buildComparisonReport({ alignment: al, legacyMeta: {}, classicMeta: { title: "Hizalayıcı çıktısı", personName: "Ayşe Örnek Işıl" } }, { generatedAt: GEN_AT });
    samples.push(["karsilastirma-hizalayici.docx", buf]);
    const u = await commonChecks("karşılaştırma/hizalayıcı", buf, { stones: true });
    check(u.text.includes("Bütüncül Numeroloji kaydı bulunamadı"), "hizalayıcı: eksik taraf notu", al.missing);
    check(u.text.includes("Hayat Yolu ↔ Yaşam Yolu") && u.text.includes("Kavram Sözlüğü"), "hizalayıcı: sözlük kavramları");
    check(!MERGED.test(u.text), "hizalayıcı: birleşik sayı yok");
  }

  // ── 3) QA ham yanıtlarından gerçekçi kayıtlar (bellekte) ──
  const rawFile = (n: string) => path.join(RAW_DIR, `${n}.json`);
  const RAW: [string, ClassicEndpointId, string][] = [
    ["chart", "chart", "l01-chart-lp11-tr"],
    ["bridge", "bridge", "m02-c1-bridge"],
    ["personal_day", "personal_day", "m02-pd-default"],
    ["chaldean", "chaldean", "l01-chaldean-helen"],
    ["dual", "dual", "l01-dual-deniz"],
    ["compatibility", "compatibility", "m02-cp-mixed"],
    ["business_name", "business_name", "l01-business-ford"],
  ];
  if (!existsSync(RAW_DIR) || RAW.some(([, , f]) => !existsSync(rawFile(f)))) {
    console.log("SKIP (gerçekçi kısım) — QA ham yanıtları yok");
  } else {
    const norm: Record<string, unknown> = {};
    for (const [label, ep, f] of RAW) {
      const r = normalizeEndpointResponse(ep, JSON.parse(readFileSync(rawFile(f), "utf8")).body);
      check(r.ok, `gerçekçi: ${f} normalize`, r.ok ? undefined : r.reason);
      if (r.ok) norm[label] = r.data;
    }
    const person: ClassicReportRecord = {
      kind: "person", title: "Gerçekçi kayıt", input: { fullName: "Deneme Kişi", birth: { year: 1960, month: 2, day: 2 } },
      techniques: ["core", "bridge", "personal_day", "chaldean", "dual"], status: "complete",
      result: { chart: norm.chart, bridge: norm.bridge, personal_day: norm.personal_day, chaldean: norm.chaldean, dual: norm.dual },
      methodologyVersion: "numk-method-1", apiSchemaVersion: "numerology-openapi-2.0.0", referenceDate: "2026-10-29", createdAt: "2026-10-29T09:00:00.000Z",
    };
    for (const variant of ["summary", "technical", "full"] as const) {
      const u = await commonChecks(`gerçekçi kişi/${variant}`, await buildPersonReport(person, { variant, stones: STONES, generatedAt: GEN_AT }), { stones: true });
      check(u.text.includes("Usta sayı") && u.text.includes("Karmik borç 16"), `gerçekçi kişi/${variant}: usta + karmik rozetleri`);
      check(u.text.includes("Usta Sezgisel"), `gerçekçi kişi/${variant}: yorum başlığı`);
      const big = u.paras.reduce((m, p) => Math.max(m, p.length), 0);
      check(big <= 6100, `gerçekçi kişi/${variant}: uzun metin sınırlı (en uzun paragraf ${big})`);
    }
    await commonChecks("gerçekçi ilişki", await buildRelationshipReport({ ...RELATIONSHIP_RECORD, result: { compatibility: norm.compatibility } }, { generatedAt: GEN_AT }));
    await commonChecks("gerçekçi işletme", await buildBusinessReport({ ...BUSINESS_RECORD, input: { name: "Ford" }, result: { business_name: norm.business_name } }, { generatedAt: GEN_AT }));
    await commonChecks("gerçekçi isimler", await buildNamesReport({ ...NAMES_RECORD, status: "complete", failed: [], result: { "dual#1": norm.dual } }, { generatedAt: GEN_AT }));
  }

  // ── NK-R4: özet düzeyde de bağımsız kontrol farkı işaretlenir; NK-005 puan etiketi ──
  {
    const ch = PERSON_RECORD.result.chart as Record<string, unknown>;
    const core = ch.core as Record<string, Record<string, unknown>>;
    const mis: ClassicReportRecord = { ...PERSON_RECORD, result: { ...PERSON_RECORD.result, chart: { ...ch, core: { ...core, lifePath: { ...core.lifePath, verification: { status: "mismatch", oracleValue: 9 } } } } } };
    const u = await commonChecks("NK-R4 özet + fark", await buildPersonReport(mis, { variant: "summary", generatedAt: GEN_AT }));
    check(u.text.includes("Kontrol farkı"), "NK-R4: özet raporda fark çıkan sayı 'Kontrol farkı' rozetiyle");
    const r = await commonChecks("NK-005 ilişki", await buildRelationshipReport(RELATIONSHIP_RECORD, { generatedAt: GEN_AT }));
    check(r.text.includes("klasik yöntem puanı") && r.text.includes("bağımsız doğrulanamaz") && r.text.includes("puan hariç"), "NK-005: puan 'klasik yöntem puanı · doğrulanamaz', doğrulama yalnız sayılar");
  }

  // ── 4) Örnek dosyalar (yalnız sentetik) ──
  if (existsSync(QA_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
    for (const [name, buf] of samples) writeFileSync(path.join(OUT_DIR, name), buf);
    console.log(`örnekler: ${samples.length} dosya → ${OUT_DIR}`);
  } else {
    console.log("SKIP (örnek yazımı) — QA klasörü yok");
  }

  console.log(`\n${checks - failures}/${checks} denetim geçti${failures ? ` — ${failures} HATA` : ""}`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
