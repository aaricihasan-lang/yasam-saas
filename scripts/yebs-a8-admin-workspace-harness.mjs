#!/usr/bin/env node
// ============================================================
// YEBS A8 — Admin Workspace STATIC acceptance harness (no-DB, no-network)
//
// A8 admin UI + kontratlarını STATİK olarak doğrular. fs ile repo dosyalarını
// okur; DB/ağ yoktur. Her FAIL → exit(1). Sonda "== A8 SONUC: X PASS / Y FAIL ==".
//
// Kapsam (A–L): route/page envanteri, API client kontratı, lifecycle map,
// eligibility, hata sözlüğü, kaynak künye matrisi, kanıt kilidi, etiketler,
// concept label-aware arama, responsive/statik, güvenlik, korunan A7 migration'lar.
//
// NOT: service_role / request_id / operation_id gibi hassas token'lar kaynakta
// YALNIZ AÇIKLAMA (yorum) satırlarında dokümante edilmiş olabilir; harness
// bunları YORUM-DUYARLI olarak (yalnız çalışan kod satırında) reddeder.
// ============================================================

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log(`  PASS  ${label}`); }
function bad(label, extra) { fail++; console.log(`  FAIL  ${label}${extra ? `\n         ↳ ${extra}` : ""}`); }
function assert(cond, label, extra) { cond ? ok(label) : bad(label, extra); }
function section(t) { console.log(`\n--- ${t} ---`); }

const P = (...parts) => join(ROOT, ...parts);
function read(rel) {
  const p = typeof rel === "string" ? P(...rel.split("/")) : rel;
  try { return readFileSync(p, "utf8"); } catch { return null; }
}
function exists(rel) { return existsSync(P(...rel.split("/"))); }

// Yorum-duyarlı token tarama: token'ı YALNIZ çalışan kod satırında yakalar.
// Yorum satırı = trimmed başı //, *, /*, {/*  VEYA token'dan önce // gelen satır.
function codeHits(text, token) {
  if (text == null) return ["<dosya yok>"];
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(token);
    if (idx < 0) continue;
    const trimmed = line.trimStart();
    const isCommentLine = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("{/*");
    const dbl = line.indexOf("//");
    const afterLineComment = dbl >= 0 && dbl < idx;
    if (isCommentLine || afterLineComment) continue;
    hits.push(`L${i + 1}: ${trimmed.slice(0, 80)}`);
  }
  return hits;
}

