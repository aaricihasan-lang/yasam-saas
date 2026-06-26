import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import {
  getBioResource,
  pickWritableBioFields,
  sanitizeBioSearch,
} from "@/lib/biyoenerji/resourceConfig";

export const runtime = "nodejs";

/**
 * /api/biyoenerji/[resource] — biyoenerji kayıtları liste/oluştur.
 *
 * Güvenlik (proje standardı):
 *   - verifyUserRequest → x-user-id + x-session-token + binding.
 *   - tenant_id SUNUCUDA session'dan alınır; body/query'den GÜVENİLMEZ.
 *   - resource whitelist + kolon whitelist (çapraz-tenant ve kolon enjeksiyonu engellenir).
 *   - Demo hesap: yazma yapılmaz.
 *
 * GET  ?count=1&search=        → { ok, count }
 * GET  ?lastCreated=1          → { ok, lastCreatedAt }
 * GET  ?offset=&limit=&search= → { ok, rows }
 * POST { ...fields }           → { ok, row }
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { resource } = await params;
  const cfg = getBioResource(resource);
  if (!cfg) return NextResponse.json({ ok: false, error: "Geçersiz kaynak." }, { status: 404 });

  const { db, tenantId } = guard;
  const url = new URL(req.url);
  const search = sanitizeBioSearch(url.searchParams.get("search"));
  const orFilter =
    search.length > 0
      ? cfg.search.map((c) => `${c}.ilike.%${search}%`).join(",")
      : null;

  // Son kayıt tarihi (Son kayıt istatistiği)
  if (url.searchParams.get("lastCreated") === "1") {
    const { data, error } = await db
      .from(cfg.table)
      .select("created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, lastCreatedAt: (data as { created_at?: string } | null)?.created_at ?? null });
  }

  // Sayım
  if (url.searchParams.get("count") === "1") {
    let q = db.from(cfg.table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
    if (orFilter) q = q.or(orFilter);
    const { count, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, count: count ?? 0 });
  }

  // Liste (sayfalı)
  const offsetRaw = Number(url.searchParams.get("offset"));
  const limitRaw = Number(url.searchParams.get("limit"));
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 500;

  let q = db
    .from(cfg.table)
    .select("*")
    .eq("tenant_id", tenantId)
    .order(cfg.orderCol, { ascending: cfg.orderAsc, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (orFilter) q = q.or(orFilter);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { resource } = await params;
  const cfg = getBioResource(resource);
  if (!cfg) return NextResponse.json({ ok: false, error: "Geçersiz kaynak." }, { status: 404 });

  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, row: null });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const fields = pickWritableBioFields(cfg, body);
  const { data, error } = await db
    .from(cfg.table)
    .insert({ ...fields, tenant_id: tenantId })
    .select()
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}
