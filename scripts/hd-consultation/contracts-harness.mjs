/**
 * HD Danışmanlık F0B · Contract/Validation Harness
 * ================================================
 * GERÇEK validation + types import edilir. Duplicate section, boş body/soru,
 * geçersiz enum, archive dışlama, canonical id+version+hash zorunluluğu,
 * entitlement invariant'ları, session_id nullable, snapshot immutability.
 * Herhangi bir FAIL → exit 1.
 *
 * Çalıştır:  npx tsx scripts/hd-consultation/contracts-harness.mjs
 */
import {
  checkSessionReportCompatibility,
  deepEqualSnapshot,
  excludeArchivedForAssembly,
  findDuplicateSectionKinds,
  freezeSnapshot,
  isAssemblyEligible,
  isEntitlementActive,
  validateCanonicalRef,
  validateEntitlement,
  validateNoDuplicateSectionKinds,
  validateQuestionText,
  validateSectionInput,
} from "@/lib/human-design/consultation/validation";
import {
  HD_SECTION_KINDS,
  isHdSectionKind,
  isHdUsageScope,
  isHdConditionKind,
} from "@/lib/human-design/consultation/types";

let pass = 0;
let fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(desc);
    console.log(`  FAIL  ${desc}`);
  }
}

// ── Enum guard'ları ─────────────────────────────────────────────────────────
check("section_kind whitelist tam (9)", HD_SECTION_KINDS.length === 9);
check("geçerli section_kind kabul", isHdSectionKind("report_ready_text"));
check("serbest section_kind reddi", !isHdSectionKind("free_text_block"));
check("geçerli usage_scope", isHdUsageScope("both") && !isHdUsageScope("public"));
check("geçerli condition_kind", isHdConditionKind("has_gate") && !isHdConditionKind("region_is"));

// ── Section girdi doğrulaması ───────────────────────────────────────────────
check("Geçerli section → 0 problem", validateSectionInput({ section_kind: "quick_reference", body_text: "metin", usage_scope: "both", status: "draft", topic_scope: null }).length === 0);
check("Boş body reddi", validateSectionInput({ section_kind: "quick_reference", body_text: "   ", usage_scope: "both", status: "draft" }).some((p) => p.includes("body_text")));
check("Geçersiz section_kind reddi", validateSectionInput({ section_kind: "xxx", body_text: "m", usage_scope: "both", status: "draft" }).some((p) => p.includes("section_kind")));
check("Geçersiz usage_scope reddi", validateSectionInput({ section_kind: "quick_reference", body_text: "m", usage_scope: "world", status: "draft" }).some((p) => p.includes("usage_scope")));
check("Geçersiz status reddi", validateSectionInput({ section_kind: "quick_reference", body_text: "m", usage_scope: "both", status: "live" }).some((p) => p.includes("status")));
check("topic_scope boş-string reddi", validateSectionInput({ section_kind: "quick_reference", body_text: "m", usage_scope: "both", status: "draft", topic_scope: "  " }).some((p) => p.includes("topic_scope")));
check("topic_scope aşırı uzunluk reddi", validateSectionInput({ section_kind: "quick_reference", body_text: "m", usage_scope: "both", status: "draft", topic_scope: "x".repeat(200) }).some((p) => p.includes("topic_scope")));
check("Boş question reddi", validateQuestionText("   ").length > 0);
check("Geçerli question", validateQuestionText("Nasıl karar veriyorsun?").length === 0);

// ── Duplicate section_kind (aktif içerikte) ─────────────────────────────────
const secs = [
  { section_kind: "quick_reference", status: "published" },
  { section_kind: "quick_reference", status: "published" },
  { section_kind: "client_explanation", status: "published" },
  { section_kind: "quick_reference", status: "archived" }, // archived sayılmaz
];
check("Duplicate tespiti", findDuplicateSectionKinds(secs).includes("quick_reference"));
check("Duplicate → problem", validateNoDuplicateSectionKinds(secs).length > 0);
check("archived duplicate sayılmaz", !findDuplicateSectionKinds([{ section_kind: "quick_reference", status: "published" }, { section_kind: "quick_reference", status: "archived" }]).length);

// ── Archive assembly dışı ───────────────────────────────────────────────────
const rows = [
  { id: "a", status: "published", archived_at: null },
  { id: "b", status: "archived", archived_at: "2026-08-01T00:00:00Z" },
  { id: "c", status: "draft", archived_at: null },
  { id: "d", status: "published", archived_at: "2026-08-02T00:00:00Z" }, // archived_at dolu
];
const eligible = excludeArchivedForAssembly(rows);
check("Assembly yalnız published+non-archived", eligible.length === 1 && eligible[0].id === "a");
check("isAssemblyEligible draft false", isAssemblyEligible({ status: "draft", archived_at: null }) === false);

