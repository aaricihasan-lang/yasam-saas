import { makeCitationCollection } from "@/lib/cupping/citationApi";

/** /api/kupa/citations/knowledge — tipli citation junction (paylaşılan fabrika; requireModuleAccess("cupping")). */
export const runtime = "nodejs";

const handlers = makeCitationCollection("knowledge");
export const GET = handlers.GET;
export const POST = handlers.POST;
