/**
 * HD Hazır Eğitim Haritaları · FAZ 10 "Hayat Hikâyesi" — İÇE AKTARMA (yalnız araç; ürün kodu değil).
 * Sözleşme dosyaları (hd-edu-bio-1, `<person_key>.<lang>.json`) ürünün AYNI doğrulayıcısından (parseBioContent) geçer;
 * geçen dosyalardan idempotent SQL üretilir: kayıt yoksa eklenir (publish_status='hidden' — YAYIN YOK), varsa DOKUNULMAZ.
 * Harita kaydı bağlantısı natural_key ile DB'de çözülür (yoksa subject_id NULL = aday). Hesap tablolarına yazılmaz.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  BIO_CONTRACT, BIO_PERSON_KEY_RE, BioValidationError, contentToRow, parseBioContent, parseBioLang,
  type BioContent, type BioContentStatus, type BioLang,
} from "../../../lib/human-design/education/biography/biographyContract";

export type BioFile = {
  file: string; personKey: string; lang: BioLang; naturalKey: string | null; contentStatus: BioContentStatus; content: BioContent;
};
export type BioFileError = { file: string; field: string; error: string };

const NATURAL_KEY_RE = /^[a-z0-9][a-z0-9-]{1,118}-[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export function parseBioFile(file: string, raw: string): BioFile {
  let j: Record<string, unknown>;
  try { j = JSON.parse(raw) as Record<string, unknown>; } catch { throw new BioValidationError("json", "Geçerli JSON değil."); }
  if (j.contract !== BIO_CONTRACT) throw new BioValidationError("contract", `contract "${BIO_CONTRACT}" bekleniyor.`);
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
  return { file: base, personKey, lang, naturalKey: nk, contentStatus: cs as BioContentStatus, content: parseBioContent(j) };
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

/** Tek dosya → idempotent SQL (ON CONFLICT DO NOTHING; içe aktarma geçmişi yalnız yeni eklenen satır için yazılır). */
export function bioInsertSql(b: BioFile): string {
  const row: Record<string, unknown> = { person_key: b.personKey, lang: b.lang, ...contentToRow(b.content), content_status: b.contentStatus, publish_status: "hidden" };
  const cols = Object.keys(row);
  const subj = b.naturalKey ? `(SELECT id FROM public.hd_education_subjects WHERE natural_key = ${lit(b.naturalKey)})` : "NULL";
  const snapshot = { ...contentToRow(b.content), content_status: b.contentStatus, publish_status: "hidden", source_file: b.file };
  return [
    `WITH ins AS (INSERT INTO public.hd_education_biographies (${cols.join(", ")}, subject_id)`,
    `  VALUES (${cols.map((c) => lit(row[c])).join(", ")}, ${subj})`,
    `  ON CONFLICT (person_key, lang) DO NOTHING RETURNING id)`,
    `INSERT INTO public.hd_education_biography_revisions (biography_id, revision, action, snapshot) SELECT id, 1, 'import', ${lit(snapshot)} FROM ins;`,
  ].join("\n");
}

export function bioImportSql(files: BioFile[]): string {
  return ["-- HD eğitim Hayat Hikâyesi içe aktarma (FAZ 10) — yayın YOK (publish_status='hidden'); var olan kayda dokunulmaz.", "BEGIN;",
    ...files.map(bioInsertSql), "COMMIT;", ""].join("\n");
}
