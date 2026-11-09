/**
 * lib/archive/server/reports.ts — Premium Word Arşivi: HAZIR raporlar (YALNIZ SUNUCU).
 *
 * Her rapor, modülün MEVCUT Word üreticisiyle ve YALNIZ kayıtlı / donmuş veriden üretilir:
 *   - Danışan dosyası  → Danışan Yolculuğu Tam Rapor üreticisi (buildClientFullReport) — rota ile aynı veri yükleyicileri.
 *   - Numeroloji kaydı → aynı üretici, yalnız "Numeroloji" bölümü + kayıtlı analiz snapshot'ı (motor çağrısı YOK).
 *   - HD profesyonel   → donmuş snapshot (getCanonicalReportForDownload) → renderHdReportV2Buffer / renderHdReportBuffer.
 *   - HD İlişki        → donmuş rapor snapshot'ı → renderRelationReportBuffer (sağlayıcı çağrısı YOK).
 *   - Gökyüzü Atlası   → kayıtlı analiz snapshot'ı → buildAnalysisReport (0 sağlayıcı isteği, yeni hesap yok).
 * Hiçbir yol hesap motoru, Roxy veya dış API çağırmaz; DB'ye yazmaz.
 *
 * İzinler mevcut indirme uçlarıyla AYNI içerik kurallarını izler (HD Sistem Yorumu / Atlas sağlayıcı yorumu GÜNCEL
 * yetkiye göre; HD Word'ü Android'de üretilmez). Üyelik süresi kontrol EDİLMEZ (kendi verisini arşivleme hakkı).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { Packer } from "docx";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { hasModulePermissionForProfile, type ModulePermissionKey } from "@/lib/auth/modulePermissions";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { fetchProfileImageBuffer } from "@/lib/clients/profileImageFetch";
import { listClientNumerologyRecords } from "@/lib/danisan/numerologyLink";
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";
import {
  fetchAnalysisImages,
  loadClientCombinationsForReport,
  loadClientDataset,
  loadClientHdSection,
} from "@/app/api/clients/[id]/word-report/clientReportData";
import {
  buildClientDateRangeReport,
  buildClientFullReport,
  CLIENT_REPORT_SECTIONS,
  filterClientDatasetByRange,
  countClientReportSections,
  DEFAULT_FULL_SECTIONS,
  type ClientReportCtx,
  type ClientReportSection,
} from "@/app/api/clients/[id]/word-report/clientReportBuilder";
import { SAVED_NUMEROLOGY_COLUMNS, type SavedNumerologyRow } from "@/app/api/clients/[id]/word-report/numerologySavedSection";
import { loadAnamnezForReport, loadBeslenmeForReport } from "@/app/api/clients/[id]/word-report/sensitiveData";
import { loadHdReportLogo } from "@/lib/human-design/reporting/reportBrandAssets";
import { getCanonicalReportForDownload } from "@/lib/human-design/api/reportPersistence";
import { isOwnedChartImagePath, isOwnedReportSnapshotPath } from "@/lib/human-design/api/chartImagePath";
import { fetchStorageImageBuffer, getImgDimensions } from "@/lib/docx/reportHelpers";
import { applyDownloadPermissions, isHdReportSnapshotV2 } from "@/lib/human-design/reporting/reportSnapshotV2";
import { renderHdReportV2Buffer } from "@/lib/human-design/reporting/wordReportV2";
import { hdReportFilename, renderHdReportBuffer } from "@/lib/human-design/reporting/wordReport";
import { getRelationReportSnapshot } from "@/lib/human-design/relations/relationExtras";
import { relationReportFilename, renderRelationReportBuffer } from "@/lib/human-design/relations/relationReport";
import { renderRelationImage } from "@/lib/human-design/relations/relationImages";
import { buildAnalysisReport } from "@/lib/astrology/report/service";
import { resolveAstrologyEntitlements } from "@/lib/astrology/access/entitlements";
import { readAstrologyTechniqueGrants } from "@/lib/astrology/access/ownerGate";
import { isAstrologyModuleEnabled } from "@/lib/astrology/config";
import { reportFileDate, zonedDayKey } from "@/lib/time/reportTime";

assertServerOnly("lib/archive/server/reports");

export type ArchiveCtx = {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
  profile: Record<string, unknown> | undefined;
  isDemo: boolean;
  isAndroid: boolean;
};

export type ReportOutcome =
  | { ok: true; bytes: Uint8Array; fileName: string; note?: string }
  | { ok: false; status: number; error: string; skipped?: boolean };

const HD_BUCKET = "hd-chart-images";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ANDROID_HD = "Human Design Word raporları Android cihazda üretilmez (HD kuralı); bilgisayardan arşiv alın.";

const perm = (ctx: ArchiveCtx, key: ModulePermissionKey): boolean => hasModulePermissionForProfile(ctx.profile, key);
const fail = (status: number, error: string, skipped = false): ReportOutcome => ({ ok: false, status, error, skipped });

function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * Danışan dosyası: Danışan Yolculuğu Tam Rapor (rota POST "full" akışı ile aynı yükleyiciler). Tarih aralığı verilirse
 * DY'nin kendi tarih aralığı raporu (rota "date-range" akışı) üretilir.
 */
