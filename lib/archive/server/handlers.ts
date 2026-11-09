/**
 * lib/archive/server/handlers.ts — Premium Word Arşivi uçlarının iş mantığı (next/server'sız; harness doğrudan çağırır).
 *
 * Her parça isteğinde seçenekler YENİDEN doğrulanır ve iş seçeneklerle tutarlı olmalıdır (ör. seçilmemiş modülün
 * raporu, seçim dışı danışanın dosyası istenemez). Kimlik / tenant yalnız oturumdan gelir.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { WordBudgetError } from "@/lib/backup/wordExport";
import { normalizeArchiveOptions } from "../scope";
import type { ArchiveFileSource, ArchiveJob, ArchiveOptions } from "../types";
import { auditScope, sanitizeAuditResult, writeArchiveAudit } from "./audit";
import { buildDataPart, decodeDataState, encodeDataState } from "./data";
import { FILE_SOURCES, signArchiveFile } from "./files";
import { extractMedia, MEDIA_SOURCES, mediaFileName, mediaModuleOf, readMediaRow, SIGNED_MEDIA_TTL } from "./media";
import { ArchiveTooLargeError, buildArchivePlan } from "./plan";
import {
  buildAstroReport,
  buildClientDossier,
  buildHdRelationReport,
  buildHdReport,
  buildNumerologyRecordReport,
  type ArchiveCtx,
} from "./reports";

assertServerOnly("lib/archive/server/handlers");

export type HandlerResult =
  | { kind: "json"; status: number; body: Record<string, unknown> }
  | { kind: "file"; bytes: Uint8Array; fileName: string; headers: Record<string, string>; contentType?: string };

const json = (status: number, body: Record<string, unknown>): HandlerResult => ({ kind: "json", status, body });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleArchivePlan(ctx: ArchiveCtx, body: unknown, now: Date = new Date()): Promise<HandlerResult> {
  const n = normalizeArchiveOptions((body as { options?: unknown } | null)?.options);
  if (!n.ok) return json(400, { ok: false, error: n.error });
  try {
    const plan = await buildArchivePlan(ctx, n.options, now);
    const audited = await writeArchiveAudit(ctx.db, ctx.userId, plan.archive_id, "started", { scope: auditScope(n.options), jobs: plan.jobs.length });
    if (!audited) plan.warnings.push("Denetim kaydı yazılamadı; arşiv yine de oluşturulabilir.");
    return json(200, plan as unknown as Record<string, unknown>);
  } catch (e) {
    if (e instanceof ArchiveTooLargeError) return json(413, { ok: false, code: "ARCHIVE_TOO_LARGE", error: e.message });
    throw e;
  }
}

function jobAllowed(job: ArchiveJob, o: ArchiveOptions): string | null {
  const has = (m: string) => o.modules.includes(m);
  const clientOk = (id: string) => !o.clientIds || o.clientIds.includes(id);
  switch (job.kind) {
    case "data":
      return o.include.data && has(job.module) ? null : "Bu modül arşiv kapsamında değil.";
    case "client_dossier":
      return o.include.dossiers && has("clients") && clientOk(job.clientId) ? null : "Danışan dosyası kapsam dışında.";
    case "numerology_record":
      // Danışan seçiliyken yalnız seçili danışana BAĞLI kayıtlar; bağsız kayıt danışan seçiminde kapsam dışıdır.
      return o.include.reports && has("numerology") && (o.clientIds ? job.clientId !== null && clientOk(job.clientId) : true)
        ? null
        : "Numeroloji raporu kapsam dışında.";
    case "hd_report":
    case "hd_relation_report":
      return o.include.reports && has("human_design") ? null : "Human Design raporu kapsam dışında.";
    case "astro_report":
      return o.include.reports && has("astrology") ? null : "Gökyüzü Atlası raporu kapsam dışında.";
    case "file":
      return o.include.files && FILE_SOURCES[job.source] && has(FILE_SOURCES[job.source].module) ? null : "Dosya kapsam dışında.";
    case "media": {
      if (!o.include.files || !MEDIA_SOURCES[job.table] || !has(mediaModuleOf(job.table))) return "Görsel kapsam dışında.";
      // Danışan seçiliyken yalnız seçili danışanların profil fotoğrafı; diğer görseller danışana bağlı değildir.
      if (o.clientIds) return job.table === "clients" && clientOk(job.rowId) ? null : "Görsel kapsam dışında.";
      return null;
    }
    default:
      return "Bilinmeyen iş.";
  }
}

function parseJob(raw: unknown): ArchiveJob | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const j = raw as Record<string, unknown>;
  const id = (k: string) => (typeof j[k] === "string" && UUID_RE.test(j[k] as string) ? (j[k] as string) : null);
  const base = { label: "", folder: "" };
  switch (j.kind) {
    case "data":
      return typeof j.module === "string" ? { kind: "data", module: j.module, expected: 0, ...base } : null;
    case "client_dossier":
      return id("clientId") ? { kind: "client_dossier", clientId: id("clientId")!, ...base } : null;
    case "numerology_record":
      if (!id("recordId") || (j.clientId !== null && j.clientId !== undefined && !id("clientId"))) return null;
      return { kind: "numerology_record", clientId: id("clientId"), recordId: id("recordId")!, ...base };
    case "hd_report":
      return id("reportId") ? { kind: "hd_report", reportId: id("reportId")!, ...base } : null;
    case "hd_relation_report":
      return id("reportId") ? { kind: "hd_relation_report", reportId: id("reportId")!, ...base } : null;
    case "astro_report":
      return id("analysisId") ? { kind: "astro_report", analysisId: id("analysisId")!, ...base } : null;
    case "media":
      return typeof j.table === "string" && j.table in MEDIA_SOURCES && id("rowId") ? { kind: "media", table: j.table, rowId: id("rowId")!, ...base } : null;
    case "file":
      return typeof j.source === "string" && j.source in FILE_SOURCES && id("rowId")
        ? { kind: "file", source: j.source as ArchiveFileSource, rowId: id("rowId")!, index: 0, ...base }
        : null;
    default:
      return null;
  }
}

const enc = (s: string) => encodeURIComponent(s);

export async function handleArchivePart(ctx: ArchiveCtx, body: unknown, now: Date = new Date()): Promise<HandlerResult> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const n = normalizeArchiveOptions(b.options);
  if (!n.ok) return json(400, { ok: false, error: n.error });
  const opts = n.options;
  const job = parseJob(b.job);
  if (!job) return json(400, { ok: false, error: "Geçersiz arşiv işi." });
  const denied = jobAllowed(job, opts);
  if (denied) return json(403, { ok: false, error: denied });

  try {
    if (job.kind === "data") {
      const state = decodeDataState(b.state);
      if (state === "invalid") return json(400, { ok: false, error: "Geçersiz parça durumu." });
      const r = await buildDataPart(ctx.db, ctx.tenantId, ctx.userId, job.module, opts, state, now);
      const headers: Record<string, string> = {
        "X-Archive-Next": r.next ? encodeDataState(r.next) : "",
        "X-Archive-Rows": String(r.rows),
        "X-Archive-Errors": enc(r.errors.join(" · ")),
      };
      if (!r.buffer) return json(200, { ok: true, empty: true, next: headers["X-Archive-Next"] || null, rows: 0, errors: r.errors });
      return { kind: "file", bytes: new Uint8Array(r.buffer), fileName: r.fileName, headers };
    }
    if (job.kind === "media") {
      const index = Number.isInteger(b.index) && (b.index as number) >= 0 ? (b.index as number) : 0;
      const row = await readMediaRow(ctx.db, ctx.tenantId, ctx.userId, job.table, job.rowId);
      if (row === "error") return json(500, { ok: false, error: "Kayıt okunamadı." });
      if (!row) return json(404, { ok: false, error: "Kayıt bulunamadı." });
      const def = MEDIA_SOURCES[job.table];
      const { items, rejected } = extractMedia(def, row, ctx.tenantId);
      const meta = { total: items.length, rejected };
      if (index >= items.length) return json(200, { ok: true, empty: true, ...meta });
      const item = items[index];
      const name = mediaFileName(def, row, item, index);
      if (item.kind === "data") {
        return {
          kind: "file",
          bytes: new Uint8Array(Buffer.from(item.base64, "base64")),
          fileName: name,
          contentType: item.mime,
          headers: { "X-Archive-Media-Total": String(items.length), "X-Archive-Media-Rejected": String(rejected) },
        };
      }
      const signed = await ctx.db.storage.from(item.bucket).createSignedUrl(item.path, SIGNED_MEDIA_TTL);
      if (signed.error || !signed.data?.signedUrl) return json(404, { ok: false, error: "Görsel depoda bulunamadı.", ...meta });
      return json(200, { ok: true, url: signed.data.signedUrl, file_name: name, expires_in: SIGNED_MEDIA_TTL, ...meta });
    }
    if (job.kind === "file") {
      const s = await signArchiveFile(ctx.db, ctx.tenantId, job.source, job.rowId, opts);
      if (!s.ok) return json(s.status, { ok: false, error: s.error });
      return json(200, { ok: true, url: s.url, file_name: s.fileName, expires_in: 60 });
    }
    const range =
      opts.dateFrom || opts.dateTo ? { start: opts.dateFrom ?? "1900-01-01", end: opts.dateTo ?? now.toISOString().slice(0, 10) } : null;
    const out =
      job.kind === "client_dossier"
        ? await buildClientDossier(ctx, job.clientId, opts.include.sensitive, range)
        : job.kind === "numerology_record"
          ? await buildNumerologyRecordReport(ctx, job.recordId, job.clientId)
          : job.kind === "hd_report"
            ? await buildHdReport(ctx, job.reportId)
            : job.kind === "hd_relation_report"
              ? await buildHdRelationReport(ctx, job.reportId)
              : await buildAstroReport(ctx, job.analysisId);
    if (!out.ok) return json(out.skipped ? 200 : out.status, { ok: false, skipped: !!out.skipped, error: out.error });
    return { kind: "file", bytes: out.bytes, fileName: out.fileName, headers: out.note ? { "X-Archive-Note": enc(out.note) } : {} };
  } catch (e) {
    if (e instanceof WordBudgetError) return json(413, { ok: false, error: "Bu parça tek Word belgesi için çok büyük (tek kayıt sınırı aşıldı); kayıt JSON yedeğinde eksiksizdir." });
    throw e;
  }
}

export async function handleArchiveAudit(ctx: ArchiveCtx, body: unknown): Promise<HandlerResult> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const archiveId = typeof b.archive_id === "string" ? b.archive_id : "";
  if (!UUID_RE.test(archiveId)) return json(400, { ok: false, error: "Geçersiz arşiv kimliği." });
  const result = sanitizeAuditResult(b.result);
  if (!result) return json(400, { ok: false, error: "Geçersiz sonuç." });
  const ok = await writeArchiveAudit(ctx.db, ctx.userId, archiveId, "finished", { result });
  return json(ok ? 200 : 202, { ok, recorded: ok });
}

/** Danışan seçici: ad / soyad araması (tenant içi, en fazla 50; üyelik kapısı yok). Arama metni güvenli karakterlere indirgenir. */
export async function handleArchiveClients(ctx: ArchiveCtx, body: unknown): Promise<HandlerResult> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const q = String(b.q ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} .'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  let query = ctx.db.from("clients").select("id, ad, soyad", { count: "exact" }).eq("tenant_id", ctx.tenantId);
  if (q) {
    const term = q.replace(/[%_]/g, "");
    query = query.or(`ad.ilike.%${term}%,soyad.ilike.%${term}%`);
  }
  const res = (await query.order("ad", { ascending: true }).limit(50)) as {
    data: Record<string, unknown>[] | null;
    error: unknown;
    count: number | null;
  };
  if (res.error) return json(500, { ok: false, error: "Danışanlar okunamadı." });
  return json(200, {
    ok: true,
    total: res.count ?? null,
    clients: (res.data ?? []).map((r) => ({
      id: String(r.id),
      name: [r.ad, r.soyad].filter((x) => typeof x === "string" && x.trim()).join(" ").trim() || "Adsız danışan",
    })),
  });
}

export function archiveCtxFrom(guard: {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
  profile?: Record<string, unknown>;
  is_demo_account: boolean;
}, userAgent: string | null, isAndroid: (ua: string | null) => boolean): ArchiveCtx {
  return {
    db: guard.db,
    tenantId: guard.tenantId,
    userId: guard.userId,
    profile: guard.profile,
    isDemo: guard.is_demo_account,
    isAndroid: isAndroid(userAgent),
  };
}
