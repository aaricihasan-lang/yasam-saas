/**
 * HD-P2-A — Tenant kapsam primitive'i + invariant NEGATİF regresyon harness'i.
 *
 * Çalıştırma:  npx tsx scripts/hd-presale-hardening/tenant-scope.harness.ts
 *
 * Gerçek DB'ye YAZMAZ — saf birim testleri:
 *   • assertTenantId fail-closed (boş/blank/null/undefined/non-string → fırlatır).
 *   • withTenant, verilen builder'a HER ZAMAN `.eq("tenant_id", tenantId)` enjekte eder.
 *   • tenantInsertPayload tenant_id'yi enjekte eder ve client'ın gönderdiğini EZER (mass-assignment).
 *   • withTenant tenant_id yoksa filtre uygulamadan (fail-closed) fırlatır.
 */
import {
  assertTenantId,
  withTenant,
  tenantInsertPayload,
} from "../../lib/human-design/api/tenantScope";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean): void {
  if (cond) passed++;
  else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name);
  }
}

// Zincirlenebilir kayıt-eden sahte Supabase query builder.
type Rec = { table: string; op: string; eqs: Array<[string, unknown]>; payload?: unknown; vals?: unknown };
function recorder() {
  const log: Rec[] = [];
  const db = {
    from(table: string) {
      const rec: Rec = { table, op: "", eqs: [] };
      log.push(rec);
      const chain: Record<string, unknown> = {};
      const self = chain as unknown as {
        select: (c?: unknown, o?: unknown) => typeof self;
        insert: (p: unknown) => typeof self;
        update: (v: unknown) => typeof self;
        delete: () => typeof self;
        eq: (c: string, v: unknown) => typeof self;
        or: () => typeof self;
        in: () => typeof self;
        order: () => typeof self;
        maybeSingle: () => typeof self;
        single: () => typeof self;
      };
      Object.assign(chain, {
        // İlk çağrılan op kazanır: update/delete sonrası gelen `.select("id")` projeksiyonu op'u EZMEZ.
        select: (_c?: unknown, _o?: unknown) => { if (!rec.op) rec.op = "select"; return self; },
        insert: (p: unknown) => { rec.op = "insert"; rec.payload = p; return self; },
        update: (v: unknown) => { rec.op = "update"; rec.vals = v; return self; },
        delete: () => { rec.op = "delete"; return self; },
        eq: (c: string, v: unknown) => { rec.eqs.push([c, v]); return self; },
        or: () => self,
        in: () => self,
        order: () => self,
        maybeSingle: () => self,
        single: () => self,
      });
      return self;
    },
  };
  return { db, log };
}

function hasTenantEq(rec: Rec, tid: string): boolean {
  return rec.eqs.some(([c, v]) => c === "tenant_id" && v === tid);
}

function throws(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function main(): void {
  console.log("HD-P2-A tenant-scope harness\n");

  // ── A. assertTenantId fail-closed ─────────────────────────────────────────
  console.log("A. assertTenantId (fail-closed invariant)");
  ok("boş string → fırlatır", throws(() => assertTenantId("", "t")));
  ok("yalnız boşluk → fırlatır", throws(() => assertTenantId("   ", "t")));
  ok("null → fırlatır", throws(() => assertTenantId(null, "t")));
  ok("undefined → fırlatır", throws(() => assertTenantId(undefined, "t")));
  ok("sayı → fırlatır", throws(() => assertTenantId(123 as unknown, "t")));
  ok("geçerli uuid → geçer", !throws(() => assertTenantId("11111111-1111-1111-1111-111111111111", "t")));

  // ── B. withTenant tenant filtresini HER ZAMAN enjekte eder ────────────────
  console.log("\nB. withTenant tenant_id filtresini enjekte eder");
  const TID = "tenant-abc";
  {
    const { db, log } = recorder();
    withTenant(db.from("human_design_clients").select("*"), TID, "select").eq("id", "x").maybeSingle();
    ok("select: op=select", log[0]!.op === "select");
    ok("select: tenant_id eq enjekte edildi", hasTenantEq(log[0]!, TID));
  }
  {
    const { db, log } = recorder();
    withTenant(db.from("human_design_reports").select("id", { count: "exact", head: true }), TID, "select.count").eq("client_id", "c1");
    ok("select(count): tenant_id eq enjekte edildi", hasTenantEq(log[0]!, TID));
  }
  {
    const { db, log } = recorder();
    withTenant(db.from("human_design_charts").update({ notes: "n" }), TID, "update").eq("id", "x").select("id");
    ok("update: op=update", log[0]!.op === "update");
    ok("update: tenant_id eq enjekte edildi", hasTenantEq(log[0]!, TID));
  }
  {
    const { db, log } = recorder();
    withTenant(db.from("human_design_reports").delete(), TID, "delete").eq("client_id", "c1");
    ok("delete: op=delete", log[0]!.op === "delete");
    ok("delete: tenant_id eq enjekte edildi", hasTenantEq(log[0]!, TID));
  }

  // ── C. withTenant boş tenant'ta fail-closed (filtre uygulanmadan fırlatır) ─
  console.log("\nC. Boş tenant → withTenant fail-closed");
  {
    const { db, log } = recorder();
    ok("withTenant('') fırlatır", throws(() => withTenant(db.from("t").select("*"), "", "ctx")));
    // Builder kuruldu ama tenant filtresi UYGULANMADI (assert önce fırlar).
    ok("boş tenant'ta tenant_id eq eklenmedi", log.length === 0 || !hasTenantEq(log[0]!, ""));
  }
  ok("withTenant(null) fırlatır", throws(() => withTenant(recorder().db.from("t").delete(), null as unknown as string, "ctx")));
  ok("withTenant(undefined) fırlatır", throws(() => withTenant(recorder().db.from("t").update({}), undefined as unknown as string, "ctx")));

  // ── D. tenantInsertPayload — tenant_id enjekte + client override EZİLİR ───
  console.log("\nD. tenantInsertPayload (mass-assignment koruması)");
  {
    const p = tenantInsertPayload(TID, { name: "x", user_id: "u1", tenant_id: "EVIL-TENANT" } as Record<string, unknown>);
    ok("tenant_id doğru enjekte edildi", p.tenant_id === TID);
    ok("client'ın gönderdiği tenant_id EZİLDİ", p.tenant_id !== "EVIL-TENANT");
    ok("diğer alanlar korunur", p.name === "x" && p.user_id === "u1");
  }
  ok("tenantInsertPayload('') fırlatır", throws(() => tenantInsertPayload("", { name: "x" })));

  console.log(`\n${passed} geçti, ${failed} başarısız`);
  if (failed > 0) {
    console.log("Başarısızlar:\n - " + fails.join("\n - "));
    process.exit(1);
  }
}

main();
