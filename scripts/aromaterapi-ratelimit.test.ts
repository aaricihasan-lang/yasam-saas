// ============================================================
// Aromaterapi FAZ 2 — ARO-010 rate-limit birim testi (DB-free).
//   npx tsx --tsconfig scripts/tsconfig.aromaterapi-tests.json \
//     scripts/aromaterapi-ratelimit.test.ts
//
// Gerçek lib/rateLimit.ts checkRateLimit + __resetRateLimitStore çağrılır.
// `now` enjekte edilir (deterministik pencere). FAIL → process.exit(1).
//
// SINIRLAMA (rapor edilir): store in-memory + INSTANCE-BAŞINA (global/atomik
// DEĞİL). Vercel Fluid Compute çok-instance'ta gerçek üst-sınır ≈ limit × instance.
// Best-effort burst koruması; kesin kota merkezi sayaç gerektirir.
// ============================================================
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { checkRateLimit, __resetRateLimitStore } from "@/lib/rateLimit";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(n: string, c: boolean, d?: string) {
  if (c) {
    pass++;
    console.log(`  PASS  ${n}`);
  } else {
    fail++;
    failures.push(n);
    console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`);
  }
}

console.log("Aromaterapi FAZ 2 — ARO-010 rate-limit testi\n");

const LIMIT = 10;
const WINDOW = 60_000;
const KEY1 = "aromaterapi-word:T1";
const KEY2 = "aromaterapi-word:T2";
const t0 = 1_000_000;

// ── Runtime: 10 allowed, 11th blocked, retryAfter>0 ──
console.log("[runtime] fixed-window burst");
__resetRateLimitStore();
let allowedCount = 0;
for (let i = 0; i < LIMIT; i++) {
  const r = checkRateLimit(KEY1, LIMIT, WINDOW, t0);
  if (r.allowed) allowedCount++;
}
check("first 10 requests allowed", allowedCount === 10, `allowed=${allowedCount}`);

const eleventh = checkRateLimit(KEY1, LIMIT, WINDOW, t0);
check("11th request blocked (!allowed)", eleventh.allowed === false);
check("11th retryAfterSeconds > 0", eleventh.retryAfterSeconds > 0, `retry=${eleventh.retryAfterSeconds}`);
check("11th remaining === 0", eleventh.remaining === 0, `remaining=${eleventh.remaining}`);

// ── Independent bucket: T2 unaffected by exhausted T1 ──
console.log("\n[runtime] independent per-key buckets");
const t2first = checkRateLimit(KEY2, LIMIT, WINDOW, t0);
check("KEY2 allowed even after KEY1 exhausted (independent bucket)", t2first.allowed === true);
check("KEY2 remaining === 9 (its own count)", t2first.remaining === 9, `remaining=${t2first.remaining}`);

// ── Window advance resets ──
console.log("\n[runtime] window advance resets");
const afterWindow = checkRateLimit(KEY1, LIMIT, WINDOW, t0 + WINDOW);
check("KEY1 allowed again after window advance (now += windowMs)", afterWindow.allowed === true);
check("KEY1 reset remaining === 9", afterWindow.remaining === 9, `remaining=${afterWindow.remaining}`);
// still blocked WITHIN the window (just before reset)
__resetRateLimitStore();
for (let i = 0; i < LIMIT; i++) checkRateLimit(KEY1, LIMIT, WINDOW, t0);
const justBeforeReset = checkRateLimit(KEY1, LIMIT, WINDOW, t0 + WINDOW - 1);
check("still blocked 1ms before window end", justBeforeReset.allowed === false);

// ── Static: all 16 word-report routes carry the gate AFTER the guard ──
console.log("\n[static] all 16 word-report routes gate after guard (ARO-010)");
function collectRoutes(dir: string): string[] {
  const out: string[] = [];
  const abs = resolve(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    if (statSync(p).isDirectory()) out.push(...collectRoutes(join(dir, name)));
    else if (name === "route.ts") out.push(join(dir, name));
  }
  return out;
}
const WR = collectRoutes("app/api/aromaterapi").filter((r) => /word-report[\\/]route\.ts$/.test(r));
check("word-report route count = 16", WR.length === 16, `found=${WR.length}`);

const GATE_RE = /checkRateLimit\(\s*`aromaterapi-word:\$\{guard\.tenantId\}`\s*,\s*10\s*,\s*60_?000\s*\)/;
let gated = 0;
let afterGuard = 0;
let has429 = 0;
let hasRetryAfter = 0;
for (const r of WR) {
  const src = readFileSync(resolve(ROOT, r), "utf8");
  if (GATE_RE.test(src)) gated++;
  const guardIdx = src.search(/requireModuleAccess\(\s*req\s*,\s*["']aromatherapy["']/);
  const rlIdx = src.search(/checkRateLimit\(\s*`aromaterapi-word:/);
  if (guardIdx >= 0 && rlIdx > guardIdx) afterGuard++;
  if (/status:\s*429/.test(src)) has429++;
  if (/["']Retry-After["']/.test(src)) hasRetryAfter++;
}
check("all 16 routes have checkRateLimit(`aromaterapi-word:${guard.tenantId}`,10,60_000)", gated === 16, `${gated}/16`);
check("all 16 routes place the gate AFTER requireModuleAccess guard", afterGuard === 16, `${afterGuard}/16`);
check("all 16 routes return 429 on limit", has429 === 16, `${has429}/16`);
check("all 16 routes set Retry-After header", hasRetryAfter === 16, `${hasRetryAfter}/16`);

console.log(`\n──────────── ARO RATE-LIMIT TEST: ${pass} PASS / ${fail} FAIL ────────────`);
if (fail > 0) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("OVERALL = PASS");
