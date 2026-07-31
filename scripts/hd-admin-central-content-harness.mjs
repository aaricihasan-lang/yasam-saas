/**
 * HD FAZ-2 — Merkezî İçerik Admin API/Persistence — statik harness
 * ===============================================================
 *
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ. Admin API route'ları + persistence + audit
 * dosyalarının güvenlik/izolasyon sözleşmesini statik denetler.
 *
 * Çalıştır (repo kökünden): node scripts/hd-admin-central-content-harness.mjs
 */
import { readFileSync, existsSync } from "node:fs";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}
// Yorumları soy: absence/usage kontrolleri KOD kullanımına bakmalı, dokümantasyon
// yorumlarındaki "KULLANILMAZ: tenant_id / adminAudit.ts …" gibi ifadeler değil.
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const read = (p) => (existsSync(`${ROOT}/${p}`) ? stripComments(readFileSync(`${ROOT}/${p}`, "utf8")) : "");

const API_DIR = "app/api/admin/hd";
const ROUTES = [
  "canonical/route.ts",
  "content/route.ts",
  "content/publish/route.ts",
  "sources/route.ts",
  "passages/route.ts",
  "original-texts/route.ts",
  "translations/route.ts",
  "evidence/route.ts",
];
const routeSrc = Object.fromEntries(ROUTES.map((r) => [r, read(`${API_DIR}/${r}`)]));
const allRoutes = ROUTES.map((r) => routeSrc[r]).join("\n\n");

const persistence = read("lib/human-design/admin/centralContentPersistence.ts");
const audit = read("lib/human-design/admin/centralContentAudit.ts");
const validation = read("lib/human-design/admin/centralContentValidation.ts");
const types = read("lib/human-design/admin/centralContentTypes.ts");
const adminLayer = persistence + "\n" + audit + "\n" + validation + "\n" + types + "\n" + allRoutes;

