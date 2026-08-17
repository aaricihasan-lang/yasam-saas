/**
 * Şifa Rehberi — EK FAZ 3 PREMIUM WORD harness'ı (harici internet YOK; mock/stub fetch).
 *
 * Kanıtlar (SAF builder + güvenli görsel modülü + XML sanitize + filename):
 *   - export modları (single/selected/filtered/all) gerçek DOCX üretir; ZIP/XML doğrulanır
 *   - TOC yalnız çok-kayıtta; guide sırası + sayfa-sonu + keepNext
 *   - opsiyonel meta gizleme; kaynak/kaynak-türü ayrık; Uzman Notu / Dikkat callout'ları
 *   - section-first vs legacy fallback (duplicate 0)
 *   - Türkçe koruma + XML-geçersiz kontrol karakteri temizliği
 *   - uzun içerik (20k/60k) kayıpsız
 *   - güvenli görsel: host allowlist / MIME / byte / timeout / broken → sessiz atla
 *   - filename sanitize; footer sayfa alanı; font; ZIP bütünlüğü; error-safety
 *
 * Gerçek Postgres/HTTP KULLANILMAZ — builder saftır, görsel fetch'i mock'lanır.
 */
import { deflateSync } from "node:zlib";
import JSZip from "jszip";
import { Document, Packer } from "docx";
import {
  buildSifaReportChildren,
  sifaWordFilename,
  type ImagesByKey,
  type SifaExportMode,
  type WordGuideRaw,
  type WordSectionRow,
} from "@/lib/sifa-rehberi/wordDocument";
import {
  extractImageUrls,
  fetchSafeImage,
  fetchSafeImages,
  isSafeImageUrl,
  storageHostFromEnv,
  type SafeFetchDeps,
} from "@/lib/sifa-rehberi/wordImages";
import { buildFooter, getImgDimensions, sanitizeXmlText, type ReportChild } from "@/lib/docx/reportHelpers";
import { serverErrorResponse } from "@/lib/sifa-rehberi/publicApiError";

// ── mini test runner ────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures: string[] = [];
function check(cond: boolean, label: string) {
  if (cond) pass++; else { fail++; failures.push(label); console.log("  ✗ " + label); }
}
function count(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + needle.length; }
  return n;
}

// ── fixtures ──────────────────────────────────────────────────────────────────
const DAY = "17 Ağustos 2026";
const DATE_SLUG = "2026-08-17";
let gc = 0;
function gid(): string { return `00000000-0000-4000-8000-${(++gc).toString(16).padStart(12, "0")}`; }

function makeGuide(p: Partial<WordGuideRaw> = {}): WordGuideRaw {
  return {
    id: gid(), name: "Kayıt", category: null, symptoms: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: null,
    general_summary: null, medical_causes: null, subconscious_causes: null,
    temperament_causes: null, other_causes: null, iridology_match: null,
    hand_analysis_match: null, cupping_leech: null, reflexology: null,
    diet_recommendations: null, herbal_methods: null, stone_recommendations: null,
    aromatherapy: null, meditation: null, breathwork: null, bioenergy: null,
    massage: null, daily_routine: null, sleep_routine: null,
    supportive_alternative_methods: null, islamic_recommendations: null,
    images: null, healing_guide_sections: null, ...p,
  };
}
function makeSection(p: Partial<WordSectionRow> = {}): WordSectionRow {
  return {
    id: gid(), guide_id: "g", section_type: "applications", mode: null, title: null,
    note: null, source: null, source_kind: null, expert_note: null, attention: null,
    sort_order: null, created_at: "2026-01-01T00:00:00Z", images: null, ...p,
  };
}

// ── minimal valid PNG encoder (distinct buffers → distinct docx media) ──────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function makePng(w: number, h: number, rgb: [number, number, number] = [10, 150, 105]): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  let o = 0;
  for (let y = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++) { raw[o++] = rgb[0]; raw[o++] = rgb[1]; raw[o++] = rgb[2]; } }
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}

