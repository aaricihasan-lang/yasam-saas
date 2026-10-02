import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CITATION_SPECS, CUPPING_TABLES, type CitationEntity } from "@/lib/cupping/fields";
import { assertOwnedRef, cuppingError } from "@/lib/cupping/api";

export const runtime = "nodejs";

/**
 * /api/kupa/sources/[id]/usage — READ-ONLY kaynak silme ETKİSİ (P2-3).
 *
 * Kaynak silinince 6 atıf tablosundaki bağlı atıflar DB'de CASCADE ile silinir; protokol
 * kaynakları ve protokol bilgileri ise RESTRICT ile silmeyi ENGELLER. Silme onayında kullanıcıya
 * GERÇEK kapsam gösterilsin diye sayılar DB'den, tenant-bağlı olarak hesaplanır.
 *   - requireModuleAccess("cupping"); tenant SUNUCUDA; kaynak sahipliği doğrulanır (enumerasyon yok)
 *   - herhangi bir sayım başarısızsa 500 → istemci YANLIŞ/EKSİK sayı göstermez, silmeyi açmaz
 */

const DB_FAIL = "Kaynağın kullanım bilgisi alınamadı. Lütfen tekrar deneyin.";

async function countWhere(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  sourceId: string,
): Promise<number | null> {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("source_id", sourceId);
  if (error || typeof count !== "number") return null;
  return count;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!id) return cuppingError(400, "Kaynak id gerekli.");
  const { db, tenantId } = guard;

  if (!(await assertOwnedRef(db, CUPPING_TABLES.sources, tenantId, id))) {
    return cuppingError(404, "Kaynak bu hesaba ait değil veya bulunamadı.");
  }

  const entities = Object.keys(CITATION_SPECS) as CitationEntity[];
  const [citationCounts, protocolSources, protocolEntries] = await Promise.all([
    Promise.all(entities.map((e) => countWhere(db, CITATION_SPECS[e].table, tenantId, id))),
    countWhere(db, CUPPING_TABLES.protocolSources, tenantId, id),
    countWhere(db, CUPPING_TABLES.protocolEntries, tenantId, id),
  ]);
  if (citationCounts.some((c) => c === null) || protocolSources === null || protocolEntries === null) {
    return cuppingError(500, DB_FAIL);
  }

  const citations = Object.fromEntries(entities.map((e, i) => [e, citationCounts[i] as number])) as Record<CitationEntity, number>;
  const citationTotal = (citationCounts as number[]).reduce((a, b) => a + b, 0);
  return NextResponse.json({
    ok: true,
    usage: { citations, citationTotal, protocolSources, protocolEntries },
  });
}