// ── Canonical kaynak izi (id+version+hash birlikte) ─────────────────────────
const HASH = "a".repeat(64);
check("Üçü null → bağsız geçerli", validateCanonicalRef({ canonical_content_id: null, canonical_content_version: null, canonical_content_hash: null }).length === 0);
check("Yalnız id yeterli DEĞİL", validateCanonicalRef({ canonical_content_id: "cid", canonical_content_version: null, canonical_content_hash: null }).length > 0);
check("id+version+hash geçerli", validateCanonicalRef({ canonical_content_id: "cid", canonical_content_version: 2, canonical_content_hash: HASH }).length === 0);
check("Geçersiz hash reddi", validateCanonicalRef({ canonical_content_id: "cid", canonical_content_version: 2, canonical_content_hash: "SHORT" }).some((p) => p.includes("hash")));
check("Sıfır/negatif version reddi", validateCanonicalRef({ canonical_content_id: "cid", canonical_content_version: 0, canonical_content_hash: HASH }).some((p) => p.includes("version")));

// ── Entitlement invariant'ları ──────────────────────────────────────────────
check("all_hd + entity_id null → geçerli", validateEntitlement({ scope_kind: "all_hd", entity_id: null, revoked_at: null }).length === 0);
check("all_hd + entity_id dolu → reddi", validateEntitlement({ scope_kind: "all_hd", entity_id: "e1", revoked_at: null }).some((p) => p.includes("all_hd")));
check("entity + entity_id yok → reddi", validateEntitlement({ scope_kind: "entity", entity_id: null, revoked_at: null }).some((p) => p.includes("entity_id")));
check("entity + entity_id dolu → geçerli", validateEntitlement({ scope_kind: "entity", entity_id: "e1", revoked_at: null }).length === 0);
check("çelişkili active boolean reddi", validateEntitlement({ scope_kind: "all_hd", entity_id: null, revoked_at: null, active: true }).some((p) => p.includes("active")));
check("aktiflik = revoked_at===null", isEntitlementActive({ revoked_at: null }) === true && isEntitlementActive({ revoked_at: "2026-01-01" }) === false);

// ── session_id nullable sözleşmesi ──────────────────────────────────────────
const session = { tenant_id: "t1", client_id: "c1", chart_id: "h1" };
check("session_id null → kısıt yok", checkSessionReportCompatibility({ tenant_id: "t1", client_id: "c1", chart_id: "h1", session_id: null }, null).length === 0);
check("session_id dolu + uyumlu → 0 problem", checkSessionReportCompatibility({ tenant_id: "t1", client_id: "c1", chart_id: "h1", session_id: "s1" }, session).length === 0);
check("session_id dolu + tenant uyumsuz → problem", checkSessionReportCompatibility({ tenant_id: "tX", client_id: "c1", chart_id: "h1", session_id: "s1" }, session).some((p) => p.includes("tenant")));
check("session_id dolu ama oturum yok → problem", checkSessionReportCompatibility({ tenant_id: "t1", client_id: "c1", chart_id: "h1", session_id: "s1" }, null).length > 0);

// ── Snapshot immutability ───────────────────────────────────────────────────
const snapshot = {
  product: "client_report",
  produced_at: "2026-08-03T10:00:00Z",
  entries: [
    { content_id: "c", content_version: 1, section_id: "s", section_version: 1, section_kind: "report_ready_text", usage_scope: "client_report", canonical_content_id: "cc", canonical_content_version: 3, canonical_content_hash: HASH, rendered_body: "Temiz metin", rights_decision: { allowed: true } },
  ],
};
const before = JSON.parse(JSON.stringify(snapshot));
freezeSnapshot(snapshot);
// Sonradan "canonical değişti" simülasyonu: snapshot'ı değiştirmeye çalış
let mutationBlocked = false;
try {
  snapshot.entries[0].rendered_body = "DEĞİŞTİRİLMİŞ";
  // strict mode dışı sessiz başarısızlık ihtimaline karşı değeri de kontrol et
  mutationBlocked = snapshot.entries[0].rendered_body === "Temiz metin";
} catch {
  mutationBlocked = true;
}
check("Snapshot mutasyonu engellendi (frozen)", mutationBlocked);
check("Snapshot içeriği değişmedi (deepEqual)", deepEqualSnapshot(snapshot, before));
check("deepEqual anahtar sırasından bağımsız", deepEqualSnapshot({ a: 1, b: 2 }, { b: 2, a: 1 }));
check("deepEqual farkı yakalar", !deepEqualSnapshot({ a: 1 }, { a: 2 }));

console.log(`\ncontracts-harness: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) {
  console.log("FAILURES:\n - " + fails.join("\n - "));
  process.exit(1);
}
