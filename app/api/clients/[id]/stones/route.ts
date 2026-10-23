import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { serverErrorResponse, logServerError } from "@/lib/http/apiError";
import { trackUsage } from "@/lib/usage/trackUsage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteStoneAndPhotos, STONE_PHOTO_BUCKET } from "@/lib/clients/stonePhotoStorage";
import { demoReadOnlyResponse } from "@/lib/auth/demoReadOnly";
import { validateStoneWrite } from "@/lib/danisan/subRecordValidation";
import { casResponses, casUpdate, readRowVersion } from "@/lib/danisan/rowVersion";

export const runtime = "nodejs";

/**
 * /api/clients/[id]/stones — bir danışanın taş kayıtları (client_stones)
 * (C2-B1a read + C2-B1b write).
 *
 * Güvenlik:
 *   - requireModuleAccess → binding. tenant_id SUNUCUDA.
 *   - Önce client_id'nin bu tenant'a ait olduğu doğrulanır (IDOR).
 *   - Tüm sorgu/insert/update/delete tenant_id + client_id ile bağlanır.
 *   - PATCH/DELETE hedef satır id'si body/query'den; filtre id + tenant_id + client_id.
 *   - Body'deki tenant_id/id/client_id/created_at yok sayılır.
 *   - Demo hesap: Supabase'e yazma yapılmaz.
 */

// AŞAMA 2 / D1 (DY-04 ≡ CLI-F02): yasak listesi (deny-list) yerine İZİN LİSTESİ +
// alan doğrulaması (lib/danisan/subRecordValidation). Bilinmeyen/legacy anahtarlar yazılmaz;
// tenant_id/client_id sunucuda zorlanır; geçersiz değer → 400 (DB'ye yazılmaz).

async function clientBelongsToTenant(
  db: SupabaseClient,
  clientId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

// ─── GET ────────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId } = guard;
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  const { data, error } = await db
    .from("client_stones")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("client_id", clientId);

  if (error) {
    return serverErrorResponse({ route: "clients/[id]/stones", action: "GET", tenantId, cause: error });
  }
  return NextResponse.json({ ok: true, stones: data ?? [] });
}

// ─── POST ───────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const verdict = validateStoneWrite(body, "create");
  if (!verdict.ok) {
    return NextResponse.json(
      { ok: false, code: verdict.code, field: verdict.field, error: verdict.error },
      { status: 400 },
    );
  }
  const fields = verdict.fields;
  const { data, error } = await db
    .from("client_stones")
    .insert({ ...fields, tenant_id: tenantId, client_id: clientId })
    .select()
    .single();

  if (error) {
    return serverErrorResponse({
      route: "clients/[id]/stones",
      action: "POST",
      tenantId,
      cause: error,
      usage: { guard, req, module: "clients", failedAction: "record_created", subEntity: "stone" },
    });
  }
  const newStoneId = (data as { id?: unknown } | null)?.id;
  await trackUsage(guard, req, {
    module: "clients",
    action: "record_created",
    subEntity: "stone",
    resourceId: newStoneId != null ? String(newStoneId) : null,
  });
  return NextResponse.json({ ok: true, stone: data });
}

// ─── PATCH ──────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const rowId = body.id != null ? String(body.id) : "";
  if (!rowId) {
    return NextResponse.json({ ok: false, error: "Kayıt id gerekli." }, { status: 400 });
  }

  const verdict = validateStoneWrite(body, "patch");
  if (!verdict.ok) {
    return NextResponse.json(
      { ok: false, code: verdict.code, field: verdict.field, error: verdict.error },
      { status: 400 },
    );
  }
  const fields = verdict.fields;

  // DY-03 (AŞAMA 2): ATOMİK sürüm kontrolü — sürüm zorunlu; tek koşullu UPDATE (row_version).
  const expected = readRowVersion(body as Record<string, unknown>);
  if (expected === null) {
    const r = casResponses.required();
    return NextResponse.json(r.body, { status: r.status });
  }
  const cas = await casUpdate(db, "client_stones", { id: rowId, tenantId, clientId, expected, patch: fields, select: "*" });
  if (cas.kind === "error") {
    return serverErrorResponse({
      route: "clients/[id]/stones",
      action: "PATCH",
      tenantId,
      cause: cas.error,
      usage: { guard, req, module: "clients", failedAction: "record_updated", subEntity: "stone" },
    });
  }
  if (cas.kind === "unavailable") {
    const r = casResponses.unavailable();
    return NextResponse.json(r.body, { status: r.status });
  }
  if (cas.kind === "not_found") {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }
  if (cas.kind === "conflict") {
    await trackUsage(guard, req, { module: "clients", action: "action_failed", failedAction: "record_updated", subEntity: "stone", errorClass: "conflict" });
    const r = casResponses.conflict(cas.current);
    return NextResponse.json(r.body, { status: r.status });
  }
  const data = cas.row;
  await trackUsage(guard, req, { module: "clients", action: "record_updated", subEntity: "stone", resourceId: rowId });
  return NextResponse.json({ ok: true, stone: data });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────────