console.log("── GRUP A: Route varlığı ve auth ──");
for (const r of ROUTES) check(`A.${r}: dosya mevcut`, routeSrc[r].length > 0);
for (const r of ROUTES) check(`A.${r}: verifyAdminRequest kullanıyor`, /verifyAdminRequest\s*\(/.test(routeSrc[r]));
for (const r of ROUTES) check(`A.${r}: runtime = "nodejs"`, /export const runtime = "nodejs"/.test(routeSrc[r]));
for (const r of ROUTES) check(`A.${r}: no-store`, /Cache-Control["']?\s*:\s*["']no-store/.test(routeSrc[r]));

console.log("── GRUP B: İzolasyon (tenant/rol/kullanıcı yok) ──");
check("B1. Hiçbir admin route verifyUserRequest kullanmıyor (0)", !/verifyUserRequest/.test(allRoutes));
check("B2. Admin hattında tenant_id YOK", !/\btenant_id\b/.test(allRoutes) && !/\btenant_id\b/.test(persistence));
check("B3. Admin hattı human_design_knowledge_records/sources referansı YOK",
  !/human_design_knowledge_records|human_design_knowledge_sources/.test(adminLayer));
check("B4. Route'lar client'tan role/user_id/actor_admin_id/admin_id kabul etmiyor (body okuma yok)",
  !/body\.(role|user_id|actor_admin_id|admin_id)\b/.test(allRoutes) &&
  !/raw\.(role|user_id|actor_admin_id|admin_id)\b/.test(allRoutes));
check("B5. actorAdminId yalnız guard.adminId'den (verifyAdminRequest sonucu)",
  /guard\.adminId/.test(allRoutes) && !/actor_admin_id\s*:\s*(body|raw|req)/.test(allRoutes));
check("B6. rejectForbiddenKeys tenant/rol/kimlik anahtarlarını reddeder",
  /FORBIDDEN_REQUEST_KEYS[\s\S]*tenant_id[\s\S]*user_id[\s\S]*role[\s\S]*actor_admin_id[\s\S]*admin_id/.test(validation));

console.log("── GRUP C: Canonical identity write route YOK ──");
check("C1. canonical/route.ts yalnız GET (POST/PATCH/DELETE yok)",
  /export async function GET/.test(routeSrc["canonical/route.ts"]) &&
  !/export async function (POST|PATCH|DELETE)/.test(routeSrc["canonical/route.ts"]));
check("C2. Persistence'ta canonical identity create/update/delete fonksiyonu YOK",
  !/function\s+\w*[Cc]anonical\w*(Create|Update|Delete)/.test(persistence) &&
  !/hd_canonical_entities['"]\)\.(insert|update|delete)/.test(persistence) &&
  !/from\(["']hd_canonical_(types|authorities|gates|channels)["']\)\.(insert|update|delete)/.test(persistence));

console.log("── GRUP D: İçerik/validation sözleşmesi ──");
check("D1. Dört canonical türü (tip/otorite/kapi/kanal) validation'da", /"tip", "otorite", "kapi", "kanal"/.test(validation));
check("D2. Published tür-bazlı validation (strategy/decision/theme/channel)",
  /tip: "strategy_text"/.test(validation) && /otorite: "decision_mechanism"/.test(validation) &&
  /kapi: "general_theme"/.test(validation) && /kanal: "full_channel_text"/.test(validation));
check("D3. draft gevşek, published zorunlu alan (targetStatus === 'published')",
  /targetStatus === "published"/.test(validation));
check("D4. relation_type allowlist supports/contradicts/school_specific/background",
  /"supports", "contradicts", "school_specific", "background"/.test(validation));
check("D5. single-source ve contradiction desteği (is_single_source + contradicts)",
  /is_single_source/.test(persistence) && /contradicts/.test(validation));

console.log("── GRUP E: Gerçek silme + dependency 409 + server hash ──");
check("E1. True delete fonksiyonları (content/source/passage/original/translation/evidence)",
  /deleteContent/.test(persistence) && /deleteSource/.test(persistence) && /deletePassage/.test(persistence) &&
  /deleteOriginalText/.test(persistence) && /deleteTranslation/.test(persistence) && /deleteEvidence/.test(persistence));
check("E2. FK dependency (23503) → dependency_conflict (409)",
  /23503/.test(persistence) && /dependency_conflict/.test(persistence) &&
  /dependency_conflict.*409|409.*dependency_conflict/.test(allRoutes.replace(/\s+/g, " ")));
check("E3. Server-side SHA-256 (createHash sha256; client hash yok)",
  /createHash\("sha256"\)/.test(persistence) && /content_hash:\s*sha256Hex/.test(persistence) && /translation_hash:\s*sha256Hex/.test(persistence));

console.log("── GRUP F: Audit sözleşmesi ──");
check("F1. centralContentAudit.ts kullanılıyor (writeHdContentAudit)",
  /writeHdContentAudit/.test(persistence));
check("F2. Paylaşılan writeAdminAudit KULLANILMIYOR",
  !/writeAdminAudit/.test(adminLayer));
check("F3. lib/admin/adminAudit.ts import EDİLMİYOR",
  !/lib\/admin\/adminAudit/.test(adminLayer) && !/@\/lib\/admin\/adminAudit/.test(adminLayer));
// Her mutation persistence fonksiyonu audit çağırır.
const MUTATIONS = [
  "createContent", "updateContent", "publishContent", "deleteContent",
  "createSource", "updateSource", "deleteSource",
  "createPassage", "updatePassage", "deletePassage",
  "createOriginalText", "updateOriginalText", "deleteOriginalText",
  "createTranslation", "updateTranslation", "deleteTranslation",
  "createEvidence", "deleteEvidence",
];
// audit(...) çağrısı, her generic yardımcının KENDİ gövdesinde bulunmalı (gövde-sınırlı;
// "sonraki fonksiyonda audit var" false-pozitifini engeller).
function fnBody(src, name) {
  const m = src.match(new RegExp(`(?:async\\s+function|function)\\s+${name}\\b`));
  if (!m) return "";
  const start = m.index ?? 0;
  const rest = src.slice(start + m[0].length);
  const nextFn = rest.search(/\n(?:async\s+function|function|export\s+(?:async\s+)?function)\s/);
  return rest.slice(0, nextFn === -1 ? undefined : nextFn);
}
check("F4. Her generic yardımcı KENDİ gövdesinde audit() çağırır (gövde-sınırlı)",
  /audit\(/.test(fnBody(persistence, "genericDelete")) &&
  /audit\(/.test(fnBody(persistence, "genericCreate")) &&
  /audit\(/.test(fnBody(persistence, "genericUpdate")));
check("F4b. Özel mutation'lar (content/original/translation/evidence) kendi gövdelerinde audit()",
  /audit\(/.test(fnBody(persistence, "createContent")) &&
  /audit\(/.test(fnBody(persistence, "updateContent")) &&
  /audit\(/.test(fnBody(persistence, "publishContent")) &&
  /audit\(/.test(fnBody(persistence, "deleteContent")) &&
  /audit\(/.test(fnBody(persistence, "createOriginalText")) &&
  /audit\(/.test(fnBody(persistence, "createTranslation")) &&
  /audit\(/.test(fnBody(persistence, "createEvidence")));
check("F4c. Tüm beklenen mutation fonksiyonları tanımlı",
  MUTATIONS.every((m) => new RegExp(`(async function|const)\\s+${m}\\b`).test(persistence)));
check("F5. actorAdminId audit'e verifyAdminRequest sonucundan geçiyor (persistence param)",
  /actor_admin_id:\s*actorAdminId/.test(audit) || /actor_admin_id:\s*params\.actor_admin_id/.test(audit));
check("F6. Audit context'e tam-metin KOPYALANMAZ (forbidden context keys)",
  /FORBIDDEN_AUDIT_CONTEXT_KEYS[\s\S]*original_text[\s\S]*translation_text[\s\S]*report_text[\s\S]*general_description/.test(audit));
check("F7. Persistence audit context'ine original_text/translation_text/report_text YAZMIYOR",
  !/context:\s*\{[^}]*\b(original_text|translation_text|report_text)\b\s*:/.test(persistence));
check("F8. Audit hatası sessizce yutulmuyor (fail-closed: HdContentAuditError throw)",
  /throw new HdContentAuditError/.test(audit) && /HdContentAuditError/.test(allRoutes));

console.log("── GRUP G: Rapor/tenant değişmezliği (dosya dokunulmamış) ──");
for (const p of ["app/human-design/rapor-olustur/helpers/hdRapor.ts", "lib/human-design/api/reportPersistence.ts", "lib/admin/adminAudit.ts"]) {
  // Bu harness bu dosyaların İÇERİĞİNİ değiştirmez; scope denetimi git tarafında.
  check(`G.${p.split("/").pop()}: admin hattından import edilmiyor`, !new RegExp(p.replace(/[/.]/g, "\\$&")).test(adminLayer));
}

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILED:"); for (const f of fails) console.log("  - " + f); process.exit(1); }
