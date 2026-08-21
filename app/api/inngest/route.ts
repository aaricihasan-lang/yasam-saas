import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { pdfTranslateFunction } from "@/lib/inngest/functions/pdfTranslate";
import { yhOutboxWorkerFunction } from "@/lib/inngest/functions/yhOutboxWorker";
import { yhClientOutboxWorkerFunction } from "@/lib/inngest/functions/yhClientOutboxWorker";
import { yhReconcileFunction } from "@/lib/inngest/functions/yhReconcile";

export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [pdfTranslateFunction, yhOutboxWorkerFunction, yhClientOutboxWorkerFunction, yhReconcileFunction],
});
