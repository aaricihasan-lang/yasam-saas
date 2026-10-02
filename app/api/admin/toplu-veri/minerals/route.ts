import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { adminTenantMissingResponse, foreignTenantResponse, resolveAdminOwnTenant } from "@/lib/admin/adminOwnTenant";

export const runtime = "nodejs";

/**
 * POST /api/admin/toplu-veri/minerals — Toplu Veri "Mineral JSON" içe aktarımı (AA-2 / ADM-1).
 *
 * Eskiden tarayıcı publishable client ile public.minerals'a doğrudan insert ediyordu (anon
 * kilidi sonrası kırık + istemci tenant'ı). Artık yazma yalnız bu service_role'lü admin route'unda.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token binding, role=admin & active.
 *   - Hedef tenant YALNIZ adminin kendi kütüphane tenant'ı (resolveAdminOwnTenant, sunucuda);
 *     satırdaki farklı tenant_id → 403 (uzman çalışma alanına yazılamaz).
 *   - Kolon allowlist; id/created_at vb. istemciden kabul edilmez. Ham DB hatası dönmez.
 */

const MAX_ROWS = 500; // tek istek üst sınırı (istemci batch boyutu 250)
const MAX_TEXT = 8000;
const MAX_SHORT = 500;
const MAX_ARRAY = 200;

const ARRAY_FIELDS = [
  "organ_etkileri",
  "fiziksel",
  "zihinsel",
  "cakralar",
  "fizyoloji",
  "eksiklik_belirtileri",
  "fazlalik_belirtileri",
  "doz_asimi",
  "iceren_taslar",
] as const;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function clip(v: unknown, max: number): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => clip(item, MAX_SHORT))
    .filter((item): item is string => Boolean(item))
    .slice(0, MAX_ARRAY);
}

function bad(error: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
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

  const clean: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (r === null || typeof r !== "object" || Array.isArray(r)) return bad("Geçersiz kayıt.");
    const rowTenant = String(r.tenant_id ?? "").trim();
    if (rowTenant && rowTenant !== ownTenant) return foreignTenantResponse();
    const name = clip(r.name, MAX_SHORT);
    const sourceId = clip(r.source_id, MAX_SHORT);
    if (!name || !sourceId) return bad("Her kayıtta name ve source_id zorunludur.");
    const row: Record<string, unknown> = {
      tenant_id: ownTenant, // SUNUCUDAN — istemci tenant'ı yok sayılır
      source_id: sourceId,
      name,
      aciklama: clip(r.aciklama, MAX_TEXT),
      kategori: clip(r.kategori, MAX_SHORT) ?? "",
    };
    for (const key of ARRAY_FIELDS) row[key] = stringArray(r[key]);
    clean.push(row);
  }

  const { data, error } = await db.from("minerals").insert(clean).select("id");
  if (error) return bad("Kayıtlar eklenemedi.", 500);
  // inserted, istemcinin mevcut "beklenen adet" doğrulamasını besler.
  const inserted = Array.isArray(data) ? data.length : 0;
  return NextResponse.json({ ok: true, inserted }, { headers: NO_STORE });
}