// app/admin/yebs altındaki tüm .ts/.tsx dosyalarını topla.
function walk(dirRel) {
  const abs = P(...dirRel.split("/"));
  const out = [];
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    const childRel = `${dirRel}/${name}`;
    const childAbs = P(...childRel.split("/"));
    if (statSync(childAbs).isDirectory()) out.push(...walk(childRel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(childRel);
  }
  return out;
}

const ENTITIES = ["traditions", "schools", "concepts", "sources", "claims", "relations"];
const YEBS_FILES = walk("app/admin/yebs");

console.log("== YEBS A8 Admin Workspace Static Harness ==");

// ============================================================
section("A. Route / page envanteri");
assert(exists("app/admin/yebs/page.tsx"), "A: YEBS ana ekranı app/admin/yebs/page.tsx var");
for (const e of ENTITIES) {
  assert(exists(`app/admin/yebs/${e}/page.tsx`), `A: liste sayfası ${e}/page.tsx var`);
  assert(exists(`app/admin/yebs/${e}/[id]/page.tsx`), `A: detay sayfası ${e}/[id]/page.tsx var`);
  assert(exists(`app/admin/yebs/${e}/new/page.tsx`), `A: yeni sayfası ${e}/new/page.tsx var`);
}
const adminLayout = read("app/admin/layout.tsx");
const adminIndex = read("app/admin/page.tsx");
assert(adminLayout != null && adminLayout.includes("/admin/yebs"), "A: admin layout nav link /admin/yebs içerir");
assert(adminIndex != null && adminIndex.includes("/admin/yebs"), "A: admin ana sayfa kartı /admin/yebs içerir");

// ============================================================
section("B. API client kontratı (adminYebsApi.ts)");
const api = read("app/admin/yebs/adminYebsApi.ts");
assert(api != null, "B: adminYebsApi.ts okunabilir");
const apiEntityConst = { traditions: "traditionsApi", schools: "schoolsApi", concepts: "conceptsApi", sources: "sourcesApi", claims: "claimsApi", relations: "relationsApi" };
for (const [e, cst] of Object.entries(apiEntityConst)) {
  const block = api ? api.slice(api.indexOf(`export const ${cst}`), api.indexOf(`export const ${cst}`) >= 0 ? api.indexOf("};", api.indexOf(`export const ${cst}`)) + 2 : 0) : "";
  assert(new RegExp(`export const ${cst}\\s*=`).test(api ?? ""), `B: ${cst} export edilmiş`);
  for (const fn of ["list", "detail", "create", "update", "transition", "eligibility"]) {
    assert(new RegExp(`\\b${fn}:`).test(block), `B: ${cst}.${fn} tanımlı`);
  }
}
// Concept label CRUD
for (const fn of ["listLabels", "createLabel", "updateLabel", "deleteLabel"]) {
  assert(new RegExp(`\\b${fn}:`).test(api ?? ""), `B: conceptsApi.${fn} (label CRUD) tanımlı`);
}
// Evidence attach/update/detach/verify (claim + relation)
for (const fn of ["listSources", "attachSource", "updateSource", "detachSource", "verifySource"]) {
  const count = (api ?? "").match(new RegExp(`\\b${fn}:`, "g"));
  assert(count != null && count.length >= 2, `B: ${fn} claim+relation ikisinde de var (evidence)`);
}
// Başlıklar + BASE
assert(/"x-admin-id"/.test(api ?? ""), "B: client x-admin-id başlığı gönderir");
assert(/"x-session-token"/.test(api ?? ""), "B: client x-session-token başlığı gönderir");
assert(/const BASE = "\/api\/admin\/yebs"/.test(api ?? ""), "B: BASE = /api/admin/yebs");
// request_id / operation_id ASLA (adminYebsApi.ts + tüm page.tsx) — kod düzeyinde
{
  let leaks = [];
  for (const tok of ["request_id", "operation_id"]) {
    leaks.push(...codeHits(api, tok).map((h) => `adminYebsApi.ts ${tok} ${h}`));
    for (const f of YEBS_FILES.filter((x) => x.endsWith("page.tsx"))) {
      leaks.push(...codeHits(read(f), tok).map((h) => `${f} ${tok} ${h}`));
    }
  }
  assert(leaks.length === 0, "B: request_id/operation_id kod düzeyinde HİÇBİR yerde gönderilmez", leaks.slice(0, 3).join(" | "));
}
// transition/verify gövde şekilleri
assert(
  /type TransitionBody = \{ target_status: string; expected_updated_at: string; reason: string \}/.test(api ?? ""),
  "B: TransitionBody = {target_status, expected_updated_at, reason}",
);
assert(
  /type VerificationBody = \{ verification_status: string; expected_updated_at: string; reason: string \}/.test(api ?? ""),
  "B: VerificationBody = {verification_status, expected_updated_at, reason}",
);

// ============================================================
section("C. Lifecycle map & yasak geçişler");
const lmap = read("lib/yebs/ui/lifecycleMap.ts");
assert(lmap != null, "C: lib/yebs/ui/lifecycleMap.ts var");
for (const g of ["canonical", "source", "claimlike"]) {
  assert((lmap ?? "").includes(`"${g}"`) || (lmap ?? "").includes(`: LifecycleGroup = "${g}"`), `C: lifecycle grubu '${g}' tanımlı`);
}
assert(/ENTITY_LIFECYCLE_GROUP/.test(lmap ?? ""), "C: ENTITY_LIFECYCLE_GROUP eşlemesi var");
// force/bypass/override/quality_override/admin_override → app/admin/yebs + lifecycleMap kod düzeyinde YOK
{
  const forbidden = ["force", "bypass", "override", "quality_override", "admin_override"];
  let hits = [];
  for (const f of [...YEBS_FILES, "lib/yebs/ui/lifecycleMap.ts"]) {
    const src = read(f);
    for (const tok of forbidden) hits.push(...codeHits(src, tok).map((h) => `${f}:${tok} ${h}`));
  }
  assert(hits.length === 0, "C: force/bypass/override/quality_override/admin_override kod düzeyinde YOK", hits.slice(0, 4).join(" | "));
}
// Evidence UI: rejected→verified DOĞRUDAN yasak
const ev = read("app/admin/yebs/components/EvidenceSection.tsx") ?? "";
{
  // İçerik kilidi: verified||rejected
  assert(
    /verification_status === "verified" \|\| .*verification_status === "rejected"/.test(ev) ||
      /contentLocked=\{[^}]*"verified"[^}]*"rejected"/.test(ev),
    "C/G: kanıt içerik düzenleme verified/rejected için kilitli",
  );
  // Non-unverified dalını izole et ve orada verified/rejected/detach OLMAMALI
  const tIdx = ev.indexOf("isUnverified ?");
  const elseIdx = tIdx >= 0 ? ev.indexOf(") : (", tIdx) : -1;
  const endIdx = elseIdx >= 0 ? ev.indexOf(")}", elseIdx) : -1;
  const elseBranch = elseIdx >= 0 && endIdx >= 0 ? ev.slice(elseIdx, endIdx) : "";
  assert(elseBranch.length > 0, "C: EvidenceSection isUnverified ternary'si ayrıştırıldı");
  assert(!/target:\s*"verified"/.test(elseBranch), "C: reddedilmiş/doğrulanmış satırda DOĞRUDAN 'verified' butonu YOK");
  assert(!/target:\s*"rejected"/.test(elseBranch), "C: reddedilmiş/doğrulanmış satırda 'rejected' butonu YOK");
  assert(/target:\s*"unverified"/.test(elseBranch), "C/G: kilitli satır yalnız 'unverified'a sıfırlama sunar");
  assert(!/setDetachRow/.test(elseBranch), "C/G: reddedilmiş/doğrulanmış satırda detach/sil YOK");
  // İç tutarlılık: verified/rejected geçişleri yalnız unverified satırda
  assert(/isUnverified/.test(ev) && /target:\s*"verified"/.test(ev) && /target:\s*"rejected"/.test(ev),
    "C: verified/rejected geçişleri yalnız unverified dalında sunulur");
}
// Auto-publish yok: 'published' hedefine kullanıcı aksiyonu olmadan otomatik geçiş yok.
{
  let autopub = [];
  for (const f of YEBS_FILES) {
    const src = read(f) ?? "";
    // useEffect/interval içinden transition('published') çağrısı arama (kaba imza)
    if (/transition\([^)]*"published"/.test(src)) autopub.push(`${f}: transition("published") literal`);
    if (/setInterval\([^)]*publish/i.test(src)) autopub.push(`${f}: setInterval publish`);
  }
  assert(autopub.length === 0, "C: otomatik/gizli publish çağrısı yok (yayın yalnız kullanıcı aksiyonuyla)", autopub.join(" | "));
}