export async function buildClientDossier(
  ctx: ArchiveCtx,
  clientId: string,
  sensitive: boolean,
  range: { start: string; end: string } | null = null,
): Promise<ReportOutcome> {
  if (!isUuid(clientId)) return fail(400, "Geçersiz danışan.");
  const { db, tenantId } = ctx;
  const data = await loadClientDataset(db, tenantId, clientId);
  if (!data) return fail(404, "Danışan bulunamadı.");
  const profileImg = data.client.profile_image_url?.trim() ? await fetchProfileImageBuffer(data.client.profile_image_url) : null;
  const sectionsBase: readonly ClientReportSection[] = sensitive ? CLIENT_REPORT_SECTIONS : DEFAULT_FULL_SECTIONS;
  if (range) {
    const ranged = filterClientDatasetByRange(data, range.start, range.end);
    const images = await fetchAnalysisImages(db, tenantId, clientId, ranged.analyses);
    const r = buildClientDateRangeReport(
      { data: ranged, drStart: range.start, drEnd: range.end, profileImg, analysisImages: images },
      { expertName: expertDisplayName(ctx.profile), includeExpertNotes: sensitive, logo: await loadHdReportLogo(), sections: sectionsBase, variant: "full" },
    );
    if (r.empty) return fail(204, "Seçilen tarih aralığında danışan dosyasına girecek kayıt yok.", true);
    return { ok: true, bytes: new Uint8Array(await Packer.toBuffer(r.doc)), fileName: r.filename };
  }
  const analysisImages = await fetchAnalysisImages(db, tenantId, clientId, data.analyses);
  const hd = perm(ctx, "human_design")
    ? await loadClientHdSection(db, tenantId, clientId, { reportId: null, systemReadingPermitted: perm(ctx, "hd_system_reading") })
    : null;
  let numerologyRecord: SavedNumerologyRow | null = null;
  if (perm(ctx, "numerology")) {
    const list = await listClientNumerologyRecords(db, tenantId, clientId);
    const latest = list.ok ? list.rows[0] : undefined;
    if (latest) {
      const { data: nr } = await db.from("numerology_records").select(SAVED_NUMEROLOGY_COLUMNS).eq("tenant_id", tenantId).eq("client_id", clientId).eq("id", latest.id).maybeSingle();
      numerologyRecord = (nr as unknown as SavedNumerologyRow | null) ?? null;
    }
  }
  let anamnez = null;
  let note: string | undefined;
  if (sensitive) {
    const a = await loadAnamnezForReport(db, tenantId, clientId, null);
    if (a.ok) anamnez = a.row;
    else if (a.status === 409) note = "Anamnez eklenmedi: danışanın açık rıza kaydı yok.";
  }
  const beslenme = sensitive && perm(ctx, "beslenme") ? await loadBeslenmeForReport(db, tenantId, clientId) : null;
  const combinations = await loadClientCombinationsForReport(db, tenantId, clientId);
  const sections = sectionsBase;
  const rctx: ClientReportCtx = {
    expertName: expertDisplayName(ctx.profile),
    includeExpertNotes: sensitive,
    logo: await loadHdReportLogo(),
    sections,
    variant: "full",
  };
  const input = {
    data,
    profileImg,
    analysisImages,
    hd,
    numerologyRecord,
    anamnez,
    beslenme,
    combinations,
    numerologyFutureYears: numerologyRecord ? canSeeNumerologyFutureYears(ctx.profile) : false,
  };
  if (countClientReportSections(input, rctx) === 0) return fail(204, "Danışan dosyasına girecek kayıt yok.", true);
  const { doc, filename } = buildClientFullReport(input, rctx);
  return { ok: true, bytes: new Uint8Array(await Packer.toBuffer(doc)), fileName: filename, note };
}

