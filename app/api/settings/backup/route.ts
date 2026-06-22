import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * Yedek kapsamındaki tablolar — tenant_id üzerinden doğrudan filtre uygulanabilenler.
 *
 * Hariç tutulanlar:
 *  - aromatherapy_reference_rows  → tenant_id yok; sheet_id JOIN ile ayrı sorgu (aşağıda)
 *  - stone_exclusions             → UI tercihi, iş verisi değil
 *  - hacamat_rules                → Global admin tablosu, tenant_id yok
 *  - belge_ceviri_jobs            → Geçici iş kaydı
 *  - user_sessions / security_events → Güvenlik logları
 *  - stone_knowledge_*            → Admin kütüphanesi, paylaşımlı
 */
const BACKUP_TABLES = [
  // ── Danışan Yolculuğu ───────────────────────────────────────────────────────
  "clients",
  "client_notes",
  "appointments",
  "client_sessions",
  "client_homeworks",
  "client_analyses",
  "client_stones",

  // ── Numeroloji ───────────────────────────────────────────────────────────────
  "numerology_records",
  "numerology_knowledge_records",
  "numerology_stone_assignments",

  // ── Human Design ─────────────────────────────────────────────────────────────
  "human_design_clients",
  "human_design_charts",
  "human_design_knowledge_records",
  "human_design_reports",

  // ── Doğaltaş ─────────────────────────────────────────────────────────────────
  "stones",
  "minerals",
  "combinations",
  "dogaltas_inventory",

  // ── Dijital İçerik ───────────────────────────────────────────────────────────
  "personal_archives",
  "personal_archive_files",

  // ── Enerji & Beden ───────────────────────────────────────────────────────────
  "bioenergy_sessions",
  "bioenergy_symbols",
  "bioenergy_imaginations",
  "bioenergy_chakras",
  "bioenergy_energy_bodies",
  "bioenergy_subconscious_causes",

  // ── Refleksoloji ─────────────────────────────────────────────────────────────
  "reflexology_protocols",

  // ── Aromaterapi ──────────────────────────────────────────────────────────────
  "aromatherapy_oils",
  "aromatherapy_knowledge_articles",
  "aromatherapy_reference_sheets",
  // aromatherapy_reference_rows → ayrı JOIN sorgusu (aşağıda)

  // ── Şifa Rehberi ─────────────────────────────────────────────────────────────
  "healing_guides",

  // ── Destek Mesajları (restore'a dahil değil) ─────────────────────────────────
  "support_messages",
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];

/**
 * GET /api/settings/backup
 * Kullanıcının tüm modül verilerini JSON olarak indirir.
 * Header: x-user-id
 */
export async function GET(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { tenantId, db } = guard;

  const result: Partial<Record<BackupTable, unknown[]>> & {
    aromatherapy_reference_rows?: unknown[];
  } = {};

  // Faz 1 — tenant_id ile doğrudan filtre uygulanabilen tablolar
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

  // Faz 2 — aromatherapy_reference_rows: tenant_id yok, sheet_id üzerinden JOIN
  const sheets = (result["aromatherapy_reference_sheets"] ?? []) as Record<
    string,
    unknown
  >[];
  const sheetIds = sheets.map((s) => s.id as string).filter(Boolean);

  if (sheetIds.length > 0) {
    const { data: rowsData } = await db
      .from("aromatherapy_reference_rows")
      .select("*")
      .in("sheet_id", sheetIds)
      .order("row_index", { ascending: true })
      .limit(5000);
    result["aromatherapy_reference_rows"] = rowsData ?? [];
  } else {
    result["aromatherapy_reference_rows"] = [];
  }

  const payload = {
    version: "2.1",
    exported_at: new Date().toISOString(),
    tenant_id: tenantId,
    table_count: BACKUP_TABLES.length + 1, // +1 for aromatherapy_reference_rows
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
