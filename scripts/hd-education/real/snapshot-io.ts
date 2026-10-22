/**
 * HD Hazır Eğitim Haritaları — taşınabilir snapshot paketi (dışa aktar / SHA doğrulamalı geri yükle).
 *
 * ÜÇ TEMSİL (birbirine karıştırılmaz):
 *   A) GÖVDE      — sağlayıcının HTTP yanıt gövdesi, parse EDİLMEDEN yakalanan bayt dizisi (UTF-8 metin olarak saklanır).
 *   B) ÜRÜN METNİ — JSON.stringify(JSON.parse(A)) (sağlayıcı anahtar sırası). Ürünün `provider_raw_sha256` alanı = sha256(B).
 *   C) JSONB      — PostgreSQL jsonb'den geri okunan nesne; anahtar sırası DEĞİŞİR → sha256(JSON.stringify(C)) ≠ sha256(B) olabilir.
 * Bu yüzden ayrıca KANONİK özet tutulur: anahtarları sözlük sırasına dizilmiş deterministik JSON (RFC 8785 benzeri;
 * yanıt yalnız JSON dizgi/sayı/bool/null içerir). Kanonik özet A, B ve C için AYNIDIR → jsonb gidiş-dönüşü doğrulanabilir.
 *
 * Paket biçimleri:
 *   • v1 `hd-edu-snapshot-1` (22.10 ilk 9 kayıt) — `provider_raw_original_text` alanı ADI YANILTICI: B'dir (yeniden
 *     stringify edilmiş metin), A değildir. Geriye uyum için OKUNUR; dosyalar DEĞİŞTİRİLMEZ (hash geçmişi korunur).
 *   • v2 `hd-edu-snapshot-2` — `provider_body_text` (A), `provider_body_sha256` (sha256(A bayt)), `product_raw_sha256`
 *     (= chart.provider_raw_sha256 = sha256(B)), `provider_canonical_sha256` (kanonik), `jsonb_roundtrip_canonical_equal`.
 *
 * Geri yükleme yalnız: dosya SHA = manifest · (v2) gövde SHA + ürün SHA + kanonik SHA tutarlı / (v1) B SHA = ürün SHA ·
 * hedefte AYNI kimlik + natural_key + kanıt parmak izi + revizyon · calc_status OK. Aynı istek özeti varsa ATLANIR
 * (idempotent). Yayın / hukuk alanlarına DOKUNULMAZ (snapshot ≠ yayın).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type pg from "pg";

export const SNAPSHOT_FORMAT_V1 = "hd-edu-snapshot-1";
export const SNAPSHOT_FORMAT_V2 = "hd-edu-snapshot-2";
export const NATURAL_KEY_RE = /^[a-z0-9][a-z0-9-]{1,118}-[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const EVIDENCE_COLS = ["id", "natural_key", "birth_date", "documented_local_time", "time_standard", "utc_offset_seconds", "birth_utc", "utc_status", "latitude", "longitude", "revision"] as const;
const CHART_COLS = ["id", "subject_id", "subject_revision", "version", "request_body", "request_hash", "provider", "endpoint", "adapter_version", "engine_version",
  "contract_version", "computed_result", "provider_raw", "provider_raw_sha256", "design_instant_utc", "time_check", "boundary_flags", "calc_status", "computed_at", "created_by"] as const;
export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/** Deterministik kanonik JSON (anahtarlar sıralı, boşluksuz). Sayılar JSON.stringify ile (yanıtta yalnız sonlu sayılar). */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  if (typeof v === "number" && !Number.isFinite(v)) throw new Error("kanonik JSON: sonlu olmayan sayı");
  return JSON.stringify(v);
}
export const canonicalSha256 = (v: unknown) => sha256(canonicalJson(v));

export function evidenceFingerprint(row: Record<string, unknown>): string {
  return sha256(JSON.stringify(EVIDENCE_COLS.map((c) => (row[c] === null || row[c] === undefined ? null : String(row[c])))));
}

