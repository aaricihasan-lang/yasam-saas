// Yaşam Hafızası™ — S2.12C İndeks Smoke izole harness (fake-deps; DB/ağ YOK).
//
// EXACT-OWNED-RECORD dry-run + Model B fail-closed. runIndexSmoke +
// validateSmokeActivation + evaluateSmokeTenantModel + computeTargetFingerprint
// GERÇEK import. Çalıştırma:  npx tsx scripts/yh-index-smoke-harness.ts

import { resolveYhSourceConfig } from "../lib/yasam-hafizasi/indexer/adminIndexRequest";
import {
  computeTargetFingerprint,
  evaluateSmokeTenantModel,
  runIndexSmoke,
  SMOKE_CONFIRMATIONS,
  validateSmokeActivation,
  type ExactRecordResult,
  type SmokeArgs,
  type SmokeDeps,
  type SmokeEnvironment,
} from "../lib/yasam-hafizasi/indexer/indexSmokePlan";

let total = 0;
const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  total += 1;
  if (!cond) errors.push(msg);
}
function J(v: unknown): string {
  return JSON.stringify(v);
}

const KEY = "biyoenerji:symbols";
const TENANT = "11111111-1111-1111-1111-111111111111";
const RECORD = "22222222-2222-2222-2222-222222222222";
const CONTENT_MARKER = "SECRET_CONTENT_MARKER";

function argsFor(env: SmokeEnvironment, over: Partial<SmokeArgs> = {}): SmokeArgs {
  return { execute: true, environment: env, phase: "dry-run", sourceKey: KEY, tenantId: TENANT, testRecordId: RECORD, confirmation: SMOKE_CONFIRMATIONS[env], ...over };
}
function baseArgs(over: Partial<SmokeArgs> = {}): SmokeArgs {
  return argsFor("local", over);
}
// biyoenerji:symbols gerçek şekli; content marker builder'a girer ama özete ÇIKMAZ.
const ownedRow = { id: RECORD, tenant_id: TENANT, title: "Sembol", symbol: "x", meaning: CONTENT_MARKER, source: "kaynak", category: "kat" };

interface Counters { cred: number; demo: number; read: number; lastInput: { config?: unknown; tenantId?: string; recordId?: string; keys: string[] } }
function fakeDeps(opts: {
  creds?: boolean;
  demo?: { ok: true; isDemo: boolean } | { ok: false; code: "demo-check-failed" };
  read?: ExactRecordResult;
  readThrows?: boolean;
} = {}): { deps: SmokeDeps; c: Counters } {
  const c: Counters = { cred: 0, demo: 0, read: 0, lastInput: { keys: [] } };
  const deps: SmokeDeps = {
    hasCredentials: () => { c.cred += 1; return opts.creds ?? true; },
    checkDemoTarget: async () => { c.demo += 1; return opts.demo ?? { ok: true, isDemo: false }; },
    readExactOwnedRecord: async (input) => {
      c.read += 1;
      c.lastInput = { config: input.config, tenantId: input.tenantId, recordId: input.recordId, keys: Object.keys(input).sort() };
      if (opts.readThrows) throw new Error("SECRET_DB_ERROR boom");
      return opts.read ?? { status: "row", row: ownedRow };
    },
  };
  return { deps, c };
}

