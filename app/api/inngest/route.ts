import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { pdfTranslateFunction } from "@/lib/inngest/functions/pdfTranslate";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [pdfTranslateFunction],
});
