/**
 * CSP NONCE C1 — canary / Report-Only harness (DB/ağ YOK).
 *
 * Çalıştır: npx tsx scripts/final-hardening/csp-c1.harness.ts
 *
 * Kapsam:
 *   - NORMAL (canary yok) invariant: zorunlu CSP production değeriyle BYTE-eşit; Report-Only YOK
 *   - buildNonceReportOnlyCsp: nonce + 'strict-dynamic'; style-src/report-sample YOK
 *   - generateCspNonce: format + benzersizlik
 *   - proxy(): admin redirect baseline'ı, canary/normal ayrımı, istek başlığı aktarımı,
 *     istemci CSP istek başlığının silinmesi, kill-switch, FAIL-OPEN
 *   - proxy matcher: /admin girdileri aynen + cookie-koşullu canary girdisi
 *   - CSP rapor redaksiyonu + /api/security/csp-report route (415/413/400/429/204, log sızıntısı yok)
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  CSP_CANARY_COOKIE,
  CSP_NONCE_RE,
  CSP_REPORT_PATH,
  buildEnforcedCsp,
  buildNonceReportOnlyCsp,
  buildSecurityHeaders,
} from "../../lib/security/securityHeaders";
import { generateCspNonce, withCspCanary } from "../../lib/security/cspCanary";
import {
  sanitizeBlocked,
  sanitizeCspReportPayload,
  sanitizeDocumentPath,
  uaClass,
} from "../../lib/security/cspReport";
import { proxy, config as proxyConfig } from "../../proxy";
import * as reportRoute from "../../app/api/security/csp-report/route";
import { __resetRateLimitForTest } from "../../lib/security/rateLimit";

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

/**
 * 2026-10-09'da production'dan (www.yasamsistemi.com, cbbdec53) curl ile alınan ZORUNLU CSP.
 * C1 bu değeri DEĞİŞTİRMEMELİ.
 */
const PROD_SUPABASE = "https://wctopfooajbpupeyukpd.supabase.co";
const PROD_ENFORCED_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://wctopfooajbpupeyukpd.supabase.co https://wctopfooajbpupeyukpd.storage.supabase.co https://*.google-analytics.com https://*.googletagmanager.com https://vercel.live https://vercel.com; font-src 'self' data:; connect-src 'self' https://wctopfooajbpupeyukpd.supabase.co https://wctopfooajbpupeyukpd.storage.supabase.co wss://wctopfooajbpupeyukpd.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://va.vercel-scripts.com https://vercel.live wss://ws-us3.pusher.com; frame-src 'self' blob: data: https://wctopfooajbpupeyukpd.supabase.co https://wctopfooajbpupeyukpd.storage.supabase.co https://vercel.live; media-src 'self' blob: data: https://wctopfooajbpupeyukpd.supabase.co https://wctopfooajbpupeyukpd.storage.supabase.co; worker-src 'self' blob:; manifest-src 'self'; object-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";

const BASE = "https://www.yasamsistemi.com";
function req(p: string, opts: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const h = new Headers(opts.headers ?? {});
  const c = Object.entries(opts.cookies ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (c) h.set("cookie", c);
  return new NextRequest(new URL(p, BASE), { headers: h });
}
const CANARY = { [CSP_CANARY_COOKIE]: "1" };
const ADMIN = { yasam_admin_session: "tok_abcdefghijklmnop1234" };

function nonceOf(policy: string | null): string | null {
  return /'nonce-([^']+)'/.exec(policy ?? "")?.[1] ?? null;
}
function isPlainNext(res: Response) {
  return (
    res.headers.get("x-middleware-next") === "1" &&
    res.headers.get("Content-Security-Policy-Report-Only") === null &&
    res.headers.get("x-middleware-override-headers") === null
  );
}

