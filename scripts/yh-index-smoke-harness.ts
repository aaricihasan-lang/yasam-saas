// Yaşam Hafızası™ — S2.12A İndeks Smoke izole harness (fake-deps; DB/ağ YOK).
//
// MODEL B: gerçek write ve gerçek cleanup-delete HER ORTAMDA fail-closed devre dışı.
// runIndexSmoke + validateSmokeActivation + computeTargetFingerprint GERÇEK import.
// Çalıştırma:  npx tsx scripts/yh-index-smoke-harness.ts

import {
  computeTargetFingerprint,
  runIndexSmoke,
  SMOKE_CLEANUP_CONFIRMATION,
  SMOKE_CONFIRMATIONS,
  validateSmokeActivation,
  type SmokeArgs,
  type SmokeDeps,
  type SmokeEnvironment,
} from "../lib/yasam-hafizasi/indexer/indexSmokePlan";
import type { IndexSourcePageResult } from "../lib/yasam-hafizasi/indexer/indexSourcePage";
import { YH_INDEX_SOURCES } from "../lib/yasam-hafizasi/indexer/sources";

let total = 0;
const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  total += 1;
  if (!cond) errors.push(msg);
}
function J(v: unknown): string {
  return JSON.stringify(v);
}

const KEY = YH_INDEX_SOURCES[0].sourceKey;
const TENANT = "11111111-1111-1111-1111-111111111111";
const RECORD = "22222222-2222-2222-2222-222222222222";

function argsFor(env: SmokeEnvironment, over: Partial<SmokeArgs> = {}): SmokeArgs {
  return { execute: true, environment: env, phase: "dry-run", sourceKey: KEY, tenantId: TENANT, testRecordId: RECORD, confirmation: SMOKE_CONFIRMATIONS[env], ...over };
}
function baseArgs(over: Partial<SmokeArgs> = {}): SmokeArgs {
  return argsFor("local", over);
}
function dryPage(): IndexSourcePageResult {
  return {
    sourceKey: KEY, mode: "dry-run", fetched: 3, eligibleUnits: 2, excludedDemo: 1,
    summary: { units: 2, skipped: 1, byReason: {} }, nextCursor: "cur-x", hasMore: true,
    parentStats: { requested: 0, found: 0, missing: 0 }, write: null,
  };
}

interface Counters { cred: number; demo: number; run: number; count: number }
function fakeDeps(opts: {
  creds?: boolean;
  demo?: { ok: true; isDemo: boolean } | { ok: false; code: "demo-check-failed" };
  result?: IndexSourcePageResult;
  throwRun?: boolean;
  cleanupCount?: number;
  countThrow?: boolean;
} = {}): { deps: SmokeDeps; c: Counters } {
  const c: Counters = { cred: 0, demo: 0, run: 0, count: 0 };
  const deps: SmokeDeps = {
    hasCredentials: () => { c.cred += 1; return opts.creds ?? true; },
    checkDemoTarget: async () => { c.demo += 1; return opts.demo ?? { ok: true, isDemo: false }; },
    runDryRunPage: async () => { c.run += 1; if (opts.throwRun) throw new Error("SECRET_DB_ERROR boom"); return opts.result ?? dryPage(); },
    countCleanupTargets: async () => { c.count += 1; if (opts.countThrow) throw new Error("SECRET"); return { count: opts.cleanupCount ?? 5 }; },
  };
  return { deps, c };
}

