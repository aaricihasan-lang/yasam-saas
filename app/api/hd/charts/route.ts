import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import {
  saveComputedChart,
  listComputedCharts,
  getComputedChart,
  deleteComputedChart,
  listManualChartsWithClients,
  getManualChartByClient,
  saveManualChart,
  updateManualChartById,
  deleteManualChart,
  deleteManualChartsByClient,
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

// ── Manuel harita kaydetme gövdesini oku + doğrula (POST/PATCH ortak) ──
async function readManualBody(
  req: NextRequest,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Geçerli JSON gövdesi gerekli." },
        { status: 400, headers: NO_STORE },
      ),
    };
  }
  if (!isObj(raw)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "İstek gövdesi nesne olmalı." },
        { status: 400, headers: NO_STORE },
      ),
    };
  }
  return { ok: true, body: raw };
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

  // ── Manuel harita upsert (client başına tek satır) — computed'dan izole ──
  if (new URL(req.url).searchParams.get("scope") === "manual") {
    const parsed = await readManualBody(req);
    if (!parsed.ok) return parsed.response;
    const clientId = str(parsed.body.client_id).trim();
    if (!clientId) {
      return NextResponse.json(
        { ok: false, error: "client_id gerekli." },
        { status: 400, headers: NO_STORE },
      );
    }
    const { ok, error } = await saveManualChart(guard.db, guard.tenantId, clientId, parsed.body);
    if (!ok) {
      return NextResponse.json({ ok: false, error: error ?? "Kaydedilemedi." }, { status: 400, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE });
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

  // ── Manuel/legacy harita akışı (source null|'manual') — computed'dan izole ──
  if (url.searchParams.get("scope") === "manual") {
    const clientId = url.searchParams.get("client_id");
    if (clientId) {
      const { row, error } = await getManualChartByClient(guard.db, guard.tenantId, clientId);
      if (error) return NextResponse.json({ ok: false, error }, { status: 500, headers: NO_STORE });
      return NextResponse.json({ ok: true, row }, { status: 200, headers: NO_STORE });
    }
    const { rows, error } = await listManualChartsWithClients(guard.db, guard.tenantId);
    if (error) return NextResponse.json({ ok: false, error }, { status: 500, headers: NO_STORE });
    return NextResponse.json({ ok: true, rows }, { status: 200, headers: NO_STORE });
  }

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

// PATCH — yalnız manuel harita güncelleme (id ile). Computed akışında PATCH yoktur.
export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (new URL(req.url).searchParams.get("scope") !== "manual") {
    return NextResponse.json(
      { ok: false, error: "Desteklenmeyen işlem." },
      { status: 400, headers: NO_STORE },
    );
  }
  if (guard.is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında güncelleme yapılamaz." },
      { status: 403, headers: NO_STORE },
    );
  }
  const parsed = await readManualBody(req);
  if (!parsed.ok) return parsed.response;
  const id = str(parsed.body.id).trim();
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "Güncellenecek haritanın id'si gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }
  const { ok, error } = await updateManualChartById(guard.db, guard.tenantId, id, parsed.body);
  if (!ok) {
    return NextResponse.json({ ok: false, error: error ?? "Güncellenemedi." }, { status: 400, headers: NO_STORE });
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

  const url = new URL(req.url);

  // ── Manuel harita silme (id VEYA clientId ile) — computed'dan izole ──
  if (url.searchParams.get("scope") === "manual") {
    const mid = url.searchParams.get("id");
    const clientId = url.searchParams.get("clientId");
    if (mid) {
      const { ok, error } = await deleteManualChart(guard.db, guard.tenantId, mid);
      if (!ok) return NextResponse.json({ ok: false, error: error ?? "Silinemedi." }, { status: 400, headers: NO_STORE });
      return NextResponse.json({ ok: true, deletedId: mid }, { status: 200, headers: NO_STORE });
    }
    if (clientId) {
      const { ok, error } = await deleteManualChartsByClient(guard.db, guard.tenantId, clientId);
      if (!ok) return NextResponse.json({ ok: false, error: error ?? "Silinemedi." }, { status: 400, headers: NO_STORE });
      return NextResponse.json({ ok: true, deletedClientId: clientId }, { status: 200, headers: NO_STORE });
    }
    return NextResponse.json(
      { ok: false, error: "Silme için id veya clientId gerekli." },
      { status: 400, headers: NO_STORE },
    );
  }

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
