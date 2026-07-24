// Yaşam Hafızası™ — S2.11 + BF-4B adminIndexRequest izole harness (saf, fake-deps; DB'siz).
//
// validateAdminIndexRequest + handleAdminIndexRequest'i GERÇEK import ile doğrular.
// Gerçek DB / Supabase / auth / Next runtime YOK. Fake deps enjekte edilir.
// BF-4B: geniş WRITE artık fail-closed (403 broad-write-disabled); write-davranışı
// (success/partial/fatal) TENANT-SCOPED modda test edilir (gerçek proof enjekte).
// Çalıştırma:  npx tsx scripts/yh-admin-index-route-harness.ts

import {
  handleAdminIndexRequest,
  resolveYhSourceConfig,
  validateAdminIndexRequest,
  type AdminIndexHandlerDeps,
  type SafeAdminIndexAuditEvent,
  type ScopedTenantGateCode,
} from "../lib/yasam-hafizasi/indexer/adminIndexRequest";
import {
  BroadWriteDisabledError,
  SourceTenantScopeUnsupportedError,
  type IndexSourcePageResult,
} from "../lib/yasam-hafizasi/indexer/indexSourcePage";
import { TenantFilterMismatchError } from "../lib/yasam-hafizasi/indexer/runSource";
import type { WriteIndexUnitsResult } from "../lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
import { YH_INDEX_SOURCES } from "../lib/yasam-hafizasi/indexer/sources";
import {
  evaluateTenantScope,
  type ValidatedTenantScope,
} from "../lib/yasam-hafizasi/indexer/tenantScopeGate";

let total = 0;
const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  total += 1;
  if (!cond) errors.push(msg);
}
function J(v: unknown): string {
  return JSON.stringify(v);
}

const VALID_KEY = YH_INDEX_SOURCES[0].sourceKey; // refleksoloji:protocols (column, non-shared, safe → scoped destekli)
const SHARED_KEY = "dogaltas:knowledge"; // allowSharedNull → scoped desteksiz
const ADMIN = "admin-1";

// Fixture UUID'ler (GERÇEK production değeri DEĞİL).
const TENANT = "11111111-1111-1111-1111-111111111111";
const EXACT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// Gerçek taşınamaz proof (evaluateTenantScope ile üretilir; taklit YOK).
const proofEval = evaluateTenantScope(TENANT, {
  tenant: { id: TENANT, status: "active" },
  users: [{ role: "expert", active: true, approval_status: "approved", is_demo_account: false }],
});
const PROOF: ValidatedTenantScope = proofEval.ok ? proofEval.scope : (() => { throw new Error("fixture proof üretilemedi"); })();

// ── Fake IndexSourcePageResult üreticileri ───────────────────────────────────
function writeResult(over: Partial<WriteIndexUnitsResult> = {}): WriteIndexUnitsResult {
  return {
    attempted: 1, written: 1, plannedInsert: 1, plannedUpdate: 0, unchanged: 0,
    failed: 0, chunksAttempted: 1, chunksSucceeded: 1,
    conflictKey: "source_table,source_id,section_ref", errors: [], ...over,
  };
}
function pageResult(
  mode: "dry-run" | "write",
  write: WriteIndexUnitsResult | null,
  extra: Record<string, unknown> = {},
): IndexSourcePageResult {
  return {
    sourceKey: VALID_KEY, mode, fetched: 3, eligibleUnits: 2, excludedDemo: 1,
    excludedSynthetic: 4, // BF-1B-FIX: response passthrough testi için ayırt edici değer
    summary: { units: 2, skipped: 1, byReason: { "tenant:invalid-tenant": 1 } },
    nextCursor: "cur-9", hasMore: true, parentStats: { requested: 0, found: 0, missing: 0 },
    write,
    exactMode: false, exactStatus: null,
    ...extra, // redaction testi için ekstra/yabancı alanlar (handler bunları OKUMAZ)
  } as IndexSourcePageResult;
}

