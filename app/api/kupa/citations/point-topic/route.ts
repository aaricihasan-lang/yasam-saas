import { makeCitationCollection } from "@/lib/cupping/citationApi";

/** /api/kupa/citations/point-topic — tipli citation junction (paylaşılan fabrika; requireModuleAccess("cupping")). */
export const runtime = "nodejs";

const handlers = makeCitationCollection("point-topic");
export const GET = handlers.GET;
export const POST = handlers.POST;
