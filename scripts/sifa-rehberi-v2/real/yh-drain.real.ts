/** 10. aşama — test projesindeki YH kuyruğunu GERÇEK worker ile boşaltır (yalnız guard'lı test projesi). */
import Module from "node:module";
import path from "node:path";
import { installNetworkFence, loadTestTarget, applyProcessEnv } from "./guard";
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) { return req === "server-only" ? stub : orig.call(this, req, ...rest); };
}
async function main() {
  const T = loadTestTarget();
  installNetworkFence(T);
  applyProcessEnv(T);
  const { createClient } = await import("@supabase/supabase-js");
  const { runOutboxBatch } = await import("../../../lib/yasam-hafizasi/outbox/eventProcessor");
  const { createProfessionalOutboxBatchDeps } = await import("../../../lib/yasam-hafizasi/outbox/professionalOutboxRuntime");
  const svc = createClient(T.url, T.secretKey, { auth: { persistSession: false } });
  for (let i = 0; i < 10; i++) {
    const s = await runOutboxBatch(createProfessionalOutboxBatchDeps(svc as never, "zz-sifa-yh-drain", 50));
    console.log(JSON.stringify({ claimed: s.claimed, completed: s.completed, outcomes: s.outcomes, failed: s.failedPermanent + s.failedTransient }));
    if (s.claimed === 0) break;
  }
}
main();
