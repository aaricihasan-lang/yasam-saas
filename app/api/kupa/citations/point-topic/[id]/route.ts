import { makeCitationItem } from "@/lib/cupping/citationApi";

/** /api/kupa/citations/point-topic/[id] — citation güncelle (meta) / sil (paylaşılan fabrika). */
export const runtime = "nodejs";

const handlers = makeCitationItem("point-topic");
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
