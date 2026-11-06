/**
 * planet-store-harness YARDIMCI İŞÇİSİ — ayrı bir "sunucu örneği" benzetimi (worker_threads: modül durumu / süreç önbelleği /
 * istek birleştirme AYRI; DB (L2 tablo + kilit RPC'si) ORTAK). Sahte Roxy; ağ çağrısı yalnız yerel test PostgREST'ine.
 */
import { parentPort, workerData } from "node:worker_threads";
import { createClient } from "@supabase/supabase-js";
import { resolveGeneralTransit, type TransitResolveMetric } from "../../lib/human-design/transit/resolveTransit";
import { createSupabasePlanetStore } from "../../lib/human-design/transit/transitPlanetStore";
import pg from "pg";
import { rateLimitBucket } from "../../lib/security/dbRateLimit";
import type { RoxyCallResult } from "../../lib/human-design/providers/roxy/client";
import { fakePlanetsResponse } from "./fakeRoxyTransit";

type Job = { url: string; serviceKey: string; pgPort: number; utcIso: string; n: number; providerDelayMs: number; providerMode: "ok" | "500"; waitBudgetMs: number; userPrefix: string };
const job = workerData as Job;
process.env.RATE_LIMIT_SECRET = "zz-planet-store-harness-rl-secret";
const db = createClient(job.url, job.serviceKey, { auth: { persistSession: false } });
const store = createSupabasePlanetStore(db);
// Kilit / kota: GERÇEK auth_rate_limit_hit SQL fonksiyonu (ana harness ile aynı gerekçe).
const rlPool = new pg.Pool({ host: "127.0.0.1", port: job.pgPort, user: "postgres", password: "testpw", database: "postgres", max: 4 });
rlPool.on("error", () => undefined);
async function dbRateLimit(bucket: string, limit: number, windowSeconds: number) {
  const r = await rlPool.query("select public.auth_rate_limit_hit($1, $2, $3) as v", [bucket, limit, windowSeconds]);
  const v = r.rows[0].v as { allowed: boolean; retry_after: number };
  return { allowed: v.allowed === true, retryAfterSec: Math.max(0, Number(v.retry_after) || 0) };
}

async function main() {
  const metrics: Record<string, number> = {};
  let providerCalls = 0;
  const lat: number[] = [];
  const results: string[] = [];
  const utc = new Date(job.utcIso);
  await Promise.all(Array.from({ length: job.n }, async (_, i) => {
    const t0 = performance.now();
    try {
      const r = await resolveGeneralTransit(utc, {
        config: { apiKey: "zz-fake", baseUrl: "https://example.invalid" },
        callPlanets: async (): Promise<RoxyCallResult> => {
          providerCalls++;
          await new Promise((res) => setTimeout(res, job.providerDelayMs));
          if (job.providerMode === "500") return { ok: false, kind: "server_error", status: 500 };
          return { ok: true, raw: fakePlanetsResponse(job.utcIso.replace(".000Z", "Z")) };
        },
        rateLimit: (scope, value, limit, windowSeconds) => dbRateLimit(rateLimitBucket(scope, value), limit, windowSeconds),
        userId: `${job.userPrefix}-u${i % 7}`,
        tenantId: `${job.userPrefix}-t${i % 3}`,
        planetStore: store,
        waitBudgetMs: job.waitBudgetMs,
        metrics: (m: TransitResolveMetric) => { metrics[m] = (metrics[m] ?? 0) + 1; },
      });
      results.push(r.resolution + (r.reason ? `:${r.reason}` : ""));
    } catch (e) {
      results.push(`throw:${(e as Error)?.constructor?.name}`);
    }
    lat.push(performance.now() - t0);
  }));
  await rlPool.end().catch(() => undefined);
  parentPort!.postMessage({ providerCalls, metrics, lat, results });
}
void main();
