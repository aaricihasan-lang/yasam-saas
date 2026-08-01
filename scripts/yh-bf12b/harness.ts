/**
 * BF-12B — Tek kapsamlı fixture harness (30 senaryo → tek PASS/BLOCKED).
 *
 * Yalnız sentetik veri; gerçek production bağlantısı/backup YOK. Çalıştırma:
 *   npm run yh:bf12b:harness   (tsx scripts/yh-bf12b/harness.ts)
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBackup } from "../../lib/yasam-hafizasi/backup/engine";
import { FixtureReader, type FixtureDataset } from "../../lib/yasam-hafizasi/backup/reader";
import { FixtureStorage, type FixtureStorageData } from "../../lib/yasam-hafizasi/backup/storage";
import { validateArchive, type DatabaseArchive } from "../../lib/yasam-hafizasi/backup/validate";
import { decryptArtifact } from "../../lib/yasam-hafizasi/backup/crypto";
import { buildWordArchive } from "../../lib/yasam-hafizasi/backup/word";
import { findGitRoot } from "../../lib/yasam-hafizasi/backup/outputSafety";
import { redactSecrets, resolveProductionDbConfig, type ProdResolveInput } from "../../lib/yasam-hafizasi/backup/prodConfig";
import { COMPLETE_MARKER } from "../../lib/yasam-hafizasi/backup/constants";
import type {
  EncryptedEnvelope,
  ForeignKey,
  PrivateManifest,
  PublicManifest,
  Row,
  TablePolicyDecision,
} from "../../lib/yasam-hafizasi/backup/types";
import {
  DriftStorage,
  SECRET_SENTINEL,
  SizeMismatchStorage,
  buildBaseDb,
  buildBaseStorage,
  withDuplicatePk,
  withMissingFkParent,
  withNoOwner,
  withPlaintextPassword,
  withUnexpectedSensitiveColumn,
  withUnresolvedTable,
} from "./fixture";

const PASS = "bf12b-fixture-passphrase-1234";
const REPO_ROOT = findGitRoot(process.cwd()) ?? process.cwd();
const NOW = "2026-08-01T00:00:00Z";
let seq = 0;
const cleanupDirs: string[] = [];

function outDir(name: string): string {
  seq += 1;
  const p = join(tmpdir(), `bf12b-${name}-${process.pid}-${seq}`);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  cleanupDirs.push(p);
  return p;
}

async function doRun(db: FixtureDataset, storage: FixtureStorageData | SizeMismatchStorage | DriftStorage, name: string, opts?: { insideRepo?: boolean }) {
  const st = storage instanceof Map ? new FixtureStorage(storage) : storage;
  const outputDir = opts?.insideRepo ? join(REPO_ROOT, "bf12b-should-not-exist") : outDir(name);
  return runBackup({
    reader: new FixtureReader(db),
    storage: st,
    outputDir,
    passphrase: PASS,
    toolVersion: "bf12b-test",
    originMainSha: "test-sha",
    pageSize: 500,
    repoRoots: [REPO_ROOT],
    now: NOW,
  });
}

function readJson<T>(dir: string, rel: string): T {
  return JSON.parse(readFileSync(join(dir, rel), "utf8")) as T;
}
function readDbArchive(dir: string): DatabaseArchive {
  const env = readJson<EncryptedEnvelope>(dir, "database/database.full.json.enc");
  return JSON.parse(decryptArtifact(env, { passphrase: PASS }).toString("utf8")) as DatabaseArchive;
}
function readPrivate(dir: string): PrivateManifest {
  const env = readJson<EncryptedEnvelope>(dir, "manifests/manifest.private.json.enc");
  return JSON.parse(decryptArtifact(env, { passphrase: PASS }).toString("utf8")) as PrivateManifest;
}
function readFkGraph(dir: string): ForeignKey[] {
  const env = readJson<EncryptedEnvelope>(dir, "manifests/foreign-keys.json.enc");
  return JSON.parse(decryptArtifact(env, { passphrase: PASS }).toString("utf8")) as ForeignKey[];
}

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
function add(name: string, ok: boolean, detail = ""): void {
  checks.push({ name, ok, detail });
}
async function expectThrow(name: string, fn: () => Promise<unknown>, sub?: string): Promise<void> {
  try {
    await fn();
    add(name, false, "throw beklenirken başarılı oldu");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    add(name, sub ? msg.includes(sub) : true, sub ? `beklenen '${sub}' | gerçek '${msg}'` : msg);
  }
}

async function main(): Promise<void> {
  // ── Pozitif base run (birçok senaryo bunun üzerinden) ──
  const posDir = (await doRun(buildBaseDb(), buildBaseStorage(), "positive")).finalDir;
  const pub = readJson<PublicManifest>(posDir, "manifest.public.json");
  const priv = readPrivate(posDir);
  const db = readDbArchive(posDir);
  const byTable = new Map(priv.tableExports.map((e) => [e.table, e]));
  const decByTable = new Map<string, TablePolicyDecision>(priv.policyDecisions.map((d) => [d.table, d]));

  add("s1-owner-gate-exact-1", priv.ownerGate.passed && priv.ownerGate.matchedCount === 1, priv.ownerGate.reason);
  add("s2-expert-adminlevel-owner-excluded", priv.ownerGate.matchedCount === 1, `matched=${priv.ownerGate.matchedCount}`);
  const classes = new Set(priv.tenantFootprints.map((f) => f.klass));
  add("s3-demo-review", classes.has("demo_review"), [...classes].join(","));
  add("s4-three-test-experts", classes.has("test_expert_backup_then_delete"), "");
  add("s5-userless-legacy", classes.has("userless_legacy_review"), "");
  add("s6-null-shared-canonical", classes.has("null_shared"), "");
  add("s7-owner-shared-read", pub.ownerSharedReadDependency.some((x) => x.table === "stone_knowledge_articles" && x.ownerRows === 2), JSON.stringify(pub.ownerSharedReadDependency));
  add("s8-pagination-2501", byTable.get("big_table")?.rowCount === 2501, `rows=${byTable.get("big_table")?.rowCount}`);
  add("s9-composite-pk", byTable.get("composite_pk_table")?.rowCount === 3 && byTable.get("composite_pk_table")?.duplicatePrimaryKeys === 0, "");
  const order = priv.restorePlan.restoreOrder;
  add("s10-parent-before-child", order.indexOf("parent_table") < order.indexOf("child_table") && order.includes("child_table"), order.join(">"));
  const fkGraph = readFkGraph(posDir);
  const childFk = fkGraph.find((f) => f.table === "child_table" && f.refTable === "parent_table");
  add("s11-fk-metadata", childFk?.onDelete === "CASCADE", `onDelete=${childFk?.onDelete}`);
  add("s12-archive-only", decByTable.get("security_events")?.restorePolicy === "ARCHIVE_ONLY" && (db.tables.find((t) => t.table === "security_events")?.rows?.length ?? 0) === 1, "");
  add("s13-do-not-restore-session", decByTable.get("user_sessions")?.restorePolicy === "DO_NOT_RESTORE" && db.tables.find((t) => t.table === "user_sessions")?.rows === null, "");
  const usersRows = db.tables.find((t) => t.table === "users")?.rows ?? [];
  const ownerRow = usersRows.find((r) => r.id === "u-owner");
  add("s14-password-hash-in-encrypted-archive", ownerRow?.password_hash === SECRET_SENTINEL && priv.sensitiveScan.allowed.includes("users.password_hash"), "");

  // ── Negatifler ──
  await expectThrow("s15-plaintext-password-fail", () => doRun(withPlaintextPassword(), buildBaseStorage(), "pw"), "sensitive gate");
  await expectThrow("s16-unexpected-sensitive-fail", () => doRun(withUnexpectedSensitiveColumn(), buildBaseStorage(), "apikey"), "sensitive gate");
  await expectThrow("s17-unresolved-table-fail", () => doRun(withUnresolvedTable(), buildBaseStorage(), "unresolved"), "UNRESOLVED");
  await expectThrow("s18-duplicate-pk-fail", () => doRun(withDuplicatePk(), buildBaseStorage(), "duppk"), "tekrarlı PK");

  // s19/s27: missing FK parent → dry-run fail, complete=false, COMPLETE yok
  const mfp = await doRun(withMissingFkParent(), buildBaseStorage(), "missingfk");
  add("s19-missing-fk-parent-dryrun-fail", !mfp.complete && !mfp.validation.ok, mfp.validation.errors.join(";"));
  add("s27-partial-no-complete-marker", !existsSync(join(mfp.finalDir, COMPLETE_MARKER)), "");

  // s1 negatif: owner gate fail
  await expectThrow("s1neg-no-owner-fail", () => doRun(withNoOwner(), buildBaseStorage(), "noowner"), "owner gate");

  // s20: wrong passphrase
  {
    const env = readJson<EncryptedEnvelope>(posDir, "database/database.full.json.enc");
    let threw = false;
    try {
      decryptArtifact(env, { passphrase: "wrong-passphrase-xxxxxx" });
    } catch {
      threw = true;
    }
    add("s20-wrong-passphrase-fail", threw, "");
  }

  // s21: modified encrypted payload → validate fail
  {
    const badDir = (await doRun(buildBaseDb(), buildBaseStorage(), "tamper")).finalDir;
    const p = join(badDir, "database", "database.full.json.enc");
    const env = JSON.parse(readFileSync(p, "utf8")) as EncryptedEnvelope;
    const raw = Buffer.from(env.ciphertext, "base64");
    raw[0] = raw[0] ^ 0xff;
    env.ciphertext = raw.toString("base64");
    writeFileSync(p, JSON.stringify(env));
    const rep = validateArchive({ backupDir: badDir, passphrase: PASS });
    add("s21-modified-payload-fail", !rep.ok, rep.errors.slice(0, 1).join(";"));
  }

  // s22: storage size mismatch
  await expectThrow("s22-storage-size-mismatch-fail", () => doRun(buildBaseDb(), new SizeMismatchStorage(buildBaseStorage()), "sizemm"), "storage size");
  // s23: storage drift
  await expectThrow("s23-storage-drift-fail", () => doRun(buildBaseDb(), new DriftStorage(buildBaseStorage()), "drift"), "storage drift");

  // s24: Word secret sentinel absent (redaction)
  {
    const decision: TablePolicyDecision = {
      table: "users", restorePolicy: "RESTORE", reason: "", hasTenantColumn: true, tenantColumn: "tenant_id",
      ownerSharedRead: false, sensitiveColumns: ["password_hash"], sensitiveAllowed: ["users.password_hash"], resolved: true,
    };
    const rowSample: Row = { id: "u-owner", email: "x@y.z", password_hash: SECRET_SENTINEL };
    const samples = new Map<string, Map<string, Row[]>>();
    samples.set("owner_admin_keep", new Map<string, Row[]>([["users", [rowSample]]]));
    const word = await buildWordArchive({
      source: "fixture", classTotals: { owner_admin_keep: 1 }, decisions: [decision],
      storageAggregate: { totalObjects: 0, totalBytes: 0, byBucket: {}, byClass: {} },
      ownerSharedRead: [], perClassTableCounts: new Map([["owner_admin_keep", new Map([["users", 1]])]]), samplesByClass: samples,
    });
    let leaked = false;
    for (const txt of word.renderedText.values()) if (txt.includes(SECRET_SENTINEL)) leaked = true;
    add("s24-word-no-secret-sentinel", !leaked, "");
  }

  // s25: raw storage path yok public manifestte
  {
    const pubStr = readFileSync(join(posDir, "manifest.public.json"), "utf8");
    const noPath = !pubStr.includes("catalog/") && !pubStr.includes("arch1") && !pubStr.includes(".jpg") && !pubStr.includes("output/job1") && !pubStr.includes(SECRET_SENTINEL);
    add("s25-no-raw-path-in-public", noPath, "");
  }

  // s26: output repo içinde → fail
  await expectThrow("s26-output-inside-repo-fail", () => doRun(buildBaseDb(), buildBaseStorage(), "insiderepo", { insideRepo: true }), "repo");

  // s28: success COMPLETE var
  add("s28-complete-marker-present", existsSync(join(posDir, COMPLETE_MARKER)) && pub.complete === true, "");

  // s29: canonical plaintext hash deterministik (iki run)
  const posDir2 = (await doRun(buildBaseDb(), buildBaseStorage(), "positive2")).finalDir;
  const priv2 = readPrivate(posDir2);
  const h1 = byTable.get("big_table")?.canonicalSha256;
  const h2 = new Map(priv2.tableExports.map((e) => [e.table, e])).get("big_table")?.canonicalSha256;
  add("s29-canonical-hash-deterministic", !!h1 && h1 === h2, `${h1?.slice(0, 12)} vs ${h2?.slice(0, 12)}`);

  // s30: encrypted bytes farklı (unique IV) — beklenen davranış
  const c1 = readJson<EncryptedEnvelope>(posDir, "database/database.full.json.enc").ciphertext;
  const c2 = readJson<EncryptedEnvelope>(posDir2, "database/database.full.json.enc").ciphertext;
  add("s30-encrypted-bytes-differ-unique-iv", c1 !== c2, "");

  // ── BLOCKER FIX: DB-env / secret-safe config testleri (bağlantı KURULMAZ) ──
  const DBURL_SENTINEL = "SECRET_DBURL_SENTINEL";
  const KEY_SENTINEL = "eySERVICEKEYSENTINEL1234567890abcdef";
  const goodEnv: Record<string, string | undefined> = {
    BF12B_DB_URL: `postgres://u:${DBURL_SENTINEL}@host:5432/db`,
    BF12B_SERVICE_ROLE_KEY: KEY_SENTINEL,
  };
  const baseInput = (o: Partial<ProdResolveInput>): ProdResolveInput => ({
    dbUrlEnv: "BF12B_DB_URL",
    rawDbUrlProvided: false,
    supabaseUrl: "https://proj.supabase.co",
    serviceKeyEnv: "BF12B_SERVICE_ROLE_KEY",
    passphraseFileProvided: true,
    execute: true,
    ack: true,
    projectRef: "ylasompuxavjvimbbfgd",
    out: "E:/out",
    env: goodEnv,
    ...o,
  });

  add("s31-db-url-env-resolve-ok", resolveProductionDbConfig(baseInput({})).ok, "");
  add("s32-env-value-missing-failclosed", !resolveProductionDbConfig(baseInput({ env: { BF12B_SERVICE_ROLE_KEY: KEY_SENTINEL } })).ok, "");
  add(
    "s33-invalid-env-name-failclosed",
    !resolveProductionDbConfig(baseInput({ dbUrlEnv: "../../secret" })).ok &&
      !resolveProductionDbConfig(baseInput({ dbUrlEnv: "BF12B-DB-URL" })).ok,
    "",
  );
  const rawRej = resolveProductionDbConfig(baseInput({ rawDbUrlProvided: true }));
  add("s34-raw-db-url-rejected", !rawRej.ok && rawRej.errors.some((e) => e.includes("Ham --db-url")), "");
  const red = redactSecrets(`${goodEnv.BF12B_DB_URL} key=${KEY_SENTINEL}`);
  add("s35-redaction-strips-secrets", !red.includes(DBURL_SENTINEL) && !red.includes(KEY_SENTINEL), red);
  {
    const pubStr = readFileSync(join(posDir, "manifest.public.json"), "utf8");
    const valStr = readFileSync(join(posDir, "validation", "validation-report.json"), "utf8");
    const clean = ![pubStr, valStr].some((s) => s.includes(DBURL_SENTINEL) || s.includes(KEY_SENTINEL) || s.includes("postgres://"));
    add("s36-no-db-secret-in-manifests", clean, "");
  }
  {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { devDependencies?: Record<string, string> };
    const dd = pkg.devDependencies ?? {};
    add("s37-pg-in-package-json", typeof dd["pg"] === "string" && typeof dd["@types/pg"] === "string", `pg=${dd["pg"]} @types/pg=${dd["@types/pg"]}`);
    const lock = readFileSync(join(REPO_ROOT, "package-lock.json"), "utf8");
    add("s38-pg-in-lockfile", lock.includes('"node_modules/pg"') && lock.includes('"node_modules/@types/pg"'), "");
  }
  {
    const rb = readFileSync(join(REPO_ROOT, "docs/yasam-hafizasi/BF-12B_BACKUP_RUNBOOK.md"), "utf8");
    const noAdhoc = !rb.includes("npm install pg") && !rb.includes("npm i -D pg") && !rb.includes("npm i pg");
    add("s39-runbook-no-adhoc-pg-install", noAdhoc, "");
  }
  add("s40-missing-env-no-connection", !resolveProductionDbConfig(baseInput({ env: {} })).ok, "resolve fail-closed → connection=0");

  // Bağımsız arşiv doğrulaması (pozitif)
  const finalValidation = validateArchive({ backupDir: posDir, passphrase: PASS });
  add("archive-validate-ok", finalValidation.ok, finalValidation.errors.slice(0, 2).join(";"));

  // ── Özet ──
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.ok ? "" : "  → " + c.detail}\n`);
  }
  process.stdout.write(`\nBF-12B HARNESS: ${checks.length - failed.length}/${checks.length} PASS\n`);

  // temizle
  for (const d of cleanupDirs) {
    try {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    } catch {
      /* yoksay */
    }
  }

  if (failed.length > 0) {
    process.stdout.write("RESULT: BLOCKED\n");
    process.exit(1);
  }
  process.stdout.write("RESULT: PASS\n");
  process.exit(0);
}

main().catch((e) => {
  process.stdout.write(`HARNESS ERROR: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
