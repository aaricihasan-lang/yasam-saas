// Yaşam Hafızası™ — S2.19-BF/BF-1A dogaltas:knowledge dry-run driver harness (saf/mock; GERÇEK AĞ YOK).
//
// yh-dogaltas-knowledge-dryrun-driver.ts PUBLIC sözleşmesini GERÇEK import ile doğrular.
// fetch/sleep/time/state mock/inject edilir; global fetch tripwire ile gerçek ağ çağrısı yapılmadığı KANITLANIR.
// Çalıştırma:  npx tsx scripts/yh-dogaltas-knowledge-dryrun-driver-harness.ts

import {
  SOURCE_KEY, MODE, LIMIT, MAX_PAGES, MAX_ROWS, PAGE_DELAY_MS, REQUEST_TIMEOUT_MS, STATE_VERSION,
  parseCliArgs, validateEnv, buildRequestBody, validateDryRunResponse, validateState,
  runDryRunPaging, isUuid, main,
  type RequestResult, type SafePage, type DriverState, type StateStore, type SafeLogger,
} from "./yh-dogaltas-knowledge-dryrun-driver";

// ─── GERÇEK AĞ TRİPWİRE: herhangi bir gerçek fetch harness'i patlatır ─────────
let realFetchCalls = 0;
(globalThis as unknown as { fetch: unknown }).fetch = () => {
  realFetchCalls += 1;
  throw new Error("HARNESS: gerçek ağ çağrısı YASAK");
};

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

// ─── Mock yardımcıları ───────────────────────────────────────────────────────
const uuidN = (n: number): string => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const U1 = uuidN(1), U2 = uuidN(2), U3 = uuidN(3);

function pg(over: Partial<SafePage> = {}): SafePage {
  return { fetched: 10, produced: 10, skipped: 0, eligibleUnits: 10, excludedDemo: 0, excludedSynthetic: 0, nextCursor: null, hasMore: false, ...over };
}
function ok(page: SafePage): RequestResult { return { ok: true, page }; }
function err(code: string): RequestResult { return { ok: false, code }; }

function makeRequestPage(queue: readonly RequestResult[]): {
  fn: (afterId: string | null) => Promise<RequestResult>;
  calls: (string | null)[];
} {
  const calls: (string | null)[] = [];
  let i = 0;
  return {
    calls,
    fn: (afterId) => {
      calls.push(afterId);
      return Promise.resolve(queue[i++] ?? err("queue-empty"));
    },
  };
}
function makeStore(initial: DriverState | null): { store: StateStore; writes: DriverState[] } {
  let current = initial;
  const writes: DriverState[] = [];
  return {
    writes,
    store: {
      path: "/mock/state.json",
      read: () => Promise.resolve(current),
      write: (s) => { writes.push(s); current = s; return Promise.resolve(); },
    },
  };
}
function makeLogger(): { logger: SafeLogger; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      info: (s) => lines.push(`info:${s}`),
      page: (n, st, p) => lines.push(`page:${n}:${st}:${p.fetched}:${p.hasMore}:${p.nextCursor !== null}`),
      stop: (c) => lines.push(`stop:${c}`),
      done: (sum) => lines.push(`done:${JSON.stringify(sum)}`),
    },
  };
}
function makeState(over: Partial<DriverState> = {}): DriverState {
  return {
    version: STATE_VERSION, sourceKey: SOURCE_KEY, mode: MODE, lastCursor: null,
    pagesProcessed: 0, totalFetched: 0, totalProduced: 0, totalSkipped: 0,
    totalEligibleUnits: 0, totalExcludedDemo: 0, totalExcludedSynthetic: 0,
    completed: false, updatedAt: "2026-07-22T00:00:00.000Z",
    ...over,
  };
}
let sleeps: number[] = [];
const mockSleep = (ms: number): Promise<void> => { sleeps.push(ms); return Promise.resolve(); };
const mockNow = (): string => "2026-07-22T00:00:00.000Z";

