/**
 * KUPA & HACAMAT — FAZ 1.5 content foundation GÜVENLİK PREFLIGHT (statik).
 *
 * Migration production'a gitmeden ÖNCE repo-seviyesi güvenlik invariant'larını doğrular
 * (DB'ye bağlanmaz). Herhangi biri düşerse exit 1 → apply YAPILMAZ.
 *
 * Çalıştırma:  npx tsx scripts/cupping-content-foundation-preflight.ts
 */
import { readFileSync } from "node:fs";
import { ALL_ACTIVE_GROUP_KEYS } from "../lib/admin/transferRegistry";
import { ALL_TRANSFER_GROUP_KEYS } from "../lib/admin/veriPaylasimiTransfer";

const read = (p: string) => readFileSync(p, "utf8");
let pass = 0;
let fail = 0;
const fails: string[] = [];
function check(cond: boolean, label: string): void {
  if (cond) {
    pass++;
  } else {
    fail++;
    fails.push(label);
    console.log("  ✗", label);
  }
}

const cf = read("supabase/migrations/20261217000000_cupping_content_foundation.sql");
const factory = read("lib/cupping/citationApi.ts");
const transferRoute = read("app/api/admin/veri-paylasimi/transfer/route.ts");
const noComments = cf.replace(/--[^\n]*/g, "");

const CIT = [
  "cupping_point_sources", "cupping_topic_sources", "cupping_point_topic_sources",
  "cupping_technique_sources", "cupping_knowledge_sources", "cupping_safety_sources",
];

console.log("KUPA content-foundation security preflight\n");

// 1. 6 citation tablosu RLS ENABLE
check(/ENABLE ROW LEVEL SECURITY/.test(cf), "6 citation table: RLS ENABLE");
// 2. FORCE RLS false (service-role akışı korunur)
check(!/FORCE ROW LEVEL SECURITY/.test(cf), "FORCE RLS = false (service-role bypass korunur)");
// 3. anon/authenticated CRUD REVOKE
check(/REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM anon, authenticated/.test(cf), "anon/authenticated CRUD REVOKE");
// 4. permissive policy YOK
check(!/CREATE POLICY/.test(cf), "permissive policy YOK (REVOKE-only)");
// 5. composite tenant-safe FK (kaynak)
check(/FOREIGN KEY \(tenant_id, source_id\) REFERENCES public\.cupping_sources \(tenant_id, id\)/.test(cf), "composite FK (tenant,source)→cupping_sources (tenant-safe)");
// 6. composite tenant-safe FK (entity)
check(/FOREIGN KEY \(tenant_id, %2\$I\) REFERENCES public\.%3\$I \(tenant_id, id\)/.test(cf), "composite FK (tenant,entity)→parent (tenant-safe)");
// 7. composite FK hedefi UNIQUE(tenant_id,id) parent'larda
check(/ADD CONSTRAINT %I UNIQUE \(tenant_id, id\)/.test(cf), "parent UNIQUE(tenant_id,id) — composite FK hedefi");
// 8. ON DELETE CASCADE (source + entity)
check((cf.match(/ON DELETE CASCADE/g) ?? []).length >= 2, "ON DELETE CASCADE (source + entity)");
// 9. UNIQUE citation key (duplicate/idempotency)
check(/UNIQUE \(tenant_id, source_id, %2\$I, locator\)/.test(cf), "UNIQUE citation key (duplicate guard)");
// 10. evidence_class CHECK
check(/CHECK \(evidence_class IS NULL OR evidence_class IN/.test(cf), "evidence_class CHECK");
// 11. service-role/server API path + module gate (fabrika)
check(/requireModuleAccess\(\s*req,\s*"cupping"\)/.test(factory), "citation API: requireModuleAccess('cupping') gate");
// 12. tenant server-forced + no raw leak + demo
check(/insertEntity\(db,\s*spec\.table/.test(factory) && !/error\.message/.test(factory) && /is_demo_account/.test(factory),
  "citation API: tenant-forced insert + ham hata sızmaz + demo persist=0");
// 13. varlık doğrulaması (yalnız FK error'una güvenilmez)
check(/assertOwnedRef\(db,\s*CUPPING_TABLES\.sources/.test(factory) && /assertOwnedRef\(db,\s*spec\.entityTable/.test(factory),
  "citation API: çift varlık doğrulaması (source + entity)");
// 14. transfer coverage — 6 junction registry + drift senkron
check(CIT.every((t) => new RegExp(`${t}:\\s*\\{[\\s\\S]*?kind:\\s*"junction"`).test(transferRoute)), "transfer: 6 citation junction REGISTRY'de");
check(CIT.every((t) => (ALL_ACTIVE_GROUP_KEYS as unknown as string[]).includes(t) && (ALL_TRANSFER_GROUP_KEYS as unknown as string[]).includes(t)),
  "transfer drift: 6 citation manifest + helper senkron");
// 15. dependency ordering (point_topic_sources en sonda)
check(/cupping_point_topic_sources:\s*\{[\s\S]*?transferOrder:\s*2/.test(transferRoute), "transfer: point_topic_sources transferOrder=2 (point_topics'ten sonra)");
// 16. destructive DDL YOK
check(!/DROP TABLE|DROP COLUMN/.test(noComments), "additive: destructive DDL YOK");
// 17. mevcut kolon CHECK NOT VALID (apply-safe)
check(/relation_strength[\s\S]{0,160}NOT VALID/.test(cf) && /source_type[\s\S]{0,220}NOT VALID/.test(cf), "mevcut kolon CHECK NOT VALID (apply legacy-safe)");

console.log(`\npreflight: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log("BLOCKED — güvenlik invariant'ı düştü:", fails);
  process.exit(1);
}
console.log("✅ content-foundation security preflight PASS (migration apply öncesi güvenli).");
