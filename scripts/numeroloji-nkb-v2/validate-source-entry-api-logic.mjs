/**
 * NKB-V2 — Kaynak notları API mantığı harness'ı (DB/sunucu YOK).
 * validateSourceEntryInput (server girdi sözleşmesi) + wordSectionLogic (Word bölüm seçimi)
 * saf fonksiyonlarını kanıtlar. Tenant izolasyonu/sahiplik route katmanındadır (burada YOK).
 *
 * Çalıştır: node --import ./scripts/numeroloji-nkb-v2/register-ts-hook.mjs scripts/numeroloji-nkb-v2/validate-source-entry-api-logic.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HELPERS = join(HERE, "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers");
const sv = await import(pathToFileURL(join(HELPERS, "sourcesValidation.ts")).href);
const ws = await import(pathToFileURL(join(HELPERS, "wordSectionLogic.ts")).href);

const { validateSourceEntryInput } = sv;
const {
  defaultWordSections,
  atLeastOneWordSection,
  sourceNotesEffective,
  normalizeWordSections,
} = ws;

let pass = 0;
let fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++;
  else fail++;
}

const REC = "11111111-1111-4111-8111-111111111111";
const SRC = "22222222-2222-4222-8222-222222222222";

console.log("── NKB-V2 — validateSourceEntryInput (create) ──");
check("geçerli create (kaynaklı) kabul", validateSourceEntryInput({ knowledge_record_id: REC, source_id: SRC, body: "not" }, { partial: false }).ok === true);
check("source_id NULL kabul (Uzmanın Kendi Notu)", (() => { const r = validateSourceEntryInput({ knowledge_record_id: REC, source_id: null, body: "not" }, { partial: false }); return r.ok && r.value.source_id === null; })());
check("source_id verilmemiş (undefined) kabul", (() => { const r = validateSourceEntryInput({ knowledge_record_id: REC, body: "not" }, { partial: false }); return r.ok && r.value.source_id === undefined; })());
check("knowledge_record_id eksik → 400", (() => { const r = validateSourceEntryInput({ body: "not" }, { partial: false }); return r.ok === false && r.status === 400; })());
check("knowledge_record_id geçersiz uuid → 400", validateSourceEntryInput({ knowledge_record_id: "abc", body: "not" }, { partial: false }).ok === false);
check("body eksik (create) → 400", validateSourceEntryInput({ knowledge_record_id: REC }, { partial: false }).ok === false);
check("body boşluk-only reddedilir", validateSourceEntryInput({ knowledge_record_id: REC, body: "   " }, { partial: false }).ok === false);
check("body uç boşluğu temizlenir", (() => { const r = validateSourceEntryInput({ knowledge_record_id: REC, body: "  merhaba  " }, { partial: false }); return r.ok && r.value.body === "merhaba"; })());
check("source_id geçersiz uuid → 400", validateSourceEntryInput({ knowledge_record_id: REC, source_id: "xx", body: "n" }, { partial: false }).ok === false);
check("bilinmeyen alan reddedilir", validateSourceEntryInput({ knowledge_record_id: REC, body: "n", foo: 1 }, { partial: false }).ok === false);
check("display_order negatif reddedilir", validateSourceEntryInput({ knowledge_record_id: REC, body: "n", display_order: -1 }, { partial: false }).ok === false);
check("display_order geçerli kabul", validateSourceEntryInput({ knowledge_record_id: REC, body: "n", display_order: 3 }, { partial: false }).ok === true);
check("display_order tamsayı değilse reddedilir", validateSourceEntryInput({ knowledge_record_id: REC, body: "n", display_order: 1.5 }, { partial: false }).ok === false);
check("include_in_analysis boolean değilse reddedilir", validateSourceEntryInput({ knowledge_record_id: REC, body: "n", include_in_analysis: "yes" }, { partial: false }).ok === false);
check("include_in_analysis=true kabul", (() => { const r = validateSourceEntryInput({ knowledge_record_id: REC, body: "n", include_in_analysis: true }, { partial: false }); return r.ok && r.value.include_in_analysis === true; })());

console.log("\n── NKB-V2 — validateSourceEntryInput (patch) ──");
check("patch knowledge_record_id değiştirme reddedilir", validateSourceEntryInput({ knowledge_record_id: REC }, { partial: true }).ok === false);
check("patch body-only kabul", validateSourceEntryInput({ body: "yeni" }, { partial: true }).ok === true);
check("patch boş body reddedilir", validateSourceEntryInput({ body: "  " }, { partial: true }).ok === false);
check("patch source_id → null kabul", (() => { const r = validateSourceEntryInput({ source_id: null }, { partial: true }); return r.ok && r.value.source_id === null; })());
check("patch source_id → uuid kabul", (() => { const r = validateSourceEntryInput({ source_id: SRC }, { partial: true }); return r.ok && r.value.source_id === SRC; })());
check("patch include_in_analysis toggle kabul", validateSourceEntryInput({ include_in_analysis: false }, { partial: true }).ok === true);

console.log("\n── NKB-V2 — Word bölüm seçimi (wordSectionLogic) ──");
check("varsayılan: tüm bölümler açık", (() => { const d = defaultWordSections(); return d.descriptions && d.stones && d.bibliography && d.sourceNotes; })());
check("atLeastOne: hiçbiri → false", atLeastOneWordSection({ descriptions: false, stones: false, bibliography: false, sourceNotes: false }) === false);
check("atLeastOne: sadece sourceNotes → false (tek başına sayılmaz)", atLeastOneWordSection({ descriptions: false, stones: false, bibliography: false, sourceNotes: true }) === false);
check("atLeastOne: stones → true", atLeastOneWordSection({ descriptions: false, stones: true, bibliography: false, sourceNotes: false }) === true);
check("sourceNotesEffective: descriptions+sourceNotes → true", sourceNotesEffective({ descriptions: true, stones: false, bibliography: false, sourceNotes: true }) === true);
check("sourceNotesEffective: descriptions kapalı → false", sourceNotesEffective({ descriptions: false, stones: false, bibliography: false, sourceNotes: true }) === false);
check("normalize: undefined → tüm açık (eski istemci)", (() => { const n = normalizeWordSections(undefined); return n.descriptions && n.stones && n.bibliography && n.sourceNotes; })());
check("normalize: {stones:true} → yalnız stones", (() => { const n = normalizeWordSections({ stones: true }); return !n.descriptions && n.stones && !n.bibliography && !n.sourceNotes; })());
check("normalize: hepsi false → fail-safe tüm açık", (() => { const n = normalizeWordSections({ descriptions: false, stones: false, bibliography: false, sourceNotes: false }); return n.descriptions && n.stones; })());
check("normalize: bilinmeyen anahtar yok sayılır", (() => { const n = normalizeWordSections({ descriptions: true, foo: true }); return n.descriptions && !n.stones; })());

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
