import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { adminTenantMissingResponse, foreignTenantResponse, resolveAdminOwnTenant } from "@/lib/admin/adminOwnTenant";
import { validateMineralAssignments } from "@/lib/dogaltas/mineralPercent";
import { validateStoneImagesField, validateStoneStructuredFields } from "@/lib/dogaltas/validation";

export const runtime = "nodejs";

/**
 * POST /api/admin/toplu-veri/stones — Toplu Veri "Doğaltaş JSON" içe aktarımı (AA-2 / ADM-1).
 *
 * Eskiden tarayıcı publishable client ile public.stones'a doğrudan insert ediyordu (anon kilidi
 * sonrası kırık + istemci tenant'ı + görsel URL kapısı atlanıyordu). Artık yazma yalnız bu
 * service_role'lü admin route'unda ve /api/dogaltas/stones POST ile AYNI alan kurallarıyla.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token binding, role=admin & active.
 *   - Hedef tenant YALNIZ adminin kendi kütüphane tenant'ı (resolveAdminOwnTenant, sunucuda);
 *     satırdaki farklı tenant_id → 403.
 *   - Kolon allowlist (STONE_WRITABLE); structured alan tipleri + mineral oranı doğrulanır.
 *   - Remote URL görsel modeli KAPALI (SSRF kapanışı; /api/dogaltas/stones ile aynı): URL'li veya
 *     tenant'a ait olmayan görsel kaydı aktarılmaz, satır `image_upload_failed=true` işaretlenir.
 *   - Ham DB hatası dönmez.
 */

const MAX_ROWS = 100; // istemci batch boyutu 25
const MAX_TEXT = 20000;
const MAX_SHORT = 500;

const TEXT_FIELDS = [
  "short_description",
  "general_info",
  "source_note",
  "physical_effects",
  "spiritual_effects",
  "other_effects",
  "warning_text",
  "feng_shui",
  "meditation",
  "care",
  "application",
] as const;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function clip(v: unknown, max: number): string | null {
  if (v == null) return null;
  const t = String(v);
  if (!t.trim()) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function bad(error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

/** Yalnız tenant'a ait canonical file_path görselleri kalır; URL/yabancı yol düşer (işaretlenir). */
function sanitizeImages(value: unknown, tenantId: string): { images: unknown[]; dropped: boolean } {
  if (!Array.isArray(value)) return { images: [], dropped: value != null };
  const images: unknown[] = [];
  let dropped = false;
  for (const item of value) {
    if (validateStoneImagesField([item], tenantId).ok) images.push(item);
    else dropped = true;
  }
  return { images, dropped };
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const ownTenant = await resolveAdminOwnTenant(db, guard.adminId);
  if (!ownTenant) return adminTenantMissingResponse();

  let body: { rows?: unknown };
  try {
    body = (await req.json()) as { rows?: unknown };
  } catch {
    return bad("Geçersiz istek gövdesi.");
  }

  const rows = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]) : [];
  if (rows.length === 0) return bad("Aktarılacak kayıt yok.");
  if (rows.length > MAX_ROWS) return bad(`Tek istekte en fazla ${MAX_ROWS} kayıt gönderin.`);

  const now = new Date().toISOString();
  const clean: Record<string, unknown>[] = [];
  let imagesDropped = 0;
  for (const r of rows) {
    if (r === null || typeof r !== "object" || Array.isArray(r)) return bad("Geçersiz kayıt.");
    const rowTenant = String(r.tenant_id ?? "").trim();
    if (rowTenant && rowTenant !== ownTenant) return foreignTenantResponse();

    const stoneName = clip(r.stone_name, MAX_SHORT)?.trim() ?? "";
    if (!stoneName) return bad("Her kayıtta taş adı zorunludur.");

    const row: Record<string, unknown> = { tenant_id: ownTenant, stone_name: stoneName };
    for (const key of TEXT_FIELDS) row[key] = clip(r[key], MAX_TEXT);
    if (r.chakras !== undefined) row.chakras = r.chakras;
    if (r.warning_tags !== undefined) row.warning_tags = r.warning_tags;
    if (r.assignments !== undefined) row.assignments = r.assignments;

    // /api/dogaltas/stones POST ile aynı structured tip kapısı.
    const structured = validateStoneStructuredFields(row);
    if (!structured.ok) return bad(structured.error, 422);
    if (row.assignments !== undefined && row.assignments !== null) {
      const check = validateMineralAssignments(row.assignments);
      if (!check.ok) return bad(check.error ?? "Geçersiz mineral oranı.", 400);
      row.assignments = check.value;
    }

    const { images, dropped } = sanitizeImages(r.images, ownTenant);
    row.images = images;
    if (dropped || r.image_upload_failed === true) row.image_upload_failed = true;
    if (dropped) imagesDropped += 1;
    row.updated_at = now;
    clean.push(row);
  }

  const { data, error } = await db.from("stones").insert(clean).select("id");
  if (error) return bad("Kayıtlar eklenemedi.", 500);
  const inserted = Array.isArray(data) ? data.length : 0;

  return NextResponse.json({ ok: true, inserted, imagesDropped }, { headers: NO_STORE });
}
