import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

const BACKUP_TABLES = [
  "clients",
  "stones",
  "numerology_analyses",
  "personal_archives",
] as const;

/**
 * GET /api/settings/backup
 * Kullanıcının kendi verilerini JSON olarak indirir.
 * Header: x-user-id
 */
export async function GET(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { tenantId, db } = guard;

  const result: Record<string, unknown[]> = {};

  await Promise.allSettled(
    BACKUP_TABLES.map(async (table) => {
      const { data } = await db
        .from(table)
        .select("*")
        .eq("tenant_id", tenantId)
        .limit(2000);
      result[table] = data ?? [];
    }),
  );

  const payload = {
    version: "1.0",
    exported_at: new Date().toISOString(),
    tenant_id: tenantId,
    tables: result,
  };

  const json = JSON.stringify(payload, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="yasam-yedek-${dateStr}.json"`,
    },
  });
}
