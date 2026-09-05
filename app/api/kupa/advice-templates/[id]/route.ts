import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, ADVICE_TEMPLATE_WRITABLE } from "@/lib/cupping/fields";
import {
  cuppingError,
  deleteEntity,
  getEntity,
  parseJsonBody,
  pickWritable,
  updateEntity,
} from "@/lib/cupping/api";

export const runtime = "nodejs";

/** /api/kupa/advice-templates/[id] — genel şablon oku / güncelle / arşivle / sil. */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Şablon id gerekli.");
  const res = await getEntity(guard.db, CUPPING_TABLES.adviceTemplates, guard.tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, template: res.data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Şablon id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, template: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const fields = pickWritable(parsed.data, ADVICE_TEMPLATE_WRITABLE);
  if (Object.prototype.hasOwnProperty.call(fields, "title") && !String(fields.title ?? "").trim()) {
    return cuppingError(400, "Şablon başlığı boş olamaz.");
  }

  // is_default niyeti allowlist DIŞINDA — server-side türetilir (mass-assignment yok).
  const wantsDefaultTrue = parsed.data.is_default === true;
  const wantsDefaultFalse = parsed.data.is_default === false;
  const archiving =
    Object.prototype.hasOwnProperty.call(parsed.data, "is_active") && parsed.data.is_active === false;

  // Arşivlenen şablon aktif-varsayılan KALAMAZ → normalize (is_default=false birlikte).
  if (archiving) fields.is_default = false;
  else if (wantsDefaultFalse) fields.is_default = false;

  let template: Record<string, unknown>;
  if (Object.keys(fields).length > 0) {
    const res = await updateEntity(db, CUPPING_TABLES.adviceTemplates, tenantId, id, fields);
    if (!res.ok) return res.response;
    template = res.data;
  } else if (wantsDefaultTrue && !archiving) {
    const own = await getEntity(db, CUPPING_TABLES.adviceTemplates, tenantId, id);
    if (!own.ok) return own.response;
    template = own.data;
  } else {
    return cuppingError(400, "Güncellenecek alan yok.");
  }

  // Varsayılan YAP (true) yalnız atomik RPC ile — arşivleme ile birlikte GEÇERSİZ.
  if (wantsDefaultTrue && !archiving) {
    const { data, error } = await db.rpc("cupping_advice_template_set_default_atomic", {
      p_tenant_id: tenantId,
      p_template_id: id,
    });
    if (error) {
      const code = (error as { code?: string }).code ?? "";
      if (code === "45001") return cuppingError(404, "Kayıt bu hesaba ait değil veya bulunamadı.");
      return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
    }
    template = data as Record<string, unknown>;
  }

  return NextResponse.json({ ok: true, template });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Şablon id gerekli.");
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, deleted: 0 });
  // Şablon silinince: bağlı planlar advice_template_id=NULL; danışan snapshot'ları
  // source_template_id=NULL (metin KORUNUR) — DB SET NULL FK'leri ile.
  const res = await deleteEntity(db, CUPPING_TABLES.adviceTemplates, tenantId, id);
  if (!res.ok) return res.response;
  return NextResponse.json({ ok: true, deleted: res.data });
}