function run(queue: readonly RequestResult[], opts: { resume?: boolean; initialState?: DriverState | null } = {}) {
  sleeps = [];
  const rp = makeRequestPage(queue);
  const st = makeStore(opts.initialState ?? null);
  const lg = makeLogger();
  return runDryRunPaging({
    requestPage: rp.fn, sleep: mockSleep, now: mockNow, store: st.store, logger: lg.logger,
    resume: opts.resume ?? false,
  }).then((result) => ({ result, calls: rp.calls, writes: st.writes, lines: lg.lines }));
}

async function main2(): Promise<void> {
  // ═══ Sabitler ═══════════════════════════════════════════════════════════
  check("sabit source/mode/limit", SOURCE_KEY === "dogaltas:knowledge" && MODE === "dry-run" && LIMIT === 100);
  check("sabit sınırlar", MAX_PAGES === 50 && MAX_ROWS === 5000 && PAGE_DELAY_MS === 500 && REQUEST_TIMEOUT_MS === 120000);
  // Pilot kaynak KESİN dogaltas:knowledge; eski aromaterapi:oils ASLA üretilmez.
  check("pilot dogaltas:knowledge (aromaterapi:oils DEĞİL)", SOURCE_KEY === "dogaltas:knowledge" && (SOURCE_KEY as string) !== "aromaterapi:oils");
  check("body source dogaltas:knowledge; oils üretilemez", buildRequestBody(null).sourceKey === "dogaltas:knowledge" && buildRequestBody(U2).sourceKey !== "aromaterapi:oils");

  // ═══ CLI kapısı ═════════════════════════════════════════════════════════
  check("1 argümansız → execute=false (no-op)", (() => { const c = parseCliArgs([]); return c.ok && !c.execute && !c.resume; })());
  check("2 --resume tek başına reddedilir", (() => { const c = parseCliArgs(["--resume"]); return !c.ok && c.code === "resume-without-execute"; })());
  check("3 unknown arg reddedilir", (() => { const c = parseCliArgs(["--write"]); return !c.ok && c.code === "unknown-arg"; })());
  check("4 duplicate arg reddedilir", (() => { const c = parseCliArgs(["--execute", "--execute"]); return !c.ok && c.code === "duplicate-arg"; })());
  check("4b --execute ok", (() => { const c = parseCliArgs(["--execute"]); return c.ok && c.execute && !c.resume; })());
  check("4c --execute --resume ok", (() => { const c = parseCliArgs(["--execute", "--resume"]); return c.ok && c.execute && c.resume; })());
  check("3b sourceKey/mode/limit arg reddedilir", !parseCliArgs(["--sourceKey=x"]).ok && !parseCliArgs(["--mode=write"]).ok);

  // ═══ Request body builder ═══════════════════════════════════════════════
  const b0 = buildRequestBody(null);
  check("7 ilk body'de afterId YOK", !("afterId" in b0));
  check("5/6/10/11/12 body source/mode/limit sabit", b0.sourceKey === SOURCE_KEY && b0.mode === "dry-run" && b0.limit === 100);
  check("9 ilk body tam 3 alan", Object.keys(b0).sort().join(",") === "limit,mode,sourceKey");
  const b1 = buildRequestBody(U2);
  check("8 sonraki body'de doğru afterId", b1.afterId === U2);
  check("9b sonraki body tam 4 alan", Object.keys(b1).sort().join(",") === "afterId,limit,mode,sourceKey");
  check("6b body mode asla write olamaz", b0.mode !== "write" && b1.mode !== "write");

  // ═══ Response validation (exact) ════════════════════════════════════════
  const goodBody = JSON.stringify({ ok: true, mode: "dry-run", sourceKey: SOURCE_KEY, write: null, page: pg({ hasMore: false }) });
  check("resp 200 geçerli → ok", validateDryRunResponse(200, goodBody).ok === true);
  check("21 HTTP 401 → http-401", (() => { const r = validateDryRunResponse(401, ""); return !r.ok && r.code === "http-401"; })());
  check("22 HTTP 403 → http-403", (() => { const r = validateDryRunResponse(403, ""); return !r.ok && r.code === "http-403"; })());
  check("23 HTTP 429 → http-429", (() => { const r = validateDryRunResponse(429, ""); return !r.ok && r.code === "http-429"; })());
  check("24 HTTP 500 → http-500", (() => { const r = validateDryRunResponse(500, ""); return !r.ok && r.code === "http-500"; })());
  check("25 HTTP 503 → http-503", (() => { const r = validateDryRunResponse(503, ""); return !r.ok && r.code === "http-503"; })());
  check("29 bozuk JSON → bad-json", (() => { const r = validateDryRunResponse(200, "{bozuk"); return !r.ok && r.code === "bad-json"; })());
  check("30 ok=false → not-ok", (() => { const r = validateDryRunResponse(200, JSON.stringify({ ok: false, error: { code: "x" } })); return !r.ok && r.code === "not-ok"; })());
  check("31 mode yanlış → wrong-mode", (() => { const r = validateDryRunResponse(200, JSON.stringify({ ok: true, mode: "write", sourceKey: SOURCE_KEY, write: null, page: pg() })); return !r.ok && r.code === "wrong-mode"; })());
  check("32 sourceKey yanlış → wrong-source", (() => { const r = validateDryRunResponse(200, JSON.stringify({ ok: true, mode: "dry-run", sourceKey: "x", write: null, page: pg() })); return !r.ok && r.code === "wrong-source"; })());
  check("33 write != null → write-not-null", (() => { const r = validateDryRunResponse(200, JSON.stringify({ ok: true, mode: "dry-run", sourceKey: SOURCE_KEY, write: {}, page: pg() })); return !r.ok && r.code === "write-not-null"; })());
  check("34 page eksik → page-missing", (() => { const r = validateDryRunResponse(200, JSON.stringify({ ok: true, mode: "dry-run", sourceKey: SOURCE_KEY, write: null })); return !r.ok && r.code === "page-missing"; })());
  check("35 negatif metrik → page-field-invalid", (() => { const r = validateDryRunResponse(200, JSON.stringify({ ok: true, mode: "dry-run", sourceKey: SOURCE_KEY, write: null, page: { ...pg(), fetched: -1 } })); return !r.ok && r.code === "page-field-invalid"; })());
  check("36 kesirli metrik → page-field-invalid", (() => { const r = validateDryRunResponse(200, JSON.stringify({ ok: true, mode: "dry-run", sourceKey: SOURCE_KEY, write: null, page: { ...pg(), produced: 1.5 } })); return !r.ok && r.code === "page-field-invalid"; })());
  check("resp hasMore non-bool → page-field-invalid", (() => { const r = validateDryRunResponse(200, JSON.stringify({ ok: true, mode: "dry-run", sourceKey: SOURCE_KEY, write: null, page: { ...pg(), hasMore: "yes" } })); return !r.ok && r.code === "page-field-invalid"; })());
  // ─── BF-1B-FIX: excludedSynthetic zorunlu response alanı ─────────────────
  check("55 excludedSynthetic parse edilir", (() => {
    const r = validateDryRunResponse(200, JSON.stringify({ ok: true, mode: "dry-run", sourceKey: SOURCE_KEY, write: null, page: pg({ excludedSynthetic: 7 }) }));
    return r.ok === true && r.page.excludedSynthetic === 7;
  })());
  check("56 excludedSynthetic EKSİK → page-field-invalid (fail-closed)", (() => {
    const { excludedSynthetic: _drop, ...eksik } = pg();
    void _drop;
    const r = validateDryRunResponse(200, JSON.stringify({ ok: true, mode: "dry-run", sourceKey: SOURCE_KEY, write: null, page: eksik }));
    return !r.ok && r.code === "page-field-invalid";
  })());
  check("57 excludedSynthetic negatif/string → page-field-invalid", (() => {
    const neg = validateDryRunResponse(200, JSON.stringify({ ok: true, mode: "dry-run", sourceKey: SOURCE_KEY, write: null, page: { ...pg(), excludedSynthetic: -1 } }));
    const str = validateDryRunResponse(200, JSON.stringify({ ok: true, mode: "dry-run", sourceKey: SOURCE_KEY, write: null, page: { ...pg(), excludedSynthetic: "3" } }));
    return !neg.ok && neg.code === "page-field-invalid" && !str.ok && str.code === "page-field-invalid";
  })());

  // ═══ Orkestrasyon (loop) ════════════════════════════════════════════════
  {
    const { result, calls } = await run([ok(pg({ hasMore: false }))]);
    check("13 hasMore=false temiz bitiş", result.completed === true && result.stopped === false && result.pagesProcessed === 1);
    check("7b ilk çağrı afterId=null", calls[0] === null);
    check("53 son sayfadan sonra sleep yok", sleeps.length === 0);
  }
  {
    const { result, calls } = await run([ok(pg({ hasMore: true, nextCursor: U2 })), ok(pg({ hasMore: false }))]);
    check("14 hasMore=true → sonraki sayfa cursor ile", result.completed === true && result.pagesProcessed === 2 && calls[1] === U2);
    check("52 sayfa arası sleep 500ms", sleeps.length === 1 && sleeps[0] === 500);
  }
  {
    const { result } = await run([ok(pg({ hasMore: true, nextCursor: U2 })), ok(pg({ hasMore: true, nextCursor: U2 }))]);
    check("15 cursor tekrarında DUR", result.stopped && result.stopCode === "cursor-repeat");
  }
  {
    const { result } = await run([ok(pg({ hasMore: true, nextCursor: U3 })), ok(pg({ hasMore: true, nextCursor: U2 }))]);
    check("16 cursor gerilemesinde DUR", result.stopped && result.stopCode === "cursor-backward");
  }
  {
    const { result } = await run([ok(pg({ hasMore: true, nextCursor: null }))]);
    check("17 hasMore=true + null cursor DUR", result.stopped && result.stopCode === "hasmore-null-cursor");
  }
  {
    const { result } = await run([ok(pg({ hasMore: true, nextCursor: "not-a-uuid" }))]);
    check("18 geçersiz UUID cursor DUR", result.stopped && result.stopCode === "invalid-cursor");
  }
  {
    const queue: RequestResult[] = [];
    for (let i = 1; i <= 60; i++) queue.push(ok(pg({ hasMore: true, nextCursor: uuidN(i + 1) })));
    const { result } = await run(queue);
    check("19 maxPages(50) DUR", result.stopped && result.stopCode === "max-pages" && result.pagesProcessed === MAX_PAGES);
  }
  {
    const { result } = await run([ok(pg({ hasMore: true, nextCursor: U2, fetched: 5001 }))]);
    check("20 maxRows(5000) DUR", result.stopped && result.stopCode === "max-rows");
  }
  for (const code of ["http-401", "http-403", "http-429", "http-500", "http-503", "redirect", "timeout", "network-error"]) {
    const { result } = await run([err(code)]);
    check(`21-28 loop DUR: ${code}`, result.stopped && result.stopCode === code);
  }
  {
    const { result } = await run([err("bad-json")]);
    check("29b loop DUR bad-json", result.stopped && result.stopCode === "bad-json");
  }

  // ═══ Checkpoint / state ═════════════════════════════════════════════════
  {
    const { writes } = await run([ok(pg({ hasMore: true, nextCursor: U2 })), ok(pg({ hasMore: false }))]);
    check("45 checkpoint atomik yazılır (her sayfa)", writes.length === 2);
    check("44 checkpoint'te secret yok", (() => { const blob = JSON.stringify(writes); return !blob.includes("token") && !blob.includes("YH_") && !blob.includes("http"); })());
    check("checkpoint alanları", writes[1] !== undefined && writes[1].completed === true && writes[1].sourceKey === SOURCE_KEY && writes[1].mode === MODE);
  }
  check("validateState geçerli", validateState(makeState()) !== null);
  check("48 bozuk state → null", validateState({ version: 1 }) === null);
  check("49 farklı source/mode/version state → null", validateState(makeState({ sourceKey: "x" as string })) === null && validateState({ ...makeState(), version: 99 }) === null);
  // ─── BF-1B-FIX: STATE_VERSION=2 + totalExcludedSynthetic zorunlu ─────────
  check("58 STATE_VERSION 2", STATE_VERSION === 2);
  check("59 v1 checkpoint resume EDİLMEZ (fail-closed)", (() => {
    const { totalExcludedSynthetic: _drop, ...v1 } = makeState();
    void _drop;
    return validateState({ ...v1, version: 1 }) === null && validateState({ ...makeState(), version: 1 }) === null;
  })());
  check("60 totalExcludedSynthetic EKSİK → state reddedilir (0 sayılmaz)", (() => {
    const { totalExcludedSynthetic: _drop, ...eksik } = makeState();
    void _drop;
    return validateState(eksik) === null;
  })());
  check("61 totalExcludedSynthetic negatif/kesirli → null", validateState(makeState({ totalExcludedSynthetic: -1 })) === null && validateState(makeState({ totalExcludedSynthetic: 1.5 })) === null);
  {
    const { result, writes } = await run([
      ok(pg({ hasMore: true, nextCursor: U2, eligibleUnits: 0, excludedSynthetic: 10 })),
      ok(pg({ hasMore: false, eligibleUnits: 0, excludedSynthetic: 3 })),
    ]);
    check("62 totalExcludedSynthetic doğru toplanır", result.totalExcludedSynthetic === 13 && result.totalEligibleUnits === 0);
    check("63 checkpoint totalExcludedSynthetic taşır", writes[1] !== undefined && writes[1].totalExcludedSynthetic === 13 && writes[1].version === 2);
  }
  {
    const { result } = await run([ok(pg({ hasMore: false, excludedSynthetic: 2 }))], { resume: true, initialState: makeState({ lastCursor: U2, totalExcludedSynthetic: 5 }) });
    check("64 resume totalExcludedSynthetic devam ettirir", result.totalExcludedSynthetic === 7);
  }
  {
    // mixed sayfa: demo ve sentetik sayaçları ayrı toplanır, karışmaz.
    const { result } = await run([ok(pg({ hasMore: false, fetched: 6, produced: 6, eligibleUnits: 3, excludedDemo: 1, excludedSynthetic: 2 }))]);
    check("65 demo/sentetik sayaçları karışmaz", result.totalExcludedDemo === 1 && result.totalExcludedSynthetic === 2 && result.totalEligibleUnits === 3);
  }

  // ═══ Resume ═════════════════════════════════════════════════════════════
  {
    const { result, calls } = await run([], { resume: true, initialState: null });
    check("47 resume state yoksa DUR (ağ çağrısı yok)", result.stopCode === "resume-no-state" && calls.length === 0);
  }
  {
    const { result, calls } = await run([], { resume: true, initialState: makeState({ completed: true }) });
    check("50 completed state → ağ çağrısı yapmaz", result.completed === true && calls.length === 0);
  }
  {
    const { calls } = await run([ok(pg({ hasMore: false }))], { resume: true, initialState: makeState({ lastCursor: U2, pagesProcessed: 3, totalFetched: 30 }) });
    check("51 resume doğru cursor'dan başlar", calls[0] === U2);
  }
  {
    const { result } = await run([ok(pg({ hasMore: false }))], { resume: true, initialState: makeState({ lastCursor: U2, totalFetched: 30 }) });
    check("51b resume sayaçları devam ettirir", result.totalFetched === 40);
  }

  // ═══ Env validation ═════════════════════════════════════════════════════
  const okEnv = { YH_BASE_URL: "https://www.example.com/", YH_ADMIN_ID: U1, YH_SESSION_TOKEN: "tok" };
  check("37a env geçerli → origin normalize", (() => { const r = validateEnv(okEnv); return r.ok && r.config.baseUrl === "https://www.example.com"; })());
  check("37b env base eksik", validateEnv({ ...okEnv, YH_BASE_URL: "" }).ok === false);
  check("37c env http reddedilir", (() => { const r = validateEnv({ ...okEnv, YH_BASE_URL: "http://x.com" }); return !r.ok && r.code === "base-url-not-https"; })());
  check("37d env credentials reddedilir", (() => { const r = validateEnv({ ...okEnv, YH_BASE_URL: "https://u:p@x.com" }); return !r.ok && r.code === "base-url-has-credentials"; })());
  check("37e env path/query reddedilir", (() => { const r = validateEnv({ ...okEnv, YH_BASE_URL: "https://x.com/api?a=1" }); return !r.ok && r.code === "base-url-has-path-query-hash"; })());
  check("37f env admin id geçersiz", (() => { const r = validateEnv({ ...okEnv, YH_ADMIN_ID: "not-uuid" }); return !r.ok && r.code === "invalid-admin-id"; })());
  check("37g env token eksik", (() => { const r = validateEnv({ ...okEnv, YH_SESSION_TOKEN: "" }); return !r.ok && r.code === "missing-session-token"; })());

  // ═══ main() no-network yolları + secret redaction ═══════════════════════
  {
    // console yakala (secret sızıntısı testi). --execute + geçersiz admin id → ağ ÖNCESİ çıkar.
    const captured: string[] = [];
    const origLog = console.log, origErr = console.error;
    console.log = (...a: unknown[]) => { captured.push(a.join(" ")); };
    console.error = (...a: unknown[]) => { captured.push(a.join(" ")); };
    let codeNoArg = -1, codeResume = -1, codeBadEnv = -1;
    try {
      codeNoArg = await main([], {});
      codeResume = await main(["--resume"], {});
      codeBadEnv = await main(["--execute"], { YH_BASE_URL: "https://x.com", YH_ADMIN_ID: "bad-id", YH_SESSION_TOKEN: "SUPERSECRETTOKEN9999" });
    } finally {
      console.log = origLog; console.error = origErr;
    }
    check("1b main([]) no-op → 0", codeNoArg === 0);
    check("2b main(['--resume']) → 2 (ağ yok)", codeResume === 2);
    check("37h main(['--execute'],badEnv) → 2 (ağdan önce)", codeBadEnv === 2);
    const blob = captured.join("\n");
    check("39 session token loglanmaz", !blob.includes("SUPERSECRETTOKEN9999"));
    check("40 admin id tam loglanmaz", !blob.includes("bad-id"));
    check("38/41/42 response/içerik/env-değeri loglanmaz", !blob.includes("https://x.com") && blob.includes("invalid-admin-id"));
    check("43 usage env DEĞER değil AD gösterir", blob.includes("YH_SESSION_TOKEN") && !blob.includes("SUPERSECRETTOKEN9999"));
  }

  // ═══ Gerçek ağ yapılmadı ════════════════════════════════════════════════
  check("25/54 harness gerçek fetch yapmadı", realFetchCalls === 0);
  check("isUuid doğru", isUuid(U1) && !isUuid("x") && !isUuid(null));

  console.log("");
  console.log("S2.19-BF/BF-1A+BF-1B-FIX dogaltas:knowledge dry-run driver harness — saf/mock; GERÇEK AĞ/SQL/production YOK.");
  console.log(`CHECK: ${passed} kontrol OK, ${failed} FAIL.`);
  console.log("- CLI kapısı (--execute/--resume; no-op no-network); body sabit 3/4 alan; exact response validation");
  console.log("- cursor monotonluk/tekrar/geri/null/invalid; maxPages/maxRows; tüm HTTP/redirect/timeout/network DUR");
  console.log("- checkpoint atomik+secret-yok; resume kuralları; secret redaction; gerçek fetch=0");
  console.log("- BF-1B-FIX: excludedSynthetic zorunlu response alanı (eksik/geçersiz fail-closed); STATE_VERSION=2; v1/eksik-metrik state reddedilir; totalExcludedSynthetic toplanır/resume edilir; demo'dan ayrı");
  if (failed > 0) process.exitCode = 1;
}

void main2();
