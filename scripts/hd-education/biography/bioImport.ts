/**
 * HD Hazır Eğitim Haritaları · FAZ 10 "Hayat Hikâyesi" — İÇE AKTARMA (yalnız araç; ürün kodu değil).
 * Sözleşme dosyaları (hd-edu-bio-1, `<person_key>.<lang>.json`) ürünün AYNI doğrulayıcısından (parseBioContent) geçer;
 * geçen dosyalardan idempotent SQL üretilir: kayıt yoksa eklenir (publish_status='hidden' — YAYIN YOK), varsa DOKUNULMAZ.
 * FAZ 19 (P3): dokunulmayan (atlanan / güncellenmeyen) ve harita kaydına bağlanamayan satırlar SESSİZ KALMAZ — her satırın
 * sonucu oturumluk geçici tabloya (pg_temp.hd_edu_bio_import_log) yazılır; bioImportSql sonunda sayı + anahtar NOTICE'ı verir.
 * Harita kaydı bağlantısı natural_key ile DB'de çözülür (yoksa subject_id NULL = aday). Hesap tablolarına yazılmaz.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  BIO_CONTRACT, BIO_PERSON_KEY_RE, BioValidationError, contentToRow, isBioChronological, parseBioContent, parseBioLang,
  type BioContent, type BioContentStatus, type BioLang,
} from "../../../lib/human-design/education/biography/biographyContract";

export type BioFile = {
  file: string; personKey: string; lang: BioLang; naturalKey: string | null; contentStatus: BioContentStatus; content: BioContent;
  /** FAZ 19: dosyadaki olay sırası (önek eşitliği serbest) kronolojik değildi → içe aktarmada yeniden sıralandı. */
  timelineReordered: boolean;
};
export type BioFileError = { file: string; field: string; error: string };

