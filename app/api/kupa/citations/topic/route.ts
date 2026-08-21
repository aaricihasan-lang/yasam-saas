import { makeCitationCollection } from "@/lib/cupping/citationApi";

/** /api/kupa/citations/topic — tipli citation junction (paylaşılan fabrika; requireModuleAccess("cupping")). */
export const runtime = "nodejs";

const handlers = makeCitationCollection("topic");
export const GET = handlers.GET;
export const POST = handlers.POST;
