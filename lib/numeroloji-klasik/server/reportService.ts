/**
 * Klasik Numeroloji — Word raporu servisi (YALNIZ SUNUCU; YALNIZ KAYITLI VERİ; 0 sağlayıcı çağrısı).
 *
 * Rapor türleri: person | stones | relationship | business | names | comparison.
 * Kaynak: kayıtlı klasik analiz (`numerology_classic_analyses`), kayıtlı Mevcut Numeroloji kaydı (YALNIZ select),
 * kayıtlı karşılaştırma notu. `provider_meta` rapora girmez (toReportRecord yalnız tarih / başarısız etiket alır).
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid, type Validation } from "../input";
import {
  buildBusinessReport,
  buildComparisonReport,
  buildNamesReport,
  buildPersonReport,
  buildRelationshipReport,
  buildStonesReport,
  toReportRecord,
} from "../report/docx";
import { buildReportFilename, type ReportFileKind } from "../report/filename";
import { PERSON_REPORT_GROUPS, type PersonReportGroup, type ReportVariant } from "../report/types";
import { buildComparison, type ComparePairRequest } from "./compareService";
import { getAnalysis, getNote, type RepoError } from "./repository";
import { buildClassicStonesView, defaultClassicStonesDeps, type ClassicStonesDeps } from "./stonesService";
import { rowResultForViewer } from "./futureYearsView";
import { currentIstanbulYear } from "@/lib/numeroloji/currentYear";

assertServerOnly("lib/numeroloji-klasik/server/reportService");

export type ClassicReportKind = "person" | "stones" | "relationship" | "business" | "names" | "comparison";
const REPORT_KINDS: readonly ClassicReportKind[] = ["person", "stones", "relationship", "business", "names", "comparison"];
const VARIANTS: readonly ReportVariant[] = ["summary", "technical", "full"];

export type ClassicReportRequest = {
  kind: ClassicReportKind;
  analysisId: string | null;
  legacyId: string | null;
  noteId: string | null;
  variant: ReportVariant;
  include: PersonReportGroup[];
};

const bad = <T>(code: string, error: string, field?: string): Validation<T> => ({ ok: false, code, error, ...(field ? { field } : {}) });

export function validateReportRequest(body: unknown): Validation<ClassicReportRequest> {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype) return bad("INVALID_INPUT", "Geçersiz istek.");
  const o = body as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (!["kind", "analysisId", "legacyId", "noteId", "variant", "include"].includes(k)) return bad("UNKNOWN_FIELD", `Beklenmeyen alan: ${k.slice(0, 40)}`, k);
  }
  if (typeof o.kind !== "string" || !(REPORT_KINDS as readonly string[]).includes(o.kind)) return bad("INVALID_KIND", "Rapor türü geçersiz.", "kind");
  const kind = o.kind as ClassicReportKind;
  const id = (k: "analysisId" | "legacyId" | "noteId"): Validation<string | null> => {
    const v = o[k];
    if (v === undefined || v === null) return { ok: true, value: null };
    if (!isUuid(v)) return bad("INVALID_ID", "Kayıt kimliği geçersiz.", k);
    return { ok: true, value: v.toLowerCase() };
  };
  const a = id("analysisId");
  if (!a.ok) return a;
  const l = id("legacyId");
  if (!l.ok) return l;
  const n = id("noteId");
  if (!n.ok) return n;
  let variant: ReportVariant = "full";
  if (o.variant !== undefined) {
    if (typeof o.variant !== "string" || !(VARIANTS as readonly string[]).includes(o.variant)) return bad("INVALID_VARIANT", "Rapor düzeyi geçersiz.", "variant");
    variant = o.variant as ReportVariant;
  }
  const include: PersonReportGroup[] = [];
  if (o.include !== undefined) {
    if (!Array.isArray(o.include) || o.include.length > PERSON_REPORT_GROUPS.length) return bad("INVALID_INCLUDE", "Bölüm seçimi geçersiz.", "include");
    for (const g of o.include) {
      if (typeof g !== "string" || !(PERSON_REPORT_GROUPS as readonly string[]).includes(g)) return bad("INVALID_INCLUDE", "Bölüm seçimi geçersiz.", "include");
      if (!include.includes(g as PersonReportGroup)) include.push(g as PersonReportGroup);
    }
  }
  if (kind === "comparison") {
    if (a.value === null && l.value === null && n.value === null) return bad("SOURCE_REQUIRED", "Karşılaştırma için en az bir kayıt ya da not seçilmeli.");
  } else {
    if (a.value === null) return bad("ANALYSIS_REQUIRED", "Rapor için kayıtlı analiz seçilmeli.", "analysisId");
    if (l.value !== null || n.value !== null) return bad("UNKNOWN_FIELD", "Bu rapor türü yalnız analiz kimliği alır.");
  }
  return { ok: true, value: { kind, analysisId: a.value, legacyId: l.value, noteId: n.value, variant, include } };
}

export type ReportCtx = { db: SupabaseClient; tenantId: string; viewerId: string; expertName: string | null; futureYears?: boolean; canSeeStock?: boolean; now?: () => Date };

export type ReportOutcome =
  | { ok: true; buffer: Buffer; filename: string; resourceId: string }
  | { ok: false; reason: RepoError["reason"] | "kind_mismatch" | "no_chart" };

const FILE_KIND: Readonly<Record<ClassicReportKind, ReportFileKind>> = Object.freeze({
  person: "kisi",
  stones: "tas",
  relationship: "iliski",
  business: "isletme",
  names: "isimler",
  comparison: "karsilastirma",
});

/** Kayıtlı veriden Word üretir. */
export async function buildClassicReport(
  ctx: ReportCtx,
  req: ClassicReportRequest,
  stonesDeps: ClassicStonesDeps = defaultClassicStonesDeps(),
): Promise<ReportOutcome> {
  const at = (ctx.now ?? (() => new Date()))();
  const common = { generatedAt: at, expertName: ctx.expertName };

  if (req.kind === "comparison") {
    let pair: ComparePairRequest = { legacyId: req.legacyId, classicId: req.analysisId };
    let noteBody: string | null = null;
    if (req.noteId) {
      const n = await getNote(ctx.db, ctx.tenantId, req.noteId);
      if (!n.ok) return n;
      noteBody = n.value.body;
      pair = { legacyId: pair.legacyId ?? n.value.legacy_record_id, classicId: pair.classicId ?? n.value.classic_analysis_id };
      if (pair.legacyId && !isUuid(pair.legacyId)) pair.legacyId = null;
    }
    if (!pair.legacyId && !pair.classicId) return { ok: false, reason: "not_found" };
    const c = await buildComparison(ctx, pair, stonesDeps);
    if (!c.ok) return c;
    const { alignment, sources } = c.value;
    const buffer = await buildComparisonReport(
      {
        alignment,
        legacyMeta: {
          personName: sources.legacy?.fullName ?? null,
          birthDate: sources.legacy?.birthDate ?? null,
          createdAt: sources.legacy?.createdAt ?? null,
          methodologyVersion: sources.legacy?.methodologyVersion ?? null,
        },
        classicMeta: {
          title: sources.classic?.title ?? null,
          personName: personNameOf(c.value.classicRow?.input),
          birthDate: birthOf(c.value.classicRow?.input),
          createdAt: sources.classic?.createdAt ?? null,
          methodologyVersion: sources.classic?.methodologyVersion ?? null,
        },
        note: noteBody,
      },
      common,
    );
    // NK-R14: dosya adına kişi adı EKLENMEZ (yalnız uzmanın yazdığı klasik başlık; yoksa sabit ad).
    const title = sources.classic?.title || "Karsilastirma";
    return { ok: true, buffer, filename: buildReportFilename("karsilastirma", title, at), resourceId: req.noteId ?? [pair.legacyId, pair.classicId].filter(Boolean).join(",") };
  }

  const r = await getAnalysis(ctx.db, ctx.tenantId, req.analysisId as string);
  if (!r.ok) return r;
  const row = r.value;
  const expected = req.kind === "stones" ? "person" : req.kind;
  if (row.kind !== expected) return { ok: false, reason: "kind_mismatch" };
  // NK-R3: Word'e yetkisiz uzmanın göremeyeceği gelecek dönem / gelecek yıl zamanlaması GİRMEZ (verilmezse kısıtlı).
  const shown = rowResultForViewer(row, { futureYears: ctx.futureYears === true, currentYear: currentIstanbulYear(at) });
  const record = toReportRecord({ ...(row as unknown as Record<string, unknown>), result: shown });
  let buffer: Buffer;
  switch (req.kind) {
    case "person": {
      const wantStones = req.variant === "full" || req.include.length === 0 || req.include.includes("stones");
      const stones = wantStones ? await buildClassicStonesView(ctx, row.result, stonesDeps) : null;
      buffer = await buildPersonReport(record, { ...common, variant: req.variant, include: req.include, stones: stones?.result ?? null });
      break;
    }
    case "stones": {
      const stones = await buildClassicStonesView(ctx, row.result, stonesDeps);
      if (!stones) return { ok: false, reason: "no_chart" };
      buffer = await buildStonesReport(record, stones.result, common);
      break;
    }
    case "relationship":
      buffer = await buildRelationshipReport(record, common);
      break;
    case "business":
      buffer = await buildBusinessReport(record, common);
      break;
    case "names":
      buffer = await buildNamesReport(record, { ...common, variant: req.variant });
      break;
  }
  return { ok: true, buffer, filename: buildReportFilename(FILE_KIND[req.kind], row.title, at), resourceId: row.id };
}

function personNameOf(input: unknown): string | null {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  return typeof o?.fullName === "string" ? o.fullName : null;
}
function birthOf(input: unknown): string | null {
  const b = input && typeof input === "object" ? ((input as Record<string, unknown>).birth as Record<string, unknown> | undefined) : undefined;
  if (!b || typeof b.year !== "number" || typeof b.month !== "number" || typeof b.day !== "number") return null;
  return `${String(b.day).padStart(2, "0")}.${String(b.month).padStart(2, "0")}.${b.year}`;
}
