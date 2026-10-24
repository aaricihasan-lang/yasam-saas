import { NextRequest } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { hasModulePermissionForProfile } from "@/lib/auth/modulePermissions";
import { serverErrorResponse } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import { Packer } from "docx";
import type { ReportChild } from "@/lib/docx/reportHelpers";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { readSnapshotsForDelivery } from "@/lib/yasam-hafizasi/client/snapshotStore";
import { resolveYhModuleScope } from "@/lib/yasam-hafizasi/moduleScope";
import { buildSnapshotSection } from "@/lib/yasam-hafizasi/client/snapshotReport";
import { fetchProfileImageBuffer } from "@/lib/clients/profileImageFetch";
import { loadHdReportLogo } from "@/lib/human-design/reporting/reportBrandAssets";
import { looseDayKey } from "@/lib/time/reportTime";
// Belge kurucusu SAF modül (FINAL HARDENING / PAKET WORD) — harness gerçek DOCX test eder.
import {
  CLIENT_REPORT_TABS,
  DEFAULT_FULL_SECTIONS,
  buildClientDateRangeReport,
  buildClientFullReport,
  buildClientSingleAnalysisReport,
  buildClientTabReport,
  filterClientDatasetByRange,
  normalizeReportSections,
  summarizeClientDataset,
  type ClientAnalysisRow,
  type ClientReportCtx,
  type ClientReportSection,
  type ClientReportTab,
} from "./clientReportBuilder";
import {
  fetchAnalysisImages,
  downloadAnalysisImage,
  isClientReportReadError,
  listClientHdReports,
  loadClientAnalysis,
  loadClientDataset,
  loadClientHdSection,
  loadClientNotes,
  loadClientRow,
  loadClientTable,
  type ClientReportTable,
} from "./clientReportData";
import { SAVED_NUMEROLOGY_COLUMNS, type SavedNumerologyRow } from "./numerologySavedSection";
import { isMissingClientIdColumn, listClientNumerologyRecords } from "@/lib/danisan/numerologyLink";
import { canSeeNumerologyFutureYears } from "@/app/numeroloji/utils/futureYearsAccess";
import { beslenmeHasData, loadAnamnezForReport, loadAnamnezOptions, loadBeslenmeForReport } from "./sensitiveData";
import type { AnamnezReportRow, BeslenmeReportInput } from "./sensitiveSections";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE = "clients/[id]/word-report";

// DYA-06 (SSRF): profil görseli güvenli indirme `@/lib/clients/profileImageFetch`.
// Analiz görseli okuma (PRIVATE bucket) + DY-02 hata yönetimi → ./clientReportData.

/** FA-26: iç notlar (ödev expert_note) yalnız açık opt-in ile: body.includeExpertNotes veya ?includeExpertNotes=1. */
function wantsExpertNotes(req: NextRequest, bodyValue: unknown): boolean {
  const truthy = (x: unknown) => x === true || x === 1 || x === "1" || x === "true";
  return truthy(bodyValue) || truthy(req.nextUrl?.searchParams?.get("includeExpertNotes"));
}

function docxResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store, private",
    },
  });
}

const notFound = () => Response.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404 });

const TAB_TABLE: Partial<Record<ClientReportTab, ClientReportTable>> = {
  randevular: "appointments",
  taslar: "client_stones",
  seanslar: "client_sessions",
  ucretlendirme: "client_charges",
  odevler: "client_homeworks",
  analizler: "client_analyses",
};

/**
 * DY-008: Tam Rapor → Ücretlendirme HARİÇ tüm bölümler (`includeCharges: true` ile eklenir).
 * Özel Rapor → yalnız istemcinin seçtiği bölümler (Ücretlendirme yalnız açıkça seçilirse).
 */
function resolveSections(body: Record<string, unknown>): { sections: ClientReportSection[]; variant: "full" | "custom" } {
  if (body.reportKind === "custom") {
    return { sections: normalizeReportSections(body.sections) ?? [...DEFAULT_FULL_SECTIONS], variant: "custom" };
  }
  const sections = [...DEFAULT_FULL_SECTIONS];
  if (body.includeCharges === true) sections.push("ucretlendirme");
  return { sections, variant: "full" };
}

