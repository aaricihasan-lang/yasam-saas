/**
 * NKB-V2 — Kişi/analiz Word raporu (word-report) bölüm + kaynak notu mantığı harness'ı (DB/sunucu YOK).
 * wordPersonSections (bölüm seçimi + normalize) ve personSourceNotesForRecords (eşleşen kayıtlara
 * include_in_analysis=true not gruplama; etiket; deterministik sıra) saf fonksiyonlarını kanıtlar.
 *
 * Çalıştır: node --import ./scripts/numeroloji-nkb-v2/register-ts-hook.mjs scripts/numeroloji-nkb-v2/validate-word-person-logic.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HELPERS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers");
const wp = await import(pathToFileURL(join(HELPERS, "wordPersonSections.ts")).href);

const {
  WORD_PERSON_SECTION_ORDER,
  defaultWordPersonSections,
  atLeastOneWordPersonSection,
  normalizeWordPersonSections,
  personSourceNotesForRecords,
} = wp;

let pass = 0;
let fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++;
  else fail++;
}

console.log("── NKB-V2 — kişi Word bölüm seçimi ──");
check("5 bölüm sırası doğru", WORD_PERSON_SECTION_ORDER.join(",") === "identity,values,pin,summary,sourceNotes");
check("varsayılan: tümü açık", (() => { const d = defaultWordPersonSections(); return WORD_PERSON_SECTION_ORDER.every((k) => d[k] === true); })());
check("atLeastOne: hiçbiri → false", atLeastOneWordPersonSection({ identity: false, values: false, pin: false, summary: false, sourceNotes: false }) === false);
check("atLeastOne: yalnız sourceNotes → true (bağımsız içerik)", atLeastOneWordPersonSection({ identity: false, values: false, pin: false, summary: false, sourceNotes: true }) === true);
check("atLeastOne: yalnız identity → true", atLeastOneWordPersonSection({ identity: true, values: false, pin: false, summary: false, sourceNotes: false }) === true);
check("normalize: undefined → tümü açık (eski istemci)", (() => { const n = normalizeWordPersonSections(undefined); return WORD_PERSON_SECTION_ORDER.every((k) => n[k]); })());
check("normalize: {pin:true} → yalnız pin", (() => { const n = normalizeWordPersonSections({ pin: true }); return n.pin && !n.identity && !n.values && !n.summary && !n.sourceNotes; })());
check("normalize: hepsi false → fail-safe tümü açık", (() => { const n = normalizeWordPersonSections({ identity: false, values: false, pin: false, summary: false, sourceNotes: false }); return n.identity && n.summary; })());
check("normalize: bilinmeyen anahtar yok sayılır", (() => { const n = normalizeWordPersonSections({ summary: true, foo: true }); return n.summary && !n.identity; })());

console.log("\n── NKB-V2 — personSourceNotesForRecords ──");
const REC1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SRC1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function e(over) {
  return {
    id: "x", tenant_id: "t", knowledge_record_id: REC1, source_id: null, body: "b",
    display_order: 0, include_in_analysis: true,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...over,
  };
}
const matched = [
  { id: REC1, analysisType: "ana-kulvar", value: "19" },
  { id: REC2, analysisType: "hayat-yolu", value: "7" },
];
const entries = [
  e({ id: "n1", knowledge_record_id: REC1, source_id: SRC1, display_order: 2, body: "ikinci" }),
  e({ id: "n2", knowledge_record_id: REC1, source_id: SRC1, display_order: 1, body: "ilk" }),
  e({ id: "n3", knowledge_record_id: REC1, source_id: null, include_in_analysis: false, body: "gizli" }),
  e({ id: "n4", knowledge_record_id: REC2, source_id: null, include_in_analysis: true, body: "uzman" }),
];
const labels = new Map([[SRC1, "Kaynak A"]]);
const groups = personSourceNotesForRecords(matched, entries, labels);

check("iki eşleşen kayıt için grup üretildi", groups.length === 2);
check("REC1 grubunda include=false hariç 2 not", groups[0].notes.length === 2);
check("deterministik sıra: ilk, ikinci", groups[0].notes[0].body === "ilk" && groups[0].notes[1].body === "ikinci");
check("kaynak etiketi display_label (Kaynak A)", groups[0].notes[0].label === "Kaynak A");
check("REC2 uzman notu etiketi 'Uzmanın Kendi Notu'", groups[1].notes[0].label === "Uzmanın Kendi Notu");
check("include=false not GÖRÜNMEZ", groups[0].notes.every((n) => n.body !== "gizli"));
check("notu olmayan eşleşme atlanır", personSourceNotesForRecords([{ id: "zzz", analysisType: "element", value: "X" }], entries, labels).length === 0);
check("boş entries → boş sonuç (eski davranış korunur)", personSourceNotesForRecords(matched, [], labels).length === 0);

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
