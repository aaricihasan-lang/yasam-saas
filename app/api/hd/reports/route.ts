import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import {
  listReportsWithClients,
  getReportById,
  saveReport,
  getClientReportCount,
  updateReport,
  deleteReport,
} from "@/lib/human-design/api/reportPersistence";

export const runtime = "nodejs";

/**
 * /api/hd/reports — human_design_reports güvenli CRUD (Sprint-4 Aşama-2).
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id + user_id YALNIZ guard'dan; request gövdesinden GÜVENİLMEZ.
 *   - client_id / chart_id IDOR guard (persistence katmanında tenant sahiplik).
 *   - Tüm sorgular tenant-scoped; yanıt no-store; demo hesap yazamaz.
 *
 * HD engine/compute/BodyGraph + rapor içerik üretimine dokunmaz — yalnız reports tablosu.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const countForClient = url.searchParams.get("countForClient");

  if (countForClient !== null) {
    const { count, error } = await getClientReportCount(guard.db, guard.tenantId, countForClient);
    if (error) return NextResponse.json({ ok: false, error }, { status: 500, headers: NO_STORE });
    return NextResponse.json({ ok: true, count }, { status: 200, headers: NO_STORE });
  }

  if (id) {
    const { row, error } = await getReportById(guard.db, guard.tenantId, id);
    if (error && !row) {
      return NextResponse.json({ ok: false, error }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true, row }, { status: 200, headers: NO_STORE });
  }

  const { rows, error } = await listReportsWithClients(guard.db, guard.tenantId);
  if (error) return NextResponse.json({ ok: false, error }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, rows }, { status: 200, headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında rapor kaydedilemez." },
      { status: 403, headers: NO_STORE },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçerli JSON gövdesi gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isObj(raw)) {
    return NextResponse.json(
      { ok: false, error: "İstek gövdesi nesne olmalı." },
      { status: 400, headers: NO_STORE },
    );
  }

  const { id, error } = await saveReport(guard.db, guard.tenantId, guard.userId, raw);
  if (error || !id) {
    return NextResponse.json(
      { ok: false, error: error ?? "Kayıt oluşturulamadı." },
      { status: 400, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, id }, { status: 200, headers: NO_STORE });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında güncelleme yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçerli JSON gövdesi gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isObj(raw)) {
    return NextResponse.json(
      { ok: false, error: "İstek gövdesi nesne olmalı." },
      { status: 400, headers: NO_STORE },
    );
  }

  const id = String(raw.id ?? "").trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Güncellenecek raporun id'si gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }

  const { ok, error } = await updateReport(guard.db, guard.tenantId, id, raw);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: error ?? "Güncellenemedi." },
      { status: 400, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, id }, { status: 200, headers: NO_STORE });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında silme yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Silinecek raporun id'si gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  const { ok, error } = await deleteReport(guard.db, guard.tenantId, id);
  if (!ok) {
    return NextResponse.json({ ok: false, error: error ?? "Silinemedi." }, { status: 400, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, deletedId: id }, { status: 200, headers: NO_STORE });
}
