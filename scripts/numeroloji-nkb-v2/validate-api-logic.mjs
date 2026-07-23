/**
 * NKB-V2-C — API mantığı doğrulama harness'ı.
 * Route'ların kullandığı SAF doğrulama/karar fonksiyonlarını test eder (DB/sunucu YOK).
 * Cross-tenant/DB davranışları route katmanında tenant filtresi + sahiplik ön-kontrolüyle
 * uygulanır; burada girdi doğrulama, section_key kuralı, create-only kararı ve güvenli
 * hata eşlemesi kanıtlanır.
 *
 * Çalıştır: node scripts/numeroloji-nkb-v2/validate-api-logic.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HELPERS = join(HERE, "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers");
const sv = await import(pathToFileURL(join(HELPERS, "sourcesValidation.ts")).href);
const ks = await import(pathToFileURL(join(HELPERS, "knowledgeSections.ts")).href);

const {
  validateContentSectionsForType,
  decideCreateConflict,
  validateSourceInput,
  validateRecordSourceInput,
  isUuid,
  safeDbError,
} = sv;
const { KULVAR_SECTION_TEMPLATE } = ks;

let pass = 0;
let fail = 0;
function check(name, cond) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (ok) pass++;
  else fail++;
}

const four = KULVAR_SECTION_TEMPLATE.map((t, i) => ({ key: t.key, label: t.label, body: `g${i}`, order: t.order }));
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

console.log("── NKB-V2-C — Knowledge content_sections ──");
check("Ana Kulvar geçerli dört bölüm kabul", validateContentSectionsForType("ana-kulvar", four).ok);
check("Yan Kulvar geçerli dört bölüm kabul", validateContentSectionsForType("yan-kulvar", four).ok);
check("Element content_sections (non-null) REDDEDİLİR (400)", (() => { const r = validateContentSectionsForType("element", four); return r.ok === false && r.status === 400; })());
check("Çakra content_sections (non-null) REDDEDİLİR", validateContentSectionsForType("cakra-omurga", four).ok === false);
check("Element content_sections=null NO-OP kabul", (() => { const r = validateContentSectionsForType("element", null); return r.ok && r.value === null; })());
check("content_sections gönderilmemiş (undefined) → değişiklik yok", (() => { const r = validateContentSectionsForType("ana-kulvar", undefined); return r.ok && r.value === undefined; })());
check("Duplicate key reddedilir (kulvar)", validateContentSectionsForType("ana-kulvar", [{ key: "overview", label: "A", body: "x", order: 1 }, { key: "overview", label: "B", body: "y", order: 2 }]).ok === false);
check("Duplicate order reddedilir (kulvar)", validateContentSectionsForType("ana-kulvar", [{ key: "overview", label: "A", body: "x", order: 1 }, { key: "constructive", label: "B", body: "y", order: 1 }]).ok === false);
check("Bilinmeyen key reddedilir", validateContentSectionsForType("ana-kulvar", [{ key: "xx", label: "A", body: "x", order: 1 }]).ok === false);
check("Bilinmeyen alan reddedilir", validateContentSectionsForType("ana-kulvar", [{ key: "overview", label: "A", body: "x", order: 1, z: 1 }]).ok === false);

console.log("\n── NKB-V2-C — Create-only kararı ──");
check("Kayıt yoksa create", decideCreateConflict(false, false) === "create");
check("Kayıt varsa + overwrite yok → conflict", decideCreateConflict(true, false) === "conflict");
check("Kayıt varsa + overwrite:true → overwrite", decideCreateConflict(true, true) === "overwrite");
check("Kayıt varsa + overwrite:'true'(string) → conflict (yalnız literal true)", decideCreateConflict(true, "true") === "conflict");

console.log("\n── NKB-V2-C — numerology_sources girdi ──");
check("create display_label zorunlu (eksik → 400)", (() => { const r = validateSourceInput({}, { partial: false }); return r.ok === false && r.status === 400; })());
check("boş display_label reddedilir", validateSourceInput({ display_label: "   " }, { partial: false }).ok === false);
check("kilitli display_label yazımı KORUNUR", (() => { const r = validateSourceInput({ display_label: "Elif YILMAZ&Sema ÇAYLAR" }, { partial: false }); return r.ok && r.value.display_label === "Elif YILMAZ&Sema ÇAYLAR"; })());
check("display_label uç boşluğu temizlenir (iç yazım aynı)", (() => { const r = validateSourceInput({ display_label: "  Elif YILMAZ&Sema ÇAYLAR  " }, { partial: false }); return r.ok && r.value.display_label === "Elif YILMAZ&Sema ÇAYLAR"; })());
check("bilinmeyen alan reddedilir", validateSourceInput({ display_label: "X", foo: 1 }, { partial: false }).ok === false);
check("publication_year geçersiz reddedilir", validateSourceInput({ display_label: "X", publication_year: 4000 }, { partial: false }).ok === false);
check("publication_year geçerli kabul", validateSourceInput({ display_label: "X", publication_year: 2024 }, { partial: false }).ok === true);
check("partial patch display_label istemez", validateSourceInput({ notes: "not" }, { partial: true }).ok === true);

console.log("\n── NKB-V2-C — numerology_record_sources girdi ──");
check("geçerli create (kulvar kayıt) kabul", validateRecordSourceInput({ knowledge_record_id: UUID_A, source_id: UUID_B, page_start: 10, page_end: 12 }, { partial: false, recordAnalysisType: "ana-kulvar" }).ok === true);
check("eksik uuid reddedilir", validateRecordSourceInput({ source_id: UUID_B }, { partial: false, recordAnalysisType: "ana-kulvar" }).ok === false);
check("geçersiz uuid reddedilir", validateRecordSourceInput({ knowledge_record_id: "abc", source_id: UUID_B }, { partial: false, recordAnalysisType: "ana-kulvar" }).ok === false);
check("page_start > page_end reddedilir", validateRecordSourceInput({ knowledge_record_id: UUID_A, source_id: UUID_B, page_start: 20, page_end: 5 }, { partial: false, recordAnalysisType: "ana-kulvar" }).ok === false);
check("display_order tamsayı değilse reddedilir", validateRecordSourceInput({ knowledge_record_id: UUID_A, source_id: UUID_B, display_order: 1.5 }, { partial: false, recordAnalysisType: "ana-kulvar" }).ok === false);
check("is_primary boolean değilse reddedilir", validateRecordSourceInput({ knowledge_record_id: UUID_A, source_id: UUID_B, is_primary: "yes" }, { partial: false, recordAnalysisType: "ana-kulvar" }).ok === false);
check("section_key geçerli + kulvar kayıt kabul", validateRecordSourceInput({ knowledge_record_id: UUID_A, source_id: UUID_B, section_key: "overview" }, { partial: false, recordAnalysisType: "yan-kulvar" }).ok === true);
check("section_key + NON-kulvar kayıt REDDEDİLİR", validateRecordSourceInput({ knowledge_record_id: UUID_A, source_id: UUID_B, section_key: "overview" }, { partial: false, recordAnalysisType: "element" }).ok === false);
check("geçersiz section_key reddedilir", validateRecordSourceInput({ knowledge_record_id: UUID_A, source_id: UUID_B, section_key: "sonuc" }, { partial: false, recordAnalysisType: "ana-kulvar" }).ok === false);
check("section_key=null (belge düzeyi) kabul", validateRecordSourceInput({ knowledge_record_id: UUID_A, source_id: UUID_B, section_key: null }, { partial: false, recordAnalysisType: "diger" }).ok === true);
check("bilinmeyen alan reddedilir", validateRecordSourceInput({ knowledge_record_id: UUID_A, source_id: UUID_B, foo: 1 }, { partial: false, recordAnalysisType: "ana-kulvar" }).ok === false);
check("patch kimliği değiştirmeye çalışırsa reddedilir", validateRecordSourceInput({ knowledge_record_id: UUID_A }, { partial: true, recordAnalysisType: "ana-kulvar" }).ok === false);

console.log("\n── NKB-V2-C — UUID + güvenli hata eşlemesi ──");
check("isUuid geçerli", isUuid(UUID_A) === true);
check("isUuid geçersiz", isUuid("not-a-uuid") === false);
check("safeDbError 23505 → 409", (() => { const e = safeDbError({ code: "23505", message: "duplicate key value violates unique constraint \"xyz\"" }); return e.status === 409 && !/constraint|xyz|duplicate key value/i.test(e.message); })());
check("safeDbError 23503 → 409", safeDbError({ code: "23503" }).status === 409);
check("safeDbError diğer → 500 (ham mesaj sızmaz)", (() => { const e = safeDbError({ code: "42P01", message: "relation \"secret\" does not exist" }); return e.status === 500 && !/relation|secret/i.test(e.message); })());

console.log(`\nToplam: ${pass} PASS / ${fail} FAIL (${pass + fail} kontrol)`);
if (fail > 0) process.exit(1);
