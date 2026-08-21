import { makeCitationCollection } from "@/lib/cupping/citationApi";

/** /api/kupa/citations/point — tipli citation junction (paylaşılan fabrika; requireModuleAccess("cupping")). */
export const runtime = "nodejs";

const handlers = makeCitationCollection("point");
export const GET = handlers.GET;
export const POST = handlers.POST;
