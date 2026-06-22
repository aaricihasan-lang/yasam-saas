import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * Geri yüklenebilir tablolar.
 *
 * support_messages: kasıtlı hariç (iletişim kaydı).
 * aromatherapy_reference_rows: whitelist'te ama generik döngüde değil — Faz 2'de özel işlenir.
 *
 * Güvenlik:
 *  - Whitelist dışı tablo adı → 400.
 *  - tenant_id her satırda server'dan override edilir (rows hariç — tenant_id kolonu yok).
 *  - user_id: satırda varsa server'dan override edilir.
 *  - id çakışmaları (ignoreDuplicates) sessizce atlanır.
 *  - Hiçbir tablo silinmez.
 */
const ALLOWED_TABLES = new Set<string>([
  // Danışan Yolculuğu
  "clients",
  "client_notes",
  "appointments",
  "client_sessions",
  "client_homeworks",
  "client_analyses",
  "client_stones",
  // Numeroloji
  "numerology_records",
  "numerology_knowledge_records",
  "numerology_stone_assignments",
  // Human Design
  "human_design_clients",
  "human_design_charts",
  "human_design_knowledge_records",
  "human_design_reports",
  // Doğaltaş
  "stones",
  "minerals",
  "combinations",
  "dogaltas_inventory",
  // Dijital İçerik
  "personal_archives",
  "personal_archive_files",
  // Biyoenerji
  "bioenergy_sessions",
  "bioenergy_symbols",
  "bioenergy_imaginations",
  "bioenergy_chakras",
  "bioenergy_energy_bodies",
  "bioenergy_subconscious_causes",
  // Refleksoloji
  "reflexology_protocols",
  // Aromaterapi
  "aromatherapy_oils",
  "aromatherapy_knowledge_articles",
  "aromatherapy_reference_sheets",
  "aromatherapy_reference_rows", // Faz 2'de işlenir — tenant_id yok, orphan kontrolü var
  // Şifa Rehberi
  "healing_guides",
  // support_messages intentionally excluded
]);

const ROWS_TABLE = "aromatherapy_reference_rows";

type TableSummary = {
  inserted: number;
  skipped: number;
  error: string | null;
  orphaned?: number;
  orphanedSheetIds?: string[];
};

type BackupPayload = {
  version: string;
  tenant_id: string;
  tables: Record<string, Record<string, unknown>[]>;
};

/**
 * POST /api/settings/restore
 * JSON yedeğini güvenli modda içe aktar.
 * Desteklenen versiyonlar: 1.0, 2.0, 2.1
 */
export async function POST(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  if (guard.is_demo_account) {
    return NextResponse.json(
      { error: "Demo hesabında bu işlem kullanılamaz." },
      { status: 403 },
    );
  }
  const { userId, tenantId, db } = guard;

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

  const ACCEPTED_VERSIONS = new Set(["1.0", "2.0", "2.1"]);
  if (!ACCEPTED_VERSIONS.has(backup.version)) {
    return NextResponse.json(
      { error: `Desteklenmeyen yedek versiyonu: ${String(backup.version)}` },
      { status: 400 },
    );
  }

  if (!backup.tables || typeof backup.tables !== "object") {
    return NextResponse.json({ error: "Yedek yapısı geçersiz." }, { status: 400 });
  }

  const tableNames = Object.keys(backup.tables);

  if (tableNames.length === 0) {
    return NextResponse.json({ ok: true, summary: {} });
  }

  const unknownTables = tableNames.filter((t) => !ALLOWED_TABLES.has(t));
  if (unknownTables.length > 0) {
    return NextResponse.json(
      { error: `İzin verilmeyen tablolar: ${unknownTables.join(", ")}` },
      { status: 400 },
    );
  }

  const summary: Record<string, TableSummary> = {};

  // ── Faz 1: Tüm tablolar (aromatherapy_reference_rows hariç) ──────────────────
  const mainTables = tableNames.filter((t) => t !== ROWS_TABLE);

  for (const table of mainTables) {
    const rows = backup.tables[table];
    if (!Array.isArray(rows)) {
      summary[table] = { inserted: 0, skipped: 0, error: "Geçersiz veri formatı." };
      continue;
    }
    if (rows.length === 0) {
      summary[table] = { inserted: 0, skipped: 0, error: null };
      continue;
    }

    let inserted = 0;
    let skipped = 0;

    for (const rawRow of rows) {
      if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
        skipped++;
        continue;
      }

      const row = { ...(rawRow as Record<string, unknown>) };
      row.tenant_id = tenantId;
      if ("user_id" in row) row.user_id = userId;

      const { data: upsertData, error } = await db
        .from(table)
        .upsert(row, { ignoreDuplicates: true })
        .select("id");

      if (error) skipped++;
      else if (upsertData && upsertData.length > 0) inserted++;
      else skipped++;
    }

    summary[table] = { inserted, skipped, error: null };
  }

  // ── Faz 2: aromatherapy_reference_rows — orphan kontrolü + sheet_id doğrulama ─
  if (tableNames.includes(ROWS_TABLE)) {
    const backupRows = backup.tables[ROWS_TABLE];

    if (!Array.isArray(backupRows) || backupRows.length === 0) {
      summary[ROWS_TABLE] = { inserted: 0, skipped: 0, orphaned: 0, orphanedSheetIds: [], error: null };
    } else {
      // Faz 1 sonrası bu tenant'a ait güncel sheet ID'lerini çek
      const { data: tenantSheets } = await db
        .from("aromatherapy_reference_sheets")
        .select("id")
        .eq("tenant_id", tenantId);

      const validSheetIds = new Set(
        (tenantSheets ?? []).map((s) => s.id as string),
      );

      let inserted = 0;
      let skipped = 0;
      let orphaned = 0;
      const orphanedSheetIds: string[] = [];

      for (const rawRow of backupRows) {
        if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
          skipped++;
          continue;
        }

        const row = rawRow as Record<string, unknown>;
        const sheetId = row.sheet_id as string | undefined;

        // Orphan kontrolü: parent sheet bu tenant'a ait değil
        if (!sheetId || !validSheetIds.has(sheetId)) {
          orphaned++;
          if (sheetId && !orphanedSheetIds.includes(sheetId)) {
            orphanedSheetIds.push(sheetId);
          }
          continue;
        }

        // tenant_id YAZILMAZ — tabloda bu kolon yok
        const cleanRow = { ...row };
        delete cleanRow.tenant_id;
        delete cleanRow.user_id;

        const { data: upsertData, error } = await db
          .from(ROWS_TABLE)
          .upsert(cleanRow, { ignoreDuplicates: true })
          .select("id");

        if (error) skipped++;
        else if (upsertData && upsertData.length > 0) inserted++;
        else skipped++;
      }

      summary[ROWS_TABLE] = {
        inserted,
        skipped,
        orphaned,
        orphanedSheetIds: orphanedSheetIds.length > 0 ? orphanedSheetIds : undefined,
        error: null,
      };
    }
  }

  return NextResponse.json({ ok: true, summary });
}
