import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { checkFreeTextFields, freeTextTooLongMessage } from "@/lib/urun-stok/selectOther";
import { applyGuardedInventoryPatch } from "@/lib/urun-stok/guardedStockPatch";
import { validateInventoryWrite } from "@/lib/urun-stok/inventoryWriteValidation";
import { readInventoryRowsPaged } from "@/lib/urun-stok/pagedInventoryRead";

import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
export const runtime = "nodejs";

/**
 * /api/urun-stok/sabun-krem — soap_cream_inventory (Sabun/Krem ürün-stok)
 * güvenli server kapısı (K-2). GET (liste), POST (ekle), PATCH (güncelle,
 * body.id), DELETE (?id veya body.id). tenant_id daima oturumdan; her işlem
 * .eq("tenant_id", tenantId). oil_inventory route deseni ile birebir aynı.
 */

// Serbest metin girilebilen etiket kolonları (ürün türü/grup/ambalaj/malzeme) — ≤ 80 karakter.
// Ölçü tipi / birim kolonları burada YOK (dönüşüm ve satış RPC base_unit bunlara bağlı).
const FREE_TEXT_KEYS = ["product_group", "packaging_type"] as const;

// STK-05: yazılabilir alanlar kategori allowlist'inden gelir (lib/urun-stok/inventoryWriteValidation.ts).
const CATEGORY = "soap_cream" as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stok");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  // STK-04: PostgREST satır tavanında sessiz kesilme yok — sayfalı, kararlı sıralı, eksiksiz okuma.
  const { rows, error } = await readInventoryRowsPaged(db, "soap_cream_inventory", tenantId, "*", {
    orderBy: "created_at", ascending: false,
  });
  if (error) {
    console.error("[urun-stok/sabun-krem] liste okuma hata", { code: (error as { code?: string }).code });
    return NextResponse.json({ ok: false, error: "Stok listesi okunamadı. Lütfen tekrar deneyin." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stok");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  // "Diğer" serbest metin alanları: kırp + uzunluk sınırı (başka davranış değişmez).
  const freeText = checkFreeTextFields(body, FREE_TEXT_KEYS);
  if (!freeText.ok) return NextResponse.json({ ok: false, error: freeTextTooLongMessage() }, { status: 400 });
  body = freeText.body;

  const valid = validateInventoryWrite(CATEGORY, body, "create");
  if (!valid.ok) return NextResponse.json({ ok: false, error: valid.error, field: valid.field }, { status: 400 });

  if (is_demo_account) return demoReadOnlyResponse();

  const now = new Date().toISOString();
  const payload = {
    ...valid.fields,
    client_id: valid.clientId,
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await db.from("soap_cream_inventory").insert(payload).select("id").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ ok: false, error: "Bu kayıt zaten mevcut." }, { status: 409 });
    }
    console.error("[urun-stok/sabun-krem] ekleme hata", { code: (error as { code?: string }).code });
    await trackUsage(guard, req, { module: "stok", action: "action_failed", failedAction: "record_created", subEntity: "soap_cream", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Kayıt eklenemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }
  const newId = (data as { id: string }).id;
  await trackUsage(guard, req, { module: "stok", action: "record_created", subEntity: "soap_cream", resourceId: newId });
  return NextResponse.json({ ok: true, id: newId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stok");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  // "Diğer" serbest metin alanları: kırp + uzunluk sınırı (başka davranış değişmez).
  const freeText = checkFreeTextFields(body, FREE_TEXT_KEYS);
  if (!freeText.ok) return NextResponse.json({ ok: false, error: freeTextTooLongMessage() }, { status: 400 });
  body = freeText.body;

  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const valid = validateInventoryWrite(CATEGORY, body, "update");
  if (!valid.ok) return NextResponse.json({ ok: false, error: valid.error, field: valid.field }, { status: 400 });

  if (is_demo_account) return demoReadOnlyResponse();

  // STK-01: stok kolonu yalnız expected_stock eşleşirse yazılır (karşılaştır-ve-yaz).
  const fields = { ...valid.fields, updated_at: new Date().toISOString() };
  const patch = await applyGuardedInventoryPatch({
    db, table: "soap_cream_inventory", stockColumn: "stock_base", tenantId, id, fields, body,
  });
  if (!patch.ok) {
    if (patch.failed === "server") {
      await trackUsage(guard, req, { module: "stok", action: "action_failed", failedAction: "record_updated", subEntity: "soap_cream", errorClass: "server" });
    }
    return patch.response;
  }
  await trackUsage(guard, req, { module: "stok", action: "record_updated", subEntity: "soap_cream", resourceId: id });
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stok");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;

  const fromQuery = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  let id = fromQuery;
  if (!id) {
    try { const b = (await req.json()) as { id?: unknown }; id = String(b.id ?? "").trim(); }
    catch { /* gövde yoksa query'e güven */ }
  }
  if (!id) return NextResponse.json({ ok: false, error: "id zorunludur." }, { status: 400 });
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "Geçersiz kayıt kimliği." }, { status: 400 });

  if (is_demo_account) return demoReadOnlyResponse();

  const { data, error } = await db
    .from("soap_cream_inventory").delete()
    .eq("id", id).eq("tenant_id", tenantId)
    .select("id");

  if (error) {
    console.error("[urun-stok/sabun-krem] silme hata", { code: (error as { code?: string }).code });
    await trackUsage(guard, req, { module: "stok", action: "action_failed", failedAction: "record_deleted", subEntity: "soap_cream", errorClass: "server" });
    return NextResponse.json({ ok: false, error: "Kayıt silinemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Stok kaydı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  await trackUsage(guard, req, { module: "stok", action: "record_deleted", subEntity: "soap_cream", resourceId: id });
  return NextResponse.json({ ok: true, id });
}
