/**
 * P1-1 PERSONAL-ARCHIVE SIGNED-URL — SESSION BINDING REGRESSION HARNESS
 *
 * Bu testler ASLA silinmemelidir. Kalıcı güvenlik kontratı:
 *
 *   GET /api/kisisel-arsiv/signed-url canonical auth contract'a bağlıdır:
 *     - requireModuleAccess(req, "personal_archive") → x-user-id + x-session-token
 *       DOĞRULANIR (token aktif + binding: token sahibi == x-user-id) + modül izni.
 *     - tenantId / userId SUNUCUDAN (guard) gelir; QUERY'den AUTH amacıyla ASLA alınmaz.
 *     - Signed URL üretmeden önce dosya metadata'sı gerçekten caller tenant'a ait olmalı
 *       (personal_archive_files: tenant_id=guard.tenantId AND file_path=filePath) — tenant
 *       öneki bilmek TEK BAŞINA yetmez.
 *     - Demo hesap → 403. Bucket PRIVATE kalır; service_role client'a sızmaz.
 *
 * Çalıştır:  npx tsx scripts/personal-archive-signed-url-p1-harness.ts
 *            (package script: npm run test:personal-archive:signed-url:p1)
 *
 * DB / production erişimi gerektirmez (SOURCE CONTRACT — statik kaynak iddiaları).
 * GERÇEK production dosyaları üzerinde exploit YAPILMAZ.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}`); }
}
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const ROUTE = "app/api/kisisel-arsiv/signed-url/route.ts";
const GUARD = "lib/auth/userGuard.ts";
const PAGE = "app/dashboard/kisisel-arsiv/page.tsx";
const MIGRATION = "supabase/migrations/20270103000000_personal_archive_private_lockdown.sql";

const route = read(ROUTE);
const guard = read(GUARD);
const page = read(PAGE);
const migration = read(MIGRATION);

// Signed-url fetch bölge(ler)ini istemci sayfasından çıkar (yalnız bu route'un URL'i).
function signedUrlFetchRegions(src: string): string[] {
  const regions: string[] = [];
  const needle = "/api/kisisel-arsiv/signed-url";
  let i = src.indexOf(needle);
  while (i !== -1) {
    regions.push(src.slice(i, i + 240));
    i = src.indexOf(needle, i + 1);
  }
  return regions;
}
const clientRegions = signedUrlFetchRegions(page);

// ─── 1–4. CANONICAL SESSION AUTH (guard katmanı) ─────────────────────────────
console.log("CANONICAL SESSION AUTH — userGuard");
ok("1. no x-user-id → 401 (guard x-user-id zorunlu)",
  /x-user-id/.test(guard) && /"Yetki gerekli\."/.test(guard) && /status:\s*401/.test(guard));
ok("2. no x-session-token → 401 (guard token zorunlu)",
  /x-session-token/.test(guard) && /Oturum doğrulaması gerekli/.test(guard));
ok("3. bogus/expired token → 401 (getActiveSessionUserId null → reddet)",
  /getActiveSessionUserId/.test(guard) && /if \(!tokenUserId\)/.test(guard));
ok("4. token/user mismatch → 403 (binding: tokenUserId !== userId)",
  /tokenUserId\s*!==\s*userId/.test(guard) && /Oturum kimliği uyuşmuyor/.test(guard));

// ─── 5–7. SERVER-DERIVED IDENTITY (route katmanı) ────────────────────────────
console.log("SERVER-DERIVED IDENTITY — route");
ok("5. query userId artık AUTH source DEĞİL (route userId query okumaz)",
  !/searchParams\.get\(\s*["']userId["']\s*\)/.test(route));
ok("6. query tenantId artık AUTH source DEĞİL (route tenantId query okumaz)",
  !/searchParams\.get\(\s*["']tenantId["']\s*\)/.test(route));
ok("7. tenant YALNIZ guard.tenantId (route guard destructuring'den türetir)",
  /const\s*\{[^}]*\btenantId\b[^}]*\}\s*=\s*guard/.test(route));

// ─── 8–10. RESOURCE OWNERSHIP + SIGNED URL (route katmanı) ────────────────────
console.log("RESOURCE OWNERSHIP — route");
ok("8. filePath başka tenant öneki → 403 (startsWith(`${tenantId}/`) + traversal reddi)",
  /startsWith\(`\$\{tenantId\}\/`\)/.test(route) && /includes\("\.\."\)/.test(route));
ok("9. tenant öneki altında olsa bile metadata YOKSA reddet (files lookup + 404)",
  /personal_archive_files/.test(route) &&
  /\.eq\("tenant_id",\s*tenantId\)/.test(route) &&
  /\.eq\("file_path",\s*filePath\)/.test(route) &&
  /if \(!fileRow\)/.test(route) && /status:\s*404/.test(route));
ok("9b. archive_id → personal_archives(id, tenant_id) ikinci savunma (IDOR)",
  /personal_archives/.test(route) && /fileRow\.archive_id/.test(route));
ok("10. valid own metadata + valid session → signed URL (createSignedUrl TTL 3600)",
  /createSignedUrl\(filePath,\s*SIGNED_URL_TTL_SECONDS\)/.test(route) &&
  /SIGNED_URL_TTL_SECONDS\s*=\s*3600/.test(route));

// ─── 11–13. DEMO + MODULE GATE + SERVICE ROLE ────────────────────────────────
console.log("DEMO / MODULE GATE / SERVICE ROLE");
ok("11. demo hesap → 403",
  /is_demo_account\s*===\s*true/.test(route) && /Demo hesabında bu işlem kullanılamaz/.test(route));
ok("12. requireModuleAccess(req, \"personal_archive\") present",
  /requireModuleAccess\(\s*req,\s*["']personal_archive["']\s*\)/.test(route) &&
  /if \(!guard\.ok\) return guard\.response/.test(route));
ok("13. service_role key client'a çıkmıyor (route guard.db kullanır, inline key YOK)",
  !/SUPABASE_SERVICE_ROLE_KEY/.test(route) &&
  !/SERVICE_ROLE/.test(page) &&
  /\bdb\b/.test(route));

// ─── CLIENT QUERY CLEANUP ────────────────────────────────────────────────────
console.log("CLIENT QUERY CLEANUP — page");
ok("C1. istemci en az bir signed-url callsite'ına sahip",
  clientRegions.length >= 1);
ok("C2. signed-url query'ye tenantId EKLENMİYOR",
  clientRegions.every((r) => !/tenantId=/.test(r)));
ok("C3. signed-url query'ye userId EKLENMİYOR",
  clientRegions.every((r) => !/userId=/.test(r)));
ok("C4. signed-url çağrıları userHeaders() ile (x-user-id + x-session-token) gönderiliyor",
  clientRegions.every((r) => /userHeaders\(\)/.test(r)));
ok("C5. istemci userHeaders helper'ı x-session-token taşır",
  /function userHeaders/.test(page) && /x-session-token/.test(page));

// ─── 14. P1-3 PRIVATE STORAGE — DEĞİŞMEDEN KORUNUR ───────────────────────────
console.log("P1-3 PRIVATE STORAGE — UNCHANGED");
ok("14a. bucket PRIVATE lockdown (set public = false) korunuyor",
  /set public = false/.test(migration) && /id = 'personal-archive'/.test(migration));
ok("14b. public/anon storage policy DROP'ları korunuyor",
  /drop policy if exists "Allow public personal archive read"/.test(migration) &&
  /drop policy if exists "Allow public personal archive uploads"/.test(migration) &&
  /drop policy if exists "Allow public personal archive delete"/.test(migration));

// ─── SONUÇ ───────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