async function main(): Promise<void> {
  // ═══ Aktivasyon / plan-only ════════════════════════════════════════════════
  {
    const { deps, c } = fakeDeps();
    const o = await runIndexSmoke(baseArgs({ execute: false }), deps);
    check(o.status === "plan-only" && o.code === "dry-run-ready" && c.cred === 0 && c.demo === 0 && c.read === 0, `V plan-only ${J(o)}`);
  }
  const rej = async (over: Partial<SmokeArgs>, code: string) => {
    const { deps, c } = fakeDeps();
    const o = await runIndexSmoke(baseArgs(over), deps);
    check(o.status === "rejected" && o.code === code && c.read === 0, `V ${code} → ${J(o)} read=${c.read}`);
  };
  await rej({ environment: undefined }, "invalid-environment");
  await rej({ confirmation: "WRONG" }, "invalid-confirmation");
  await rej({ phase: "bad" }, "invalid-phase");
  await rej({ sourceKey: "" }, "missing-source-key");
  await rej({ sourceKey: "nope:nope" }, "unknown-source");
  await rej({ tenantId: "not-a-uuid" }, "invalid-tenant");
  await rej({ testRecordId: "bad" }, "invalid-test-record");
  { const { deps } = fakeDeps({ creds: false }); const o = await runIndexSmoke(baseArgs(), deps); check(o.status === "rejected" && o.code === "missing-credentials", `V missing-credentials ${J(o)}`); }

  // ═══ 1 — allowlist dışı source reader'a ulaşmaz ════════════════════════════
  { const { deps, c } = fakeDeps(); const o = await runIndexSmoke(baseArgs({ sourceKey: "dogaltas:stones" }), deps); check(o.code === "source-smoke-not-allowed" && c.read === 0, `T1 ${J(o)} read=${c.read}`); }
  // ═══ 2 — demo tenant reader'a ulaşmaz ══════════════════════════════════════
  { const { deps, c } = fakeDeps({ demo: { ok: true, isDemo: true } }); const o = await runIndexSmoke(baseArgs(), deps); check(o.code === "tenant-demo-disabled" && c.read === 0, `T2 ${J(o)}`); }
  { const { deps, c } = fakeDeps({ demo: { ok: false, code: "demo-check-failed" } }); const o = await runIndexSmoke(baseArgs(), deps); check(o.code === "tenant-demo-disabled" && c.read === 0, `T2b demo-check-fail → tenant-demo-disabled`); }
  // ═══ 3 — reader hem recordId hem tenantId alır ═════════════════════════════
  { const { deps, c } = fakeDeps(); await runIndexSmoke(baseArgs(), deps); check(c.lastInput.tenantId === TENANT && c.lastInput.recordId === RECORD, `T3 reader input ${J(c.lastInput.keys)}`); }
  // ═══ 4 — reader sözleşmesinde page/cursor/limit yok ════════════════════════
  { const { deps, c } = fakeDeps(); await runIndexSmoke(baseArgs(), deps); check(J(c.lastInput.keys) === J(["config", "recordId", "tenantId"]), `T4 reader input keys=${J(c.lastInput.keys)}`); }
  // ═══ 5 — reader yalnız bir kez ═════════════════════════════════════════════
  { const { deps, c } = fakeDeps(); await runIndexSmoke(baseArgs(), deps); check(c.read === 1, `T5 read=${c.read}`); }
  // ═══ 6 — 0 kayıt → record-not-found-or-not-owned ═══════════════════════════
  { const { deps } = fakeDeps({ read: { status: "none" } }); const o = await runIndexSmoke(baseArgs(), deps); check(o.code === "record-not-found-or-not-owned", `T6 ${J(o)}`); }
  // ═══ 7 — yanlış tenant (fake none) → aynı kod ══════════════════════════════
  { const { deps, c } = fakeDeps({ read: { status: "none" } }); const o = await runIndexSmoke(baseArgs(), deps); check(o.code === "record-not-found-or-not-owned" && c.read === 1, `T7 wrong-tenant→same code`); }
  // ═══ 8 — ikinci sorgu yok ═══════════════════════════════════════════════════
  { const { deps, c } = fakeDeps({ read: { status: "none" } }); await runIndexSmoke(baseArgs(), deps); check(c.read === 1, `T8 ikinci sorgu yok (read=${c.read})`); }
  // ═══ 9/10 — DB error → source-read-failed (not-found DEĞİL) ═════════════════
  { const { deps } = fakeDeps({ read: { status: "error" } }); const o = await runIndexSmoke(baseArgs(), deps); check(o.code === "source-read-failed", `T9 error→source-read-failed`); check(o.code !== "record-not-found-or-not-owned", `T10 error≠not-found`); }
  // ═══ 11 — DB error sonrası builder çağrılmaz (summary null) ════════════════
  { const { deps } = fakeDeps({ read: { status: "error" } }); const o = await runIndexSmoke(baseArgs(), deps); check(o.summary === null, `T11 error→summary null (builder yok)`); }
  // ═══ 12/15/16/18 — writer/delete/page dep YAPISAL olarak yok ═══════════════
  { const { deps } = fakeDeps(); check(!("runDryRunPage" in deps), `T18 page reader dep yok`); check(!("cleanupIndex" in deps) && !("indexWriter" in deps), `T12/15/16 writer/delete dep yok`); }
  // ═══ 13/14 — owned record → dry-run-completed; builder bir kez ══════════════
  { const { deps, c } = fakeDeps(); const o = await runIndexSmoke(baseArgs(), deps); check(o.status === "dry-run-ok" && o.code === "dry-run-completed" && o.exitCode === 0, `T13 ${J(o.code)}`); check(o.summary?.fetched === 1 && ((o.summary?.produced ?? 0) + (o.summary?.skipped ?? 0)) === 1, `T14 tek kayıt işlendi (produced=${o.summary?.produced})`); check(c.read === 1, "T14b read=1"); }
  // ═══ 17 — auto-pagination yok (tek okuma) ══════════════════════════════════
  { const { deps, c } = fakeDeps(); await runIndexSmoke(baseArgs(), deps); check(c.read === 1, `T17 auto-pagination yok (read=${c.read})`); }
  // ═══ 19/20/21 — ham tenant/record UUID + içerik loglanmaz ══════════════════
  { const { deps } = fakeDeps(); const o = await runIndexSmoke(baseArgs(), deps); const s = J(o); check(s.indexOf(TENANT) === -1 && s.indexOf(RECORD) === -1, `T19/20 tam UUID sızmaz`); check(s.indexOf(CONTENT_MARKER) === -1, `T21 ham içerik sızmaz`); check(o.summary?.tenantIdRedacted.includes("…") === true, "T19b redakte"); }
  // ═══ 22 — ham DB error loglanmaz ═══════════════════════════════════════════
  { const { deps } = fakeDeps({ readThrows: true }); const o = await runIndexSmoke(baseArgs(), deps); check(o.code === "source-read-failed" && J(o).indexOf("SECRET_DB_ERROR") === -1, `T22 ham error sızmaz`); }
  // ═══ 23/24 — shared/join tenant-model fail-closed (gate doğrudan) ══════════
  {
    const shared = resolveYhSourceConfig("dogaltas:knowledge"); // column + allowSharedNull
    const join = resolveYhSourceConfig("sifa_rehberi:guide-sections"); // join
    const col = resolveYhSourceConfig("biyoenerji:symbols"); // column non-shared
    check(shared !== null && evaluateSmokeTenantModel(shared) === "shared-record-disabled", `T23 shared→shared-record-disabled`);
    check(join !== null && evaluateSmokeTenantModel(join) === "join-source-disabled", `T24 join→join-source-disabled`);
    check(col !== null && evaluateSmokeTenantModel(col) === null, `T23b column-non-shared→null`);
  }
  // ═══ 25 — S2.12A write/cleanup fail-closed korunur ═════════════════════════
  const envs: SmokeEnvironment[] = ["local", "staging", "production"];
  for (const env of envs) {
    const { deps, c } = fakeDeps();
    const ow = await runIndexSmoke(argsFor(env, { phase: "write" }), deps);
    check(ow.code === (env === "production" ? "production-write-disabled" : "write-isolation-not-proven") && c.read === 0, `T25 write ${env}`);
    const oc = await runIndexSmoke(argsFor(env, { phase: "cleanup" }), deps);
    check(oc.code === (env === "production" ? "production-cleanup-disabled" : "cleanup-provenance-missing") && c.read === 0, `T25 cleanup ${env}`);
  }
  // ═══ Genel — fingerprint deterministik (izolasyon kanıtı DEĞİL) ════════════
  { const v1 = validateSmokeActivation(baseArgs()); const v2 = validateSmokeActivation(argsFor("staging")); check(v1.ok && v2.ok && computeTargetFingerprint(v1.value) !== computeTargetFingerprint(v2.value), "G fingerprint environment'a duyarlı"); }

  // ── Sonuç ─────────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    console.error("S2.12C index-smoke harness — BAŞARISIZ:");
    for (const e of errors) console.error("  ✗ " + e);
    process.exit(1);
  }
  console.log("S2.12C index-smoke harness (exact-owned-record) — fake-deps; gerçek DB/ağ YOK.");
  console.log("");
  console.log(`CHECK: ${total} kontrol OK.`);
  console.log("- exact-owned-record: reader'a pk+tenant birlikte; page/cursor/limit yok; tek çağrı; ikinci sorgu yok");
  console.log("- 0 kayıt→record-not-found-or-not-owned; DB error→source-read-failed (not-found'a dönüşmez, builder yok)");
  console.log("- allowlist=biyoenerji:symbols; shared/join fail-closed; demo fail-closed; page reader/writer/delete dep YOK");
  console.log("- write/cleanup Model B fail-closed (tüm ortam); ham UUID/içerik/DB-error sızmaz");
}

main().catch((e) => {
  console.error("S2.12C harness — beklenmeyen üst-seviye hata:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
