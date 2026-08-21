import { makeCitationCollection } from "@/lib/cupping/citationApi";

/** /api/kupa/citations/technique — tipli citation junction (paylaşılan fabrika; requireModuleAccess("cupping")). */
export const runtime = "nodejs";

const handlers = makeCitationCollection("technique");
export const GET = handlers.GET;
export const POST = handlers.POST;