// GÜVENLİK: yalnız TEK kayıt silinir. Hedef satır id'si query (?id=) veya body'den
// alınır. id yoksa 400 döner — implicit "tümünü sil" yolu KALDIRILDI (boş/bozuk
// istek danışanın tüm taşlarını + fotoğraflarını silemez). Silme filtresi
// id + tenant_id + client_id; fotoğraf temizliği yalnız hedef taşla sınırlıdır.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return guard.response;

  const { id: clientId } = await params;
  if (!clientId) {
    return NextResponse.json({ ok: false, error: "client_id gerekli." }, { status: 400 });
  }

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return demoReadOnlyResponse();
  if (!(await clientBelongsToTenant(db, clientId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Danışan bu hesaba ait değil." }, { status: 403 });
  }

  let rowId = new URL(req.url).searchParams.get("id")?.trim() || "";
  if (!rowId) {
    try {
      const body = (await req.json()) as Record<string, unknown>;
      if (body?.id != null) rowId = String(body.id).trim();
    } catch {
      /* gövde yok/bozuk — id aşağıda zorunlu tutulur */
    }
  }

  // id zorunlu: id olmadan silme YOK (implicit toplu silme kaldırıldı).
  if (!rowId) {
    return NextResponse.json(
      { ok: false, error: "Silinecek kayıt id gerekli." },
      { status: 400 },
    );
  }

  // PR #262 fix — STONE-FIRST silme (stone_id→client_stones ON DELETE CASCADE YOK):
  //   1) path'ler toplanır, 2) TAŞ silinir (başarısızsa fotoğraflara dokunulmaz →
  //   yaşayan taşın fotoğrafı KAYBOLMAZ), 3) foto satırları + referans-güvenli storage
  //   temizlenir (ortak dosya korunur). Taş silme hatası → 500 (foto bütünlüğü korunur).
  const result = await deleteStoneAndPhotos(db, {
    bucket: STONE_PHOTO_BUCKET,
    tenantId,
    clientId,
    stoneId: rowId,
  });
  if (result.error) {
    return serverErrorResponse({
      route: "clients/[id]/stones",
      action: "DELETE",
      tenantId,
      cause: result.error,
      usage: { guard, req, module: "clients", failedAction: "record_deleted", subEntity: "stone" },
    });
  }
  // Taş silindi; foto DB satırı temizliği best-effort'tur (yalnız yetim satır/blob riski,
  // yaşayan taş etkilenmez) — hata sunucu logunda kalır, işlem ok döner.
  if (result.photoCleanupError) {
    logServerError({ route: "clients/[id]/stones", action: "DELETE-photo-cleanup", tenantId, cause: result.photoCleanupError });
  }
  // D1 (DY-04): taş bulunamadı (yabancı/silinmiş/yanlış id) → 404; fotoğraflara dokunulmadı.
  if (result.stoneDeleted === 0) {
    return NextResponse.json({ ok: false, error: "Kayıt bulunamadı." }, { status: 404 });
  }
  // Tek kullanıcı eylemi (taş + fotoğrafları) = tek olay.
  await trackUsage(guard, req, { module: "clients", action: "record_deleted", subEntity: "stone", resourceId: rowId });
  return NextResponse.json({ ok: true, deleted: result.stoneDeleted });
}
