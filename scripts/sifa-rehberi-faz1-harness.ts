/**
 * Şifa Rehberi — FAZ 1 acceptance harness (ağ/DB YOK, saf fonksiyon testleri).
 * Çalıştır: npx tsx scripts/sifa-rehberi-faz1-harness.ts
 */
import { foldTr, foldedIncludes, isMeaningfulText } from "@/lib/sifa-rehberi/normalizeTr";
import {
  listRowPreview,
  matchesListSearch,
  type HealingGuideListRow,
} from "@/lib/sifa-rehberi/healingGuideLiveData";
import {
  formToSections,
  sectionsToFormDraft,
  isFormShapedSections,
  emptyContentDraft,
} from "@/lib/sifa-rehberi/formToSections";
import { validateGuideBody, validateSectionsBody } from "@/lib/sifa-rehberi/limits";
import { checkRateLimit, __resetRateLimitStore } from "@/lib/rateLimit";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(label);
  }
}
function eq<T>(a: T, b: T, label: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

function makeRow(partial: Partial<HealingGuideListRow>): HealingGuideListRow {
  return {
    id: "id",
    tenant_id: "t",
    name: "",
    category: null,
    symptoms: null,
    created_at: "",
    updated_at: null,
    sectionCount: 0,
    sectionTypes: [],
    sectionSnippets: [],
    legacyGroupCount: 0,
    legacyPreview: null,
    legacyText: "",
    ...partial,
  };
}

// ── SEARCH ────────────────────────────────────────────────────────────────────
eq(foldTr("ASTIM"), "astim", "foldTr ASTIM");
eq(foldTr("astım"), "astim", "foldTr astım");
eq(foldTr("astim"), "astim", "foldTr astim");
ok(foldTr("astım") === foldTr("astim"), "astım == astim folded");
eq(foldTr("SİĞİL"), "sigil", "foldTr SİĞİL");
eq(foldTr("siğil"), "sigil", "foldTr siğil");
eq(foldTr("sigil"), "sigil", "foldTr sigil");
ok(foldTr("siğil") === foldTr("sigil"), "siğil == sigil folded");
eq(foldTr("AĞRI"), "agri", "foldTr AĞRI");
ok(foldTr("ağrı") === foldTr("agri"), "ağrı == agri folded");
// Unicode composed vs decomposed (ş = s + combining cedilla U+0327)
ok(foldTr("şişkinlik") === foldTr("şişkinlik".normalize("NFC")), "composed/decomposed eşdeğer");
eq(foldTr("  Mide   Ağrısı  "), "mide agrisi", "whitespace + fold");
eq(foldTr("MİDE"), "mide", "foldTr MİDE (İ)");

// matchesListSearch (astim → ASTIM kaydı; sigil → SİĞİL kaydı)
ok(matchesListSearch(makeRow({ name: "ASTIM" }), "astim"), "search astim → ASTIM");
ok(matchesListSearch(makeRow({ name: "ASTIM" }), "astım"), "search astım → ASTIM");
ok(matchesListSearch(makeRow({ name: "SİĞİL" }), "sigil"), "search sigil → SİĞİL");
ok(matchesListSearch(makeRow({ name: "SİĞİL" }), "siğil"), "search siğil → SİĞİL");
ok(matchesListSearch(makeRow({ name: "BAŞ AĞRISI" }), "agri"), "search agri → BAŞ AĞRISI");
ok(matchesListSearch(makeRow({ name: "X" }), ""), "boş sorgu → hepsi eşleşir");
ok(!matchesListSearch(makeRow({ name: "ASTIM" }), "zzzz"), "eşleşmeyen sorgu → false");
ok(foldedIncludes("Baş AĞRISI", "  agri  "), "foldedIncludes trim");

// ── PREVIEW (placeholder bug) ───────────────────────────────────────────────────
ok(!isMeaningfulText("Bu bölüm için henüz bilgi eklenmemiş."), "placeholder anlamsız");
ok(!isMeaningfulText("   "), "whitespace anlamsız");
ok(!isMeaningfulText(""), "boş anlamsız");
ok(!isMeaningfulText(null), "null anlamsız");
ok(isMeaningfulText("250 gram sarı kantaron otu"), "gerçek metin anlamlı");
// placeholder symptoms + gerçek section → önizleme gerçek içerik olmalı
eq(
  listRowPreview(makeRow({ symptoms: "Bu bölüm için henüz bilgi eklenmemiş.", sectionCount: 1, sectionSnippets: ["250 gram sarı kantaron otu"] })),
  "250 gram sarı kantaron otu",
  "preview: placeholder symptoms gölgelemez",
);
// gerçek symptoms → kullanılır
eq(listRowPreview(makeRow({ symptoms: "Öksürük, balgam" })), "Öksürük, balgam", "preview: gerçek symptoms");
// flat-only (legacyPreview)
eq(listRowPreview(makeRow({ legacyPreview: "Genel özet metni" })), "Genel özet metni", "preview: legacy");
// hiç içerik yok
eq(listRowPreview(makeRow({})), "Henüz özet eklenmedi.", "preview: boş fallback");
// placeholder + hiç section → fallback (placeholder yansımaz)
eq(listRowPreview(makeRow({ symptoms: "Bu bölüm için henüz bilgi eklenmemiş." })), "Henüz özet eklenmedi.", "preview: yalnız placeholder → fallback");

// ── CANONICAL (form ↔ sections) ─────────────────────────────────────────────────
const draft = { ...emptyContentDraft(), medical_causes: "Neden A", herbal_methods: "Bitki B", aromatherapy: "Yağ C", general_summary: "Özet" };
const secs = formToSections(draft);
eq(secs.length, 4, "formToSections: 4 anlamlı alan → 4 section");
const bySection = Object.fromEntries(secs.map((s) => [s.mode, s]));
eq(bySection.medical_causes.section_type, "reasons", "medical_causes → reasons");
eq(bySection.herbal_methods.section_type, "applications", "herbal_methods → applications");
eq(bySection.aromatherapy.section_type, "supportive", "aromatherapy → supportive");
eq(bySection.aromatherapy.title, "Aromaterapi", "aromatherapy title");
eq(bySection.general_summary.section_type, "reasons", "general_summary → reasons");
// boş/placeholder alan section üretmez
const draft2 = { ...emptyContentDraft(), medical_causes: "  ", reflexology: "Bu bölüm için henüz bilgi eklenmemiş." };
eq(formToSections(draft2).length, 0, "boş/placeholder alanlar section üretmez");

// Round-trip: form → sections → form (kayıpsız)
const storedFromForm = secs.map((s) => ({ ...s, source: null as string | null, images: [] as unknown[] }));
ok(isFormShapedSections(storedFromForm), "form-üretimi section'lar form-şekilli");
const back = sectionsToFormDraft(storedFromForm);
ok(back !== null, "form-şekilli → geri-map null değil");
eq(back!.medical_causes, "Neden A", "round-trip medical_causes");
eq(back!.herbal_methods, "Bitki B", "round-trip herbal_methods");
eq(back!.aromatherapy, "Yağ C", "round-trip aromatherapy");
eq(back!.general_summary, "Özet", "round-trip general_summary");
eq(back!.meditation, "", "round-trip boş alan boş kalır");

// isFormShaped negatifler
ok(!isFormShapedSections([]), "boş → form-şekilli değil");
ok(!isFormShapedSections([{ section_type: "herbal", mode: "herbal", note: "x" }]), "bilinmeyen mode → değil");
ok(
  !isFormShapedSections([
    { section_type: "reasons", mode: "medical_causes", note: "a" },
    { section_type: "reasons", mode: "medical_causes", note: "b" },
  ]),
  "aynı alana iki section → değil",
);
ok(!isFormShapedSections([{ section_type: "reasons", mode: "medical_causes", note: "a", source: "Kaynak X" }]), "kaynaklı → değil");
ok(!isFormShapedSections([{ section_type: "reasons", mode: "medical_causes", note: "a", images: [{ url: "x" }] }]), "görselli → değil");
// EGZAMA benzeri karmaşık import kaydı → değil
ok(
  !isFormShapedSections([
    { section_type: "reasons", mode: "bilincalti", note: "a" },
    { section_type: "reasons", mode: "mizac", note: "b" },
    { section_type: "herbal", mode: "herbal", note: "c" },
  ]),
  "EGZAMA-benzeri karmaşık → form-şekilli değil",
);
eq(sectionsToFormDraft([{ section_type: "herbal", mode: "herbal", note: "x" }]), null, "form-şekilli değil → geri-map null");

// ── LIMITS ──────────────────────────────────────────────────────────────────────
// Metadata: makul teknik uzunluk sınırı KORUNUR.
eq(validateGuideBody({ name: "Migren" }), null, "limits: normal name OK");
ok(validateGuideBody({ name: "x".repeat(201) }) !== null, "limits: name>200 red (metadata)");
eq(validateGuideBody({ category: "Solunum" }), null, "limits: normal category OK");
ok(validateGuideBody({ category: "c".repeat(121) }) !== null, "limits: category>120 red (metadata)");

// ÜRÜN KARARI: ana içerik alanlarında hard karakter limiti YOK → uzun metin KABUL.
eq(validateGuideBody({ herbal_methods: "u".repeat(19999) }), null, "limits: ~20k içerik KABUL");
eq(validateGuideBody({ herbal_methods: "u".repeat(20001) }), null, "limits: >20000 profesyonel içerik KABUL (hard limit kaldırıldı)");
eq(validateGuideBody({ herbal_methods: "u".repeat(50001) }), null, "limits: >50000 profesyonel içerik KABUL");
eq(validateGuideBody({ symptoms: "ş".repeat(60000) }), null, "limits: çok uzun symptoms (ana içerik) KABUL");

// ABUSE / bozuk payload guard: içerik alanı string değilse RED.
ok(validateGuideBody({ name: 123 as unknown as string }) !== null, "limits: yanlış tip name red");
ok(validateGuideBody({ herbal_methods: { x: 1 } as unknown as string }) !== null, "limits: içerik object → red (abuse)");
ok(validateGuideBody({ herbal_methods: [1, 2, 3] as unknown as string }) !== null, "limits: içerik array → red (abuse)");
ok(validateGuideBody({ images: new Array(41).fill({}) }) !== null, "limits: 41 görsel red (abuse)");
ok(validateGuideBody({ images: "x" as unknown as unknown[] }) !== null, "limits: images dizi değil red (abuse)");

// Sections: geçerli + metadata/abuse guard'ları; note uzunluğu SINIRSIZ.
eq(validateSectionsBody([{ section_type: "reasons", note: "x" }]), null, "limits: geçerli section OK");
eq(validateSectionsBody([{ section_type: "reasons", note: "n".repeat(60000) }]), null, "limits: çok uzun section note KABUL (hard limit yok)");
ok(validateSectionsBody("x") !== null, "limits: section dizi değil red");
ok(validateSectionsBody([{ note: "x" }]) !== null, "limits: section_type eksik red");
ok(validateSectionsBody([{ section_type: "reasons", note: { x: 1 } }]) !== null, "limits: section note object → red (abuse)");
ok(validateSectionsBody([{ section_type: "reasons", title: "t".repeat(301) }]) !== null, "limits: section title>300 red (metadata)");
ok(validateSectionsBody([{ section_type: "reasons", source: "s".repeat(2001) }]) !== null, "limits: section source>2000 red (metadata)");
ok(validateSectionsBody([{ section_type: "reasons", images: "x" }]) !== null, "limits: section images dizi değil red (abuse)");
ok(validateSectionsBody(new Array(201).fill({ section_type: "reasons" })) !== null, "limits: >200 section red (abuse)");

// ── RATE LIMIT ──────────────────────────────────────────────────────────────────
__resetRateLimitStore();
let allowed = 0;
for (let i = 0; i < 12; i++) if (checkRateLimit("k", 10, 60_000, 1000).allowed) allowed++;
eq(allowed, 10, "rate-limit: 10 izin, sonrası blok");
ok(!checkRateLimit("k", 10, 60_000, 1000).allowed, "rate-limit: 11. blok");
ok(checkRateLimit("k", 10, 60_000, 61_001).allowed, "rate-limit: pencere sonrası reset");
__resetRateLimitStore();

// ── ÖZET ────────────────────────────────────────────────────────────────────────
console.log(`\nŞifa Rehberi FAZ 1 harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("OVERALL: PASS");
