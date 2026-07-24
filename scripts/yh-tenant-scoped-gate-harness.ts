// Yaşam Hafızası™ — BF-4B: tenant-scope gate harness (saf; DB/ağ YOK).
//
// GERÇEK import ile doğrular:
//   - ValidatedTenantScope taşınamaz kanıt (raw/plain/forged red; gerçek proof PASS; dondurulmuş)
//   - supportsTenantScopedPage (gerçek YH_INDEX_SOURCES: clean-column PASS; shared/join/pii/unclassified/disabled FAIL)
//   - evaluateTenantScope doğruluk tablosu (not-found/inactive/not-ready/demo/mixed-demo/valid/multi/canonical)
//   - validateScopedTenant fake reader (tenants/users hata → validation-unavailable; canonical kısa-devre)
// Fixture UUID'ler kullanılır; GERÇEK production UUID'si GÖMÜLMEZ.
// Çalıştırma:  npx tsx scripts/yh-tenant-scoped-gate-harness.ts

import { ADMIN_LIBRARY_TENANT_ID } from "../lib/tenancy/syntheticTenants";
import { YH_DEMO_TENANT_ID } from "../lib/yasam-hafizasi/config";
import { resolveYhSourceConfig } from "../lib/yasam-hafizasi/indexer/adminIndexRequest";
import {
  canonicalTenantRejection,
  evaluateTenantScope,
  isValidatedTenantScope,
  supportsTenantScopedPage,
  type TenantScopeRows,
} from "../lib/yasam-hafizasi/indexer/tenantScopeGate";
import {
  validateScopedTenant,
  type TenantScopeReader,
} from "../lib/yasam-hafizasi/indexer/supabaseTenantScopeAdapter";

let total = 0;
const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  total += 1;
  if (!cond) errors.push(msg);
}
function J(v: unknown): string {
  return JSON.stringify(v);
}

// ── Fixture UUID'ler (GERÇEK production değeri DEĞİL) ──────────────────────────
const REAL_TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";

function activeTenant(id: string): { id: string; status: unknown } {
  return { id, status: "active" };
}
const readyExpert = { role: "expert", active: true, approval_status: "approved", is_demo_account: false };
const legacyExpert = { role: "expert", active: true, is_demo_account: false }; // onay alanı yok → hazır
const pendingExpert = { role: "expert", active: true, approval_status: "pending", is_demo_account: false };
const rejectedExpert = { role: "expert", active: true, approval_status: "rejected", is_demo_account: false };
const unknownExpert = { role: "expert", active: true, approval_status: "weird", is_demo_account: false };
const adminUser = { role: "admin", active: true, approval_status: "approved", is_demo_account: false };
const demoUser = { role: "expert", active: true, approval_status: "approved", is_demo_account: true };

function rows(tenant: { id: string; status: unknown } | null, users: Array<Record<string, unknown>>): TenantScopeRows {
  return { tenant, users };
}

