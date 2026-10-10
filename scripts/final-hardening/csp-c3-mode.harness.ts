/**
 * CSP NONCE C3 harness — rollout switch `CSP_NONCE_MODE` (off | canary | all) (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/final-hardening/csp-c3-mode.harness.ts
 *
 * Kapsam:
 *   - mod çözümü: off/canary/all; boş/geçersiz → off; eski CSP_NONCE_CANARY yalnız mod
 *     tanımsızken (→ canary, asla all); CSP_NONCE_MODE=off eski env'i EZER (kill-switch)
 *   - OFF / CANARY / ALL matrisi: proxy() uçtan uca × doküman yolları × cookie var/yok;
 *     /admin redirect; API/statik/RSC proxy DIŞI ve next.config CSP'si nonce'suz
 *   - nonce kabulü: script-src nonce + 'strict-dynamic', 'unsafe-inline' YOK; style-src
 *     'unsafe-inline' VAR; istek başına farklı nonce; istek CSP == yanıt CSP
 *   - fail-safe her modda normal CSP (CSP asla düşmez); rollback all → off normal CSP'ye döner
 *   - NEGATİF (mutasyon): documentCsp.ts kaynağı bilinçli bozulur → ilgili kontrol FAIL vermeli
 *   - HTML nonce sayacı: gerekli script'lerden biri nonce'suzsa FAIL
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import type { NextRequest as NextRequestT } from "next/server";
import { buildEnforcedCsp, buildSecurityHeaders } from "../../lib/security/securityHeaders";
import * as realCsp from "../../lib/security/documentCsp";
import { CSP_CANARY_COOKIE, CSP_CANARY_ENV, CSP_NONCE_MODE_ENV } from "../../lib/security/documentCsp";

(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NextRequest } = require("next/server") as { NextRequest: typeof NextRequestT };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getMiddlewareMatchers } = require("next/dist/build/analysis/get-page-static-info");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getMiddlewareRouteMatcher } = require("next/dist/shared/lib/router/utils/middleware-route-matcher");

const ROOT = path.resolve(__dirname, "..", "..");

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`FAIL ${name}:`, (e as Error).message);
  }
}

const SB = "https://abcd1234.supabase.co";
const BASE = { NEXT_PUBLIC_SUPABASE_URL: SB, NODE_ENV: "production" };
const NORMAL = buildEnforcedCsp({ supabaseUrl: SB });
type Env = Record<string, string | undefined>;
type CspModule = typeof realCsp;
const jar = (v?: string) => ({ get: (n: string) => (n === CSP_CANARY_COOKIE && v !== undefined ? { value: v } : undefined) });
const directive = (csp: string, name: string) =>
  csp.split(";").map((d) => d.trim()).find((d) => d === name || d.startsWith(name + " ")) ?? "";
const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1] ?? null;

/** Nonce'lu politika kabul kriteri. */
function assertNoncePolicy(csp: string) {
  const s = directive(csp, "script-src");
  assert.ok(nonceOf(csp), "nonce yok");
  assert.ok(s.includes("'strict-dynamic'"), "strict-dynamic yok");
  assert.ok(!s.includes("'unsafe-inline'"), "script-src unsafe-inline");
  assert.equal(directive(csp, "style-src"), "style-src 'self' 'unsafe-inline'");
}
function assertNormalPolicy(csp: string | null | undefined) {
  assert.equal(csp, NORMAL, "normal (production-eşit) CSP değil");
  assert.equal(nonceOf(csp!), null);
  assert.match(directive(csp!, "script-src"), /'unsafe-inline'/);
}

/**
 * Mod sözleşmesi — hem gerçek modülde (0 hata beklenir) hem mutantlarda (≥1 hata beklenir) koşar.
 * Hata adlarını döndürür.
 */
