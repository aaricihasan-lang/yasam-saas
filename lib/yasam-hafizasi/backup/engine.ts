/**
 * BF-12B — Yedekleme orkestratörü (runBackup).
 *
 * Akış: owner gate → schema introspection → coverage → sayfalama+tarama →
 * sensitive gate → footprint → storage (drift-safe) → restore plan → manifest →
 * encryption → self-check → checksum → COMPLETE → atomik temp→final.
 *
 * Bu faz YALNIZ fixture reader/storage ile çalıştırılır. Gerçek production run
 * ayrı açık onay kapısıdır (cli.ts guard'ları).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { canonicalize } from "./canonical";
import { encryptArtifact } from "./crypto";
import {
  BACKUP_FORMAT_VERSION,
  COMPLETE_MARKER,
  OWNER_ADMIN_TENANT_ID,
  OWNER_GATE,
  OWNER_SHARED_READ_TABLES,
  TEST_EXPERT_TENANT_IDS,
  classifyTenant,
} from "./constants";
import { assertSafeOutputDir, makeTempSibling, promoteTempToFinal } from "./outputSafety";
import { paginateTable } from "./pagination";
import { assertCoverage, decideTablePolicy, evaluateSensitiveGate } from "./policy";
import { buildRestorePlan } from "./restorePlan";
import { buildPrivateManifest, buildPublicManifest, type ManifestBuildInput } from "./manifest";
import {
  FixtureStorage,
  classifyStoragePath,
  listsMatch,
  opaqueObjectName,
} from "./storage";
import { buildWordArchive, wordClassKey } from "./word";
import { restoreDryRun, validateArchive, type DatabaseArchive } from "./validate";
import type {
  DbReader,
  OwnerGateResult,
  PublicManifest,
  Row,
  StorageAggregate,
  StorageObjectRecord,
  StorageReader,
  TableExport,
  TablePolicyDecision,
  TableSchema,
  TenantFootprint,
  ValidationReport,
} from "./types";

export interface RunBackupOptions {
  reader: DbReader;
  storage: StorageReader;
  outputDir: string;
  passphrase: string;
  toolVersion: string;
  originMainSha: string;
  pageSize: number;
  repoRoots: string[];
  now: string;
}

export interface RunBackupResult {
  finalDir: string;
  complete: boolean;
  validation: ValidationReport;
  publicManifest: PublicManifest;
}

const TEST_EXPERT_ORDINAL = new Map<string, number>(
  TEST_EXPERT_TENANT_IDS.map((id, i) => [id, i + 1]),
);

async function readAllRows(reader: DbReader, table: string, pageSize: number): Promise<Row[]> {
  const schema = await reader.getTableSchema(table);
  const pk = schema.primaryKey;
  const out: Row[] = [];
  let after: unknown[] | null = null;
  for (let guard = 0; guard < 100000; guard++) {
    const page = await reader.readPage(table, pageSize, after);
    if (page.length === 0) break;
    out.push(...page);
    if (pk.length === 0 || page.length < pageSize) break;
    const last = page[page.length - 1];
    after = pk.map((c) => last[c]);
  }
  return out;
}

async function evaluateOwnerGate(reader: DbReader, pageSize: number): Promise<OwnerGateResult> {
  const tables = await reader.listTables();
  if (!tables.includes("users")) {
    return { matchedUserId: null, matchedTenantId: null, matchedCount: 0, passed: false, reason: "users tablosu yok" };
  }
  const rows = await readAllRows(reader, "users", pageSize);
  const matches = rows.filter(
    (r) =>
      r.role === OWNER_GATE.role &&
      r.admin_level === OWNER_GATE.adminLevel &&
      r.active === OWNER_GATE.active &&
      r.tenant_id === OWNER_GATE.tenantId,
  );
  const passed = matches.length === OWNER_GATE.expectedCount;
  const first = matches[0];
  return {
    matchedUserId: first ? String(first.id) : null,
    matchedTenantId: first ? String(first.tenant_id) : null,
    matchedCount: matches.length,
    passed,
    reason: passed
      ? "role=admin AND admin_level=owner AND active AND owner-tenant, exact 1"
      : `owner gate exact-1 sağlanamadı (eşleşme=${matches.length})`,
  };
}

function writeEnc(dir: string, relPath: string, plaintext: Buffer, aadId: string, passphrase: string, salt: Buffer): void {
  const env = encryptArtifact(plaintext, { passphrase, aadId, salt });
  const abs = resolve(dir, relPath);
  writeFileSync(abs, JSON.stringify(env));
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  const rec = (d: string): void => {
    for (const name of readdirSync(d)) {
      const abs = resolve(d, name);
      if (statSync(abs).isDirectory()) rec(abs);
      else out.push(abs);
    }
  };
  rec(root);
  return out;
}

export async function runBackup(opts: RunBackupOptions): Promise<RunBackupResult> {
  const finalDir = assertSafeOutputDir(opts.outputDir, { repoRoots: opts.repoRoots });
  const salt = createHash("sha256").update(`${opts.now}|${opts.originMainSha}`).digest().subarray(0, 16);
  const saltHex = salt.toString("hex");

  // 1) Owner gate (fail-closed).
  const ownerGate = await evaluateOwnerGate(opts.reader, opts.pageSize);
  if (!ownerGate.passed) {
    throw new Error(`BLOCKED owner gate: ${ownerGate.reason}`);
  }

  // 2) Schema introspection + policy.
  const tables = (await opts.reader.listTables()).slice().sort();
  const schemas = new Map<string, TableSchema>();
  const decisions = new Map<string, TablePolicyDecision>();
  const nonEmpty: string[] = [];
  for (const t of tables) {
    const schema = await opts.reader.getTableSchema(t);
    schemas.set(t, schema);
    decisions.set(t, decideTablePolicy(schema));
    if ((await opts.reader.countRows(t)) > 0) nonEmpty.push(t);
  }
  assertCoverage(nonEmpty, decisions);

  // 3) Sayfalama + tarama (rows, sensitive, footprint, samples).
  const tableExports: TableExport[] = [];
  const dbTables: DatabaseArchive["tables"] = [];
  const sensitiveNonNull: { table: string; column: string; nonNullCount: number }[] = [];
  const footprintByClass = new Map<string, { total: number; byTable: Record<string, number> }>();
  const perClassTableCounts = new Map<string, Map<string, number>>();
  const samplesByClass = new Map<string, Map<string, Row[]>>();

  const bumpClass = (klass: string, table: string, n: number): void => {
    const f = footprintByClass.get(klass) ?? { total: 0, byTable: {} };
    f.total += n;
    f.byTable[table] = (f.byTable[table] ?? 0) + n;
    footprintByClass.set(klass, f);
    const pcc = perClassTableCounts.get(klass) ?? new Map<string, number>();
    pcc.set(table, (pcc.get(table) ?? 0) + n);
    perClassTableCounts.set(klass, pcc);
  };

  for (const t of tables) {
    const schema = schemas.get(t) as TableSchema;
    const decision = decisions.get(t) as TablePolicyDecision;
    const sensitiveCols = decision.sensitiveColumns;
    const sensitiveCounts = new Map<string, number>(sensitiveCols.map((c) => [c, 0]));
    const collectRows = decision.restorePolicy !== "DO_NOT_RESTORE";
    const rows: Row[] = [];

    const wordKeyForRow = (row: Row): string => {
      if (!decision.tenantColumn) return "shared_canonical";
      const tid = row[decision.tenantColumn];
      const idStr = tid === null || tid === undefined ? null : String(tid);
      const klass = classifyTenant(idStr);
      const ordinal = idStr ? TEST_EXPERT_ORDINAL.get(idStr) ?? null : null;
      return wordClassKey(klass, ordinal);
    };

    const result = await paginateTable(opts.reader, schema, {
      pageSize: opts.pageSize,
      restorePolicy: decision.restorePolicy,
      tenantColumn: decision.tenantColumn,
      onRow: (row) => {
        for (const c of sensitiveCols) {
          const v = row[c];
          if (v !== null && v !== undefined && v !== "") {
            sensitiveCounts.set(c, (sensitiveCounts.get(c) ?? 0) + 1);
          }
        }
        const key = wordKeyForRow(row);
        bumpClass(key, t, 1);
        // class-split örnek (redakte); teknik tablo → örnek toplama.
        if (decision.restorePolicy === "RESTORE") {
          const perTable = samplesByClass.get(key) ?? new Map<string, Row[]>();
          const arr = perTable.get(t) ?? [];
          if (arr.length < 10) {
            const redacted: Row = {};
            for (const [k, v] of Object.entries(row)) {
              if (!sensitiveCols.includes(k)) redacted[k] = v;
            }
            arr.push(redacted);
          }
          perTable.set(t, arr);
          samplesByClass.set(key, perTable);
        }
        if (collectRows) rows.push(row);
      },
    });

    // Sensitive gate YALNIZ saklanan tablolar için (DO_NOT_RESTORE satırları arşive girmez).
    if (collectRows) {
      for (const [c, n] of sensitiveCounts) sensitiveNonNull.push({ table: t, column: c, nonNullCount: n });
    }
    tableExports.push(result.export);
    dbTables.push({
      table: t,
      restorePolicy: decision.restorePolicy,
      rowCount: result.export.rowCount,
      canonicalSha256: result.export.canonicalSha256,
      rows: collectRows ? rows : null,
    });
  }

  // 4) Sensitive gate (fail-closed).
  const sensitiveScan = evaluateSensitiveGate(sensitiveNonNull);
  if (sensitiveScan.failClosed.length > 0) {
    const detail = sensitiveScan.failClosed.map((f) => `${f.table}.${f.column}(${f.reason})`).join(", ");
    throw new Error(`BLOCKED sensitive gate: ${detail}`);
  }

  // 5) Footprint.
  const tenantFootprints: TenantFootprint[] = [...footprintByClass.entries()]
    .map(([klass, f]) => {
      const normalized = klass.startsWith("test_expert_")
        ? "test_expert_backup_then_delete"
        : klass === "shared_canonical"
          ? "null_shared"
          : klass;
      return { klass: normalized as TenantFootprint["klass"], totalRows: f.total, byTable: f.byTable };
    });

  // 6) Storage (drift-safe): pre-list → download → verify size → opaque+encrypt → post-list.
  const preList = await opts.storage.listAll();
  const storageObjects: StorageObjectRecord[] = [];
  const storageEncrypted: { rel: string; buffer: Buffer; aadId: string }[] = [];
  const byBucket: Record<string, { objects: number; bytes: number }> = {};
  const byClass: Record<string, { objects: number; bytes: number }> = {};
  for (const item of preList) {
    const buf = await opts.storage.download(item.bucket, item.path);
    if (buf.length !== item.size) {
      throw new Error(`BLOCKED storage size uyuşmazlığı: ${item.bucket}/${item.path} ${buf.length}/${item.size}`);
    }
    const sha256 = createHash("sha256").update(buf).digest("hex");
    const opaque = opaqueObjectName(item.bucket, item.path, saltHex);
    const cls = classifyStoragePath(item.bucket, item.path);
    storageObjects.push({
      bucket: item.bucket,
      rawPath: item.path,
      opaqueName: opaque,
      size: item.size,
      sha256,
      tenantClass: cls.label,
      tenantId: cls.tenantId,
    });
    storageEncrypted.push({ rel: `storage/${opaque}`, buffer: buf, aadId: `storage:${opaque}` });
    byBucket[item.bucket] = { objects: (byBucket[item.bucket]?.objects ?? 0) + 1, bytes: (byBucket[item.bucket]?.bytes ?? 0) + item.size };
    byClass[cls.label] = { objects: (byClass[cls.label]?.objects ?? 0) + 1, bytes: (byClass[cls.label]?.bytes ?? 0) + item.size };
  }
  const postList = await opts.storage.listAll();
  if (!listsMatch(preList, postList)) {
    throw new Error("BLOCKED storage drift: pre/post list fingerprint uyuşmuyor");
  }
  const storageAggregate: StorageAggregate = {
    totalObjects: preList.length,
    totalBytes: preList.reduce((a, o) => a + o.size, 0),
    byBucket,
    byClass,
  };

  // 7) Restore plan.
  const restorePlan = buildRestorePlan(schemas, decisions);

  // 8) owner shared-read dependency (satır sayısı).
  const ownerSharedReadDependency = OWNER_SHARED_READ_TABLES.map((table) => {
    const exp = tableExports.find((e) => e.table === table);
    const ownerRows = exp?.perTenantCounts[OWNER_ADMIN_TENANT_ID] ?? 0;
    return { table, ownerRows };
  }).filter((x) => x.ownerRows > 0);

  // 9) Manifests.
  const policyDecisions = [...decisions.values()];
  const manifestInput: ManifestBuildInput = {
    toolVersion: opts.toolVersion,
    originMainSha: opts.originMainSha,
    projectRef: opts.reader.projectRef(),
    dbVersion: await opts.reader.version(),
    startedAt: opts.now,
    finishedAt: opts.now,
    source: opts.reader.source(),
    ownerGate,
    tableExports,
    policyDecisions,
    sensitiveScan,
    tenantFootprints,
    storageObjects,
    storageAggregate,
    restorePlan,
    encryptedArtifacts: [], // aşağıda doldurulur
    ownerSharedReadDependency,
    complete: false,
  };

  // 10) Self-check (in-memory): canonical hash + owner gate + restore dry-run.
  const dbArchive: DatabaseArchive = {
    format: "bf12b-database",
    version: BACKUP_FORMAT_VERSION,
    source: opts.reader.source(),
    tables: dbTables,
  };
  const privateManifest = buildPrivateManifest(manifestInput);
  const dry = restoreDryRun(privateManifest);
  const selfOk = ownerGate.passed && dry.ok;

  // 11) Yaz (temp → final atomik).
  const temp = makeTempSibling(finalDir);
  for (const sub of ["database", "manifests", "storage", "word", "validation"]) {
    mkdirSync(resolve(temp, sub), { recursive: true });
  }

  // encrypted artifacts
  writeEnc(temp, "database/database.full.json.enc", Buffer.from(canonicalize(dbArchive)), "database.full.json", opts.passphrase, salt);
  writeEnc(temp, "manifests/schema.json.enc", Buffer.from(canonicalize([...schemas.values()])), "schema.json", opts.passphrase, salt);
  const fkGraph = [...schemas.values()].flatMap((s) => s.foreignKeys);
  writeEnc(temp, "manifests/foreign-keys.json.enc", Buffer.from(canonicalize(fkGraph)), "foreign-keys.json", opts.passphrase, salt);
  writeEnc(temp, "manifests/restore-plan.json.enc", Buffer.from(canonicalize(restorePlan)), "restore-plan.json", opts.passphrase, salt);
  const exclusions = {
    doNotRestore: restorePlan.doNotRestore,
    archiveOnly: restorePlan.archiveOnly,
    systemOnly: restorePlan.systemOnly,
    sensitiveAllowlistIncluded: sensitiveScan.allowed,
  };
  writeEnc(temp, "manifests/exclusions.json.enc", Buffer.from(canonicalize(exclusions)), "exclusions.json", opts.passphrase, salt);
  for (const s of storageEncrypted) {
    writeEnc(temp, s.rel, s.buffer, s.aadId, opts.passphrase, salt);
  }

  // Word (plaintext PII; gitignored, repo-dışı output).
  const classTotals: Record<string, number> = {};
  for (const f of tenantFootprints) classTotals[f.klass] = (classTotals[f.klass] ?? 0) + f.totalRows;
  const word = await buildWordArchive({
    source: opts.reader.source(),
    classTotals,
    decisions: policyDecisions,
    storageAggregate,
    ownerSharedRead: ownerSharedReadDependency,
    perClassTableCounts,
    samplesByClass,
  });
  for (const [name, buf] of word.files) writeFileSync(resolve(temp, "word", name), buf);

  // encrypted artifact identity listesi (public manifest için) — dosya bytes sha256.
  const encryptedArtifacts: { name: string; ciphertextSha256: string }[] = [];
  for (const rel of [
    "database/database.full.json.enc",
    "manifests/schema.json.enc",
    "manifests/foreign-keys.json.enc",
    "manifests/restore-plan.json.enc",
    "manifests/exclusions.json.enc",
    ...storageEncrypted.map((s) => s.rel),
  ]) {
    const env = JSON.parse(readFileSync(resolve(temp, rel), "utf8")) as { ciphertextSha256: string };
    encryptedArtifacts.push({ name: rel, ciphertextSha256: env.ciphertextSha256 });
  }

  // private manifest encrypt (encryptedArtifacts eklenmiş kopyayla)
  const privManifestFinal = buildPrivateManifest({ ...manifestInput, encryptedArtifacts });
  writeEnc(temp, "manifests/manifest.private.json.enc", Buffer.from(canonicalize(privManifestFinal)), "manifest.private.json", opts.passphrase, salt);

  // public manifest (plaintext; PII/secret/path YOK)
  const publicManifest = buildPublicManifest({ ...manifestInput, encryptedArtifacts, complete: selfOk });
  writeFileSync(resolve(temp, "manifest.public.json"), JSON.stringify(publicManifest, null, 2));

  // validation-report.json
  const selfReport: ValidationReport = {
    ok: selfOk,
    checks: [
      { name: "owner-gate", ok: ownerGate.passed, detail: ownerGate.reason },
      { name: "restore-dry-run", ok: dry.ok, detail: dry.errors.join("; ") || "ok" },
      { name: "storage-drift", ok: true, detail: "pre/post match" },
      { name: "sensitive-gate", ok: true, detail: `${sensitiveScan.allowed.length} allowed` },
    ],
    errors: dry.ok ? [] : dry.errors,
  };
  writeFileSync(resolve(temp, "validation", "validation-report.json"), JSON.stringify(selfReport, null, 2));

  // checksum-report.json (kendisi + COMPLETE hariç tüm dosyalar)
  const checksumFiles: { path: string; sha256: string }[] = [];
  for (const abs of walkFiles(temp)) {
    const rel = relative(temp, abs).split("\\").join("/");
    if (rel === "validation/checksum-report.json" || rel === COMPLETE_MARKER) continue;
    checksumFiles.push({ path: rel, sha256: createHash("sha256").update(readFileSync(abs)).digest("hex") });
  }
  checksumFiles.sort((a, b) => (a.path < b.path ? -1 : 1));
  writeFileSync(resolve(temp, "validation", "checksum-report.json"), JSON.stringify({ files: checksumFiles }, null, 2));

  // COMPLETE yalnız self-check PASS ise
  if (selfOk) {
    writeFileSync(resolve(temp, COMPLETE_MARKER), `${BACKUP_FORMAT_VERSION}\n${opts.now}\n`);
  }

  // Atomik promote
  promoteTempToFinal(temp, finalDir);

  // Bağımsız doğrulama (final dizinde)
  const validation = validateArchive({ backupDir: finalDir, passphrase: opts.passphrase });

  return { finalDir, complete: selfOk, validation, publicManifest };
}

/** FixtureStorage kısayolu (harness ergonomisi). */
export function makeFixtureStorage(data: ConstructorParameters<typeof FixtureStorage>[0]): FixtureStorage {
  return new FixtureStorage(data);
}
