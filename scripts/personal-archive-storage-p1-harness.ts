/**
 * P1-3 PERSONAL-ARCHIVE STORAGE — REGRESSION HARNESS
 *
 * Bu testler ASLA silinmemelidir. Kalıcı güvenlik kontratı:
 *
 *   Kişisel Arşiv storage yükleme/silme yalnız SUNUCU-YETKİLİ akıştan geçer:
 *     - Yükleme: server signed upload hazırlığı (createSignedUploadUrl) → tarayıcı
 *       uploadToSignedUrl (path SUNUCUDAN) → server finalize (metadata).
 *       Dosya byte'ları API route'tan GEÇMEZ (Vercel ~4.5MB body limiti aşılmaz).
 *     - Silme: server path'leri DB'den (tenant+archive scoped) çözer; storage silme
 *       BAŞARISIZ olursa metadata satırları SİLİNMEZ (orphan/metadata-yok üretmez).
 *   Bucket PRIVATE; public/anon storage policy YOKTUR; tenant path client-controlled DEĞİLDİR.
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
const PREPARE_ROUTE = "app/api/kisisel-arsiv/files/upload/route.ts";
const FINALIZE_ROUTE = "app/api/kisisel-arsiv/files/finalize/route.ts";
const CLEANUP_ROUTE = "app/api/kisisel-arsiv/files/cleanup/route.ts";
const FILES_ROUTE = "app/api/kisisel-arsiv/files/route.ts";
const MIGRATION = "supabase/migrations/20270103000000_personal_archive_private_lockdown.sql";

const page = read(PAGE);
const prepareRoute = read(PREPARE_ROUTE);
const finalizeRoute = read(FINALIZE_ROUTE);
const cleanupRoute = read(CLEANUP_ROUTE);
const filesRoute = read(FILES_ROUTE);
const migration = read(MIGRATION);

// ─── SOURCE CONTRACT — CLIENT ────────────────────────────────────────────────
console.log("SOURCE CONTRACT — CLIENT");

// 1 + 2: aktif page'de NORMAL anon storage mutation (.upload/.remove) YOK.
ok(
  "1. page: .storage.from(\"personal-archive\").upload( YOK",
  !/\.storage\s*\.\s*from\(\s*["']personal-archive["']\s*\)\s*\.\s*upload\s*\(/.test(page),
);
ok(
  "2. page: .storage.from(\"personal-archive\").remove( YOK",
  !/\.storage\s*\.\s*from\(\s*["']personal-archive["']\s*\)\s*\.\s*remove\s*\(/.test(page),
);
// 3: signed upload capability İZİNLİ ve KULLANILIYOR (server-authorized).
ok(
  "3. page: uploadToSignedUrl kullanılıyor (server-authorized capability)",
  /\.uploadToSignedUrl\s*\(/.test(page),
);
// 4: signed upload path client tarafından ÜRETİLMİYOR (tenant/archive path template yok).
ok(
  "4. page: client-built `${tenantId}/${archiveId}/...` storage path YOK",
  !/`\$\{tenantId\}\/\$\{archiveId\}\//.test(page),
);
// 5: path server response'tan geliyor (prepare çağrısı + path alan akış).
ok(
  "5. page: /api/kisisel-arsiv/files/upload (prepare) + /finalize kullanılıyor",
  page.includes("/api/kisisel-arsiv/files/upload") && page.includes("/api/kisisel-arsiv/files/finalize"),
);
// 6: byte-proxy YOK — page dosyayı FormData ile files/upload'a POST etmiyor.
ok(
  "6. page: dosya byte'ı files/upload'a FormData ile GÖNDERİLMİYOR (byte-proxy yok)",
  !/files\/upload[\s\S]{0,400}new FormData\(\)/.test(page),
);

// ─── SOURCE CONTRACT — PREPARE (signed upload hazırlığı) ─────────────────────
console.log("SOURCE CONTRACT — PREPARE ROUTE");
ok(
  '7. prepare: requireModuleAccess(req, "personal_archive") VAR',
  /requireModuleAccess\(\s*req\s*,\s*["']personal_archive["']\s*\)/.test(prepareRoute),
);
ok(
  "8. prepare: tenantId guard'dan (server-derived) alınıyor",
  /const\s*\{[^}]*\btenantId\b[^}]*\}\s*=\s*guard/.test(prepareRoute),
);
ok(
  "9. prepare: client tenantId (body/query) OKUNMUYOR",
  !/get\(\s*["']tenantId["']\s*\)/.test(prepareRoute) && !/body\.tenantId/.test(prepareRoute),
);
ok(
  "10. prepare: client file_path/path OKUNMUYOR (path server üretir)",
  !/body\.(file_path|path)\b/.test(prepareRoute),
);
ok(
  "11. prepare: archive tenant ownership (archiveInTenant + tenant_id eq)",
  /archiveInTenant\(/.test(prepareRoute) &&
    /\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/.test(prepareRoute),
);
ok(
  "12. prepare: server-generated path (buildPersonalArchivePath + randomUUID)",
  prepareRoute.includes("buildPersonalArchivePath") && /crypto\.randomUUID\(\)/.test(prepareRoute),
);
ok(
  "13. prepare: createSignedUploadUrl service_role (guard.db) + upsert:false",
  /db\.storage\s*\.\s*from\(\s*PERSONAL_ARCHIVE_BUCKET\s*\)\s*\.\s*createSignedUploadUrl\(/.test(prepareRoute) &&
    /upsert\s*:\s*false/.test(prepareRoute),
);
ok(
  "14. prepare: byte-proxy YOK (formData/arrayBuffer/.upload( kullanmıyor)",
  !/formData\(/.test(prepareRoute) && !/arrayBuffer\(/.test(prepareRoute) &&
    !/\.upload\(/.test(prepareRoute),
);

// ─── SOURCE CONTRACT — FINALIZE + CLEANUP ────────────────────────────────────
console.log("SOURCE CONTRACT — FINALIZE / CLEANUP");
ok(
  '15. finalize: requireModuleAccess("personal_archive") + tenantId guard',
  /requireModuleAccess\(\s*req\s*,\s*["']personal_archive["']\s*\)/.test(finalizeRoute) &&
    /const\s*\{[^}]*\btenantId\b[^}]*\}\s*=\s*guard/.test(finalizeRoute),
);
ok(
  "16. finalize: path tenant+archive öneki zorunlu (isOwnedPersonalArchivePath)",
  /isOwnedPersonalArchivePath\(/.test(finalizeRoute),
);
ok(
  "17. finalize: güçlü bağlama — obje varlığı doğrulanıyor (exists)",
  /\.exists\(/.test(finalizeRoute),
);
ok(
  "18. cleanup: yalnız orphan (metadata'sız) + tenant+archive-scoped path siler",
  /isOwnedPersonalArchivePath\(/.test(cleanupRoute) &&
    /file_path/.test(cleanupRoute) &&
    /remove\(/.test(cleanupRoute),
);

// ─── SOURCE CONTRACT — DELETE DATA CONSISTENCY ───────────────────────────────
console.log("SOURCE CONTRACT — DELETE CONSISTENCY");
ok(
  "19. files DELETE: path DB'den tenant+archive scoped çözülüyor",
  /\.select\(\s*["']file_path["']\s*\)/.test(filesRoute) &&
    /\.eq\(\s*["']tenant_id["']\s*,\s*tenantId\s*\)/.test(filesRoute) &&
    /\.eq\(\s*["']archive_id["']\s*,\s*archiveId\s*\)/.test(filesRoute),
);
ok(
  "20. files DELETE: storage.remove service_role (guard.db) ile",
  /db\.storage\.from\(\s*PERSONAL_ARCHIVE_BUCKET\s*\)\.remove\(/.test(filesRoute),
);
// KRİTİK: storage remove hata verirse metadata delete YAPILMAZ → 500 döner (retryable).
// rmError-guarded 500 dönüşü, metadata delete bloğundan ÖNCE gelmeli (whitespace-insensitive).
{
  const idxAbort = filesRoute.indexOf("Dosyalar silinemedi");
  const idxMetaDeleteComment = filesRoute.indexOf("Storage objeleri güvenle kaldırıldı");
  const abortsBeforeMetaDelete =
    idxAbort > -1 && idxMetaDeleteComment > -1 && idxAbort < idxMetaDeleteComment;
  ok(
    "21. files DELETE: storage hata → metadata delete ÖNCESİ 500 (retryable, orphan üretmez)",
    abortsBeforeMetaDelete,
  );
}
ok(
  "22. files: legacy JSON POST file_path tenant+archive öneki zorunlu",
  /isOwnedPersonalArchivePath\(/.test(filesRoute),
);

// ─── MIGRATION CONTRACT ──────────────────────────────────────────────────────
console.log("MIGRATION CONTRACT");
const mig = migration.toLowerCase();
ok(
  "23. migration: personal-archive public=false",
  /update\s+storage\.buckets\s+set\s+public\s*=\s*false\s+where\s+id\s*=\s*'personal-archive'/.test(mig),
);
const REQUIRED_DROPS = [
  "allow public personal archive read",
  "allow public personal archive uploads",
  "allow public personal archive delete",
  "personal_archive_anon_insert",
  "personal_archive_anon_delete",
];
for (const name of REQUIRED_DROPS) {
  ok(
    `24. migration DROP POLICY "${name}"`,
    new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+"${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s+on\\s+storage\\.objects`).test(mig),
  );
}
ok(
  "25. migration: yeni CREATE POLICY YOK (anon/public replacement yok)",
  !/create\s+policy/.test(mig),
);

// ─── BEHAVIOR (saf yardımcılar) ──────────────────────────────────────────────
console.log("BEHAVIOR");
const T1 = "11111111-1111-1111-1111-111111111111";
const T2 = "22222222-2222-2222-2222-222222222222";
const A1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const A2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

ok("bucket sabiti personal-archive", PERSONAL_ARCHIVE_BUCKET === "personal-archive");
ok("max bytes = 50MB", PERSONAL_ARCHIVE_MAX_BYTES === 50 * 1024 * 1024);

const built = buildPersonalArchivePath(T1, A1, "uuid123", "belge.pdf");
ok("path: tenant/archive/uuid_name biçimi", built === `${T1}/${A1}/uuid123_belge.pdf`);
ok("path: kendi tenant+archive önekinde owned", isOwnedPersonalArchivePath(built, T1, A1));
ok("owned: cross-tenant path RED", !isOwnedPersonalArchivePath(`${T2}/${A1}/x_belge.pdf`, T1, A1));
ok("owned: cross-archive path RED", !isOwnedPersonalArchivePath(`${T1}/${A2}/x_belge.pdf`, T1, A1));
ok("owned: path traversal RED", !isOwnedPersonalArchivePath(`${T1}/${A1}/../../etc`, T1, A1));
ok("owned: absolute URL RED", !isOwnedPersonalArchivePath(`https://evil/${T1}/${A1}/x`, T1, A1));
ok("owned: non-string RED", !isOwnedPersonalArchivePath(null, T1, A1) && !isOwnedPersonalArchivePath(123, T1, A1));
ok("sanitize: tehlikeli karakterler _ olur", sanitizePersonalArchiveFileName("a/b\\c:*?\"<>|.txt").indexOf("/") === -1);
ok("sanitize: boş → dosya", sanitizePersonalArchiveFileName("") === "dosya" && sanitizePersonalArchiveFileName("///") !== "");
ok("sanitize: 180 karakter sınırı", sanitizePersonalArchiveFileName("x".repeat(500)).length <= 180);

// ─── SONUÇ ───────────────────────────────────────────────────────────────────
console.log(`\nP1-3 PERSONAL-ARCHIVE STORAGE HARNESS: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
