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

// ── H) Provenance sunumu — uzman UI ──────────────────────────────────────────
check("H isAdminTransferOil export", dataLib.includes("export function isAdminTransferOil"));
check("H ADMIN_TRANSFER_BADGE export", dataLib.includes("export const ADMIN_TRANSFER_BADGE"));
check("H badge metni 'Adminden Gelen Bilgi'", dataLib.includes("Adminden Gelen Bilgi"));
check("H OilListRow origin_type içerir", dataLib.includes('| "origin_type"'));
check("H OIL_LIST_SELECT origin_type çeker", oilFields.includes("origin_type"));
check("H OilsPage provenance rozeti", oilsPage.includes("isAdminTransferOil(row)"));
check("H detay provenance rozeti", detailPage.includes("isAdminTransfer"));

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

// ── Sonuç ────────────────────────────────────────────────────────────────────
console.log(`\nshared-library-removal harness: ${pass} PASS / ${fail} FAIL (toplam ${pass + fail})`);
if (fail > 0) {
  console.error("\nBAŞARISIZ kontroller:");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("OVERALL = PASS");
