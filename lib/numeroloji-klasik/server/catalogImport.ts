/**
 * Klasik Numeroloji — SABİT KATALOG ÇEVRİMDIŞI İÇE AKTARICI (YALNIZ SUNUCU / YALNIZ OPERATÖR BETİĞİ).
 *
 * Kaynak: daha önce alınmış sağlayıcı ham yanıtları (repo DIŞINDA; varsayılan
 *   C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/raw/). Bu modül HİÇBİR ağ çağrısı yapmaz.
 *   • pythagorean_meaning  1–9, 11, 22, 33 (tr)          → m02-mean-<n>-tr.json        (12 satır)
 *   • chaldean_compound    10–52 (tr)                     → m02-cmp-<n>-tr.json         (43 satır)
 *   • lucky_association    12 Yaşam Yolu × tr + en        → l01-chart-lp<n>-<lang>.json (24 satır)
 *     (harita yanıtının luckyAssociations alanı; ../lucky-gemstones.json özeti varsa taş adları çapraz doğrulanır)
 * Her yanıt lib/numeroloji-klasik/normalize ile normalize edilir (ham yanıt DB'ye yazılmaz).
 * Hedef: YALNIZ `numerology_classic_catalog` (upsert). Sağlayıcı metni repoya GİRMEZ.
 *
 * Güvenlik kapısı (assertLocalImportTarget): NUM_KLASIK_IMPORT_TARGET tam "local-test" VE veritabanı URL host'u
 * localhost / 127.0.0.1 / ::1 değilse ÇALIŞMAZ. Production içe aktarımı OWNER adımıdır (bkz. betik başlığı).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { assertServerOnly } from "../../server/serverOnlyGuard";
import { CLASSIC_PROVIDER_SPEC_VERSION } from "../endpoints";
import { normalizeEndpointResponse } from "../normalize";
import type { ChartResult, CompoundNumberResult, MeaningsResult } from "../model";

assertServerOnly("lib/numeroloji-klasik/server/catalogImport");

export const CATALOG_RAW_DIR_DEFAULT = "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/raw";
export const CATALOG_MEANING_NUMBERS: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]);
export const CATALOG_COMPOUND_NUMBERS: readonly number[] = Object.freeze(Array.from({ length: 43 }, (_, i) => 10 + i));
export const CATALOG_LUCKY_LANGS = ["tr", "en"] as const;
export const CATALOG_EXPECTED = Object.freeze({ pythagorean_meaning: 12, chaldean_compound: 43, lucky_association: 24 });

export type CatalogKind = "pythagorean_meaning" | "chaldean_compound" | "lucky_association";
export type CatalogRow = { kind: CatalogKind; number: number; lang: string; payload: Record<string, unknown> };

type FsLike = { readFile: (p: string) => string; exists: (p: string) => boolean };
const nodeFs: FsLike = { readFile: (p) => readFileSync(p, "utf8"), exists: (p) => existsSync(p) };

function rawBody(fs: FsLike, file: string): { ok: true; body: unknown } | { ok: false; problem: string } {
  if (!fs.exists(file)) return { ok: false, problem: `${path.basename(file)}: dosya yok` };
  let j: unknown;
  try {
    j = JSON.parse(fs.readFile(file));
  } catch {
    return { ok: false, problem: `${path.basename(file)}: JSON okunamadı` };
  }
  const o = j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  if (!o || o.http !== 200 || !("body" in o)) return { ok: false, problem: `${path.basename(file)}: başarılı yanıt değil` };
  return { ok: true, body: o.body };
}

function sameList(a: unknown, b: unknown): boolean {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
}

/** Ham dosyalar → normalize katalog satırları (saf okuma; ağ yok, DB yok). */
export function buildCatalogRows(opts: { rawDir?: string; luckySummaryPath?: string | null; fs?: FsLike } = {}): { rows: CatalogRow[]; problems: string[] } {
  const fs = opts.fs ?? nodeFs;
  const dir = opts.rawDir ?? CATALOG_RAW_DIR_DEFAULT;
  const rows: CatalogRow[] = [];
  const problems: string[] = [];

  for (const n of CATALOG_MEANING_NUMBERS) {
    const r = rawBody(fs, path.join(dir, `m02-mean-${n}-tr.json`));
    if (!r.ok) { problems.push(r.problem); continue; }
    const norm = normalizeEndpointResponse("meanings", r.body);
    if (!norm.ok) { problems.push(`meanings ${n}: normalize reddi (${norm.reason.slice(0, 80)})`); continue; }
    const num = (norm.data as MeaningsResult).number;
    if (num.value !== n) { problems.push(`meanings ${n}: sayı uyuşmuyor (${num.value})`); continue; }
    rows.push({ kind: "pythagorean_meaning", number: n, lang: "tr", payload: { number: num.value, type: num.type, meaning: num.meaning } });
  }

  for (const n of CATALOG_COMPOUND_NUMBERS) {
    const r = rawBody(fs, path.join(dir, `m02-cmp-${n}-tr.json`));
    if (!r.ok) { problems.push(r.problem); continue; }
    const norm = normalizeEndpointResponse("compound_number", r.body);
    if (!norm.ok) { problems.push(`compound ${n}: normalize reddi (${norm.reason.slice(0, 80)})`); continue; }
    const c = norm.data as CompoundNumberResult;
    if (c.number !== n) { problems.push(`compound ${n}: sayı uyuşmuyor (${c.number})`); continue; }
    rows.push({ kind: "chaldean_compound", number: n, lang: "tr", payload: { number: c.number, name: c.name, nature: c.nature, meaning: c.meaning, sameAs: c.sameAs, root: c.root } });
  }

  type LuckySummary = Record<string, Record<string, Record<string, unknown>>>;
  let summary = null as LuckySummary | null;
  const sp = opts.luckySummaryPath === undefined ? path.join(dir, "..", "lucky-gemstones.json") : opts.luckySummaryPath;
  if (sp && fs.exists(sp)) {
    try {
      summary = JSON.parse(fs.readFile(sp)) as LuckySummary;
    } catch {
      problems.push("lucky-gemstones.json okunamadı");
    }
  }
  for (const n of CATALOG_MEANING_NUMBERS) {
    for (const lang of CATALOG_LUCKY_LANGS) {
      const r = rawBody(fs, path.join(dir, `l01-chart-lp${n}-${lang}.json`));
      if (!r.ok) { problems.push(r.problem); continue; }
      const norm = normalizeEndpointResponse("chart", r.body);
      if (!norm.ok) { problems.push(`lucky ${n}/${lang}: harita normalize reddi (${norm.reason.slice(0, 80)})`); continue; }
      const chart = norm.data as ChartResult;
      if (chart.core.lifePath.value !== n) { problems.push(`lucky ${n}/${lang}: Yaşam Yolu uyuşmuyor (${chart.core.lifePath.value})`); continue; }
      const la = chart.luckyAssociations;
      if (!la) { problems.push(`lucky ${n}/${lang}: luckyAssociations yok`); continue; }
      const s = summary?.[String(n)]?.[lang];
      if (summary && (!s || !sameList(s.gemstones, la.gemstones))) { problems.push(`lucky ${n}/${lang}: özet dosyasıyla taş adları uyuşmuyor`); continue; }
      rows.push({
        kind: "lucky_association",
        number: n,
        lang,
        payload: {
          gemstones: [...la.gemstones],
          colors: [...la.colors],
          day: la.day,
          element: la.element,
          rulingPlanet: la.rulingPlanet,
          compatibleNumbers: [...la.compatibleNumbers],
          incompatibleNumbers: [...la.incompatibleNumbers],
        },
      });
    }
  }
  return { rows, problems };
}

