// Yaşam Hafızası™ — S2.19-BF/BF-1B-FIX sentetik tenant policy harness (saf; AĞ/DB YOK).
//
// lib/tenancy/syntheticTenants.ts PUBLIC sözleşmesini gerçek import ile doğrular +
// UUID'nin tek-kaynak kuralını (sessionTenant re-export; literal kopya yok) dosya
// metni üzerinden kanıtlar. Gerçek ağ / DB / env erişimi YOKTUR.
// Çalıştırma:  npx tsx scripts/yh-synthetic-tenant-policy-harness.ts

import { readFileSync } from "node:fs";
import * as path from "node:path";

import {
  ADMIN_LIBRARY_TENANT_ID,
  SYNTHETIC_TENANT_IDS,
  isSyntheticTenantId,
} from "../lib/tenancy/syntheticTenants";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

const EXPECTED_UUID = "aa8b960b-f4f1-4e5b-89f5-109bc030c147";
const REAL_TENANT = "11111111-1111-1111-1111-111111111111";

// ═══ A — Sabit ve liste sözleşmesi ═══════════════════════════════════════════
check("1 ADMIN_LIBRARY_TENANT_ID birebir aynı UUID", ADMIN_LIBRARY_TENANT_ID === EXPECTED_UUID);
check("2 SYNTHETIC_TENANT_IDS admin-library içerir", SYNTHETIC_TENANT_IDS.includes(ADMIN_LIBRARY_TENANT_ID));
check("3 SYNTHETIC_TENANT_IDS şimdilik tek eleman", SYNTHETIC_TENANT_IDS.length === 1);
check("4 liste readonly tip (derleme) + Array.isArray", Array.isArray(SYNTHETIC_TENANT_IDS));

// ═══ B — isSyntheticTenantId davranışı ═══════════════════════════════════════
check("5 ADMIN_LIBRARY_TENANT_ID → true", isSyntheticTenantId(ADMIN_LIBRARY_TENANT_ID) === true);
check("6 gerçek tenant UUID → false", isSyntheticTenantId(REAL_TENANT) === false);
check("7 null (shared) → false", isSyntheticTenantId(null) === false);
check("8 boş string → false (belirsiz kimlik sentetik SAYILMAZ)", isSyntheticTenantId("") === false);
// Gizli normalizasyon YOK: exact-match dışına çıkılmaz.
check("9 uppercase varyant → false (trim/lowercase yok)", isSyntheticTenantId(EXPECTED_UUID.toUpperCase()) === false);
check("10 boşluklu varyant → false (trim yok)", isSyntheticTenantId(` ${EXPECTED_UUID} `) === false);

// ═══ C — UUID tek-kaynak kuralı (dosya metni kanıtı) ═════════════════════════
const root = path.join(__dirname, "..");
const tenancySrc = readFileSync(path.join(root, "lib", "tenancy", "syntheticTenants.ts"), "utf8");
const sessionSrc = readFileSync(path.join(root, "lib", "auth", "sessionTenant.ts"), "utf8");

check("11 UUID tanımı tenancy modülünde", tenancySrc.includes(EXPECTED_UUID));
check("12 tenancy modülünün import'u YOK (saf/dependency-free)", !/^\s*import\s/m.test(tenancySrc));
check("13 sessionTenant UUID literalini KOPYALAMAZ", !sessionSrc.includes(EXPECTED_UUID));
check("14 sessionTenant tenancy modülünden re-export eder",
  /export\s*\{\s*ADMIN_LIBRARY_TENANT_ID\s*\}\s*from\s*"@\/lib\/tenancy\/syntheticTenants"/.test(sessionSrc));

console.log("");
console.log("S2.19-BF/BF-1B-FIX sentetik tenant policy harness — saf; AĞ/DB/production YOK.");
console.log(`CHECK: ${passed} kontrol OK, ${failed} FAIL.`);
console.log("- sabit birebir UUID; readonly liste; exact-match (null/boş/case/trim varyantları sentetik DEĞİL)");
console.log("- tek-kaynak: UUID yalnız lib/tenancy/syntheticTenants.ts'te; sessionTenant re-export, literal kopya yok");
if (failed > 0) process.exitCode = 1;
