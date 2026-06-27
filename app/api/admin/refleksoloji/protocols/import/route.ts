import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";

/**
 * POST /api/admin/refleksoloji/protocols/import
 *
 * Admin toplu JSON import — public.reflexology_protocols'a batch insert.
 *
 * Güvenlik:
 *   - verifyAdminRequest → x-admin-id + x-session-token + DB doğrulaması (role=admin AND active=true).
 *   - Yazma service_role'lü guard.db ile (tarayıcı doğrudan insert ETMEZ).
 *   - Admin import hedef tenant'ı seçtiği için tenant_id satırlardan gelir; ANCAK
 *     yalnızca admin doğrulamasından sonra kabul edilir.
 *   - combinations/import ile aynı güvenli desen.
 */

type ImportRow = {
  tenant_id?: unknown;
  source_uid?: unknown;
  title?: unknown;
  target_problem?: unknown;
  organs?: unknown;
  application_notes?: unknown;
  raw_json?: unknown;
};

const MAX_ROWS = 500; // client batch boyutu ile uyumlu üst sınır
const MAX_TEXT = 8000;
const MAX_SHORT = 500;

function clip(v: unknown, max: number): string | null {
  if (v == null) return null;
  const t = String(v);
  return t.length > max ? t.slice(0, max) : t;
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const { db } = guard;

  let body: { rows?: unknown };
  try {
    body = (await req.json()) as { rows?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? (body.rows as ImportRow[]) : [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "rows boş." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { ok: false, error: `Tek istekte en fazla ${MAX_ROWS} satır gönderin.` },
      { status: 400 },
    );
  }

  const clean: Record<string, unknown>[] = [];
  for (const r of rows) {
    const tenant_id = String(r?.tenant_id ?? "").trim();
    const title = String(r?.title ?? "").trim();
    if (!tenant_id || !title) {
      return NextResponse.json(
        { ok: false, error: "Her satırda tenant_id ve title zorunludur." },
        { status: 400 },
      );
    }
    clean.push({
      tenant_id,
      source_uid: clip(r?.source_uid, MAX_SHORT),
      title: clip(title, MAX_SHORT),
      target_problem: clip(r?.target_problem, MAX_TEXT),
      organs: r?.organs ?? null,
      application_notes: clip(r?.application_notes, MAX_TEXT),
      raw_json: r?.raw_json ?? null,
    });
  }

  const { data, error } = await db
    .from("reflexology_protocols")
    .insert(clean)
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ids: data ?? [], inserted: (data ?? []).length });
}
