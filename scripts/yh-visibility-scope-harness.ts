// Yaşam Hafızası™ — S2.13 Retrieval Görünürlük Kararı izole harness (saf; DB'siz).
//
// evaluateVisibility(candidate, context, stoneExclusionPort) → VisibilityDecision
// orkestrasyonunu enjekte edilmiş FAKE/spy port ile doğrular. GERÇEK evaluateVisibility
// import edilir (kopya/taklit YOK). Gerçek DB / Supabase / IO / env / network YOK.
// Çalıştırma:  npx tsx scripts/yh-visibility-scope-harness.ts

import {
  evaluateVisibility,
  type StoneExclusionPort,
  type VisibilityCandidate,
  type VisibilityContext,
  type VisibilityReasonCode,
} from "../lib/yasam-hafizasi/search/visibilityScope";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";

/** Spy port: çağrıları kaydeder; verilen davranışı uygular. */
function makePort(
  behavior:
    | { kind: "excluded" }
    | { kind: "allowed" }
    | { kind: "throw" }
    | { kind: "reject" }
    | { kind: "non-boolean" },
): StoneExclusionPort & {
  calls: Array<{ sessionTenantId: string; stoneSourceId: string }>;
} {
  const calls: Array<{ sessionTenantId: string; stoneSourceId: string }> = [];
  const port = ((input: { sessionTenantId: string; stoneSourceId: string }) => {
    calls.push({ sessionTenantId: input.sessionTenantId, stoneSourceId: input.stoneSourceId });
    switch (behavior.kind) {
      case "excluded":
        return true;
      case "allowed":
        return false;
      case "throw":
        throw new Error("gizli-detay: exclusion tablo hatası " + input.sessionTenantId);
      case "reject":
        return Promise.reject(new Error("gizli-detay: async red " + input.stoneSourceId));
      case "non-boolean":
        // Kasıtlı geçersiz cevap (runtime fail-closed doğrulaması).
        return "evet" as unknown as boolean;
    }
  }) as StoneExclusionPort & {
    calls: Array<{ sessionTenantId: string; stoneSourceId: string }>;
  };
  (port as { calls: typeof calls }).calls = calls;
  return port;
}

/** Temel geçerli aday (tenant'a ait, non-PII, non-demo, taş-dışı kaynak). */
function baseCandidate(over: Partial<VisibilityCandidate> = {}): VisibilityCandidate {
  return {
    tenantId: TENANT,
    isClientPii: false,
    isDemoTenant: false,
    isDemoSource: false,
    sourceModule: "sifa_rehberi",
    sourceId: "rec-1",
    ...over,
  };
}

function ctx(over: Partial<VisibilityContext> = {}): VisibilityContext {
  return { sessionTenantId: TENANT, allowShared: false, ...over };
}

const ALLOWED_REASONS: ReadonlySet<VisibilityReasonCode> = new Set([
  "visible-tenant",
  "visible-shared",
  "hidden-session-tenant",
  "hidden-candidate-tenant",
  "hidden-tenant",
  "hidden-shared-disabled",
  "hidden-pii",
  "hidden-demo",
  "hidden-stone-id-missing",
  "hidden-stone-exclusion",
  "hidden-exclusion-error",
]);