/** Danışana bağlı tek bir kayıtlı Numeroloji analizi (yalnız Numeroloji bölümü; kayıtlı snapshot). */
export async function buildNumerologyRecordReport(ctx: ArchiveCtx, clientId: string, recordId: string): Promise<ReportOutcome> {
  if (!isUuid(clientId) || !isUuid(recordId)) return fail(400, "Geçersiz kayıt.");
  if (!perm(ctx, "numerology")) return fail(403, "Numeroloji modülü yetkisi yok.", true);
  const { db, tenantId } = ctx;
  const { data: nr, error } = await db.from("numerology_records").select(SAVED_NUMEROLOGY_COLUMNS).eq("tenant_id", tenantId).eq("client_id", clientId).eq("id", recordId).maybeSingle();
  if (error) return fail(500, "Numeroloji kaydı okunamadı.");
  if (!nr) return fail(404, "Numeroloji kaydı bulunamadı.");
  const data = await loadClientDataset(db, tenantId, clientId);
  if (!data) return fail(404, "Danışan bulunamadı.");
  const rctx: ClientReportCtx = { expertName: expertDisplayName(ctx.profile), logo: await loadHdReportLogo(), sections: ["numeroloji"], variant: "custom" };
  const input = {
    data,
    profileImg: null,
    numerologyRecord: nr as unknown as SavedNumerologyRow,
    numerologyFutureYears: canSeeNumerologyFutureYears(ctx.profile),
  };
  const { doc } = buildClientFullReport(input, rctx);
  const row = nr as unknown as SavedNumerologyRow;
  const who = [row.name, row.surname].filter(Boolean).join(" ").trim() || "Numeroloji";
  const day = zonedDayKey(row.created_at ?? "") || reportFileDate();
  return { ok: true, bytes: new Uint8Array(await Packer.toBuffer(doc)), fileName: `Numeroloji — ${who} — ${day}.docx` };
}

