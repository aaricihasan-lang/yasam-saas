import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { MARKS_PER_SESSION_MAX, validateSessionInput } from "@/lib/refleksoloji/markSurfaces";
import {
  MARK_COLUMNS,
  NO_STORE,
  SESSION_COLUMNS,
  countSessionMarks,
  isMissingTable,
  isUuid,
  jsonError,
  loadSessionInTenant,
  marksNotReady,
  readJsonBody,
  toMark,
} from "@/lib/refleksoloji/marksServer";
import { jsonServerError } from "@/lib/refleksoloji/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/marks/sessions/[id] — tek işaret seansı.
 *
 * GET    → seans + TÜM noktaları (yüzey/taraf alanlarıyla; istemci yüzeye göre filtreler).
 * PATCH  { session_date?, title?, note? }
 * DELETE ?expected_marks=<n> → seans + noktaları (CASCADE). Seansta 3+ nokta varsa istemcinin
 *        3 aşamalı onayda GÖRDÜĞÜ sayı gönderilmek ZORUNDA; sunucudaki sayı farklıysa 409
 *        (bayat ekran onaylanandan fazlasını silemez).
 *
 * Güvenlik: id + tenant_id eşleşmesi (IDOR yok); başka tenant'ın seansı → 404.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard; // DEMO VİTRİN: okuma tenant-scoped (yazma 403)
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, "Geçersiz seans.");

  const { row, error } = await loadSessionInTenant(db, tenantId, id);
  if (error) {
    if (isMissingTable(error)) return marksNotReady();
    return jsonError(500, "Seans yüklenemedi. Lütfen tekrar deneyin.");
  }
  if (!row) return jsonError(404, "Seans bulunamadı.");

  const { data, error: mErr } = await db
    .from("reflexology_marks")
    .select(MARK_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("session_id", id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MARKS_PER_SESSION_MAX);
  if (mErr) return jsonError(500, "Seans yüklenemedi. Lütfen tekrar deneyin.");

  const marks = ((data ?? []) as Array<Record<string, unknown>>).map(toMark);
  return NextResponse.json(
    { ok: true, session: { ...row, mark_count: marks.length }, marks },
    { headers: NO_STORE },
  );
}

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, "Geçersiz seans.");

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;
  const v = validateSessionInput(parsed.body, true);
  if (!v.ok) return jsonError(400, v.error);

  const { data, error } = await db
    .from("reflexology_mark_sessions")
    .update(v.value)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select(SESSION_COLUMNS);
  if (error) return isMissingTable(error)
      ? marksNotReady()
      : jsonServerError("marks.session.PATCH", error, { usage: { guard, req, failedAction: "record_updated", subEntity: "mark_session" } });
  if (!data || data.length === 0) return jsonError(404, "Seans bulunamadı.");

  await trackUsage(guard, req, { module: "reflexology", action: "record_updated", subEntity: "mark_session", resourceId: id });
  return NextResponse.json({ ok: true, session: data[0] }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, "Geçersiz seans.");

  const { row, error } = await loadSessionInTenant(db, tenantId, id);
  if (error) return isMissingTable(error)
      ? marksNotReady()
      : jsonServerError("marks.session.DELETE.read", error, { usage: { guard, req, failedAction: "record_deleted", subEntity: "mark_session" } });
  if (!row) return jsonError(404, "Seans bulunamadı.");

  const { count, error: cErr } = await countSessionMarks(db, tenantId, id);
  if (cErr || count === null) {
    return isMissingTable(cErr)
      ? marksNotReady()
      : jsonServerError("marks.session.DELETE.count", cErr, { usage: { guard, req, failedAction: "record_deleted", subEntity: "mark_session" } });
  }
  const expectedRaw = req.nextUrl.searchParams.get("expected_marks");
  const expected = expectedRaw === null ? null : Number(expectedRaw);
  if (count >= 3 && expected !== count) {
    return NextResponse.json(
      {
        ok: false,
        code: "MARK_COUNT_CHANGED",
        current_count: count,
        error: "Seanstaki nokta sayısı değişti. Sayfayı yenileyip silme onayını tekrar verin.",
      },
      { status: 409, headers: NO_STORE },
    );
  }

  const { data, error: dErr } = await db
    .from("reflexology_mark_sessions")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id");
  if (dErr) return isMissingTable(dErr)
      ? marksNotReady()
      : jsonServerError("marks.session.DELETE", dErr, { usage: { guard, req, failedAction: "record_deleted", subEntity: "mark_session" } });
  if (!data || data.length === 0) return jsonError(404, "Seans bulunamadı.");

  await trackUsage(guard, req, { module: "reflexology", action: "record_deleted", subEntity: "mark_session", resourceId: id });
  return NextResponse.json({ ok: true, deleted_marks: count }, { headers: NO_STORE });
}
