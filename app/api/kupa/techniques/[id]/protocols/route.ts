import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES } from "@/lib/cupping/fields";
import { assertOwnedRef, cuppingError } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/techniques/[id]/protocols — READ-ONLY "Kullanıldığı Protokoller" (FAZ 4).
 *
 * Bu tekniği kullanan protokollerin SADE metadata'sı (id/title/category/is_active).
 * N+1 YOK: (1) protocol_techniques ilişki satırları, (2) tek IN sorgusu ile protokoller.
 * Tenant server-forced; teknik sahipliği doğrulanır; cross-tenant başlık sızıntısı YOK.
 * Ham DB hatası client'a sızmaz (cuppingError sabit mesaj).
 */

const DB_FAIL = "İşlem tamamlanamadı. Lütfen tekrar deneyin.";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Teknik id gerekli.");
  const { db, tenantId } = guard;

  // Teknik bu tenant'a ait GERÇEK bir kayıt mı? (cross-tenant enumerasyonu engeller)
  if (!(await assertOwnedRef(db, CUPPING_TABLES.techniques, tenantId, id))) {
    return cuppingError(404, "Teknik bu hesaba ait değil veya bulunamadı.");
  }

  // (1) Bu tekniği içeren ilişki satırları (yalnız protocol_id).
  const relRes = await db
    .from(CUPPING_TABLES.protocolTechniques)
    .select("protocol_id")
    .eq("tenant_id", tenantId)
    .eq("technique_id", id);
  if (relRes.error) return cuppingError(500, DB_FAIL);

  const protocolIds = Array.from(
    new Set((relRes.data ?? []).map((r) => (r as { protocol_id: string }).protocol_id).filter(Boolean)),
  );
  if (protocolIds.length === 0) return NextResponse.json({ ok: true, protocols: [] });

  // (2) Tek IN sorgusu ile SADE protokol metadata'sı (tenant-bağlı).
  const protoRes = await db
    .from(CUPPING_TABLES.protocols)
    .select("id, title, category, is_active")
    .eq("tenant_id", tenantId)
    .in("id", protocolIds)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  if (protoRes.error) return cuppingError(500, DB_FAIL);

  return NextResponse.json({ ok: true, protocols: protoRes.data ?? [] });
}
