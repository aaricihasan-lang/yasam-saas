/**
 * BF-12B — Public / private manifest üreticileri.
 *
 * Public: PII / ham içerik / raw path / secret YOK — yalnız sürüm, sayaç, checksum,
 * encrypted artifact kimliği, completion durumu.
 * Private: encrypted; exact mapping + policy + FK + sınıflandırma + storage mapping.
 */
import type {
  OwnerGateResult,
  PrivateManifest,
  PublicManifest,
  RestorePlan,
  SensitiveScanResult,
  StorageAggregate,
  StorageObjectRecord,
  TableExport,
  TablePolicyDecision,
  TenantFootprint,
} from "./types";
import { BACKUP_FORMAT_VERSION } from "./constants";

export interface ManifestBuildInput {
  toolVersion: string;
  originMainSha: string;
  projectRef: string | null;
  dbVersion: string | null;
  startedAt: string;
  finishedAt: string;
  source: "fixture" | "production";
  ownerGate: OwnerGateResult;
  tableExports: TableExport[];
  policyDecisions: TablePolicyDecision[];
  sensitiveScan: SensitiveScanResult;
  tenantFootprints: TenantFootprint[];
  storageObjects: StorageObjectRecord[];
  storageAggregate: StorageAggregate;
  restorePlan: RestorePlan;
  encryptedArtifacts: { name: string; ciphertextSha256: string }[];
  ownerSharedReadDependency: { table: string; ownerRows: number }[];
  complete: boolean;
}

export function buildPublicManifest(input: ManifestBuildInput): PublicManifest {
  const totalRows = input.tableExports.reduce((a, e) => a + e.rowCount, 0);
  const tenantClassTotals: Record<string, number> = {};
  for (const f of input.tenantFootprints) {
    tenantClassTotals[f.klass] = (tenantClassTotals[f.klass] ?? 0) + f.totalRows;
  }
  return {
    report: "bf12b-public-manifest",
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    toolVersion: input.toolVersion,
    originMainSha: input.originMainSha,
    projectRef: input.projectRef,
    dbVersion: input.dbVersion,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    source: input.source,
    tableCount: input.tableExports.length,
    totalRows,
    tenantClassTotals,
    storageAggregate: input.storageAggregate,
    encryptedArtifacts: input.encryptedArtifacts,
    ownerSharedReadDependency: input.ownerSharedReadDependency,
    complete: input.complete,
  };
}

export function buildPrivateManifest(input: ManifestBuildInput): PrivateManifest {
  return {
    report: "bf12b-private-manifest",
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    originMainSha: input.originMainSha,
    source: input.source,
    ownerGate: input.ownerGate,
    tableExports: input.tableExports,
    policyDecisions: input.policyDecisions,
    sensitiveScan: input.sensitiveScan,
    tenantFootprints: input.tenantFootprints,
    storageObjects: input.storageObjects,
    restorePlan: input.restorePlan,
  };
}
