#!/usr/bin/env node
/**
 * Shared-Library Kaldırma / Aromaterapi Yağları Snapshot — birleşik harness.
 *
 * Salt-okuma, DB'siz, bağımsız kaynak-seviyesi değişmez (invariant) doğrulaması.
 * Amaç: "Uzman tarafında shared/canonical readonly kütüphane yok" + "Aromaterapi
 * yağları admin→uzman bağımsız snapshot modeline geçti" hedeflerini kod düzeyinde
 * kanıtlamak. Sapmada exit 1.
 *
 * Çalıştırma:  node scripts/shared-library-removal/harness.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); }
}

// Kaynak dosyalar
const oilsRoute = read("app/api/aromaterapi/oils/route.ts");
const oilIdRoute = read("app/api/aromaterapi/oils/[id]/route.ts");
const transfer = read("app/api/admin/veri-paylasimi/transfer/route.ts");
const adminOils = read("app/api/admin/aromaterapi/oils/route.ts");
const oilFields = read("lib/aromaterapi/oilFields.ts");
const dataLib = read("lib/aromaterapi/aromatherapyData.ts");
const clientTransfer = read("lib/admin/veriPaylasimiTransfer.ts");
const adminUi = read("app/admin/veri-paylasimi/page.tsx");
const oilsPage = read("app/aromaterapi/_components/OilsPage.tsx");
const detailPage = read("app/aromaterapi/yaglar/[id]/page.tsx");
const migration = read(
  "supabase/migrations/20260927000000_aromatherapy_oils_transfer_provenance.sql",
);
// Taş Bilgi Kütüphanesi (stone_knowledge_articles) kaynakları
const knowledgeRoute = read("app/api/dogaltas/knowledge/route.ts");
const adminKnowledge = read("app/api/admin/dogaltas/knowledge/route.ts");
const knowledgePage = read("app/dogaltas/tas-bilgi-kutuphanesi/page.tsx");
const knowledgeReport = read("app/api/dogaltas/knowledge-report/route.ts");
const wordReport = read("app/api/dogaltas/word-report/route.ts");
const migration2 = read(
  "supabase/migrations/20260928000000_stone_knowledge_articles_transfer_provenance.sql",
);

// ── A) Shared görünüm kaldırma — uzman okuma yalnız kendi tenant ──────────────
check("A1 oils GET null-union kaldırıldı", !oilsRoute.includes("tenant_id.is.null"));
check("A2 oils/[id] GET null-union kaldırıldı", !oilIdRoute.includes("tenant_id.is.null"));
check("A3 oils list .eq(tenant_id) kullanıyor", oilsRoute.includes('.eq("tenant_id", tenantId)'));
check("A4 oils/[id] GET .eq(tenant_id) kullanıyor", oilIdRoute.includes('.eq("tenant_id", tenantId)'));
// count/names/list 3 okuma yolunun hepsi own-tenant (tenantOr sabiti tamamen gitti)
check("A5 eski tenantOr sabiti kaldırıldı", !oilsRoute.includes("tenantOr"));
check("A6 oils GET verifyUserRequest guard'lı", oilsRoute.includes("verifyUserRequest"));

// ── B) Snapshot registry — 3 aromaterapi grubu, kanonik null kaynak ──────────
for (const [key, type] of [
  ["aromatherapy_oils_essential", "essential"],
  ["aromatherapy_oils_carrier", "carrier"],
  ["aromatherapy_oils_maceration", "maceration"],
]) {
  check(`B:${key} REGISTRY'de`, transfer.includes(key));
  check(`B:${key} oil_type=${type}`, transfer.includes(`matchValue: "${type}"`));
}
check("B canonical_null source modu", transfer.includes('sourceMode: "canonical_null"'));
check("B aromatherapy_oils tablosu registry'de", transfer.includes('table: "aromatherapy_oils"'));
check("B copyFields OIL_COPY_FIELDS", transfer.includes("copyFields: OIL_COPY_FIELDS"));
check("B requireField name", transfer.includes('requireField: "name"'));
check("B activeOnly true (soft-inactive kopyalanmaz)", transfer.includes("activeOnly: true"));
check("B cloneGroup canonical_null → .is(tenant_id,null)", transfer.includes('.is("tenant_id", null)'));
check("B matchColumn eq uygulanıyor", transfer.includes("readQ.eq(cfg.matchColumn, cfg.matchValue)"));

// ── C) Duplicate / no-upsert — yalnız INSERT ─────────────────────────────────
check("C upsert YOK", !transfer.includes(".upsert("));
check("C onConflict option YOK", !/onConflict\s*:/.test(transfer));
check("C insert var", transfer.includes(".insert("));

// ── D) Kopya alanları — provenance/id/tenant taşınmaz ────────────────────────
check("D OIL_COPY_FIELDS export", oilFields.includes("export const OIL_COPY_FIELDS"));
// Alan tanım bölgesini (OIL_STRING_FIELDS + OIL_ARRAY_FIELDS + OIL_COPY_FIELDS) izole et.
const fieldDefsRegion = oilFields.slice(
  oilFields.indexOf("const OIL_STRING_FIELDS"),
  oilFields.indexOf("] as const;", oilFields.indexOf("export const OIL_COPY_FIELDS")) + 10,
);
for (const forbidden of ["tenant_id", "created_at", "updated_at", "origin_type", "origin_label"]) {
  // OIL_COPY_FIELDS yalnız iş alanları içermeli — teknik/provenance alanları YOK.
  check(`D copy alanları "${forbidden}" içermez`, !fieldDefsRegion.includes(`"${forbidden}"`));
}
// Provenance damgalama transfer route'ta
check("D provenance origin_type=admin_transfer", transfer.includes('copy.origin_type = "admin_transfer"'));
check("D provenance origin_source_id kaynak id", transfer.includes("copy.origin_source_id ="));
check("D provenance batch_id damgalanır", transfer.includes("copy.origin_transfer_batch_id = batchId"));
check("D copy.tenant_id = targetTenantId", transfer.includes("copy.tenant_id = targetTenantId"));

// ── E) Güvenlik — admin endpoint + registry allowlist ────────────────────────
check("E admin oils endpoint verifyAdminRequest", adminOils.includes("verifyAdminRequest"));
check("E admin oils yalnız kanonik null okur", adminOils.includes('.is("tenant_id", null)'));
check("E admin oils tip allowlist", adminOils.includes("VALID_TYPES"));
check("E admin oils salt-okuma (insert/update/delete yok)",
  !adminOils.includes(".insert(") && !adminOils.includes(".update(") && !adminOils.includes(".delete("));
check("E transfer hedef yalnız expert", transfer.includes('!== "expert"'));
check("E transfer ham DB mesajı sızmaz (genel hata)", transfer.includes("Aktarım tamamlanamadı"));
check("E dinamik tablo adı yok (isGroupKey allowlist)", transfer.includes("isGroupKey"));

// ── F) P4 regression — 11 orijinal grup korunur ──────────────────────────────
for (const key of [
  "stones", "minerals", "combinations",
  "bioenergy_symbols", "bioenergy_imaginations", "bioenergy_chakras",
  "bioenergy_energy_bodies", "bioenergy_subconscious_causes",
  "reflexology_protocols",
  "numerology_knowledge_records", "numerology_stone_assignments",
]) {
  check(`F P4 grubu korunur: ${key}`, transfer.includes(key));
}

// ── G) İstemci tip senkronu — 3 yeni anahtar ─────────────────────────────────
for (const key of [
  "aromatherapy_oils_essential", "aromatherapy_oils_carrier", "aromatherapy_oils_maceration",
]) {
  check(`G TransferGroupKey/counts: ${key}`, clientTransfer.includes(key));
}
check("G aromaterapi başarı satırı", clientTransfer.includes("Aromaterapi yağ"));
check("G sumAromatherapyOilCounts export", clientTransfer.includes("export function sumAromatherapyOilCounts"));

// ── H) Provenance ETİKETİ KALDIRILDI — uzman UI (ürün kararı 2026-08-11) ──────
// Görsel/tekst provenance rozeti GÖSTERİLMEZ; ama backend provenance verisi +
// snapshot mantığı + edit/delete KORUNUR.
const badgeComponent = read("components/provenance/AdminTransferBadge.tsx");
check("H1 isAdminTransferOil helper kaldırıldı", !dataLib.includes("export function isAdminTransferOil"));
check("H2 ADMIN_TRANSFER_BADGE kaldırıldı", !dataLib.includes("ADMIN_TRANSFER_BADGE"));
check("H3 'Adminden Gelen Bilgi' metni yok (dataLib)", !dataLib.includes("Adminden Gelen Bilgi"));
check("H4 OilListRow origin_type ALANI KORUNDU", dataLib.includes('| "origin_type"'));
check("H5 OIL_LIST_SELECT origin_type KORUNDU (contract)", oilFields.includes("origin_type"));
check("H6 OilsPage provenance rozeti kaldırıldı",
  !oilsPage.includes("isAdminTransferOil(row)") && !oilsPage.includes("ADMIN_TRANSFER_BADGE"));
check("H7 detay provenance rozeti/banner kaldırıldı",
  !detailPage.includes("ADMIN_TRANSFER_BADGE") && !detailPage.includes("isAdminTransfer"));
check("H8 merkezî AdminTransferBadge null render eder",
  /return null;/.test(badgeComponent) && !badgeComponent.includes("🎁"));
check("H9 merkezî bileşen çağrı kontratı korundu (Props)", badgeComponent.includes("type Props"));

// ── I) Kütüphane framing kaldırıldı — uzman UI ───────────────────────────────
check("I detay 'Paylaşımlı' rozeti kaldırıldı", !detailPage.includes("🔒 Paylaşımlı"));
check("I detay isSharedContent kaldırıldı", !detailPage.includes("isSharedContent"));
check("I detay copy-on-write handleCopy kaldırıldı", !detailPage.includes("handleCopy"));

// ── J) Admin UI — aromaterapi granular seçim aktif ───────────────────────────
check("J admin UI aromaterapi aktif (Uçucu)", adminUi.includes('key: "aromatherapy_oils_essential"'));
check("J admin UI 'Yakında' placeholder kaldırıldı (oils active)",
  !adminUi.includes('Projede Supabase tablosu henüz bağlı değil'));
check("J admin UI granular anahtar seti genişledi",
  adminUi.includes("aromatherapy_oils_essential") &&
  adminUi.includes("aromatherapy_oils_carrier") &&
  adminUi.includes("aromatherapy_oils_maceration"));
check("J admin UI oils tip haritası", adminUi.includes("OIL_KEY_TO_TYPE"));

// ── K) Migration — additive + güvenli ────────────────────────────────────────
check("K migration provenance kolonları", migration.includes("ADD COLUMN IF NOT EXISTS origin_type"));
check("K migration CHECK guard", migration.includes("aromatherapy_oils_origin_type_chk"));
check("K migration partial index", migration.includes("idx_aromatherapy_oils_transfer_batch"));
check("K migration RLS/grant zayıflatmaz", !migration.includes("GRANT") && !migration.includes("DISABLE ROW LEVEL"));
check("K migration DROP TABLE/COLUMN yok", !/DROP\s+(TABLE|COLUMN)/i.test(migration));
check("K migration mass backfill yok (UPDATE/INSERT ... SELECT yok)",
  !/\bUPDATE\s+public\./i.test(migration) && !/INSERT\s+INTO/i.test(migration));

// ── L) Taş Bilgi Kütüphanesi (stone_knowledge_articles) — snapshot dönüşümü ────
check("L1 knowledge GET own-only (.eq tenant_id)", knowledgeRoute.includes('.eq("tenant_id", tenantId)'));
check("L2 knowledge ADMIN_LIBRARY import/kullanımı kaldırıldı",
  !knowledgeRoute.includes("import { ADMIN_LIBRARY_TENANT_ID }") &&
  !knowledgeRoute.includes("[ADMIN_LIBRARY_TENANT_ID]"));
check("L3 knowledge GET .in(tenant_id,tenantIds) union kaldırıldı", !knowledgeRoute.includes('.in("tenant_id", tenantIds)'));
check("L4 knowledge SELECT origin_type çeker", knowledgeRoute.includes("origin_type"));
check("L5 registry stone_knowledge_articles", transfer.includes("stone_knowledge_articles"));
check("L6 registry admin_library source modu", transfer.includes('sourceMode: "admin_library"'));
check("L7 cloneGroup admin_library → ADMIN_LIBRARY_TENANT_ID okur",
  transfer.includes('.eq("tenant_id", ADMIN_LIBRARY_TENANT_ID)'));
check("L8 KNOWLEDGE_COPY_FIELDS tanımlı", transfer.includes("KNOWLEDGE_COPY_FIELDS"));
check("L9 knowledge requireField title", transfer.includes('requireField: "title"'));
check("L10 hedef ADMIN_LIBRARY olamaz guard", transfer.includes("Hedef, admin kütüphane tenant"));
// Admin okuma ucu
check("L11 admin knowledge endpoint verifyAdminRequest", adminKnowledge.includes("verifyAdminRequest"));
check("L12 admin knowledge ADMIN_LIBRARY okur", adminKnowledge.includes("ADMIN_LIBRARY_TENANT_ID"));
check("L13 admin knowledge salt-okuma", !adminKnowledge.includes(".insert(") && !adminKnowledge.includes(".delete("));
// İstemci senkron
check("L14 TransferGroupKey stone_knowledge_articles", clientTransfer.includes("stone_knowledge_articles"));
check("L15 Taş bilgi başarı satırı", clientTransfer.includes("Taş bilgi"));
// Admin UI
check("L16 admin UI stone_knowledge_articles aktif", adminUi.includes('key: "stone_knowledge_articles"'));
check("L17 admin UI granular knowledge anahtarı", adminUi.includes('key === "stone_knowledge_articles"'));
check("L18 admin UI 'Henüz tenant tablosu' placeholder kaldırıldı",
  !adminUi.includes("Henüz tenant tablosu tanımlı değil"));
// Uzman UI provenance — veri KORUNUR, görsel ETİKET KALDIRILDI
check("L19 knowledge Article origin_type alanı KORUNDU", knowledgePage.includes("origin_type"));
check("L20 knowledge provenance rozeti KALDIRILDI", !knowledgePage.includes("Adminden Gelen Bilgi"));
check("L21 knowledge 'kütüphane kaydı atlandı' framing kaldırıldı",
  !knowledgePage.includes("kütüphane kaydı atlandı"));
// Migration
check("L22 migration2 provenance kolonları", migration2.includes("ADD COLUMN IF NOT EXISTS origin_type"));
check("L23 migration2 CHECK guard", migration2.includes("stone_knowledge_articles_origin_type_chk"));
check("L24 migration2 additive (DROP yok)", !/DROP\s+(TABLE|COLUMN)/i.test(migration2));
check("L25 migration2 mass backfill yok", !/INSERT\s+INTO/i.test(migration2) && !/\bUPDATE\s+public\./i.test(migration2));
// Rapor tutarlılığı — admin kütüphanesi rapora da UNION edilmez
check("L26 knowledge-report own-only", !knowledgeReport.includes("ADMIN_LIBRARY_TENANT_ID"));
check("L27 knowledge-report .eq(tenant_id)", knowledgeReport.includes('.eq("tenant_id", tenantId)'));
check("L28 word-report knowledge own-only", !wordReport.includes("ADMIN_LIBRARY_TENANT_ID"));

// ── M) Global sözleşme — P4 + aromaterapi regresyon korunur ───────────────────
check("M1 admin_library import (syntheticTenants)", transfer.includes("ADMIN_LIBRARY_TENANT_ID"));
check("M2 P4 11 tablo + 3 oil + knowledge = registry bütünlüğü",
  ["stones","minerals","combinations","reflexology_protocols",
   "aromatherapy_oils_essential","stone_knowledge_articles"].every((k) => transfer.includes(k)));
check("M3 aromaterapi oils own-only korunuyor (regresyon)", !oilsRoute.includes("tenant_id.is.null"));

// ── Sonuç ────────────────────────────────────────────────────────────────────
console.log(`\nshared-library-removal harness: ${pass} PASS / ${fail} FAIL (toplam ${pass + fail})`);
if (fail > 0) {
  console.error("\nBAŞARISIZ kontroller:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("OVERALL = PASS");
