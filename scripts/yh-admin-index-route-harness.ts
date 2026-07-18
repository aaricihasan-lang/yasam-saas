// Yaşam Hafızası™ — S2.11 adminIndexRequest izole harness (saf, fake-deps; DB'siz).
//
// validateAdminIndexRequest + handleAdminIndexRequest'i GERÇEK import ile doğrular.
// Gerçek DB / Supabase / auth / Next runtime YOK. Fake deps enjekte edilir.
// Çalıştırma:  npx tsx scripts/yh-admin-index-route-harness.ts

import {
  handleAdminIndexRequest,
  resolveYhSourceConfig,
  validateAdminIndexRequest,
  type AdminIndexHandlerDeps,
  type SafeAdminIndexAuditEvent,
} from "../lib/yasam-hafizasi/indexer/adminIndexRequest";
import type { IndexSourcePageResult } from "../lib/yasam-hafizasi/indexer/indexSourcePage";
import type { WriteIndexUnitsResult } from "../lib/yasam-hafizasi/indexer/supabaseIndexAdapters";
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

const VALID_KEY = YH_INDEX_SOURCES[0].sourceKey; // gerçek allowlist anahtarı
const ADMIN = "admin-1";

// ── Fake IndexSourcePageResult üreticileri ───────────────────────────────────
function writeResult(over: Partial<WriteIndexUnitsResult> = {}): WriteIndexUnitsResult {
  return {
    attempted: 1, written: 1, plannedInsert: 1, plannedUpdate: 0, unchanged: 0,
    failed: 0, chunksAttempted: 1, chunksSucceeded: 1,
    conflictKey: "source_table,source_id,section_ref", errors: [], ...over,
  };
}
function pageResult(mode: "dry-run" | "write", write: WriteIndexUnitsResult | null, extra: Record<string, unknown> = {}): IndexSourcePageResult {
  return {
    sourceKey: VALID_KEY, mode, fetched: 3, eligibleUnits: 2, excludedDemo: 1,
    summary: { units: 2, skipped: 1, byReason: { "tenant:invalid-tenant": 1 } },
    nextCursor: "cur-9", hasMore: true, parentStats: { requested: 0, found: 0, missing: 0 },
    write,
    ...extra, // redaction testi için ekstra/yabancı alanlar (handler bunları OKUMAZ)
  } as IndexSourcePageResult;
}

// ── Fake deps ────────────────────────────────────────────────────────────────
interface Counters { runCalls: number; demoCalls: number; audits: SafeAdminIndexAuditEvent[] }
function makeDeps(opts: {
  demo?: { ok: true; isDemo: boolean } | { ok: false; code: "demo-check-failed" };
  result?: IndexSourcePageResult;
  throwRun?: boolean;
  auditThrows?: boolean;
} = {}): { deps: AdminIndexHandlerDeps; c: Counters } {
  const c: Counters = { runCalls: 0, demoCalls: 0, audits: [] };
  const deps: AdminIndexHandlerDeps = {
    adminId: ADMIN,
    checkAdminDemoStatus: async () => {
      c.demoCalls += 1;
      return opts.demo ?? { ok: true, isDemo: false };
    },
    runIndexSourcePage: async () => {
      c.runCalls += 1;
      if (opts.throwRun) throw new Error("SECRET_DB_DETAIL boom");
      return opts.result ?? pageResult("dry-run", null);
    },
    writeAuditEvent: async (e) => {
      c.audits.push(e);
      if (opts.auditThrows) throw new Error("audit fail");
    },
  };
  return { deps, c };
}

function vbody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { sourceKey: VALID_KEY, mode: "dry-run", ...over };
}

