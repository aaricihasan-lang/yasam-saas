/**
 * FAZ1 FINAL HARDENING — PAKET AUTH / item 11 (video-temp) harness.
 * DB/ağ YOK. Çalıştır: npx tsx scripts/final-hardening/auth-video.harness.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildServerVideoTempPath,
  buildSafeVideoFileName,
  isVideoTempPathOwned,
  pickClientJobPatchFields,
  planVideoTempCleanup,
  resolveVideoUploadMime,
  VIDEO_TEMP_BUCKET_MIME_TYPES,
  VIDEO_TEMP_MAX_BYTES,
  type CleanupJob,
} from "../../lib/video-ceviri/videoTempPath";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    fail++;
    console.error(`FAIL  ${name}\n      ${(e as Error).message}`);
  }
}

const T = "11111111-1111-1111-1111-111111111111";
const J = "22222222-2222-2222-2222-222222222222";
const T2 = "33333333-3333-3333-3333-333333333333";
const J2 = "44444444-4444-4444-4444-444444444444";

// ── PATCH allowlist ─────────────────────────────────────────────────────────
t("PATCH: videoTempPath YOK SAYILIR", () => {
  const f = pickClientJobPatchFields({ jobId: J, videoTempPath: `${T2}/${J2}/x.mp4` });
  assert.equal("video_temp_path" in f, false);
  assert.deepEqual(f, {});
});
t("PATCH: video_temp_path (snake) YOK SAYILIR", () => {
  const f = pickClientJobPatchFields({ video_temp_path: "evil", status: "failed", errorMessage: "x" });
  assert.deepEqual(f, { status: "failed", error_message: "x" });
});
t("PATCH: status yalnız 'failed' (completed reddedilir)", () => {
  assert.deepEqual(pickClientJobPatchFields({ status: "completed" }), {});
});

// ── Yol sahipliği ───────────────────────────────────────────────────────────
t("kendi öneki kabul", () => {
  assert.equal(isVideoTempPathOwned(`${T}/${J}/1700_a.mp4`, T, J), true);
});
t("sunucu-türetilmiş yol her zaman sahip-önekli", () => {
  for (const n of ["kayıt ses.AMR", "../../etc/passwd", "a\\b.mp4", "x//y.mp3", "", "....mp4", "ş.ğ.ü.mov"]) {
    const p = buildServerVideoTempPath(T, J, n, 1700);
    assert.equal(isVideoTempPathOwned(p, T, J), true, `${n} → ${p}`);
  }
});
t("yabancı tenant öneki reddedilir", () => assert.equal(isVideoTempPathOwned(`${T2}/${J}/a.mp4`, T, J), false));
t("yabancı job öneki reddedilir", () => assert.equal(isVideoTempPathOwned(`${T}/${J2}/a.mp4`, T, J), false));
t("'..' reddedilir", () => assert.equal(isVideoTempPathOwned(`${T}/${J}/../${J2}/a.mp4`, T, J), false));
t("ters slash reddedilir", () => assert.equal(isVideoTempPathOwned(`${T}/${J}/a\\b.mp4`, T, J), false));
t("'//' reddedilir", () => assert.equal(isVideoTempPathOwned(`${T}/${J}//a.mp4`, T, J), false));
t("alt klasör / boş ad reddedilir", () => {
  assert.equal(isVideoTempPathOwned(`${T}/${J}/sub/a.mp4`, T, J), false);
  assert.equal(isVideoTempPathOwned(`${T}/${J}/`, T, J), false);
  assert.equal(isVideoTempPathOwned(null, T, J), false);
});
t("güvenli ad: uzantı korunur, yalnız güvenli karakter", () => {
  const n = buildSafeVideoFileName("Görüşme kaydı (1).M4A", 5);
  assert.match(n, /^5_[A-Za-z0-9._-]+\.m4a$/);
});

// ── MIME ────────────────────────────────────────────────────────────────────
t("MIME: octet-stream + .amr → audio/amr (bucket listesinde)", () => {
  const m = resolveVideoUploadMime("wa.amr", "application/octet-stream");
  assert.equal(m, "audio/amr");
  assert.ok(VIDEO_TEMP_BUCKET_MIME_TYPES.includes(m!));
});
t("MIME: bilinmeyen tür → null", () => assert.equal(resolveVideoUploadMime("x.exe", "application/x-msdownload"), null));
t("MIME: bucket listesi octet-stream içermez + 25 MB", () => {
  assert.equal(VIDEO_TEMP_BUCKET_MIME_TYPES.includes("application/octet-stream"), false);
  assert.equal(VIDEO_TEMP_MAX_BYTES, 26214400);
});
t("MIME: migration listesi = kod listesi", () => {
  const sql = read("supabase/migrations/20270129001000_video_temp_storage_lockdown.sql");
  const arr = sql.slice(sql.indexOf("ARRAY["), sql.indexOf("]::text[]"));
  const inSql = [...arr.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...inSql].sort(), [...VIDEO_TEMP_BUCKET_MIME_TYPES].sort());
  assert.match(sql, /file_size_limit = 26214400/);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+storage\.objects/i);
});

// ── Temizlik seçimi (24 saat) ───────────────────────────────────────────────
const NOW = Date.parse("2026-09-27T12:00:00Z");
const h = (n: number) => new Date(NOW - n * 3600_000).toISOString();
t("temizlik: 24 saatten eski + silinmemiş iş → işaretlenir + nesnesi silinir", () => {
  const jobs: CleanupJob[] = [
    { id: J, tenant_id: T, video_temp_path: `${T}/${J}/a.mp4`, video_deleted_at: null, created_at: h(30) },
    { id: J2, tenant_id: T, video_temp_path: `${T}/${J2}/b.mp4`, video_deleted_at: null, created_at: h(2) },
  ];
  const plan = planVideoTempCleanup(jobs, [], NOW);
  assert.deepEqual(plan.jobIdsToMark, [J]);
  assert.deepEqual(plan.objectPathsToDelete, [`${T}/${J}/a.mp4`]);
});
t("temizlik: yabancı yol (eski/legacy) SİLİNMEZ ama iş işaretlenir", () => {
  const jobs: CleanupJob[] = [
    { id: J, tenant_id: T, video_temp_path: `${T2}/${J2}/x.mp4`, video_deleted_at: null, created_at: h(48) },
  ];
  const plan = planVideoTempCleanup(jobs, [], NOW);
  assert.deepEqual(plan.objectPathsToDelete, []);
  assert.deepEqual(plan.jobIdsToMark, [J]);
});
t("temizlik: sahipsiz eski nesne silinir; taze nesne/taze işin nesnesi korunur", () => {
  const jobs: CleanupJob[] = [
    { id: J2, tenant_id: T, video_temp_path: `${T}/${J2}/b.mp4`, video_deleted_at: null, created_at: h(1) },
  ];
  const plan = planVideoTempCleanup(
    jobs,
    [
      { path: `${T2}/${J}/orphan.mp4`, created_at: h(25) },
      { path: `${T2}/${J}/fresh.mp4`, created_at: h(3) },
      { path: `${T}/${J2}/b.mp4`, created_at: h(30) }, // (saat kayması) taze işe ait → dokunma
      { path: `${T}/../x`, created_at: h(99) },
    ],
    NOW,
  );
  assert.deepEqual(plan.objectPathsToDelete, [`${T2}/${J}/orphan.mp4`]);
  assert.deepEqual(plan.jobIdsToMark, []);
});
t("temizlik: video_deleted_at dolu iş tekrar işaretlenmez", () => {
  const plan = planVideoTempCleanup(
    [{ id: J, tenant_id: T, video_temp_path: `${T}/${J}/a.mp4`, video_deleted_at: h(20), created_at: h(40) }],
    [],
    NOW,
  );
  assert.deepEqual(plan, { jobIdsToMark: [], objectPathsToDelete: [] });
});

// ── Statik kontroller ───────────────────────────────────────────────────────
t("statik: VideoUploadZone anon .upload( kullanmıyor; uploadToSignedUrl kullanıyor", () => {
  const src = read("app/video-ceviri/components/VideoUploadZone.tsx");
  assert.doesNotMatch(src, /\.upload\(/);
  assert.match(src, /uploadToSignedUrl\(/);
  assert.match(src, /\/api\/video-ceviri\/get-upload-url/);
  assert.doesNotMatch(src, /updateVideoJobTempPath|videoTempPath\s*[:,}]/);
});
t("statik: job PATCH video_temp_path yazmıyor", () => {
  const src = read("app/api/video-ceviri/job/route.ts");
  assert.doesNotMatch(src, /fields\.video_temp_path|body\.videoTempPath/);
  assert.match(src, /pickClientJobPatchFields\(body\)/);
});
t("statik: get-upload-url yolu sunucuda türetir, istemci storagePath'i okumaz", () => {
  const src = read("app/api/video-ceviri/get-upload-url/route.ts");
  assert.match(src, /buildServerVideoTempPath\(/);
  assert.doesNotMatch(src, /body\.storagePath|storagePath\?:/);
  assert.match(src, /video_temp_path: storagePath/);
});
t("statik: transcribe sahiplik doğrular + finally'de siler + video_deleted_at", () => {
  const src = read("app/api/video-ceviri/transcribe/route.ts");
  assert.match(src, /isVideoTempPathOwned\(tempPath, tenantId, jobId\)/);
  assert.match(src, /status: 403/);
  assert.match(src, /finally \{\s*await deleteVideoTempObject\(/);
  assert.match(src, /video_deleted_at: new Date\(\)\.toISOString\(\)/);
  assert.match(src, /\.remove\(\[path\]\)/);
});
t("statik: temizlik fonksiyonu serve'e kayıtlı + env-gated", () => {
  const route = read("app/api/inngest/route.ts");
  assert.match(route, /videoTempCleanupFunction/);
  const fn = read("lib/inngest/functions/videoTempCleanup.ts");
  assert.match(fn, /VIDEO_TEMP_CLEANUP_ENABLED/);
  assert.match(fn, /planVideoTempCleanup\(/);
});

console.log(`\nauth-video harness: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);
