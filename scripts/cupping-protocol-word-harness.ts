/**
 * KUPA & HACAMAT — K2 — PROTOKOL WORD HARNESS (GERÇEK DOCX ÜRETİMİ).
 *
 * Çalıştırma:  npx tsx scripts/cupping-protocol-word-harness.ts   (cwd = repo kökü)
 *
 * KAPSAM: SAF builder (lib/cupping/protocolWord) ile GERÇEK .docx üretir, JSZip ile açar ve
 *   word/document.xml + footer üzerinde doğrular. DB/auth YOK (route güvenliği ayrı: security /
 *   module-test harness). "Kaynak grep" DEĞİL — gerçek OOXML çıktısını denetler.
 */
import JSZip from "jszip";
import {
  buildProtocolWordBuffer,
  protocolWordFilename,
  WORD_CONTENT_TYPE,
  type ProtocolWordInput,
} from "@/lib/cupping/protocolWord";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    fails.push(msg);
  }
}

async function docXml(buffer: Buffer): Promise<{ xml: string; zip: JSZip }> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  return { xml, zip };
}

function fullInput(): ProtocolWordInput {
  return {
    protocol: {
      title: "Baş Ağrısı Protokolü — Şİğ Öçü",
      category: "Baş & Boyun",
      summary: "Kısa özet satırı.\nİkinci satır.",
      tags: ["migren", "gerilim"],
      preparation_note: "Uygulama öncesi hazırlık notu.",
      aftercare_note: "Uygulama sonrası dinlenme.",
      follow_up_note: "Bir hafta sonra takip.",
    },
    points: [
      { name: "Kâhil / İki Kürek Arası", note: "Ana bölge", extra: "Üst sırt" },
      { name: "Baş / Bıngıldak", note: null, extra: null },
    ],
    techniques: [{ name: "Sabit Kuru Kupa", note: "5 dakika", extra: null }],
    steps: [
      { title: "Temizlik", body: "Bölgeyi temizle.\nAlkol uygula.", stage_label: "Hazırlık" },
      { title: null, body: "Kupaları yerleştir.", stage_label: null },
    ],
    safety: [{ name: "Gebelikte uygulanmaz", note: "Mutlak", extra: "Kontrendikasyon" }],
    entries: [
      { title: "Geleneksel kullanım", content: "Bu bölge geleneksel olarak…", source_label: "Süleyman Gök", locator: "s.42" },
    ],
    sources: [
      { name: "Zakir Benli — Hacamat Tedavisi", type_label: "Akademik Makale", locator: "s.10", note: "birincil" },
    ],
  };
}

