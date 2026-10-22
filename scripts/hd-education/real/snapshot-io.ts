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
 *   • v3 `hd-edu-snapshot-3` — v2 + TAŞINABİLİR kanıt: `subject.evidence_utc` (PostgreSQL'in UTC/metin temsili; işlem saat
 *     dilimi / dil ayarından BAĞIMSIZ) + `subject.evidence_fingerprint_v2` = sha256("hd-edu-evidence-2|" + JSON(evidence_utc)).
 *
 * KANIT PARMAK İZİ (taşınabilirlik): v1/v2 `evidence_fingerprint` değeri `String(Date)` içerir → çalışan sürecin saat dilimine
 * ve işletim sistemi diline bağlıdır (Europe/Istanbul'da 12/12 üretilir; UTC / New York / Tokyo'da 0/12). Bu yüzden eski
 * paketler DEĞİŞTİRİLMEDEN şöyle doğrulanır: (1) dosya SHA = manifest, (2) paketteki 11 kanıt alanı hedef DB ile PostgreSQL
 * İÇİNDE tipli ve UTC karşılaştırılır (timestamptz / date / numeric / int / metin; biçimi belirsiz değer → RED), (3) eski parmak
 * izi bu ortamda yeniden üretilebiliyorsa EŞİT olmalı (aksi RED); üretilemiyorsa (başka TZ/dil) bu durum sonuçta açıkça
 * bildirilir — karar (1)+(2)'ye dayanır, eski değer körü körüne kabul ya da yok sayılmaz. v3'te (2)'ye ek olarak parmak izi
 * hem paket içinde hem DB'den yeniden hesaplanarak EŞİT olmalıdır.
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
export const SNAPSHOT_FORMAT_V3 = "hd-edu-snapshot-3";
/** Orijinal HTTP gövdesi taşıyan biçimler (v2, v3). */
export const hasProviderBody = (format: unknown) => format === SNAPSHOT_FORMAT_V2 || format === SNAPSHOT_FORMAT_V3;
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

