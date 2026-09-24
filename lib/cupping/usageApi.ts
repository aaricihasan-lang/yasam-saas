import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES } from "@/lib/cupping/fields";
import { assertOwnedRef, cuppingError } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * K11 — "Kullanıldığı Protokoller" READ-ONLY usage route fabrikası (PAYLAŞILAN).
 *
 * `techniques/[id]/protocols` (FAZ 4) deseninin genelleştirilmişidir; nokta ve güvenlik master'ları
 * için AYNI garantilerle yeniden kullanılır:
 *   - requireModuleAccess("cupping") → gate + tenant server-derived
 *   - master kaydın tenant-sahipliği doğrulanır (cross-tenant enumerasyon YOK)
 *   - protokol başlıkları YALNIZ aynı tenant'tan (cross-tenant başlık sızıntısı YOK)
 *   - N+1 YOK: (1) junction satırları, (2) tek IN sorgusu
 *   - ham DB hatası sızmaz (cuppingError sabit mesaj)
 */

const DB_FAIL = "İşlem tamamlanamadı. Lütfen tekrar deneyin.";

type UsageSpec = {
  /** Master varlık tablosu (sahiplik doğrulaması için). */
  entityTable: string;
  /** İlişki (junction) tablosu (ör. cupping_protocol_points). */
  junctionTable: string;
  /** Junction'daki master FK kolonu (ör. point_id / safety_id). */
  fkColumn: string;
  /** Sahiplik doğrulanamazsa 404 mesajı. */
  notFound: string;
  /** id path param eksikse 400 mesajı. */
  idRequired: string;
};

export function makeProtocolUsageRoute(spec: UsageSpec) {
  async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<Response> {
    const guard = await requireModuleAccess(req, "cupping");
    if (!guard.ok) return guard.response;
    const { id } = await params;
    if (!id) return cuppingError(400, spec.idRequired);
    const { db, tenantId } = guard;

    // Master bu tenant'a ait GERÇEK bir kayıt mı? (cross-tenant enumerasyonu engeller)
    if (!(await assertOwnedRef(db, spec.entityTable, tenantId, id))) {
      return cuppingError(404, spec.notFound);
    }

    // (1) Bu master'ı içeren ilişki satırları (yalnız protocol_id).
    const relRes = await db
      .from(spec.junctionTable)
      .select("protocol_id")
      .eq("tenant_id", tenantId)
      .eq(spec.fkColumn, id);
    if (relRes.error) return cuppingError(500, DB_FAIL);

    const protocolIds = Array.from(
      new Set(
        (relRes.data ?? [])
          .map((r) => (r as { protocol_id: string }).protocol_id)
          .filter(Boolean),
      ),
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

  return { GET };
}