async function run() {
  const buf = await buildProtocolWordBuffer(fullInput());
  const { xml, zip } = await docXml(buf);

  // [1] Geçerli DOCX.
  ok(buf.length > 2000, "docx[1]: buffer makul boyutta (>2KB)");
  ok(buf[0] === 0x50 && buf[1] === 0x4b, "docx[1]: PK magic bytes (geçerli zip/docx)");
  ok(!!zip.file("word/document.xml"), "docx[1]: word/document.xml mevcut");
  ok(!!zip.file("[Content_Types].xml"), "docx[1]: [Content_Types].xml mevcut");
  ok(WORD_CONTENT_TYPE === "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx[1]: doğru DOCX MIME sabiti");

  // [2] Başlık + meta.
  ok(xml.includes("Baş Ağrısı Protokolü") && xml.includes("Şİğ Öçü"), "içerik[2]: protokol başlığı + Türkçe karakter");
  ok(xml.includes("Baş &amp; Boyun") || xml.includes("Baş & Boyun"), "içerik[2]: kategori aktarıldı");
  ok(xml.includes("migren") && xml.includes("gerilim"), "içerik[2]: etiketler aktarıldı");
  ok(xml.includes("Kısa özet satırı.") && xml.includes("İkinci satır."), "içerik[2]: özet çok-satır korunur");

  // [3] Tüm bölümler + başlıkları.
  ok(xml.includes("BÖLGELER / NOKTALAR") && xml.includes("Kâhil / İki Kürek Arası") && xml.includes("Baş / Bıngıldak"), "bölüm[3]: Noktalar");
  ok(xml.includes("TEKNİKLER") && xml.includes("Sabit Kuru Kupa"), "bölüm[3]: Teknikler");
  ok(xml.includes("UYGULAMA AKIŞI") && xml.includes("Kupaları yerleştir.") && xml.includes("Bölgeyi temizle."), "bölüm[3]: Uygulama Akışı (adımlar)");
  ok(xml.includes("GÜVENLİK / DİKKAT") && xml.includes("Gebelikte uygulanmaz"), "bölüm[3]: Güvenlik");
  ok(xml.includes("HAZIRLIK") && xml.includes("Uygulama öncesi hazırlık notu."), "bölüm[3]: Hazırlık");
  ok(xml.includes("UYGULAMA SONRASI") && xml.includes("Uygulama sonrası dinlenme."), "bölüm[3]: Uygulama Sonrası");
  ok(xml.includes("TAKİP") && xml.includes("Bir hafta sonra takip."), "bölüm[3]: Takip");
  ok(xml.includes("BİLGİLER") && xml.includes("Bu bölge geleneksel olarak"), "bölüm[3]: Bilgiler");
  ok(xml.includes("KAYNAKLAR") && xml.includes("Zakir Benli — Hacamat Tedavisi"), "bölüm[3]: Kaynaklar (tablo)");

  // [4] Adım sıra numaraları + stage_label.
  ok(xml.includes("1. ") && xml.includes("2. "), "akış[4]: adımlar numaralı");
  ok(xml.includes("[Hazırlık]"), "akış[4]: stage_label aktarıldı");

  // [5] Sayfa A4 DİKEY.
  ok(xml.includes('w:w="11906"'), "sayfa[5]: A4 dikey (pgSz 11906)");

  // [6] Footer — TAM nötr metin + marka + PAGE (NUMPAGES YOK — Word PDF-kilit önlemi).
  const footerNames = Object.keys(zip.files).filter((f) => /^word\/footer\d+\.xml$/.test(f));
  let footerXml = "";
  for (const fn of footerNames) footerXml += await zip.file(fn)!.async("string");
  ok(footerNames.length > 0, "footer[6]: en az bir footer parçası var");
  ok(footerXml.includes("Bu içerik, uzman tarafından oluşturulan çalışma ve bilgilendirme kaydının bir parçasıdır."), "footer[6]: TAM nötr ibare");
  ok(footerXml.includes("Yaşam Sistemi™"), "footer[6]: Yaşam Sistemi™ marka altlığı");
  ok(footerXml.includes("Hacamat Protokolü"), "footer[6]: 'Hacamat Protokolü' etiketi (danışan raporu adlandırması YOK)");
  ok(!/NUMPAGES/.test(footerXml), "footer[6]: NUMPAGES YOK (Word PDF-kilit hatası önlendi)");
  ok(/\bPAGE\b/.test(footerXml), "footer[6]: geçerli sayfa (PAGE) alanı var");
  // Medical/legal disclaimer eklenmez.
  ok(!/tıbbi tavsiye|teşhis|tedavi eder|doktor|hekim|reçete/i.test(footerXml), "footer[6]: tıbbi/hukuki disclaimer eklenmez");

  // [7] BOŞ BÖLÜM SUPPRESSION — yalnız başlık olan protokolde hiçbir bölüm başlığı basılmaz.
  const minimal: ProtocolWordInput = {
    protocol: { title: "Minimal Protokol" },
    points: [], techniques: [], steps: [], safety: [], entries: [], sources: [],
  };
  const { xml: minXml } = await docXml(await buildProtocolWordBuffer(minimal));
  ok(minXml.includes("Minimal Protokol"), "boş[7]: minimal protokol başlığı var");
  ok(!minXml.includes("BÖLGELER") && !minXml.includes("TEKNİKLER") && !minXml.includes("UYGULAMA AKIŞI")
     && !minXml.includes("GÜVENLİK") && !minXml.includes("HAZIRLIK") && !minXml.includes("UYGULAMA SONRASI")
     && !minXml.includes("TAKİP") && !minXml.includes("BİLGİLER") && !minXml.includes("KAYNAKLAR"),
    "boş[7]: veri olmayan bölümlerin BAŞLIĞI basılmaz (boş heading yok)");

  // [8] Güvenli dosya adı — path/control char temizlenir, Türkçe korunur.
  const fnNormal = protocolWordFilename({ title: "Baş Ağrısı" });
  ok(fnNormal === "Kupa-Protokolu-Baş-Ağrısı.docx", `dosya[8]: normal ad ('${fnNormal}')`);
  const fnEvil = protocolWordFilename({ title: 'a/b\\c:*?"<>|d' });
  ok(!/[\\/:*?"<>|]/.test(fnEvil) && fnEvil.startsWith("Kupa-Protokolu-") && fnEvil.endsWith(".docx"),
    `dosya[8]: path/control karakterleri temizlenir ('${fnEvil}')`);
  const fnEmpty = protocolWordFilename({ title: "///" });
  ok(fnEmpty === "Kupa-Protokolu-Protokol.docx", `dosya[8]: tamamen geçersiz başlık → güvenli varsayılan ('${fnEmpty}')`);

  console.log(`\ncupping-protocol-word harness: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log("Başarısızlar:\n  - " + fails.join("\n  - "));
    process.exit(1);
  }
  console.log("✅ K2 — Protokol DOCX: tüm bölümler + boş-bölüm suppression + TR + nötr footer + güvenli filename geçti.");
}

run().catch((e) => {
  console.error("HARNESS ÇÖKTÜ:", e);
  process.exit(1);
});
