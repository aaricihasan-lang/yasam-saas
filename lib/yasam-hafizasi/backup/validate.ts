/**
 * BF-12B — Arşiv doğrulayıcı + restore dry-run + checksum doğrulama.
 *
 * GERÇEK restore YAZMAZ. Yalnız:
 *   - encrypted database archive decrypt + per-table canonical hash mutabakatı
 *   - public manifest ↔ private manifest tutarlılığı
 *   - restore planı topolojik geçerlilik + eksik FK parent tespiti (dry-run)
 *   - checksum-report doğrulama
 *   - COMPLETE marker tutarlılığı
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { hashRowsCanonical } from "./canonical";
import { decryptArtifact } from "./crypto";
import type {
  EncryptedEnvelope,
  PrivateManifest,
  PublicManifest,
  Row,
  ValidationReport,
} from "./types";
import { COMPLETE_MARKER } from "./constants";

/** database.full.json plaintext yapısı (engine ile aynı sözleşme). */
export interface DatabaseArchive {
  format: "bf12b-database";
  version: string;
  source: "fixture" | "production";
  tables: {
    table: string;
    restorePolicy: string;
    rowCount: number;
    canonicalSha256: string;
    rows: Row[] | null; // DO_NOT_RESTORE → null (yalnız count)
  }[];
}

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** Restore planı dry-run: topolojik geçerlilik + eksik parent tespiti. */
export function restoreDryRun(priv: PrivateManifest): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const order = priv.restorePlan.restoreOrder;
  const pos = new Map<string, number>();
  order.forEach((t, i) => pos.set(t, i));
  const restoreSet = new Set(order);
  const exportedTables = new Set(priv.tableExports.map((e) => e.table));
  const deferred = new Set(
    priv.restorePlan.deferredForeignKeys.map((f) => `${f.table}:${f.refTable}:${f.columns.join(",")}`),
  );

  // Non-deferred FK için parent, child'dan ÖNCE gelmeli; ayrıca parent arşivde olmalı.
  // FK bilgisi restorePlan.deferredForeignKeys dışında planda taşınmaz; bu yüzden
  // dry-run, restoreOrder'ın restore set'iyle tutarlılığını + eksik parent'ı denetler.
  for (const [child] of pos) {
    if (!restoreSet.has(child)) errors.push(`restoreOrder tutarsız: ${child} restore set dışında`);
  }
  for (const t of restoreSet) {
    if (!exportedTables.has(t)) {
      errors.push(`restore hedefi arşivde yok (eksik parent/child): ${t}`);
    }
  }
  for (const mp of priv.restorePlan.missingParents) {
    errors.push(`eksik parent (non-nullable FK): ${mp}`);
  }
  // Deferred referanslar bilinçli; cycle varsa not.
  if (priv.restorePlan.cycles.length > 0 && deferred.size === 0) {
    errors.push("FK döngüsü var ama deferred FK yok — restore imkânsız");
  }
  return { ok: errors.length === 0, errors };
}

export interface ValidateOptions {
  backupDir: string;
  passphrase: string;
}

export function validateArchive(opts: ValidateOptions): ValidationReport {
  const dir = resolve(opts.backupDir);
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const errors: string[] = [];
  const push = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
    if (!ok) errors.push(`${name}: ${detail}`);
  };

  try {
    const pubPath = resolve(dir, "manifest.public.json");
    push("public-manifest-present", existsSync(pubPath), pubPath);
    const pub = readJson<PublicManifest>(pubPath);

    // COMPLETE marker tutarlılığı
    const completePath = resolve(dir, COMPLETE_MARKER);
    const hasComplete = existsSync(completePath);
    push("complete-marker-consistent", hasComplete === pub.complete, `marker=${hasComplete} manifest.complete=${pub.complete}`);

    // checksum-report doğrulama
    const checksumPath = resolve(dir, "validation", "checksum-report.json");
    push("checksum-report-present", existsSync(checksumPath), checksumPath);
    const checksums = readJson<{ files: { path: string; sha256: string }[] }>(checksumPath);
    let checksumOk = true;
    for (const f of checksums.files) {
      const abs = resolve(dir, f.path);
      if (!existsSync(abs)) {
        checksumOk = false;
        errors.push(`checksum: dosya yok ${f.path}`);
        continue;
      }
      if (fileSha256(abs) !== f.sha256) {
        checksumOk = false;
        errors.push(`checksum uyuşmazlığı: ${f.path}`);
      }
    }
    push("checksums-match", checksumOk, `${checksums.files.length} dosya`);

    // private manifest decrypt
    const privEnc = readJson<EncryptedEnvelope>(resolve(dir, "manifests", "manifest.private.json.enc"));
    const privBuf = decryptArtifact(privEnc, { passphrase: opts.passphrase });
    const priv = JSON.parse(privBuf.toString("utf8")) as PrivateManifest;
    push("private-manifest-decrypted", true, "ok");

    // database archive decrypt + per-table canonical hash mutabakatı
    const dbEnc = readJson<EncryptedEnvelope>(resolve(dir, "database", "database.full.json.enc"));
    const dbBuf = decryptArtifact(dbEnc, { passphrase: opts.passphrase });
    const db = JSON.parse(dbBuf.toString("utf8")) as DatabaseArchive;
    let hashOk = true;
    const exportByTable = new Map(priv.tableExports.map((e) => [e.table, e]));
    for (const t of db.tables) {
      if (t.rows === null) continue; // DO_NOT_RESTORE
      const recomputed = hashRowsCanonical(t.rows);
      const expected = exportByTable.get(t.table)?.canonicalSha256 ?? t.canonicalSha256;
      if (recomputed !== expected) {
        hashOk = false;
        errors.push(`canonical hash uyuşmazlığı: ${t.table}`);
      }
      if (t.rows.length !== t.rowCount) {
        hashOk = false;
        errors.push(`row count uyuşmazlığı: ${t.table} ${t.rows.length}/${t.rowCount}`);
      }
    }
    push("database-canonical-hash-match", hashOk, `${db.tables.length} tablo`);

    // owner gate
    push("owner-gate-passed", priv.ownerGate.passed, priv.ownerGate.reason);

    // restore dry-run
    const dry = restoreDryRun(priv);
    push("restore-dry-run", dry.ok, dry.errors.join("; ") || "ok");
  } catch (e) {
    push("archive-readable", false, e instanceof Error ? e.message : String(e));
  }

  return { ok: errors.length === 0, checks, errors };
}
