/**
 * CSP NONCE C1-v2 harness — tek kaynak doküman CSP'si (proxy) + canary (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/final-hardening/csp-c1v2.harness.ts
 *
 * Kapsam:
 *   - normal politika production ile BYTE-EŞİT (buildEnforcedCsp == buildSecurityHeaders CSP)
 *   - canary politikası: 'self' 'nonce-…' 'strict-dynamic'; script-src'de 'unsafe-inline' YOK;
 *     style-src 'unsafe-inline' VAR; report-uri; nonce istek başına benzersiz
 *   - proxy(): istek CSP == yanıt CSP (aynı nonce); normal kullanıcı canary ALMAZ; env yok/off
 *     iken cookie YOK SAYILIR; istemcinin gönderdiği CSP istek başlıkları ezilir
 *   - fail-safe: nonce üretimi hata/geçersiz → normal zorunlu CSP (CSP ASLA kaybolmaz)
 *   - matcher (Next'in kendi derleyicisiyle): doküman yolları proxy'de; API/_next/statik/dosya/
 *     prefetch/RSC proxy DIŞI; /admin her istekte proxy'de (redirect korunur)
 *   - next.config: doküman yolu için statik CSP kuralı YOK (#99360); proxy dışı yollarda CSP VAR
 *   - /api/security/csp-report: yalnız POST, içerik türü, boyut, rate limit, redakte log
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import type { NextRequest as NextRequestT } from "next/server";
import { buildEnforcedCsp, buildNonceCsp, buildSecurityHeaders, CSP_REPORT_PATH } from "../../lib/security/securityHeaders";
import {
  CSP_CANARY_COOKIE,
  CSP_CANARY_ENV,
  documentRequestHeaders,
  generateCspNonce,
  resolveDocumentCsp,
} from "../../lib/security/documentCsp";

// Next sunucu modülleri (matcher derleyicisi) global AsyncLocalStorage bekler (Next runtime'ı sağlar).
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { NextRequest } = require("next/server") as { NextRequest: typeof NextRequestT };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getMiddlewareMatchers } = require("next/dist/build/analysis/get-page-static-info");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getMiddlewareRouteMatcher } = require("next/dist/shared/lib/router/utils/middleware-route-matcher");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { matchHas } = require("next/dist/shared/lib/router/utils/prepare-destination");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

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
const ON = { [CSP_CANARY_ENV]: "on", NEXT_PUBLIC_SUPABASE_URL: SB, NODE_ENV: "production" };
const OFF = { NEXT_PUBLIC_SUPABASE_URL: SB, NODE_ENV: "production" };
const jar = (v?: string) => ({ get: (n: string) => (n === CSP_CANARY_COOKIE && v !== undefined ? { value: v } : undefined) });
const directive = (csp: string, name: string) =>
  csp.split(";").map((d) => d.trim()).find((d) => d === name || d.startsWith(name + " ")) ?? "";
const PREFETCH_HEADERS: Record<string, string>[] = [{ rsc: "1" }, { "next-router-prefetch": "1" }, { purpose: "prefetch" }];
const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1] ?? null;

(async () => {
  // ── 1) Politikalar ──────────────────────────────────────────────────────────
  await t("normal politika == production (buildSecurityHeaders CSP) byte-eşit", () => {
    const prodCsp = buildSecurityHeaders({ supabaseUrl: SB }).find((h) => h.key === "Content-Security-Policy")!.value;
    assert.equal(buildEnforcedCsp({ supabaseUrl: SB }), prodCsp);
    const r = resolveDocumentCsp(jar(), { env: OFF });
    assert.equal(r.policy, prodCsp);
    assert.equal(r.nonce, null);
    assert.equal(r.canary, false);
    assert.equal(nonceOf(r.policy), null);
    assert.match(directive(r.policy, "script-src"), /'unsafe-inline'/);
  });
  await t("canary: nonce + strict-dynamic; script-src'de unsafe-inline YOK; style unsafe-inline VAR", () => {
    const n = generateCspNonce();
    const csp = buildNonceCsp(n, { supabaseUrl: SB });
    const s = directive(csp, "script-src");
    assert.ok(s.startsWith(`script-src 'self' 'nonce-${n}' 'strict-dynamic'`), s);
    assert.ok(!s.includes("'unsafe-inline'"), "script-src unsafe-inline");
    assert.ok(!s.includes("'unsafe-eval'"), "prod'da unsafe-eval");
    assert.ok(!/\s\*(\s|$)|https:\s|https:$/.test(s), "script-src wildcard");
    assert.equal(directive(csp, "style-src"), "style-src 'self' 'unsafe-inline'");
    assert.equal(directive(csp, "report-uri"), `report-uri ${CSP_REPORT_PATH}`);
    // script-src dışındaki direktifler normal politika ile aynı
    const normal = buildEnforcedCsp({ supabaseUrl: SB });
    const strip = (c: string) => c.split(";").map((d) => d.trim()).filter((d) => !/^(script-src|report-uri)\b/.test(d)).join("; ");
    assert.equal(strip(csp), strip(normal));
  });
  await t("nonce: 128-bit base64, istek başına benzersiz", () => {
    const set = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const n = generateCspNonce();
      assert.match(n, /^[A-Za-z0-9+/]{22}==$/);
      set.add(n);
    }
    assert.equal(set.size, 500);
    const a = resolveDocumentCsp(jar("1"), { env: ON });
    const b = resolveDocumentCsp(jar("1"), { env: ON });
    assert.ok(a.nonce && b.nonce && a.nonce !== b.nonce, "iki istek aynı nonce");
  });
  await t("geçersiz nonce reddedilir (enjeksiyon)", () => {
    for (const bad of ["", "short", "abc' 'unsafe-inline", "a".repeat(10) + ";", "x y z aaaaaaaaaaaaaaaa"]) {
      assert.throws(() => buildNonceCsp(bad), bad);
    }
  });

  // ── 2) Canary seçimi ────────────────────────────────────────────────────────
  await t("env on + cookie=1 → canary", () => {
    const r = resolveDocumentCsp(jar("1"), { env: ON });
    assert.equal(r.canary, true);
    assert.equal(nonceOf(r.policy), r.nonce);
  });
  await t("normal kullanıcı (cookie yok / ≠1) canary ALMAZ", () => {
    for (const v of [undefined, "", "0", "true", "on", "1 ", "yes"]) {
      const r = resolveDocumentCsp(jar(v), { env: ON });
      assert.equal(r.canary, false, String(v));
      assert.equal(r.policy, buildEnforcedCsp({ supabaseUrl: SB }));
    }
  });
  await t("env yok / off / başka değer → cookie YOK SAYILIR (kill-switch)", () => {
    for (const env of [OFF, { ...OFF, [CSP_CANARY_ENV]: "off" }, { ...OFF, [CSP_CANARY_ENV]: "1" }, { ...OFF, [CSP_CANARY_ENV]: "true" }]) {
      const r = resolveDocumentCsp(jar("1"), { env });
      assert.equal(r.canary, false, JSON.stringify(env));
      assert.equal(r.policy, buildEnforcedCsp({ supabaseUrl: SB }));
    }
  });
  await t("fail-safe: nonce üretimi throw / geçersiz → normal zorunlu CSP", () => {
    const throws = resolveDocumentCsp(jar("1"), { env: ON, genNonce: () => { throw new Error("no rng"); } });
    const invalid = resolveDocumentCsp(jar("1"), { env: ON, genNonce: () => "bad'" });
    for (const r of [throws, invalid]) {
      assert.equal(r.canary, false);
      assert.ok(r.policy.length > 100, "CSP kayboldu");
      assert.equal(r.policy, buildEnforcedCsp({ supabaseUrl: SB }));
    }
  });
  await t("istek başlıkları: istemci CSP'si ezilir, report-only silinir", () => {
    const src = new Headers({ "content-security-policy": "script-src 'nonce-attacker'", "content-security-policy-report-only": "x", cookie: "a=b" });
    const h = documentRequestHeaders(src, "default-src 'self'");
    assert.equal(h.get("content-security-policy"), "default-src 'self'");
    assert.equal(h.get("content-security-policy-report-only"), null);
    assert.equal(h.get("cookie"), "a=b");
  });

  // ── 3) proxy() uçtan uca (NextRequest) ─────────────────────────────────────
  const prevEnv = { ...process.env };
  const setEnv = (v: string | undefined) => {
    if (v === undefined) delete process.env[CSP_CANARY_ENV];
    else process.env[CSP_CANARY_ENV] = v;
    process.env.NEXT_PUBLIC_SUPABASE_URL = SB;
  };
  const { proxy, config } = await import(pathToFileURL(path.join(ROOT, "proxy.ts")).href).then((m) => m.default ?? m);
  const run = (url: string, headers: Record<string, string> = {}) => {
    const res = proxy(new NextRequest(new URL(url, "https://www.yasamsistemi.com"), { headers }));
    const reqCsp = res.headers.get("x-middleware-request-content-security-policy");
    return { res, reqCsp, resCsp: res.headers.get("content-security-policy") };
  };

  await t("proxy canary: istek CSP == yanıt CSP (aynı nonce); iki istek farklı nonce", () => {
    setEnv("on");
    const a = run("/numeroloji", { cookie: `${CSP_CANARY_COOKIE}=1` });
    const b = run("/numeroloji", { cookie: `${CSP_CANARY_COOKIE}=1` });
    assert.ok(a.resCsp && a.reqCsp, "CSP başlığı yok");
    assert.equal(a.reqCsp, a.resCsp, "istek/yanıt CSP farklı");
    assert.ok(nonceOf(a.resCsp!), "nonce yok");
    assert.notEqual(nonceOf(a.resCsp!), nonceOf(b.resCsp!));
    assert.ok(!directive(a.resCsp!, "script-src").includes("'unsafe-inline'"));
  });
  await t("proxy normal: production CSP, nonce YOK; istek==yanıt", () => {
    setEnv("on");
    const a = run("/", { cookie: "other=1" });
    assert.equal(a.resCsp, buildEnforcedCsp({ supabaseUrl: SB }));
    assert.equal(a.reqCsp, a.resCsp);
    setEnv(undefined);
    const b = run("/", { cookie: `${CSP_CANARY_COOKIE}=1` });
    assert.equal(b.resCsp, buildEnforcedCsp({ supabaseUrl: SB }), "env yokken canary sızdı");
    setEnv("off");
    const c = run("/", { cookie: `${CSP_CANARY_COOKIE}=1` });
    assert.equal(c.resCsp, buildEnforcedCsp({ supabaseUrl: SB }), "kill-switch off iken canary");
  });
  await t("proxy: istemcinin sahte CSP istek başlığı Next'e ulaşmaz", () => {
    setEnv(undefined);
    const a = run("/", { "content-security-policy": "script-src 'nonce-AAAAAAAAAAAAAAAAAAAAAA=='" });
    assert.equal(a.reqCsp, buildEnforcedCsp({ supabaseUrl: SB }));
  });
  await t("proxy /admin: cookie yok → redirect + CSP; cookie var → next + CSP", () => {
    setEnv("on");
    const r = run("/admin/users", { cookie: `${CSP_CANARY_COOKIE}=1` });
    assert.equal(r.res.status, 307);
    assert.equal(new URL(r.res.headers.get("location")!).pathname, "/");
    assert.ok(r.resCsp && r.resCsp.includes("default-src 'self'"));
    const ok = run("/admin", { cookie: "yasam_admin_session=x" });
    assert.equal(ok.res.status, 200);
    assert.equal(ok.resCsp, buildEnforcedCsp({ supabaseUrl: SB }));
  });
  process.env = prevEnv;

  // ── 4) Matcher (Next'in derleyicisi) ───────────────────────────────────────
  const matchers = getMiddlewareMatchers(config.matcher, { i18n: undefined, basePath: "" });
  const inProxy = getMiddlewareRouteMatcher(matchers);
  const hits = (p: string, headers: Record<string, string> = {}) => {
    const u = new URL(p, "https://x");
    return inProxy(u.pathname, { headers }, Object.fromEntries(u.searchParams));
  };
  const DOCS = ["/", "/numeroloji", "/numeroloji/analiz", "/?login=1", "/human-design/kayitli-haritalar",
    "/danisan-yolculugu/liste", "/settings", "/admin", "/admin/users", "/cosmic-calendar/hacamat", "/apiary", "/api-docs"];
  const NON = ["/api/auth/session", "/api", "/api/security/csp-report", "/_next/static/chunks/a.js",
    "/_next/image?url=%2Fa.png&w=64&q=75", "/_next/data/b/x.json", "/_vercel/insights/script.js",
    "/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/assets/logo.png", "/refleksoloji/klinik_a.png"];
  await t("matcher: doküman yolları proxy'de", () => {
    for (const p of DOCS) assert.equal(hits(p), true, p);
  });
  await t("matcher: API/_next/statik/dosya proxy DIŞI", () => {
    for (const p of NON) assert.equal(hits(p), false, p);
  });
  await t("matcher: prefetch/RSC proxy DIŞI; /admin her istekte proxy'de", () => {
    for (const h of PREFETCH_HEADERS) {
      assert.equal(hits("/numeroloji", h), false, JSON.stringify(h));
      assert.equal(hits("/admin/users", h), true, "admin " + JSON.stringify(h));
    }
    assert.equal(hits("/numeroloji", { purpose: "other" }), true);
  });

  // ── 5) next.config: doküman CSP'si YOK; proxy dışı yollarda CSP VAR ─────────
  const cfgMod = await import(pathToFileURL(path.join(ROOT, "next.config.ts")).href);
  const cfg = (cfgMod.default?.default ?? cfgMod.default) as {
    headers: () => Promise<Array<{ source: string; has?: Array<{ type: string; key: string; value?: string }>; headers: Array<{ key: string; value: string }> }>>;
  };
  const rules = await cfg.headers();
  const cfgCsp = (p: string, headers: Record<string, string> = {}) => {
    const pathname = new URL(p, "https://x").pathname;
    return rules
      .filter((r) => getPathMatch(r.source, { strict: true, removeUnnamedParams: true })(pathname) !== false)
      .filter((r) => !r.has || matchHas({ headers }, {}, r.has))
      .flatMap((r) => r.headers)
      .filter((h) => h.key.toLowerCase() === "content-security-policy");
  };
  await t("next.config: doküman isteğinde statik CSP YOK (#99360)", () => {
    for (const p of DOCS) assert.equal(cfgCsp(p).length, 0, p);
  });
  await t("next.config: proxy dışı her yolda TAM BİR CSP (production ile eşit)", () => {
    const prod = buildSecurityHeaders({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL }).find((h) => h.key === "Content-Security-Policy")!.value;
    for (const p of NON) {
      const c = cfgCsp(p);
      assert.equal(c.length, 1, `${p}: ${c.length}`);
      assert.equal(c[0].value, prod, p);
    }
    for (const h of PREFETCH_HEADERS) {
      assert.equal(cfgCsp("/numeroloji", h).length, 1, "prefetch/RSC CSP " + JSON.stringify(h));
      assert.equal(cfgCsp("/admin/users", h).length, 0, "admin prefetch'te çift CSP");
    }
  });
  await t("kapsam bütünlüğü: her yol tam bir kaynaktan CSP alır (proxy XOR next.config)", () => {
    const cases: Array<[string, Record<string, string>]> = [
      ...DOCS.map((p) => [p, {}] as [string, Record<string, string>]),
      ...NON.map((p) => [p, {}] as [string, Record<string, string>]),
      ["/numeroloji", { rsc: "1" }], ["/", { "next-router-prefetch": "1" }], ["/admin", { rsc: "1" }], ["/admin/export.csv", {}],
    ];
    for (const [p, h] of cases) {
      const n = (hits(p, h) ? 1 : 0) + cfgCsp(p, h).length;
      assert.equal(n, 1, `${p} ${JSON.stringify(h)} → ${n} CSP kaynağı`);
    }
  });
  await t("base başlıklar her yolda (HSTS/nosniff/referrer/permissions/XFO)", () => {
    const all = rules.find((r) => r.source === "/:path*")!;
    const keys = all.headers.map((h) => h.key);
    for (const k of ["Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "X-Frame-Options"]) {
      assert.ok(keys.includes(k), k);
    }
    assert.ok(!keys.includes("Content-Security-Policy"));
  });
  await t("statik: proxy tek CSP kaynağı; next.config doküman CSP'si eklemiyor", () => {
    const px = read("proxy.ts");
    assert.match(px, /resolveDocumentCsp\(/);
    assert.match(px, /headers\.set\("Content-Security-Policy", policy\)/);
    assert.ok(!/unsafe-inline/.test(read("lib/security/documentCsp.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
  });

  // ── 6) CSP rapor ucu ───────────────────────────────────────────────────────
  const route = await import(pathToFileURL(path.join(ROOT, "app/api/security/csp-report/route.ts")).href).then((m) => m.default ?? m);
  const post = (body: string, headers: Record<string, string>) =>
    route.POST(new NextRequest("https://x/api/security/csp-report", { method: "POST", body, headers }));
  const logs: string[] = [];
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => { logs.push(a.map(String).join(" ")); };
  try {
    await t("csp-report: yalnız POST export'u (GET/PUT/DELETE yok)", () => {
      assert.equal(typeof route.POST, "function");
      for (const m of ["GET", "PUT", "DELETE", "PATCH"]) assert.equal(route[m], undefined, m);
    });
    await t("csp-report: legacy + reports+json → 204, redakte log", async () => {
      route.__resetCspReportRateLimit();
      logs.length = 0;
      const legacy = JSON.stringify({ "csp-report": {
        "document-uri": "https://www.yasamsistemi.com/numeroloji?token=SECRET123#x",
        "violated-directive": "script-src-elem", "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/p.js?sid=SECRET456", "original-policy": "script-src 'nonce-SECRETNONCE'" } });
      assert.equal((await post(legacy, { "content-type": "application/csp-report" })).status, 204);
      const modern = JSON.stringify([{ type: "csp-violation", body: { documentURL: "https://x/a?b=SECRET789", effectiveDirective: "script-src-elem", blockedURL: "inline", sample: "SECRETSAMPLE" } }]);
      assert.equal((await post(modern, { "content-type": "application/reports+json" })).status, 204);
      const all = logs.join("\n");
      assert.ok(!/SECRET/.test(all), "sızıntı: " + all);
      assert.match(all, /"directive":"script-src-elem","blocked":"https:\/\/evil\.example","doc":"\/numeroloji"/);
      assert.match(all, /"blocked":"inline"/);
    });
    await t("csp-report: yanlış içerik türü 415, büyük gövde 413, bozuk JSON 400", async () => {
      route.__resetCspReportRateLimit();
      assert.equal((await post("{}", { "content-type": "text/plain" })).status, 415);
      assert.equal((await post("x".repeat(17 * 1024), { "content-type": "application/json" })).status, 413);
      assert.equal((await post("{", { "content-type": "application/json" })).status, 400);
    });
    await t("csp-report: rate limit (60/dk/IP) → 429", async () => {
      route.__resetCspReportRateLimit();
      let last = 0;
      for (let i = 0; i < 61; i++) last = (await post("[]", { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" })).status;
      assert.equal(last, 429);
      assert.equal((await post("[]", { "content-type": "application/json", "x-forwarded-for": "8.8.8.8" })).status, 204);
    });
    await t("csp-report: DB/supabase import YOK", () => {
      const s = read("app/api/security/csp-report/route.ts");
      assert.ok(!/supabase|@\/lib\/db|from\s+["'][^"']*db/i.test(s));
    });
  } finally {
    console.warn = origWarn;
  }

  console.log(`csp-c1v2 harness: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