// ============================================================
section("D. Eligibility");
const eligPanel = read("app/admin/yebs/components/EligibilityPanel.tsx") ?? "";
assert(/blocker_codes\.map/.test(eligPanel), "D: EligibilityPanel blocker_codes'u map eder");
assert(/codeMeta\(/.test(eligPanel), "D: EligibilityPanel codeMeta ile Türkçeleştirir");
const lmodal = read("app/admin/yebs/components/LifecycleModal.tsx") ?? "";
assert(/action\.eligibilityRequired/.test(lmodal), "D: LifecycleModal eligibilityRequired'e göre eligibility çeker");
assert(/useEffect\(\(\) => \{ void loadEligibility\(\)/.test(lmodal) || /void loadEligibility\(\)/.test(lmodal), "D: submit öncesi eligibility yüklenir");
// write response otoritedir → hata dalında yeniden eligibility çek
{
  const hIdx = lmodal.indexOf("async function handleSubmit");
  const hBody = hIdx >= 0 ? lmodal.slice(hIdx, hIdx + 700) : "";
  assert(/codeMeta\(r\.code\)/.test(hBody) && /loadEligibility\(\)/.test(hBody),
    "D: WRITE yanıtı otorite — hata sözlükle gösterilir + eligibility tazelenir");
}

// ============================================================
section("E. Hata sözlüğü (errorMessages.ts)");
const errs = read("lib/yebs/ui/errorMessages.ts") ?? "";
assert(/YEBS_CODE_DICTIONARY/.test(errs), "E: YEBS_CODE_DICTIONARY var");
assert(/GENERIC_FALLBACK/.test(errs), "E: GENERIC_FALLBACK var");
const requiredCodes = [
  "YEBS_CONCEPT_REQUIRED_LABEL_MISSING",
  "YEBS_RELATION_GRAPH_CYCLE",
  "YEBS_PUBLISH_DEPENDENCY_BLOCKED",
  "YEBS_SOURCE_METADATA_INCOMPLETE",
  "YEBS_CLAIM_NO_VERIFIED_EVIDENCE",
];
for (const c of requiredCodes) assert(errs.includes(c), `E: kod var: ${c}`);
// aile kodları: *_STALE_UPDATE ve *_VERIFICATION_LOCKED en az birer örnek
assert(/YEBS_\w+_STALE_UPDATE/.test(errs), "E: YEBS_*_STALE_UPDATE ailesi mevcut");
assert(/YEBS_\w+_VERIFICATION_LOCKED/.test(errs), "E: YEBS_*_VERIFICATION_LOCKED ailesi mevcut");
// Ham DB hata sızıntısı yok: sayfalarda err.message/error.stack render edilmez
{
  let leaks = [];
  for (const f of YEBS_FILES.filter((x) => x.endsWith(".tsx"))) {
    const src = read(f) ?? "";
    for (const tok of ["error.stack", ".stack}", "err.message}", "error.message}"]) {
      if (src.includes(tok)) leaks.push(`${f}: ${tok}`);
    }
  }
  assert(leaks.length === 0, "E: ham DB hata (err.message/error.stack) UI'da render edilmez", leaks.slice(0, 4).join(" | "));
}

// ============================================================
section("F. Kaynak künye matrisi (sourceForm.ts ↔ A7 migration)");
const sf = read("app/admin/yebs/sources/sourceForm.ts") ?? "";
const SOURCE_TYPES_17 = [
  "book", "monograph", "journal_article", "regulatory_document", "standard",
  "website", "database_record", "classical_text", "thesis",
  "oral_tradition_record", "other", "institutional_report", "archival_document",
  "media_recording", "interview_record", "field_observation_record", "experiential_record",
];
for (const t of SOURCE_TYPES_17) assert(new RegExp(`\\b${t}\\b`).test(sf), `F: sourceForm türü var: ${t}`);
assert(SOURCE_TYPES_17.length === 17, "F: 17 SOURCE_TYPES beklenir");
// A7 gate CASE ile çapraz-teyit
const mig22 = read("supabase/migrations/20260922000000_yebs_a7_quality_gates.sql") ?? "";
const gatedCase = [
  ["book", /WHEN 'book'[\s\S]*?authors[\s\S]*?publisher[\s\S]*?publication_year/],
  ["journal_article", /WHEN 'journal_article'[\s\S]*?authors[\s\S]*?doi[\s\S]*?publication_year/],
  ["regulatory_document", /WHEN 'regulatory_document'[\s\S]*?organization[\s\S]*?document_no/],
  ["website", /WHEN 'website'[\s\S]*?url/],
  ["thesis", /WHEN 'thesis'[\s\S]*?authors[\s\S]*?publication_year/],
];
for (const [name, re] of gatedCase) assert(re.test(mig22), `F: A7 migration CASE '${name}' beklenen alanları içerir`);
// sourceForm gated grupları migration'la aynı hizada (örnek: journal_article authors AND (doi|year))
assert(/journal_article:\s*\{[\s\S]*?anyOf:\s*\["authors"\][\s\S]*?anyOf:\s*\["doi", "publication_year"\]/.test(sf),
  "F: sourceForm journal_article grupları migration ile birebir");
assert(/website:\s*\{[\s\S]*?anyOf:\s*\["url"\]/.test(sf), "F: sourceForm website = url");
// no-requirement türler boş groups
assert(/oral_tradition_record:\s*\{ groups: \[\] \}/.test(sf), "F: oral_tradition_record ek zorunluluk yok (groups:[])");
assert(/other:\s*\{ groups: \[\] \}/.test(sf), "F: other ek zorunluluk yok (groups:[])");

// ============================================================
section("G. Kanıt kilidi (EvidenceSection.tsx)");
assert(ev.length > 0, "G: EvidenceSection.tsx var");
assert(/contentLocked=\{[\s\S]*?"verified"[\s\S]*?"rejected"/.test(ev), "G: verified/rejected içerik düzenlemeyi kilitler");
assert(/Doğrulanmadı/.test(ev), "G: 'Doğrulanmadı'ya al (reset-to-unverified) sunulur");
// detach yalnız unverified: PARENT_EDITABLE + isUnverified dalı (yukarıda else-branch teyit edildi)
assert(/setDetachRow/.test(ev), "G: detach akışı mevcut (yalnız unverified satırda — C'de teyit)");

// ============================================================
section("H. Kavram etiketleri (LabelsTab.tsx)");
const labels = read("app/admin/yebs/concepts/[id]/LabelsTab.tsx") ?? "";
assert(labels.length > 0, "H: LabelsTab.tsx var");
assert(/birincil etiket/i.test(labels), "H: en az bir BİRİNCİL etiket gerekliliği yüzeye çıkar");
assert(/ayrı yaşam döngüsü yoktur|ayrı yaşam döngüsü/i.test(labels), "H: etiketler için ayrı lifecycle metni YOK (kaydın parçası)");
assert(!/lifecycleActions\(/.test(labels) && !/LifecycleModal/.test(labels), "H: LabelsTab lifecycle transition kullanmaz");
// update/delete gövdeleri expected_updated_at + reason
{
  const upIdx = labels.indexOf("submitEdit");
  const upBody = upIdx >= 0 ? labels.slice(upIdx, upIdx + 600) : "";
  assert(/expected_updated_at: editRow\.updated_at/.test(upBody) && /reason/.test(upBody), "H: label update expected_updated_at + reason gönderir");
  const delIdx = labels.indexOf("submitDelete");
  const delBody = delIdx >= 0 ? labels.slice(delIdx, delIdx + 400) : "";
  assert(/expected_updated_at: deleteRow\.updated_at/.test(delBody) && /reason/.test(delBody), "H: label delete expected_updated_at + reason gönderir");
}

// ============================================================
section("I. Concept label-aware arama (TASK 1)");
assert(exists("scripts/yebs-a8-concept-search-harness.mjs"), "I: TASK 1 harness scripts/yebs-a8-concept-search-harness.mjs var");
const svc = read("lib/yebs/service/concepts.ts") ?? "";
const listIdx = svc.indexOf("export async function listConcepts");
const listBody = listIdx >= 0 ? svc.slice(listIdx, svc.indexOf("export async function getConceptById")) : "";
assert(/yebs_concept_labels/.test(listBody) && /\.ilike\("label"/.test(listBody), "I: listConcepts label-aware (yebs_concept_labels.label ilike)");
assert(/slug\.ilike/.test(listBody) && /id\.in\.\(/.test(listBody), "I: q dalı slug.ilike + id.in birleşimi (tek tablo, tekilliği korur)");

// ============================================================
section("J. Responsive / statik");
for (const e of ENTITIES) {
  const src = read(`app/admin/yebs/${e}/page.tsx`) ?? "";
  assert(/ListLayout/.test(src), `J: ${e} liste sayfası ListLayout kullanır`);
}
const listLib = read("app/admin/yebs/components/list.tsx") ?? "";
assert(/md:block/.test(listLib) && /md:hidden/.test(listLib), "J: ListLayout masaüstü tablo (md:block) + mobil kart (md:hidden)");
const shell = read("app/admin/yebs/components/DetailShell.tsx") ?? "";
assert(/fixed inset-x-0 bottom-0/.test(shell), "J: DetailShell sticky alt action bar (fixed bottom)");
const prim = read("app/admin/yebs/components/primitives.tsx") ?? "";
assert(/export function Field/.test(prim) && /<label/.test(prim), "J: Field primitive <label> öğesi kullanır");

// ============================================================
section("K. Güvenlik");
assert(YEBS_FILES.every((f) => f.startsWith("app/admin/yebs/")), "K: tüm YEBS sayfaları app/admin/yebs altında (admin guard'ı miras alır)");
// service_role / SUPABASE_SERVICE_ROLE_KEY kod düzeyinde HİÇBİR yerde
{
  let leaks = [];
  for (const f of YEBS_FILES) {
    const src = read(f);
    leaks.push(...codeHits(src, "service_role").map((h) => `${f}:service_role ${h}`));
    leaks.push(...codeHits(src, "SUPABASE_SERVICE_ROLE_KEY").map((h) => `${f}:KEY ${h}`));
  }
  assert(leaks.length === 0, "K: service_role/SUPABASE_SERVICE_ROLE_KEY kod düzeyinde YOK (yalnız yorum olabilir)", leaks.slice(0, 4).join(" | "));
}
// SUPABASE_SERVICE_ROLE_KEY string'i (yorumda bile) hiç yok
{
  let any = [];
  for (const f of YEBS_FILES) if ((read(f) ?? "").includes("SUPABASE_SERVICE_ROLE_KEY")) any.push(f);
  assert(any.length === 0, "K: SUPABASE_SERVICE_ROLE_KEY hiçbir dosyada geçmez", any.join(" | "));
}
// Dinamik keyfi endpoint builder yok: tek fetch( ve BASE ön-ekli
{
  const fetchCalls = (api ?? "").match(/fetch\(/g) ?? [];
  assert(fetchCalls.length === 1, "K: adminYebsApi.ts yalnız TEK fetch( çağrısı içerir", `bulunan: ${fetchCalls.length}`);
  assert(/return fetch\(`\$\{BASE\}\$\{path\}`/.test(api ?? ""), "K: tek fetch çağrısı BASE ön-ekli (keyfi URL değil)");
}

// ============================================================
section("L. Korunan A7 migration'lar (SAME — yalnız varlık)");
for (const m of ["20260921000000_yebs_a7_hierarchy_graph.sql", "20260922000000_yebs_a7_quality_gates.sql", "20260924000000_yebs_a7_blocker_acl_hardening.sql"]) {
  assert(exists(`supabase/migrations/${m}`), `L: A7 migration var: ${m}`);
}

// ============================================================
console.log(`\n== A8 SONUC: ${pass} PASS / ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
