import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * Geri yüklenebilir tablolar — backup whitelist ile birebir aynı olmalı.
 *
 * support_messages geri yüklenmez (iletişim kaydı; mevcut sistem konuşmalarını
 * korumak için kasıtlı olarak hariç tutulmuştur).
 *
 * Güvenlik:
 *  - Bu listede olmayan tablo adı gönderilirse istek 400 ile reddedilir.
 *  - tenant_id değeri her satırda server tarafından override edilir.
 *  - user_id: sadece satırda bu anahtar varsa override edilir (yoksa yazılmaz).
 *  - id çakışmaları (ignoreDuplicates) sessizce atlanır → mevcut veri korunur.
 *  - Hiçbir tablo silinmez; yalnızca eksik kayıtlar eklenir.
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
  // Şifa Rehberi
  "healing_guides",
  // support_messages intentionally excluded — communications should not be re-imported
]);

type BackupPayload = {
  version: string;
  tenant_id: string;
  tables: Record<string, Record<string, unknown>[]>;
};

/**
 * POST /api/settings/restore
 * JSON yedeğini güvenli modda içe aktar.
 * - Mevcut veriler silinmez.
 * - id çakışması → skipped.
 * - Yeni kayıt → inserted.
 * Body: { backup: BackupPayload }
 * Header: x-user-id
 */
export async function POST(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
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

  // v1.0 ve v2.0 formatları kabul edilir
  if (backup.version !== "1.0" && backup.version !== "2.0") {
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

  // İzin verilmeyen tablo adı kontrolü — whitelist dışı her şey reddedilir
  const unknownTables = tableNames.filter((t) => !ALLOWED_TABLES.has(t));
  if (unknownTables.length > 0) {
    return NextResponse.json(
      { error: `İzin verilmeyen tablolar: ${unknownTables.join(", ")}` },
      { status: 400 },
    );
  }

  const summary: Record<string, { inserted: number; skipped: number; error: string | null }> = {};

  for (const table of tableNames) {
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

      // Güvenlik katmanı 1: tenant_id her zaman server değeriyle override edilir.
      row.tenant_id = tenantId;

      // Güvenlik katmanı 2: user_id, yalnızca tabloda bu kolon varsa override edilir.
      if ("user_id" in row) {
        row.user_id = userId;
      }

      const { data: upsertData, error } = await db
        .from(table)
        .upsert(row, { ignoreDuplicates: true })
        .select("id");

      if (error) {
        skipped++;
      } else if (upsertData && upsertData.length > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }

    summary[table] = { inserted, skipped, error: null };
  }

  return NextResponse.json({ ok: true, summary });
}
