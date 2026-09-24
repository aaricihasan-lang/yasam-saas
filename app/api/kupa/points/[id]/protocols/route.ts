import { CUPPING_TABLES } from "@/lib/cupping/fields";
import { makeProtocolUsageRoute } from "@/lib/cupping/usageApi";

/** /api/kupa/points/[id]/protocols — READ-ONLY "Kullanıldığı Protokoller" (K11). */
export const runtime = "nodejs";

const handlers = makeProtocolUsageRoute({
  entityTable: CUPPING_TABLES.points,
  junctionTable: CUPPING_TABLES.protocolPoints,
  fkColumn: "point_id",
  notFound: "Nokta bu hesaba ait değil veya bulunamadı.",
  idRequired: "Nokta id gerekli.",
});

export const GET = handlers.GET;
