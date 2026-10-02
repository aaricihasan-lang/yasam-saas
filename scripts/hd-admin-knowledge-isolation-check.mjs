/**
 * HD ADMIN KNOWLEDGE ISOLATION — statik sözleşme harness'ı (DB'SİZ, SALT-OKUMA).
 * =============================================================================
 *
 * Sözleşme: Human Design modülü uzmanlara AÇIK kalır (chart/client/compute + kendi
 * knowledge_records'ları), ANCAK admin/owner'a ait MERKEZÎ CANONICAL bilgi corpus'u
 * (112/112 + kaynaklar + evidence + Reader prose) yalnız role==='admin' için servis edilir.
 * Non-admin → server 403 + client empty-state.
 *
 * FAZ1 FINAL HARDENING (yeni sözleşme — C/D/E bölümleri güncellendi):
 *   Profesyonel canonical Word TÜM HD uzmanlarına açıktır (requireModuleAccess
 *   "human_design"). Canonical metin uzmana YALNIZ donmuş rapor snapshot'ı → DOCX yoluyla
 *   ulaşır: listeleme/okuma ucu YOK, liste/detay projeksiyonu snapshot/canonical_provenance
 *   taşımaz, uzman modunda eksik içerik `omit` edilir (anahtar sızmaz), >26 benzersiz kapı
 *   anti-scrape ile reddedilir. Admin fail-loud davranışı korunur.
 *
 * Bu harness, izolasyonun SERVER katmanında (yalnız UI'da DEĞİL) uygulandığını ve
 * canonical'a erişen her yolun admin-only olduğunu statik olarak güvenceye alır.
 *
 * Çalıştır (repo kökünden): node scripts/hd-admin-knowledge-isolation-check.mjs
 */
import { readFileSync } from "node:fs";

const ROOT = process.cwd();
let pass = 0, fail = 0;
const fails = [];
function ok(desc, cond) {
  if (cond) { pass++; console.log(`  ✓ ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  ✗ ${desc}`); }
}
function read(p) {
  try { return readFileSync(`${ROOT}/${p}`, "utf8"); }
  catch { return ""; }
}
// Yorumları çıkar (docstring'lerdeki eski/örnek requireModuleAccess yanlış eşleşmesin).
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

console.log("HD ADMIN KNOWLEDGE ISOLATION — statik sözleşme\n");