async function main(): Promise<void> {
  // ══ A — Taşınamaz kanıt (ValidatedTenantScope) ══════════════════════════════
  check(isValidatedTenantScope(REAL_TENANT) === false, "A raw UUID string → kanıt değil");
  check(isValidatedTenantScope({ tenantId: REAL_TENANT }) === false, "A düz nesne → kanıt değil");
  check(isValidatedTenantScope(null) === false, "A null → kanıt değil");
  {
    // Taklit: farklı symbol ile forge → kabul edilmez.
    const forged = { tenantId: REAL_TENANT, [Symbol("yh.validatedTenantScope")]: true };
    check(isValidatedTenantScope(forged) === false, "A forged symbol → kanıt değil");
  }
  {
    const ev = evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [readyExpert]));
    check(ev.ok === true, "A gerçek evaluateTenantScope → ok");
    if (ev.ok) {
      check(isValidatedTenantScope(ev.scope) === true, "A gerçek proof → isValidatedTenantScope true");
      check(ev.scope.tenantId === REAL_TENANT, "A proof.tenantId doğru");
      // Dondurulmuş: mutasyon denemesi tenantId'yi DEĞİŞTİRMEZ.
      try {
        (ev.scope as unknown as { tenantId: string }).tenantId = OTHER_TENANT;
      } catch {
        // strict mode → TypeError; yutulur.
      }
      check(ev.scope.tenantId === REAL_TENANT, "A dondurulmuş proof mutasyona kapalı");
    }
  }

  // ══ B — supportsTenantScopedPage (gerçek kaynaklar) ═════════════════════════
  const symbols = resolveYhSourceConfig("biyoenerji:symbols")!; // clean column
  const knowledge = resolveYhSourceConfig("dogaltas:knowledge")!; // allowSharedNull
  const guideSections = resolveYhSourceConfig("sifa_rehberi:guide-sections")!; // join
  const notes = resolveYhSourceConfig("refleksoloji:notes")!; // pii
  const archives = resolveYhSourceConfig("kisisel_arsiv:archives")!; // unclassified
  check(supportsTenantScopedPage(symbols) === true, "B clean-column → destekli");
  check(supportsTenantScopedPage(knowledge) === false, "B allowSharedNull → desteksiz");
  check(supportsTenantScopedPage(guideSections) === false, "B join → desteksiz");
  check(supportsTenantScopedPage(notes) === false, "B pii → desteksiz");
  check(supportsTenantScopedPage(archives) === false, "B unclassified → desteksiz");
  check(supportsTenantScopedPage({ ...symbols, enabled: false }) === false, "B disabled → desteksiz");

  // ══ C — evaluateTenantScope doğruluk tablosu ═══════════════════════════════
  const fail = (ev: ReturnType<typeof evaluateTenantScope>, code: string, label: string) =>
    check(!ev.ok && ev.code === code, `${label} → ${J(ev)}`);

  fail(evaluateTenantScope(REAL_TENANT, rows(null, [readyExpert])), "tenant-not-found", "C tenant-not-found");
  fail(evaluateTenantScope(REAL_TENANT, rows({ id: REAL_TENANT, status: "passive" }, [readyExpert])), "tenant-inactive", "C tenant-inactive");
  fail(evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [])), "tenant-not-ready", "C not-ready no-user");
  fail(evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [adminUser])), "tenant-not-ready", "C not-ready admin-only");
  fail(evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [pendingExpert])), "tenant-not-ready", "C not-ready pending");
  fail(evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [rejectedExpert])), "tenant-not-ready", "C not-ready rejected");
  fail(evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [unknownExpert])), "tenant-not-ready", "C not-ready unknown");
  {
    const ev = evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [legacyExpert]));
    check(ev.ok === true, "C legacy-undefined onay → ok");
  }
  fail(evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [demoUser])), "tenant-demo", "C tenant-demo (tümü demo)");
  fail(evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [readyExpert, demoUser])), "tenant-mixed-demo", "C tenant-mixed-demo");
  // BAĞLAYICI: hazır uzman + demo user → yine FAIL (demo kapısı önce).
  fail(evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [demoUser, readyExpert])), "tenant-mixed-demo", "C ready+demo yine FAIL");
  {
    const ev = evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [readyExpert]));
    check(ev.ok === true, "C valid → ok");
  }
  {
    const ev = evaluateTenantScope(REAL_TENANT, rows(activeTenant(REAL_TENANT), [readyExpert, legacyExpert]));
    check(ev.ok === true, "C multi-ready → tek ok");
  }
  // Kanonik red (status/users fark etmeksizin).
  check(canonicalTenantRejection(ADMIN_LIBRARY_TENANT_ID) === "tenant-synthetic", "C canonical synthetic");
  check(canonicalTenantRejection(YH_DEMO_TENANT_ID) === "tenant-demo", "C canonical demo");
  check(canonicalTenantRejection(REAL_TENANT) === null, "C canonical gerçek → null");
  fail(evaluateTenantScope(ADMIN_LIBRARY_TENANT_ID, rows(activeTenant(ADMIN_LIBRARY_TENANT_ID), [readyExpert])), "tenant-synthetic", "C synthetic override");
  fail(evaluateTenantScope(YH_DEMO_TENANT_ID, rows(activeTenant(YH_DEMO_TENANT_ID), [readyExpert])), "tenant-demo", "C demo override");

  // ══ D — validateScopedTenant (fake reader) ══════════════════════════════════
  const failingReader: TenantScopeReader = {
    read: async () => ({ ok: false, code: "tenant-scope-validation-unavailable" }),
  };
  {
    const r = await validateScopedTenant(REAL_TENANT, failingReader);
    check(!r.ok && r.code === "tenant-scope-validation-unavailable", "D tenants/users hata → unavailable");
  }
  {
    // Kanonik kısa-devre: reader ÇAĞRILMAZ.
    let called = 0;
    const spyReader: TenantScopeReader = {
      read: async () => {
        called += 1;
        return { ok: true, rows: rows(activeTenant(ADMIN_LIBRARY_TENANT_ID), [readyExpert]) };
      },
    };
    const r = await validateScopedTenant(ADMIN_LIBRARY_TENANT_ID, spyReader);
    check(!r.ok && r.code === "tenant-synthetic", "D synthetic kısa-devre");
    check(called === 0, "D synthetic → reader çağrılmaz");
  }
  {
    const okReader: TenantScopeReader = {
      read: async () => ({ ok: true, rows: rows(activeTenant(REAL_TENANT), [readyExpert]) }),
    };
    const r = await validateScopedTenant(REAL_TENANT, okReader);
    check(r.ok === true && isValidatedTenantScope((r as { scope: unknown }).scope), "D ok reader → proof");
  }
  {
    const notReadyReader: TenantScopeReader = {
      read: async () => ({ ok: true, rows: rows(activeTenant(REAL_TENANT), [pendingExpert]) }),
    };
    const r = await validateScopedTenant(REAL_TENANT, notReadyReader);
    check(!r.ok && r.code === "tenant-not-ready", "D not-ready reader → tenant-not-ready");
  }

  // ── Sonuç ──
  if (errors.length === 0) {
    console.log("✅ yh-tenant-scoped-gate-harness PASS");
    console.log(`CHECK: ${total} kontrol OK, 0 FAIL.`);
  } else {
    console.error("❌ yh-tenant-scoped-gate-harness FAIL");
    for (const e of errors) console.error("   - " + e);
    console.log(`CHECK: ${total - errors.length} kontrol OK, ${errors.length} FAIL.`);
    process.exitCode = 1;
  }
}

void main();
