/**
 * P0-4 AJANDA WORD REPORT — REGRESSION HARNESS
 *
 * Bu testler ASLA silinmemelidir. Kalıcı güvenlik kontratı:
 *
 *   "Knowing a tenant UUID is insufficient to export appointments or client data."
 *
 * Çalıştır:  npx tsx scripts/ajanda-word-report-p0-harness.ts
 *
 * İki katman:
 *   1) DAVRANIŞ — gerçek POST handler'ı, kimliksiz/oturumsuz isteklerde 401 döner
 *      ve ASLA docx üretmez. (DB gerektirmez: verifyUserRequest, getServerDb'den
 *      ÖNCE eksik x-user-id / x-session-token'ı reddeder. Production mutation YOK.)
 *   2) KAYNAK KONTRATI — route'un güvenli mimariyi koruduğunu statik doğrular
 *      (requireModuleAccess, server-side tenant, client tenantId query kaynağı değil).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/ajanda/word-report/route";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const VICTIM_TENANT = "11111111-1111-1111-1111-111111111111"; // rastgele — gerçek tenant DEĞİL

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}`); }
}

function makeReq(headers: Record<string, string>, body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ajanda/word-report", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function isDocx(res: Response): boolean {
  return (res.headers.get("Content-Type") ?? "").includes("wordprocessingml.document");
}

async function run() {
  console.log("\n── Davranış: kimliksiz export reddi (docx ÜRETİLMEZ) ──");

  // 1) session/kimlik yok + yalnız victim tenantId → 401, docx yok
  const r1 = await POST(makeReq({}, { tenantId: VICTIM_TENANT, exportMode: "all" }));
  ok("tenantId-only, kimlik yok → 401", r1.status === 401);
  ok("tenantId-only → docx ÜRETİLMEDİ", !isDocx(r1));

  // 2) x-user-id var ama x-session-token yok → 401 (token zorunlu, spoof edilemez)
  const r2 = await POST(makeReq({ "x-user-id": "attacker-uuid" }, { tenantId: VICTIM_TENANT, exportMode: "all" }));
  ok("x-user-id var, token yok → 401", r2.status === 401);
  ok("token yok → docx ÜRETİLMEDİ", !isDocx(r2));

  // 3) boş body + kimlik yok → 401 (auth, body parse'tan ÖNCE)
  const r3 = await POST(makeReq({}, {}));
  ok("boş body + kimlik yok → 401", r3.status === 401);
  ok("boş body → docx ÜRETİLMEDİ", !isDocx(r3));

  // 4) single mode victim tenant, kimlik yok → 401 (docx yok)
  const r4 = await POST(makeReq({}, { tenantId: VICTIM_TENANT, exportMode: "single", appointmentId: "x" }));
  ok("single mode, kimlik yok → 401", r4.status === 401);
  ok("single mode → docx ÜRETİLMEDİ", !isDocx(r4));

  console.log("\n── Kaynak kontratı (regression lock) ──");
  const src = readFileSync(join(ROOT, "app/api/ajanda/word-report/route.ts"), "utf8");
  const page = readFileSync(join(ROOT, "app/dashboard/ajanda/page.tsx"), "utf8");

  ok("route: requireModuleAccess import ediliyor", /requireModuleAccess/.test(src));
  ok("route: requireModuleAccess(req, \"appointments\") çağrılıyor", /requireModuleAccess\(\s*req\s*,\s*["']appointments["']\s*\)/.test(src));
  ok("route: guard.tenantId (server-side) kullanılıyor", /const\s*\{\s*db\s*,\s*tenantId\s*\}\s*=\s*guard/.test(src));
  ok("route: KENDİ service_role client'ını KURMUYOR (createClient yok)", !/createClient\s*\(/.test(src));
  ok("route: appointments sorgusu doğrulanmış tenantId ile bağlı", /\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/.test(src));
  ok("route: client-supplied bodyTenantId query kaynağı DEĞİL", !/\.eq\(\s*["']tenant_id["']\s*,\s*bodyTenantId\s*\)/.test(src));
  ok("route: bodyTenantId mismatch → 403 (cross-tenant reddi)", /bodyTenantId[\s\S]{0,80}!==\s*tenantId[\s\S]{0,80}403/.test(src));
  ok("route: DB error.message client'a SIZDIRILMIYOR", !/error\.message/.test(src));
  ok("route: POST(req: NextRequest) imzası", /export\s+async\s+function\s+POST\s*\(\s*req:\s*NextRequest/.test(src));

  ok("frontend: word-report çağrıları userHeaders(true) kullanıyor", /userHeaders\(true\)/.test(page));
  ok("frontend: word-report kimliksiz Content-Type-only header KALMADI", !/headers:\s*\{\s*["']Content-Type["']:\s*["']application\/json["']\s*\}/.test(page));

  console.log(`\nSONUÇ: ${pass} passed, ${fail} failed`);
  if (fail > 0) { process.exitCode = 1; console.error("HARNESS FAIL — P0-4 kontratı ihlal edildi."); }
  else { console.log("HARNESS PASS — tenant-UUID-only export BLOCKED; auth+tenant server-side enforced."); }
}

run().catch((e) => { console.error("HARNESS ERROR", e); process.exitCode = 1; });
