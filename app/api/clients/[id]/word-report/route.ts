import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { Packer } from "docx";
import type { ReportChild } from "@/lib/docx/reportHelpers";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { readSnapshotsForDelivery } from "@/lib/yasam-hafizasi/client/snapshotStore";
import { buildSnapshotSection } from "@/lib/yasam-hafizasi/client/snapshotReport";
import { fetchProfileImageBuffer } from "@/lib/clients/profileImageFetch";
import { looseDayKey } from "@/lib/time/reportTime";
// Belge kurucusu SAF modüle taşındı (FINAL HARDENING / PAKET WORD) — harness gerçek DOCX test eder.
import {
  CLIENT_REPORT_TABS,
  buildClientDateRangeReport,
  buildClientFullReport,
  buildClientSingleAnalysisReport,
  buildClientTabReport,
  filterClientDatasetByRange,
  type AppointmentRow,
  type ClientAnalysisRow,
  type ClientChargeRow,
  type ClientDataset,
  type ClientHomeworkRow,
  type ClientNoteRow,
  type ClientReportCtx,
  type ClientReportTab,
  type ClientRow,
  type ClientSessionRow,
  type ClientStoneRow,
} from "./clientReportBuilder";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DYA-06 (SSRF): profil görseli güvenli indirme `@/lib/clients/profileImageFetch`
// (fetchProfileImageBuffer) modülüne taşındı — trusted-host + redirect:"manual" +
// byte cap + timeout + magic-byte format doğrulaması. Ortak reportHelpers DEĞİŞMEDİ.

// ─── Analiz görseli okuma (PRIVATE bucket, service_role) ─────────────────────
// Görsel PRIVATE bucket'ta tutulur; okuma yalnız server-side service_role ile,
// DETERMINISTIK object path üzerinden yapılır: {tenantId}/{clientId}/{analysisId}.png.
// image_url alanı yalnız "görsel var mı" göstergesi olarak kullanılır (path/URL fark
// etmez) → eski (absolute public URL) ve yeni (object path) satırlar TEK yoldan okunur,
// public URL'ye bağımlılık kalmaz. Bucket public de olsa private de olsa çalışır.
const ANALYSIS_IMAGE_BUCKET = "client-analysis-images";

