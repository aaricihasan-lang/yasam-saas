import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * /api/kisisel-arsiv/files — personal_archive_files güvenli YAZMA/LİSTE kapısı (K-3).
 *
 * Neden: dosya satırı insert/select/delete tarayıcıdan anon key ile yapılıyordu →
 * güvenlik tamamen RLS'e bağlıydı ve anon yazma cross-tenant riski taşıyordu.
 * Artık yazmalar service_role ile SUNUCUDA; kimlik requireModuleAccess ile doğrulanır,
 * tenant_id oturumdan alınır (body/query'den GÜVENİLMEZ), archive_id'nin bu tenant'a
 * ait olduğu doğrulanır (IDOR).
 *
 * Kapsam: yalnız personal_archive_files tablosu. Storage (personal-archive bucket)
 * yükleme/silme işlemleri bu route'un dışındadır (ayrı bucket politikası).
 */

const TABLE = "personal_archive_files";

async function archiveInTenant(
  db: SupabaseClient,
  archiveId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("personal_archives")
    .select("id")
    .eq("id", archiveId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && !!data;
}

// ─── GET ?archiveIds=a,b,c — bu arşivlerin dosya satırları (tenant-scoped) ──────
export async function GET(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "personal_archive");
  if (!guard.ok) return guard.response;
  const { db, tenantId } = guard;

  const raw = req.nextUrl.searchParams.get("archiveIds")?.trim() ?? "";
  const ids = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, rows: [] });

  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .in("archive_id", ids);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ─── POST { archiveId, files:[{file_name,file_path,file_type,file_size}] } ──────
export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "personal_archive");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true, rows: [] });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const archiveId = String(body.archiveId ?? "").trim();
  const files = Array.isArray(body.files) ? (body.files as Record<string, unknown>[]) : [];
  if (!archiveId) return NextResponse.json({ ok: false, error: "archiveId gerekli." }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ ok: true, rows: [] });

  if (!(await archiveInTenant(db, archiveId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Arşiv bu hesaba ait değil." }, { status: 403 });
  }

  const rows = files
    .map((f) => ({
      tenant_id: tenantId,
      archive_id: archiveId,
      file_name: String(f.file_name ?? ""),
      file_path: String(f.file_path ?? ""),
      file_type: f.file_type != null ? String(f.file_type) : null,
      file_size: f.file_size != null ? Number(f.file_size) : null,
    }))
    .filter((r) => r.file_path);
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "Geçerli dosya yok." }, { status: 400 });

  const { data, error } = await db.from(TABLE).insert(rows).select("*");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

// ─── DELETE ?archiveId=... — arşivin tüm dosya satırlarını sil (tenant-scoped) ──
export async function DELETE(req: NextRequest): Promise<Response> {
  const guard = await requireModuleAccess(req, "personal_archive");
  if (!guard.ok) return guard.response;
  const { db, tenantId, is_demo_account } = guard;
  if (is_demo_account) return NextResponse.json({ ok: true, demo: true });

  const archiveId = req.nextUrl.searchParams.get("archiveId")?.trim() ?? "";
  if (!archiveId) return NextResponse.json({ ok: false, error: "archiveId gerekli." }, { status: 400 });

  if (!(await archiveInTenant(db, archiveId, tenantId))) {
    return NextResponse.json({ ok: false, error: "Arşiv bu hesaba ait değil." }, { status: 403 });
  }

  const { error } = await db
    .from(TABLE)
    .delete()
    .eq("tenant_id", tenantId)
    .eq("archive_id", archiveId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