async function main(): Promise<void> {
  // ─── A. TENANT ───────────────────────────────────────────────────────────
  {
    const port = makePort({ kind: "allowed" });
    const d = await evaluateVisibility(baseCandidate(), ctx(), port);
    check("1 aynı tenant görünür", d.visible && d.reasonCode === "visible-tenant");
    check("1b non-stone → port çağrılmaz", port.calls.length === 0);
  }
  {
    const d = await evaluateVisibility(
      baseCandidate({ tenantId: OTHER_TENANT }),
      ctx(),
      makePort({ kind: "excluded" }),
    );
    check("2 farklı tenant görünmez", !d.visible && d.reasonCode === "hidden-tenant");
  }
  {
    const d = await evaluateVisibility(baseCandidate(), ctx({ sessionTenantId: "" }), makePort({ kind: "allowed" }));
    check("3 boş session tenant fail-closed", !d.visible && d.reasonCode === "hidden-session-tenant");
  }
  {
    const d = await evaluateVisibility(baseCandidate(), ctx({ sessionTenantId: "   " }), makePort({ kind: "allowed" }));
    check("4 whitespace session tenant fail-closed", !d.visible && d.reasonCode === "hidden-session-tenant");
  }
  {
    // Geçersiz candidate tenant (non-string, cast ile).
    const d = await evaluateVisibility(
      baseCandidate({ tenantId: 123 as unknown as string }),
      ctx(),
      makePort({ kind: "allowed" }),
    );
    check("5 geçersiz candidate tenant fail-closed", !d.visible && d.reasonCode === "hidden-candidate-tenant");
  }
  {
    const d = await evaluateVisibility(baseCandidate({ tenantId: "   " }), ctx(), makePort({ kind: "allowed" }));
    check("6 boş/whitespace candidate tenant shared kabul edilmez", !d.visible && d.reasonCode === "hidden-candidate-tenant");
  }

  // ─── B. SHARED ───────────────────────────────────────────────────────────
  {
    const d = await evaluateVisibility(baseCandidate({ tenantId: null }), ctx({ allowShared: true }), makePort({ kind: "allowed" }));
    check("7 null tenant + allowShared true görünür", d.visible && d.reasonCode === "visible-shared");
  }
  {
    const d = await evaluateVisibility(baseCandidate({ tenantId: null }), ctx({ allowShared: false }), makePort({ kind: "allowed" }));
    check("8 null tenant + allowShared false görünmez", !d.visible && d.reasonCode === "hidden-shared-disabled");
  }

  // ─── C. PII ──────────────────────────────────────────────────────────────
  {
    const d = await evaluateVisibility(baseCandidate({ isClientPii: true }), ctx(), makePort({ kind: "allowed" }));
    check("9 isClientPii true görünmez", !d.visible && d.reasonCode === "hidden-pii");
  }
  {
    const d = await evaluateVisibility(baseCandidate({ isClientPii: false }), ctx(), makePort({ kind: "allowed" }));
    check("10 isClientPii false devam eder → görünür", d.visible);
  }
  {
    const d = await evaluateVisibility(baseCandidate({ isClientPii: true }), ctx(), makePort({ kind: "allowed" }));
    check("11 PII + aynı tenant → hidden-pii", d.reasonCode === "hidden-pii");
  }
  {
    const d = await evaluateVisibility(baseCandidate({ tenantId: null, isClientPii: true }), ctx({ allowShared: true }), makePort({ kind: "allowed" }));
    check("12 PII + shared → hidden-pii", d.reasonCode === "hidden-pii");
  }
  {
    // isClientPii undefined (cast) → fail-closed hidden-pii.
    const d = await evaluateVisibility(baseCandidate({ isClientPii: undefined as unknown as boolean }), ctx(), makePort({ kind: "allowed" }));
    check("12b isClientPii undefined → hidden-pii (fail-closed)", !d.visible && d.reasonCode === "hidden-pii");
  }

  // ─── D. DEMO ─────────────────────────────────────────────────────────────
  {
    const d = await evaluateVisibility(baseCandidate({ isDemoTenant: true }), ctx(), makePort({ kind: "allowed" }));
    check("13 demo tenant görünmez", !d.visible && d.reasonCode === "hidden-demo");
  }
  {
    const d = await evaluateVisibility(baseCandidate({ isDemoSource: true }), ctx(), makePort({ kind: "allowed" }));
    check("14 demo source görünmez", !d.visible && d.reasonCode === "hidden-demo");
  }
  {
    const d = await evaluateVisibility(baseCandidate({ tenantId: null, isDemoTenant: true }), ctx({ allowShared: true }), makePort({ kind: "allowed" }));
    check("15 demo + shared → hidden-demo", d.reasonCode === "hidden-demo");
  }
  {
    const d = await evaluateVisibility(baseCandidate(), ctx(), makePort({ kind: "allowed" }));
    check("16 normal tenant + normal source devam → görünür", d.visible && d.reasonCode === "visible-tenant");
  }
  {
    // demo flag undefined (cast) → fail-closed hidden-demo.
    const d = await evaluateVisibility(baseCandidate({ isDemoTenant: undefined as unknown as boolean }), ctx(), makePort({ kind: "allowed" }));
    check("16b demo flag undefined → hidden-demo (fail-closed)", !d.visible && d.reasonCode === "hidden-demo");
  }

  // ─── E. STONE EXCLUSION ──────────────────────────────────────────────────
  {
    const port = makePort({ kind: "excluded" });
    const d = await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "stone-1" }), ctx(), port);
    check("17 exclusion içindeki stone görünmez", !d.visible && d.reasonCode === "hidden-stone-exclusion");
    check("17b port çağrıldı", port.calls.length === 1);
  }
  {
    const port = makePort({ kind: "allowed" });
    const d = await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "stone-1" }), ctx(), port);
    check("18 exclusion dışı stone görünür", d.visible && d.reasonCode === "visible-tenant");
    check("18b port çağrıldı", port.calls.length === 1);
  }
  {
    const port = makePort({ kind: "excluded" });
    await evaluateVisibility(baseCandidate({ sourceModule: "sifa_rehberi" }), ctx(), port);
    check("19 stone olmayan kaynakta port çağrılmaz", port.calls.length === 0);
  }
  {
    const port = makePort({ kind: "excluded" });
    await evaluateVisibility(baseCandidate({ tenantId: OTHER_TENANT, sourceModule: "dogaltas", sourceId: "stone-1" }), ctx(), port);
    check("20 farklı tenant adayında port çağrılmaz", port.calls.length === 0);
  }
  {
    const port = makePort({ kind: "excluded" });
    await evaluateVisibility(baseCandidate({ isClientPii: true, sourceModule: "dogaltas", sourceId: "stone-1" }), ctx(), port);
    check("21 PII adayında port çağrılmaz", port.calls.length === 0);
  }
  {
    const port = makePort({ kind: "excluded" });
    await evaluateVisibility(baseCandidate({ isDemoTenant: true, sourceModule: "dogaltas", sourceId: "stone-1" }), ctx(), port);
    check("22 demo adayında port çağrılmaz", port.calls.length === 0);
  }
  {
    const port = makePort({ kind: "throw" });
    const d = await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "stone-1" }), ctx(), port);
    check("23 port throw → fail-closed", !d.visible && d.reasonCode === "hidden-exclusion-error");
  }
  {
    const port = makePort({ kind: "reject" });
    const d = await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "stone-1" }), ctx(), port);
    check("23b port async reject → fail-closed", !d.visible && d.reasonCode === "hidden-exclusion-error");
  }
  {
    // Farklı tenant'ın exclusion kaydı, aynı tenant adayını etkilemez:
    // port yalnız verilen sessionTenantId için sorgulanır; sonuç false → görünür.
    const port = makePort({ kind: "allowed" });
    const d = await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "stone-1" }), ctx(), port);
    check("24 başka tenant exclusion'ı etkilemez", d.visible && port.calls[0]?.sessionTenantId === TENANT);
  }
  {
    const port = makePort({ kind: "excluded" });
    const d = await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "   " }), ctx(), port);
    check("25 stone kimliği eksik → fail-closed", !d.visible && d.reasonCode === "hidden-stone-id-missing");
    check("25b eksik kimlikte port çağrılmaz", port.calls.length === 0);
  }
  {
    const port = makePort({ kind: "excluded" });
    await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "stone-1" }), ctx(), port);
    check("26 port yalnız bir kez çağrılır", port.calls.length === 1);
  }
  {
    const port = makePort({ kind: "allowed" });
    await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "  stone-9  " }), ctx(), port);
    check("27 porta doğru session tenant gönderilir", port.calls[0]?.sessionTenantId === TENANT);
    check("28 porta doğru (trim'li) stabil stone kimliği gönderilir", port.calls[0]?.stoneSourceId === "stone-9");
  }
  {
    const port = makePort({ kind: "non-boolean" });
    const d = await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "stone-1" }), ctx(), port);
    check("28b port non-boolean cevap → fail-closed", !d.visible && d.reasonCode === "hidden-exclusion-error");
  }

  // ─── F. DETERMİNİZM VE MUTASYON ──────────────────────────────────────────
  {
    const c = baseCandidate({ sourceModule: "dogaltas", sourceId: "stone-1" });
    const context = ctx();
    const d1 = await evaluateVisibility(c, context, makePort({ kind: "excluded" }));
    const d2 = await evaluateVisibility(c, context, makePort({ kind: "excluded" }));
    check("29 aynı input aynı kararı üretir", d1.visible === d2.visible && d1.reasonCode === d2.reasonCode);
  }
  {
    const c = baseCandidate({ sourceModule: "dogaltas", sourceId: "  stone-1  " });
    const snapshot = JSON.stringify(c);
    await evaluateVisibility(c, ctx(), makePort({ kind: "excluded" }));
    check("30 candidate input mutate edilmez", JSON.stringify(c) === snapshot);
  }
  {
    const context = ctx({ allowShared: true });
    const snapshot = JSON.stringify(context);
    await evaluateVisibility(baseCandidate({ tenantId: null }), context, makePort({ kind: "allowed" }));
    check("31 context input mutate edilmez", JSON.stringify(context) === snapshot);
  }
  {
    // Global state yok: bağımsız iki çağrı birbirini etkilemez.
    const dEx = await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "s" }), ctx(), makePort({ kind: "excluded" }));
    const dOk = await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "s" }), ctx(), makePort({ kind: "allowed" }));
    check("32/33 önceki çağrı sonrakini etkilemez (global state yok)", dEx.reasonCode === "hidden-stone-exclusion" && dOk.visible);
  }

  // ─── G. REASON CODE GÜVENLİĞİ ────────────────────────────────────────────
  {
    // Tüm üretilebilir reason code'lar kapalı union içinde.
    const samples: VisibilityReasonCode[] = [];
    samples.push((await evaluateVisibility(baseCandidate(), ctx(), makePort({ kind: "allowed" }))).reasonCode);
    samples.push((await evaluateVisibility(baseCandidate({ tenantId: null }), ctx({ allowShared: true }), makePort({ kind: "allowed" }))).reasonCode);
    samples.push((await evaluateVisibility(baseCandidate(), ctx({ sessionTenantId: "" }), makePort({ kind: "allowed" }))).reasonCode);
    samples.push((await evaluateVisibility(baseCandidate({ tenantId: 1 as unknown as string }), ctx(), makePort({ kind: "allowed" }))).reasonCode);
    samples.push((await evaluateVisibility(baseCandidate({ tenantId: OTHER_TENANT }), ctx(), makePort({ kind: "allowed" }))).reasonCode);
    samples.push((await evaluateVisibility(baseCandidate({ tenantId: null }), ctx(), makePort({ kind: "allowed" }))).reasonCode);
    samples.push((await evaluateVisibility(baseCandidate({ isClientPii: true }), ctx(), makePort({ kind: "allowed" }))).reasonCode);
    samples.push((await evaluateVisibility(baseCandidate({ isDemoTenant: true }), ctx(), makePort({ kind: "allowed" }))).reasonCode);
    samples.push((await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: " " }), ctx(), makePort({ kind: "excluded" }))).reasonCode);
    samples.push((await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "s" }), ctx(), makePort({ kind: "excluded" }))).reasonCode);
    samples.push((await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "s" }), ctx(), makePort({ kind: "throw" }))).reasonCode);
    check("34 reason code sabit union değerlerinden biri", samples.every((r) => ALLOWED_REASONS.has(r)));

    const throwPort = makePort({ kind: "throw" });
    const errDecision = await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "stone-77" }), ctx({ sessionTenantId: TENANT }), throwPort);
    const rc = errDecision.reasonCode;
    check("35 reason code tenant ID içermez", !rc.includes(TENANT));
    check("36 reason code stone ID içermez", !rc.includes("stone-77"));
    check("37 port hata mesajı reason code'a sızmaz", !rc.includes("gizli-detay"));
    check("38 ham hata/stack dönmez (yalnız {visible,reasonCode})", Object.keys(errDecision).sort().join(",") === "reasonCode,visible");
  }

  // ─── H. FAIL-CLOSED ──────────────────────────────────────────────────────
  {
    // Tanımsız gerekli alan (sourceModule) — güvenlik kuralları geçilse bile
    // taş-dışı sayılır; ama tenant/PII/demo geçtikten sonra görünür olması normaldir.
    // Kritik fail-closed: geçersiz session/candidate/PII/demo/port zaten yukarıda.
    const d = await evaluateVisibility(
      baseCandidate({ isClientPii: "no" as unknown as boolean }),
      ctx(),
      makePort({ kind: "allowed" }),
    );
    check("39 beklenmeyen (non-bool) PII alanı görünür kabul edilmez", !d.visible && d.reasonCode === "hidden-pii");
  }
  {
    const d = await evaluateVisibility(baseCandidate({ sourceModule: "dogaltas", sourceId: "s" }), ctx(), makePort({ kind: "non-boolean" }));
    check("40 geçersiz dependency cevabı görünür kabul edilmez", !d.visible && d.reasonCode === "hidden-exclusion-error");
  }
  {
    // allowShared yalnız kesin true iken shared görünür (truthy 1 yetmez).
    const d = await evaluateVisibility(baseCandidate({ tenantId: null }), ctx({ allowShared: 1 as unknown as boolean }), makePort({ kind: "allowed" }));
    check("41 allowShared yalnız kesin true'da shared sağlar", !d.visible && d.reasonCode === "hidden-shared-disabled");
  }
  {
    // isClientPii yalnız kesin false iken ilerler (truthy 0 dahi engellenir).
    const d = await evaluateVisibility(baseCandidate({ isClientPii: 0 as unknown as boolean }), ctx(), makePort({ kind: "allowed" }));
    check("42 isClientPii yalnız kesin false'da ilerler", !d.visible && d.reasonCode === "hidden-pii");
  }

  // ─── Özet ────────────────────────────────────────────────────────────────
  console.log("");
  console.log("S2.13 visibilityScope harness — saf; DB/ağ/env YOK.");
  console.log("");
  console.log(`CHECK: ${passed} kontrol OK, ${failed} FAIL.`);
  console.log("- öncelik: session → candidate-tenant → PII → demo → tenant/shared → stone-exclusion → görünür");
  console.log("- fail-closed: boş/whitespace/geçersiz session/candidate; PII yalnız kesin false; demo yalnız kesin false; allowShared yalnız kesin true");
  console.log("- stone port: yalnız dogaltas + tenant/PII/demo geçmiş adayda; farklı tenant/PII/demo/eksik-kimlikte çağrılmaz; tek çağrı; throw/reject/non-boolean → fail-closed");
  console.log("- reason code kapalı union; ham tenant/stone id / hata mesajı sızmaz; input mutasyonu ve global state yok");

  if (failed > 0) {
    console.error(`\n✗ ${failed} kontrol BAŞARISIZ.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Harness beklenmeyen hata:", err);
  process.exit(1);
});
