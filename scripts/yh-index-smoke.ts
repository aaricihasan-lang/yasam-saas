// Yaşam Hafızası™ — S2.12C İndeks Smoke CLI (ince adapter; exact-owned-record).
//
// Çekirdek mantık `indexSmokePlan.ts`'te (test edilir). VARSAYILAN (--execute yok)
// hiçbir DB bağlantısı kurmaz.
//
// ⚠️ MODEL B: gerçek WRITE ve gerçek CLEANUP-DELETE her ortamda fail-closed.
// ✅ S2.12C: dry-run artık SAYFA okumaz; `readExactOwnedRecord` DB sorgusunda
//    primaryKey=recordId VE tenantColumn=tenantId filtrelerini BİRLİKTE uygular
//    (order/limit/cursor/.gt/page/fallback YOK). Bu CLI'de indeks WRITE/DELETE yok.
//
// Kullanım (yalnız --execute + tüm kilitler):
//   npx tsx scripts/yh-index-smoke.ts --execute --environment=<local|staging|production> \
//     --phase=dry-run --source-key=biyoenerji:symbols --tenant-id=<uuid> \
//     --test-record-id=<uuid> --confirmation=<o ortamın ifadesi>

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerDb } from "@/lib/supabase-server";
import { runIndexSmoke, type SmokeArgs, type SmokeDeps } from "@/lib/yasam-hafizasi/indexer/indexSmokePlan";
import { sourceSelectColumns } from "@/lib/yasam-hafizasi/indexer/supabaseIndexAdapters";

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
  return {
    execute,
    environment: map.get("environment"),
    phase: map.get("phase"),
    sourceKey: map.get("source-key"),
    tenantId: map.get("tenant-id"),
    testRecordId: map.get("test-record-id"),
    confirmation: map.get("confirmation"),
  };
}

// ─── Gerçek deps — getServerDb LAZY; SALT-OKUMA (write/delete/page sorgusu YOK) ─
function makeRealDeps(): SmokeDeps {
  let client: SupabaseClient | null = null;
  const db = (): SupabaseClient => {
    if (client === null) client = getServerDb();
    return client;
  };
  return {
    hasCredentials: () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),

    checkDemoTarget: async ({ tenantId }) => {
      try {
        const { data, error } = await db().from("users").select("id").eq("tenant_id", tenantId).eq("is_demo_account", true).limit(1).maybeSingle();
        if (error) return { ok: false, code: "demo-check-failed" };
        return { ok: true, isDemo: data != null };
      } catch {
        return { ok: false, code: "demo-check-failed" };
      }
    },

    // EXACT-OWNED-RECORD: tek sorgu; pk=recordId VE tenant=tenantId BİRLİKTE.
    // order/limit/cursor/.gt/page/fallback/tenant'sız-ikinci-sorgu YOK.
    readExactOwnedRecord: async ({ config, tenantId, recordId }) => {
      // Yalnız column-mode allowlist kaynağı buraya ulaşır (plan gate'i garanti eder).
      if (config.tenant.mode !== "column") return { status: "error" };
      try {
        const cols = sourceSelectColumns(config).join(",");
        const { data, error } = await db()
          .from(config.tableName)
          .select(cols)
          .eq(config.primaryKey, recordId)
          .eq(config.tenant.column, tenantId)
          .maybeSingle();
        if (error) return { status: "error" }; // ham DB mesajı taşınmaz; not-found'a dönüşmez
        if (data == null) return { status: "none" };
        return { status: "row", row: { ...(data as unknown as Record<string, unknown>) } }; // shallow clone
      } catch {
        return { status: "error" };
      }
    },
  };
}

function printHelp(): void {
  console.log("YH index smoke (S2.12C) — VARSAYILAN: plan-only (DB bağlantısı YOK).");
  console.log("İzin verilen: plan-only · exact-owned-record dry-run (salt-okuma, tek kayıt).");
  console.log("Gerçek write ve cleanup-delete HER ORTAMDA fail-closed. Allowlist: biyoenerji:symbols.");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.execute) {
    printHelp();
    const outcome = await runIndexSmoke(args, makeRealDeps()); // plan-only: dep/DB çağrısı yok
    console.log(JSON.stringify({ status: outcome.status, code: outcome.code, exitCode: outcome.exitCode }));
    process.exit(outcome.exitCode);
  }

  const outcome = await runIndexSmoke(args, makeRealDeps());
  // Yalnız GÜVENLİ alanlar; ham içerik/id/cursor/DB-error YOK.
  console.log(
    JSON.stringify({ status: outcome.status, code: outcome.code, exitCode: outcome.exitCode, summary: outcome.summary, targetFingerprint: outcome.targetFingerprint }),
  );
  process.exit(outcome.exitCode);
}

main().catch((e) => {
  console.error(JSON.stringify({ status: "rejected", code: "unexpected-error", exitCode: 2 }));
  void e;
  process.exit(2);
});
