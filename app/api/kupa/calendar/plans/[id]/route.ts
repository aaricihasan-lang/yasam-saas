import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, CALENDAR_PLAN_WRITABLE } from "@/lib/cupping/fields";
import { CUPPING_PLAN_YEAR_MIN, CUPPING_PLAN_YEAR_MAX } from "@/lib/cupping/calendarTypes";
import {
  assertOwnedRef,
  cuppingError,
  deleteEntity,
  getEntity,
  listEntity,
  parseJsonBody,
  pickWritable,
  updateEntity,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/calendar/plans/[id] — plan + seçili günler; güncelle (yıl-invariant); sil (günler CASCADE). */

function validYear(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < CUPPING_PLAN_YEAR_MIN || n > CUPPING_PLAN_YEAR_MAX) return null;
  return n;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Plan id gerekli.");

  const plan = await getEntity(guard.db, CUPPING_TABLES.calendarPlans, guard.tenantId, id);
  if (!plan.ok) return plan.response;

  const days = await listEntity(guard.db, CUPPING_TABLES.calendarPlanDays, guard.tenantId, {
    orderBy: "gregorian_date",
    ascending: true,
    eqFilters: { plan_id: id },
  });
  if (!days.ok) return days.response;

  return NextResponse.json({ ok: true, plan: plan.data, days: days.data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Plan id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, plan: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, CALENDAR_PLAN_WRITABLE);
  if (Object.keys(fields).length === 0) return cuppingError(400, "Güncellenecek alan yok.");
  if (Object.prototype.hasOwnProperty.call(fields, "name") && !String(fields.name ?? "").trim()) {
    return cuppingError(400, "Plan adı boş olamaz.");
  }

  // Sahiplik (yıl-invariant kontrolü mevcut yılı gerektirir).
  const current = await getEntity(db, CUPPING_TABLES.calendarPlans, tenantId, id);
  if (!current.ok) return current.response;

  if (Object.prototype.hasOwnProperty.call(fields, "year")) {
    const year = validYear(fields.year);
    if (year === null) return cuppingError(400, `Yıl ${CUPPING_PLAN_YEAR_MIN}–${CUPPING_PLAN_YEAR_MAX} aralığında olmalı.`);
    fields.year = year;
    // Yıl değişimi seçili günleri geçersiz kılacaksa REDDET (sessiz taşıma/silme YOK).
    if (year !== (current.data as { year: number }).year) {
      const existing = await listEntity(db, CUPPING_TABLES.calendarPlanDays, tenantId, {
        eqFilters: { plan_id: id },
      });
      if (!existing.ok) return existing.response;
      if (existing.data.length > 0) {
        return cuppingError(
          409,
          "Bu planda seçili günler var; yıl değiştirilemez. Önce günleri kaldırın.",
        );
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(fields, "advice_template_id")) {
    if (fields.advice_template_id != null && String(fields.advice_template_id).trim() !== "") {
      const owned = await assertOwnedRef(db, CUPPING_TABLES.adviceTemplates, tenantId, fields.advice_template_id);
      if (!owned) return cuppingError(400, "Seçilen şablon bu hesaba ait değil.");
    } else {
      fields.advice_template_id = null;
    }
  }

  const res = await updateEntity(db, CUPPING_TABLES.calendarPlans, tenantId, id, fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, plan: res.data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Plan id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  // Plan silinince seçili günler DB ON DELETE CASCADE ile birlikte silinir.
  const res = await deleteEntity(db, CUPPING_TABLES.calendarPlans, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