/** HD profesyonel raporu (donmuş snapshot) — /api/hd/reports/professional/download ile aynı kurallar. */
export async function buildHdReport(ctx: ArchiveCtx, reportId: string): Promise<ReportOutcome> {
  if (!isUuid(reportId)) return fail(400, "Geçersiz rapor.");
  if (ctx.isAndroid) return fail(403, ANDROID_HD, true);
  if (!perm(ctx, "human_design")) return fail(403, "Human Design modülü yetkisi yok.", true);
  const read = await getCanonicalReportForDownload(ctx.db, ctx.tenantId, reportId);
  if (!read.data) return fail(read.status, read.error ?? "Rapor okunamadı.");
  const { snapshot, clientId } = read.data;
  let chartImage: Buffer | null = null;
  const imgPath = snapshot.chartImage?.storagePath ?? null;
  const imgOwned =
    !!imgPath && (isOwnedReportSnapshotPath(imgPath, ctx.tenantId) || (!!clientId && isOwnedChartImagePath(imgPath, ctx.tenantId, clientId)));
  if (imgPath && imgOwned) {
    const buf = await fetchStorageImageBuffer(ctx.db, HD_BUCKET, imgPath);
    if (buf && getImgDimensions(buf)) chartImage = buf;
  }
  let buffer: Buffer;
  let note: string | undefined;
  if (isHdReportSnapshotV2(snapshot)) {
    const view = applyDownloadPermissions(snapshot, perm(ctx, "hd_system_reading"));
    if (view.systemReadingRedacted) note = "Sistem Yorumu bölümü güncel yetki olmadığı için bu kopyadan çıkarıldı (kayıtlı rapor değişmedi).";
    buffer = await renderHdReportV2Buffer(view.snapshot, {
      bodygraphImage: chartImage,
      logo: await loadHdReportLogo(),
      expertName: null,
      systemReadingRedacted: view.systemReadingRedacted,
    });
  } else {
    buffer = await renderHdReportBuffer(snapshot, { chartImage, expertName: null });
  }
  const dateSlug = zonedDayKey(snapshot.generatedAt) || reportFileDate();
  return { ok: true, bytes: new Uint8Array(buffer), fileName: hdReportFilename(snapshot.client.name, dateSlug), note };
}

/** HD İlişki / grup raporu (donmuş snapshot) — /api/hd/relations/reports/:id/download ile aynı. */
export async function buildHdRelationReport(ctx: ArchiveCtx, reportId: string): Promise<ReportOutcome> {
  if (!isUuid(reportId)) return fail(400, "Geçersiz rapor.");
  if (ctx.isAndroid) return fail(403, ANDROID_HD, true);
  if (!perm(ctx, "human_design")) return fail(403, "Human Design modülü yetkisi yok.", true);
  const r = await getRelationReportSnapshot({ db: ctx.db, tenantId: ctx.tenantId, userId: ctx.userId, isDemo: ctx.isDemo }, reportId);
  if (!r.body.ok) return fail(r.status, "error" in r.body ? String(r.body.error) : "Rapor okunamadı.");
  const s = r.body.snapshot;
  const logo = await loadHdReportLogo();
  const image = s.image.status !== "ok" ? null : s.image.png ? Buffer.from(s.image.png, "base64") : (renderRelationImage(s.analysis, 1100, logo)?.png ?? null);
  const buffer = await renderRelationReportBuffer(s, { image, logo });
  return { ok: true, bytes: new Uint8Array(buffer), fileName: relationReportFilename(s.analysis, s.generatedAt) };
}

/** Gökyüzü Atlası kayıtlı analiz raporu (snapshot; 0 sağlayıcı isteği) — uzman sahipliği getAnalysis içinde. */
export async function buildAstroReport(ctx: ArchiveCtx, analysisId: string): Promise<ReportOutcome> {
  if (!isUuid(analysisId)) return fail(400, "Geçersiz analiz.");
  if (!isAstrologyModuleEnabled()) return fail(404, "Gökyüzü Atlası bu ortamda kapalı.", true);
  const role = String(ctx.profile?.role ?? "").trim().toLowerCase();
  const flags = ctx.profile?.module_permissions;
  const entitlements = resolveAstrologyEntitlements({
    isOwner: false,
    role,
    flags: flags && typeof flags === "object" && !Array.isArray(flags) ? (flags as Record<string, unknown>) : null,
    techniqueGrants: await readAstrologyTechniqueGrants(ctx.db, ctx.userId),
  });
  if (!entitlements.module) return fail(403, "Gökyüzü Atlası modülü yetkisi yok.", true);
  const r = await buildAnalysisReport({ db: ctx.db, tenantId: ctx.tenantId, userId: ctx.userId, entitlements }, analysisId, "docx", false);
  if (!r.ok) return fail(r.status, String((r.body as { error?: unknown }).error ?? "Analiz raporu üretilemedi."));
  return { ok: true, bytes: r.bytes, fileName: r.filename };
}
