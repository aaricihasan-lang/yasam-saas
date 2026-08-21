import { makeCitationItem } from "@/lib/cupping/citationApi";

/** /api/kupa/citations/knowledge/[id] — citation güncelle (meta) / sil (paylaşılan fabrika). */
export const runtime = "nodejs";

const handlers = makeCitationItem("knowledge");
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
