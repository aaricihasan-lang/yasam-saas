/**
 * HD Hazır Eğitim Haritaları — taşınabilir snapshot paketi (dışa aktar / SHA doğrulamalı geri yükle).
 * Paket = kayıtlı `hd_education_charts` satırının TAMAMI (ham sağlayıcı yanıtı dahil) + kişinin kanıt parmak izi +
 * güncel revizyon kaynakları + ilgili denetim olayları. Geri yükleme yalnız:
 *   • dosya SHA-256'sı manifestle aynıysa,
 *   • ham yanıtın SHA-256'sı `provider_raw_sha256` ile aynıysa,
 *   • hedef DB'de aynı kimlik + natural_key + AYNI kanıt parmak izi + AYNI revizyon varsa
 * yapılır; aksi hâlde REDDEDİLİR (eski kanıtın snapshot'ı yeni veriymiş gibi yüklenmez). Yayın/hukuk alanlarına
 * DOKUNULMAZ (snapshot ≠ yayın). Aynı istek özeti zaten varsa ikinci kez eklenmez (idempotent).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type pg from "pg";

export const SNAPSHOT_PACKAGE_FORMAT = "hd-edu-snapshot-1";
const EVIDENCE_COLS = ["id", "natural_key", "birth_date", "documented_local_time", "time_standard", "utc_offset_seconds", "birth_utc", "utc_status", "latitude", "longitude", "revision"] as const;
const CHART_COLS = ["id", "subject_id", "subject_revision", "version", "request_body", "request_hash", "provider", "endpoint", "adapter_version", "engine_version",
  "contract_version", "computed_result", "provider_raw", "provider_raw_sha256", "design_instant_utc", "time_check", "boundary_flags", "calc_status", "computed_at", "created_by"] as const;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function evidenceFingerprint(row: Record<string, unknown>): string {
  return sha256(JSON.stringify(EVIDENCE_COLS.map((c) => (row[c] === null || row[c] === undefined ? null : String(row[c])))));
}

export async function exportSnapshot(su: pg.Client, chartId: string, providerText: string | null = null): Promise<{ json: string; version: number; subjectId: string; requestHash: string; rawSha: string }> {
  const c = (await su.query(`select ${CHART_COLS.join(", ")} from public.hd_education_charts where id=$1`, [chartId])).rows[0] as Record<string, unknown>;
  if (!c) throw new Error("snapshot yok");
  const s = (await su.query(`select ${EVIDENCE_COLS.join(", ")}, display_name from public.hd_education_subjects where id=$1`, [c.subject_id])).rows[0] as Record<string, unknown>;
  const src = (await su.query(`select role, url, institution, document_title, archive_ref, document_date, time_explicit, primary_secondary, license, usage_restriction
                                 from public.hd_education_sources where subject_id=$1 and subject_revision=$2 order by role, url`, [c.subject_id, c.subject_revision])).rows;
  const audit = (await su.query(`select created_at, actor_kind, action, detail from public.hd_education_audit_events where subject_id=$1 and action in ('chart_recorded','chart_failed') order by created_at`, [c.subject_id])).rows;
  // Ürün özeti = sha256(JSON.stringify(yanıt, sağlayıcı anahtar sırasıyla)). jsonb sırayı korumaz → orijinal metin
  // (yakalandıysa) pakete AYNEN konur ve özet ONUNLA doğrulanır. Yakalanmadıysa (geri yüklenmiş eski kayıt) özet
  // doğrulanamaz olarak İŞARETLENİR (dışa aktarım yine yapılır — veri kaybı yok).
  const original = providerText !== null ? JSON.stringify(JSON.parse(providerText)) : null;
  const rawSha = original !== null ? sha256(original) : String(c.provider_raw_sha256);
  const rawShaVerified = original !== null && rawSha === c.provider_raw_sha256;
  const pkg = {
    format: SNAPSHOT_PACKAGE_FORMAT,
    exported_at: new Date().toISOString(),
    subject: { ...s, evidence_fingerprint: evidenceFingerprint(s) },
    sources: src,
    chart: c,
    provider_raw_original_text: original,
    provider_raw_sha256_verified: rawShaVerified,
    provider_raw_canonical_sha256: sha256(JSON.stringify(c.provider_raw)),
    audit,
    note: "Snapshot ≠ yayın. Hukuk/yayın alanları pakete dahil DEĞİL; içe aktarım yayın durumunu değiştirmez.",
  };
  return { json: JSON.stringify(pkg, null, 2), version: Number(c.version), subjectId: String(c.subject_id), requestHash: String(c.request_hash), rawSha };
}

/** SHA doğrulamalı geri yükleme. Dönüş: "RESTORED" | "ALREADY_PRESENT" | "REJECTED:<neden>". */
export async function restoreSnapshotFile(su: pg.Client, file: string, expectedSha: string): Promise<string> {
  const txt = readFileSync(file, "utf8");
  if (sha256(txt) !== expectedSha) return "REJECTED:FILE_SHA";
  const pkg = JSON.parse(txt) as { format: string; subject: Record<string, unknown>; chart: Record<string, unknown>; provider_raw_original_text: string | null };
  if (pkg.format !== SNAPSHOT_PACKAGE_FORMAT) return "REJECTED:FORMAT";
  const c = pkg.chart;
  if (pkg.provider_raw_original_text === null || sha256(pkg.provider_raw_original_text) !== c.provider_raw_sha256) return "REJECTED:RAW_SHA";
  c.provider_raw = JSON.parse(pkg.provider_raw_original_text);
  if (c.calc_status !== "OK") return "REJECTED:NOT_OK";
  const s = (await su.query(`select ${EVIDENCE_COLS.join(", ")} from public.hd_education_subjects where id=$1`, [c.subject_id])).rows[0] as Record<string, unknown> | undefined;
  if (!s) return "REJECTED:NO_SUBJECT";
  if (s.natural_key !== pkg.subject.natural_key) return "REJECTED:NATURAL_KEY";
  if (evidenceFingerprint(s) !== pkg.subject.evidence_fingerprint) return "REJECTED:EVIDENCE_CHANGED";
  if (Number(s.revision) !== Number(c.subject_revision)) return "REJECTED:REVISION";
  const dup = (await su.query(`select count(*)::int n from public.hd_education_charts where subject_id=$1 and request_hash=$2 and adapter_version=$3`, [c.subject_id, c.request_hash, c.adapter_version])).rows[0].n;
  if (Number(dup) > 0) return "ALREADY_PRESENT";
  const cols = CHART_COLS.filter((k) => k !== "created_by");
  const vals = cols.map((k) => (c[k] !== null && typeof c[k] === "object" ? JSON.stringify(c[k]) : c[k]));
  await su.query(`insert into public.hd_education_charts (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, vals);
  await su.query(`insert into public.hd_education_audit_events (actor_kind, actor_user_id, action, subject_id, detail) values ('import', null, 'chart_recorded', $1, $2)`,
    [c.subject_id, JSON.stringify({ kaynak: "snapshot-paketi", chart_id: c.id, surum: c.version, dosya_sha256: expectedSha })]);
  return "RESTORED";
}