async function main(): Promise<void> {
  // ═══ A — AKTİVASYON (DB'siz reddetme) ══════════════════════════════════════
  {
    const { deps, c } = fakeDeps();
    const o = await runIndexSmoke(baseArgs({ execute: false }), deps);
    check(o.status === "plan-only" && o.exitCode === 0, `A1 no-execute plan-only ${J(o)}`);
    check(c.cred === 0 && c.demo === 0 && c.run === 0 && c.count === 0, "A2 no-execute HİÇBİR dep (DB yok)");
  }
  const rej = async (over: Partial<SmokeArgs>, code: string) => {
    const { deps, c } = fakeDeps();
    const o = await runIndexSmoke(baseArgs(over), deps);
    check(o.status === "rejected" && o.code === code, `A ${code} → ${J(o)}`);
    check(c.demo === 0 && c.run === 0, `A ${code} demo/run çağrılmaz`);
  };
  await rej({ environment: undefined }, "invalid-environment");
  await rej({ environment: "prod" }, "invalid-environment");
  await rej({ confirmation: undefined }, "missing-confirmation");
  await rej({ confirmation: "WRONG" }, "invalid-confirmation");
  await rej({ phase: "bad" }, "invalid-phase");
  await rej({ sourceKey: "" }, "missing-source-key");
  await rej({ sourceKey: "nope:nope" }, "unknown-source");
  await rej({ tenantId: "" }, "missing-tenant");
  await rej({ tenantId: "not-a-uuid" }, "invalid-tenant");
  await rej({ testRecordId: "" }, "missing-test-record");
  await rej({ testRecordId: "bad" }, "invalid-test-record");
  await rej({ limit: 0 }, "invalid-limit");
  await rej({ limit: 501 }, "invalid-limit");
  await rej({ limit: 1.5 }, "invalid-limit");
  await rej({ afterId: "" }, "invalid-cursor");
  await rej({ afterId: "a" + String.fromCharCode(0) + "b" }, "invalid-cursor");
  await rej({ afterId: "a" + String.fromCharCode(9) + "b" }, "invalid-cursor");
  await rej({ afterId: "a" + String.fromCharCode(10) + "b" }, "invalid-cursor");
  await rej({ afterId: "a" + String.fromCharCode(127) + "b" }, "invalid-cursor");
  await rej({ afterId: " x " }, "invalid-cursor");
  {
    const { deps, c } = fakeDeps({ creds: false });
    const o = await runIndexSmoke(baseArgs({ phase: "dry-run" }), deps);
    check(o.status === "rejected" && o.code === "missing-credentials" && c.demo === 0 && c.run === 0, `A missing-credentials ${J(o)}`);
  }

  // ═══ B — DRY-RUN (salt-okuma) ══════════════════════════════════════════════
  {
    const { deps, c } = fakeDeps({ demo: { ok: true, isDemo: true } });
    const o = await runIndexSmoke(baseArgs({ phase: "dry-run" }), deps);
    check(o.status === "rejected" && o.code === "demo-target-forbidden" && c.run === 0, `B1 demo hedef ${J(o)}`);
  }
  {
    const { deps, c } = fakeDeps({ demo: { ok: false, code: "demo-check-failed" } });
    const o = await runIndexSmoke(baseArgs({ phase: "dry-run" }), deps);
    check(o.status === "rejected" && o.code === "demo-check-failed" && c.run === 0, `B2 demo-check-failed ${J(o)}`);
  }
  {
    const { deps, c } = fakeDeps();
    const o = await runIndexSmoke(baseArgs({ phase: "dry-run" }), deps);
    check(o.status === "dry-run-ok" && o.exitCode === 0 && o.summary !== null, `B3 dry-run-ok ${J(o.status)}`);
    check(typeof o.targetFingerprint === "string" && o.targetFingerprint.length === 64, "B4 targetFingerprint 64-hex (İZOLASYON KANITI DEĞİL)");
    check(c.run === 1 && c.demo === 1, "B5 dry-run tek sayfa + demo (auto-next yok)");
  }
  {
    const { deps } = fakeDeps();
    const o = await runIndexSmoke(baseArgs({ phase: "dry-run" }), deps);
    const s = J(o);
    check(o.summary?.tenantIdRedacted.includes("…") === true && s.indexOf(TENANT) === -1 && s.indexOf(RECORD) === -1, "B6 id redakte (tam uuid sızmaz)");
    check(s.indexOf("cur-x") === -1 && s.indexOf("byReason") === -1 && s.indexOf("nextCursor") === -1, "B7 cursor değeri/ham page alanı sızmaz");
  }
  {
    const { deps } = fakeDeps({ throwRun: true });
    const o = await runIndexSmoke(baseArgs({ phase: "dry-run" }), deps);
    check(o.status === "rejected" && o.code === "index-failed" && J(o).indexOf("SECRET_DB_ERROR") === -1, "B8 dry-run fatal → index-failed, ham hata sızmaz");
  }

  // ═══ C — WRITE HER ORTAMDA DEVRE DIŞI (Model B) ════════════════════════════
  const envs: SmokeEnvironment[] = ["local", "staging", "production"];
  for (const env of envs) {
    const { deps, c } = fakeDeps();
    const o = await runIndexSmoke(argsFor(env, { phase: "write" }), deps);
    const expected = env === "production" ? "production-write-disabled" : "write-isolation-not-proven";
    check(o.status === "rejected" && o.code === expected, `C write ${env} → ${expected} (${J(o)})`);
    check(c.run === 0, `C write ${env} gerçek indeks çağrısı 0 (Model B)`);
  }

  // ═══ D — CLEANUP ═══════════════════════════════════════════════════════════
  {
    const { deps, c } = fakeDeps({ cleanupCount: 7 });
    const o = await runIndexSmoke(baseArgs({ phase: "cleanup" }), deps); // confirmation yok → yalnız sayım
    check(o.status === "cleanup-plan-ok" && o.cleanupTargetCount === 7 && c.count === 1, `D1 cleanup sayım (silme yok) ${J(o)}`);
  }
  for (const env of envs) {
    const { deps, c } = fakeDeps();
    const o = await runIndexSmoke(argsFor(env, { phase: "cleanup", cleanupConfirmation: SMOKE_CLEANUP_CONFIRMATION }), deps);
    const expected = env === "production" ? "production-cleanup-disabled" : "cleanup-provenance-not-available";
    check(o.status === "rejected" && o.code === expected, `D cleanup-delete ${env} → ${expected} (${J(o)})`);
    check(c.count === 0, `D cleanup-delete ${env} sayım/silme çağrısı 0`);
  }
  {
    // cleanup DELETE dep'i SmokeDeps'te YOK (yapısal: silme imkânsız)
    const { deps } = fakeDeps();
    check(!("cleanupIndex" in deps), "D structural: cleanupIndex dep YOK (silme kodu yok)");
  }
  {
    const { deps } = fakeDeps({ countThrow: true });
    const o = await runIndexSmoke(baseArgs({ phase: "cleanup" }), deps);
    check(o.status === "rejected" && o.code === "cleanup-count-failed" && J(o).indexOf("SECRET") === -1, `D cleanup sayım hatası güvenli ${J(o)}`);
  }

  // ═══ E — GENEL ═════════════════════════════════════════════════════════════
  {
    const v1 = validateSmokeActivation(baseArgs({ phase: "dry-run" }));
    const v2 = validateSmokeActivation(baseArgs({ phase: "write" }));
    check(v1.ok && v2.ok && computeTargetFingerprint(v1.value) === computeTargetFingerprint(v2.value), "E1 targetFingerprint deterministik (girdi-türevi; izolasyon kanıtı DEĞİL)");
  }
  {
    // Model B özet garanti: write hiçbir ortamda gerçek indeks çağrısı yapmaz
    let runCalls = 0;
    for (const env of envs) {
      const { deps, c } = fakeDeps();
      await runIndexSmoke(argsFor(env, { phase: "write" }), deps);
      runCalls += c.run;
    }
    check(runCalls === 0, "E2 write: tüm ortamlarda gerçek indeks çağrı sayısı 0");
  }

  // ── Sonuç ─────────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    console.error("S2.12A index-smoke harness — BAŞARISIZ:");
    for (const e of errors) console.error("  ✗ " + e);
    process.exit(1);
  }
  console.log("S2.12A index-smoke harness (MODEL B) — fake-deps; gerçek DB/ağ YOK.");
  console.log("");
  console.log(`CHECK: ${total} kontrol OK (A aktivasyon + B dry-run + C write-disabled + D cleanup + E genel).`);
  console.log("- --execute yoksa plan-only, hiçbir dep çağrılmaz");
  console.log("- write HER ortamda fail-closed (write-isolation-not-proven / production-write-disabled); indeks çağrısı 0");
  console.log("- cleanup-delete HER ortamda fail-closed (cleanup-provenance-not-available / production-cleanup-disabled); silme dep'i yok");
  console.log("- dry-run salt-okuma; targetFingerprint izolasyon kanıtı DEĞİL; id/cursor/ham içerik sızmaz");
}

main().catch((e) => {
  console.error("S2.12A harness — beklenmeyen üst-seviye hata:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