// ── Fake deps ────────────────────────────────────────────────────────────────
interface Counters { runCalls: number; demoCalls: number; scopeCalls: number; audits: SafeAdminIndexAuditEvent[] }
function makeDeps(opts: {
  demo?: { ok: true; isDemo: boolean } | { ok: false; code: "demo-check-failed" };
  result?: IndexSourcePageResult;
  throwRun?: boolean;
  throwError?: Error; // runIndexSourcePage'in fırlatacağı TİPLİ hata (BF-4B core throw eşlemesi)
  auditThrows?: boolean;
  scopeGate?: { ok: true; scope: ValidatedTenantScope } | { ok: false; code: ScopedTenantGateCode };
  omitScopeDep?: boolean;
} = {}): { deps: AdminIndexHandlerDeps; c: Counters } {
  const c: Counters = { runCalls: 0, demoCalls: 0, scopeCalls: 0, audits: [] };
  const deps: AdminIndexHandlerDeps = {
    adminId: ADMIN,
    checkAdminDemoStatus: async () => {
      c.demoCalls += 1;
      return opts.demo ?? { ok: true, isDemo: false };
    },
    runIndexSourcePage: async () => {
      c.runCalls += 1;
      if (opts.throwError) throw opts.throwError;
      if (opts.throwRun) throw new Error("SECRET_DB_DETAIL boom");
      return opts.result ?? pageResult("dry-run", null);
    },
    writeAuditEvent: async (e) => {
      c.audits.push(e);
      if (opts.auditThrows) throw new Error("audit fail");
    },
  };
  if (!opts.omitScopeDep) {
    (deps as { validateScopedTenant?: unknown }).validateScopedTenant = async () => {
      c.scopeCalls += 1;
      return opts.scopeGate ?? { ok: true, scope: PROOF };
    };
  }
  return { deps, c };
}

function vbody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { sourceKey: VALID_KEY, mode: "dry-run", ...over };
}
function sbody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { sourceKey: VALID_KEY, mode: "dry-run", scopedTenantId: TENANT, ...over };
}

