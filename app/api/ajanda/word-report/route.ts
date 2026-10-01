import { NextRequest } from "next/server";
import { Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import { isDemoTenantId } from "@/lib/auth/demoServerGuard";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import {
  buildAjandaReportDoc,
  type AjandaAppointmentRow,
  type AjandaExportMode,
} from "./buildAjandaReport";

export const runtime = "nodejs";

type ExportMode = AjandaExportMode;
type AppointmentRow = AjandaAppointmentRow;

type ClientRow = { id: string; ad: string | null; soyad: string | null };

export async function POST(req: NextRequest): Promise<Response> {
  const androidBlocked = androidWordGuard(req);
  if (androidBlocked) return androidBlocked;
  // P0-4 KAPANIŞI: AUTH ÖNCE. Kimlik + oturum token doğrulanır, modül erişimi
  // (appointments) ve tenant SUNUCUDA çözülür. Sıra: authenticate → authorize →
  // resolve tenant → validate → query. Client-supplied tenantId bir GÜVENLİK
  // SINIRI DEĞİLDİR; tüm sorgular yalnız doğrulanmış guard.tenantId kullanır.
  const guard = await requireModuleAccess(req, "appointments");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId: bodyTenantId, exportMode = "all", appointmentIds, appointmentId, dateRange } = body as {
    tenantId?: string;        // yalnız uyumluluk alanı — yetkilendirme kaynağı DEĞİL
    exportMode?: ExportMode;
    appointmentIds?: string[];
    appointmentId?: string;   // single mode için
    dateRange?: { start: string; end: string };
  };

  // Uyumluluk: body.tenantId gönderilebilir AMA doğrulanmış tenant ile eşleşmiyorsa
  // (başka tenant export denemesi) reddedilir. Sorgular yalnız guard.tenantId kullanır.
  if (typeof bodyTenantId === "string" && bodyTenantId.trim() && bodyTenantId.trim() !== tenantId)
    return Response.json({ ok: false, error: "Yetki yok." }, { status: 403 });

  if (exportMode === "single" && !appointmentId)
    return Response.json({ ok: false, error: "Tek randevu için appointmentId zorunludur." }, { status: 400 });
  if ((exportMode === "selected" || exportMode === "filtered") && (!Array.isArray(appointmentIds) || appointmentIds.length === 0))
    return Response.json({ ok: false, error: "Seçili randevular için appointmentIds zorunludur." }, { status: 400 });

  // Demo hesap gerçek export üretemez — mevcut kontrat korunur (tenant SUNUCUDAN türetildi).
  if (await isDemoTenantId(tenantId, db))
    return Response.json({ ok: false, error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  let query = db.from("appointments").select("*").eq("tenant_id", tenantId);

  if (exportMode === "single" && appointmentId) {
    query = query.eq("id", appointmentId);
  } else if ((exportMode === "selected" || exportMode === "filtered") && Array.isArray(appointmentIds) && appointmentIds.length > 0) {
    query = query.in("id", appointmentIds);
  } else if ((exportMode === "weekly" || exportMode === "monthly") && dateRange?.start && dateRange?.end) {
    query = query.gte("appointment_date", dateRange.start).lte("appointment_date", dateRange.end);
  }

  const { data, error } = await query.order("appointment_date", { ascending: true });
  if (error) {
    await trackUsage(guard, req, {
      module: "appointments",
      action: "action_failed",
      failedAction: "report_generated",
      subEntity: "appointment",
      errorClass: "server",
    });
    return Response.json({ ok: false, error: "Randevular okunamadı." }, { status: 500 });
  }

  const appointments = (data || []) as AppointmentRow[];
  if (!appointments.length)
    return Response.json({ ok: false, error: "Bu seçim için randevu bulunamadı." }, { status: 404 });

  // Client adları
  const clientIds = [...new Set(appointments.map((a) => a.client_id).filter(Boolean))] as string[];
  const clientMap = new Map<string, string>();
  if (clientIds.length > 0) {
    // AA-3: defense-in-depth — randevular zaten tenant-scoped; ad çözümü de tenant'a sabitlenir.
    const { data: cData } = await db.from("clients").select("id, ad, soyad").eq("tenant_id", tenantId).in("id", clientIds);
    for (const c of (cData || []) as ClientRow[]) {
      clientMap.set(c.id, `${c.ad ?? ""} ${c.soyad ?? ""}`.trim());
    }
  }

  // Saf belge kurucusu (FA-02: tarih/saat/gün gruplama Europe/Istanbul; FA-44 durum etiketi).
  const { doc, filename } = buildAjandaReportDoc({
    appointments,
    clientMap,
    exportMode,
    dateRange,
    expertName: expertDisplayName(guard.profile),
  });

  const buffer = await Packer.toBuffer(doc);
  // Rapor = tek kullanıcı eylemi → tek olay + itemCount (randevu sayısı).
  await trackUsage(guard, req, {
    module: "appointments",
    action: "report_generated",
    subEntity: "appointment",
    itemCount: appointments.length,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
