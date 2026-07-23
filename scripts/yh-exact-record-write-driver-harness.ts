// Yaşam Hafızası™ — BF-2B: EXACT-RECORD write driver harness (saf/mock; GERÇEK AĞ YOK).
//
// yh-exact-record-write-driver.ts PUBLIC sözleşmesini GERÇEK import ile doğrular.
// fetch/postExact mock/inject edilir; global fetch tripwire ile gerçek ağ çağrısı
// yapılmadığı KANITLANIR. Fixture UUID'ler kullanılır; GERÇEK production UUID GÖMÜLMEZ.
// Çalıştırma:  npx tsx scripts/yh-exact-record-write-driver-harness.ts

import {
  WRITE_CONFIRMATION_PHRASE,
  SYNTHETIC_TENANT_ID,
  DEMO_TENANT_ID,
  parseCliArgs,
  validateEnv,
  validateTargets,
  buildExactBody,
  validateDryRunResponse,
  validateWriteResponse,
  runExactTwoGate,
  main,
  type DriverTarget,
  type RequestResult,
  type TwoGateDeps,
} from "./yh-exact-record-write-driver";

// ─── GERÇEK AĞ TRİPWİRE: herhangi bir gerçek fetch harness'i patlatır ─────────
let realFetchCalls = 0;
(globalThis as unknown as { fetch: unknown }).fetch = () => {
  realFetchCalls += 1;
  throw new Error("HARNESS: gerçek ağ çağrısı YASAK");
};

// ─── Güvenli konsol yakalayıcı (secret sızıntı denetimi için) ─────────────────
const logLines: string[] = [];
const origLog = console.log.bind(console);
const origErr = console.error.bind(console);
console.log = (...a: unknown[]) => { logLines.push(a.map(String).join(" ")); };
console.error = (...a: unknown[]) => { logLines.push(a.map(String).join(" ")); };
function restoreConsole(): void { console.log = origLog; console.error = origErr; }

let total = 0;
const errors: string[] = [];
function check(cond: boolean, msg: string): void {
  total += 1;
  if (!cond) errors.push(msg);
}

// ── Fixture UUID'ler (GERÇEK production değeri DEĞİL) ──────────────────────────
const SOURCE_KEY = "biyoenerji:symbols";
const EXACT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REAL_TENANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN_ID = "99999999-9999-4999-8999-999999999999";
const SECRET_TOKEN = "s3cr3t-session-token-DO-NOT-LOG-123456";
const BASE_URL = "https://example.com";

const TARGET: DriverTarget = { sourceKey: SOURCE_KEY, exactSourceId: EXACT_ID, expectedTenantId: REAL_TENANT };

function fullEnv(over: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    YH_BASE_URL: BASE_URL,
    YH_ADMIN_ID: ADMIN_ID,
    YH_SESSION_TOKEN: SECRET_TOKEN,
    YH_TARGET_SOURCE_KEY: SOURCE_KEY,
    YH_TARGET_SOURCE_ID: EXACT_ID,
    YH_TARGET_TENANT_ID: REAL_TENANT,
    YH_WRITE_CONFIRMATION: WRITE_CONFIRMATION_PHRASE,
    ...over,
  };
}

function dryRunBody(over: Record<string, unknown> = {}, pageOver: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ok: true, mode: "dry-run", sourceKey: SOURCE_KEY, write: null,
    page: {
      fetched: 1, produced: 1, skipped: 0, eligibleUnits: 1, excludedDemo: 0, excludedSynthetic: 0,
      exactMode: true, exactStatus: "ok", nextCursor: null, hasMore: false, ...pageOver,
    },
    ...over,
  });
}
function writeBody(over: Record<string, unknown> = {}, writeOver: Record<string, unknown> = {}): string {
  const write = {
    attempted: 1, written: 1, plannedInsert: 1, plannedUpdate: 0, unchanged: 0,
    failed: 0, chunksAttempted: 1, chunksSucceeded: 1, completed: true, errors: [] as unknown[],
    ...writeOver,
  };
  return JSON.stringify({
    ok: true, mode: "write", sourceKey: SOURCE_KEY,
    page: { fetched: 1, produced: 1, skipped: 0, eligibleUnits: 1, excludedDemo: 0, excludedSynthetic: 0, exactMode: true, exactStatus: "ok", nextCursor: null, hasMore: false },
    write,
    ...over,
  });
}

