/**
 * Yaşam Hafızası™ — BF-11A Outbox statik + saf-durum-makinesi harness.
 * ====================================================================
 *
 * DETERMİNİSTİK, SALT-OKUNUR, DB'SİZ, dependency'siz (yalnız Node built-in + gerçek
 * outboxState modülü). Gerçek ağa / production'a / veritabanına BAĞLANMAZ.
 *
 * İki katman:
 *   A. Şema sözleşmesi statik doğrulamaları — gerçek migration SQL'i metin olarak
 *      okunur, invariant'lar exact/regex ile denetlenir (kelime araması ile sahte
 *      PASS üretmemek için yorumlar ÖNCE strip edilir).
 *   B/C. Saf durum makinesi + yarış senaryoları — GERÇEK
 *      lib/yasam-hafizasi/outbox/outboxState.ts import edilir (kopya/taklit YOK).
 *
 * Çalıştır (repo kökünden):  npx tsx scripts/yh-outbox-state-harness.mjs
 *   (.mjs, TS modülü import ettiği için tsx ile koşar; herhangi bir FAIL → exit 1.)
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OUTBOX_OPERATIONS,
  OUTBOX_STATUSES,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BASE_DELAY_SECONDS,
  DEFAULT_MAX_DELAY_SECONDS,
  computeBackoffSeconds,
  decideComplete,
  decideFail,
  decideLeaseRecovery,
  isValidTransition,
  assertTransition,
} from "../lib/yasam-hafizasi/outbox/outboxState.ts";

// ─── Test altyapısı ──────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    fails.push(desc);
    console.error(`  FAIL  ${desc}`);
  }
}
function expectThrow(desc, fn) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  check(desc, threw);
}
function expectNoThrow(desc, fn) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  check(desc, !threw);
}
const eqArr = (a, b) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

// ═════════════════════════════════════════════════════════════════════════════
// A. ŞEMA SÖZLEŞMESİ STATİK DOĞRULAMALARI
// ═════════════════════════════════════════════════════════════════════════════
const HERE = dirname(fileURLToPath(import.meta.url));
const MIG_DIR = join(HERE, "..", "supabase", "migrations");
const EXPECTED_NAME = "20260814000000_yasam_hafizasi_outbox.sql";

const allMig = readdirSync(MIG_DIR);
const outboxFiles = allMig.filter((f) => /_yasam_hafizasi_outbox\.sql$/.test(f));
check(`A01. Tam bir outbox migration dosyasi bulundu (${outboxFiles.length})`, outboxFiles.length === 1);

const MIG_NAME = outboxFiles[0] ?? "";
check(`A02. Migration adi kanonik: ${MIG_NAME}`, MIG_NAME === EXPECTED_NAME);

const ts = MIG_NAME.match(/^(\d{14})_/)?.[1] ?? "";
const tsList = allMig.map((f) => f.match(/^(\d{14})_/)?.[1]).filter(Boolean);
check(
  `A03. Timestamp 14 haneli + tekil (collision yok): ${ts}`,
  /^\d{14}$/.test(ts) && tsList.filter((t) => t === ts).length === 1,
);

const RAW = MIG_NAME ? readFileSync(join(MIG_DIR, MIG_NAME), "utf8") : "";
// Yorumları strip et (prose'un sahte PASS üretmesini engelle).
const BODY = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

// Tablo bloğunu ayıkla (CREATE TABLE ... ilk "\n);").
function tableBlock() {
  const s = BODY.indexOf("CREATE TABLE IF NOT EXISTS public.yasam_hafizasi_outbox (");
  if (s < 0) return "";
  const e = BODY.indexOf("\n);", s);
  return BODY.slice(s, e < 0 ? BODY.length : e + 3);
}
const TBL = tableBlock();
check("A04. yasam_hafizasi_outbox tablosu tanimli", TBL.length > 0);

// tenant_id NOT NULL.
check("A05. tenant_id NOT NULL", /\btenant_id\s+uuid\s+NOT NULL/i.test(TBL));

// operation yalnız upsert/delete.
check(
  "A06. operation CHECK IN ('upsert','delete')",
  /operation\s+IN\s*\(\s*'upsert'\s*,\s*'delete'\s*\)/i.test(TBL),
);
// status yalnız pending/processing/succeeded/dead + 'failed' YOK (tüm BODY'de).
check(
  "A07. status CHECK IN ('pending','processing','succeeded','dead')",
  /status\s+IN\s*\(\s*'pending'\s*,\s*'processing'\s*,\s*'succeeded'\s*,\s*'dead'\s*\)/i.test(TBL),
);
check("A08. 'failed' statusu HIC yok", !/'failed'/i.test(BODY));

// Koşulsuz UNIQUE(source_key, source_id); partial unique YOK.
check(
  "A09. UNIQUE (source_key, source_id) kosulsuz",
  /UNIQUE\s*\(\s*source_key\s*,\s*source_id\s*\)/i.test(TBL),
);
check("A10. partial unique index YOK", !/CREATE\s+UNIQUE\s+INDEX/i.test(BODY));

// event_version sequence + default nextval.
check(
  "A11. event_version sequence tanimli",
  /CREATE SEQUENCE IF NOT EXISTS public\.yasam_hafizasi_outbox_event_version_seq/i.test(BODY),
);
check(
  "A12. event_version DEFAULT nextval(seq)",
  /event_version\s+bigint\s+NOT NULL[\s\S]*?nextval\('public\.yasam_hafizasi_outbox_event_version_seq'\)/i.test(
    TBL,
  ),
);

// Yasak alanlar.
check("A13. payload_snapshot YOK", !/payload_snapshot/i.test(BODY));
check("A14. owner_user_id YOK", !/owner_user_id/i.test(BODY));

// Kaynak trigger / worker / FK / index-yazimi YOK.
check("A15. CREATE TRIGGER YOK", !/CREATE\s+TRIGGER/i.test(BODY));
check("A16. kaynak-tabloya FK (REFERENCES) YOK", !/\bREFERENCES\b/i.test(BODY));
check("A17. yasam_hafizasi_index'e dokunmuyor", !/yasam_hafizasi_index/i.test(BODY));
check("A18. Inngest referansi YOK", !/inngest/i.test(BODY));
// ALTER TABLE yalnız outbox'u hedefler (kaynak tablo ALTER yok).
{
  const alters = BODY.match(/ALTER TABLE\s+public\.[a-z_]+/gi) ?? [];
  check(
    "A19. ALTER TABLE yalniz yasam_hafizasi_outbox",
    alters.every((a) => /public\.yasam_hafizasi_outbox\b/i.test(a)),
  );
}

// RLS + grant.
check(
  "A20. RLS ENABLE",
  /ALTER TABLE public\.yasam_hafizasi_outbox ENABLE ROW LEVEL SECURITY/i.test(BODY),
);
check(
  "A21. tablo REVOKE anon/authenticated",
  /REVOKE ALL PRIVILEGES ON TABLE public\.yasam_hafizasi_outbox FROM PUBLIC, anon, authenticated/i.test(
    BODY,
  ),
);
check("A22. tablo GRANT service_role", /ON TABLE public\.yasam_hafizasi_outbox TO service_role/i.test(BODY));
check(
  "A23. sequence REVOKE + service_role grant",
  /REVOKE ALL PRIVILEGES ON SEQUENCE public\.yasam_hafizasi_outbox_event_version_seq/i.test(BODY) &&
    /ON SEQUENCE public\.yasam_hafizasi_outbox_event_version_seq TO service_role/i.test(BODY),
);

// Dört RPC + güvenlik sözleşmesi.
const RPCS = ["yh_outbox_claim", "yh_outbox_complete", "yh_outbox_fail", "yh_outbox_sweep_expired"];
for (const fn of RPCS) {
  check(
    `A24.${fn} mevcut`,
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`, "i").test(BODY),
  );
  check(
    `A25.${fn} yalniz service_role EXECUTE`,
    new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*(?:TO service_role|\\n\\s*TO service_role)`, "i").test(
      BODY,
    ) && new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(`, "i").test(BODY),
  );
}
check("A26. SECURITY DEFINER >= 4", (BODY.match(/SECURITY DEFINER/g) ?? []).length >= 4);
check("A27. sabit search_path >= 4", (BODY.match(/SET search_path = public, pg_catalog/g) ?? []).length >= 4);
check("A28. FOR UPDATE SKIP LOCKED (claim + sweep)", (BODY.match(/FOR UPDATE SKIP LOCKED/g) ?? []).length >= 2);

// Worker/version koruması (complete + fail).
check(
  "A29. lock sahibi korumasi (locked_by DISTINCT FROM p_worker)",
  (BODY.match(/locked_by IS DISTINCT FROM p_worker/g) ?? []).length >= 2,
);
check(
  "A30. sürüm korumasi (claimed vs event_version)",
  /p_claimed_version\s*>\s*v_row\.event_version/.test(BODY) &&
    /p_claimed_version\s*=\s*v_row\.event_version/.test(BODY),
);
// Sweep lease mantığı + attempts sıfırlanmıyor.
check(
  "A31. sweep lease: locked_at < now() - make_interval",
  /locked_at\s*<\s*now\(\)\s*-\s*make_interval\(secs => p_lease_seconds\)/i.test(BODY),
);

// ═════════════════════════════════════════════════════════════════════════════
// B. SAF DURUM MAKİNESİ TESTLERİ (gerçek outboxState.ts)
// ═════════════════════════════════════════════════════════════════════════════
check("B01. OUTBOX_OPERATIONS = [upsert, delete]", eqArr([...OUTBOX_OPERATIONS], ["upsert", "delete"]));
check(
  "B02. OUTBOX_STATUSES = [pending, processing, succeeded, dead]",
  eqArr([...OUTBOX_STATUSES], ["pending", "processing", "succeeded", "dead"]),
);
check("B03. 'failed' status listede yok", !OUTBOX_STATUSES.includes("failed"));
check(
  "B04. varsayilan sabitler (8 / 30 / 3600)",
  DEFAULT_MAX_ATTEMPTS === 8 && DEFAULT_BASE_DELAY_SECONDS === 30 && DEFAULT_MAX_DELAY_SECONDS === 3600,
);

// Backoff.
check("B05. backoff 1. attempt = base (30)", computeBackoffSeconds(1) === 30);
check("B06. backoff 2. attempt = 60", computeBackoffSeconds(2) === 60);
check("B07. backoff 3. attempt = 120", computeBackoffSeconds(3) === 120);
check(
  "B08. backoff artan (monoton)",
  computeBackoffSeconds(1) < computeBackoffSeconds(2) && computeBackoffSeconds(2) < computeBackoffSeconds(3),
);
check("B09. backoff cap = maxDelay (3600)", computeBackoffSeconds(100) === 3600);
check("B10. backoff cap tam sinir", computeBackoffSeconds(50) <= 3600);
expectThrow("B11. backoff attempts=0 throw", () => computeBackoffSeconds(0));
expectThrow("B12. backoff attempts=-1 throw", () => computeBackoffSeconds(-1));
expectThrow("B13. backoff attempts=1.5 throw", () => computeBackoffSeconds(1.5));
expectThrow("B14. backoff maxDelay<base throw", () => computeBackoffSeconds(1, 100, 50));

// Complete.
check("B15. complete same version = succeeded", decideComplete(5, 5) === "succeeded");
check("B16. complete newer current = requeued_newer_event", decideComplete(4, 5) === "requeued_newer_event");
expectThrow("B17. complete claimed>current throw (imkansiz)", () => decideComplete(6, 5));
expectThrow("B18. complete gecersiz sürüm throw", () => decideComplete(0, 5));

// Fail.
{
  const d = decideFail({ attempts: 1, claimedVersion: 5, currentVersion: 5 });
  check("B19. fail retry_scheduled + delay 30", d.disposition === "retry_scheduled" && d.delaySeconds === 30);
}
{
  const d = decideFail({ attempts: 8, claimedVersion: 5, currentVersion: 5, maxAttempts: 8 });
  check("B20. fail attempts>=max = dead (delay null)", d.disposition === "dead" && d.delaySeconds === null);
}
{
  const d = decideFail({ attempts: 3, claimedVersion: 4, currentVersion: 5 });
  check(
    "B21. fail newer event = requeued (delay null)",
    d.disposition === "requeued_newer_event" && d.delaySeconds === null,
  );
}
expectThrow("B22. fail claimed>current throw", () =>
  decideFail({ attempts: 1, claimedVersion: 6, currentVersion: 5 }),
);
{
  const d = decideFail({ attempts: 2, claimedVersion: 5, currentVersion: 5 });
  check("B23. fail 2. attempt backoff 60", d.disposition === "retry_scheduled" && d.delaySeconds === 60);
}

// Lease recovery.
check(
  "B24. lease recover (processing + expired)",
  decideLeaseRecovery({ status: "processing", lockedAtMs: 0, nowMs: 100000, leaseSeconds: 60 }) === "recover",
);
check(
  "B25. lease keep (processing + not expired)",
  decideLeaseRecovery({ status: "processing", lockedAtMs: 100000, nowMs: 110000, leaseSeconds: 60 }) === "keep",
);
check(
  "B26. lease keep (non-processing: succeeded)",
  decideLeaseRecovery({ status: "succeeded", lockedAtMs: null, nowMs: 100000, leaseSeconds: 60 }) === "keep",
);
check(
  "B27. lease keep (non-processing: pending)",
  decideLeaseRecovery({ status: "pending", lockedAtMs: null, nowMs: 100000, leaseSeconds: 60 }) === "keep",
);
expectThrow("B28. lease processing + lockedAt null throw", () =>
  decideLeaseRecovery({ status: "processing", lockedAtMs: null, nowMs: 100000, leaseSeconds: 60 }),
);

// Transitions.
check("B29. pending->processing valid", isValidTransition("pending", "processing"));
check("B30. processing->succeeded valid", isValidTransition("processing", "succeeded"));
check("B31. processing->pending valid", isValidTransition("processing", "pending"));
check("B32. processing->dead valid", isValidTransition("processing", "dead"));
check("B33. succeeded->pending valid", isValidTransition("succeeded", "pending"));
check("B34. dead->pending valid", isValidTransition("dead", "pending"));
check("B35. pending->succeeded INVALID", !isValidTransition("pending", "succeeded"));
check("B36. pending->dead INVALID", !isValidTransition("pending", "dead"));
check("B37. succeeded->processing INVALID", !isValidTransition("succeeded", "processing"));
check("B38. processing->processing INVALID", !isValidTransition("processing", "processing"));
expectNoThrow("B39. assertTransition valid no-throw", () => assertTransition("pending", "processing"));
expectThrow("B40. assertTransition invalid throw", () => assertTransition("pending", "succeeded"));

// ═════════════════════════════════════════════════════════════════════════════
// C. YARIŞ SENARYOLARI (sürüm mantığıyla modellenir)
// ═════════════════════════════════════════════════════════════════════════════
// insert → update: v1 claim edildi, coalesce ile v2 geldi → complete requeue.
check("C01. insert->update: complete(v1,v2) requeue", decideComplete(1, 2) === "requeued_newer_event");
// update x3: v1 claim, current v4.
check("C02. update x3: complete(1,4) requeue", decideComplete(1, 4) === "requeued_newer_event");
// update → delete: operation değişse de sürüm arttı → requeue.
check("C03. update->delete: complete(2,3) requeue", decideComplete(2, 3) === "requeued_newer_event");
// delete → aynı UUID create: sürüm arttı → requeue.
check("C04. delete->recreate: complete(3,4) requeue", decideComplete(3, 4) === "requeued_newer_event");
// worker processing sırasında yeni update, sonra fail → requeue (dead değil).
check(
  "C05. processing sirasi yeni update -> fail requeue",
  decideFail({ attempts: 2, claimedVersion: 1, currentVersion: 2 }).disposition === "requeued_newer_event",
);
// stale worker complete: eski sürümle succeeded YAPAMAZ.
check("C06. stale worker complete -> requeue", decideComplete(1, 5) === "requeued_newer_event");
// stale worker fail: eski sürümle dead YAPAMAZ (max attempts dahi olsa).
check(
  "C07. stale worker fail (attempts>=max ama newer) -> requeue",
  decideFail({ attempts: 8, claimedVersion: 1, currentVersion: 9, maxAttempts: 8 }).disposition ===
    "requeued_newer_event",
);
// aynı sürümde son deneme → dead (yarış yok).
check(
  "C08. ayni sürüm son deneme -> dead",
  decideFail({ attempts: 8, claimedVersion: 9, currentVersion: 9, maxAttempts: 8 }).disposition === "dead",
);

// ─── Özet ────────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\nyh-outbox-state-harness: ${pass}/${total} PASS` + (fail ? `, ${fail} FAIL` : ""));
if (fail) {
  console.error("FAILED:\n  - " + fails.join("\n  - "));
  process.exit(1);
}
