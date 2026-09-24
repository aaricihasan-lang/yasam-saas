import { CUPPING_TABLES } from "@/lib/cupping/fields";
import { makeProtocolUsageRoute } from "@/lib/cupping/usageApi";

/** /api/kupa/safety/[id]/protocols — READ-ONLY "Kullanıldığı Protokoller" (K5/K11). */
export const runtime = "nodejs";

const handlers = makeProtocolUsageRoute({
  entityTable: CUPPING_TABLES.safety,
  junctionTable: CUPPING_TABLES.protocolSafety,
  fkColumn: "safety_id",
  notFound: "Güvenlik kaydı bu hesaba ait değil veya bulunamadı.",
  idRequired: "Güvenlik kaydı id gerekli.",
});

export const GET = handlers.GET;