export type ExportResult = { json: string; version: number; subjectId: string; requestHash: string; productSha: string; bodySha: string | null; canonicalSha: string; roundtripOk: boolean; productShaOk: boolean };

/** v2 dışa aktarım. `bodyText` = parse edilmeden yakalanan gövde (yoksa null → gövde alanları boş, işaretlenir). */
export async function exportSnapshot(su: pg.Client, chartId: string, bodyText: string | null): Promise<ExportResult> {
  const c = (await su.query(`select ${CHART_COLS.join(", ")} from public.hd_education_charts where id=$1`, [chartId])).rows[0] as Record<string, unknown>;
  if (!c) throw new Error("snapshot yok");
  const s = (await su.query(`select ${EVIDENCE_COLS.join(", ")}, display_name from public.hd_education_subjects where id=$1`, [c.subject_id])).rows[0] as Record<string, unknown>;
  const src = (await su.query(`select role, url, institution, document_title, archive_ref, document_date, time_explicit, primary_secondary, license, usage_restriction
                                 from public.hd_education_sources where subject_id=$1 and subject_revision=$2 order by role, url`, [c.subject_id, c.subject_revision])).rows;
  const audit = (await su.query(`select created_at, actor_kind, action, detail from public.hd_education_audit_events where subject_id=$1 and action in ('chart_recorded','chart_failed') order by created_at`, [c.subject_id])).rows;
  const parsed = bodyText !== null ? (JSON.parse(bodyText) as unknown) : null;
  const productText = parsed !== null ? JSON.stringify(parsed) : null;
  const productShaOk = productText !== null && sha256(productText) === c.provider_raw_sha256;
  const canonicalSha = canonicalSha256(c.provider_raw);
  const roundtripOk = parsed !== null && canonicalSha256(parsed) === canonicalSha;
  const bodySha = bodyText !== null ? sha256(Buffer.from(bodyText, "utf8")) : null;
  const pkg = {
    format: SNAPSHOT_FORMAT_V2,
    exported_at: new Date().toISOString(),
    subject: { ...s, evidence_fingerprint: evidenceFingerprint(s) },
    sources: src,
    chart: c,
    provider_body_text: bodyText,
    provider_body_sha256: bodySha,
    product_raw_sha256: c.provider_raw_sha256,
    product_raw_sha256_verified: productShaOk,
    provider_canonical_sha256: canonicalSha,
    jsonb_roundtrip_canonical_equal: roundtripOk,
    audit,
    note: "Snapshot ≠ yayın. Hukuk/yayın alanları pakete dahil DEĞİL; içe aktarım yayın durumunu değiştirmez.",
  };
  return { json: JSON.stringify(pkg, null, 2), version: Number(c.version), subjectId: String(c.subject_id), requestHash: String(c.request_hash), productSha: String(c.provider_raw_sha256), bodySha, canonicalSha, roundtripOk, productShaOk };
}

type Pkg = {
  format: string; subject: Record<string, unknown>; chart: Record<string, unknown>;
  provider_raw_original_text?: string | null;            // v1 (aslında B)
  provider_body_text?: string | null; provider_body_sha256?: string | null; provider_canonical_sha256?: string;  // v2
};

