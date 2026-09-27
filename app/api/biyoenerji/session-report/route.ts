import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Packer } from "docx";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { androidWordGuard } from "@/lib/platform/androidWordGuard";
import {
  reportRateLimit,
  capSelectedIds,
  MAX_EXPORT_RECORDS,
  EXPORT_TRUNCATED_NOTE,
} from "@/lib/biyoenerji/reportSecurity";
import { expertDisplayName } from "@/lib/docx/reportDisclaimer";
// Saf belge kurucusu (FA-02 tarih/saat Europe/Istanbul + FA-16 bilgilendirme notu) — harness test eder.
import { buildBioSessionReportDoc, type BioSessionExportMode, type BioSessionRow } from "./buildSessionReport";

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  let query = db.from("bioenergy_sessions").select("*").eq("tenant_id", tenantId);

  if (exportMode === "single" && sessionId) {
    query = query.eq("id", sessionId);
  } else if (exportMode === "selected" && Array.isArray(sessionIds) && sessionIds.length > 0) {
    query = query.in("id", capSelectedIds(sessionIds));
  }

  const { data, error } = await query.order("created_at", { ascending: false }).limit(MAX_EXPORT_RECORDS);
  if (error) {
    console.error("[session-report] read failed:", error);
    return Response.json({ ok: false, error: "Seanslar okunamadı." }, { status: 500 });
  }

  const sessions = (data || []) as SessionRow[];
  if (!sessions.length)
    return Response.json({ ok: false, error: "Bu seçim için seans bulunamadı." }, { status: 404 });

  const { doc, filename } = buildBioSessionReportDoc({
    sessions,
    exportMode,
    truncatedNote: sessions.length >= MAX_EXPORT_RECORDS ? EXPORT_TRUNCATED_NOTE(MAX_EXPORT_RECORDS) : null,
    expertName: expertDisplayName(guard.profile),
  });

  const buffer = await Packer.toBuffer(doc);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
