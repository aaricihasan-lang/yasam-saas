import { NextRequest } from "next/server";
import { Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { readBioReportRows } from "@/lib/biyoenerji/reportRead";
import { trackUsage } from "@/lib/usage/trackUsage";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import {
  reportRateLimit,
  MAX_EXPORT_RECORDS,
  EXPORT_TRUNCATED_NOTE,
  MAX_SELECTED_IDS,
} from "@/lib/biyoenerji/reportSecurity";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
import { sanitizeBioenergyRow, sanitizeBioenergyXmlText } from "@/lib/biyoenerji/xmlSafeText";

// Saf belge kurucusu (FA-02 tarih/saat Europe/Istanbul + FA-16 bilgilendirme notu) — harness test eder.
import { buildBioSessionReportDoc, type BioSessionExportMode, type BioSessionRow } from "./buildSessionReport";

/** A1 — hazırlayan adı da XML-güvenli. */
function safeExpertName(profile: Record<string, unknown> | null | undefined): string | null {
  const n = expertDisplayName(profile);
  return n === null ? null : sanitizeBioenergyXmlText(n);
}

export const runtime = "nodejs";

type ExportMode = BioSessionExportMode;
type SessionRow = BioSessionRow;

export async function POST(request: NextRequest): Promise<Response> {
  // GÜVENLİK: kimlik yalnızca sunucu tarafında x-user-id + x-session-token
  // (requireModuleAccess) ile belirlenir. Body'deki tenantId/userId GÜVEN KAYNAĞI DEĞİLDİR.
  // Android: Word (.docx) indirme kapalı (ürün kararı) — defense-in-depth.
  const androidBlocked = androidWordGuard(request);
  if (androidBlocked) return androidBlocked;

  const guard = await requireModuleAccess(request, "energy_body");
  if (!guard.ok) return guard.response;
  const { tenantId } = guard;

  // Demo hesap: export sunucu seviyesinde engellenir
  if (guard.is_demo_account)
    return Response.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });

  // FAZ1: best-effort rate-limit (asıl koruma aşağıdaki HARD CAP'tir).
  const rl = reportRateLimit("session", tenantId);
  if (rl) return rl;

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { exportMode = "all", sessionIds, sessionId } = body as {
    exportMode?: ExportMode;
    sessionIds?: string[];
    sessionId?: string;
  };

  // AA-6: route kendi service_role client'ını KURMAZ — guard'ın sunucu client'ı (guard.db).
  const { db } = guard;

  // BIO-01 + A4-A — sayfalı, sayım doğrulamalı okuma; seçili modda uzun id listesi parçalı
  // okunur, eksik kayıt varsa rapor üretilmez (lib/biyoenerji/reportRead).
  const read = await readBioReportRows<Record<string, unknown>>({
    db,
    table: "bioenergy_sessions",
    select: "*",
    tenantId,
    orderCol: "created_at",
    orderAsc: false,
    maxRows: MAX_EXPORT_RECORDS,
    mode:
      exportMode === "single" && sessionId
        ? "single"
        : exportMode === "selected" && Array.isArray(sessionIds) && sessionIds.length > 0
          ? "selected"
          : "all",
    singleId: sessionId ?? null,
    ids: Array.isArray(sessionIds) ? sessionIds : null,
    maxSelected: MAX_SELECTED_IDS,
  });
  if (!read.ok && read.status !== 500) {
    return Response.json({ ok: false, error: read.error }, { status: read.status });
  }
  const data = read.ok ? read.rows : [];
  const error = read.ok ? null : (read.cause ?? read.error);
  const truncatedRead = read.ok ? read.truncated : false;
  if (error) {
    console.error("[session-report] read failed:", error);
    await trackUsage(guard, request, { module: "energy_body", action: "action_failed", failedAction: "report_generated", subEntity: "session", errorClass: "server" });
    return Response.json({ ok: false, error: "Seanslar okunamadı." }, { status: 500 });
  }

  // A1 — XML 1.0 geçersiz kontrol karakterleri (eski kayıtlar dahil) Word öncesi temizlenir.
  const sessions = (data || []).map((r) => sanitizeBioenergyRow(r)) as SessionRow[];
  if (!sessions.length)
    return Response.json({ ok: false, error: "Bu seçim için seans bulunamadı." }, { status: 404 });

  const { doc, filename } = buildBioSessionReportDoc({
    sessions,
    exportMode,
    truncatedNote: truncatedRead ? EXPORT_TRUNCATED_NOTE(MAX_EXPORT_RECORDS) : null,
    expertName: safeExpertName(guard.profile),
  });

  const buffer = await Packer.toBuffer(doc);
  // USAGE360: rapor YALNIZ docx başarıyla üretildikten sonra sayılır (Android guard 403'ü olay değildir).
  await trackUsage(guard, request, {
    module: "energy_body",
    action: "report_generated",
    subEntity: "session",
    resourceId: exportMode === "single" && typeof sessionId === "string" ? sessionId : null,
    itemCount: sessions.length,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
