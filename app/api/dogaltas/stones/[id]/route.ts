import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { ADMIN_LIBRARY_TENANT_ID } from "@/lib/auth/sessionTenant";
import { validateMineralAssignments } from "@/lib/dogaltas/mineralPercent";
import { validateStoneStructuredFields, isUuid } from "@/lib/dogaltas/validation";
import { STONE_PHOTO_BUCKET, collectStonePhotoPaths } from "@/lib/dogaltas/stonePhoto";

export const runtime = "nodejs";

/**
 * /api/dogaltas/stones/[id] — tek taş okuma/güncelleme/silme (Faz 1-A).
 * Her işlem .eq("id", id).eq("tenant_id", tenantId) ile korunur → başka tenant'ın
 * id'si gelse bile 0 satır etkilenir (cross-tenant update/delete İMKÂNSIZ).
 */

const STONE_WRITABLE = [
  "stone_name", "short_description", "general_info", "source_note",
  "physical_effects", "spiritual_effects", "other_effects", "warning_text",
  "warning_tags", "feng_shui", "meditation", "care", "application",
  "chakras", "assignments", "images",
] as const;

function pick(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in body) out[k] = body[k];
  return out;
}

// ─── GET: tek taş detay ──────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });

  // Detay (read-only) kütüphane taşını da id ile gösterebilir (mevcut sayfa davranışı).
  // Düzenleme/silme PATCH/DELETE'te .eq(tenant_id) ile yalnız kendi taşına izinli.
  const ids = tenantId === ADMIN_LIBRARY_TENANT_ID ? [tenantId] : [tenantId, ADMIN_LIBRARY_TENANT_ID];

  const { data, error } = await db
    .from("stones").select("*")
    .eq("id", id).in("tenant_id", ids).maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Taş bulunamadı." }, { status: 404 });
  return NextResponse.json({ ok: true, row: data });
}

// ─── PATCH: güncelle (yalnız kendi tenant) ───────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const fields = pick(body, STONE_WRITABLE);
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ ok: false, error: "Güncellenecek alan yok." }, { status: 400 });
  }

  // F-004: structured alan tip zorlaması (PATCH kısmi — yalnız gönderilen alanlar).
  const structured = validateStoneStructuredFields(fields);
  if (!structured.ok) return NextResponse.json({ ok: false, error: structured.error }, { status: 422 });

  // Mineral oranı (assignments.Mineraller 2. sütun) 0..100 olmalı; boş serbest (DT-P0-4).
  if ("assignments" in fields) {
    const check = validateMineralAssignments(fields.assignments);
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
    fields.assignments = check.value;
  }

  fields.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("stones").update(fields)
    .eq("id", id).eq("tenant_id", tenantId) // tenant guard — cross-tenant update engellenir
    .select("*");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Taş bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id, row: data[0] });
}

// ─── DELETE: sil (yalnız kendi tenant) ───────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "stones");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  // F-016 (§8D): silmeden ÖNCE görsel file_path'lerini oku (orphan temizliği için).
  const { data: preRow } = await db
    .from("stones").select("images")
    .eq("id", id).eq("tenant_id", tenantId).maybeSingle();

  const { data, error } = await db
    .from("stones").delete()
    .eq("id", id).eq("tenant_id", tenantId) // tenant guard — cross-tenant delete engellenir
    .select("id");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Taş bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }

  // Orphan storage temizliği (best-effort; başarısızlık DB delete'i geri almaz ama
  // sessiz gizlenmez → yanıt storageCleaned bayrağıyla dürüst raporlanır).
  let storageCleaned = true;
  const paths = collectStonePhotoPaths([(preRow as { images?: unknown } | null)?.images], tenantId);
  if (paths.length > 0) {
    const { error: rmErr } = await db.storage.from(STONE_PHOTO_BUCKET).remove(paths);
    if (rmErr) { storageCleaned = false; console.error("[stones/[id]] orphan temizliği hatası:", rmErr.message); }
  }
  return NextResponse.json({ ok: true, id, storageCleaned });
}