export type ImportTargetCheck = { ok: true; url: string } | { ok: false; reason: string };

/** YALNIZ yerel test veritabanı: hedef bayrağı + localhost host'u. */
export function assertLocalImportTarget(env: Record<string, string | undefined>): ImportTargetCheck {
  if (env.NUM_KLASIK_IMPORT_TARGET !== "local-test") return { ok: false, reason: "NUM_KLASIK_IMPORT_TARGET tam olarak \"local-test\" olmalı (production içe aktarımı owner adımıdır)." };
  const url = env.NUM_KLASIK_IMPORT_DB_URL;
  if (!url) return { ok: false, reason: "NUM_KLASIK_IMPORT_DB_URL tanımlı değil." };
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return { ok: false, reason: "Veritabanı URL'si postgres:// olmalı." };
    host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return { ok: false, reason: "Veritabanı URL'si okunamadı." };
  }
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") return { ok: false, reason: `Yalnız yerel veritabanına içe aktarılabilir (host: ${host.slice(0, 60)}).` };
  return { ok: true, url };
}

export type SqlExec = (sql: string, params: unknown[]) => Promise<unknown>;

/** Tek işlemde upsert (kind, number, lang). Yalnız numerology_classic_catalog'a yazar. */
export async function upsertCatalogRows(exec: SqlExec, rows: readonly CatalogRow[], specVersion = CLASSIC_PROVIDER_SPEC_VERSION): Promise<number> {
  await exec("begin", []);
  try {
    for (const r of rows) {
      await exec(
        `insert into public.numerology_classic_catalog (kind, number, lang, payload, spec_version, imported_at)
         values ($1, $2, $3, $4::jsonb, $5, now())
         on conflict (kind, number, lang) do update set payload = excluded.payload, spec_version = excluded.spec_version, imported_at = now()`,
        [r.kind, r.number, r.lang, JSON.stringify(r.payload), specVersion],
      );
    }
    await exec("commit", []);
  } catch (e) {
    await exec("rollback", []).catch(() => undefined);
    throw e;
  }
  return rows.length;
}
