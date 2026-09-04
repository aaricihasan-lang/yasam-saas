import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, CALENDAR_PLAN_WRITABLE } from "@/lib/cupping/fields";
import { CUPPING_PLAN_YEAR_MIN, CUPPING_PLAN_YEAR_MAX } from "@/lib/cupping/calendarTypes";
import {
  assertOwnedRef,
  cuppingError,
  insertEntity,
  listEntity,
  parseJsonBody,
  pickWritable,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/calendar/plans — FAZ 5 HACAMAT TAKVİMİ planları (root).
 *
 * Ürün: profesyonel KENDİ takvimini oluşturur; sistem "doğru gün" EMPOZE ETMEZ.
 * Güvenlik: requireModuleAccess("cupping"); tenant SUNUCUDA; yalnız CALENDAR_PLAN_WRITABLE;
 *   advice_template_id verilirse AYNI tenant'a ait olmalı; demo → persist=0; safe error.
 */

/** İstemciden gelen year → yapısal (1900–2200) tam sayı doğrulaması. */
function validYear(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < CUPPING_PLAN_YEAR_MIN || n > CUPPING_PLAN_YEAR_MAX) return null;
  return n;
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;

  const yearParam = req.nextUrl.searchParams.get("year");
  const eqFilters: Record<string, string> = {};
  if (yearParam !== null && yearParam.trim() !== "") {
    if (validYear(yearParam) === null) return cuppingError(400, "Geçersiz yıl.");
    eqFilters.year = yearParam.trim();
  }

  const res = await listEntity(guard.db, CUPPING_TABLES.calendarPlans, guard.tenantId, {
    orderBy: "created_at",
    ascending: false,
    eqFilters,
  });
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, plans: res.data });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, plan: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, CALENDAR_PLAN_WRITABLE);
  if (!String(fields.name ?? "").trim()) return cuppingError(400, "Plan adı gerekli.");

  const year = validYear(fields.year);
  if (year === null) return cuppingError(400, `Yıl ${CUPPING_PLAN_YEAR_MIN}–${CUPPING_PLAN_YEAR_MAX} aralığında olmalı.`);
  fields.year = year;

  // advice_template_id opsiyonel; verilirse AYNI tenant şablonu olmalı (cross-tenant FK backstop).
  if (fields.advice_template_id != null && String(fields.advice_template_id).trim() !== "") {
    const owned = await assertOwnedRef(db, CUPPING_TABLES.adviceTemplates, tenantId, fields.advice_template_id);
    if (!owned) return cuppingError(400, "Seçilen şablon bu hesaba ait değil.");
  } else {
    delete fields.advice_template_id;
  }

  const ins = await insertEntity(db, CUPPING_TABLES.calendarPlans, tenantId, fields);
  if (!ins.ok) return ins.response;
  return NextResponse.json({ ok: true, plan: ins.data });
}