async function downloadAnalysisImage(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  analysisId: string,
): Promise<Buffer | null> {
  try {
    const path = `${tenantId}/${clientId}/${analysisId}.png`;
    const { data, error } = await db.storage.from(ANALYSIS_IMAGE_BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/** analyses sırasıyla hizalı (Buffer|null)[]; yalnız image_url dolu kayıtlar indirilir. */
async function fetchAnalysisImages(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
  analyses: ClientAnalysisRow[],
): Promise<(Buffer | null)[]> {
  const BATCH = 15;
  const out: (Buffer | null)[] = new Array(analyses.length).fill(null);
  for (let i = 0; i < analyses.length; i += BATCH) {
    const slice = analyses.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      slice.map((a) =>
        a.image_url?.trim()
          ? downloadAnalysisImage(db, tenantId, clientId, a.id)
          : Promise.resolve(null),
      ),
    );
    settled.forEach((r, j) => {
      out[i + j] = r.status === "fulfilled" ? r.value : null;
    });
  }
  return out;
}

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
    },
  });
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;

  // Kanonik oturum + modül kapısı: x-user-id + x-session-token + token↔user binding.
  // tenant_id SUNUCUDA guard'dan gelir; body'deki tenantId/userId'ye ASLA güvenilmez.
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const { id: clientId } = await params;

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "full", tabName, dateRange, selectionGroupId, includeExpertNotes } = body as {
    exportMode?: string;
    tabName?: string;
    dateRange?: { start: string; end: string };
    selectionGroupId?: string;
    includeExpertNotes?: unknown;
  };

  // Demo hesap: tüm export işlemleri sunucu seviyesinde engellenir
  if (is_demo_account)
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  // Rapor bağlamı: Hazırlayan (profil adı) + iç not opt-in. Tarihler builder'da Europe/Istanbul.
  const ctx: ClientReportCtx = {
    expertName: expertDisplayName(guard.profile),
    includeExpertNotes: wantsExpertNotes(req, includeExpertNotes),
  };

  // ─── Tab mode early-return ────────────────────────────────────────────────
  if (exportMode === "tab" && tabName && (CLIENT_REPORT_TABS as readonly string[]).includes(tabName)) {
    const tab = tabName as ClientReportTab;

    const [cliRes, noteRes] = await Promise.all([
      db.from("clients").select("*").eq("id", clientId).eq("tenant_id", tenantId).single(),
      db.from("client_notes").select("*").eq("client_id", clientId).maybeSingle(),
    ]);

    if (cliRes.error || !cliRes.data)
      return Response.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404 });

    type AnyRow = Record<string, unknown>;
    let extraRows: AnyRow[] = [];
    if (tab === "randevular") {
      const { data } = await db.from("appointments").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("appointment_date", { ascending: true });
      extraRows = (data || []) as AnyRow[];
    } else if (tab === "taslar") {
      const { data } = await db.from("client_stones").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("stone_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
      extraRows = (data || []) as AnyRow[];
    } else if (tab === "seanslar") {
      const { data } = await db.from("client_sessions").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("session_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
      extraRows = (data || []) as AnyRow[];
    } else if (tab === "ucretlendirme") {
      const { data } = await db.from("client_charges").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("charge_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
      extraRows = (data || []) as AnyRow[];
    } else if (tab === "odevler") {
      const { data } = await db.from("client_homeworks").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false });
      extraRows = (data || []) as AnyRow[];
    } else if (tab === "analizler") {
      const { data } = await db.from("client_analyses").select("id, analysis_type, analysis_data, note, created_at, image_url").eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false });
      extraRows = (data || []) as AnyRow[];
    }

    const analysisImages = tab === "analizler"
      ? await fetchAnalysisImages(db, tenantId, clientId, extraRows as ClientAnalysisRow[])
      : [];

    const { doc, filename } = buildClientTabReport({
      tab,
      client: cliRes.data as ClientRow,
      notes: noteRes.data as ClientNoteRow | null,
      rows: extraRows,
      analysisImages,
    }, ctx);
    return docxResponse(await Packer.toBuffer(doc), filename);
  }

  // ─── Single-analysis mode ────────────────────────────────────────────────────
  // Analiz modalindeki "Word Al" — yalnız açık olan tek kayıtlı analizi verir.
  if (exportMode === "single-analysis") {
    const { analysisId } = body as { analysisId?: string };
    if (!analysisId || typeof analysisId !== "string")
      return Response.json({ ok: false, error: "Analiz kimliği gerekli." }, { status: 400 });

    const [saCliRes, saAnRes] = await Promise.all([
      db.from("clients").select("*").eq("id", clientId).eq("tenant_id", tenantId).single(),
      db.from("client_analyses")
        .select("id, analysis_type, analysis_data, note, created_at, image_url")
        .eq("id", analysisId).eq("client_id", clientId).eq("tenant_id", tenantId)
        .maybeSingle(),
    ]);

    if (saCliRes.error || !saCliRes.data)
      return Response.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404 });
    if (!saAnRes.data)
      return Response.json({ ok: false, error: "Analiz kaydı bulunamadı." }, { status: 404 });

    const an = saAnRes.data as ClientAnalysisRow;
    const imageBuf = an.image_url?.trim() ? await downloadAnalysisImage(db, tenantId, clientId, an.id) : null;
    const { doc, filename } = buildClientSingleAnalysisReport({
      client: saCliRes.data as ClientRow,
      analysis: an,
      imageBuf,
    }, ctx);
    return docxResponse(await Packer.toBuffer(doc), filename);
  }

  // ─── Tüm danışan verisi (date-range + full ortak okuma) ─────────────────────
  const readAll = () => Promise.all([
    db.from("clients").select("*").eq("id", clientId).eq("tenant_id", tenantId).single(),
    db.from("client_notes").select("*").eq("client_id", clientId).maybeSingle(),
    db.from("appointments").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("appointment_date", { ascending: true }),
    db.from("client_stones").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("stone_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    db.from("client_sessions").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("session_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    db.from("client_homeworks").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    db.from("client_analyses").select("id, analysis_type, analysis_data, note, created_at, image_url").eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    db.from("client_charges").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("charge_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
  ]);

  // ─── Date-range mode ─────────────────────────────────────────────────────────

  if (exportMode === "date-range" && dateRange?.start && dateRange?.end) {
    // Sınırlar takvim günü ("YYYY-MM-DD"); ISO an gelirse yerel güne çevrilir (kaydırma yok).
    const drStart = looseDayKey(dateRange.start) || dateRange.start.slice(0, 10);
    const drEnd   = looseDayKey(dateRange.end)   || dateRange.end.slice(0, 10);

    if (drStart > drEnd)
      return Response.json({ ok: false, error: "Başlangıç tarihi bitiş tarihinden sonra olamaz." }, { status: 400 });

    const [drCliRes, drNoteRes, drAptRes, drStoneRes, drSessRes, drHwRes, drAnRes, drChargeRes] = await readAll();

    if (drCliRes.error || !drCliRes.data)
      return Response.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404 });

    const drClient = drCliRes.data as ClientRow;
    // JS filtreleme — yerel takvim günü (Europe/Istanbul) ile.
    const data: ClientDataset = filterClientDatasetByRange({
      client:       drClient,
      notes:        drNoteRes.data as ClientNoteRow | null,
      appointments: (drAptRes.data   || []) as AppointmentRow[],
      stones:       (drStoneRes.data || []) as ClientStoneRow[],
      sessions:     (drSessRes.data  || []) as ClientSessionRow[],
      homeworks:    (drHwRes.data    || []) as ClientHomeworkRow[],
      analyses:     (drAnRes.data    || []) as ClientAnalysisRow[],
      charges:      (drChargeRes.data || []) as ClientChargeRow[],
    }, drStart, drEnd);

    const profileImg = drClient.profile_image_url?.trim()
      ? await fetchProfileImageBuffer(drClient.profile_image_url)
      : null;
    const analysisImages = await fetchAnalysisImages(db, tenantId, clientId, data.analyses);

    const { doc, filename } = buildClientDateRangeReport({ data, drStart, drEnd, profileImg, analysisImages }, ctx);
    return docxResponse(await Packer.toBuffer(doc), filename);
  }

  // ─── Full mode ────────────────────────────────────────────────────────────────

  const [clientRes, notesRes, appointmentsRes, stonesRes, sessionsRes, homeworksRes, analysesRes, chargesRes] = await readAll();

  if (clientRes.error || !clientRes.data)
    return Response.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404 });

  const client = clientRes.data as ClientRow;
  const data: ClientDataset = {
    client,
    notes:        notesRes.data as ClientNoteRow | null,
    appointments: (appointmentsRes.data || []) as AppointmentRow[],
    stones:       (stonesRes.data       || []) as ClientStoneRow[],
    sessions:     (sessionsRes.data     || []) as ClientSessionRow[],
    homeworks:    (homeworksRes.data    || []) as ClientHomeworkRow[],
    analyses:     (analysesRes.data     || []) as ClientAnalysisRow[],
    charges:      (chargesRes.data      || []) as ClientChargeRow[],
  };

  // Fotoğraf (isteğe bağlı) + analiz görselleri (paralel fetch)
  const profileImg = client.profile_image_url?.trim()
    ? await fetchProfileImageBuffer(client.profile_image_url)
    : null;
  const analysisImages = await fetchAnalysisImages(db, tenantId, clientId, data.analyses);

  // ── Yaşam Hafızası Seçimleri (BF-14 P2; OPSİYONEL)
  // selectionGroupId yoksa VEYA snapshot yoksa: mevcut Word çıktısı BİREBİR korunur.
  let snapshotChildren: ReportChild[] = [];
  if (typeof selectionGroupId === "string" && UUID_RE.test(selectionGroupId)) {
    try {
      const snaps = await readSnapshotsForDelivery(db, {
        tenantId,
        clientId,
        targetKind: "report",
        targetRef: null,
        selectionGroup: selectionGroupId,
      });
      if (snaps.length > 0) snapshotChildren = buildSnapshotSection(snaps, { headingNumber: 10 });
    } catch {
      /* regresyon güvenli: teslim seçimi eklenemezse mevcut rapor korunur */
    }
  }

  const { doc, filename } = buildClientFullReport({ data, profileImg, analysisImages, snapshotChildren }, ctx);
  return docxResponse(await Packer.toBuffer(doc), filename);
}