async function main() {
  // ── 1) NORMAL invariant ────────────────────────────────────────────────────
  await t("zorunlu CSP production değeriyle BYTE-eşit", () => {
    assert.equal(buildEnforcedCsp({ supabaseUrl: PROD_SUPABASE }), PROD_ENFORCED_CSP);
  });
  await t("buildSecurityHeaders: Report-Only YOK, CSP = prod", () => {
    const hs = buildSecurityHeaders({ supabaseUrl: PROD_SUPABASE });
    assert.equal(hs.find((h) => h.key === "Content-Security-Policy")?.value, PROD_ENFORCED_CSP);
    assert.equal(hs.some((h) => /report-only/i.test(h.key)), false);
    assert.equal(hs.some((h) => /reporting-endpoints/i.test(h.key)), false);
  });
  await t("next.config.ts statik başlıklar Report-Only içermez", () => {
    const src = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
    assert.ok(!/report-only/i.test(src));
    assert.ok(/buildSecurityHeaders\(/.test(src));
  });

  // ── 2) Report-Only politika ────────────────────────────────────────────────
  const N = "AAAAAAAAAAAAAAAAAAAAAA==";
  await t("Report-Only: nonce + strict-dynamic + rapor uçları", () => {
    const p = buildNonceReportOnlyCsp(N);
    assert.match(p, /^script-src 'nonce-AAAAAAAAAAAAAAAAAAAAAA==' 'strict-dynamic' 'self' 'unsafe-inline' /);
    assert.ok(p.includes("https://www.googletagmanager.com"));
    assert.ok(p.includes(`report-uri ${CSP_REPORT_PATH}`));
    assert.ok(!/report-to/.test(p), "report-to YOK (Chromium report-uri'yi yok sayardı)");
    assert.ok(!/style-src/.test(p), "style-src bu turda YOK");
    assert.ok(!/report-sample/.test(p), "report-sample YOK");
    assert.ok(!/unsafe-eval/.test(p), "prod'da unsafe-eval YOK");
    assert.ok(/unsafe-eval/.test(buildNonceReportOnlyCsp(N, { isDev: true })));
  });
  await t("Report-Only: geçersiz nonce reddedilir", () => {
    for (const bad of ["", "short", "a b c d e f g h i j", "x'; script-src *", "AAAAAAAAAAAAAAAAAAAA==="]) {
      assert.throws(() => buildNonceReportOnlyCsp(bad), bad);
    }
  });
  await t("generateCspNonce: Next kalıbı, 128 bit, benzersiz", () => {
    const set = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const n = generateCspNonce();
      assert.match(n, CSP_NONCE_RE);
      assert.equal(Buffer.from(n, "base64").length, 16);
      set.add(n);
    }
    assert.equal(set.size, 500);
  });

  // ── 3) proxy() ─────────────────────────────────────────────────────────────
  await t("admin: cookie yok → / redirect (baseline)", () => {
    for (const p of ["/admin", "/admin/users", "/admin/users/x/workspace"]) {
      const res = proxy(req(p));
      assert.equal(res.status, 307, p);
      assert.equal(res.headers.get("location"), `${BASE}/`);
      assert.equal(res.headers.get("Content-Security-Policy-Report-Only"), null);
    }
  });
  await t("admin: geçerli admin shell cookie → düz devam (baseline)", () => {
    const res = proxy(req("/admin", { cookies: ADMIN }));
    assert.ok(isPlainNext(res));
  });
  await t("admin: canary + admin cookie YOK → yine redirect", () => {
    const res = proxy(req("/admin/users", { cookies: CANARY }));
    assert.equal(res.status, 307);
    assert.equal(res.headers.get("Content-Security-Policy-Report-Only"), null);
  });
  await t("admin: canary + admin cookie → devam + Report-Only", () => {
    const res = proxy(req("/admin", { cookies: { ...ADMIN, ...CANARY } }));
    assert.equal(res.headers.get("x-middleware-next"), "1");
    assert.ok(nonceOf(res.headers.get("Content-Security-Policy-Report-Only")));
  });
  await t("/adminx gibi admin-olmayan yol redirect EDİLMEZ", () => {
    const res = proxy(req("/adminx", { cookies: CANARY }));
    assert.notEqual(res.status, 307);
  });
  await t("normal (canary yok) sayfa → düz devam, Report-Only YOK", () => {
    assert.ok(isPlainNext(proxy(req("/"))));
    assert.ok(isPlainNext(proxy(req("/numeroloji", { cookies: { [CSP_CANARY_COOKIE]: "0" } }))));
  });
  await t("canary: Report-Only yanıt + istek başlığı (Next nonce kaynağı)", () => {
    const res = proxy(req("/", { cookies: CANARY, headers: { "content-security-policy": "script-src 'nonce-EVILEVILEVILEVIL'" } }));
    const ro = res.headers.get("Content-Security-Policy-Report-Only");
    const n = nonceOf(ro);
    assert.ok(n && CSP_NONCE_RE.test(n));
    assert.match(ro!, /'strict-dynamic'/);
    // NextResponse.next({ request: { headers } }) → x-middleware-request-* aktarımı
    assert.equal(res.headers.get("x-middleware-request-content-security-policy-report-only"), ro);
    const override = (res.headers.get("x-middleware-override-headers") ?? "").split(",");
    assert.ok(override.includes("content-security-policy-report-only"));
    assert.ok(!override.includes("content-security-policy"), "istemci CSP istek başlığı silinmeli");
    assert.equal(res.headers.get("x-middleware-request-content-security-policy"), null);
    assert.equal(res.headers.get("Reporting-Endpoints"), null);
    // zorunlu CSP proxy'de set EDİLMEZ (next.config statik başlığı aynen kalır)
    assert.equal(res.headers.get("Content-Security-Policy"), null);
  });
  await t("canary: iki istek → farklı nonce", () => {
    const a = nonceOf(proxy(req("/", { cookies: CANARY })).headers.get("Content-Security-Policy-Report-Only"));
    const b = nonceOf(proxy(req("/", { cookies: CANARY })).headers.get("Content-Security-Policy-Report-Only"));
    assert.ok(a && b && a !== b);
  });
  await t("kill-switch CSP_NONCE_CANARY=off → canary yok sayılır", () => {
    const res = withCspCanary(req("/", { cookies: CANARY }), { env: { CSP_NONCE_CANARY: "off" } });
    assert.ok(isPlainNext(res));
  });
  await t("FAIL-OPEN: nonce üretimi throw → düz devam", () => {
    const res = withCspCanary(req("/", { cookies: CANARY }), {
      env: {},
      genNonce: () => {
        throw new Error("boom");
      },
    });
    assert.ok(isPlainNext(res));
  });
  await t("FAIL-OPEN: geçersiz nonce → düz devam", () => {
    const res = withCspCanary(req("/", { cookies: CANARY }), { env: {}, genNonce: () => "bad nonce'" });
    assert.ok(isPlainNext(res));
  });

  // ── 4) matcher ─────────────────────────────────────────────────────────────
  await t("matcher: /admin girdileri aynen + cookie-koşullu canary", () => {
    const m = proxyConfig.matcher as Array<string | { source: string; has?: unknown[]; missing?: unknown[] }>;
    assert.equal(m[0], "/admin");
    assert.equal(m[1], "/admin/:path*");
    const c = m[2] as { source: string; has: Array<{ type: string; key: string; value?: string }>; missing: Array<{ key: string }> };
    assert.deepEqual(c.has, [{ type: "cookie", key: CSP_CANARY_COOKIE, value: "1" }]);
    assert.deepEqual(c.missing.map((x) => x.key).sort(), ["next-router-prefetch", "purpose", "rsc"]);
    const re = new RegExp(`^${c.source.replace(/^\//, "\\/")}$`);
    for (const ok of ["/", "/numeroloji", "/dashboard/clients/abc", "/apiary"]) assert.ok(re.test(ok), ok);
    for (const no of ["/api", "/api/auth/session", "/_next/static/x.js", "/_next/image", "/_vercel/insights/script.js", "/vendor/roxy-ui/0.48.0/bodygraph.js", "/favicon.ico"]) {
      assert.ok(!re.test(no), no);
    }
  });

  // ── 5) Rapor redaksiyonu ───────────────────────────────────────────────────
  await t("blocked-uri → yalnız origin / şema / anahtar kelime", () => {
    assert.equal(sanitizeBlocked("https://wctopfooajbpupeyukpd.supabase.co/storage/v1/object/sign/x.pdf?token=SECRET#f"), "https://wctopfooajbpupeyukpd.supabase.co");
    assert.equal(sanitizeBlocked("inline"), "inline");
    assert.equal(sanitizeBlocked("eval"), "eval");
    assert.equal(sanitizeBlocked("data:text/html;base64,PHNjcmlwdD4="), "data:");
    assert.equal(sanitizeBlocked("blob:https://www.yasamsistemi.com/uuid"), "blob:");
    assert.equal(sanitizeBlocked("javascript:alert(1)"), "other");
    assert.equal(sanitizeBlocked(""), "none");
  });
  await t("document-uri → yalnız maskeli path sınıfı", () => {
    assert.equal(sanitizeDocumentPath("https://www.yasamsistemi.com/dashboard/clients/3f2b8c1e-1234-4abc-9def-0123456789ab?tab=x&token=SECRET#frag"), "/dashboard/clients/:id");
    assert.equal(sanitizeDocumentPath("https://www.yasamsistemi.com/kisisel-arsiv/12345"), "/kisisel-arsiv/:id");
    assert.equal(sanitizeDocumentPath("https://www.yasamsistemi.com/x/ali%40ornek.com"), "/x/:id");
    assert.equal(sanitizeDocumentPath("not a url"), "unknown");
  });
  const SECRETS = ["SECRET", "token=", "tab=", "#frag", "alert(", "sample", "eyJhbGci", "203.0.113.7", "ali@"];
  await t("payload redaksiyonu: csp-report + reports+json; sample/query/source-file sızmaz", () => {
    const a = sanitizeCspReportPayload({
      "csp-report": {
        "document-uri": "https://www.yasamsistemi.com/numeroloji?token=SECRET#frag",
        "blocked-uri": "inline",
        "effective-directive": "script-src-elem",
        "script-sample": "alert(document.cookie) eyJhbGci",
        "source-file": "https://www.yasamsistemi.com/x.js?token=SECRET",
        referrer: "https://evil.example/?tab=1",
        disposition: "report",
      },
    })!;
    assert.deepEqual(a, [{ directive: "script-src-elem", blocked: "inline", path: "/numeroloji", disposition: "report" }]);
    const b = sanitizeCspReportPayload([
      { type: "csp-violation", body: { documentURL: "https://www.yasamsistemi.com/a?token=SECRET", blockedURL: "https://evil.example/p?q=SECRET", effectiveDirective: "script-src-elem", sample: "alert(1)", disposition: "report" } },
      { type: "deprecation", body: {} },
      ...Array.from({ length: 10 }, () => ({ type: "csp-violation", body: { effectiveDirective: "script-src" } })),
    ])!;
    assert.equal(b.length, 5, "en fazla 5");
    assert.deepEqual(b[0], { directive: "script-src-elem", blocked: "https://evil.example", path: "/a", disposition: "report" });
    const s = JSON.stringify([a, b]);
    for (const x of SECRETS) assert.ok(!s.includes(x), x);
    assert.equal(sanitizeCspReportPayload({ foo: 1 }), null);
    assert.equal(sanitizeCspReportPayload("x"), null);
  });
  await t("uaClass kaba sınıf", () => {
    assert.equal(uaClass("Mozilla/5.0 (Linux; Android 14; SM-X; wv) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36"), "android-webview");
    assert.equal(uaClass("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129 Safari/537.36"), "chrome");
    assert.equal(uaClass(null), "other");
  });

  // ── 6) Route ───────────────────────────────────────────────────────────────
  const logs: string[] = [];
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  const post = (body: string, ct: string | null, ip = "203.0.113.7", extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { "x-forwarded-for": ip, "user-agent": "Mozilla/5.0 Chrome/129", ...extra };
    if (ct) headers["content-type"] = ct;
    return reportRoute.POST(new NextRequest(`${BASE}${CSP_REPORT_PATH}`, { method: "POST", headers, body }));
  };
  try {
    __resetRateLimitForTest();
    await t("route: yalnız POST export edilir (GET → 405)", () => {
      const keys = Object.keys(reportRoute).filter((k) => /^(GET|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(k));
      assert.deepEqual(keys, []);
      assert.equal(typeof reportRoute.POST, "function");
    });
    await t("route: application/csp-report → 204, redakte log", async () => {
      logs.length = 0;
      const res = await post(
        JSON.stringify({ "csp-report": { "document-uri": "https://www.yasamsistemi.com/kisisel-arsiv?token=SECRET#frag", "blocked-uri": "https://wctopfooajbpupeyukpd.supabase.co/storage/v1/object/sign/a?token=SECRET", "effective-directive": "script-src-elem", "script-sample": "alert(1) eyJhbGci", disposition: "report" } }),
        "application/csp-report",
      );
      assert.equal(res.status, 204);
      assert.equal(await res.text(), "");
      assert.equal(logs.length, 1);
      const rec = JSON.parse(logs[0]);
      assert.deepEqual(rec, { evt: "csp_report_c1", directive: "script-src-elem", blocked: "https://wctopfooajbpupeyukpd.supabase.co", path: "/kisisel-arsiv", disposition: "report", ua: "chrome" });
      for (const x of SECRETS) assert.ok(!logs[0].includes(x), x);
    });
    await t("route: application/reports+json → 204", async () => {
      const res = await post(JSON.stringify([{ type: "csp-violation", body: { documentURL: "https://www.yasamsistemi.com/", blockedURL: "inline", effectiveDirective: "script-src-elem", disposition: "report" } }]), "application/reports+json");
      assert.equal(res.status, 204);
    });
    await t("route: yanlış Content-Type → 415", async () => {
      assert.equal((await post("{}", "text/plain")).status, 415);
      assert.equal((await post("{}", null)).status, 415);
      assert.equal((await post("a=1", "application/x-www-form-urlencoded")).status, 415);
    });
    await t("route: malformed JSON / tanınmayan biçim → 400", async () => {
      assert.equal((await post("{not json", "application/csp-report")).status, 400);
      assert.equal((await post(JSON.stringify({ hello: "x" }), "application/csp-report")).status, 400);
    });
    await t("route: büyük gövde → 413 (Content-Length ve akış)", async () => {
      const big = "x".repeat(17 * 1024);
      assert.equal((await post(big, "application/csp-report")).status, 413);
      // Content-Length yalan/eksik olsa bile akış sayacı keser
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < 20; i++) c.enqueue(new Uint8Array(1024).fill(120));
          c.close();
        },
      });
      const r = await reportRoute.POST(
        new NextRequest(`${BASE}${CSP_REPORT_PATH}`, { method: "POST", headers: { "content-type": "application/csp-report", "x-forwarded-for": "198.51.100.1" }, body: stream, duplex: "half" } as unknown as ConstructorParameters<typeof NextRequest>[1]),
      );
      assert.equal(r.status, 413);
    });
    await t("route: IP başına rate limit → 429 (gövdesiz)", async () => {
      __resetRateLimitForTest();
      const body = JSON.stringify({ "csp-report": { "effective-directive": "script-src" } });
      const statuses: number[] = [];
      for (let i = 0; i < 35; i++) statuses.push((await post(body, "application/csp-report", "192.0.2.50")).status);
      assert.equal(statuses.filter((s) => s === 204).length, 30);
      assert.equal(statuses.at(-1), 429);
      // başka IP etkilenmez
      assert.equal((await post(body, "application/csp-report", "192.0.2.51")).status, 204);
    });
    await t("route: instance geneli tavan → 429", async () => {
      __resetRateLimitForTest();
      const body = JSON.stringify({ "csp-report": { "effective-directive": "script-src" } });
      let last = 0;
      for (let i = 0; i < 301; i++) last = (await post(body, "application/csp-report", `10.0.${i >> 8}.${i & 255}`)).status;
      assert.equal(last, 429);
    });
    await t("route: loglarda ham IP yok", () => {
      for (const l of logs) assert.ok(!/\b(203\.0\.113\.7|192\.0\.2\.5\d|198\.51\.100\.1|10\.0\.\d+\.\d+)\b/.test(l), l);
    });
  } finally {
    console.warn = origWarn;
    __resetRateLimitForTest();
  }

  console.log(`csp-c1 harness: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
