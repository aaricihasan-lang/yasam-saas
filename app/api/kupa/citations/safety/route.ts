import { makeCitationCollection } from "@/lib/cupping/citationApi";

/** /api/kupa/citations/safety — tipli citation junction (paylaşılan fabrika; requireModuleAccess("cupping")). */
export const runtime = "nodejs";

const handlers = makeCitationCollection("safety");
export const GET = handlers.GET;
export const POST = handlers.POST;