// ─── GET: Özel Rapor seçenekleri (salt-okunur) ───────────────────────────────

/**
 * GET /api/clients/[id]/word-report — rapor penceresi için bölüm başına kayıt sayıları,
 * danışana BAĞLI kayıtlı HD profesyonel raporları (izin varsa) ve Numeroloji bağı durumu.
 * Yazma YOK; tenant guard'dan.
 *
 * Word yetki-görünürlük kuralı (owner kararı 24.10.2026): modül izni YOKSA o modülün seçeneği,
 * kayıt listesi ve seçilebilirlik bilgisi DÖNMEZ (veri hiç okunmaz); pencere seçeneği tamamen gizler.
 * Human Design → human_design · Numeroloji → numerology · Beslenme özeti → beslenme. Diğer bölümler
 * (notlar, seanslar, randevular, taşlar, ödevler, analizler, yolculuk, ücretlendirme, anamnez)
 * Danışan Yolculuğu (clients) kapsamındadır; o kapı route'un kendisidir.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id: clientId } = await params;
  if (!UUID_RE.test(clientId)) return notFound();

  try {
    const data = await loadClientDataset(db, tenantId, clientId);
    if (!data) return notFound();
    const hdPermitted = hasModulePermissionForProfile(guard.profile, "human_design");
    const hdReports = hdPermitted ? await listClientHdReports(db, tenantId, clientId) : [];
    // DY-005/006: yalnız bu danışana uzman tarafından BAĞLANMIŞ kayıtlı analizler; Numeroloji izni
    // yoksa liste boş. Bağ kolonu yoksa (migration öncesi) özellik kapalı, rapor çalışmaya devam eder.
    const numPermitted = hasModulePermissionForProfile(guard.profile, "numerology");
    let numRecords: Awaited<ReturnType<typeof listClientNumerologyRecords>> | null = null;
    if (numPermitted) numRecords = await listClientNumerologyRecords(db, tenantId, clientId);
    if (numRecords && !numRecords.ok && numRecords.status !== 503) throw new Error(numRecords.code);
    // BUG-005: Anamnez / Beslenme yalnız AÇIK seçimle eklenir; burada yalnız seçenek durumu döner.
    const besPermitted = hasModulePermissionForProfile(guard.profile, "beslenme");
    const [anamnez, beslenmeAvailable] = await Promise.all([
      loadAnamnezOptions(db, tenantId, clientId),
      besPermitted ? beslenmeHasData(db, tenantId, clientId) : Promise.resolve(false),
    ]);
    const counts = summarizeClientDataset(data, { analysisImageFlags: data.analyses.map((a) => !!a.image_url?.trim()) });
    // H-10 sonrası Numeroloji bölümü YALNIZ seçilen bağlı kayıtlı analizden gelir → seçilebilirlik = bağlı kayıt
    // sayısı (doğum tarihi değil). İzin yoksa 0.
    counts.numeroloji = numRecords?.ok ? numRecords.rows.length : 0;
    return Response.json({
      ok: true,
      counts,
      humanDesign: { permitted: hdPermitted, reports: hdReports },
      // Otomatik isim/doğum tarihi eşleştirmesi YOK: liste yalnız açık "Danışana Bağla" bağlarından gelir.
      numerology: {
        permitted: numPermitted,
        savedAnalysisLink: !!numRecords?.ok,
        records: numRecords?.ok ? numRecords.rows : [],
      },
      anamnez,
      beslenme: { permitted: besPermitted, hasData: beslenmeAvailable },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return serverErrorResponse({ route: ROUTE, action: isClientReportReadError(e) ? `GET-read-${e.table}` : "GET", tenantId, cause: isClientReportReadError(e) ? e.cause : e });
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {

  // Kanonik oturum + modül kapısı: x-user-id + x-session-token + token↔user binding.
  // tenant_id SUNUCUDA guard'dan gelir; body'deki tenantId/userId'ye ASLA güvenilmez.
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  // Yaşam Hafızası teslim eki: aktif modül kapsamı GÜNCEL module_permissions'tan (Üye Yönetimi).
  const yhScope = resolveYhModuleScope(guard.profile?.role, guard.profile?.module_permissions);

  const { id: clientId } = await params;

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }
  const body = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

  if (!UUID_RE.test(clientId)) return notFound();

  const exportMode = typeof body.exportMode === "string" ? body.exportMode : "full";
  const tabName = typeof body.tabName === "string" ? body.tabName : undefined;
  const dateRange = body.dateRange as { start?: string; end?: string } | undefined;

  // DEMO VİTRİN (owner kararı 2026-10-03): Word raporu SALT-OKUNUR bir çıktıdır — yalnız mevcut
  // danışan verisini okur, DB'ye yazmaz, ücretli/harici servis çağırmaz → demo hesapta da üretilir.

  const ctx: ClientReportCtx = {
    expertName: expertDisplayName(guard.profile),
    includeExpertNotes: wantsExpertNotes(req, body.includeExpertNotes),
    logo: await loadHdReportLogo(),
  };

  const fail = (e: unknown, action: string) =>
    serverErrorResponse({
      route: ROUTE,
      action: isClientReportReadError(e) ? `${action}-read-${e.table}` : action,
      tenantId,
      cause: isClientReportReadError(e) ? e.cause : e,
      usage: { guard, req, module: "clients", failedAction: "report_generated", subEntity: "client" },
    });

  // ─── Sekme modu ───────────────────────────────────────────────────────────
  if (exportMode === "tab" && tabName && (CLIENT_REPORT_TABS as readonly string[]).includes(tabName)) {
    const tab = tabName as ClientReportTab;
    try {
      const table = TAB_TABLE[tab];
      const [client, notes, rows] = await Promise.all([
        loadClientRow(db, tenantId, clientId),
        loadClientNotes(db, tenantId, clientId),
        table ? loadClientTable<Record<string, unknown>>(db, tenantId, clientId, table) : Promise.resolve([]),
      ]);
      if (!client) return notFound();
      const analysisImages = tab === "analizler"
        ? await fetchAnalysisImages(db, tenantId, clientId, rows as unknown as ClientAnalysisRow[])
        : [];
      const { doc, filename } = buildClientTabReport({ tab, client, notes, rows, analysisImages }, ctx);
      const buf = await Packer.toBuffer(doc);
      // resourceId yalnız dedup içindir (HMAC'lanır): rapor türü başına ayrı kova.
      await trackUsage(guard, req, { module: "clients", action: "report_generated", subEntity: "client", resourceId: `${clientId}:tab:${tab}` });
      return docxResponse(buf, filename);
    } catch (e) {
      return fail(e, "POST-tab");
    }
  }

  // ─── Tek analiz modu (analiz modalindeki "Word Al") ──────────────────────────
  if (exportMode === "single-analysis") {
    const analysisId = body.analysisId;
    if (!analysisId || typeof analysisId !== "string")
      return Response.json({ ok: false, error: "Analiz kimliği gerekli." }, { status: 400 });
    if (!UUID_RE.test(analysisId))
      return Response.json({ ok: false, error: "Analiz kaydı bulunamadı." }, { status: 404 });
    try {
      const [client, notes, an] = await Promise.all([
        loadClientRow(db, tenantId, clientId),
        loadClientNotes(db, tenantId, clientId),
        loadClientAnalysis(db, tenantId, clientId, analysisId),
      ]);
      if (!client) return notFound();
      if (!an) return Response.json({ ok: false, error: "Analiz kaydı bulunamadı." }, { status: 404 });
      const imageBuf = an.image_url?.trim() ? await downloadAnalysisImage(db, tenantId, clientId, an.id) : null;
      const { doc, filename } = buildClientSingleAnalysisReport({ client, notes, analysis: an, imageBuf }, ctx);
      const buf = await Packer.toBuffer(doc);
      // Rapor konusu tek analiz → subEntity "analysis".
      await trackUsage(guard, req, { module: "clients", action: "report_generated", subEntity: "analysis", resourceId: an.id });
      return docxResponse(buf, filename);
    } catch (e) {
      return fail(e, "POST-single");
    }
  }

  const { sections, variant } = resolveSections(body);

  // ─── Tarih aralığı modu ──────────────────────────────────────────────────────
  if (exportMode === "date-range" && dateRange?.start && dateRange?.end) {
    // Sınırlar takvim günü ("YYYY-MM-DD"); ISO an gelirse yerel güne çevrilir (kaydırma yok).
    const drStart = looseDayKey(dateRange.start) || String(dateRange.start).slice(0, 10);
    const drEnd = looseDayKey(dateRange.end) || String(dateRange.end).slice(0, 10);
    if (drStart > drEnd)
      return Response.json({ ok: false, error: "Başlangıç tarihi bitiş tarihinden sonra olamaz." }, { status: 400 });
    try {
      const all = await loadClientDataset(db, tenantId, clientId);
      if (!all) return notFound();
      const data = filterClientDatasetByRange(all, drStart, drEnd);
      const profileImg = all.client.profile_image_url?.trim() ? await fetchProfileImageBuffer(all.client.profile_image_url) : null;
      const analysisImages = await fetchAnalysisImages(db, tenantId, clientId, data.analyses);
      const { doc, filename } = buildClientDateRangeReport({ data, drStart, drEnd, profileImg, analysisImages }, { ...ctx, sections, variant });
      const buf = await Packer.toBuffer(doc);
      await trackUsage(guard, req, { module: "clients", action: "report_generated", subEntity: "client", resourceId: `${clientId}:range` });
      return docxResponse(buf, filename);
    } catch (e) {
      return fail(e, "POST-range");
    }
  }

  // ─── Tam / Özel rapor ────────────────────────────────────────────────────────
  const hdReportId = typeof body.hdReportId === "string" && UUID_RE.test(body.hdReportId) ? body.hdReportId : null;
  const selectionGroupId = body.selectionGroupId;
  // DY-005/006: uzmanın seçtiği, bu danışana BAĞLI kayıtlı Numeroloji analizi (opsiyonel). Numeroloji
  // modül izni gerekir; kayıt yalnız bu tenant + bu danışan bağıyla okunur; motor çağrılmaz.
  const numerologyRecordIdRaw = body.numerologyRecordId;
  if (numerologyRecordIdRaw !== undefined && numerologyRecordIdRaw !== null &&
      (typeof numerologyRecordIdRaw !== "string" || !UUID_RE.test(numerologyRecordIdRaw)))
    return Response.json({ ok: false, error: "Geçersiz Numeroloji kaydı." }, { status: 400 });
  const numerologyRecordId = typeof numerologyRecordIdRaw === "string" ? numerologyRecordIdRaw : null;
  // BUG-005: hassas bölümler YALNIZ açık `true` ile (Tam Rapor dahil varsayılan KAPALI).
  const includeAnamnez = body.includeAnamnez === true;
  const includeBeslenme = body.includeBeslenme === true;
  const anamnezIdRaw = body.anamnezId;
  if (includeAnamnez && anamnezIdRaw !== undefined && anamnezIdRaw !== null && (typeof anamnezIdRaw !== "string" || !UUID_RE.test(anamnezIdRaw)))
    return Response.json({ ok: false, error: "Geçersiz anamnez kaydı." }, { status: 400 });
  const anamnezId = includeAnamnez && typeof anamnezIdRaw === "string" ? anamnezIdRaw : null;
  // Word yetki kuralı (owner 24.10.2026): yetkisiz modülün verisi AÇIKÇA istenirse 403 (sessizce yok sayılmaz).
  // Tam Rapor'un olağan akışında bu alanlar gönderilmez → yetkisiz bölümler zaten eklenmez, rapor engellenmez.
  // İzin her istekte GÜNCEL profilden okunur → sonradan kapatılan izin açık oturumda da hemen geçerlidir.
  if (numerologyRecordId && !hasModulePermissionForProfile(guard.profile, "numerology"))
    return Response.json({ ok: false, error: "Numeroloji kaydını rapora eklemek için Numeroloji modülü yetkisi gerekir." }, { status: 403 });
  if (hdReportId && !hasModulePermissionForProfile(guard.profile, "human_design"))
    return Response.json({ ok: false, error: "Human Design raporunu eklemek için Human Design modülü yetkisi gerekir." }, { status: 403 });
  if (includeBeslenme && !hasModulePermissionForProfile(guard.profile, "beslenme"))
    return Response.json({ ok: false, error: "Beslenme özetini eklemek için Beslenme modülü yetkisi gerekir." }, { status: 403 });
  if (typeof selectionGroupId === "string" && UUID_RE.test(selectionGroupId) && !hasModulePermissionForProfile(guard.profile, "yasam_hafizasi"))
    return Response.json({ ok: false, error: "Yaşam Hafızası seçimlerini eklemek için Yaşam Hafızası modülü yetkisi gerekir." }, { status: 403 });
  try {
    const data = await loadClientDataset(db, tenantId, clientId);
    if (!data) return notFound();

    const profileImg = data.client.profile_image_url?.trim() ? await fetchProfileImageBuffer(data.client.profile_image_url) : null;
    const analysisImages = await fetchAnalysisImages(db, tenantId, clientId, data.analyses);

    // Human Design: yalnız HD modül izni varsa ve danışana BAĞLI kayıtlı profesyonel rapor varsa.
    // DONMUŞ snapshot okunur — HD motoru/hesaplama ÇAĞRILMAZ.
    let hd: { children: ReportChild[]; generatedAt: string } | null = null;
    if (sections.includes("humanDesign") && hasModulePermissionForProfile(guard.profile, "human_design")) {
      hd = await loadClientHdSection(db, tenantId, clientId, {
        reportId: hdReportId,
        systemReadingPermitted: hasModulePermissionForProfile(guard.profile, "hd_system_reading"),
      });
      if (hdReportId && !hd)
        return Response.json({ ok: false, error: "Seçilen Human Design raporu bu danışana bağlı değil." }, { status: 404 });
    }

    let numerologyRecord: SavedNumerologyRow | null = null;
    if (numerologyRecordId && sections.includes("numeroloji")) {
      const { data: nr, error: nrErr } = await db.from("numerology_records").select(SAVED_NUMEROLOGY_COLUMNS)
        .eq("tenant_id", tenantId).eq("client_id", clientId).eq("id", numerologyRecordId).maybeSingle();
      if (nrErr && isMissingClientIdColumn(nrErr))
        return Response.json({ ok: false, error: "Numeroloji danışan bağlantısı şu anda kullanılamıyor." }, { status: 503 });
      if (nrErr) throw nrErr;
      if (!nr) return Response.json({ ok: false, error: "Seçilen Numeroloji kaydı bu danışana bağlı değil." }, { status: 404 });
      numerologyRecord = nr as unknown as SavedNumerologyRow;
    }

    let anamnez: AnamnezReportRow | null = null;
    if (includeAnamnez) {
      const a = await loadAnamnezForReport(db, tenantId, clientId, anamnezId);
      if (!a.ok) return Response.json({ ok: false, error: a.error }, { status: a.status });
      anamnez = a.row;
    }
    const beslenme: BeslenmeReportInput | null = includeBeslenme ? await loadBeslenmeForReport(db, tenantId, clientId) : null;

    // ── Yaşam Hafızası Seçimleri (BF-14 P2; OPSİYONEL)
    // selectionGroupId yoksa VEYA snapshot yoksa: bölüm eklenmez.
    let snapshotSection: ((n: number) => ReportChild[]) | undefined;
    if (typeof selectionGroupId === "string" && UUID_RE.test(selectionGroupId)) {
      try {
        const snaps = await readSnapshotsForDelivery(db, {
          tenantId,
          clientId,
          targetKind: "report",
          targetRef: null,
          selectionGroup: selectionGroupId,
          scope: yhScope,
        });
        if (snaps.length > 0) snapshotSection = (n) => buildSnapshotSection(snaps, { headingNumber: n });
      } catch {
        /* regresyon güvenli: teslim seçimi eklenemezse mevcut rapor korunur */
      }
    }

    const { doc, filename } = buildClientFullReport({
      data, profileImg, analysisImages, hd, snapshotSection, numerologyRecord, anamnez, beslenme,
      numerologyFutureYears: numerologyRecord ? canSeeNumerologyFutureYears(guard.profile) : false,
    }, { ...ctx, sections, variant });
    const buf = await Packer.toBuffer(doc);
    await trackUsage(guard, req, { module: "clients", action: "report_generated", subEntity: "client", resourceId: `${clientId}:${variant}` });
    return docxResponse(buf, filename);
  } catch (e) {
    return fail(e, "POST-full");
  }
}
