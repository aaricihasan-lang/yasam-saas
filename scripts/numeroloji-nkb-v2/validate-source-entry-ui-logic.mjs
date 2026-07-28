/**
 * NKB-V2 — Kaynak notları UI mantığı + analiz iliştirme harness'ı (DB/sunucu YOK).
 * sourceEntryUiLogic (3-seçenek karar, etiket, sıralama, seçim eşlemesi) + knowledgeLookup
 * attachSourceEntriesToNotes (include_in_analysis filtresi, deterministik sıra, etiket, eski
 * davranış korunması) saf fonksiyonlarını kanıtlar.
 *
 * Çalıştır: npx tsx scripts/numeroloji-nkb-v2/validate-source-entry-ui-logic.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HELPERS = join(HERE, "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers");
const ui = await import(pathToFileURL(join(HELPERS, "sourceEntryUiLogic.ts")).href);
const kl = await import(pathToFileURL(join(HELPERS, "knowledgeLookup.ts")).href);

const {
  EXPERT_OWN_NOTE_LABEL,
  EXPERT_OWN_NOTE_VALUE,
  sourceEntryLabel,
  sortSourceEntries,
  existingNotesForSource,
  decideSecondNoteAction,
  sourceSelectionToApi,
  apiSourceToSelection,
  classifyEntryWrite,
} = ui;
const { attachSourceEntriesToNotes } = kl;

let pass = 0;
let fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++;
  else fail++;
}

const REC1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REC2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SRC1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function entry(over) {
  return {
    id: "id-x",
    tenant_id: "t",
    knowledge_record_id: REC1,
    source_id: null,
    body: "b",
    display_order: 0,
    include_in_analysis: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

console.log("── NKB-V2 — sourceEntryUiLogic ──");
check("EXPERT_OWN_NOTE sabitleri tutarlı", EXPERT_OWN_NOTE_LABEL === "Uzmanın Kendi Notu" && typeof EXPERT_OWN_NOTE_VALUE === "string");
check("sourceSelectionToApi: expert-own → null", sourceSelectionToApi(EXPERT_OWN_NOTE_VALUE) === null);
check("sourceSelectionToApi: '' → null", sourceSelectionToApi("") === null);
check("sourceSelectionToApi: uuid → uuid", sourceSelectionToApi(SRC1) === SRC1);
check("apiSourceToSelection: null → expert-own", apiSourceToSelection(null) === EXPERT_OWN_NOTE_VALUE);
check("apiSourceToSelection: uuid → uuid", apiSourceToSelection(SRC1) === SRC1);

const labelMap = new Map([[SRC1, "Kaynak A"]]);
check("etiket: null → Uzmanın Kendi Notu", sourceEntryLabel({ source_id: null }, labelMap) === EXPERT_OWN_NOTE_LABEL);
check("etiket: bilinen kaynak → display_label", sourceEntryLabel({ source_id: SRC1 }, labelMap) === "Kaynak A");
check("etiket: bilinmeyen kaynak → 'Bilinmeyen Kaynak'", sourceEntryLabel({ source_id: "zzz" }, labelMap) === "Bilinmeyen Kaynak");

const unsorted = [
  entry({ id: "b", display_order: 2, created_at: "2026-01-01T00:00:00Z" }),
  entry({ id: "a", display_order: 1, created_at: "2026-01-02T00:00:00Z" }),
  entry({ id: "c", display_order: 1, created_at: "2026-01-01T00:00:00Z" }),
];
const sorted = sortSourceEntries(unsorted);
check("sıralama: display_order → created_at → id deterministik", sorted[0].id === "c" && sorted[1].id === "a" && sorted[2].id === "b");

const rows2 = [
  entry({ id: "n1", knowledge_record_id: REC1, source_id: SRC1 }),
  entry({ id: "n2", knowledge_record_id: REC1, source_id: SRC1 }),
  entry({ id: "n3", knowledge_record_id: REC1, source_id: null }),
];
check("existingNotesForSource: aynı source filtreler", existingNotesForSource(rows2, REC1, SRC1).length === 2);
check("existingNotesForSource: null source ayrı", existingNotesForSource(rows2, REC1, null).length === 1);

check("karar: editingId varsa update", decideSecondNoteAction(rows2, REC1, SRC1, "n1").kind === "update");
check("karar: mevcut yoksa create", decideSecondNoteAction([], REC1, SRC1, null).kind === "create");
check("karar: 1 mevcut → prompt-single", decideSecondNoteAction([entry({ id: "x", source_id: SRC1 })], REC1, SRC1, null).kind === "prompt-single");
check("karar: >1 mevcut → prompt-multi (rastgele YOK)", decideSecondNoteAction(rows2, REC1, SRC1, null).kind === "prompt-multi");
check("karar prompt-multi: mevcut listesi 2", decideSecondNoteAction(rows2, REC1, SRC1, null).existing.length === 2);

check("classify: demo", classifyEntryWrite({ error: null, demo: true }) === "demo");
check("classify: error", classifyEntryWrite({ error: "x", demo: false }) === "error");
check("classify: success", classifyEntryWrite({ error: null, demo: false }) === "success");

console.log("\n── NKB-V2 — attachSourceEntriesToNotes (analiz iliştirme) ──");
const buckets = {
  anaKulvar: [{ id: REC1, analysisType: "ana-kulvar", value: "19", description: "d", content_sections: null }],
  yanKulvar: [],
  ifadeSayisi: [],
  hayatYolu: [{ id: REC2, analysisType: "hayat-yolu", value: "7", description: "d2", content_sections: null }],
  cakraOmurga: [],
  element: [],
};
const entries = [
  entry({ id: "e1", knowledge_record_id: REC1, source_id: SRC1, include_in_analysis: true, display_order: 2, body: "ikinci" }),
  entry({ id: "e2", knowledge_record_id: REC1, source_id: SRC1, include_in_analysis: true, display_order: 1, body: "ilk" }),
  entry({ id: "e3", knowledge_record_id: REC1, source_id: null, include_in_analysis: false, body: "gizli" }),
  entry({ id: "e4", knowledge_record_id: REC2, source_id: null, include_in_analysis: true, body: "uzman" }),
];
const attached = attachSourceEntriesToNotes(buckets, entries, labelMap);

check("REC1 notuna 2 kaynak-notu iliştirildi (include=false hariç)", attached.anaKulvar[0].sourceEntries?.length === 2);
check("iliştirme sırası display_order'a göre (ilk, ikinci)", attached.anaKulvar[0].sourceEntries[0].body === "ilk" && attached.anaKulvar[0].sourceEntries[1].body === "ikinci");
check("iliştirilen kaynak etiketi doğru (Kaynak A)", attached.anaKulvar[0].sourceEntries[0].sourceLabel === "Kaynak A");
check("REC2 uzman notu etiketi 'Uzmanın Kendi Notu'", attached.hayatYolu[0].sourceEntries?.[0]?.sourceLabel === EXPERT_OWN_NOTE_LABEL);
check("include_in_analysis=false not GÖRÜNMEZ (e3 yok)", (attached.anaKulvar[0].sourceEntries ?? []).every((s) => s.id !== "e3"));

const emptyAttach = attachSourceEntriesToNotes(buckets, [], labelMap);
check("kaynak notu yoksa note DEĞİŞMEZ (sourceEntries atanmaz)", emptyAttach.anaKulvar[0].sourceEntries === undefined);
check("ilgisiz bucket boş kalır", emptyAttach.yanKulvar.length === 0);

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
