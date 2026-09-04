/**
 * P1-3 PERSONAL-ARCHIVE STORAGE — REGRESSION HARNESS
 *
 * Bu testler ASLA silinmemelidir. Kalıcı güvenlik kontratı:
 *
 *   Kişisel Arşiv storage yükleme/silme yalnız SUNUCU-YETKİLİ akıştan geçer.
 *   Tarayıcı asla personal-archive bucket'ına doğrudan yazmaz/silmez; bucket PRIVATE;
 *   public/anon storage policy YOKTUR; tenant path client-controlled DEĞİLDİR.
 *
 * Çalıştır:  npx tsx scripts/personal-archive-storage-p1-harness.ts
 *            (package script: npm run test:personal-archive:storage:p1)
 *
 * DB / production erişimi gerektirmez:
 *   - SOURCE CONTRACT: taze feature ağacındaki dosyalar üzerinde statik iddialar.
 *   - BEHAVIOR: saf path/sanitize yardımcıları (production mutation YOK).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PERSONAL_ARCHIVE_BUCKET,
  PERSONAL_ARCHIVE_MAX_BYTES,
  sanitizePersonalArchiveFileName,
  buildPersonalArchivePath,
  isOwnedPersonalArchivePath,
} from "@/lib/kisisel-arsiv/storagePath";

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

const PAGE = "app/dashboard/kisisel-arsiv/page.tsx";
const UPLOAD_ROUTE = "app/api/kisisel-arsiv/files/upload/route.ts";
const FILES_ROUTE = "app/api/kisisel-arsiv/files/route.ts";
const MIGRATION = "supabase/migrations/20270103000000_personal_archive_private_lockdown.sql";

const page = read(PAGE);
const uploadRoute = read(UPLOAD_ROUTE);
const filesRoute = read(FILES_ROUTE);
const migration = read(MIGRATION);

// ─── SOURCE CONTRACT ─────────────────────────────────────────────────────────
console.log("SOURCE CONTRACT");

// 1 + 2: aktif page'de doğrudan personal-archive storage mutation YOK.
ok(
  "1. page: .storage.from(\"personal-archive\").upload( YOK",
  !/\.storage\s*\.\s*from\(\s*["']personal-archive["']\s*\)\s*\.\s*upload\s*\(/.test(page),
);
ok(
  "2. page: .storage.from(\"personal-archive\").remove( YOK",
  !/\.storage\s*\.\s*from\(\s*["']personal-archive["']\s*\)\s*\.\s*remove\s*\(/.test(page),
);
// Ek savunma: page hiçbir supabase storage mutation'ı yapmamalı (import bile kalkmış olmalı).
ok(
  "2b. page: @/lib/supabase (anon client) import edilmiyor",
  !/from\s+["']@\/lib\/supabase["']/.test(page),
);
// Aktif UI yükleme için server endpoint'ini FormData ile kullanmalı.
ok(
  "2c. page: /api/kisisel-arsiv/files/upload FormData ile kullanılıyor",
  page.includes("/api/kisisel-arsiv/files/upload") && /new FormData\(\)/.test(page),
);

// 3: server upload route modül-kapılı.
ok(
  '3. upload route: requireModuleAccess(req, "personal_archive") VAR',
  /requireModuleAccess\(\s*req\s*,\s*["']personal_archive["']\s*\)/.test(uploadRoute),
);
// 4: server tenantId oturumdan (guard.tenantId destructure).
ok(
  "4. upload route: tenantId guard'dan (server-derived) alınıyor",
  /const\s*\{[^}]*\btenantId\b[^}]*\}\s*=\s*guard/.test(uploadRoute),
);
// 5: client-supplied tenantId query/body kaynağı DEĞİL.
ok(
  "5. upload route: client tenantId (form/query) OKUNMUYOR",
  !/get\(\s*["']tenantId["']\s*\)/.test(uploadRoute),
);
// 6: obje yolu SUNUCUDA üretiliyor (uuid + builder).
ok(
  "6. upload route: server-generated path (buildPersonalArchivePath + randomUUID)",
  uploadRoute.includes("buildPersonalArchivePath") && /crypto\.randomUUID\(\)/.test(uploadRoute),
);
ok(
  "6b. upload route: client file_path KABUL EDİLMİYOR (path server üretir)",
  !/get\(\s*["']file_path["']\s*\)/.test(uploadRoute),
);
// 7: archive tenant ownership doğrulaması.
ok(
  "7. upload route: archive tenant ownership check (archiveInTenant)",
  /archiveInTenant\(/.test(uploadRoute) &&
    /\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/.test(uploadRoute),
);
// 8: delete server-side tenant+archive scoped + storage removal service_role.
ok(
  "8. files route DELETE: path DB'den tenant+archive scoped çözülüyor",
  /\.select\(\s*["']file_path["']\s*\)/.test(filesRoute) &&
    /\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/.test(filesRoute) &&
    /\.eq\(\s*["']archive_id["']\s*,\s*archiveId\s*\)/.test(filesRoute),
);
ok(
  "8b. files route DELETE: storage.remove service_role (guard.db) ile",
  /db\.storage\.from\(\s*PERSONAL_ARCHIVE_BUCKET\s*\)\.remove\(/.test(filesRoute),
);
ok(
  "8c. files route: legacy JSON POST file_path tenant+archive öneki zorunlu",
  /isOwnedPersonalArchivePath\(/.test(filesRoute),
);

// ─── MIGRATION CONTRACT ──────────────────────────────────────────────────────
console.log("MIGRATION CONTRACT");
const mig = migration.toLowerCase();
// 9: bucket public=false.
ok(
  "9. migration: personal-archive public=false",
  /update\s+storage\.buckets\s+set\s+public\s*=\s*false\s+where\s+id\s*=\s*'personal-archive'/.test(mig),
);
// 10: 5 güvensiz production policy DROP.
const REQUIRED_DROPS = [
  "allow public personal archive read",
  "allow public personal archive uploads",
  "allow public personal archive delete",
  "personal_archive_anon_insert",
  "personal_archive_anon_delete",
];
for (const name of REQUIRED_DROPS) {
  ok(
    `10. migration DROP POLICY "${name}"`,
    new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+"${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s+on\\s+storage\\.objects`).test(mig),
  );
}
// 11: yeni anon/public replacement policy YOK.
ok(
  "11. migration: yeni CREATE POLICY YOK (anon/public replacement yok)",
  !/create\s+policy/.test(mig),
);

// ─── BEHAVIOR (saf yardımcılar) ──────────────────────────────────────────────
console.log("BEHAVIOR");
const T1 = "11111111-1111-1111-1111-111111111111";
const T2 = "22222222-2222-2222-2222-222222222222";
const A1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const A2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

ok("bucket sabiti personal-archive", PERSONAL_ARCHIVE_BUCKET === "personal-archive");
ok("max bytes = 50MB (bodySizeLimit ile hizalı)", PERSONAL_ARCHIVE_MAX_BYTES === 50 * 1024 * 1024);

const built = buildPersonalArchivePath(T1, A1, "uuid123", "belge.pdf");
ok("path: tenant/archive/uuid_name biçimi", built === `${T1}/${A1}/uuid123_belge.pdf`);
ok("path: kendi tenant+archive önekinde owned", isOwnedPersonalArchivePath(built, T1, A1));

// Cross-tenant / cross-archive / traversal reddi.
ok("owned: cross-tenant path RED", !isOwnedPersonalArchivePath(`${T2}/${A1}/x_belge.pdf`, T1, A1));
ok("owned: cross-archive path RED", !isOwnedPersonalArchivePath(`${T1}/${A2}/x_belge.pdf`, T1, A1));
ok("owned: path traversal RED", !isOwnedPersonalArchivePath(`${T1}/${A1}/../../etc`, T1, A1));
ok("owned: absolute URL RED", !isOwnedPersonalArchivePath(`https://evil/${T1}/${A1}/x`, T1, A1));
ok("owned: non-string RED", !isOwnedPersonalArchivePath(null, T1, A1) && !isOwnedPersonalArchivePath(123, T1, A1));

// Sanitize.
ok("sanitize: tehlikeli karakterler _ olur", sanitizePersonalArchiveFileName("a/b\\c:*?\"<>|.txt").indexOf("/") === -1);
ok("sanitize: boş → dosya", sanitizePersonalArchiveFileName("") === "dosya" && sanitizePersonalArchiveFileName("///") !== "");
ok("sanitize: 180 karakter sınırı", sanitizePersonalArchiveFileName("x".repeat(500)).length <= 180);

// ─── SONUÇ ───────────────────────────────────────────────────────────────────
console.log(`\nP1-3 PERSONAL-ARCHIVE STORAGE HARNESS: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
