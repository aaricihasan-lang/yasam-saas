/**
 * F-1 (Frankfurt 24h) — Outbox RPC güvenli hata kategorisi + sweep tek-retry harness'i (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/final-hardening/outbox-sweep-retry.harness.ts
 *
 * Kapsam:
 *   - classifyOutboxRpcFailure: transport | pg:<code> | http:<status> | unknown; ham metin YOK
 *   - YALNIZ yh_outbox_sweep_expired / yh_client_outbox_sweep_expired: TEK retry (250–750 ms jitter)
 *   - ikinci hata → OutboxRpcError (gizlenmez); claim/complete/fail retry YOK
 *   - console.warn yalnız {fn, category, attempt}; message/details/hint/payload sızmaz
 */
import assert from "node:assert/strict";
import {
  OUTBOX_SWEEP_RETRY_MAX_MS,
  OUTBOX_SWEEP_RETRY_MIN_MS,
  OutboxRpcError,
  callOutboxRpc,
  claimEvents,
  classifyOutboxRpcFailure,
  completeEvent,
  failEvent,
  outboxSweepRetryDelayMs,
  sweepExpired,
  type OutboxRpcDb,
  type OutboxRpcResult,
} from "../../lib/yasam-hafizasi/outbox/outboxRpcClient";
import {
  claimClientEvents,
  completeClientEvent,
  failClientEvent,
  sweepExpiredClient,
} from "../../lib/yasam-hafizasi/outbox/clientOutboxRpcClient";

const SECRET = "SECRET-DETAIL relation tenant_id=aaaaaaaa password=hunter2";
const ID = "11111111-1111-4111-8111-111111111111";
const SID = "22222222-2222-4222-8222-222222222222";
const T = "33333333-3333-4333-8333-333333333333";
const C = "44444444-4444-4444-8444-444444444444";

const errRes = (code = "57014", status = 500): OutboxRpcResult => ({
  data: null,
  error: { message: SECRET, code, details: SECRET, hint: SECRET } as { message: string; code: string },
  status,
});
const okRes = (data: unknown): OutboxRpcResult => ({ data, error: null, status: 200 });

/** Sıralı yanıt kuyruğu; "throw" → transport istisnası. */
function fakeDb(script: Array<OutboxRpcResult | "throw">): OutboxRpcDb & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async rpc(fn: string) {
      calls.push(fn);
      const next = script.shift();
      if (next === undefined) throw new Error("fake db: beklenmeyen ek çağrı " + fn);
      if (next === "throw") throw new Error(SECRET);
      return next;
    },
  };
}

/** console.warn yakalama (gerçek varsayılan logger yolunu doğrular). */
async function captureWarn<T>(fn: () => Promise<T>): Promise<{ result: T | undefined; error: unknown; logs: unknown[][] }> {
  const logs: unknown[][] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => { logs.push(a); };
  try {
    return { result: await fn(), error: undefined, logs };
  } catch (error) {
    return { result: undefined, error, logs };
  } finally {
    console.warn = orig;
  }
}

const sweepRow = { id: ID, source_key: "dogaltas:stones", source_id: SID, tenant_id: T, attempts: 1, event_version: 5 };
const clientSweepRow = { ...sweepRow, client_id: C };

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS  ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}

