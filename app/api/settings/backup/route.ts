import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * Yedek kapsamındaki tablolar.
 *
 * Hariç tutulanlar ve nedenleri:
 *  - aromatherapy_reference_rows → tenant_id yok; sheet_id FK ile erişim gerekiyor (V3)
 *  - stone_exclusions            → UI tercihi, iş verisi değil (text tenant_id, farklı PK)
 *  - hacamat_rules               → Global admin tablosu, tenant_id yok
 *  - human_design_knowledge      → Semi-global kütüphane (tenant_id IS NULL kayıtlar da var)
 *  - stone_knowledge_articles    → Admin kütüphanesi, paylaşımlı
 *  - stone_knowledge_categories  → Admin kütüphanesi, paylaşımlı
 *  - belge_ceviri_jobs           → Geçici iş kaydı, kalıcı veri değil
 *  - user_sessions               → Güvenlik logları / aktif oturum yönetimi
 *  - security_events             → Güvenlik logları
 *  - client_stone_photos         → Storage bucket dosyaları (V3)
 *  - personal_archive_files içerik → Storage bucket (V3)
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

  // ── Aromaterapi ──────────────────────────────────────────────────────────────
  "aromatherapy_oils",
  "aromatherapy_knowledge_articles",
  "aromatherapy_reference_sheets",

  // ── Şifa Rehberi ─────────────────────────────────────────────────────────────
  "healing_guides",

  // ── Destek Mesajları (iletişim kaydı; restore'a dahil değil) ─────────────────
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
    version: "2.0",
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
