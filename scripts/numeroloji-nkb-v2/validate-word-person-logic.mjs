/**
 * NKB-V2 — Kişi/analiz Word raporu SEKME mantığı harness'ı (DB/docx YOK).
 * wordPersonSections (7 gerçek sekme + normalize + dosya adı + kayıtlı-içerik yok kuralı) ve
 * personSourceNotesForRecords saf fonksiyonlarını kanıtlar.
 *
 * Çalıştır: node --import ./scripts/numeroloji-nkb-v2/register-ts-hook.mjs scripts/numeroloji-nkb-v2/validate-word-person-logic.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HELPERS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers");
const wp = await import(pathToFileURL(join(HELPERS, "wordPersonSections.ts")).href);

const {
  WORD_TAB_ORDER,
  WORD_TAB_LABELS,
  WORD_TAB_NO_SAVED_CONTENT,
  defaultWordPersonSections,
  atLeastOneWordPersonSection,
  normalizeWordPersonSections,
  tabCanHaveSavedContent,
  wordFileName,
  safeFileNamePart,
  personSourceNotesForRecords,
} = wp;

let pass = 0, fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++; else fail++;
}

console.log("── NKB-V2 — 7 gerçek sekme (ekranla birebir) ──");
check("sekme sırası ekranla birebir", WORD_TAB_ORDER.join(",") === "summary,plain,detailed,tas,gorsel,iliski,evis");
check("etiketler ekran sekme adlarıyla birebir",
  WORD_TAB_LABELS.summary === "Sonuç Özeti" &&
  WORD_TAB_LABELS.plain === "Analiz (Hesap Özetsiz)" &&
  WORD_TAB_LABELS.detailed === "Analiz (Hesap Özetli)" &&
  WORD_TAB_LABELS.tas === "Taş Açıklamaları" &&
  WORD_TAB_LABELS.gorsel === "Görsel Rapor" &&
  WORD_TAB_LABELS.iliski === "İlişki Analizi" &&
  WORD_TAB_LABELS.evis === "Ev / İş Yeri Sayısı");
check("teknik/DB seçenekleri YOK (Kimlik/Değerler/PIN/Kaynak Notları)",
  !("identity" in WORD_TAB_LABELS) && !("values" in WORD_TAB_LABELS) && !("pin" in WORD_TAB_LABELS) && !("sourceNotes" in WORD_TAB_LABELS));
check("iliski/evis kayıtlı içerik taşımaz", WORD_TAB_NO_SAVED_CONTENT.includes("iliski") && WORD_TAB_NO_SAVED_CONTENT.includes("evis"));
check("tabCanHaveSavedContent: summary true, iliski false, evis false",
  tabCanHaveSavedContent("summary") === true && tabCanHaveSavedContent("iliski") === false && tabCanHaveSavedContent("evis") === false);

console.log("\n── seçim/normalize ──");
check("varsayılan: tüm sekmeler açık", (() => { const d = defaultWordPersonSections(); return WORD_TAB_ORDER.every((k) => d[k]); })());
check("atLeastOne: hiçbiri → false", atLeastOneWordPersonSection({ summary: false, plain: false, detailed: false, tas: false, gorsel: false, iliski: false, evis: false }) === false);
check("atLeastOne: yalnız plain → true", atLeastOneWordPersonSection({ summary: false, plain: true, detailed: false, tas: false, gorsel: false, iliski: false, evis: false }) === true);
check("normalize: undefined → tümü açık", (() => { const n = normalizeWordPersonSections(undefined); return WORD_TAB_ORDER.every((k) => n[k]); })());
check("normalize: {detailed:true} → yalnız detailed", (() => { const n = normalizeWordPersonSections({ detailed: true }); return n.detailed && !n.summary && !n.plain; })());
check("normalize: hepsi false → fail-safe tümü açık", (() => { const n = normalizeWordPersonSections({ summary: false, plain: false, detailed: false, tas: false, gorsel: false, iliski: false, evis: false }); return n.summary && n.plain; })());

console.log("\n── dosya adı ──");
check("safeFileNamePart Türkçe→ASCII", safeFileNamePart("Ayşe ÇINAR") === "Ayse_CINAR");
check("tek sekme → Numeroloji_<Ad>_<Sekme>.docx", wordFileName("Ali Veli", ["summary"]) === "Numeroloji_Ali_Veli_Sonuc_Ozeti.docx");
check("çok sekme → Secili_Bolumler.docx", wordFileName("Ali Veli", ["summary", "plain"]) === "Numeroloji_Ali_Veli_Secili_Bolumler.docx");

console.log("\n── personSourceNotesForRecords ──");
const REC1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SRC1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function e(over) {
  return { id: "x", tenant_id: "t", knowledge_record_id: REC1, source_id: null, body: "b",
    display_order: 0, include_in_analysis: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over };
}
const matched = [{ id: REC1, analysisType: "ana-kulvar", value: "19" }];
const entries = [
  e({ id: "n1", source_id: SRC1, display_order: 2, body: "ikinci" }),
  e({ id: "n2", source_id: SRC1, display_order: 1, body: "ilk" }),
  e({ id: "n3", source_id: null, include_in_analysis: false, body: "gizli" }),
];
const groups = personSourceNotesForRecords(matched, entries, new Map([[SRC1, "Kaynak A"]]));
check("REC1 grubunda include=false hariç 2 not", groups.length === 1 && groups[0].notes.length === 2);
check("deterministik sıra ilk, ikinci", groups[0].notes[0].body === "ilk" && groups[0].notes[1].body === "ikinci");
check("etiket display_label", groups[0].notes[0].label === "Kaynak A");
check("include=false GÖRÜNMEZ", groups[0].notes.every((n) => n.body !== "gizli"));

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