(async () => {
  // ── 1) Sınıflandırma ────────────────────────────────────────────────────────
  await t("classify: throw → transport", () => assert.equal(classifyOutboxRpcFailure(null), "transport"));
  await t("classify: status 0 → transport", () =>
    assert.equal(classifyOutboxRpcFailure({ data: null, error: { message: SECRET, code: "" }, status: 0 }), "transport"));
  await t("classify: SQLSTATE → pg:<code>", () => assert.equal(classifyOutboxRpcFailure(errRes("57014", 500)), "pg:57014"));
  await t("classify: PGRST kodu → pg:<code>", () => assert.equal(classifyOutboxRpcFailure(errRes("PGRST301", 401)), "pg:PGRST301"));
  await t("classify: kod yok → http:<status>", () =>
    assert.equal(classifyOutboxRpcFailure({ data: null, error: { message: SECRET }, status: 503 }), "http:503"));
  await t("classify: kirli kod (mesaj enjeksiyonu) → http:<status>", () =>
    assert.equal(classifyOutboxRpcFailure({ data: null, error: { message: SECRET, code: "x; " + SECRET }, status: 502 }), "http:502"));
  await t("classify: hiçbir bilgi yok → unknown", () =>
    assert.equal(classifyOutboxRpcFailure({ data: null, error: { message: SECRET } }), "unknown"));

  // ── 2) Jitter sınırları ─────────────────────────────────────────────────────
  await t("jitter: 250–750 ms (uçlar + rastgele 500 örnek)", () => {
    assert.equal(outboxSweepRetryDelayMs(() => 0), OUTBOX_SWEEP_RETRY_MIN_MS);
    assert.equal(outboxSweepRetryDelayMs(() => 0.999999), OUTBOX_SWEEP_RETRY_MAX_MS);
    assert.equal(outboxSweepRetryDelayMs(() => Number.NaN), 500);
    for (let i = 0; i < 500; i += 1) {
      const d = outboxSweepRetryDelayMs();
      assert.ok(d >= 250 && d <= 750, `jitter sınır dışı: ${d}`);
    }
  });

  // ── 3) Sweep: ilk hata → tek retry → başarı (gerçek bekleme + gerçek console.warn) ──
  await t("professional sweep: error → 1 retry → sonuç (gerçek jitter beklemesi)", async () => {
    const db = fakeDb([errRes("57014"), okRes([sweepRow])]);
    const t0 = Date.now();
    const { result, error, logs } = await captureWarn(() => sweepExpired(db, 300, 10));
    const waited = Date.now() - t0;
    assert.equal(error, undefined);
    assert.deepEqual(db.calls, ["yh_outbox_sweep_expired", "yh_outbox_sweep_expired"]);
    assert.equal(result?.length, 1);
    assert.equal(result?.[0]?.id, ID);
    assert.ok(waited >= 240, `jitter beklemesi çok kısa: ${waited}ms`);
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0]?.[1], { fn: "yh_outbox_sweep_expired", category: "pg:57014", attempt: 1 });
    assert.ok(!JSON.stringify(logs).includes("SECRET") && !JSON.stringify(logs).includes("hunter2"));
  });

  await t("client sweep: transport throw → 1 retry → sonuç", async () => {
    const db = fakeDb(["throw", okRes([clientSweepRow])]);
    const sleeps: number[] = [];
    const { result, error, logs } = await captureWarn(() =>
      callOutboxRpc(db, "yh_client_outbox_sweep_expired", { p_lease_seconds: 300, p_batch: 10 }, {
        sleep: async (ms) => { sleeps.push(ms); },
      }),
    );
    assert.equal(error, undefined);
    assert.deepEqual(result, [clientSweepRow]);
    assert.equal(db.calls.length, 2);
    assert.equal(sleeps.length, 1);
    assert.ok(sleeps[0]! >= 250 && sleeps[0]! <= 750);
    assert.deepEqual(logs[0]?.[1], { fn: "yh_client_outbox_sweep_expired", category: "transport", attempt: 1 });
    // Gerçek client yolu da retry eder
    const db2 = fakeDb([errRes("08006", 503), okRes([clientSweepRow])]);
    const r2 = await captureWarn(() => sweepExpiredClient(db2, 300, 10));
    assert.equal(r2.error, undefined);
    assert.equal(r2.result?.[0]?.clientId, C);
    assert.equal(db2.calls.length, 2);
  });

  // ── 4) İki hata → throw (gizlenmez), en fazla 2 deneme ─────────────────────
  await t("sweep: iki hata → OutboxRpcError rpc-failed:<fn>:<kategori>; 3. deneme YOK", async () => {
    const db = fakeDb([errRes("57014"), errRes("40001")]);
    const sleeps: number[] = [];
    const warns: unknown[] = [];
    const { error } = await captureWarn(() =>
      callOutboxRpc(db, "yh_outbox_sweep_expired", {}, { sleep: async (ms) => { sleeps.push(ms); }, warn: (e) => warns.push(e) }),
    );
    assert.ok(error instanceof OutboxRpcError);
    assert.equal((error as OutboxRpcError).code, "rpc-failed:yh_outbox_sweep_expired:pg:40001");
    assert.ok(!(error as Error).message.includes("SECRET"));
    assert.equal(db.calls.length, 2);
    assert.equal(sleeps.length, 1);
    assert.deepEqual(warns, [
      { fn: "yh_outbox_sweep_expired", category: "pg:57014", attempt: 1 },
      { fn: "yh_outbox_sweep_expired", category: "pg:40001", attempt: 2 },
    ]);
  });

  await t("client sweep: iki transport hatası → rpc-transport-failed (format korunur)", async () => {
    const db = fakeDb(["throw", "throw"]);
    const { error } = await captureWarn(() =>
      callOutboxRpc(db, "yh_client_outbox_sweep_expired", {}, { sleep: async () => {} }),
    );
    assert.ok(error instanceof OutboxRpcError);
    assert.equal((error as OutboxRpcError).code, "rpc-transport-failed:yh_client_outbox_sweep_expired");
    assert.equal(db.calls.length, 2);
  });

  // ── 5) claim / complete / fail: retry YOK ──────────────────────────────────
  const noRetry: Array<[string, (db: OutboxRpcDb) => Promise<unknown>, string]> = [
    ["professional claim", (db) => claimEvents(db, "w", 10), "yh_outbox_claim"],
    ["professional complete", (db) => completeEvent(db, ID, "w", 1), "yh_outbox_complete"],
    ["professional fail", (db) => failEvent(db, ID, "w", 1, "e", 8, 30, 3600), "yh_outbox_fail"],
    ["client claim", (db) => claimClientEvents(db, "w", 10), "yh_client_outbox_claim_v2"],
    ["client complete", (db) => completeClientEvent(db, ID, "w", 1), "yh_client_outbox_complete"],
    ["client fail", (db) => failClientEvent(db, ID, "w", 1, "e", 8, 30, 3600), "yh_client_outbox_fail"],
  ];
  for (const [label, call, fn] of noRetry) {
    await t(`${label}: hata → retry YOK, tek çağrı, güvenli log`, async () => {
      const db = fakeDb([errRes("57014"), okRes("succeeded")]);
      const { error, logs } = await captureWarn(() => call(db));
      assert.ok(error instanceof OutboxRpcError);
      assert.equal((error as OutboxRpcError).code, `rpc-failed:${fn}:pg:57014`);
      assert.deepEqual(db.calls, [fn]);
      assert.equal(logs.length, 1);
      assert.deepEqual(logs[0]?.[1], { fn, category: "pg:57014", attempt: 1 });
      assert.ok(!JSON.stringify(logs).includes("SECRET"));
    });
  }

  // ── 6) Başarılı çağrı → log YOK ────────────────────────────────────────────
  await t("başarılı sweep → tek çağrı, log yok", async () => {
    const db = fakeDb([okRes([])]);
    const { result, logs } = await captureWarn(() => sweepExpired(db, 300, 10));
    assert.deepEqual(result, []);
    assert.equal(db.calls.length, 1);
    assert.equal(logs.length, 0);
  });

  console.log(`outbox-sweep-retry harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
})();
