/**
 * HD-2D1 statik migration harness — Kaynak / Pasaj / Özgün Metin + Hak katmanı
 * ===========================================================================
 *
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ, dependency'siz. Gerçek migration dosyasını
 * dinamik keşfeder (/_hd_source_foundation\.sql$/), SQL'i parse eder ve kolon /
 * CHECK / FK / index / RLS / grant / allowlist / katman-ayrımı invariant'larını
 * exact-set karşılaştırmalarıyla doğrular. Yalnız kelime araması ile sahte PASS
 * üretmez. Herhangi bir FAIL → exit 1.
 *
 * Çalıştır (repo kökünden): node scripts/hd2d1-source-foundation-migration-check.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}
const eqSet = (a, b) => {
  const A = new Set(a), B = new Set(b);
  return A.size === B.size && [...A].every((x) => B.has(x));
};

// ── Migration dosyasını dinamik bul (tek HD-2D1 dosyası) ──────────────────────
const MIG_DIR = `${ROOT}/supabase/migrations`;
const all = readdirSync(MIG_DIR);
const hdFiles = all.filter((f) => /_hd_source_foundation\.sql$/.test(f));
check(`A1. Tam bir HD-2D1 migration dosyası bulundu (${hdFiles.length})`, hdFiles.length === 1);
const MIG_NAME = hdFiles[0] ?? "";
const MIG = MIG_NAME ? readFileSync(`${MIG_DIR}/${MIG_NAME}`, "utf8") : "";

const allTs = all.map((f) => f.match(/^(\d{14})_/)?.[1]).filter(Boolean);
const hdTs = MIG_NAME.match(/^(\d{14})_/)?.[1] ?? "";
check(`A2. Timestamp 14 haneli + tekil (collision yok): ${hdTs}`,
  /^\d{14}$/.test(hdTs) && allTs.filter((t) => t === hdTs).length === 1);
check("A3. Timestamp mevcut maksimumdan büyük",
  hdTs !== "" && allTs.every((t) => t === hdTs || t < hdTs));

// BODY = yorumsuz; SCHEMA = string literal'ler de boşaltılmış (prose kolon adına takılmasın).
const BODY = MIG.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
const SCHEMA = BODY.replace(/'(?:[^']|'')*'/g, "''");

// Tablo bloğu ayıklayıcı (CREATE TABLE ... );  ilk kapanış ");" e kadar).
function tableBlock(name) {
  const s = BODY.indexOf(`CREATE TABLE public.${name} (`);
  if (s < 0) return "";
  const e = BODY.indexOf("\n);", s);
  return BODY.slice(s, e < 0 ? BODY.length : e + 3);
}
// CHECK IN-list ayıklayıcı (anchor'dan sonraki ilk IN (...)).
function inList(anchor, blk) {
  const s = blk.indexOf(anchor);
  if (s < 0) return [];
  const m = blk.slice(s).match(/IN \(([\s\S]*?)\)/);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
}
// Gerçek GRANT ifadeleri (\bGRANT\b — 'permission_granted' gibi kelimeleri hariç tutar).
const grantStmts = BODY.match(/\bGRANT\b[^;]*;/gi) ?? [];
const anyGrantHasDelete = grantStmts.some((g) => /\bDELETE\b/i.test(g));
const anyGrantAll = grantStmts.some((g) => /\bGRANT\s+ALL\b/i.test(g));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP A — Dosya ve kapsam
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP A: Dosya ve kapsam ──");
const created = [...BODY.matchAll(/CREATE TABLE\s+public\.(\w+)/g)].map((m) => m[1]);
const EXPECTED = ["hd_sources", "hd_source_passages", "hd_original_texts"];
check("A4. Tam üç beklenen tablo oluşturuluyor (fazla/eksik yok)",
  eqSet(created, EXPECTED) && created.length === 3);
check("A5. Seed INSERT yok", !/\bINSERT\s+INTO\b/i.test(BODY));
check("A6. IF NOT EXISTS yok", !/IF\s+NOT\s+EXISTS/i.test(BODY));
check("A7. ON CONFLICT yok", !/ON\s+CONFLICT/i.test(BODY));
check("A8. DO/EXCEPTION yok", !/\bDO\s+\$\$/i.test(BODY) && !/EXCEPTION\s+WHEN/i.test(BODY));
check("A9. Destructive DOWN yok (DROP TABLE/SCHEMA yok)",
  !/DROP\s+TABLE/i.test(BODY) && !/DROP\s+SCHEMA/i.test(BODY));
check("A10. ENUM (CREATE TYPE) yok", !/CREATE\s+TYPE/i.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP B — hd_sources şeması
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP B: hd_sources şeması ──");
const SRC = tableBlock("hd_sources");
const SRC_COLS = [
  "id", "source_type", "title", "authors", "organization", "publisher", "publication_year",
  "edition", "volume", "issue", "doi", "pmid", "isbn", "source_url", "document_number",
  "accessed_on", "default_language_tag", "default_script_code", "tradition_key", "school_key",
  "rights_status", "rights_holder", "permission_basis", "permission_reference", "license_code",
  "license_url", "permission_received_at", "permission_expires_at", "quotation_limit", "rights_notes",
  "internal_use_allowed", "expert_delivery_allowed", "private_report_use_allowed",
  "public_display_allowed", "commercial_use_allowed", "status", "revision", "supersedes_source_id",
  "notes", "created_at", "updated_at",
];
check("B1. Bütün beklenen kolonlar mevcut", SRC_COLS.every((c) => new RegExp(`\\b${c}\\b`).test(SRC)));
check("B2. source_type allowlist birebir (15)",
  eqSet(inList("source_type IN", SRC),
    ["book", "journal_article", "regulatory_document", "monograph", "standard", "database_record",
     "website", "video", "audio", "teaching_note", "permissioned_document", "archive_document",
     "classical_text", "oral_source", "other"]));
check("B3. rights_status allowlist birebir (6)",
  eqSet(inList("rights_status IN", SRC),
    ["public_domain", "licensed", "permission_granted", "restricted", "pending_review", "unknown"]));
check("B4. permission_basis allowlist birebir (8)",
  eqSet(inList("permission_basis IS NULL OR permission_basis IN", SRC),
    ["public_domain", "license", "written_permission", "terms_of_use", "statutory_exception",
     "internal_agreement", "unknown", "other"]));
check("B5. status allowlist draft/verified/archived", eqSet(inList("hd_sources_status_chk", SRC), ["draft", "verified", "archived"]));
check("B6. title not-blank CHECK", /btrim\(title\) <> ''/.test(SRC));
check("B7. authors null-element CHECK", /cardinality\(authors\) = cardinality\(array_remove\(authors, NULL\)\)/.test(SRC));
check("B8. publication_year 1400-2100", /publication_year BETWEEN 1400 AND 2100/.test(SRC));
check("B9. default_language_tag lowercase BCP-47-lite", /default_language_tag ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/.test(SRC));
check("B10. default_script_code ISO-15924", /default_script_code ~ '\^\[A-Z\]\[a-z\]\{3\}\$'/.test(SRC));
check("B11. rights_status DEFAULT YOK",
  /rights_status\s+text\s+NOT NULL,/.test(SRC) && !/rights_status\s+text\s+NOT NULL DEFAULT/.test(SRC));
check("B12. 5 kullanım izni NOT NULL DEFAULT false",
  ["internal_use_allowed", "expert_delivery_allowed", "private_report_use_allowed", "public_display_allowed", "commercial_use_allowed"]
    .every((c) => new RegExp(`${c}\\s+boolean\\s+NOT NULL DEFAULT false`).test(SRC)));
check("B13. revision > 0", /hd_sources_revision_chk CHECK \(revision > 0\)/.test(SRC));
check("B14. revision/supersedes coupling",
  /\(revision = 1 AND supersedes_source_id IS NULL\)\s*OR \(revision > 1 AND supersedes_source_id IS NOT NULL\)/.test(SRC));
check("B15. supersedes not-self CHECK", /supersedes_source_id IS NULL OR supersedes_source_id <> id/.test(SRC));
check("B16. permission tarih coupling (expires>=received)", /permission_expires_at >= permission_received_at/.test(SRC));
check("B17. self-FK RESTRICT", /FOREIGN KEY \(supersedes_source_id\) REFERENCES public\.hd_sources \(id\) ON DELETE RESTRICT/.test(SRC));
check("B18. successor partial UNIQUE",
  /CREATE UNIQUE INDEX hd_sources_one_successor_uidx[\s\S]*?WHERE supersedes_source_id IS NOT NULL/.test(BODY));
check("B19. beklenen index'ler (status/type/year/supersedes/lower(title))",
  ["status", "source_type", "publication_year", "supersedes"].every((i) =>
    new RegExp(`CREATE INDEX hd_sources_${i}_idx`).test(BODY)) &&
  /CREATE INDEX hd_sources_title_lower_idx ON public\.hd_sources \(lower\(title\)\)/.test(BODY));
check("B20. updated_at trigger (set_updated_at reuse)",
  /CREATE TRIGGER trg_hd_sources_updated_at[\s\S]*?EXECUTE FUNCTION public\.set_updated_at\(\)/.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP C — hd_source_passages şeması
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP C: hd_source_passages şeması ──");
const PAS = tableBlock("hd_source_passages");
check("C1. original_text kolonu YOK", !/\boriginal_text\b/.test(PAS));
check("C2. content_hash kolonu YOK", !/\bcontent_hash\b/.test(PAS));
check("C3. locator_kind allowlist birebir (12)",
  eqSet(inList("locator_kind IN", PAS),
    ["page", "page_range", "chapter", "section", "paragraph", "volume",
     "document_page", "url_fragment", "timecode", "track", "record_id", "other"]));
check("C4. passage_kind allowlist (excerpt/full_text/reference_only)",
  eqSet(inList("passage_kind IN", PAS), ["excerpt", "full_text", "reference_only"]));
check("C5. status allowlist draft/verified/archived", eqSet(inList("status IN", PAS), ["draft", "verified", "archived"]));
check("C6. locator_label + locator_value not-blank",
  /btrim\(locator_label\) <> ''/.test(PAS) && /btrim\(locator_value\) <> ''/.test(PAS));
check("C7. locator_metadata object CHECK", /jsonb_typeof\(locator_metadata\) = 'object'/.test(PAS));
check("C8. sort_order >= 0", /sort_order >= 0/.test(PAS));
check("C9. source FK RESTRICT", /FOREIGN KEY \(source_id\) REFERENCES public\.hd_sources \(id\) ON DELETE RESTRICT/.test(PAS));
check("C10. supersedes FK RESTRICT", /FOREIGN KEY \(supersedes_passage_id\) REFERENCES public\.hd_source_passages \(id\) ON DELETE RESTRICT/.test(PAS));
check("C11. revision/supersedes coupling",
  /\(revision = 1 AND supersedes_passage_id IS NULL\)\s*OR \(revision > 1 AND supersedes_passage_id IS NOT NULL\)/.test(PAS));
check("C12. rights override alanları nullable (DEFAULT/NOT NULL yok)",
  /rights_status_override\s+text,/.test(PAS) &&
  ["internal_use_allowed_override", "expert_delivery_allowed_override", "private_report_use_allowed_override",
   "public_display_allowed_override", "commercial_use_allowed_override"]
    .every((c) => new RegExp(`${c}\\s+boolean,`).test(PAS) && !new RegExp(`${c}\\s+boolean\\s+NOT NULL`).test(PAS)));
check("C13. rights_status_override doluysa 6-value",
  eqSet(inList("rights_status_override IS NULL OR rights_status_override IN", PAS),
    ["public_domain", "licensed", "permission_granted", "restricted", "pending_review", "unknown"]));
check("C14. successor partial UNIQUE",
  /CREATE UNIQUE INDEX hd_source_passages_one_successor_uidx[\s\S]*?WHERE supersedes_passage_id IS NOT NULL/.test(BODY));
check("C15. beklenen index'ler (source/status/kind/locator/source_sort/supersedes)",
  ["source", "status", "passage_kind", "locator_kind", "source_sort", "supersedes"].every((i) =>
    new RegExp(`CREATE INDEX hd_source_passages_${i}_idx`).test(BODY)));
check("C16. updated_at trigger", /CREATE TRIGGER trg_hd_source_passages_updated_at[\s\S]*?public\.set_updated_at\(\)/.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP D — hd_original_texts şeması
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP D: hd_original_texts şeması ──");
const OT = tableBlock("hd_original_texts");
const OT_COLS = ["id", "passage_id", "language_tag", "script_code", "original_text", "content_hash",
  "capture_method", "status", "revision", "supersedes_original_text_id", "created_at", "updated_at"];
check("D1. Bütün beklenen kolonlar mevcut", OT_COLS.every((c) => new RegExp(`\\b${c}\\b`).test(OT)));
check("D2. original_text + content_hash BU tabloda", /\boriginal_text\b/.test(OT) && /\bcontent_hash\b/.test(OT));
check("D3. passage FK RESTRICT", /FOREIGN KEY \(passage_id\) REFERENCES public\.hd_source_passages \(id\) ON DELETE RESTRICT/.test(OT));
check("D4. content_hash 64 lowercase hex CHECK", /content_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(OT));
check("D5. pgcrypto/hash generation YOK (schema)",
  !/pgcrypto|digest\(|encode\(|GENERATED ALWAYS AS[^)]*hash/i.test(SCHEMA));
check("D6. capture_method allowlist birebir (5)",
  eqSet(inList("capture_method IN", OT),
    ["manual_transcription", "ocr", "official_digital", "direct_import", "other"]));
check("D7. status allowlist draft/verified/archived", eqSet(inList("status IN", OT), ["draft", "verified", "archived"]));
check("D8. language_tag lowercase BCP-47-lite", /language_tag ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/.test(OT));
check("D9. script_code ISO-15924 ayrı kolon", /script_code ~ '\^\[A-Z\]\[a-z\]\{3\}\$'/.test(OT) && /\bscript_code\b\s+text\s+NOT NULL/.test(OT));
check("D10. revision > 0 + coupling",
  /revision > 0/.test(OT) &&
  /\(revision = 1 AND supersedes_original_text_id IS NULL\)\s*OR \(revision > 1 AND supersedes_original_text_id IS NOT NULL\)/.test(OT));
check("D11. self-FK RESTRICT", /FOREIGN KEY \(supersedes_original_text_id\) REFERENCES public\.hd_original_texts \(id\) ON DELETE RESTRICT/.test(OT));
check("D12. composite future-translation pin UNIQUE(id, content_hash, language_tag, script_code)",
  /UNIQUE \(id, content_hash, language_tag, script_code\)/.test(OT));
check("D13. duplicate-text prevention UNIQUE(passage_id, content_hash, language_tag, script_code)",
  /UNIQUE \(passage_id, content_hash, language_tag, script_code\)/.test(OT));
check("D14. revision UNIQUE(passage_id, language_tag, script_code, revision)",
  /UNIQUE \(passage_id, language_tag, script_code, revision\)/.test(OT));
check("D15. one-current-verified partial UNIQUE (WHERE status='verified')",
  /CREATE UNIQUE INDEX hd_original_texts_one_verified_current_uidx[\s\S]*?WHERE status = 'verified'/.test(BODY));
check("D16. one-successor partial UNIQUE",
  /CREATE UNIQUE INDEX hd_original_texts_one_successor_uidx[\s\S]*?WHERE supersedes_original_text_id IS NOT NULL/.test(BODY));
check("D17. beklenen index'ler", ["passage", "status", "language_tag", "script_code", "content_hash", "supersedes"].every((i) =>
  new RegExp(`CREATE INDEX hd_original_texts_${i}_idx`).test(BODY)));
check("D18. updated_at trigger", /CREATE TRIGGER trg_hd_original_texts_updated_at[\s\S]*?public\.set_updated_at\(\)/.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP E — Fiziksel katman ayrımı (string-strip şema)
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP E: Fiziksel katman ayrımı ──");
const PAS_S = SCHEMA.slice(SCHEMA.indexOf("CREATE TABLE public.hd_source_passages"), SCHEMA.indexOf("CREATE TABLE public.hd_original_texts"));
check("E1. passage tablosunda original_text yok (schema)", !/\boriginal_text\b/.test(PAS_S));
check("E2. passage tablosunda content_hash yok (schema)", !/\bcontent_hash\b/.test(PAS_S));
check("E3. original text ayrı tabloda", /CREATE TABLE public\.hd_original_texts/.test(BODY) && /\boriginal_text\b/.test(OT));
check("E4. translation/editorial/audit tablosu YOK",
  !/CREATE TABLE public\.hd_(faithful_translations|editorial_contents|editorial_explanations|editorial_interpretations|editorial_content_sources|content_audit_events)/.test(BODY));
check("E5. sourceRefs JSONB / report_text / strategy_text / line YOK",
  !/source_refs|sourcerefs|report_text|strategy_text|\bline_number\b/i.test(SCHEMA) && !/\bline\b/i.test(SCHEMA));
check("E6. canonical_entity_id / content_slot YOK", !/canonical_entity_id|content_slot/i.test(SCHEMA));
check("E7. tenant_id / user_id / expert_id / entitlement / overlay YOK",
  !/\btenant_id\b|\buser_id\b|\bexpert_id\b|entitlement_id|overlay_id/i.test(SCHEMA));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP F — Dil ve script
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP F: Dil ve script ──");
check("F1. language_tag lowercase regex (original + source default)",
  /language_tag ~ '\^\[a-z0-9\]/.test(OT) && /default_language_tag ~ '\^\[a-z0-9\]/.test(SRC));
check("F2. script_code ISO-15924 regex (original + source default)",
  /script_code ~ '\^\[A-Z\]\[a-z\]\{3\}\$'/.test(OT) && /default_script_code ~ '\^\[A-Z\]\[a-z\]\{3\}\$'/.test(SRC));
check("F3. original text language/script ZORUNLU (NOT NULL)",
  /language_tag\s+text\s+NOT NULL/.test(OT) && /script_code\s+text\s+NOT NULL/.test(OT));
check("F4. dil ve script AYRI kolon (tek kolonda birleşik değil)",
  /\blanguage_tag\b/.test(OT) && /\bscript_code\b/.test(OT) && !/language_script|lang_script/.test(SCHEMA));
check("F5. BCP-47 normalizasyonu app/service sorumluluğu (COMMENT)", /BCP-47/i.test(MIG) && /app|service/i.test(MIG));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP G — Hash
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP G: Hash ──");
check("G1. SHA-256 format CHECK (^[0-9a-f]{64}$)", /content_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(OT));
check("G2. hash service-produced + exact UTF-8 byte sözleşmesi COMMENT",
  /SHA-256/i.test(MIG) && /UTF-8 byte/i.test(MIG) && /server/i.test(MIG));
check("G3. generated hash / pgcrypto / hash trigger YOK (schema)",
  !/GENERATED ALWAYS AS[^)]*content_hash|pgcrypto|digest\(/i.test(SCHEMA) && !/TRIGGER[^;]*hash/i.test(SCHEMA));
check("G4. content_hash yalnız hd_original_texts'te (passage'da yok)", /\bcontent_hash\b/.test(OT) && !/\bcontent_hash\b/.test(PAS_S));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP H — Rights
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP H: Rights ──");
check("H1. source rights_status ZORUNLU (NOT NULL) + DEFAULT YOK",
  /rights_status\s+text\s+NOT NULL,/.test(SRC) && !/rights_status\s+text\s+NOT NULL DEFAULT/.test(SRC));
check("H2. 5 source usage flag NOT NULL DEFAULT false",
  ["internal_use_allowed", "expert_delivery_allowed", "private_report_use_allowed", "public_display_allowed", "commercial_use_allowed"]
    .every((c) => new RegExp(`${c}\\s+boolean\\s+NOT NULL DEFAULT false`).test(SRC)));
check("H3. passage override'ları nullable", /rights_status_override\s+text,/.test(PAS) && /public_display_allowed_override\s+boolean,/.test(PAS));
check("H4. source ve passage rights fiziksel ayrı (override yalnız passage'da)",
  /rights_status_override/.test(PAS) && !/rights_status_override/.test(SRC));
check("H5. public_display ile report/expert izinleri AYRI kolon",
  /public_display_allowed\b/.test(SRC) && /expert_delivery_allowed\b/.test(SRC) && /private_report_use_allowed\b/.test(SRC));
check("H6. default-deny COMMENT + DELETE grant yok", /default-deny/i.test(MIG) && !anyGrantHasDelete);

// ═════════════════════════════════════════════════════════════════════════════
// GRUP I — Revision ve supersedes
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP I: Revision ve supersedes ──");
check("I1. Üç tabloda revision integer DEFAULT 1 + CHECK>0",
  [SRC, PAS, OT].every((b) => /revision\s+integer\s+NOT NULL DEFAULT 1/.test(b) && /revision > 0/.test(b)));
check("I2. Üç tabloda self supersedes FK RESTRICT + not-self CHECK",
  /supersedes_source_id.*RESTRICT/s.test(SRC) && /supersedes_passage_id.*RESTRICT/s.test(PAS) && /supersedes_original_text_id.*RESTRICT/s.test(OT));
check("I3. Üç tabloda successor partial UNIQUE",
  ["hd_sources", "hd_source_passages", "hd_original_texts"].every((t) =>
    new RegExp(`CREATE UNIQUE INDEX ${t}_one_successor_uidx`).test(BODY)));
check("I4. Otomatik revision trigger / mutation trigger YOK",
  !/TRIGGER[^;]*(revision|mutation|immutab)/i.test(BODY) &&
  (BODY.match(/CREATE TRIGGER/g) ?? []).length === 3);
check("I5. verified immutability HD-2D4'e bırakıldı (COMMENT)", /HD-2D4/i.test(MIG) && /immutab/i.test(MIG));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP J — RLS ve grant
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP J: RLS ve grant ──");
for (const t of EXPECTED) {
  check(`J.${t}: ENABLE ROW LEVEL SECURITY`, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(BODY));
  check(`J.${t}: PUBLIC/anon/authenticated REVOKE ALL`,
    new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM PUBLIC`).test(BODY) &&
    new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM anon`).test(BODY) &&
    new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM authenticated`).test(BODY));
  check(`J.${t}: service_role yalnız SELECT/INSERT/UPDATE`,
    new RegExp(`GRANT SELECT, INSERT, UPDATE ON TABLE public\\.${t} TO service_role`).test(BODY));
}
check("J-glob1. FORCE ROW LEVEL SECURITY YOK", !/FORCE ROW LEVEL SECURITY/i.test(BODY));
check("J-glob2. CREATE POLICY YOK (policy 0)", !/CREATE POLICY/i.test(BODY));
check("J-glob3. DELETE grant YOK", !anyGrantHasDelete);
check("J-glob4. GRANT ALL YOK", !anyGrantAll);
check("J-glob5. anon/authenticated'a hiç GRANT yok", !/GRANT[^;]*TO\s+anon/i.test(BODY) && !/GRANT[^;]*TO\s+authenticated/i.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP K — Atomiklik
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP K: Atomiklik ──");
check("K1. Tek BEGIN; ve tek COMMIT;",
  (MIG.match(/^BEGIN;/gm) ?? []).length === 1 && (MIG.match(/^COMMIT;/gm) ?? []).length === 1);
check("K2. BEGIN COMMIT'ten önce", MIG.indexOf("BEGIN;") < MIG.indexOf("COMMIT;"));
check("K3. COMMIT sonrası SQL statement yok (yalnız yorum)",
  MIG.slice(MIG.indexOf("\nCOMMIT;") + 8).split("\n").filter((l) => l.trim() && !l.trim().startsWith("--")).length === 0);
check("K4. Fail-fast (ON CONFLICT/DO EXCEPTION/IF NOT EXISTS yok)",
  !/ON CONFLICT/i.test(BODY) && !/EXCEPTION WHEN/i.test(BODY) && !/IF NOT EXISTS/i.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP L — Mevcut yapıların korunması
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP L: Mevcut yapıların korunması ──");
check("L1. HD-2C tablolarına yazma YOK", !/(ALTER|DROP|INSERT INTO|UPDATE|DELETE FROM|GRANT|REVOKE)[^;]*hd_canonical_/i.test(BODY));
check("L2. Legacy/mevcut HD tablolarına yazma YOK", !/human_design_/.test(BODY));
check("L3. storage/users/tenants + YEBS/Aromaterapi/Numeroloji yazma YOK",
  !/storage\.(objects|buckets)|(ALTER|INSERT|UPDATE|DELETE|GRANT|REVOKE)[^;]*(public\.users|public\.tenants|yebs_|aromatherapy_|numerology_)/i.test(BODY));
check("L4. set_updated_at yeniden TANIMLANMIYOR (yalnız trigger referansı)",
  !/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.set_updated_at/i.test(BODY) &&
  /EXECUTE FUNCTION public\.set_updated_at\(\)/.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP M — HD-2D faz sınırı
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP M: HD-2D faz sınırı ──");
check("M1. faithful translation / editorial / provenance junction / audit tablosu YOK",
  !/hd_faithful_translations|hd_editorial|hd_content_audit_events|hd_editorial_content_sources/i.test(BODY));
check("M2. entitlement / paket / overlay / report adapter YOK", !/entitlement|package|overlay|dual.read|read_adapter/i.test(BODY));
check("M3. source seed / gerçek kaynak metni seed YOK", !/\bINSERT\s+INTO\b/i.test(BODY) && !/\bVALUES\b/i.test(BODY));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP N — Negatif statik constraint mekanizma kanıtı
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP N: Negatif constraint kanıtı ──");
check("N1. bilinmeyen source_type reddi (CHECK IN)", /source_type IN \(/.test(SRC));
check("N2. bilinmeyen rights_status reddi", /rights_status IN \(/.test(SRC));
check("N3. bilinmeyen permission_basis reddi", /permission_basis IS NULL OR permission_basis IN \(/.test(SRC));
check("N4. status 'published' reddi (yalnız draft/verified/archived, üç tabloda)",
  [SRC, PAS, OT].every((b) => /status IN \('draft', 'verified', 'archived'\)/.test(b)));
check("N5. revision 0 reddi (revision > 0, üç tabloda)", [SRC, PAS, OT].every((b) => /revision > 0/.test(b)));
check("N6. revision=1+supersedes dolu / revision=2+supersedes NULL reddi (coupling, üç tabloda)",
  [["source_id"], ["passage_id"], ["original_text_id"]].map((x) => x[0]).every((_, i) =>
    /revision = 1 AND supersedes_\w+ IS NULL/.test([SRC, PAS, OT][i]) && /revision > 1 AND supersedes_\w+ IS NOT NULL/.test([SRC, PAS, OT][i])));
check("N7. self-supersedes reddi (üç tabloda not-self CHECK)",
  /supersedes_source_id <> id/.test(SRC) && /supersedes_passage_id <> id/.test(PAS) && /supersedes_original_text_id <> id/.test(OT));
check("N8. publication_year 1399/2101 reddi", /publication_year BETWEEN 1400 AND 2100/.test(SRC));
check("N9. boş title/locator_label/locator_value reddi",
  /btrim\(title\) <> ''/.test(SRC) && /btrim\(locator_label\) <> ''/.test(PAS) && /btrim\(locator_value\) <> ''/.test(PAS));
check("N10. locator_metadata array reddi (object CHECK)", /jsonb_typeof\(locator_metadata\) = 'object'/.test(PAS));
check("N11. sort_order -1 reddi", /sort_order >= 0/.test(PAS));
check("N12. bilinmeyen locator_kind/passage_kind reddi", /locator_kind IN \(/.test(PAS) && /passage_kind IN \(/.test(PAS));
check("N13. invalid language_tag/script_code reddi (üç yer)",
  /language_tag ~ /.test(OT) && /script_code ~ /.test(OT) && /default_language_tag ~ /.test(SRC));
check("N14. uppercase / 63-char content_hash reddi (64-lowercase-hex)", /content_hash ~ '\^\[0-9a-f\]\{64\}\$'/.test(OT));
check("N15. bilinmeyen capture_method reddi", /capture_method IN \(/.test(OT));
check("N16. aynı passage/lang/script iki verified reddi (partial UNIQUE)",
  /hd_original_texts_one_verified_current_uidx[\s\S]*?WHERE status = 'verified'/.test(BODY));

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILED:"); for (const f of fails) console.log("  - " + f); process.exit(1); }
