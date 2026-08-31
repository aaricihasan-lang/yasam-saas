/**
 * HD ADMIN KNOWLEDGE ISOLATION — statik sözleşme harness'ı (DB'SİZ, SALT-OKUMA).
 * =============================================================================
 *
 * Sözleşme: Human Design modülü uzmanlara AÇIK kalır (chart/client/compute + kendi
 * knowledge_records'ları), ANCAK admin/owner'a ait MERKEZÎ CANONICAL bilgi corpus'u
 * (112/112 + kaynaklar + evidence + Reader prose + profesyonel canonical Word) yalnız
 * role==='admin' için servis edilir. Non-admin → server 403 + client empty-state.
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

// ── C. Profesyonel canonical Word admin-only ─────────────────────────────────
console.log("\nC. Profesyonel (canonical) Word — üret + indir");
const create = strip(read("app/api/hd/reports/professional/route.ts"));
const download = strip(read("app/api/hd/reports/professional/download/route.ts"));
ok("C1 create requireAdminUserRequest", /requireAdminUserRequest\(\s*req\s*\)/.test(create) && !/requireModuleAccess\(/.test(create));
ok("C2 download requireAdminUserRequest", /requireAdminUserRequest\(\s*req\s*\)/.test(download) && !/requireModuleAccess\(/.test(download));
ok("C3 create canonical snapshot embed'i (reportSnapshotService) guard'dan SONRA",
  /requireAdminUserRequest[\s\S]*createReportSnapshotFromChart/.test(create));

// ── D. Tek sızıntı yüzeyi: başka non-admin route canonical okumaz ─────────────
console.log("\nD. Canonical okuma yüzeyi kapalı (yalnız admin-gated route'lar)");
// canonicalReadService yalnız: bilgi-bankasi (admin) + admin/hd/* (verifyAdminRequest)
// tarafından çağrılmalı. reportSnapshotService yalnız professional (admin) tarafından.
const knowledgeRoute = strip(read("app/api/hd/knowledge/route.ts"));
ok("D1 /api/hd/knowledge canonical read servisi İMPORT ETMEZ (yalnız tenant knowledge_records)",
  !/canonicalReadService|getPublishedEntityDetail|getPublishedContentByKeys|listPublishedGroup/.test(knowledgeRoute));
ok("D2 reportSnapshotService yalnız professional create route'undan çağrılır",
  /createReportSnapshotFromChart/.test(create));

// ── E. Client empty-state + buton gizleme (savunma katmanı; server yeterli) ──
console.log("\nE. İstemci: non-admin empty-state + Professional Word gizli");
const bilgiPage = strip(read("app/human-design/bilgi-bankasi/page.tsx"));
ok("E1 Bilgi Bankası sayfası non-admin → KnowledgeEmpty (locked mesajı DEĞİL)",
  /!isAdmin[\s\S]{0,120}KnowledgeEmpty/.test(bilgiPage));
ok("E2 non-admin canonical fetch ÇAĞIRMAZ (fetchCanonicalGroups import edilmez)",
  !/fetchCanonicalGroups/.test(bilgiPage));
const wordBtn = strip(read("app/human-design/kayitli-haritalar/components/HdProfessionalReportButton.tsx"));
ok("E3 Professional Word butonu non-admin için render edilmez (if (!isAdmin) return null)",
  /isAdminUser\(readYasamUser\(\)\)/.test(wordBtn) && /!isAdmin\)\s*return null/.test(wordBtn));
const raporList = strip(read("app/human-design/kayitli-raporlar/components/HdRaporListesi.tsx"));
ok("E4 Kayıtlı Raporlar: canonical Word İndir yalnız isAdmin",
  /isCanonical\s*\?[\s\S]{0,200}isAdmin\s*\?/.test(raporList));
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