async function main(): Promise<void> {
  // ═══ A — VALIDATION ════════════════════════════════════════════════════════
  check(validateAdminIndexRequest(vbody({ mode: "dry-run" })).ok, "A valid dry-run");
  check(validateAdminIndexRequest(vbody({ mode: "write" })).ok, "A broad write VALIDATION ok (red handler'da)");
  {
    const r = validateAdminIndexRequest(vbody());
    check(r.ok && r.value.limit === 100, "A default limit 100");
  }
  { const r = validateAdminIndexRequest(vbody({ limit: 1 })); check(r.ok && r.value.limit === 1, "A limit 1"); }
  { const r = validateAdminIndexRequest(vbody({ limit: 500 })); check(r.ok && r.value.limit === 500, "A limit 500"); }
  const bad = (b: unknown, code: string) => {
    const r = validateAdminIndexRequest(b);
    check(!r.ok && r.code === code, `A ${code} → ${J(r)}`);
  };
  bad(vbody({ limit: 501 }), "invalid-limit");
  bad(vbody({ limit: 0 }), "invalid-limit");
  bad(vbody({ limit: "10" }), "invalid-limit");
  bad(null, "invalid-body");
  bad([1, 2], "invalid-body");
  bad({ mode: "dry-run" }, "missing-source-key");
  bad({ sourceKey: "nonexistent:key", mode: "dry-run" }, "unknown-source");
  bad(vbody({ mode: "invalid" }), "invalid-mode");
  bad({ sourceKey: VALID_KEY }, "invalid-mode"); // mode eksik
  bad(vbody({ extra: 1 }), "unexpected-field");
  bad(vbody({ afterId: "" }), "invalid-cursor");
  bad(vbody({ afterId: " x " }), "invalid-cursor");
  { const r = validateAdminIndexRequest(vbody({ afterId: "66666666-6666-6666-6666-666666666666" })); check(r.ok && r.value.afterId === "66666666-6666-6666-6666-666666666666", "A valid cursor"); }

  // ── BF-4B scoped VALIDATION ──
  {
    const r = validateAdminIndexRequest(sbody({ mode: "write" }));
    check(r.ok && r.value.scopedTenantId === TENANT && r.value.exactSourceId === null, "A scoped write validation ok");
  }
  bad(sbody({ scopedTenantId: "not-uuid" }), "invalid-tenant-id");
  bad(sbody({ exactSourceId: EXACT_ID, expectedTenantId: TENANT }), "invalid-combination"); // scoped + exact
  bad({ sourceKey: SHARED_KEY, mode: "dry-run", scopedTenantId: TENANT }, "source-tenant-scope-unsupported");
  { const r = validateAdminIndexRequest(sbody({ afterId: "66666666-6666-6666-6666-666666666666", limit: 50 })); check(r.ok && r.value.afterId !== null && r.value.limit === 50, "A scoped afterId+limit ok"); }

  // ═══ B — HANDLER: dry-run + demo + broad-write-disabled ═════════════════════
  {
    const { deps, c } = makeDeps({ result: pageResult("dry-run", null) });
    const { status, body } = await handleAdminIndexRequest(vbody({ mode: "dry-run" }), deps);
    check(status === 200 && body.ok === true && body.mode === "dry-run" && body.write === null, `B1 dry-run ${J(body)}`);
    check(c.demoCalls === 0, "B2 dry-run demo çağırmaz");
    check(c.runCalls === 1, "B3 dry-run tek indeks çağrısı");
    check(body.ok === true && body.page.produced === 2 && body.page.excludedDemo === 1, "B4 dry-run güvenli page map");
    check(body.ok === true && body.page.excludedSynthetic === 4, "B4b excludedSynthetic passthrough");
    check(body.ok === true && "scopedTenantId" in body && body.scopedTenantId === null, "B4c broad dry-run scopedTenantId null");
  }
  // BROAD WRITE → 403 broad-write-disabled (runIndexSourcePage çağrılmaz).
  {
    const { deps, c } = makeDeps({ demo: { ok: true, isDemo: false }, result: pageResult("write", writeResult()) });
    const { status, body } = await handleAdminIndexRequest(vbody({ mode: "write" }), deps);
    check(status === 403 && body.ok === false && "error" in body && body.error.code === "broad-write-disabled", `B5 broad write → 403 broad-write-disabled ${J(body)}`);
    check(c.runCalls === 0, "B6 broad write → indeks çağrılmaz");
    check(c.demoCalls === 1, "B7 broad write demo kapısı yine çalışır (demo-first)");
  }
  // demo admin broad write → demo-write-forbidden (demo kapısı broad-write-disabled ÖNCESİ).
  {
    const { deps, c } = makeDeps({ demo: { ok: true, isDemo: true } });
    const { status, body } = await handleAdminIndexRequest(vbody({ mode: "write" }), deps);
    check(status === 403 && body.ok === false && "error" in body && body.error.code === "demo-write-forbidden", `B8 demo broad write → demo-write-forbidden ${J(body)}`);
    check(c.runCalls === 0, "B9 demo-write indeks çağrılmaz");
  }
  // demo check failure → 503 (broad write).
  {
    const { deps, c } = makeDeps({ demo: { ok: false, code: "demo-check-failed" } });
    const { status, body } = await handleAdminIndexRequest(vbody({ mode: "write" }), deps);
    check(status === 503 && body.ok === false && "error" in body && body.error.code === "demo-check-failed", `B10 demo-check 503 ${J(body)}`);
    check(c.runCalls === 0, "B11 demo-check-fail indeks çağrılmaz");
  }
  // sourceKey yankılanır; registry listesi yok (dry-run).
  {
    const { deps } = makeDeps({ result: pageResult("dry-run", null) });
    const { body } = await handleAdminIndexRequest(vbody({ mode: "dry-run" }), deps);
    check(body.ok === true && body.sourceKey === VALID_KEY, "B20 sourceKey yankılanır");
    check(J(body).indexOf("sources") === -1 && !("sourceKeys" in (body as object)), "B21 registry listesi yok");
  }
  // redaction: dry-run fake result'a gömülen yabancı/PII alanlar sızmaz.
  {
    const dirty = pageResult("dry-run", null, {
      units: [{ title: "SECRET_TITLE_PII", snippet: "SECRET_SNIPPET" }],
      rawRows: [{ tenant_id: "SECRET_TENANT" }],
      dbError: "SECRET_DB_MESSAGE",
    });
    const { deps } = makeDeps({ result: dirty });
    const { body } = await handleAdminIndexRequest(vbody({ mode: "dry-run" }), deps);
    const s = J(body);
    check(s.indexOf("SECRET_TITLE_PII") === -1 && s.indexOf("SECRET_SNIPPET") === -1, "B22 raw unit/PII sızmaz");
    check(s.indexOf("SECRET_TENANT") === -1 && s.indexOf("SECRET_DB_MESSAGE") === -1, "B23 raw row/DB mesaj sızmaz");
    check(s.indexOf("units") === -1 && s.indexOf("rawRows") === -1, "B24 yabancı alanlar map edilmez");
  }

  // ═══ S — HANDLER: TENANT-SCOPED (proof + write davranışı) ═══════════════════
  // Scoped dry-run OK → 200, scopedTenantId echo.
  {
    const { deps, c } = makeDeps({ result: pageResult("dry-run", null) });
    const { status, body } = await handleAdminIndexRequest(sbody({ mode: "dry-run" }), deps);
    check(status === 200 && body.ok === true && body.mode === "dry-run", `S1 scoped dry-run 200 ${J(body)}`);
    check(body.ok === true && "scopedTenantId" in body && body.scopedTenantId === TENANT, "S1b scoped dry-run scopedTenantId echo");
    check(c.scopeCalls === 1 && c.demoCalls === 0, "S1c scoped dry-run: scope kapısı 1, demo 0");
    check(J(body).indexOf("scopeStatus") === -1, "S1d scopeStatus response'ta YOK (public contract)");
  }
  // Scoped WRITE OK → 200 write success, scopedTenantId echo.
  {
    const { deps, c } = makeDeps({ demo: { ok: true, isDemo: false }, result: pageResult("write", writeResult()) });
    const { status, body } = await handleAdminIndexRequest(sbody({ mode: "write" }), deps);
    check(status === 200 && body.ok === true && body.mode === "write", `S2 scoped write 200 ${J(body)}`);
    check(body.ok === true && body.mode === "write" && body.write.completed === true, "S2b write completed:true");
    check(body.ok === true && "scopedTenantId" in body && body.scopedTenantId === TENANT, "S2c scoped write scopedTenantId echo");
    check(c.demoCalls === 1 && c.scopeCalls === 1 && c.runCalls === 1, "S2d demo+scope+indeks birer kez");
  }
  // Scoped write PARTIAL → 503 partial-write, completed:false.
  {
    const w = writeResult({ written: 0, failed: 200, chunksSucceeded: 0, attempted: 200, errors: [{ chunkIndex: 0, code: "upsert-failed" }] });
    const { deps } = makeDeps({ demo: { ok: true, isDemo: false }, result: pageResult("write", w) });
    const { status, body } = await handleAdminIndexRequest(sbody({ mode: "write" }), deps);
    check(status === 503 && body.ok === false && "error" in body && body.error.code === "partial-write", `S3 scoped partial 503 ${J(body)}`);
    check(body.ok === false && "write" in body && (body.write as { completed: boolean }).completed === false, "S3b partial completed:false");
    check(body.ok === false && "scopedTenantId" in body && body.scopedTenantId === TENANT, "S3c partial scopedTenantId echo");
  }
  // ok:true + completed:false üretilemez (scoped write).
  {
    const { deps } = makeDeps({ demo: { ok: true, isDemo: false }, result: pageResult("write", writeResult()) });
    const { body } = await handleAdminIndexRequest(sbody({ mode: "write" }), deps);
    const okTrueCompletedFalse = body.ok === true && "write" in body && body.write !== null && (body.write as { completed?: boolean }).completed === false;
    check(!okTrueCompletedFalse, "S4 ok:true + completed:false imkânsız");
  }
  // Scoped write fatal (runIndexSourcePage generic throw) → 500 + secret sızmaz.
  {
    const { deps } = makeDeps({ demo: { ok: true, isDemo: false }, throwRun: true });
    const { status, body } = await handleAdminIndexRequest(sbody({ mode: "write" }), deps);
    check(status === 500 && body.ok === false && "error" in body && body.error.code === "index-failed", `S5 scoped fatal 500 ${J(body)}`);
    check(J(body).indexOf("SECRET_DB_DETAIL") === -1, "S5b fatal ham hata sızmaz");
  }
  // BF-4B TİPLİ THROW → HTTP eşlemesi (indexSourcePage çekirdeği fırlatır, handler çevirir).
  {
    const { deps } = makeDeps({ demo: { ok: true, isDemo: false }, throwError: new TenantFilterMismatchError() });
    const { status, body } = await handleAdminIndexRequest(sbody({ mode: "write" }), deps);
    check(status === 409 && body.ok === false && "error" in body && body.error.code === "tenant-filter-mismatch", `S6 TenantFilterMismatchError → 409 ${J(body)}`);
  }
  {
    const { deps } = makeDeps({ demo: { ok: true, isDemo: false }, throwError: new BroadWriteDisabledError() });
    const { status, body } = await handleAdminIndexRequest(sbody({ mode: "write" }), deps);
    check(status === 403 && body.ok === false && "error" in body && body.error.code === "broad-write-disabled", `S6b BroadWriteDisabledError → 403 ${J(body)}`);
  }
  {
    const { deps } = makeDeps({ result: pageResult("dry-run", null), throwError: new SourceTenantScopeUnsupportedError() });
    const { status, body } = await handleAdminIndexRequest(sbody({ mode: "dry-run" }), deps);
    check(status === 422 && body.ok === false && "error" in body && body.error.code === "source-tenant-scope-unsupported", `S6c SourceTenantScopeUnsupportedError → 422 ${J(body)}`);
  }
  // validateScopedTenant dep YOK → 503 tenant-scope-validation-unavailable.
  {
    const { deps, c } = makeDeps({ omitScopeDep: true });
    const { status, body } = await handleAdminIndexRequest(sbody({ mode: "dry-run" }), deps);
    check(status === 503 && body.ok === false && "error" in body && body.error.code === "tenant-scope-validation-unavailable", `S7 scope dep yok → 503 ${J(body)}`);
    check(c.runCalls === 0, "S7b scope dep yok → indeks çağrılmaz");
  }
  // Tenant kapısı hata eşlemesi (validateScopedTenant → {ok:false,code}).
  {
    const cases: Array<[ScopedTenantGateCode, number]> = [
      ["tenant-not-found", 404],
      ["tenant-inactive", 403],
      ["tenant-not-ready", 403],
      ["tenant-demo", 403],
      ["tenant-mixed-demo", 403],
      ["tenant-synthetic", 403],
      ["tenant-scope-validation-unavailable", 503],
    ];
    for (const [code, expStatus] of cases) {
      const { deps, c } = makeDeps({ scopeGate: { ok: false, code } });
      const { status, body } = await handleAdminIndexRequest(sbody({ mode: "dry-run" }), deps);
      check(status === expStatus && body.ok === false && "error" in body && body.error.code === code, `S8 ${code} → ${expStatus} (${J(body)})`);
      check(c.runCalls === 0, `S8b ${code} → indeks çağrılmaz`);
    }
  }

  // ═══ C — AUDIT ═════════════════════════════════════════════════════════════
  {
    const { deps, c } = makeDeps({ result: pageResult("dry-run", null) });
    await handleAdminIndexRequest(vbody({ mode: "dry-run", afterId: "66666666-6666-6666-6666-666666666666" }), deps);
    check(c.audits.length === 1 && c.audits[0].outcome === "dry-run-ok", "C1 dry-run audit");
    check(c.audits[0].excludedSynthetic === 4, "C1b audit excludedSynthetic taşır");
    check(c.audits[0].cursorPresent === true, "C2 cursorPresent bool");
    check(J(c.audits[0]).indexOf("66666666-6666") === -1, "C3 audit cursor DEĞERİ içermez");
  }
  {
    // scoped write audit hatası ana sonucu bozmaz.
    const { deps } = makeDeps({ demo: { ok: true, isDemo: false }, result: pageResult("write", writeResult()), auditThrows: true });
    const { status, body } = await handleAdminIndexRequest(sbody({ mode: "write" }), deps);
    check(status === 200 && body.ok === true, "C4 audit hatası ana sonucu bozmaz");
  }
  {
    // scoped partial write → partial-write audit outcome.
    const w = writeResult({ failed: 1, errors: [{ chunkIndex: 1, code: "upsert-failed" }], written: 0 });
    const { deps, c } = makeDeps({ demo: { ok: true, isDemo: false }, result: pageResult("write", w) });
    await handleAdminIndexRequest(sbody({ mode: "write" }), deps);
    check(c.audits.length === 1 && c.audits[0].outcome === "partial-write", "C5 partial audit outcome");
  }
  {
    check(resolveYhSourceConfig(VALID_KEY) !== null && resolveYhSourceConfig("yok:yok") === null, "C6 resolveYhSourceConfig");
  }

  // ── Sonuç ─────────────────────────────────────────────────────────────────
  if (errors.length === 0) {
    console.log("✅ yh-admin-index-route-harness PASS (S2.11 + BF-4B tenant-scoped)");
    console.log(`CHECK: ${total} kontrol OK, 0 FAIL.`);
  } else {
    console.error("❌ yh-admin-index-route-harness FAIL");
    for (const e of errors) console.error("  ✗ " + e);
    console.log(`CHECK: ${total - errors.length} kontrol OK, ${errors.length} FAIL.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("harness — beklenmeyen üst-seviye hata:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
