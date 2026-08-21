import { makeCitationItem } from "@/lib/cupping/citationApi";

/** /api/kupa/citations/topic/[id] — citation güncelle (meta) / sil (paylaşılan fabrika). */
export const runtime = "nodejs";

const handlers = makeCitationItem("topic");
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
