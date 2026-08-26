import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { CUPPING_TABLES, PROTOCOL_ENTRY_WRITABLE } from "@/lib/cupping/fields";
import { cuppingError, listEntity, parseJsonBody, pickWritable } from "@/lib/cupping/api";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * /api/kupa/protocol-entries — UNIFIED "Bilgiler" (Bölüm 7).
 *
 * TEK bilgi sınıfı: ilk gün / 6 ay sonra / kaynaklı / kaynaksız hepsi AYNI tablo, AYNI
 * statü. source_id opsiyonel (verilirse AYNI tenant). İlgili bölgeler (entry-point M:N)
 * opsiyonel. formal/personal ayrımı YOK.
 *
 * ATOMİKLİK (CREATE): entry + entry_points TEK Postgres transaction'ında
 * (RPC cupping_protocol_entry_create_atomic) oluşturulur — protocol/source/point
 * sahiplik doğrulaması yazmalarla AYNI transaction'da; herhangi bir hata TÜM işlemi
 * geri alır (hiç entry oluşmaz). Rollback'i PostgreSQL sağlar; uygulama katmanında
 * telafi/geri-alma mantığı YOKTUR (partial state YASAK).
 */

const MAX_POINTS = 50;

function parsePointIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && x && !out.includes(x)) out.push(x);
  return out;
}

async function pointsByEntry(
  db: SupabaseClient,
  tenantId: string,
  entryIds: string[],
): Promise<Record<string, string[]>> {
  const map: Record<string, string[]> = {};
  if (entryIds.length === 0) return map;
  const { data, error } = await db
    .from(CUPPING_TABLES.protocolEntryPoints)
    .select("protocol_entry_id, point_id, sort_order")
    .eq("tenant_id", tenantId)
    .in("protocol_entry_id", entryIds)
    .order("sort_order", { ascending: true });
  if (error) return map;
  for (const row of data ?? []) {
    const eid = String((row as Record<string, unknown>).protocol_entry_id);
    (map[eid] ||= []).push(String((row as Record<string, unknown>).point_id));
  }
  return map;
}

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const protocolId = req.nextUrl.searchParams.get("protocolId")?.trim();
  const res = await listEntity(db, CUPPING_TABLES.protocolEntries, tenantId, {
    orderBy: "sort_order",
    ascending: true,
    eqFilters: protocolId ? { protocol_id: protocolId } : undefined,
  });
  if (!res.ok) return res.response;

  const entries = res.data as Record<string, unknown>[];
  const byEntry = await pointsByEntry(db, tenantId, entries.map((e) => String(e.id)));
  const withPoints = entries.map((e) => ({ ...e, point_ids: byEntry[String(e.id)] ?? [] }));
  return NextResponse.json({ ok: true, entries: withPoints });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "cupping");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, entry: null });

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const protocolId = typeof parsed.data.protocol_id === "string" ? parsed.data.protocol_id : "";
  const fields = pickWritable(parsed.data, PROTOCOL_ENTRY_WRITABLE);
  // Erken/ucuz doğrulamalar (RPC de aynı kuralları uygular — savunma derinliği).
  if (!String(fields.content ?? "").trim()) return cuppingError(400, "Bilgi içeriği gerekli.");
  const pointIds = parsePointIds(parsed.data.point_ids);
  if (pointIds.length > MAX_POINTS) return cuppingError(400, "Çok fazla bölge seçildi.");

  // TEK transaction: protokol/source/point sahiplik doğrulaması + entry + entry_points.
  // Herhangi bir hata TÜM işlemi geri alır (hiç entry oluşmaz); telafi mantığı YOK.
  const { data, error } = await db.rpc("cupping_protocol_entry_create_atomic", {
    p_tenant_id: tenantId,
    p_protocol_id: protocolId,
    p_fields: fields,
    p_point_ids: pointIds,
  });

  if (error) {
    // SQLSTATE → sabit güvenli mesaj (ham DB hatası SIZMAZ).
    const code = (error as { code?: string }).code ?? "";
    if (code === "45001") return cuppingError(400, "Protokol bu hesaba ait değil veya bulunamadı.");
    if (code === "45002") return cuppingError(400, "Bilgi içeriği gerekli.");
    if (code === "45003") return cuppingError(400, "Seçilen bölge bu hesaba ait değil.");
    if (code === "45004") return cuppingError(400, "Çok fazla bölge seçildi.");
    if (code === "45005") return cuppingError(400, "Seçilen kaynak bu hesaba ait değil.");
    return cuppingError(500, "İşlem tamamlanamadı. Lütfen tekrar deneyin.");
  }

  return NextResponse.json({ ok: true, entry: data });
}