// ── A. Guard helper ──────────────────────────────────────────────────────────
console.log("A. requireAdminUserRequest guard (server-side admin kapısı)");
const guardSrc = strip(read("lib/auth/userGuard.ts"));
ok("A1 requireAdminUserRequest export edilir", /export async function requireAdminUserRequest/.test(guardSrc));
ok("A2 verifyUserRequest binding üzerine kurulur (token↔user)", /requireAdminUserRequest[\s\S]{0,400}verifyUserRequest\(/.test(guardSrc));
ok("A3 role !== 'admin' → 403 fail-closed", /role\s*!==\s*"admin"[\s\S]{0,200}status:\s*403/.test(guardSrc));
ok("A4 403 no-store (cache sızıntısı yok)", /role\s*!==\s*"admin"[\s\S]{0,320}no-store/.test(guardSrc));

// ── B. Canonical read API admin-only ─────────────────────────────────────────
console.log("\nB. Canonical Bilgi Bankası API (groups/entity/chart-knowledge)");
const bilgi = strip(read("app/api/hd/bilgi-bankasi/route.ts"));
ok("B1 requireAdminUserRequest ile korunur", /requireAdminUserRequest\(\s*req\s*\)/.test(bilgi));
ok("B2 zayıf modül kapısı (requireModuleAccess) KULLANILMAZ", !/requireModuleAccess\(/.test(bilgi));
ok("B3 yalnız GET (mutation yok)", /export async function GET/.test(bilgi) && !/export async function (POST|PUT|PATCH|DELETE)/.test(bilgi));
ok("B4 3 canonical resource'u da tek admin-gate arkasında (groups+entity+chart-knowledge)",
  bilgi.includes('"groups"') && bilgi.includes('"entity"') && bilgi.includes('"chart-knowledge"') &&
  (bilgi.match(/requireAdminUserRequest\(/g) || []).length === 1);

// ── C. Profesyonel canonical Word — HD uzmanlarına açık, donmuş snapshot sınırı ──
console.log("\nC. Profesyonel (canonical) Word — üret + indir (uzman + admin; donmuş snapshot)");
const create = strip(read("app/api/hd/reports/professional/route.ts"));
const download = strip(read("app/api/hd/reports/professional/download/route.ts"));
const service = strip(read("lib/human-design/reporting/reportSnapshotService.ts"));
const snapshotSrc = strip(read("lib/human-design/reporting/reportSnapshot.ts"));
ok("C1 create requireModuleAccess(req, \"human_design\") (uzman+admin; admin-only DEĞİL) + demo 403 + rate limit",
  /requireModuleAccess\(\s*req\s*,\s*"human_design"\s*\)/.test(create) && !/requireAdminUserRequest\(/.test(create) &&
  /is_demo_account[\s\S]{0,200}403/.test(create) && /checkRateLimit\(/.test(create));
ok("C2 download requireModuleAccess(req, \"human_design\") + tenant-scoped donmuş snapshot + owned görsel",
  /requireModuleAccess\(\s*req\s*,\s*"human_design"\s*\)/.test(download) && !/requireAdminUserRequest\(/.test(download) &&
  /getCanonicalReportForDownload\(\s*guard\.db\s*,\s*guard\.tenantId/.test(download) && /isOwnedChartImagePath/.test(download) &&
  !/canonicalReadService|getPublishedRecordsByKeys/.test(download));
ok("C3 create canonical snapshot embed'i (reportSnapshotService) guard'dan SONRA",
  /requireModuleAccess[\s\S]*createReportSnapshotFromChart/.test(create));
ok("C4 uzman modu: onMissing 'omit' (admin 'throw' fail-loud) + uzman hatasında anahtarsız mesaj",
  /onMissing:\s*isAdmin\s*\?\s*"throw"\s*:\s*"omit"/.test(create) && /HD_REPORT_UNPUBLISHED_MESSAGE/.test(create) &&
  /omitMode/.test(snapshotSrc) && /HD_REPORT_UNPUBLISHED_MESSAGE/.test(snapshotSrc));
ok("C5 anti-scrape: >26 benzersiz kapı → canonical okuma ÖNCESİ dostane red",
  /HD_REPORT_MAX_UNIQUE_GATES\s*=\s*26/.test(service) &&
  service.indexOf("countUniqueChartGates(chart.gates") > -1 &&
  service.indexOf("countUniqueChartGates(chart.gates") < service.indexOf("getPublishedRecordsByKeys(db"));

// ── D. Tek sızıntı yüzeyi: başka non-admin route canonical okumaz ─────────────
console.log("\nD. Canonical okuma yüzeyi kapalı (yalnız admin-gated route'lar)");
// canonicalReadService yalnız: bilgi-bankasi (admin) + admin/hd/* (verifyAdminRequest)
// tarafından çağrılmalı. reportSnapshotService yalnız professional (admin) tarafından.
const knowledgeRoute = strip(read("app/api/hd/knowledge/route.ts"));
ok("D1 /api/hd/knowledge canonical read servisi İMPORT ETMEZ (yalnız tenant knowledge_records)",
  !/canonicalReadService|getPublishedEntityDetail|getPublishedContentByKeys|listPublishedGroup/.test(knowledgeRoute));
// Yeni sözleşme: canonical okuma yalnız (a) admin-gated bilgi-bankası route'u ve (b) donmuş
// snapshot üreten servis (yalnız professional create route'u çağırır). Liste/detay JSON
// projeksiyonu snapshot/canonical_provenance TAŞIMAZ (canonical metin JSON'la sızmaz).
const persistSrc = strip(read("lib/human-design/api/reportPersistence.ts"));
const reportsRoute = strip(read("app/api/hd/reports/route.ts"));
ok("D2 reportSnapshotService yalnız professional create route'undan çağrılır + liste/detay projeksiyonu snapshot'sız",
  /createReportSnapshotFromChart/.test(create) &&
  !/createReportSnapshotFromChart|reportSnapshotService/.test(reportsRoute) &&
  /HD_REPORT_HIDDEN_COLUMNS\s*=\s*\["snapshot",\s*"canonical_provenance"\]/.test(persistSrc) &&
  /export async function listReportsWithClients[\s\S]*?stripReportSecrets\(/.test(persistSrc) &&
  /export async function getReportById[\s\S]*?stripReportSecrets\(/.test(persistSrc));

// ── E. Client empty-state + buton gizleme (savunma katmanı; server yeterli) ──
console.log("\nE. İstemci: non-admin canonical empty-state + Professional Word (uzmana açık, Android gizli)");
const bilgiPage = strip(read("app/human-design/bilgi-bankasi/page.tsx"));
// P1-4 (HD satış öncesi kapanış): non-admin artık yanıltıcı boş durum yerine KENDİ Bilgi Bankası
// çalışma alanını (human_design_knowledge_records) görür; merkezî canonical corpus yine KAPALI (E2).
ok("E1 Bilgi Bankası sayfası non-admin → kişisel çalışma alanı (canonical DEĞİL)",
  /!isAdmin\s*\?[\s\S]{0,120}HdKnowledgeWorkspace/.test(bilgiPage) && /if \(!admin\)[\s\S]{0,160}return;/.test(bilgiPage));
ok("E2 non-admin canonical fetch ÇAĞIRMAZ (fetchCanonicalGroups import edilmez)",
  !/fetchCanonicalGroups/.test(bilgiPage));
const wordBtn = strip(read("app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx"));
ok("E3 Professional Word butonu uzmana açık (admin gate YOK) + Android'de render edilmez",
  !/isAdminUser\(/.test(wordBtn) && /if\s*\(\s*isAndroid\s*\)\s*return null/.test(wordBtn));
const raporList = strip(read("app/human-design/kayitli-raporlar/components/HdRaporListesi.tsx"));
ok("E4 Kayıtlı Raporlar: canonical Word İndir uzmana açık (yalnız Android gizli)",
  /isCanonical\s*\?[\s\S]{0,700}!isAndroid\s*\?/.test(raporList) && !/isCanonical\s*\?[\s\S]{0,700}isAdmin\s*&&/.test(raporList));
const reader = strip(read("app/human-design/kayitli-haritalar/components/HdPersonalKnowledgePanel.tsx"));
ok("E5 Chart Reader paneli: non-admin (locked) → empty-state (admin prose YOK)",
  /state\.locked/.test(reader) && /oluşturulmamış/.test(read("app/human-design/kayitli-haritalar/components/HdPersonalKnowledgePanel.tsx")));
const canonicalView = strip(read("app/human-design/bilgi-bankasi/canonical/[entityKey]/CanonicalEntityView.tsx"));
ok("E6 Canonical detay (direct URL): non-admin locked → KnowledgeEmpty",
  /locked\s*\?[\s\S]{0,160}KnowledgeEmpty/.test(canonicalView));

console.log(`\n====================================================`);
console.log(`SONUÇ: ${pass} geçti, ${fail} kaldı`);
console.log(`====================================================`);
if (fail > 0) { console.log("KALANLAR:"); fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
