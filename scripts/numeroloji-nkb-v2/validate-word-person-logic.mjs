/**
 * NKB-V3 — Kişi/analiz Word raporu SEKME mantığı harness'ı (DB/docx YOK).
 * 5 gerçek sekme (İlişki/Ev-İş KALDIRILDI) + normalize + dosya adı + personSourceNotesForRecords.
 *
 * Çalıştır: node --import ./scripts/numeroloji-nkb-v2/register-ts-hook.mjs scripts/numeroloji-nkb-v2/validate-word-person-logic.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HELPERS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers");
const wp = await import(pathToFileURL(join(HELPERS, "wordPersonSections.ts")).href);

const {
  WORD_TAB_ORDER, WORD_TAB_LABELS,
  defaultWordPersonSections, atLeastOneWordPersonSection, normalizeWordPersonSections,
  wordFileName, safeFileNamePart, personSourceNotesForRecords,
} = wp;

let pass = 0, fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++; else fail++;
}

console.log("── NKB-V4 — 4 gerçek sekme (Görsel Rapor + İlişki/Ev-İş kaldırıldı) ──");
check("sekme sırası: summary,plain,detailed,tas", WORD_TAB_ORDER.join(",") === "summary,plain,detailed,tas");
check("Görsel Rapor TAMAMEN kaldırıldı", !("gorsel" in WORD_TAB_LABELS) && !WORD_TAB_ORDER.includes("gorsel"));
check("İlişki/Ev-İş yok", !("iliski" in WORD_TAB_LABELS) && !("evis" in WORD_TAB_LABELS));
check("etiketler ekranla birebir",
  WORD_TAB_LABELS.summary === "Sonuç Özeti" && WORD_TAB_LABELS.plain === "Analiz (Hesap Özetsiz)" &&
  WORD_TAB_LABELS.detailed === "Analiz (Hesap Özetli)" && WORD_TAB_LABELS.tas === "Taş Açıklamaları");
check("teknik/DB seçenekleri YOK", !("identity" in WORD_TAB_LABELS) && !("sourceNotes" in WORD_TAB_LABELS) && !("pin" in WORD_TAB_LABELS));

console.log("\n── seçim/normalize ──");
check("varsayılan tümü açık (4)", (() => { const d = defaultWordPersonSections(); return WORD_TAB_ORDER.every((k) => d[k]) && Object.keys(d).length === 4; })());
check("atLeastOne hiçbiri false", atLeastOneWordPersonSection({ summary: false, plain: false, detailed: false, tas: false }) === false);
check("atLeastOne yalnız tas true", atLeastOneWordPersonSection({ summary: false, plain: false, detailed: false, tas: true }) === true);
check("normalize undefined → tümü açık", (() => { const n = normalizeWordPersonSections(undefined); return WORD_TAB_ORDER.every((k) => n[k]); })());
check("normalize eski gorsel/iliski anahtarları yok sayılır", (() => { const n = normalizeWordPersonSections({ gorsel: true, iliski: true }); return WORD_TAB_ORDER.every((k) => n[k]) && !("gorsel" in n); })()); // hepsi false → fail-safe tümü açık
check("normalize {detailed:true} → yalnız detailed", (() => { const n = normalizeWordPersonSections({ detailed: true }); return n.detailed && !n.summary && !n.plain && !n.tas; })());

console.log("\n── dosya adı ──");
check("safeFileNamePart Türkçe→ASCII", safeFileNamePart("Ayşe ÇINAR") === "Ayse_CINAR");
check("tek sekme adı", wordFileName("Ali Veli", ["summary"]) === "Numeroloji_Ali_Veli_Sonuc_Ozeti.docx");
check("çok sekme adı", wordFileName("Ali Veli", ["summary", "plain"]) === "Numeroloji_Ali_Veli_Secili_Bolumler.docx");

console.log("\n── personSourceNotesForRecords ──");
const REC1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SRC1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function e(over) {
  return { id: "x", tenant_id: "t", knowledge_record_id: REC1, source_id: null, body: "b",
    display_order: 0, include_in_analysis: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over };
}
const groups = personSourceNotesForRecords(
  [{ id: REC1, analysisType: "ana-kulvar", value: "19" }],
  [e({ id: "n1", source_id: SRC1, display_order: 2, body: "ikinci" }), e({ id: "n2", source_id: SRC1, display_order: 1, body: "ilk" }), e({ id: "n3", include_in_analysis: false, body: "gizli" })],
  new Map([[SRC1, "Kaynak A"]]),
);
check("include=false hariç 2 not, sıralı, etiketli", groups.length === 1 && groups[0].notes.length === 2 && groups[0].notes[0].body === "ilk" && groups[0].notes[0].label === "Kaynak A" && groups[0].notes.every((n) => n.body !== "gizli"));

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