// ── DOCX render + unzip ─────────────────────────────────────────────────────────
async function renderDoc(children: ReportChild[]) {
  const doc = new Document({
    sections: [{ properties: {}, footers: { default: buildFooter("Şifa Rehberi Raporu · Yaşam Sistemi") }, children }],
  });
  const buffer = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file("word/document.xml")!.async("string");
  const files = Object.keys(zip.files);
  return { buffer, zip, docXml, files };
}
// docx, `word/media/` DİZİN girdisini de listeler → yalnız gerçek görsel DOSYALARINI say.
function mediaFiles(files: string[]): string[] {
  return files.filter((f) => f.startsWith("word/media/") && !f.endsWith("/"));
}
function build(guides: WordGuideRaw[], mode: SifaExportMode, imgs?: { guide?: ImagesByKey; section?: ImagesByKey }) {
  return buildSifaReportChildren({
    guides, exportMode: mode, today: DAY,
    guideImages: imgs?.guide, sectionImages: imgs?.section,
  });
}

// ── mock fetch (no network) ─────────────────────────────────────────────────────
type MockRes = { ok: boolean; status: number; headers: Record<string, string>; body: Buffer; delayMs?: number; abortHang?: boolean };
function mockFetch(map: Record<string, MockRes>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const m = map[url];
    if (!m) throw new Error("network refused (unmapped)");
    if (m.abortHang) {
      // timeout senaryosu: sinyal iptaline kadar asılı kal → AbortError.
      return await new Promise((_resolve, reject) => {
        const sig = init?.signal;
        if (sig) sig.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    }
    return {
      ok: m.ok, status: m.status,
      headers: { get: (k: string) => m.headers[k.toLowerCase()] ?? null },
      arrayBuffer: async () => m.body.buffer.slice(m.body.byteOffset, m.body.byteOffset + m.body.byteLength),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

const HOST = "abcdefgh.supabase.co";
const OKPNG = makePng(2, 2);
function storageUrl(name: string): string { return `https://${HOST}/storage/v1/object/public/sifa/${name}`; }

async function main() {
  // ══ A. EXPORT MODLARI + KAPAK (real DOCX) ═════════════════════════════════════
  {
    const g = makeGuide({ name: "Tekil Migren", category: "Baş" });
    const { docXml, files } = await renderDoc(build([g], "single"));
    check(files.includes("word/document.xml") && files.includes("[Content_Types].xml"), "01 single üretir geçerli DOCX (ZIP)");
    check(docXml.includes("ŞİFA REHBERİ RAPORU"), "01b single kapak başlığı");
    check(docXml.includes("Tek Kayıt — Tekil Migren"), "01c single kapak alt-başlık");
  }
  {
    const gs = [makeGuide({ name: "A Kayıt" }), makeGuide({ name: "B Kayıt" })];
    const { docXml } = await renderDoc(build(gs, "selected"));
    check(docXml.includes("Seçili Kayıtlar — 2 Kayıt"), "02 selected(2) kapak alt-başlık");
  }
  {
    const gs = [makeGuide({ name: "F1" }), makeGuide({ name: "F2" }), makeGuide({ name: "F3" })];
    const { docXml } = await renderDoc(build(gs, "filtered"));
    check(docXml.includes("Filtrelenmiş Kayıtlar — 3 Kayıt"), "03 filtered kapak alt-başlık");
  }
  {
    const gs = [makeGuide({ name: "X" }), makeGuide({ name: "Y" })];
    const { docXml } = await renderDoc(build(gs, "all"));
    check(docXml.includes("Şifa Rehberi Kataloğu — 2 Kayıt"), "04 all kapak alt-başlık");
  }

  // ══ B. TOC (single yok / multi var) ═══════════════════════════════════════════
  {
    const { docXml } = await renderDoc(build([makeGuide({ name: "Solo" })], "single"));
    check(!docXml.includes("İÇİNDEKİLER"), "05 single'da TOC YOK");
    check(!docXml.includes("SİSTEM ÖZETİ"), "05b single'da stats sayfası YOK");
    check(count(docXml, "w:pageBreakBefore") === 1, "05c single: yalnız 1 sayfa-sonu (h1) → gereksiz boş sayfa yok");
  }
  {
    // EK FAZ 3B: dinamik Word TOC ve "SİSTEM ÖZETİ" KALDIRILDI → statik KAYIT LİSTESİ.
    const gs = [makeGuide({ name: "M1" }), makeGuide({ name: "M2" })];
    const { docXml } = await renderDoc(build(gs, "all"));
    check(!docXml.includes("İÇİNDEKİLER") && !/\bTOC\b/.test(docXml), "06 multi'de dinamik Word TOC YOK");
    check(docXml.includes("KAYIT LİSTESİ") && docXml.includes("M1") && docXml.includes("M2"), "06b multi'de statik KAYIT LİSTESİ + tüm adlar");
    check(!docXml.includes("SİSTEM ÖZETİ"), "06c multi'de Sistem Özeti sayfası YOK");
  }

  // ══ C. SIRA + SAYFA SONU + keepNext ══════════════════════════════════════════
  {
    const gs = [makeGuide({ name: "ZetaBaslik" }), makeGuide({ name: "AlfaBaslik" })];
    const { docXml } = await renderDoc(build(gs, "filtered")); // filtered → resolver sırası KORUNUR
    check(docXml.indexOf("ZetaBaslik") < docXml.indexOf("AlfaBaslik"), "07 filtered guide sırası giriş sırasını korur");
  }
  {
    // EK FAZ 3B: çoklu-kayıtta guide-başı ZORUNLU sayfa kırımı YOK → kesintisiz katalog akışı.
    const two = await renderDoc(build([makeGuide({ name: "P1" }), makeGuide({ name: "P2" })], "all"));
    const three = await renderDoc(build([makeGuide({ name: "P1" }), makeGuide({ name: "P2" }), makeGuide({ name: "P3" })], "all"));
    const d = count(three.docXml, "w:pageBreakBefore") - count(two.docXml, "w:pageBreakBefore");
    check(d === 0, "08 ek guide 0 forced page-break ekler (per-guide break YOK)");
    // forced break yalnız gerekli boundary'lerde: KAYIT LİSTESİ + katalog başlığı = 2.
    check(count(two.docXml, "w:pageBreakBefore") === 2, "08a multi forced break yalnız liste+katalog başı (2)");
  }
  {
    const g = makeGuide({ name: "KN", symptoms: "belirti" });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes("w:keepNext"), "10 başlıklarda keepNext (orphan azalt)");
  }

  // ══ D. HAFİF META (tarih + opsiyonel kategori; ağır tablo YOK) ═══════════════
  {
    const withCat = await renderDoc(build([makeGuide({ name: "C1", category: "BENZERSIZKAT" })], "single"));
    check(withCat.docXml.includes("Kategori: BENZERSIZKAT"), "11a kategori doluysa hafif meta satırında gösterilir");
    const noCat = await renderDoc(build([makeGuide({ name: "C2", category: null })], "single"));
    check(!noCat.docXml.includes("BENZERSIZKAT"), "11 kategori boşsa değer YOK (satır üretilmez)");
    const dated = await renderDoc(build([makeGuide({ name: "C3", created_at: "2026-03-15T00:00:00Z" })], "single"));
    check(dated.docXml.includes("Mart"), "11b guide tarihi hafif meta satırında görünür");
  }

  // ══ E. KAYNAK / KAYNAK TÜRÜ (ayrık) ══════════════════════════════════════════
  {
    const g = makeGuide({ name: "S1", healing_guide_sections: [makeSection({ note: "icerik", source: "Kitap X" })] });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes("Kaynak: Kitap X"), "12a source-only: Kaynak satırı");
    check(!docXml.includes("Kaynak Türü:"), "12b source-only: Kaynak Türü YOK");
  }
  {
    const g = makeGuide({ name: "S2", healing_guide_sections: [makeSection({ note: "icerik", source_kind: "kitap" })] });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes("Kaynak Türü: kitap"), "13a kind-only: Kaynak Türü satırı");
    check(!docXml.includes("Kaynak: kitap"), "13b kind-only: birleşik Kaynak satırı YOK");
  }
  {
    const g = makeGuide({ name: "S3", healing_guide_sections: [makeSection({ note: "icerik", source: "Dergi", source_kind: "makale" })] });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes("Kaynak: Dergi") && docXml.includes("Kaynak Türü: makale"), "14 source+kind: İKİ AYRI satır");
  }

  // ══ F. UZMAN NOTU / DİKKAT callout'ları ══════════════════════════════════════
  {
    const g = makeGuide({ name: "E1", healing_guide_sections: [makeSection({ note: "n", expert_note: "uzman gorusu" })] });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes("Uzman Notu") && docXml.includes("uzman gorusu"), "15 Uzman Notu callout (doluysa)");
  }
  {
    const g = makeGuide({ name: "E2", healing_guide_sections: [makeSection({ note: "n", attention: "dikkat metni" })] });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes("Dikkat Edilmesi Gerekenler") && docXml.includes("dikkat metni"), "16 Dikkat callout (doluysa)");
  }
  {
    const g = makeGuide({ name: "E3", healing_guide_sections: [makeSection({ note: "sadece icerik" })] });
    const { docXml } = await renderDoc(build([g], "single"));
    check(!docXml.includes("Dikkat Edilmesi Gerekenler"), "17 attention boşsa YOK (otomatik uyarı üretilmez)");
    check(!docXml.includes("Uzman Notu"), "18 expert_note boşsa YOK");
  }

  // ══ G. TÜRKÇE + XML-GEÇERSİZ KARAKTER ════════════════════════════════════════
  {
    const g = makeGuide({ name: "ŞİĞÖÜç ıİ Türkçe", healing_guide_sections: [makeSection({ note: "ŞİĞÖÜç ıİ" })] });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes("ŞİĞÖÜç ıİ"), "19 Türkçe karakterler aynen korunur");
  }
    check(sanitizeXmlText("A" + String.fromCharCode(0) + "B" + String.fromCharCode(8) + "C" + String.fromCharCode(31)) === "ABC", "20a sanitize: XML-gecersiz kontrol char (NUL/BS/US) kaldirilir");
  const _s20 = sanitizeXmlText("\u015e\u0130\u011e\u00d6\u00dc\u00e7" + String.fromCharCode(9) + "ab" + String.fromCharCode(10) + "cd" + String.fromCharCode(13));
  check(_s20 === "\u015e\u0130\u011e\u00d6\u00dc\u00e7" + String.fromCharCode(9) + "ab" + String.fromCharCode(10) + "cd" + String.fromCharCode(13), "20b sanitize: Turkce + tab/lf/cr korunur");
  {
    const g = makeGuide({ name: "XmlBad", healing_guide_sections: [makeSection({ note: "iyi" + String.fromCharCode(0) + "metin" })] });
    const { docXml } = await renderDoc(build([g], "single")); // Packer THROW ETMEMELİ
    check(docXml.includes("iyimetin"), "20c XML-gecersiz char temizlenir; belge bozulmaz");
  }

  // ══ H. UZUN İÇERİK (kayıpsız) ════════════════════════════════════════════════
  {
    const big20 = "Z".repeat(20_000);
    const g = makeGuide({ name: "Long20", healing_guide_sections: [makeSection({ note: big20 })] });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes(big20), "21 20k+ içerik TRUNCATE edilmeden Word'e girer");
  }
  {
    const big60 = "Q".repeat(60_000);
    const g = makeGuide({ name: "Long60", healing_guide_sections: [makeSection({ note: big60 })] });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes(big60), "22 60k+ içerik kayıpsız");
  }

  // ══ I. SECTION-FIRST vs LEGACY + DUPLICATE 0 ═════════════════════════════════
  {
    const g = makeGuide({
      name: "SecFirst", general_summary: "LEGACY_OZET",
      healing_guide_sections: [makeSection({ section_type: "applications", note: "SECTION_ICERIK" })],
    });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes("SECTION_ICERIK"), "23 section VARSA section-native render");
    check(!docXml.includes("LEGACY_OZET") && !docXml.includes("Genel Özet"), "25 duplicate 0 — legacy kolon basılmaz");
  }
  {
    const g = makeGuide({ name: "LegacyOnly", general_summary: "GENEL", herbal_methods: "BITKI", healing_guide_sections: null });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes("Genel Özet") && docXml.includes("GENEL") && docXml.includes("BITKI"), "24 section YOKSA legacy fallback");
  }

  // ══ J. GÖRSEL EMBED (builder tarafı; buffer'lar önceden güvenli) ═════════════
  {
    const g = makeGuide({ name: "NoImg" });
    const { files } = await renderDoc(build([g], "single"));
    check(mediaFiles(files).length === 0, "26 görsel yoksa media/ üretilmez");
  }
  {
    const g = makeGuide({ name: "OneImg" });
    const gi: ImagesByKey = new Map([[g.id, [OKPNG]]]);
    const { files } = await renderDoc(build([g], "single", { guide: gi }));
    check(mediaFiles(files).length === 1, "27 geçerli görsel embed edilir (1 media)");
  }
  {
    const sec = makeSection({ note: "n" });
    const g = makeGuide({ name: "MultiImg", healing_guide_sections: [sec] });
    const si: ImagesByKey = new Map([[sec.id, [makePng(2, 2), makePng(3, 3), makePng(4, 4)]]]);
    const { files } = await renderDoc(build([g], "single", { section: si }));
    check(mediaFiles(files).length === 3, "28 çok-görsel: hepsi embed (sıra korunur)");
  }

  // ══ K. GÜVENLİ GÖRSEL FETCH (mock; SSRF/MIME/byte/timeout/broken) ════════════
  check(storageHostFromEnv("https://abcdefgh.supabase.co") === HOST, "29 storageHostFromEnv host çıkarır");
  check(isSafeImageUrl(storageUrl("a.png"), HOST) === true, "30 isSafeImageUrl: geçerli storage URL");
  check(isSafeImageUrl("http://" + HOST + "/storage/v1/object/public/x.png", HOST) === false, "32 non-https reddedilir");
  check(isSafeImageUrl("https://evil-" + HOST + "/storage/v1/object/public/x.png", HOST) === false, "31a farklı host (endsWith değil) reddedilir");
  check(isSafeImageUrl(`https://user:pass@${HOST}/storage/v1/object/public/x.png`, HOST) === false, "31b credentials URL reddedilir");
  check(isSafeImageUrl(`https://${HOST}/evil/path.png`, HOST) === false, "31c public-storage yolu dışı reddedilir");
  check(isSafeImageUrl(`https://127.0.0.1/storage/v1/object/public/x.png`, HOST) === false, "31d localhost/private host reddedilir");
  check(isSafeImageUrl(`data:image/png;base64,AAAA`, HOST) === false, "31e data: şeması reddedilir");
  {
    const url = storageUrl("ok.png");
    const deps: SafeFetchDeps = { fetchFn: mockFetch({ [url]: { ok: true, status: 200, headers: { "content-type": "image/png", "content-length": String(OKPNG.length) }, body: OKPNG } }) };
    const r = await fetchSafeImage(url, HOST, deps);
    check(!!r && r.mime === "image/png" && r.data.length === OKPNG.length, "33 geçerli görsel fetch → buffer");
  }
  {
    const url = storageUrl("disallowed.png");
    const r = await fetchSafeImage("https://other.host/storage/v1/object/public/x.png", HOST, { fetchFn: mockFetch({ [url]: { ok: true, status: 200, headers: {}, body: OKPNG } }) });
    check(r === null, "31f disallowed host → fetch etmeden null");
  }
  {
    const url = storageUrl("bad.gif");
    const r = await fetchSafeImage(url, HOST, { fetchFn: mockFetch({ [url]: { ok: true, status: 200, headers: { "content-type": "image/gif", "content-length": "10" }, body: OKPNG } }) });
    check(r === null, "34 bad MIME (gif) → null");
  }
  {
    const url = storageUrl("big.png");
    const r = await fetchSafeImage(url, HOST, { fetchFn: mockFetch({ [url]: { ok: true, status: 200, headers: { "content-type": "image/png", "content-length": "9999999" }, body: OKPNG } }), maxBytes: 1000 });
    check(r === null, "33b oversize (content-length precheck) → null");
  }
  {
    const url = storageUrl("bigbody.png");
    const big = makePng(40, 40);
    const r = await fetchSafeImage(url, HOST, { fetchFn: mockFetch({ [url]: { ok: true, status: 200, headers: { "content-type": "image/png" }, body: big } }), maxBytes: 100 });
    check(r === null, "33c oversize (hard byte cap, content-length yok) → null");
  }
  {
    const url = storageUrl("500.png");
    const r = await fetchSafeImage(url, HOST, { fetchFn: mockFetch({ [url]: { ok: false, status: 500, headers: {}, body: Buffer.alloc(0) } }) });
    check(r === null, "33d broken (HTTP 500) → null");
  }
  {
    const url = storageUrl("slow.png");
    const r = await fetchSafeImage(url, HOST, { fetchFn: mockFetch({ [url]: { ok: true, status: 200, headers: {}, body: OKPNG, abortHang: true } }), timeoutMs: 40 });
    check(r === null, "30t timeout → null (tek görsel export'u bozmaz)");
  }
  {
    // Sıra korunur + bir kötü görsel diğerlerini düşürmez.
    const u1 = storageUrl("1.png"), u2 = storageUrl("bad2.gif"), u3 = storageUrl("3.png");
    const deps: SafeFetchDeps = { fetchFn: mockFetch({
      [u1]: { ok: true, status: 200, headers: { "content-type": "image/png" }, body: makePng(2, 2) },
      [u2]: { ok: true, status: 200, headers: { "content-type": "image/gif" }, body: OKPNG },
      [u3]: { ok: true, status: 200, headers: { "content-type": "image/png" }, body: makePng(3, 3) },
    }) };
    const res = await fetchSafeImages([u1, u2, u3], HOST, deps);
    check(res.length === 3 && !!res[0] && res[1] === null && !!res[2], "28b fetchSafeImages sıra korunur; kötü görsel null olarak yerinde");
  }
  check(JSON.stringify(extractImageUrls([{ url: "a" }, { url: " b " }, { nope: 1 }, "x", { url: "" }])) === JSON.stringify(["a", "b"]), "28c extractImageUrls: geçerli url'ler (sıra+trim)");

  // ══ L. GÖRSEL BOYUT (aspect/skip) ════════════════════════════════════════════
  check(getImgDimensions(makePng(6, 3)) !== null, "35a getImgDimensions PNG boyut okur");
  check(getImgDimensions(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])) === null, "35 geçersiz/bilinmeyen boyut → null (route skip eder)");

  // ══ M. FILENAME sanitize ═════════════════════════════════════════════════════
  {
    const fn = sifaWordFilename("single", [makeGuide({ name: 'Migren "/\\<>|:' + "  Baş Ağrısı" })], DATE_SLUG);
    check(/^sifa-rehberi-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.docx$/.test(fn), "36a filename ASCII-safe + tarih + .docx");
    check(!/[\/\\"<>|: ]/.test(fn), "36 filename: slash/backslash/kontrol/tırnak YOK (header injection engellenir)");
  }
  check(sifaWordFilename("selected", [makeGuide(), makeGuide()], DATE_SLUG) === `sifa-rehberi-secili-2-kayit-${DATE_SLUG}.docx`, "36b selected filename");
  check(sifaWordFilename("filtered", [makeGuide(), makeGuide(), makeGuide()], DATE_SLUG) === `sifa-rehberi-filtrelenmis-3-kayit-${DATE_SLUG}.docx`, "36c filtered filename");
  check(sifaWordFilename("all", [makeGuide()], "GECERSIZ") === "sifa-rehberi-tumu-1-kayit.docx", "36d geçersiz tarih düşürülür");

  // ══ N. FOOTER / FONT / ZIP ═══════════════════════════════════════════════════
  {
    const { zip, docXml, files } = await renderDoc(build([makeGuide({ name: "Foot" })], "single"));
    const footer = zip.file("word/footer1.xml");
    const footerXml = footer ? await footer.async("string") : "";
    check(!!footer && footerXml.includes("PAGE"), "38 footer sayfa numarası alanı (PAGE) çalışır");
    check(footerXml.includes("Şifa Rehberi Raporu"), "38b footer rapor adı");
    check(docXml.includes("Calibri"), "39 stil/font (Calibri) uygulanır");
    check(files.includes("[Content_Types].xml") && files.includes("word/document.xml") && files.includes("_rels/.rels"), "40 ZIP bütünlüğü (temel parçalar)");
  }

  // ══ O. ERROR SAFETY (opak 500; içerik/DB sızıntısı yok) ══════════════════════
  {
    const orig = console.error;
    console.error = () => {}; // server log'u sustur (secret log'a gider; RESPONSE'a gitmemeli)
    const res = serverErrorResponse({ route: "sifa/word-report", action: "POST.read", tenantId: "t1", cause: { message: "duplicate key PGSECRETVALUE", code: "23505" } });
    const bodyText = await res.text();
    console.error = orig;
    check(res.status === 500, "37a error 500 statü");
    check(bodyText.includes("beklenmeyen") && !bodyText.includes("PGSECRETVALUE") && !bodyText.includes("23505"), "37 error-safety: generic TR + ham DB detayı/stack SIZMAZ");
    check(/"ref":"[0-9a-f-]{36}"/.test(bodyText), "37b opak ref üretilir (korelasyon)");
  }

  // ══ P. KATALOG AKIŞI (EK FAZ 3B) ══════════════════════════════════════════════
  {
    const single = await renderDoc(build([makeGuide({ name: "K1" })], "single"));
    const multi = await renderDoc(build([makeGuide({ name: "K1" }), makeGuide({ name: "K2" })], "all"));
    check(!/KAYIT #\d/.test(single.docXml), "41 single: 'KAYIT #' label YOK");
    check(!/KAYIT #\d/.test(multi.docXml), "42 multi: 'KAYIT #' label YOK");
    check(!single.docXml.includes("SİSTEM ÖZETİ") && !multi.docXml.includes("SİSTEM ÖZETİ"), "43 hiçbir modda Sistem Özeti YOK");
    check(!single.docXml.includes("İÇİNDEKİLER") && !multi.docXml.includes("İÇİNDEKİLER") && !/\bTOC\b/.test(multi.docXml), "44 dinamik Word TOC YOK");
    check(!multi.docXml.includes("İçindekileri Güncelle"), "45 'İçindekileri Güncelle' talimatı YOK");
    check(multi.docXml.includes("KAYIT LİSTESİ"), "46 multi: statik KAYIT LİSTESİ VAR");
    check(!single.docXml.includes("KAYIT LİSTESİ"), "47 single: KAYIT LİSTESİ YOK");
  }
  {
    // Katalog: her ek guide TAM 1 ince divider (border) ekler; per-guide page break YOK.
    const two = await renderDoc(build([makeGuide({ name: "D1" }), makeGuide({ name: "D2" })], "all"));
    const three = await renderDoc(build([makeGuide({ name: "D1" }), makeGuide({ name: "D2" }), makeGuide({ name: "D3" })], "all"));
    // <w:pBdr> = paragraf-border açılış etiketi (divider); tablo hücreleri <w:tcBorders> kullanır → gürültüsüz.
    check(count(three.docXml, "<w:pBdr>") - count(two.docXml, "<w:pBdr>") === 1, "48 multi: her ek guide TAM 1 ince divider (dev boşluk yok)");
  }
  {
    // Kayıt Listesi TÜM adları içerir (özet/snippet DEĞİL) — katalog başlığından ÖNCE.
    const gs = [makeGuide({ name: "AKCIGER" }), makeGuide({ name: "ALERJI" }), makeGuide({ name: "ASTIM" })];
    const { docXml } = await renderDoc(build(gs, "all"));
    const listPart = docXml.split("Şifa Rehberi Kayıtları")[0];
    check(["AKCIGER", "ALERJI", "ASTIM"].every((n) => listPart.includes(n)), "49 kayıt listesinde tüm guide adları");
  }
  {
    // Placeholder Belirtiler gizli (özetleme DEĞİL); gerçek Belirtiler görünür.
    const ph = await renderDoc(build([makeGuide({ name: "PH", symptoms: "Bu bölüm için henüz bilgi eklenmemiş." })], "single"));
    check(!ph.docXml.includes("henüz bilgi eklenmemiş"), "50 placeholder Belirtiler Word'e basılmaz");
    check(!ph.docXml.includes("Belirtiler"), "50a yalnız-placeholder başlık da gizli");
    const real = await renderDoc(build([makeGuide({ name: "RS", symptoms: "GERCEK_BELIRTI" })], "single"));
    check(real.docXml.includes("Belirtiler") && real.docXml.includes("GERCEK_BELIRTI"), "51 gerçek Belirtiler görünür");
  }
  {
    // Placeholder-only section gizli; gerçek section görünür; symptoms tek kez (duplicate 0).
    const g = makeGuide({ name: "PS", symptoms: "GERCEK_SEMPTOM", general_summary: "LEGACY_OZET_X", healing_guide_sections: [
      makeSection({ section_type: "applications", note: "Bu bölüm için içerik henüz eklenmemiş." }),
      makeSection({ section_type: "herbal", note: "GERCEK_SECTION" }),
    ] });
    const { docXml } = await renderDoc(build([g], "single"));
    check(!docXml.includes("henüz eklenmemiş") && docXml.includes("GERCEK_SECTION"), "52 placeholder-only section gizli; gerçek section görünür");
    check(!docXml.includes("LEGACY_OZET_X"), "52a section VARSA legacy basılmaz (duplicate 0)");
    check(count(docXml, "GERCEK_SEMPTOM") === 1, "52b symptoms TAM 1 kez (legacy+guide çift-render YOK)");
  }
  {
    // Legacy guide'da symptoms tek kez.
    const g = makeGuide({ name: "LS", symptoms: "TEK_SEMPTOM", general_summary: "OZET", healing_guide_sections: null });
    const { docXml } = await renderDoc(build([g], "single"));
    check(count(docXml, "TEK_SEMPTOM") === 1, "52c legacy guide: symptoms TAM 1 kez");
  }
  {
    // Uzun içerik multi katalog akışında da kayıpsız.
    const big = "W".repeat(30_000);
    const gs = [makeGuide({ name: "L1", healing_guide_sections: [makeSection({ note: big })] }), makeGuide({ name: "L2", symptoms: "kisa" })];
    const { docXml } = await renderDoc(build(gs, "all"));
    check(docXml.includes(big), "53 multi katalogda uzun içerik TRUNCATE edilmez");
  }
  {
    // Single: kapaktan sonra kayıt yeni sayfada (tam 1 forced break) → gereksiz boş sayfa yok.
    const { docXml } = await renderDoc(build([makeGuide({ name: "SB", symptoms: "x" })], "single"));
    check(count(docXml, "w:pageBreakBefore") === 1, "54 single: tam 1 forced break (gereksiz boş sayfa yok)");
    check(/w:keepNext/.test(docXml), "55 başlıklarda keepNext (orphan control)");
  }
  {
    // İç yapı sadakati: iç boşluk (çift), noktalama, Türkçe, tekrarlar TAM korunur (yalnız boundary trim).
    const structured = "Cümle bir.  Cümle iki — tire, virgül; nokta. ÇĞİŞÖÜ ıi tekrar tekrar tekrar açıklama.";
    const g = makeGuide({ name: "WS", healing_guide_sections: [makeSection({ note: structured })] });
    const { docXml } = await renderDoc(build([g], "single"));
    check(docXml.includes(structured), "56 iç whitespace/noktalama/Türkçe/tekrar TAM korunur (boundary trim dışında kayıp yok)");
  }

  // ── sonuç ──────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PREMIUM WORD HARNESS: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) { console.log("FAILURES:\n - " + failures.join("\n - ")); process.exit(1); }
  console.log("ALL PREMIUM-WORD GATES PASS");
}

main().catch((e) => { console.error(e); process.exit(1); });
