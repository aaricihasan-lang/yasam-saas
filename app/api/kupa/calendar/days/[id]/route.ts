import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES } from "@/lib/cupping/fields";
import { normalizeCuppingDayStyle } from "@/lib/cupping/calendarTypes";
import { cuppingError, deleteEntity, parseJsonBody, updateEntity } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/calendar/days/[id]
 *   PATCH  — seçili günün STİLİNİ güncelle (uzman-tanımlı renk + kısa açıklama + detay notu).
 *   DELETE — tek seçili günü sil (tenant-safe). Tekrar-kuralı YOK.
 *
 * PATCH yalnız STİL alanlarını (color_key / user_label / note) değiştirir; gregorian_date,
 *   plan_id, selection_source ASLA değişmez (allowlist DIŞI; server-sahipli). Renk anlamı
 *   platform tarafından sabitlenmez — kontrollü palet + kısa metin yalnız uzmanın görsel işareti.
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Gün id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, day: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  // TEK doğruluk kaynağı doğrulama (renk allowlist + kısa açıklama/not sınırı).
  // requireAtLeastOne: boş PATCH reddedilir. rejectNullColor: renk kaldırılamaz (renkli gün
  // renksiz bırakılmaz; yalnız başka renkle değiştirilir). Eski renksiz kayıt PATCH ile renk
  // ALIR (non-null); color_key gönderilmezse mevcut değer korunur (etiket-only düzenleme serbest).
  const norm = normalizeCuppingDayStyle(parsed.data, { requireAtLeastOne: true, rejectNullColor: true });
  if (!norm.ok) return cuppingError(400, norm.error);

  // Tenant-safe UPDATE (updateEntity id + tenant_id ile bağlar → cross-tenant IDOR engeli).
  const res = await updateEntity(db, CUPPING_TABLES.calendarPlanDays, tenantId, id, norm.fields);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, day: res.data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Gün id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  const res = await deleteEntity(db, CUPPING_TABLES.calendarPlanDays, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
