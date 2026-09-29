import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { pdfTranslateFunction } from "@/lib/inngest/functions/pdfTranslate";
import { yhOutboxWorkerFunction } from "@/lib/inngest/functions/yhOutboxWorker";
import { yhClientOutboxWorkerFunction } from "@/lib/inngest/functions/yhClientOutboxWorker";
import { yhReconcileFunction } from "@/lib/inngest/functions/yhReconcile";
import { expertStorageSnapshotFunction } from "@/lib/inngest/functions/expertStorageSnapshot";
import { videoTempCleanupFunction } from "@/lib/inngest/functions/videoTempCleanup";
import { usage360RetentionFunction } from "@/lib/inngest/functions/usage360Retention";
import { securityIpRetentionFunction } from "@/lib/inngest/functions/securityIpRetention";

export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    pdfTranslateFunction,
    yhOutboxWorkerFunction,
    yhClientOutboxWorkerFunction,
    yhReconcileFunction,
    // FAZ 1 İP-5 — günlük depolama snapshot (PRODUCTION VARSAYILAN KAPALI, env-gated).
    expertStorageSnapshotFunction,
    // FAZ1 FINAL HARDENING — günlük video-temp temizliği (VARSAYILAN KAPALI, env-gated).
    videoTempCleanupFunction,
    // USAGE360 — telemetri retention temizliği (VARSAYILAN KAPALI, USAGE360_RETENTION_ENABLED).
    usage360RetentionFunction,
    // GÜVENLİK — 90 günden eski ham IP → NULL (VARSAYILAN KAPALI, SECURITY_IP_RETENTION_ENABLED).
    securityIpRetentionFunction,
  ],
});
