import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

const ALLOWED_TABLES = new Set([
  "clients",
  "stones",
  "numerology_analyses",
  "personal_archives",
]);

type BackupPayload = {
  version: string;
  tenant_id: string;
  tables: Record<string, Record<string, unknown>[]>;
};

/**
 * POST /api/settings/restore
 * JSON yedeğini güvenli modda içe aktar (mevcut verileri silme).
 * Body: { backup: BackupPayload }
 * Header: x-user-id
 */
export async function POST(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { tenantId, db } = guard;

  let body: { backup?: unknown };
  try {
    body = (await req.json()) as { backup?: unknown };
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const backup = body.backup as BackupPayload | undefined;

  if (!backup || typeof backup !== "object") {
    return NextResponse.json({ error: "Yedek dosyası geçersiz." }, { status: 400 });
  }
  if (backup.version !== "1.0") {
    return NextResponse.json({ error: "Desteklenmeyen yedek versiyonu." }, { status: 400 });
  }
  if (!backup.tables || typeof backup.tables !== "object") {
    return NextResponse.json({ error: "Yedek yapısı geçersiz." }, { status: 400 });
  }

  const tableNames = Object.keys(backup.tables);
  const unknownTables = tableNames.filter((t) => !ALLOWED_TABLES.has(t));
  if (unknownTables.length > 0) {
    return NextResponse.json(
      { error: `İzin verilmeyen tablolar: ${unknownTables.join(", ")}` },
      { status: 400 },
    );
  }

  const summary: Record<string, { skipped: number; inserted: number; error: string | null }> = {};

  for (const table of tableNames) {
    const rows = backup.tables[table];
    if (!Array.isArray(rows)) {
      summary[table] = { skipped: 0, inserted: 0, error: "Geçersiz veri formatı." };
      continue;
    }

    let inserted = 0;
    let skipped = 0;

    for (const rawRow of rows) {
      if (!rawRow || typeof rawRow !== "object") { skipped++; continue; }
      const row = rawRow as Record<string, unknown>;

      // Güvenlik: tenant_id'yi DB'den gelen değerle zorla — client JSON'ındaki değer yok sayılır.
      // user_id ayarlanmaz: clients/stones/personal_archives tablolarında bu kolon yok.
      row.tenant_id = tenantId;

      // ON CONFLICT DO NOTHING: çakışan id atlanır; yeni satır döner → data.length > 0
      const { data: upsertData, error } = await db
        .from(table)
        .upsert(row as Record<string, unknown>, { ignoreDuplicates: true })
        .select("id");

      if (error) {
        skipped++;
      } else if (upsertData && upsertData.length > 0) {
        inserted++;
      } else {
        // ignoreDuplicates: ON CONFLICT DO NOTHING — satır zaten vardı
        skipped++;
      }
    }

    summary[table] = { inserted, skipped, error: null };
  }

  return NextResponse.json({ ok: true, summary });
}
