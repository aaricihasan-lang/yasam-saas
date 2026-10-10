import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import {
  MARKS_PER_SESSION_MAX,
  isMarkSide,
  isMarkSurface,
  validateMarkInput,
} from "@/lib/refleksoloji/markSurfaces";
import {
  MARK_COLUMNS,
  NO_STORE,
  cleanSourceUid,
  countSessionMarks,
  isCheckViolation,
  isUniqueViolation,
  isMissingTable,
  isUuid,
  jsonError,
  marksNotReady,
  loadSessionInTenant,
  readJsonBody,
  toMark,
} from "@/lib/refleksoloji/marksServer";
import { jsonServerError } from "@/lib/refleksoloji/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";

export const runtime = "nodejs";

/**
 * /api/refleksoloji/marks/sessions/[id]/marks — seansa nokta ekle / yüzeydeki noktaları topluca sil.
 *
 * POST   { surface, side, x, y, size?, intensity?, note?, source_uid? } → yeni nokta.
 *        client_id SEANSTAN türetilir (body'den alınmaz) → nokta yalnız seansın danışanına bağlanır.
 * DELETE { surface?, side?, expected_count } → (filtreli) tüm noktalar. TOPLU SİLME KURALI:
 *        istemci 3+ / "Tümünü Sil" için 3 aşamalı onay alır; sunucu onaylanan sayıyı
 *        `expected_count` ile DOĞRULAR (farklıysa 409, hiçbir şey silinmez).
 */

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, userId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, "Geçersiz seans.");

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;
  const v = validateMarkInput(parsed.body);
  if (!v.ok) return jsonError(400, v.error);
  const sourceUid = cleanSourceUid((parsed.body as Record<string, unknown>)?.source_uid);

  const { row: session, error } = await loadSessionInTenant(db, tenantId, id);
  if (error) return isMissingTable(error)
      ? marksNotReady()
      : jsonServerError("marks.POST.session", error, { usage: { guard, req, failedAction: "record_created", subEntity: "mark" } });
  if (!session) return jsonError(404, "Seans bulunamadı.");

  const { data, error: insErr } = await db
    .from("reflexology_marks")
    .insert({
      tenant_id: tenantId,
      client_id: session.client_id,
      session_id: id,
      ...v.value,
      source_uid: sourceUid,
      created_by_user_id: userId,
    })
    .select(MARK_COLUMNS)
    .single();

  if (insErr) {
    if (sourceUid && isUniqueViolation(insErr)) {
      const { data: existing } = await db
        .from("reflexology_marks")
        .select(MARK_COLUMNS)
        .eq("tenant_id", tenantId)
        .eq("source_uid", sourceUid)
        .maybeSingle();
      if (existing && (existing as { session_id: string }).session_id === id) {
        return NextResponse.json(
          { ok: true, mark: toMark(existing as Record<string, unknown>), duplicate: true },
          { headers: NO_STORE },
        );
      }
      return jsonError(409, "Kayıt çakışması. Sayfayı yenileyip tekrar deneyin.");
    }
    if (isCheckViolation(insErr)) {
      return jsonError(422, `Bir seansta en fazla ${MARKS_PER_SESSION_MAX} nokta olabilir.`, "MARK_LIMIT");
    }
    return isMissingTable(insErr)
      ? marksNotReady()
      : jsonServerError("marks.POST", insErr, { usage: { guard, req, failedAction: "record_created", subEntity: "mark" } });
  }

  const mark = toMark(data as Record<string, unknown>);
  await trackUsage(guard, req, { module: "reflexology", action: "record_created", subEntity: "mark", resourceId: mark.id });
  return NextResponse.json({ ok: true, mark }, { status: 201, headers: NO_STORE });
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const guard = await requireModuleAccess(req, "reflexology");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();
  const { id } = await params;
  if (!isUuid(id)) return jsonError(400, "Geçersiz seans.");

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.res;
  const body = (parsed.body ?? {}) as Record<string, unknown>;

  const filter: { surface?: string; side?: string } = {};
  if (body.surface !== undefined) {
    if (!isMarkSurface(body.surface)) return jsonError(400, "Geçersiz yüzey.");
    filter.surface = body.surface;
    if (!isMarkSide(body.side)) return jsonError(400, "Sağ/sol bilgisi gerekli.");
    filter.side = body.side;
  } else if (body.side !== undefined) {
    return jsonError(400, "Sağ/sol filtresi yüzey olmadan kullanılamaz.");
  }
  const expected = body.expected_count;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 1) {
    return jsonError(400, "Silinecek nokta sayısı onayı gerekli.");
  }

  const { row: session, error } = await loadSessionInTenant(db, tenantId, id);
  if (error) return isMissingTable(error)
      ? marksNotReady()
      : jsonServerError("marks.DELETE.session", error, { usage: { guard, req, failedAction: "record_deleted", subEntity: "mark" } });
  if (!session) return jsonError(404, "Seans bulunamadı.");

  const { count, error: cErr } = await countSessionMarks(db, tenantId, id, filter);
  if (cErr || count === null) return isMissingTable(cErr)
      ? marksNotReady()
      : jsonServerError("marks.DELETE.count", cErr, { usage: { guard, req, failedAction: "record_deleted", subEntity: "mark" } });
  if (count !== expected) {
    return NextResponse.json(
      {
        ok: false,
        code: "MARK_COUNT_CHANGED",
        current_count: count,
        error: "Nokta sayısı değişti. Ekranı yenileyip silme onayını tekrar verin.",
      },
      { status: 409, headers: NO_STORE },
    );
  }

  let q = db.from("reflexology_marks").delete().eq("tenant_id", tenantId).eq("session_id", id);
  if (filter.surface) q = q.eq("surface", filter.surface);
  if (filter.side) q = q.eq("side", filter.side);
  const { data, error: dErr } = await q.select("id");
  if (dErr) return isMissingTable(dErr)
      ? marksNotReady()
      : jsonServerError("marks.DELETE", dErr, { usage: { guard, req, failedAction: "record_deleted", subEntity: "mark" } });

  const deleted = data?.length ?? 0;
  if (deleted > 0) {
    await trackUsage(guard, req, {
      module: "reflexology",
      action: "record_deleted",
      subEntity: "mark",
      resourceId: `bulk:${id}`,
      itemCount: deleted,
    });
  }
  return NextResponse.json({ ok: true, deleted }, { headers: NO_STORE });
}
