// Yaşam Hafızası™ — S2.12A İndeks Smoke CLI (ince adapter; MODEL B fail-closed).
//
// S2.05–S2.11 zincirini kontrollü DOĞRULAMAK için CLI. Çekirdek mantık
// `indexSmokePlan.ts`'te (test edilir). VARSAYILAN (--execute yok) hiçbir DB
// bağlantısı kurmaz.
//
// ⚠️ MODEL B: Gerçek WRITE ve gerçek CLEANUP-DELETE her ortamda fail-closed devre
// dışıdır (bkz. indexSmokePlan başlığı). Bu CLI'de indeks WRITE veya DELETE sorgusu
// BULUNMAZ — yalnız salt-okuma (dry-run indexSourcePage + cleanup sayımı + demo
// kontrolü). Gerçek write/cleanup yeteneği ancak izolasyon/provenance sağlayan
// sonraki bir aşamada eklenebilir.
//
// Kullanım (yalnız --execute + tüm kilitler):
//   npx tsx scripts/yh-index-smoke.ts --execute --environment=<local|staging|production> \
//     --phase=<dry-run|cleanup> --source-key=<key> --tenant-id=<uuid> \
//     --test-record-id=<uuid> [--after-id=<cursor>] [--limit=<1..500>] --confirmation=<ifade>
//   (--phase=write ve --cleanup-confirmation her durumda fail-closed reddedilir.)

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerDb } from "@/lib/supabase-server";
import { YH_TABLES } from "@/lib/yasam-hafizasi/config";
import { indexSourcePage } from "@/lib/yasam-hafizasi/indexer/indexSourcePage";
import { runIndexSmoke, type SmokeArgs, type SmokeDeps, type ValidatedSmokeActivation } from "@/lib/yasam-hafizasi/indexer/indexSmokePlan";
import type { IndexDbClient } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";

// ─── Argv parse (yalnız --key=value + bare --execute) ────────────────────────
function parseArgs(argv: readonly string[]): SmokeArgs {
  const map = new Map<string, string>();
  let execute = false;
  for (const a of argv) {
    if (a === "--execute") {
      execute = true;
      continue;
    }
    const m = /^--([a-z-]+)=(.*)$/.exec(a);
    if (m) map.set(m[1], m[2]);
  }
  const num = map.get("limit");
  return {
    execute,
    environment: map.get("environment"),
    phase: map.get("phase"),
    sourceKey: map.get("source-key"),
    tenantId: map.get("tenant-id"),
    testRecordId: map.get("test-record-id"),
    afterId: map.has("after-id") ? (map.get("after-id") as string) : null,
    limit: num === undefined ? undefined : Number(num),
    confirmation: map.get("confirmation"),
    cleanupConfirmation: map.get("cleanup-confirmation"),
  };
}

// ─── Gerçek deps — getServerDb LAZY; SALT-OKUMA (write/delete sorgusu YOK) ────
function makeRealDeps(): SmokeDeps {
  let client: SupabaseClient | null = null;
  const db = (): SupabaseClient => {
    if (client === null) client = getServerDb();
    return client;
  };
  return {
    // Yalnız BOOLEAN env varlığı (değer okunmaz/loglanmaz).
    hasCredentials: () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),

    // Error-aware, fail-closed demo tenant kontrolü (salt-okuma).
    checkDemoTarget: async ({ tenantId }) => {
      try {
        const { data, error } = await db().from("users").select("id").eq("tenant_id", tenantId).eq("is_demo_account", true).limit(1).maybeSingle();
        if (error) return { ok: false, code: "demo-check-failed" };
        return { ok: true, isDemo: data != null };
      } catch {
        return { ok: false, code: "demo-check-failed" };
      }
    },

    // S2.10 çekirdeği — YALNIZ dry-run (mode sabit; indeks WRITE çağrılmaz).
    runDryRunPage: (v: ValidatedSmokeActivation) =>
      indexSourcePage({ config: v.config, afterId: v.afterId, limit: v.limit, mode: "dry-run", db: db() as unknown as IndexDbClient }),

    // Cleanup hedef SAYIMI (salt-okuma; index.source_id=testRecordId). DELETE YOK.
    countCleanupTargets: async ({ sourceTable, testRecordId }) => {
      const { count, error } = await db().from(YH_TABLES.index).select("id", { count: "exact", head: true }).eq("source_table", sourceTable).eq("source_id", testRecordId);
      if (error) throw new Error("count-failed");
      return { count: count ?? 0 };
    },
  };
}

function printHelp(): void {
  console.log("YH index smoke (MODEL B) — VARSAYILAN: plan-only (DB bağlantısı YOK).");
  console.log("İzin verilen: plan-only · dry-run (salt-okuma) · cleanup sayımı.");
  console.log("Gerçek write ve gerçek cleanup-delete HER ORTAMDA fail-closed devre dışıdır (izolasyon/provenance kanıtlanamaz).");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.execute) {
    printHelp();
    const outcome = await runIndexSmoke(args, makeRealDeps()); // plan-only: dep/DB çağrısı yok
    console.log(JSON.stringify({ status: outcome.status, exitCode: outcome.exitCode }));
    process.exit(outcome.exitCode);
  }

  const outcome = await runIndexSmoke(args, makeRealDeps());
  // Yalnız GÜVENLİ alanlar (redakte summary + status + sabit kod); ham içerik/id/cursor YOK.
  console.log(
    JSON.stringify({
      status: outcome.status,
      code: outcome.code,
      exitCode: outcome.exitCode,
      summary: outcome.summary,
      targetFingerprint: outcome.targetFingerprint,
      cleanupTargetCount: outcome.cleanupTargetCount,
    }),
  );
  process.exit(outcome.exitCode);
}

main().catch((e) => {
  console.error(JSON.stringify({ status: "rejected", code: "unexpected-error", exitCode: 2 }));
  void e;
  process.exit(2);
});
