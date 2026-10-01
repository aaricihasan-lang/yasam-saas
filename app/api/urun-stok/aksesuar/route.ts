import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { trackUsage } from "@/lib/usage/trackUsage";
import { checkFreeTextFields, freeTextTooLongMessage } from "@/lib/urun-stok/selectOther";

export const runtime = "nodejs";

/**
 * /api/urun-stok/aksesuar — accessory_inventory (Tespih/Takı/Aksesuar ürün-stok)
 * güvenli server kapısı (K-2). GET (liste), POST (ekle), PATCH (güncelle,
 * body.id), DELETE (?id veya body.id). tenant_id daima oturumdan; her işlem
 * .eq("tenant_id", tenantId). oil/soap_cream route deseni ile birebir aynı.
 */

// Client'tan kabul EDİLMEYECEK alanlar (tenant override + id güvenliği).
const PROTECTED = new Set(["tenant_id", "id", "created_at"]);

// Serbest metin girilebilen etiket kolonları (ürün türü/grup/ambalaj/malzeme) — ≤ 80 karakter.
// Ölçü tipi / birim kolonları burada YOK (dönüşüm ve satış RPC base_unit bunlara bağlı).
const FREE_TEXT_KEYS = ["product_group", "material"] as const;

function sanitize(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (!PROTECTED.has(k)) out[k] = v;
  return out;
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "stok");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const { data, error } = await db
    .from("accessory_inventory").select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
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

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ ok: false, error: "Ürün adı zorunludur." }, { status: 400 });

  const clientId = String(body.client_id ?? "").trim();
  if (!clientId) return NextResponse.json({ ok: false, error: "client_id zorunludur." }, { status: 400 });

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const now = new Date().toISOString();
  const payload = {
    ...sanitize(body),
    name,
    client_id: clientId,
    tenant_id: tenantId,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await db.from("accessory_inventory").insert(payload).select("id").single();
  if (error) {
    await trackUsage(guard, req, { module: "stok", action: "action_failed", failedAction: "record_created", subEntity: "accessory", errorClass: "server" });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const newId = (data as { id: string }).id;
  await trackUsage(guard, req, { module: "stok", action: "record_created", subEntity: "accessory", resourceId: newId });
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

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const fields = { ...sanitize(body), updated_at: new Date().toISOString() };
  const { data, error } = await db
    .from("accessory_inventory").update(fields)
    .eq("id", id).eq("tenant_id", tenantId)
    .select("id");

  if (error) {
    await trackUsage(guard, req, { module: "stok", action: "action_failed", failedAction: "record_updated", subEntity: "accessory", errorClass: "server" });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Stok kaydı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  await trackUsage(guard, req, { module: "stok", action: "record_updated", subEntity: "accessory", resourceId: id });
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

  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const { data, error } = await db
    .from("accessory_inventory").delete()
    .eq("id", id).eq("tenant_id", tenantId)
    .select("id");

  if (error) {
    await trackUsage(guard, req, { module: "stok", action: "action_failed", failedAction: "record_deleted", subEntity: "accessory", errorClass: "server" });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: "Stok kaydı bulunamadı veya bu tenant'a ait değil." }, { status: 404 });
  }
  await trackUsage(guard, req, { module: "stok", action: "record_deleted", subEntity: "accessory", resourceId: id });
  return NextResponse.json({ ok: true, id });
}