async function main(): Promise<void> {
  // ═══ A — VALIDATION (33) ═══════════════════════════════════════════════════
  check(validateAdminIndexRequest(vbody({ mode: "dry-run" })).ok, "A valid dry-run");
  check(validateAdminIndexRequest(vbody({ mode: "write" })).ok, "A valid write");
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
  bad(vbody({ limit: -5 }), "invalid-limit");
  bad(vbody({ limit: 1.5 }), "invalid-limit");
  bad(vbody({ limit: "10" }), "invalid-limit");
  bad(vbody({ limit: Number.NaN }), "invalid-limit");
  bad(vbody({ limit: Number.POSITIVE_INFINITY }), "invalid-limit");
  bad(null, "invalid-body");
  bad([1, 2], "invalid-body");
  bad("x", "invalid-body");
  bad(42, "invalid-body");
  bad({ mode: "dry-run" }, "missing-source-key");
  bad({ sourceKey: "", mode: "dry-run" }, "missing-source-key");
  bad({ sourceKey: "   ", mode: "dry-run" }, "missing-source-key");
  bad({ sourceKey: 123, mode: "dry-run" }, "missing-source-key");
  bad({ sourceKey: "nonexistent:key", mode: "dry-run" }, "unknown-source");
  bad(vbody({ mode: "invalid" }), "invalid-mode");
  bad(vbody({ mode: true }), "invalid-mode");
  bad({ sourceKey: VALID_KEY }, "invalid-mode"); // mode eksik
  bad(vbody({ extra: 1 }), "unexpected-field");
  { const r = validateAdminIndexRequest(vbody({ afterId: null })); check(r.ok && r.value.afterId === null, "A afterId null"); }
  { const r = validateAdminIndexRequest(vbody()); check(r.ok && r.value.afterId === null, "A afterId missing"); }
  bad(vbody({ afterId: "" }), "invalid-cursor");
  bad(vbody({ afterId: " x " }), "invalid-cursor"); // baş/son whitespace
  bad(vbody({ afterId: "a".repeat(129) }), "invalid-cursor");
  bad(vbody({ afterId: "a" + String.fromCharCode(0) + "b" }), "invalid-cursor"); // NUL
  bad(vbody({ afterId: "a" + String.fromCharCode(9) + "b" }), "invalid-cursor"); // tab
  bad(vbody({ afterId: "a" + String.fromCharCode(10) + "b" }), "invalid-cursor"); // newline
  bad(vbody({ afterId: "a" + String.fromCharCode(127) + "b" }), "invalid-cursor"); // DEL
  { const r = validateAdminIndexRequest(vbody({ afterId: "66666666-6666-6666-6666-666666666666" })); check(r.ok && r.value.afterId === "66666666-6666-6666-6666-666666666666", "A valid cursor"); }

  // ═══ B — HANDLER (24) ══════════════════════════════════════════════════════
  // dry-run demo çağırmaz, writer null, güvenli map
  {
    const { deps, c } = makeDeps({ result: pageResult("dry-run", null) });
    const { status, body } = await handleAdminIndexRequest(vbody({ mode: "dry-run" }), deps);
    check(status === 200 && body.ok === true && body.mode === "dry-run" && body.write === null, `B1 dry-run ${J(body)}`);
    check(c.demoCalls === 0, "B2 dry-run demo çağırmaz");
    check(c.runCalls === 1, "B3 dry-run tek indeks çağrısı");
    check(body.ok === true && body.page.produced === 2 && body.page.excludedDemo === 1, "B4 dry-run güvenli page map");
  }
  // write başarılı → 200 completed:true
  {
    const { deps, c } = makeDeps({ demo: { ok: true, isDemo: false }, result: pageResult("write", writeResult()) });
    const { status, body } = await handleAdminIndexRequest(vbody({ mode: "write" }), deps);
    check(status === 200 && body.ok === true && body.mode === "write", `B5 write ok ${J(body)}`);
    check(body.ok === true && body.mode === "write" && body.write.completed === true, "B6 write completed:true");
    check(c.demoCalls === 1 && c.runCalls === 1, "B7 write demo+indeks birer kez");
  }
  // demo admin write → 403
  {
    const { deps, c } = makeDeps({ demo: { ok: true, isDemo: true }, result: pageResult("write", writeResult()) });
    const { status, body } = await handleAdminIndexRequest(vbody({ mode: "write" }), deps);
    check(status === 403 && body.ok === false && "error" in body && body.error.code === "demo-write-forbidden", `B8 demo-write 403 ${J(body)}`);
    check(c.runCalls === 0, "B9 demo-write indeks çağrılmaz");
  }
  // demo check failure → 503
  {
    const { deps, c } = makeDeps({ demo: { ok: false, code: "demo-check-failed" }, result: pageResult("write", writeResult()) });
    const { status, body } = await handleAdminIndexRequest(vbody({ mode: "write" }), deps);
    check(status === 503 && body.ok === false && "error" in body && body.error.code === "demo-check-failed", `B10 demo-check 503 ${J(body)}`);
    check(c.runCalls === 0, "B11 demo-check-fail indeks çağrılmaz");
  }
  // fatal index error → 500
  {
    const { deps } = makeDeps({ demo: { ok: true, isDemo: false }, throwRun: true });
    const { status, body } = await handleAdminIndexRequest(vbody({ mode: "write" }), deps);
    check(status === 500 && body.ok === false && "error" in body && body.error.code === "index-failed", `B12 fatal 500 ${J(body)}`);
    check(J(body).indexOf("SECRET_DB_DETAIL") === -1, "B13 fatal ham hata sızmaz");
  }
  // partial write → 503, ok:false, completed:false
  {
    const w = writeResult({ written: 0, failed: 200, chunksSucceeded: 0, chunksAttempted: 1, attempted: 200, errors: [{ chunkIndex: 0, code: "upsert-failed" }] });
    const { deps, c } = makeDeps({ demo: { ok: true, isDemo: false }, result: pageResult("write", w) });
    const { status, body } = await handleAdminIndexRequest(vbody({ mode: "write" }), deps);
    check(status === 503, `B14 partial 503 (${status})`);
    check(body.ok === false, "B15 partial ok:false");
    check(body.ok === false && "error" in body && body.error.code === "partial-write", "B16 partial-write kodu");
    check(body.ok === false && "write" in body && (body.write as { completed: boolean }).completed === false, "B17 partial completed:false");
    check(c.runCalls === 1, "B18 partial tek indeks çağrısı (ikinci yok)");
  }
  // ok:true + completed:false üretilemez (write success completed her zaman true)
  {
    const { deps } = makeDeps({ demo: { ok: true, isDemo: false }, result: pageResult("write", writeResult()) });
    const { body } = await handleAdminIndexRequest(vbody({ mode: "write" }), deps);
    const okTrueCompletedFalse = body.ok === true && "write" in body && body.write !== null && (body.write as { completed?: boolean }).completed === false;
    check(!okTrueCompletedFalse, "B19 ok:true + completed:false imkânsız");
  }
  // sourceKey yankılanır; registry listesi yok
  {
    const { deps } = makeDeps({ result: pageResult("dry-run", null) });
    const { body } = await handleAdminIndexRequest(vbody({ mode: "dry-run" }), deps);
    check(body.ok === true && body.sourceKey === VALID_KEY, "B20 sourceKey yankılanır");
    check(J(body).indexOf("sources") === -1 && !("sourceKeys" in (body as object)), "B21 registry listesi response'ta yok");
  }
  // redaction: fake result'a gömülen yabancı/PII alanlar response'a sızmaz
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

  // ═══ C — AUDIT (6) ═════════════════════════════════════════════════════════
  {
    const { deps, c } = makeDeps({ result: pageResult("dry-run", null) });
    await handleAdminIndexRequest(vbody({ mode: "dry-run", afterId: "66666666-6666-6666-6666-666666666666" }), deps);
    check(c.audits.length === 1 && c.audits[0].outcome === "dry-run-ok", "C1 dry-run audit");
    check(c.audits[0].cursorPresent === true, "C2 cursorPresent bool");
    check(J(c.audits[0]).indexOf("66666666-6666") === -1, "C3 audit cursor DEĞERİ içermez");
  }
  {
    // audit hatası ana sonucu bozmaz
    const { deps } = makeDeps({ demo: { ok: true, isDemo: false }, result: pageResult("write", writeResult()), auditThrows: true });
    const { status, body } = await handleAdminIndexRequest(vbody({ mode: "write" }), deps);
    check(status === 200 && body.ok === true, "C4 audit hatası ana sonucu bozmaz");
  }
  {
    // partial write audit'i partial-write outcome üretir
    const w = writeResult({ failed: 1, errors: [{ chunkIndex: 1, code: "upsert-failed" }], written: 0 });
    const { deps, c } = makeDeps({ demo: { ok: true, isDemo: false }, result: pageResult("write", w) });
    await handleAdminIndexRequest(vbody({ mode: "write" }), deps);
    check(c.audits.length === 1 && c.audits[0].outcome === "partial-write", "C5 partial audit outcome");
  }
  {
    // resolver: geçerli/geçersiz
    check(resolveYhSourceConfig(VALID_KEY) !== null && resolveYhSourceConfig("yok:yok") === null, "C6 resolveYhSourceConfig");
  }

  // ── Sonuç ─────────────────────────────────────────────────────────────────
  if (errors.length > 0) {
    console.error("S2.11 adminIndexRequest harness — BAŞARISIZ:");
    for (const e of errors) console.error("  ✗ " + e);
    process.exit(1);
  }
  console.log("S2.11 adminIndexRequest harness — saf/fake-deps; DB'siz.");
  console.log("");
  console.log(`CHECK: ${total} kontrol OK (A validation 33 + B handler 24 + C audit 6).`);
  console.log("- validation: body/sourceKey/mode/afterId(kontrol-char red)/limit(1..500 açık ret); unexpected-field red");
  console.log("- handler: dry-run demo çağırmaz+writer null; write demo-gate fail-closed (403/503); fatal 500; partial 503+ok:false+completed:false");
  console.log("- ok:true+completed:false imkânsız; sourceKey yankı; registry listesi yok; ham row/unit/PII/DB-mesaj sızmaz");
  console.log("- audit best-effort (hata ana sonucu bozmaz); cursor DEĞERİ loglanmaz; tek indeks çağrısı");
}

main().catch((e) => {
  console.error("S2.11 harness — beklenmeyen üst-seviye hata:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