const NATURAL_KEY_RE = /^[a-z0-9][a-z0-9-]{1,118}-[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
/**
 * FAZ 19 (P2-d): sözleşmedeki üst düzey alanlar. Bilinmeyen alan SESSİZCE ATILMAZ — dosya reddedilir (veri kaybı görünür olur;
 * ör. fact_checks eskiden düşüyordu, artık sözleşmede).
 */
export const BIO_FILE_KEYS = new Set([
  "contract", "person_key", "natural_key", "lang", "display_name", "life_span", "birth_year", "death_year", "is_living", "profession",
  "known_for", "country", "era", "category", "short_intro", "sections", "timeline", "sources", "wikipedia_usage", "fact_checks",
  "neutrality_note", "open_questions", "content_status",
]);

export function parseBioFile(file: string, raw: string): BioFile {
  let j: Record<string, unknown>;
  try { j = JSON.parse(raw) as Record<string, unknown>; } catch { throw new BioValidationError("json", "Geçerli JSON değil."); }
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new BioValidationError("json", "JSON nesnesi bekleniyor.");
  if (j.contract !== BIO_CONTRACT) throw new BioValidationError("contract", `contract "${BIO_CONTRACT}" bekleniyor.`);
  const unknown = Object.keys(j).filter((k) => !BIO_FILE_KEYS.has(k));
  if (unknown.length) throw new BioValidationError("unknown_field", `Sözleşmede olmayan alan(lar): ${unknown.slice(0, 5).join(", ")} — sessizce atılmaz; alanı sözleşmeye ekleyin ya da dosyadan çıkarın.`);
  const personKey = String(j.person_key ?? "");
  if (!BIO_PERSON_KEY_RE.test(personKey)) throw new BioValidationError("person_key", "Geçersiz person_key.");
  const lang = parseBioLang(j.lang);
  if (!lang) throw new BioValidationError("lang", "lang tr|en olmalı.");
  const nk = j.natural_key === null || j.natural_key === undefined || j.natural_key === "" ? null : String(j.natural_key);
  if (nk !== null && !NATURAL_KEY_RE.test(nk)) throw new BioValidationError("natural_key", "Geçersiz natural_key.");
  const cs = String(j.content_status ?? "draft");
  if (cs !== "draft" && cs !== "source_checked") throw new BioValidationError("content_status", "İçe aktarmada content_status draft|source_checked olmalı.");
  const base = path.basename(file);
  if (base !== `${personKey}.${lang}.json`) throw new BioValidationError("file", `Dosya adı ${personKey}.${lang}.json olmalı.`);
  const rawDates = Array.isArray(j.timeline) ? (j.timeline as Array<{ date?: unknown }>).map((e) => String(e?.date ?? "")) : [];
  return { file: base, personKey, lang, naturalKey: nk, contentStatus: cs as BioContentStatus, content: parseBioContent(j), timelineReordered: !isBioChronological(rawDates) };
}

export function loadBioDir(dir: string): { files: BioFile[]; errors: BioFileError[] } {
  const files: BioFile[] = [];
  const errors: BioFileError[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    try {
      files.push(parseBioFile(f, readFileSync(path.join(dir, f), "utf8")));
    } catch (e) {
      errors.push({ file: f, field: e instanceof BioValidationError ? e.field : "?", error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { files, errors };
}

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("sayı değil"); return String(v); }
  if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
};

export const BIO_IMPORT_LOG = "pg_temp.hd_edu_bio_import_log";
const LOG_DDL = `CREATE TEMP TABLE IF NOT EXISTS hd_edu_bio_import_log (person_key text NOT NULL, lang text NOT NULL, natural_key text, sonuc text NOT NULL);`;
/** Satır sonucu: eklendi · eklendi_harita_yok (natural_key verildi ama kişi kaydı bulunamadı → subject_id NULL) · atlandi_mevcut. */
export type BioImportOutcome = "eklendi" | "eklendi_harita_yok" | "atlandi_mevcut";

/**
 * Tek dosya → idempotent SQL (ON CONFLICT DO NOTHING; içe aktarma geçmişi yalnız yeni eklenen satır için yazılır).
 * FAZ 19: satırın sonucu (eklendi / atlandı — mevcut kayıt GÜNCELLENMEDİ / harita kaydı bulunamadı) oturum günlüğüne yazılır.
 */
export function bioInsertSql(b: BioFile): string {
  const row: Record<string, unknown> = { person_key: b.personKey, lang: b.lang, ...contentToRow(b.content), content_status: b.contentStatus, publish_status: "hidden" };
  const cols = Object.keys(row);
  const subj = b.naturalKey ? `(SELECT id FROM public.hd_education_subjects WHERE natural_key = ${lit(b.naturalKey)})` : "NULL";
  const snapshot = { ...contentToRow(b.content), content_status: b.contentStatus, publish_status: "hidden", source_file: b.file };
  return [
    LOG_DDL,
    `WITH ins AS (INSERT INTO public.hd_education_biographies (${cols.join(", ")}, subject_id)`,
    `  VALUES (${cols.map((c) => lit(row[c])).join(", ")}, ${subj})`,
    `  ON CONFLICT (person_key, lang) DO NOTHING RETURNING id, subject_id),`,
    `rev AS (INSERT INTO public.hd_education_biography_revisions (biography_id, revision, action, snapshot) SELECT id, 1, 'import', ${lit(snapshot)} FROM ins RETURNING 1)`,
    `INSERT INTO ${BIO_IMPORT_LOG} (person_key, lang, natural_key, sonuc) SELECT ${lit(b.personKey)}, ${lit(b.lang)}, ${lit(b.naturalKey)},`,
    `  CASE WHEN NOT EXISTS (SELECT 1 FROM ins) THEN 'atlandi_mevcut'`,
    `       WHEN ${b.naturalKey ? "true" : "false"} AND (SELECT subject_id FROM ins) IS NULL THEN 'eklendi_harita_yok' ELSE 'eklendi' END;`,
  ].join("\n");
}

/** Oturum günlüğünden özet NOTICE'ları: sayılar + atlanan / bağlanamayan anahtarlar (sessiz atlama yok). */
export function bioImportReportSql(): string {
  return [
    "DO $bio_rapor$ DECLARE a int; b int; c int; k text; BEGIN",
    `  SELECT count(*) FILTER (WHERE sonuc = 'eklendi'), count(*) FILTER (WHERE sonuc = 'atlandi_mevcut'), count(*) FILTER (WHERE sonuc = 'eklendi_harita_yok') INTO a, b, c FROM ${BIO_IMPORT_LOG};`,
    "  RAISE NOTICE 'hd-edu biyografi içe aktarma: eklendi %, ATLANDI (zaten var; GÜNCELLENMEDİ) %, harita kaydı bulunamadı (subject_id NULL) %', a + c, b, c;",
    `  SELECT string_agg(person_key || '.' || lang, ', ' ORDER BY person_key, lang) INTO k FROM ${BIO_IMPORT_LOG} WHERE sonuc = 'atlandi_mevcut';`,
    "  IF k IS NOT NULL THEN RAISE NOTICE 'atlanan (güncellenmeyen) anahtarlar: %', k; END IF;",
    `  SELECT string_agg(person_key || '.' || lang || ' (' || coalesce(natural_key, '') || ')', ', ' ORDER BY person_key, lang) INTO k FROM ${BIO_IMPORT_LOG} WHERE sonuc = 'eklendi_harita_yok';`,
    "  IF k IS NOT NULL THEN RAISE NOTICE 'harita kaydına bağlanamayan anahtarlar: %', k; END IF;",
    "END $bio_rapor$;",
  ].join("\n");
}

export function bioImportSql(files: BioFile[]): string {
  return ["-- HD eğitim Hayat Hikâyesi içe aktarma (FAZ 10) — yayın YOK (publish_status='hidden'); var olan kayda dokunulmaz.",
    "-- FAZ 19: atlanan (güncellenmeyen) ve harita kaydına bağlanamayan satırlar sonda NOTICE ile sayı + anahtar olarak raporlanır.",
    "BEGIN;", LOG_DDL, `TRUNCATE ${BIO_IMPORT_LOG};`,
    ...files.map(bioInsertSql), bioImportReportSql(), "COMMIT;", ""].join("\n");
}