/** Hedef şemada 20271113 gövde kolonları var mı? (3 → evet, 0 → hayır, diğer → tutarsız şema). */
export async function bodyColumnCount(su: pg.Client): Promise<number> {
  const r = await su.query(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='hd_education_charts'
                              and column_name in ('provider_body','provider_body_sha256','provider_canonical_sha256')`);
  return Number(r.rows[0].n);
}

/** ESKİ (v1/v2) parmak izi — `String(Date)` içerir, süreç TZ/diline bağlıdır. Yalnız geriye uyum doğrulaması için. */
export function evidenceFingerprint(row: Record<string, unknown>): string {
  return sha256(JSON.stringify(EVIDENCE_COLS.map((c) => (row[c] === null || row[c] === undefined ? null : String(row[c])))));
}

/** Kanıt alanlarının DETERMİNİSTİK temsili PostgreSQL'den (UTC; saat dilimi / dil bağımsız). Sıra = EVIDENCE_COLS. */
const EVIDENCE_UTC_SQL = `select id::text as id, natural_key, birth_date::text as birth_date, documented_local_time, time_standard,
  utc_offset_seconds::text as utc_offset_seconds, to_char(birth_utc at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as birth_utc,
  utc_status, latitude::text as latitude, longitude::text as longitude, revision::text as revision from public.hd_education_subjects where id = $1`;
export type EvidenceUtc = Record<(typeof EVIDENCE_COLS)[number], string | null>;
export async function readEvidenceUtc(su: pg.Client, subjectId: string): Promise<EvidenceUtc | null> {
  const r = (await su.query(EVIDENCE_UTC_SQL, [subjectId])).rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return Object.fromEntries(EVIDENCE_COLS.map((c) => [c, r[c] === null || r[c] === undefined ? null : String(r[c])])) as EvidenceUtc;
}
export const evidenceFingerprintV2 = (e: EvidenceUtc) => sha256(`hd-edu-evidence-2|${JSON.stringify(EVIDENCE_COLS.map((c) => e[c]))}`);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const NUM_RE = /^-?\d{1,4}(\.\d{1,9})?$/;
const INT_RE = /^-?\d{1,6}$/;
export type EvidenceCheck = { ok: boolean; code: string | null; mismatched: string[]; legacyFingerprint: "verified" | "not-reproducible-here" | "n/a"; v2Fingerprint: "verified" | "n/a" };

/**
 * Paket kanıtı ↔ hedef DB: TZ BAĞIMSIZ, alan alan, tipli karşılaştırma (PostgreSQL içinde). Belirsiz biçim → RED.
 * Kodlar: NO_SUBJECT · NATURAL_KEY · REVISION · EVIDENCE_AMBIGUOUS · EVIDENCE_CHANGED · LEGACY_FINGERPRINT · FINGERPRINT_V2.
 */
export async function checkEvidence(su: pg.Client, pkgSubject: Record<string, unknown>, format: unknown, expectSubjectId: unknown): Promise<EvidenceCheck> {
  const res = (code: string | null, mismatched: string[] = [], legacy: EvidenceCheck["legacyFingerprint"] = "n/a", v2: EvidenceCheck["v2Fingerprint"] = "n/a"): EvidenceCheck =>
    ({ ok: code === null, code, mismatched, legacyFingerprint: legacy, v2Fingerprint: v2 });
  const v = (c: string) => (pkgSubject[c] === null || pkgSubject[c] === undefined ? null : pkgSubject[c]);
  // 1) Paket değerlerinin biçimi KESİN olmalı (belirsizlikte RED).
  const str = (c: string) => (v(c) === null ? null : typeof v(c) === "string" ? (v(c) as string) : typeof v(c) === "number" ? String(v(c)) : undefined);
  const id = str("id"), bd = str("birth_date"), bu = str("birth_utc"), lat = str("latitude"), lon = str("longitude"), off = str("utc_offset_seconds"), rev = str("revision");
  if (!id || !UUID_RE.test(id) || id !== String(expectSubjectId)) return res("EVIDENCE_AMBIGUOUS", ["id"]);
  if (!bd || !DATE_RE.test(bd)) return res("EVIDENCE_AMBIGUOUS", ["birth_date"]);
  if (bu !== null && (bu === undefined || !UTC_RE.test(bu))) return res("EVIDENCE_AMBIGUOUS", ["birth_utc"]);
  if (lat !== null && (lat === undefined || !NUM_RE.test(lat))) return res("EVIDENCE_AMBIGUOUS", ["latitude"]);
  if (lon !== null && (lon === undefined || !NUM_RE.test(lon))) return res("EVIDENCE_AMBIGUOUS", ["longitude"]);
  if (off !== null && (off === undefined || !INT_RE.test(off))) return res("EVIDENCE_AMBIGUOUS", ["utc_offset_seconds"]);
  if (!rev || !INT_RE.test(rev)) return res("EVIDENCE_AMBIGUOUS", ["revision"]);
  for (const c of ["natural_key", "documented_local_time", "time_standard", "utc_status"]) if (str(c) === undefined) return res("EVIDENCE_AMBIGUOUS", [c]);
  // 2) PostgreSQL içinde tipli karşılaştırma (oturum saat diliminden bağımsız: timestamptz/date değer eşitliği).
  const q = (await su.query(`select
      natural_key = $2 as natural_key, revision = $11::int as revision,
      birth_date = $3::date as birth_date, documented_local_time is not distinct from $4 as documented_local_time,
      time_standard is not distinct from $5 as time_standard, utc_offset_seconds is not distinct from $6::int as utc_offset_seconds,
      birth_utc is not distinct from $7::timestamptz as birth_utc, utc_status = $8 as utc_status,
      latitude is not distinct from $9::numeric as latitude, longitude is not distinct from $10::numeric as longitude
    from public.hd_education_subjects where id = $1::uuid`,
    [id, str("natural_key"), bd, str("documented_local_time"), str("time_standard"), off, bu, str("utc_status"), lat, lon, rev])).rows[0] as Record<string, boolean> | undefined;
  if (!q) return res("NO_SUBJECT");
  if (!q.natural_key) return res("NATURAL_KEY", ["natural_key"]);
  if (!q.revision) return res("REVISION", ["revision"]);
  const mismatched = Object.keys(q).filter((k) => q[k] !== true);
  if (mismatched.length) return res("EVIDENCE_CHANGED", mismatched);
  // 3) Parmak izleri.
  if (format === SNAPSHOT_FORMAT_V3) {
    const e = pkgSubject.evidence_utc as EvidenceUtc | undefined;
    const db = await readEvidenceUtc(su, id);
    if (!e || !db || evidenceFingerprintV2(e) !== pkgSubject.evidence_fingerprint_v2 || evidenceFingerprintV2(db) !== pkgSubject.evidence_fingerprint_v2) return res("FINGERPRINT_V2", ["evidence_fingerprint_v2"]);
    return res(null, [], "n/a", "verified");
  }
  // Eski biçim: yeniden üretilebiliyorsa EŞİT olmalı. Üretilebilirlik, paketin KENDİ değerlerinin bu ortamdaki String(Date) temsiliyle
  // sınanır; aynı ortamda DB değerinden de aynı sonuç çıkmalı (yukarıda değer eşitliği kanıtlandı).
  const legacyHere = evidenceFingerprint({ ...pkgSubject, birth_utc: bu === null ? null : new Date(bu) });
  if (legacyHere === pkgSubject.evidence_fingerprint) return res(null, [], "verified");
  // Bu ortamda üretilemiyor. Ortamın TZ'si paketi üreten ortamla aynıysa (Europe/Istanbul) üretilemiyor olması gerçek değişiklik demektir → RED.
  if (Intl.DateTimeFormat().resolvedOptions().timeZone === LEGACY_EXPORT_TZ && legacyLocaleMatches()) return res("LEGACY_FINGERPRINT", ["evidence_fingerprint"], "not-reproducible-here");
  return res(null, [], "not-reproducible-here");
}
/** v1/v2 paketleri bu saat diliminde ve Türkçe sistem dilinde üretildi (22–23.10.2026 kanıtı: 12/12 yeniden üretildi). */
export const LEGACY_EXPORT_TZ = "Europe/Istanbul";
const legacyLocaleMatches = () => /Türkiye/.test(String(new Date(Date.UTC(2026, 0, 1))));

export type ExportResult = { json: string; version: number; subjectId: string; requestHash: string; productSha: string; bodySha: string | null; canonicalSha: string; roundtripOk: boolean; productShaOk: boolean };

/** v3 dışa aktarım (v2 + taşınabilir kanıt). `bodyText` = parse edilmeden yakalanan gövde (yoksa null → gövde alanları boş, işaretlenir). */
export async function exportSnapshot(su: pg.Client, chartId: string, bodyText: string | null): Promise<ExportResult> {
  const c = (await su.query(`select ${CHART_COLS.join(", ")} from public.hd_education_charts where id=$1`, [chartId])).rows[0] as Record<string, unknown>;
  if (!c) throw new Error("snapshot yok");
  const s = (await su.query(`select ${EVIDENCE_COLS.join(", ")}, display_name from public.hd_education_subjects where id=$1`, [c.subject_id])).rows[0] as Record<string, unknown>;
  const evidenceUtc = await readEvidenceUtc(su, String(c.subject_id));
  if (!s || !evidenceUtc) throw new Error("kişi kaydı yok");
  const src = (await su.query(`select role, url, institution, document_title, archive_ref, document_date, time_explicit, primary_secondary, license, usage_restriction
                                 from public.hd_education_sources where subject_id=$1 and subject_revision=$2 order by role, url`, [c.subject_id, c.subject_revision])).rows;
  const audit = (await su.query(`select created_at, actor_kind, action, detail from public.hd_education_audit_events where subject_id=$1 and action in ('chart_recorded','chart_failed') order by created_at`, [c.subject_id])).rows;
  // 20271113 sonrası şema: DB'deki gövde ile çağrıdan yakalanan gövde AYNI olmalı; yakalanan yoksa DB'deki kullanılır.
  if ((await bodyColumnCount(su)) === 3) {
    const b = (await su.query(`select provider_body from public.hd_education_charts where id=$1`, [chartId])).rows[0]?.provider_body as string | null | undefined;
    if (typeof b === "string") {
      if (bodyText !== null && bodyText !== b) throw new Error("DB'deki provider_body yakalanan gövdeyle aynı değil");
      bodyText = b;
    }
  }
  const parsed = bodyText !== null ? (JSON.parse(bodyText) as unknown) : null;
  const productText = parsed !== null ? JSON.stringify(parsed) : null;
  const productShaOk = productText !== null && sha256(productText) === c.provider_raw_sha256;
  const canonicalSha = canonicalSha256(c.provider_raw);
  const roundtripOk = parsed !== null && canonicalSha256(parsed) === canonicalSha;
  const bodySha = bodyText !== null ? sha256(Buffer.from(bodyText, "utf8")) : null;
  const pkg = {
    format: SNAPSHOT_FORMAT_V3,
    exported_at: new Date().toISOString(),
    subject: { ...s, birth_date: evidenceUtc.birth_date, birth_utc: evidenceUtc.birth_utc, evidence_utc: evidenceUtc, evidence_fingerprint_v2: evidenceFingerprintV2(evidenceUtc) },
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
  if (hasProviderBody(pkg.format)) {
    if (pkg.format === SNAPSHOT_FORMAT_V3) {
      // Taşınabilir kanıt kendi içinde tutarlı olmalı: parmak izi = hash(evidence_utc) ve evidence_utc = paketteki kişi alanları.
      const e = pkg.subject.evidence_utc as EvidenceUtc | undefined;
      if (!e || evidenceFingerprintV2(e) !== pkg.subject.evidence_fingerprint_v2) return { error: "EVIDENCE_V2_INCONSISTENT" };
      for (const k of ["id", "natural_key", "birth_date", "birth_utc", "utc_status"] as const) if (e[k] !== (pkg.subject[k] ?? null)) return { error: "EVIDENCE_V2_INCONSISTENT" };
    }
    const a = pkg.provider_body_text;
    if (typeof a !== "string" || sha256(Buffer.from(a, "utf8")) !== pkg.provider_body_sha256) return { error: "BODY_SHA" };
    const obj = JSON.parse(a) as unknown;
    if (sha256(JSON.stringify(obj)) !== c.provider_raw_sha256) return { error: "RAW_SHA" };
    if (canonicalSha256(obj) !== pkg.provider_canonical_sha256 || canonicalSha256(c.provider_raw) !== pkg.provider_canonical_sha256) return { error: "CANONICAL_MISMATCH" };
    return { error: null, pkg, providerObject: obj };
  }
  return { error: "FORMAT" };
}

/**
 * SHA doğrulamalı geri yükleme. Dönüş: "RESTORED" | "ALREADY_PRESENT" | "REJECTED:<neden>".
 * Kanıt denetimi `checkEvidence` (TZ bağımsız, alan alan); sonucu `onEvidence` ile bildirilir (eski parmak izi durumu dahil).
 */
export async function restoreSnapshotFile(su: pg.Client, file: string, expectedSha: string, onEvidence?: (e: EvidenceCheck) => void): Promise<string> {
  let txt: string;
  try { txt = readFileSync(file, "utf8"); } catch { return "REJECTED:FILE_MISSING"; }
  const v = verifyPackageText(txt, expectedSha);
  if (v.error || !v.pkg) return `REJECTED:${v.error}`;
  const c: Record<string, unknown> = { ...v.pkg.chart, provider_raw: v.providerObject };
  if (String(v.pkg.subject.id) !== String(c.subject_id) || Number(v.pkg.subject.revision) !== Number(c.subject_revision)) return "REJECTED:PACKAGE_INCONSISTENT";
  const ev = await checkEvidence(su, v.pkg.subject, v.pkg.format, c.subject_id);
  onEvidence?.(ev);
  if (!ev.ok) return `REJECTED:${ev.code}`;
  const dup = (await su.query(`select count(*)::int n from public.hd_education_charts where subject_id=$1 and request_hash=$2 and adapter_version=$3`, [c.subject_id, c.request_hash, c.adapter_version])).rows[0].n;
  if (Number(dup) > 0) return "ALREADY_PRESENT";
  // 20271113 sonrası şemada: v2 → orijinal gövde + özet; v1 → gövde NULL (yeniden üretilmiş metin gövde İLAN EDİLMEZ) + kanonik.
  const bc = await bodyColumnCount(su);
  if (bc !== 0 && bc !== 3) return "REJECTED:SCHEMA_INCONSISTENT";
  const isV2 = hasProviderBody(v.pkg.format);
  const canonical = canonicalSha256(v.providerObject);
  if (bc === 3) {
    c.provider_body = isV2 ? v.pkg.provider_body_text : null;
    c.provider_body_sha256 = isV2 ? v.pkg.provider_body_sha256 : null;
    c.provider_canonical_sha256 = canonical;
  }
  const cols = [...CHART_COLS.filter((k) => k !== "created_by"), ...(bc === 3 ? ["provider_body", "provider_body_sha256", "provider_canonical_sha256"] : [])];
  const vals = cols.map((k) => (c[k] !== null && typeof c[k] === "object" ? JSON.stringify(c[k]) : c[k]));
  await su.query(`insert into public.hd_education_charts (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`, vals);
  // jsonb gidiş-dönüşü: geri okunan nesnenin kanonik özeti paketle AYNI olmalı (+ gövde alanları).
  const back = (await su.query(`select * from public.hd_education_charts where id=$1`, [c.id])).rows[0] as Record<string, unknown> | undefined;
  if (!back || canonicalSha256(back.provider_raw) !== canonical) throw new Error("jsonb gidiş-dönüşü kanonik özeti tutmadı");
  if (bc === 3 && (back.provider_canonical_sha256 !== canonical || back.provider_body_sha256 !== c.provider_body_sha256 || back.provider_body !== c.provider_body)) throw new Error("gövde alanları geri okumada tutmadı");
  await su.query(`insert into public.hd_education_audit_events (actor_kind, actor_user_id, action, subject_id, detail) values ('import', null, 'chart_recorded', $1, $2)`,
    [c.subject_id, JSON.stringify({ kaynak: "snapshot-paketi", format: v.pkg.format, chart_id: c.id, surum: c.version, dosya_sha256: expectedSha, govde: bc === 3 && isV2 ? "orijinal-http" : "yok", kanit: { eski_parmak_izi: ev.legacyFingerprint, parmak_izi_v2: ev.v2Fingerprint } })]);
  return "RESTORED";
}
