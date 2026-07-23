/**
 * NKB-V2-E — Admin Word çıktısı SAF mantık harness'ı (docx/DB yok).
 * node --import ./scripts/numeroloji-nkb-v2/register-ts-hook.mjs scripts/numeroloji-nkb-v2/validate-word-logic.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HELPERS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers");
const w = await import(pathToFileURL(join(HELPERS, "wordKulvarLogic.ts")).href);
const ks = await import(pathToFileURL(join(HELPERS, "knowledgeSections.ts")).href);

const { kulvarSectionsForWord, recordSourceView, recordSourceMainLine, buildBibliography, bibliographyDetail } = w;
const { isKulvarAnalysisType } = ks;

let pass = 0;
let fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++;
  else fail++;
}

console.log("── NKB-V2-E — Word mantığı ──");

// (1) Kanonik sıra — content_sections karışık order/sırayla verilse de overview→...→destructive
const scrambled = [
  { key: "destructive", label: "Yıkıcı Potansiyeller", body: "D", order: 1 },
  { key: "overview", label: "Genel Açıklama", body: "O", order: 9 },
  { key: "negative", label: "Olumsuz Potansiyeller", body: "N", order: 2 },
  { key: "constructive", label: "Yapıcı Potansiyeller", body: "C", order: 5 },
];
const s1 = kulvarSectionsForWord({ content_sections: scrambled, description: "ESKI" });
check("Ana Kulvar dört bölüm KANONİK sırada", s1.map((s) => s.label).join("|") === "Genel Açıklama|Yapıcı Potansiyeller|Olumsuz Potansiyeller|Yıkıcı Potansiyeller");
// (2) Yan Kulvar aynı yapı (fonksiyon tür-agnostik; route yalnız kulvar'a uygular)
check("Yan Kulvar aynı dört bölüm yapısı", kulvarSectionsForWord({ content_sections: scrambled }).length === 4);
// (3) Boş bölüm atlanır
const s3 = kulvarSectionsForWord({ content_sections: [
  { key: "overview", label: "Genel Açıklama", body: "dolu", order: 1 },
  { key: "constructive", label: "Yapıcı Potansiyeller", body: "   ", order: 2 },
] });
check("Boş body içeren bölüm atlanır", s3.length === 1 && s3[0].label === "Genel Açıklama");
// (4) Legacy fallback: content_sections null → yalnız Genel Açıklama
const s4 = kulvarSectionsForWord({ content_sections: null, description: "eski metin" });
check("Legacy fallback yalnız Genel Açıklama", s4.length === 1 && s4[0].label === "Genel Açıklama" && s4[0].body === "eski metin");
// (5) content_sections varsa legacy description tekrarlanmaz
check("content_sections varsa description tekrarlanmaz", s1[0].body === "O" && s1[0].body.indexOf("ESKI") === -1);
// content_sections geçerli ama tümü boş → legacy'e düşer
const s5b = kulvarSectionsForWord({ content_sections: [{ key: "overview", label: "Genel Açıklama", body: "  ", order: 1 }], description: "yedek" });
check("content_sections tümü boş → legacy overview", s5b.length === 1 && s5b[0].body === "yedek");
// (6,7) Element/Çakra dört bölüm render'ına alınmaz (route gate)
check("Element kulvar değil (dört bölüm render yok)", isKulvarAnalysisType("element") === false);
check("Çakra kulvar değil", isKulvarAnalysisType("cakra-omurga") === false);

// Kayıt-altı kaynak görünümü
const link = { id: "l1", source_id: "s1", page_start: 19, page_end: 21, locator: "Ana Kulvar — 1 No'lu Tipoloji", is_primary: true, section_key: "overview", display_order: 0, created_at: "2026-01-01", internal_note: "GİZLİ NOT" };
const src = { id: "s1", display_label: "Elif YILMAZ&Sema ÇAYLAR", title: "Numeroloji I. Seviye" };
const view = recordSourceView(link, src);
const mainLine = recordSourceMainLine(view);
// (8) yapılandırılmış kaynak görünür
check("Kayıt-altı kaynak görünür (display_label satırda)", mainLine.indexOf("Elif YILMAZ&Sema ÇAYLAR") === 0);
// (9,10) display_label yazımı korunur, "&" boşluksuz
check("display_label yazımı korunur", view.displayLabel === "Elif YILMAZ&Sema ÇAYLAR");
check("Elif YILMAZ&Sema ÇAYLAR birebir (& boşluksuz)", mainLine.includes("Elif YILMAZ&Sema ÇAYLAR") && !mainLine.includes("Elif YILMAZ & Sema"));
// (11) tek sayfa
check("tek sayfa 's. 19'", recordSourceMainLine(recordSourceView({ ...link, page_start: 19, page_end: 19 }, src)).includes("s. 19") && !recordSourceMainLine(recordSourceView({ ...link, page_start: 19, page_end: 19 }, src)).includes("–"));
// (12) sayfa aralığı
check("sayfa aralığı 's. 19–21'", mainLine.includes("s. 19–21"));
// (13) locator gösterilir
check("locator gösterilir", mainLine.includes("Ana Kulvar — 1 No'lu Tipoloji"));
// (14) section_key → Türkçe etiket
check("section_key overview → 'Genel Açıklama'", view.sectionLabel === "Genel Açıklama" && mainLine.includes("Genel Açıklama"));
check("birincil kaynak işareti", view.isPrimary === true && mainLine.includes("(Birincil kaynak)"));
// (15) internal_note çıktıya girmez
check("internal_note view'da yok", !("internal_note" in view));
check("internal_note ana satırda yok", !mainLine.includes("GİZLİ NOT"));
// section_key null → etiket yazılmaz
check("section_key null → etiket boş", recordSourceView({ ...link, section_key: null }, src).sectionLabel === "");

// Kaynakça
const links = [
  { source_id: "s1" }, { source_id: "s2" }, { source_id: "s1" }, { source_id: "s3" },
];
const sources = [
  { id: "s1", display_label: "B Kaynağı", title: null },
  { id: "s2", display_label: "A Kaynağı", title: null },
  // s3 kaynağı YOK (legacy/eksik) → phantom eklenmemeli
];
const bib = buildBibliography(links, sources);
// (16) aynı source_id bir kez
check("Aynı source_id kaynakçada bir kez", bib.filter((s) => s.id === "s1").length === 1);
// (17) deterministik sıra (display_label)
check("Kaynakça display_label'a göre sıralı", bib.map((s) => s.display_label).join("|") === "A Kaynağı|B Kaynağı");
// (20) eşleşmeyen source_id (legacy/eksik) phantom eklenmez
check("Eşleşmeyen source_id kaynakçaya girmez (phantom yok)", !bib.some((s) => s.id === "s3"));
// (22) boş listede güvenli
check("Boş bağlantı listesi → boş kaynakça", buildBibliography([], []).length === 0);

// (18) eksik bibliyografik alan uydurulmaz
check("Yalnız display_label olan kaynak → detay boş (uydurma yok)", bibliographyDetail({ id: "x", display_label: "X", title: null, authors: null, organization: null, source_type: null, level_or_edition: null, publication_year: null, language: null }) === "");
check("Mevcut alanlar birleşir, olmayan atlanır", bibliographyDetail({ id: "x", display_label: "X", title: "Eser", authors: "Yazar", organization: null, source_type: null, level_or_edition: null, publication_year: 2024, language: null }) === "Yazar · Eser · 2024");
check("'Bilinmiyor' / sahte alan yok", !/Bilinmiyor|null|undefined/.test(bibliographyDetail({ id: "x", display_label: "X", title: null, authors: null, organization: "Kurum", source_type: null, level_or_edition: null, publication_year: null, language: null })));

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