const nullLogger: TwoGateDeps["logger"] = { info() {}, gate() {}, stop() {}, done() {} };

async function run(): Promise<void> {
  // ══════ CLI ══════
  {
    const c = parseCliArgs([]);
    check(c.ok === true && c.execute === false, "C1: argümansız → execute false");
  }
  {
    const c = parseCliArgs(["--execute"]);
    check(c.ok === true && c.execute === true, "C2: --execute → execute true");
  }
  {
    const c = parseCliArgs(["--bogus"]);
    check(!c.ok && c.code === "unknown-arg", "C3: bilinmeyen arg → red");
  }
  {
    const c = parseCliArgs(["--execute", "--execute"]);
    check(!c.ok && c.code === "duplicate-arg", "C4: tekrar arg → red");
  }

  // ══════ validateTargets (ağ öncesi fail-closed) ══════
  check(validateTargets(fullEnv()).ok === true, "T1: tam hedef → ok");
  check(!validateTargets(fullEnv({ YH_WRITE_CONFIRMATION: undefined })).ok, "T2: confirmation eksik → red");
  check((validateTargets(fullEnv({ YH_WRITE_CONFIRMATION: "wrong" })) as { code: string }).code === "invalid-confirmation", "T3: yanlış confirmation");
  check((validateTargets(fullEnv({ YH_TARGET_SOURCE_KEY: "dogaltas:stones" })) as { code: string }).code === "source-not-allowed", "T4: allowlist dışı source");
  check((validateTargets(fullEnv({ YH_TARGET_SOURCE_ID: "not-uuid" })) as { code: string }).code === "invalid-source-id", "T5: bozuk source id");
  check((validateTargets(fullEnv({ YH_TARGET_TENANT_ID: "not-uuid" })) as { code: string }).code === "invalid-tenant-id", "T6: bozuk tenant id");
  check((validateTargets(fullEnv({ YH_TARGET_TENANT_ID: SYNTHETIC_TENANT_ID })) as { code: string }).code === "tenant-synthetic-forbidden", "T7: sentetik tenant hedefi red");
  check((validateTargets(fullEnv({ YH_TARGET_TENANT_ID: DEMO_TENANT_ID })) as { code: string }).code === "tenant-demo-forbidden", "T8: demo tenant hedefi red");

  // ══════ validateEnv ══════
  check(validateEnv(fullEnv()).ok === true, "E1: tam env → ok");
  check(!validateEnv(fullEnv({ YH_BASE_URL: undefined })).ok, "E2: base url eksik → red");
  check(!validateEnv(fullEnv({ YH_BASE_URL: "http://x.com" })).ok, "E3: https değil → red");
  check(!validateEnv(fullEnv({ YH_ADMIN_ID: "not-uuid" })).ok, "E4: admin id UUID değil → red");
  check(!validateEnv(fullEnv({ YH_SESSION_TOKEN: undefined })).ok, "E5: token eksik → red");

  // ══════ buildExactBody ══════
  {
    const b = buildExactBody(TARGET, "dry-run");
    check(b.sourceKey === SOURCE_KEY && b.mode === "dry-run" && b.exactSourceId === EXACT_ID && b.expectedTenantId === REAL_TENANT, "B1: dry-run body doğru");
    const bw = buildExactBody(TARGET, "write");
    check(bw.mode === "write" && bw.exactSourceId === EXACT_ID, "B2: write body aynı hedef");
    check(Object.keys(b).length === 4, "B3: yalnız 4 izinli alan");
  }

  // ══════ validateDryRunResponse ══════
  check(validateDryRunResponse(200, dryRunBody(), TARGET).ok === true, "D1: geçerli dry-run → ok");
  check((validateDryRunResponse(200, dryRunBody({}, { eligibleUnits: 0 }), TARGET) as { code: string }).code === "dryrun-shape-invalid", "D2: eligible=0 → shape-invalid");
  check((validateDryRunResponse(200, dryRunBody({}, { eligibleUnits: 2, fetched: 2, produced: 2 }), TARGET) as { code: string }).code === "dryrun-shape-invalid", "D3: eligible>1 → shape-invalid");
  check((validateDryRunResponse(200, dryRunBody({}, { excludedSynthetic: 1 }), TARGET) as { code: string }).code === "dryrun-shape-invalid", "D4: excludedSynthetic>0 → shape-invalid");
  check((validateDryRunResponse(200, dryRunBody({}, { excludedDemo: 1 }), TARGET) as { code: string }).code === "dryrun-shape-invalid", "D5: excludedDemo>0 → shape-invalid");
  check((validateDryRunResponse(200, dryRunBody({}, { fetched: 0, produced: 0, eligibleUnits: 0 }), TARGET) as { code: string }).code === "dryrun-shape-invalid", "D6: fetched≠1 → shape-invalid");
  check((validateDryRunResponse(200, dryRunBody({ write: { written: 1 } }), TARGET) as { code: string }).code === "dryrun-write-not-null", "D7: dry-run write≠null → fail-closed");
  check((validateDryRunResponse(200, dryRunBody({}, { exactMode: false }), TARGET) as { code: string }).code === "exact-mode-off", "D8: exactMode false → exact-mode-off");
  check((validateDryRunResponse(200, dryRunBody({}, { exactStatus: "tenant-mismatch" }), TARGET) as { code: string }).code === "exact-status-not-ok", "D9: exactStatus≠ok → red");
  check((validateDryRunResponse(403, dryRunBody(), TARGET) as { code: string }).code === "http-403", "D10: 403 → http-403");
  check((validateDryRunResponse(200, "{bad json", TARGET) as { code: string }).code === "bad-json", "D11: bozuk json → bad-json");
  check((validateDryRunResponse(200, dryRunBody({ sourceKey: "x" }), TARGET) as { code: string }).code === "wrong-source", "D12: yanlış source → wrong-source");

  // ══════ validateWriteResponse ══════
  check(validateWriteResponse(200, writeBody(), TARGET).ok === true, "W1: geçerli write → ok");
  check((validateWriteResponse(200, writeBody({}, { completed: false }), TARGET) as { code: string }).code === "write-not-completed", "W2: completed false → red");
  check((validateWriteResponse(200, writeBody({}, { failed: 1, completed: true }), TARGET) as { code: string }).code === "write-failed", "W3: failed>0 → red");
  check((validateWriteResponse(200, writeBody({}, { plannedInsert: 0, plannedUpdate: 0, unchanged: 0 }), TARGET) as { code: string }).code === "write-planned-not-one", "W4: planned≠1 → red");
  check((validateWriteResponse(409, writeBody(), TARGET) as { code: string }).code === "http-409", "W5: 409 → http-409");
  check((validateWriteResponse(200, "{bad", TARGET) as { code: string }).code === "bad-json", "W6: bozuk json → bad-json");
  check((validateWriteResponse(200, writeBody({}, { unchanged: 1, plannedInsert: 0 }), TARGET).ok === true), "W7: unchanged=1 (idempotent tekrar) → ok");

  // ══════ runExactTwoGate (iki kapı; injected postExact) ══════
  // Gate1 PASS + Gate2 PASS → ok, iki çağrı, aynı hedef.
  {
    const calls: string[] = [];
    const postExact = async (mode: "dry-run" | "write"): Promise<RequestResult> => {
      calls.push(mode);
      return { ok: true, status: 200, text: mode === "dry-run" ? dryRunBody() : writeBody() };
    };
    const r = await runExactTwoGate(TARGET, { postExact, logger: nullLogger });
    check(r.ok === true && r.gate1Pass && r.gate2Pass, "G1: gate1+gate2 PASS");
    check(calls.length === 2 && calls[0] === "dry-run" && calls[1] === "write", "G1: sıra dry-run→write");
  }
  // Gate1 FAIL → gate2 hiç çağrılmaz.
  {
    const calls: string[] = [];
    const postExact = async (mode: "dry-run" | "write"): Promise<RequestResult> => {
      calls.push(mode);
      return { ok: true, status: 200, text: mode === "dry-run" ? dryRunBody({}, { eligibleUnits: 0 }) : writeBody() };
    };
    const r = await runExactTwoGate(TARGET, { postExact, logger: nullLogger });
    check(!r.ok && r.gate1Pass === false, "G2: gate1 fail → ok=false");
    check(calls.length === 1 && calls[0] === "dry-run", "G2: gate2 çağrılmadı");
  }
  // Gate1 PASS, Gate2 write failed → driver fail.
  {
    const postExact = async (mode: "dry-run" | "write"): Promise<RequestResult> =>
      ({ ok: true, status: 200, text: mode === "dry-run" ? dryRunBody() : writeBody({}, { failed: 1 }) });
    const r = await runExactTwoGate(TARGET, { postExact, logger: nullLogger });
    check(!r.ok && r.gate1Pass && !r.gate2Pass, "G3: gate2 failed → fail");
    check(r.stopCode === "gate2:write-failed", "G3: stopCode gate2:write-failed");
  }
  // Gate1 PASS, Gate2 HTTP 409 → fail.
  {
    const postExact = async (mode: "dry-run" | "write"): Promise<RequestResult> =>
      ({ ok: true, status: mode === "dry-run" ? 200 : 409, text: mode === "dry-run" ? dryRunBody() : writeBody() });
    const r = await runExactTwoGate(TARGET, { postExact, logger: nullLogger });
    check(!r.ok && r.stopCode === "gate2:http-409", "G4: gate2 409 → fail");
  }
  // Gate1 network error → fail-closed, gate2 çağrılmaz.
  {
    const calls: string[] = [];
    const postExact = async (mode: "dry-run" | "write"): Promise<RequestResult> => {
      calls.push(mode);
      return { ok: false, code: "network-error" };
    };
    const r = await runExactTwoGate(TARGET, { postExact, logger: nullLogger });
    check(!r.ok && r.stopCode === "gate1:network-error", "G5: gate1 network → fail");
    check(calls.length === 1, "G5: gate2 çağrılmadı");
  }

  // ══════ main() no-network yolları (ağ çağrısı YOK; tripwire 0) ══════
  check((await main([], fullEnv())) === 0, "M1: argümansız → 0, ağ yok");
  check((await main(["--execute"], fullEnv({ YH_WRITE_CONFIRMATION: undefined }))) === 2, "M2: confirmation yok → 2");
  check((await main(["--execute"], fullEnv({ YH_WRITE_CONFIRMATION: "wrong" }))) === 2, "M3: yanlış confirmation → 2");
  check((await main(["--execute"], fullEnv({ YH_BASE_URL: undefined }))) === 2, "M4: base url yok → 2");
  check((await main(["--execute"], fullEnv({ YH_TARGET_SOURCE_KEY: "dogaltas:stones" }))) === 2, "M5: allowlist dışı → 2");
  check((await main(["--execute"], fullEnv({ YH_TARGET_SOURCE_ID: "bad" }))) === 2, "M6: bozuk source id → 2");
  check((await main(["--execute"], fullEnv({ YH_TARGET_TENANT_ID: "bad" }))) === 2, "M7: bozuk tenant id → 2");
  check((await main(["--execute"], fullEnv({ YH_TARGET_TENANT_ID: SYNTHETIC_TENANT_ID }))) === 2, "M8: sentetik tenant → 2");
  check((await main(["--execute"], fullEnv({ YH_TARGET_TENANT_ID: DEMO_TENANT_ID }))) === 2, "M9: demo tenant → 2");

  // ══════ Secret sızıntı + tripwire ══════
  const joined = logLines.join("\n");
  check(!joined.includes(SECRET_TOKEN), "S1: session token loglanmadı");
  check(!joined.includes(ADMIN_ID), "S2: admin id loglanmadı");
  check(realFetchCalls === 0, "S3: gerçek fetch çağrısı = 0");

  restoreConsole();
  if (errors.length === 0) {
    origLog(`✅ yh-exact-record-write-driver-harness PASS (${total}/${total}) · realFetch=${realFetchCalls}`);
  } else {
    origErr(`❌ yh-exact-record-write-driver-harness FAIL (${total - errors.length}/${total})`);
    for (const e of errors) origErr("   - " + e);
    process.exitCode = 1;
  }
}

void run();
