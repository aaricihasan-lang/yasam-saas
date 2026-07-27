import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { pdfTranslateFunction } from "@/lib/inngest/functions/pdfTranslate";
import { yhOutboxWorkerFunction } from "@/lib/inngest/functions/yhOutboxWorker";

export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [pdfTranslateFunction, yhOutboxWorkerFunction],
});
