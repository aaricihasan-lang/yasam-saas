import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * Kullanıcıya ait tüm tenant-izole tabloların listesi.
 *
 * Dahil edilmeyen tablolar ve nedenler:
 *  - hacamat_rules              → global admin tablosu, tenant_id yok
 *  - human_design_knowledge     → semi-global kütüphane (tenant_id IS NULL olabilir)
 *  - stone_knowledge_articles   → admin kütüphanesi, paylaşımlı içerik
 *  - stone_knowledge_categories → admin kütüphanesi, paylaşımlı içerik
 *  - client_stone_photos        → storage bucket dosyaları (ayrı faz)
 *  - personal_archive_files dosya içerikleri → storage bucket (ayrı faz)
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

  // ── Dijital İçerik (metadata; dosya içerikleri storage'da) ──────────────────
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

  // ── Aromaterapi (sadece tenant'a ait kayıtlar; global null satırlar hariç) ──
  "aromatherapy_oils",

  // ── Şifa Rehberi ─────────────────────────────────────────────────────────────
  "healing_guides",
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

  const result: Partial<Record<BackupTable, unknown[]>> = {};

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
    table_count: BACKUP_TABLES.length,
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
