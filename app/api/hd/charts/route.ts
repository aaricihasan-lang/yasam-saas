import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import {
  saveComputedChart,
  listComputedCharts,
  getComputedChart,
  deleteComputedChart,
} from "@/lib/human-design/api/chartPersistence";

export const runtime = "nodejs";

/**
 * /api/hd/charts — hesaplanmış HD haritalarının güvenli kalıcılığı (FAZ 9B).
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user binding.
 *   - tenant_id + user_id YALNIZ guard'dan; request gövdesinden GÜVENİLMEZ.
 *   - Tüm sorgular tenant-scoped + source='computed' (manuel akış izole).
 *   - POST: recompute-on-save (client computed_result'ına güvenilmez).
 *   - Yanıt no-store; doğum verisi LOGLANMAZ; demo hesap yazamaz.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında harita kaydedilemez." },
      { status: 403, headers: NO_STORE },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (!isObj(raw)) {
    return NextResponse.json(
      { ok: false, code: "INVALID_BODY", error: "İstek gövdesi nesne olmalı." },
      { status: 400, headers: NO_STORE },
    );
  }

  // input alanı ya da düz gövde; computed_result gönderilse bile YOK SAYILIR.
  const input = isObj(raw.input) ? raw.input : raw;

  const res = await saveComputedChart(guard.db, guard.tenantId, guard.userId, {
    date: str(input.date),
    time: str(input.time),
    timezone: str(input.timezone),
    client_id: strOrNull(raw.client_id),
    client_name: strOrNull(raw.client_name),
    birth_place: strOrNull(raw.birth_place),
    location_id: strOrNull(raw.location_id),
    notes: strOrNull(raw.notes),
  });

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, code: res.code, error: res.error },
      { status: res.status, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, id: res.id }, { status: 200, headers: NO_STORE });
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    const { row, error } = await getComputedChart(guard.db, guard.tenantId, id);
    if (error) {
      return NextResponse.json({ ok: false, code: "DB_ERROR", error }, { status: 500, headers: NO_STORE });
    }
    if (!row) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", error: "Kayıt bulunamadı." },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json({ ok: true, data: row }, { status: 200, headers: NO_STORE });
  }

  const clientId = url.searchParams.get("client_id") ?? undefined;
  const { rows, error } = await listComputedCharts(guard.db, guard.tenantId, { clientId });
  if (error) {
    return NextResponse.json({ ok: false, code: "DB_ERROR", error }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, data: rows }, { status: 200, headers: NO_STORE });
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

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, code: "MISSING_ID", error: "Silinecek kaydın id'si gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }

  const { ok, error } = await deleteComputedChart(guard.db, guard.tenantId, id);
  if (!ok) {
    return NextResponse.json(
      { ok: false, code: "DELETE_FAILED", error: error ?? "Silinemedi." },
      { status: 400, headers: NO_STORE },
    );
  }
  return NextResponse.json({ ok: true, deletedId: id }, { status: 200, headers: NO_STORE });
}