function contractFailures(m: CspModule): string[] {
  const out: string[] = [];
  const chk = (name: string, fn: () => void) => {
    try {
      fn();
    } catch {
      out.push(name);
    }
  };
  const r = (env: Env, cookie?: string, genNonce?: () => string) =>
    m.resolveDocumentCsp(jar(cookie), { env: { ...BASE, ...env }, ...(genNonce ? { genNonce } : {}) });

  chk("off-no-nonce", () => {
    for (const c of [undefined, "1"]) {
      const x = r({ [CSP_NONCE_MODE_ENV]: "off" }, c);
      assertNormalPolicy(x.policy);
      assert.equal(x.nonce, null);
    }
  });
  chk("canary-cookieless-normal", () => {
    for (const c of [undefined, "", "0", "true", "on", "1 "]) assertNormalPolicy(r({ [CSP_NONCE_MODE_ENV]: "canary" }, c).policy);
  });
  chk("canary-cookie-nonce", () => assertNoncePolicy(r({ [CSP_NONCE_MODE_ENV]: "canary" }, "1").policy));
  chk("all-no-cookie-needed", () => {
    for (const c of [undefined, "0", "1"]) assertNoncePolicy(r({ [CSP_NONCE_MODE_ENV]: "all" }, c).policy);
  });
  chk("invalid-is-off", () => {
    for (const v of ["", " ", "ALL ", "al", "alll", "on", "true", "1", "yes", "everyone", "canary,all", "all;", "nonce"]) {
      const expectAll = v.trim().toLowerCase() === "all";
      const x = r({ [CSP_NONCE_MODE_ENV]: v }, undefined);
      if (expectAll) assertNoncePolicy(x.policy);
      else assertNormalPolicy(x.policy);
    }
  });
  chk("legacy-fallback-canary-only", () => {
    assertNormalPolicy(r({ [CSP_CANARY_ENV]: "on" }, undefined).policy);
    assertNoncePolicy(r({ [CSP_CANARY_ENV]: "on" }, "1").policy);
    for (const v of ["all", "off", "1", "true", ""]) assertNormalPolicy(r({ [CSP_CANARY_ENV]: v }, "1").policy);
  });
  chk("rollback-off-overrides-legacy", () => {
    for (const c of [undefined, "1"]) assertNormalPolicy(r({ [CSP_NONCE_MODE_ENV]: "off", [CSP_CANARY_ENV]: "on" }, c).policy);
  });
  chk("failsafe-keeps-csp", () => {
    for (const mode of ["canary", "all"]) {
      const a = r({ [CSP_NONCE_MODE_ENV]: mode }, "1", () => {
        throw new Error("no rng");
      });
      const b = r({ [CSP_NONCE_MODE_ENV]: mode }, "1", () => "bad'");
      for (const x of [a, b]) assertNormalPolicy(x.policy);
    }
  });
  chk("unique-nonce", () => {
    const a = r({ [CSP_NONCE_MODE_ENV]: "all" });
    const b = r({ [CSP_NONCE_MODE_ENV]: "all" });
    assert.ok(a.nonce && b.nonce && a.nonce !== b.nonce);
  });
  return out;
}

/** HTML'deki gerekli (sunucu render'ı) script'lerin tamamı aynı nonce'u taşıyor mu. */
export function htmlNonceReport(html: string, headerNonce: string | null) {
  const tags = html.match(/<script\b[^>]*>/g) ?? [];
  const nonces = tags.map((tag) => /\snonce="([^"]*)"/.exec(tag)?.[1] ?? null);
  return {
    total: tags.length,
    nonced: nonces.filter((n) => n && n === headerNonce).length,
    missing: nonces.filter((n) => !n).length,
    mismatched: nonces.filter((n) => n && n !== headerNonce).length,
  };
}
function assertAllNonced(html: string, headerNonce: string | null) {
  const rep = htmlNonceReport(html, headerNonce);
  assert.ok(rep.total > 0, "script yok");
  assert.equal(rep.missing, 0, `nonce'suz script: ${rep.missing}`);
  assert.equal(rep.mismatched, 0, `yanlış nonce: ${rep.mismatched}`);
  assert.equal(rep.nonced, rep.total);
}