/** Paket dosyasını DB'ye dokunmadan doğrular. Dönüş: null (geçerli) veya ret nedeni. Ayrıca kullanılacak sağlayıcı nesnesi. */
export function verifyPackageText(txt: string, expectedSha: string): { error: string | null; pkg?: Pkg; providerObject?: unknown } {
  if (sha256(txt) !== expectedSha) return { error: "FILE_SHA" };
  let pkg: Pkg;
  try { pkg = JSON.parse(txt) as Pkg; } catch { return { error: "BAD_JSON" }; }
  const c = pkg.chart;
  if (!c || c.calc_status !== "OK") return { error: "NOT_OK" };
  if (!NATURAL_KEY_RE.test(String(pkg.subject?.natural_key ?? ""))) return { error: "NATURAL_KEY_FORMAT" };
  if (pkg.format === SNAPSHOT_FORMAT_V1) {
    const b = pkg.provider_raw_original_text;
    if (typeof b !== "string" || sha256(b) !== c.provider_raw_sha256) return { error: "RAW_SHA" };
    const obj = JSON.parse(b) as unknown;
    if (canonicalSha256(obj) !== canonicalSha256(c.provider_raw)) return { error: "CANONICAL_MISMATCH" };
    return { error: null, pkg, providerObject: obj };
  }
  if (pkg.format === SNAPSHOT_FORMAT_V2) {
    const a = pkg.provider_body_text;
    if (typeof a !== "string" || sha256(Buffer.from(a, "utf8")) !== pkg.provider_body_sha256) return { error: "BODY_SHA" };
    const obj = JSON.parse(a) as unknown;
    if (sha256(JSON.stringify(obj)) !== c.provider_raw_sha256) return { error: "RAW_SHA" };
    if (canonicalSha256(obj) !== pkg.provider_canonical_sha256 || canonicalSha256(c.provider_raw) !== pkg.provider_canonical_sha256) return { error: "CANONICAL_MISMATCH" };
    return { error: null, pkg, providerObject: obj };
  }
  return { error: "FORMAT" };
}

/** SHA doğrulamalı geri yükleme. Dönüş: "RESTORED" | "ALREADY_PRESENT" | "REJECTED:<neden>". */
export async function restoreSnapshotFile(su: pg.Client, file: string, expectedSha: string): Promise<string> {
  let txt: string;
  try { txt = readFileSync(file, "utf8"); } catch { return "REJECTED:FILE_MISSING"; }
  const v = verifyPackageText(txt, expectedSha);
  if (v.error || !v.pkg) return `REJECTED:${v.error}`;
  const c: Record<string, unknown> = { ...v.pkg.chart, provider_raw: v.providerObject };
  const s = (await su.query(`select ${EVIDENCE_COLS.join(", ")} from public.hd_education_subjects where id=$1`, [c.subject_id])).rows[0] as Record<string, unknown> | undefined;
  if (!s) return "REJECTED:NO_SUBJECT";
  if (s.natural_key !== v.pkg.subject.natural_key) return "REJECTED:NATURAL_KEY";
  if (evidenceFingerprint(s) !== v.pkg.subject.evidence_fingerprint) return "REJECTED:EVIDENCE_CHANGED";
  if (Number(s.revision) !== Number(c.subject_revision)) return "REJECTED:REVISION";
  const dup = (await su.query(`select count(*)::int n from public.hd_education_charts where subject_id=$1 and request_hash=$2 and adapter_version=$3`, [c.subject_id, c.request_hash, c.adapter_version])).rows[0].n;
  if (Number(dup) > 0) return "ALREADY_PRESENT";
  const cols = CHART_COLS.filter((k) => k !== "created_by");
  const vals = cols.map((k) => (c[k] !== null && typeof c[k] === "object" ? JSON.stringify(c[k]) : c[k]));
  await su.query(`insert into public.hd_education_charts (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, vals);
  // jsonb gidiş-dönüşü: geri okunan nesnenin kanonik özeti paketle AYNI olmalı.
  const back = (await su.query(`select provider_raw from public.hd_education_charts where id=$1`, [c.id])).rows[0]?.provider_raw;
  if (canonicalSha256(back) !== canonicalSha256(v.providerObject)) throw new Error("jsonb gidiş-dönüşü kanonik özeti tutmadı");
  await su.query(`insert into public.hd_education_audit_events (actor_kind, actor_user_id, action, subject_id, detail) values ('import', null, 'chart_recorded', $1, $2)`,
    [c.subject_id, JSON.stringify({ kaynak: "snapshot-paketi", format: v.pkg.format, chart_id: c.id, surum: c.version, dosya_sha256: expectedSha })]);
  return "RESTORED";
}