(async () => {
  // ── 1) Mod çözümü ──────────────────────────────────────────────────────────
  await t("mod: off/canary/all; büyük-küçük harf + boşluk toleransı", () => {
    const m = (v: string | undefined, legacy?: string) =>
      realCsp.resolveCspNonceMode({ ...BASE, [CSP_NONCE_MODE_ENV]: v, ...(legacy ? { [CSP_CANARY_ENV]: legacy } : {}) });
    assert.equal(m("off"), "off");
    assert.equal(m("canary"), "canary");
    assert.equal(m("all"), "all");
    assert.equal(m(" ALL "), "all");
    assert.equal(m("Canary"), "canary");
    assert.equal(m(""), "off");
    assert.equal(m("everyone"), "off");
    assert.equal(m("off", "on"), "off", "MODE=off eski env'i ezmeli");
    assert.equal(m("bogus", "on"), "off", "geçersiz MODE eski env'e düşmemeli");
    assert.equal(realCsp.resolveCspNonceMode({ ...BASE }), "off");
    assert.equal(realCsp.resolveCspNonceMode({ ...BASE, [CSP_CANARY_ENV]: "on" }), "canary");
    assert.equal(realCsp.resolveCspNonceMode({ ...BASE, [CSP_CANARY_ENV]: "all" }), "off");
  });
  await t("isCspCanaryEnabled yalnız canary modunda true", () => {
    assert.equal(realCsp.isCspCanaryEnabled({ [CSP_NONCE_MODE_ENV]: "canary" }), true);
    assert.equal(realCsp.isCspCanaryEnabled({ [CSP_NONCE_MODE_ENV]: "all" }), false);
    assert.equal(realCsp.isCspCanaryEnabled({ [CSP_CANARY_ENV]: "on" }), true);
    assert.equal(realCsp.isCspCanaryEnabled({ [CSP_NONCE_MODE_ENV]: "off", [CSP_CANARY_ENV]: "on" }), false);
  });
  await t("sözleşme: gerçek modül tüm kontrolleri geçer", () => {
    assert.deepEqual(contractFailures(realCsp), []);
  });
  await t("normal politika production (buildSecurityHeaders) ile byte-eşit", () => {
    const prod = buildSecurityHeaders({ supabaseUrl: SB }).find((h) => h.key === "Content-Security-Policy")!.value;
    assert.equal(NORMAL, prod);
  });

  // ── 2) NEGATİF: mutasyonlar yakalanmalı ────────────────────────────────────
  const SRC_PATH = path.join(ROOT, "lib/security/documentCsp.ts");
  const SRC = fs.readFileSync(SRC_PATH, "utf8").replace(/\r\n/g, "\n");
  const MUTANTS: Array<[string, string, string, string]> = [
    // [ad, aranan, yerine, beklenen yakalayan kontrol]
    ["geçersiz env → all", `return v === "canary" || v === "all" ? v : "off";`, `return v === "canary" || v === "off" ? v : "all";`, "invalid-is-off"],
    ["off nonce üretir", `if (mode === "off") return normal();`, ``, "off-no-nonce"],
    ["canary cookie'siz nonce", `if (mode === "canary" && cookies.get(CSP_CANARY_COOKIE)?.value !== "1") return normal();`, ``, "canary-cookieless-normal"],
    ["all cookie ister", `if (mode === "canary" && cookies.get(`, `if (cookies.get(`, "all-no-cookie-needed"],
    ["fail-safe CSP'yi düşürür", `    // FAIL-SAFE: canary başarısız → normal zorunlu CSP (güvenlik başlığı kaybolmaz).\n    return normal();`, `    return { policy: "", nonce: null, canary: false, mode };`, "failsafe-keeps-csp"],
    ["rollback off eski env'e düşer", `if (raw !== undefined) {`, `if (raw !== undefined && raw.trim().toLowerCase() !== "off") {`, "rollback-off-overrides-legacy"],
    ["eski env all açar", `=== "on" ? "canary" : "off";`, `=== "on" ? "canary" : (String(env[CSP_CANARY_ENV] ?? "").trim() === "all" ? "all" : "off");`, "legacy-fallback-canary-only"],
    ["sabit nonce", `const nonce = (deps.genNonce ?? generateCspNonce)();`, `const nonce = deps.genNonce ? deps.genNonce() : "AAAAAAAAAAAAAAAAAAAAAA==";`, "unique-nonce"],
  ];
  for (const [name, find, repl, expected] of MUTANTS) {
    await t(`NEGATİF mutasyon yakalanır: ${name}`, async () => {
      assert.ok(SRC.includes(find), `mutasyon hedefi kaynakta yok: ${find}`);
      const file = path.join(ROOT, "lib/security", `.mutant-${process.pid}-${MUTANTS.findIndex((x) => x[0] === name)}.ts`);
      fs.writeFileSync(file, SRC.replace(find, repl));
      try {
        const mod = (await import(pathToFileURL(file).href)) as CspModule & { default?: CspModule };
        const fails = contractFailures((mod.default ?? mod) as CspModule);
        assert.ok(fails.includes(expected), `${name}: beklenen '${expected}' FAIL vermedi (${fails.join(",") || "hiç FAIL yok"})`);
      } finally {
        fs.rmSync(file, { force: true });
      }
    });
  }
  await t("NEGATİF: script-src'ye unsafe-inline geri dönerse kabul FAIL", () => {
    const good = realCsp.resolveDocumentCsp(jar(), { env: { ...BASE, [CSP_NONCE_MODE_ENV]: "all" } }).policy;
    assertNoncePolicy(good);
    assert.throws(() => assertNoncePolicy(good.replace("'strict-dynamic'", "'strict-dynamic' 'unsafe-inline'")));
    assert.throws(() => assertNoncePolicy(good.replace(" 'strict-dynamic'", "")));
    assert.throws(() => assertNoncePolicy(good.replace(/'nonce-[^']+' /, "")));
    assert.throws(() => assertNoncePolicy(good.replace("style-src 'self' 'unsafe-inline'", "style-src 'self'")));
  });
  await t("NEGATİF: HTML'de gerekli script nonce'suzsa FAIL", () => {
    const n = "QUJDREVGR0hJSktMTU5PUA==";
    const ok = `<script src="/a.js" nonce="${n}" async=""></script><script nonce="${n}">self.__next_f=[]</script>`;
    assertAllNonced(ok, n);
    assert.throws(() => assertAllNonced(ok + `<script>self.__next_f.push(1)</script>`, n));
    assert.throws(() => assertAllNonced(ok.replace(`nonce="${n}">`, `nonce="WlpaWlpaWlpaWlpaWlpaWg==">`), n));
    assert.throws(() => assertAllNonced(`<div></div>`, n));
  });

  // ── 3) proxy() matrisi (OFF / CANARY / ALL) ────────────────────────────────
  const prevEnv = { ...process.env };
  const setMode = (mode: string | undefined, legacy?: string) => {
    if (mode === undefined) delete process.env[CSP_NONCE_MODE_ENV];
    else process.env[CSP_NONCE_MODE_ENV] = mode;
    if (legacy === undefined) delete process.env[CSP_CANARY_ENV];
    else process.env[CSP_CANARY_ENV] = legacy;
    process.env.NEXT_PUBLIC_SUPABASE_URL = SB;
  };
  const { proxy, config } = await import(pathToFileURL(path.join(ROOT, "proxy.ts")).href).then((m) => m.default ?? m);
  const run = (url: string, cookie?: string) => {
    const res = proxy(new NextRequest(new URL(url, "https://www.yasamsistemi.com"), { headers: cookie ? { cookie } : {} }));
    return { res, reqCsp: res.headers.get("x-middleware-request-content-security-policy"), resCsp: res.headers.get("content-security-policy") };
  };
  const DOCS = ["/", "/numeroloji", "/?login=1", "/register", "/dashboard", "/danisan-yolculugu", "/human-design/kayitli-haritalar"];
  const CANARY = `${CSP_CANARY_COOKIE}=1`;

  const expectFor = (mode: "off" | "canary" | "all", hasCookie: boolean) =>
    mode === "all" || (mode === "canary" && hasCookie) ? "nonce" : "normal";
  for (const mode of ["off", "canary", "all"] as const) {
    await t(`proxy ${mode.toUpperCase()}: doküman yolları × cookie yok/var`, () => {
      setMode(mode);
      for (const p of DOCS) {
        for (const cookie of [undefined, CANARY, "other=1"]) {
          const x = run(p, cookie);
          assert.equal(x.res.status, 200, p);
          assert.equal(x.reqCsp, x.resCsp, `${p}: istek/yanıt CSP farklı`);
          if (expectFor(mode, cookie === CANARY) === "nonce") assertNoncePolicy(x.resCsp!);
          else assertNormalPolicy(x.resCsp);
        }
      }
    });
    await t(`proxy ${mode.toUpperCase()}: /admin cookie'siz → 307 + CSP; oturumlu → 200 + CSP`, () => {
      setMode(mode);
      for (const cookie of [undefined, CANARY]) {
        const r = run("/admin/users", cookie);
        assert.equal(r.res.status, 307);
        assert.equal(new URL(r.res.headers.get("location")!).pathname, "/");
        if (expectFor(mode, cookie === CANARY) === "nonce") assertNoncePolicy(r.resCsp!);
        else assertNormalPolicy(r.resCsp);
        const ok = run("/admin", `yasam_admin_session=x${cookie ? "; " + cookie : ""}`);
        assert.equal(ok.res.status, 200);
        assert.ok(ok.resCsp && ok.resCsp.includes("default-src 'self'"));
      }
    });
  }
  await t("proxy ALL: istek başına farklı nonce; istek CSP nonce'u == yanıt nonce'u", () => {
    setMode("all");
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const x = run("/numeroloji");
      const n = nonceOf(x.resCsp!)!;
      assert.equal(nonceOf(x.reqCsp!), n);
      seen.add(n);
    }
    assert.equal(seen.size, 50);
  });
  await t("proxy: eski env (MODE yok, CANARY=on) bugünkü production davranışı = canary", () => {
    setMode(undefined, "on");
    assertNormalPolicy(run("/").resCsp);
    assertNoncePolicy(run("/", CANARY).resCsp!);
  });
  await t("proxy ROLLBACK: ALL → OFF (eski env on kalsa bile) tüm trafik normal CSP", () => {
    setMode("all", "on");
    assertNoncePolicy(run("/").resCsp!);
    setMode("off", "on");
    for (const p of DOCS) for (const c of [undefined, CANARY]) assertNormalPolicy(run(p, c).resCsp);
  });
  await t("proxy: istemcinin sahte CSP istek başlığı her modda ezilir", () => {
    for (const mode of ["off", "all"]) {
      setMode(mode);
      const res = proxy(new NextRequest(new URL("/", "https://www.yasamsistemi.com"), { headers: { "content-security-policy": "script-src 'nonce-AAAAAAAAAAAAAAAAAAAAAA=='" } }));
      const req = res.headers.get("x-middleware-request-content-security-policy")!;
      assert.notEqual(nonceOf(req), "AAAAAAAAAAAAAAAAAAAAAA==");
      assert.equal(req, res.headers.get("content-security-policy"));
    }
  });
  process.env = prevEnv;

  // ── 4) API / statik / RSC: proxy DIŞI (mod fark etmez; CSP next.config'ten, nonce'suz) ─
  const matchers = getMiddlewareMatchers(config.matcher, { i18n: undefined, basePath: "" });
  const inProxy = getMiddlewareRouteMatcher(matchers);
  const hits = (p: string, headers: Record<string, string> = {}) => {
    const u = new URL(p, "https://x");
    return inProxy(u.pathname, { headers }, Object.fromEntries(u.searchParams));
  };
  await t("ALL modda bile API/statik/RSC/prefetch proxy'ye girmez (nonce yalnız dokümanda)", () => {
    for (const p of ["/api/auth/session", "/api/security/csp-report", "/_next/static/chunks/a.js", "/favicon.ico", "/vendor/roxy-ui/0.48.0/bodygraph.js"]) {
      assert.equal(hits(p), false, p);
    }
    for (const h of [{ rsc: "1" }, { "next-router-prefetch": "1" }, { purpose: "prefetch" }] as Record<string, string>[]) assert.equal(hits("/numeroloji", h), false);
    for (const p of DOCS) assert.equal(hits(p), true, p);
  });
  await t("statik: mod env'i yalnız documentCsp.ts'te okunur; auth/session dosyalarına dokunulmadı", () => {
    const files = ["proxy.ts", "next.config.ts", "lib/security/securityHeaders.ts"];
    for (const f of files) assert.ok(!fs.readFileSync(path.join(ROOT, f), "utf8").includes("process.env.CSP_NONCE"), f);
    assert.ok(!fs.readdirSync(path.join(ROOT, "lib/security")).some((f) => f.startsWith(".mutant-")), "mutant dosyası kaldı");
  });

  console.log(`csp-c3-mode harness: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
